import { PlanSchema, type Plan, type GlobalConstraints } from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import { DisruptionSchema, type Disruption } from "../schemas/scenario.schema";
import type { CandidatePatch, TaskOverride } from "../schemas/patch.schema";
import type {
  SyncState,
  PublicationStatus,
  ConflictRecord,
} from "../schemas/sync.schema";
import {
  RankingPolicySchema,
  type RankingPolicy,
  type PreferenceProfileKey,
} from "../schemas/ranking-policy.schema";
import { guardRecovery } from "./guard-recovery";
import { validateExplainableGraph } from "../graph/validate-explainable";
import {
  generateCandidates,
  type TaskAlternativeDefinition,
  type CandidateGenerationResult,
} from "./generate-candidates";
import {
  evaluateCandidates,
  type CandidateEvaluationResult,
  type BaselineEvaluationSummary,
  type EvaluateCandidatesResult,
} from "./evaluate-candidates";
import { getDomainValidators } from "./validate-constraints";
import {
  rankCandidates,
  selectWinningCandidate,
  DEFAULT_RANKING_POLICY,
  type RankedCandidateEntry,
  type CandidateRankingResult,
} from "./rank-candidates";
import {
  computeParetoFrontier,
  type ParetoFrontierResult,
  type ParetoCandidateRecord,
} from "./pareto-frontier";

export interface RunRecoveryInput {
  baselinePlan: Plan;
  baselineGraph: ExplainableDependencyGraph;
  disruption: Disruption;
  canonicalPatches?: CandidatePatch[];
  constraintOverrides?: Partial<GlobalConstraints>;
  alternativesCatalog?: Record<string, TaskAlternativeDefinition | TaskOverride>;
  selectedProfile?: PreferenceProfileKey | string;
  rankingPolicy?: RankingPolicy;
  separateVerificationTiers?: boolean;
  maxCandidates?: number;
  maxEditsPerPatch?: number;
  syncState?: SyncState;
  publicationStatus?: PublicationStatus;
  activeConflicts?: ConflictRecord[];
  isOffline?: boolean;
  tolerance?: number;
}

export interface RunRecoveryResult {
  success: boolean;
  error?: string;
  blockingIssues: string[];
  warnings: string[];
  clarificationRequired: boolean;
  clarificationReasons: string[];

  // Disruption and effective constraints applied
  disruption: Disruption;
  effectiveConstraintOverrides: Partial<GlobalConstraints>;

  // Baseline evaluation under the effective constraints
  baselineEvaluation?: BaselineEvaluationSummary;

  // Candidate generation summary
  generatedCandidateCount: number;
  candidates: CandidatePatch[];

  // Candidate evaluations
  evaluations: CandidateEvaluationResult[];
  feasibleCount: number;
  provisionallyFeasibleCount: number;
  infeasibleCount: number;

  // Ranking across all profiles and the selected profile
  rankingPolicy: RankingPolicy;
  rankings: Record<string, RankedCandidateEntry[]>;
  rankedCandidates: RankedCandidateEntry[]; // Rankings for selectedProfile
  scores: Record<string, Record<string, number>>; // candidateId -> profileId -> score

  // Pareto Frontier Analysis
  paretoResult: ParetoFrontierResult;
  paretoFrontier: ParetoCandidateRecord[];

  // Winner selection
  selectedProfile: string;
  winner?: RankedCandidateEntry;
  winners: Record<string, RankedCandidateEntry | undefined>;
  hasFeasibleWinner: boolean;
  noWinnerReason?: string;

  // Immutability confirmation
  baselinePreserved: boolean;
}

/**
 * Resolves effective global constraint overrides by extracting changed budgets
 * and deadlines from the disruption definition, merged with any explicit overrides.
 */
export function resolveEffectiveConstraintOverrides(
  disruption: Disruption,
  explicitOverrides?: Partial<GlobalConstraints>
): Partial<GlobalConstraints> {
  const overrides: Partial<GlobalConstraints> = {
    ...(explicitOverrides ?? {}),
  };

  // 1. Budget reduction / changes
  if (
    (disruption.type === "budget_reduction" ||
      disruption.type === "budget_changed" ||
      disruption.field === "budgetLimit") &&
    typeof disruption.newValue === "number" &&
    !isNaN(disruption.newValue)
  ) {
    overrides.budgetLimit = disruption.newValue;
  }

  // 2. Deadline shift / changes
  if (
    (disruption.type === "deadline_moved" ||
      disruption.type === "deadline_changed" ||
      disruption.type === "deadline_earlier" ||
      disruption.field === "deadlineHours") &&
    typeof disruption.newValue === "number" &&
    !isNaN(disruption.newValue)
  ) {
    overrides.deadlineHours = disruption.newValue;
  }

  return overrides;
}

/**
 * Deterministic recovery orchestrator for PlanPatch.
 * Connects disruption input, candidate generation, candidate evaluation,
 * constraint validation, Pareto analysis, and profile ranking.
 *
 * Guarantees:
 * 1. Determinism: Identical inputs produce identical candidate sets, metrics, and winners.
 * 2. Immutability: The baseline plan and baseline graph are never modified.
 * 3. Separation: Never automatically commits patches or promotes provisional feasibility.
 * 4. Domain Independence: Works with arbitrary plans, task IDs, and constraint configurations.
 */
export function runRecovery(input: RunRecoveryInput): RunRecoveryResult {
  const baselineSnapshot = JSON.stringify(input.baselinePlan);
  const selectedProfile = input.selectedProfile ?? "preserve_plan";
  const policy = input.rankingPolicy ?? DEFAULT_RANKING_POLICY;
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const clarificationReasons: string[] = [];

  // Empty fallback result builder for early exit
  const makeFailureResult = (params: {
    error: string;
    blockingIssues: string[];
    warnings?: string[];
    clarificationRequired?: boolean;
    clarificationReasons?: string[];
    effectiveConstraintOverrides?: Partial<GlobalConstraints>;
  }): RunRecoveryResult => ({
    success: false,
    error: params.error,
    blockingIssues: params.blockingIssues,
    warnings: params.warnings ?? warnings,
    clarificationRequired: params.clarificationRequired ?? false,
    clarificationReasons: params.clarificationReasons ?? [],
    disruption: input.disruption,
    effectiveConstraintOverrides: params.effectiveConstraintOverrides ?? {},
    generatedCandidateCount: 0,
    candidates: [],
    evaluations: [],
    feasibleCount: 0,
    provisionallyFeasibleCount: 0,
    infeasibleCount: 0,
    rankingPolicy: policy,
    rankings: {},
    rankedCandidates: [],
    scores: {},
    paretoResult: {
      frontier: [],
      dominated: [],
      infeasible: [],
      allFeasible: [],
      objectivesUsed: [],
    },
    paretoFrontier: [],
    selectedProfile,
    winner: undefined,
    winners: {},
    hasFeasibleWinner: false,
    noWinnerReason: params.error,
    baselinePreserved: true,
  });

  try {
    // 1. Validate inputs and schema contracts
    const parsedPlan = PlanSchema.safeParse(input.baselinePlan);
    if (!parsedPlan.success) {
      return makeFailureResult({
        error: `Invalid baseline plan: ${parsedPlan.error.issues.map((i) => i.message).join("; ")}`,
        blockingIssues: ["Baseline plan schema validation failed"],
      });
    }

    const parsedDisruption = DisruptionSchema.safeParse(input.disruption);
    if (!parsedDisruption.success) {
      return makeFailureResult({
        error: `Invalid disruption definition: ${parsedDisruption.error.issues
          .map((i) => i.message)
          .join("; ")}`,
        blockingIssues: ["Disruption schema validation failed"],
        clarificationRequired: true,
        clarificationReasons: ["Disruption data structure does not match schema"],
      });
    }

    // 2. Validate disruption target task existence if targetTaskId is provided
    if (input.disruption.targetTaskId) {
      const targetExists = input.baselinePlan.tasks.some(
        (t) => t.id === input.disruption.targetTaskId
      );
      if (!targetExists) {
        const issue = `Disrupted target task "${input.disruption.targetTaskId}" does not exist in baseline plan.`;
        return makeFailureResult({
          error: issue,
          blockingIssues: [issue],
          clarificationRequired: true,
          clarificationReasons: [
            `Task "${input.disruption.targetTaskId}" was not found in the plan. Available tasks are: ${input.baselinePlan.tasks
              .map((t) => t.id)
              .join(", ")}.`,
          ],
        });
      }
    }

    // 3. Precondition guard checks (sync state, publication status, active conflicts, offline mode)
    const guard = guardRecovery({
      plan: input.baselinePlan,
      graph: input.baselineGraph,
      syncState: input.syncState,
      publicationStatus: input.publicationStatus,
      activeConflicts: input.activeConflicts,
      isOffline: input.isOffline,
    });

    if (!guard.canCalculate) {
      return makeFailureResult({
        error: `Recovery guard rejected orchestration: ${guard.blockingIssues.join("; ")}`,
        blockingIssues: guard.blockingIssues,
        warnings: guard.warnings,
      });
    }
    warnings.push(...guard.warnings);

    // 4. Validate graph structural validity (cycles, missing tasks, dangling dependencies)
    const graphValidation = validateExplainableGraph({
      tasks: input.baselinePlan.tasks,
      dependencies: input.baselineGraph.edges,
    });
    if (!graphValidation.isValid || graphValidation.hasCycles) {
      const cycleIssue = graphValidation.hasCycles
        ? "Baseline graph contains one or more dependency cycles."
        : `Baseline graph has structural errors: ${graphValidation.issues
            .filter((i) => i.severity === "error")
            .map((i) => i.message)
            .join("; ")}`;
      return makeFailureResult({
        error: cycleIssue,
        blockingIssues: [cycleIssue],
      });
    }

    // 5. Disruption-to-Constraint Propagation: resolve effective constraints
    const effectiveConstraintOverrides = resolveEffectiveConstraintOverrides(
      input.disruption,
      input.constraintOverrides
    );

    // Check if domain has registered validators
    const domainName = input.baselinePlan.domain || "event-planning";
    const registeredDomainValidators = getDomainValidators(domainName);
    if (registeredDomainValidators.length === 0) {
      warnings.push(
        `Domain "${domainName}" has no registered domain-specific constraint validators. Feasible candidates will require manual domain verification.`
      );
    }

    // 6. Candidate Generation
    const genResult: CandidateGenerationResult = generateCandidates({
      baselinePlan: input.baselinePlan,
      baselineGraph: input.baselineGraph,
      disruption: input.disruption,
      canonicalPatches: input.canonicalPatches,
      constraintOverrides: effectiveConstraintOverrides,
      alternativesCatalog: input.alternativesCatalog,
      maxCandidates: input.maxCandidates,
      maxEditsPerPatch: input.maxEditsPerPatch,
      syncState: input.syncState,
      publicationStatus: input.publicationStatus,
      activeConflicts: input.activeConflicts,
      isOffline: input.isOffline,
    });

    if (!genResult.success || (genResult.unsupportedReason && genResult.candidates.length === 0)) {
      return makeFailureResult({
        error:
          genResult.error ||
          genResult.unsupportedReason ||
          "Candidate generation failed.",
        blockingIssues: genResult.blockingIssues,
        warnings: [...warnings, ...genResult.warnings],
        clarificationRequired: true,
        clarificationReasons: genResult.unsupportedReason
          ? [genResult.unsupportedReason]
          : ["No candidate generation strategies applicable for disruption."],
        effectiveConstraintOverrides,
      });
    }
    warnings.push(...genResult.warnings);

    // 7. Candidate Evaluation
    const evalResult: EvaluateCandidatesResult = evaluateCandidates({
      baselinePlan: input.baselinePlan,
      baselineGraph: input.baselineGraph,
      candidates: genResult.candidates,
      constraintOverrides: effectiveConstraintOverrides,
      syncState: input.syncState,
      publicationStatus: input.publicationStatus,
      activeConflicts: input.activeConflicts,
      isOffline: input.isOffline,
      tolerance: input.tolerance,
    });

    if (!evalResult.success) {
      return makeFailureResult({
        error: evalResult.error || "Candidate evaluation failed.",
        blockingIssues: evalResult.blockingIssues,
        warnings: [...warnings, ...evalResult.warnings],
        effectiveConstraintOverrides,
      });
    }
    warnings.push(...evalResult.warnings);

    // 8. Multi-Profile Candidate Ranking
    const rankingResult: CandidateRankingResult = rankCandidates(
      evalResult.evaluations,
      policy,
      {
        separateVerificationTiers: input.separateVerificationTiers,
      }
    );

    // 9. Pareto Frontier Analysis
    const paretoResult: ParetoFrontierResult = computeParetoFrontier(
      evalResult.evaluations,
      {
        tolerance: input.tolerance,
      }
    );

    // 10. Winner Selection for Selected Profile
    const profileRankings = rankingResult.rankings[selectedProfile] ?? [];
    const winner = rankingResult.winners[selectedProfile];
    const hasFeasibleWinner = Boolean(winner && winner.isFeasible);

    let noWinnerReason: string | undefined;
    if (!hasFeasibleWinner) {
      if (evalResult.evaluations.length === 0) {
        noWinnerReason = "No recovery candidates were generated for this disruption.";
        clarificationReasons.push(
          "No recovery candidates or task alternatives exist for this scenario."
        );
      } else if (rankingResult.feasibleCandidateCount === 0) {
        noWinnerReason = `All ${evalResult.evaluations.length} recovery candidates violate one or more hard constraints under effective constraints.`;
      } else {
        noWinnerReason = `No feasible recovery candidate was eligible under preference profile "${selectedProfile}".`;
      }
    }

    // Check if winner or frontier requires verification of unknown facts
    if (winner && winner.unknownFactCount > 0) {
      warnings.push(
        `Selected winner "${winner.candidateId}" is provisionally feasible: requires verification of ${winner.unknownFactCount} unknown fact(s).`
      );
    }

    return {
      success: true,
      blockingIssues: [],
      warnings: Array.from(new Set(warnings)),
      clarificationRequired: clarificationReasons.length > 0,
      clarificationReasons,
      disruption: input.disruption,
      effectiveConstraintOverrides,
      baselineEvaluation: evalResult.baselineEvaluation,
      generatedCandidateCount: genResult.candidates.length,
      candidates: genResult.candidates,
      evaluations: evalResult.evaluations,
      feasibleCount: evalResult.feasibleCount,
      provisionallyFeasibleCount: evalResult.provisionallyFeasibleCount,
      infeasibleCount: evalResult.infeasibleCount,
      rankingPolicy: policy,
      rankings: rankingResult.rankings,
      rankedCandidates: profileRankings,
      scores: rankingResult.scores,
      paretoResult,
      paretoFrontier: paretoResult.frontier,
      selectedProfile,
      winner,
      winners: rankingResult.winners,
      hasFeasibleWinner,
      noWinnerReason,
      baselinePreserved: true,
    };
  } finally {
    // Strict baseline plan immutability guarantee
    if (JSON.stringify(input.baselinePlan) !== baselineSnapshot) {
      throw new Error(
        "Invariant violation: baseline plan was mutated during deterministic recovery orchestration."
      );
    }
  }
}
