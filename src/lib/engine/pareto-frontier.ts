import type {
  CandidateEvaluationResult,
  FeasibilityClassification,
} from "./evaluate-candidates";
import type { VerificationStatus } from "../schemas/recovery-result.schema";

export const DEFAULT_PARETO_TOLERANCE = 1e-8;

/**
 * Objective definition for Pareto dominance checking.
 */
export interface ParetoObjective {
  name: string;
  key?: string;
  description?: string;
  getValue: (c: CandidateEvaluationResult) => number;
  direction: "lower_is_better" | "higher_is_better";
}

/**
 * The 5 canonical normalized objectives defined in fixtures/planpatch/ranking-policy.json.
 * All normalized metrics are designed with direction: "lower_score_is_better".
 */
export const CANONICAL_PARETO_OBJECTIVES: ParetoObjective[] = [
  {
    name: "changeFootprint_E",
    key: "changeFootprint_E",
    description: "Number of task records added, modified, or removed relative to baseline",
    getValue: (c) => c.metrics.changeFootprint_E,
    direction: "lower_is_better",
  },
  {
    name: "lostTaskValue_L",
    key: "lostTaskValue_L",
    description: "Priority sum of removed or degraded tasks relative to baseline",
    getValue: (c) => c.metrics.lostTaskValue_L,
    direction: "lower_is_better",
  },
  {
    name: "budgetUsage_C",
    key: "budgetUsage_C",
    description: "Projected total cost relative to budget limit",
    getValue: (c) => c.metrics.budgetUsage_C ?? 0,
    direction: "lower_is_better",
  },
  {
    name: "scheduleDisruption_S",
    key: "scheduleDisruption_S",
    description: "Combined schedule start-time churn and deadline pressure",
    getValue: (c) => c.metrics.scheduleDisruption_S,
    direction: "lower_is_better",
  },
  {
    name: "uncertainty_R",
    key: "uncertainty_R",
    description: "Number of unknown decision-critical facts",
    getValue: (c) => c.metrics.uncertainty_R,
    direction: "lower_is_better",
  },
];


/**
 * Rich Pareto record representing a candidate's dominance standing.
 */
export interface ParetoCandidateRecord {
  candidateId: string;
  label: string;
  isFrontier: boolean;
  classification: FeasibilityClassification;
  verificationStatus: VerificationStatus;
  objectiveValues: Record<string, number>;
  dominatedBy: string[];
  dominates: string[];
  dominanceExplanations: string[];
  explanation?: string;
  candidate: CandidateEvaluationResult;
}

export interface ParetoFrontierOptions {
  /**
   * Objectives to use for dominance evaluation.
   * Defaults to CANONICAL_PARETO_OBJECTIVES (the 5 composite metrics E, L, C, S, R).
   */
  objectives?: ParetoObjective[];

  /**
   * Numerical comparison tolerance. Defaults to 1e-8.
   */
  tolerance?: number;
}

export interface ParetoFrontierResult {
  /**
   * Non-dominated feasible candidates forming the Pareto recovery frontier.
   */
  frontier: ParetoCandidateRecord[];

  /**
   * Feasible candidates that are strictly dominated by at least one other candidate.
   */
  dominated: ParetoCandidateRecord[];

  /**
   * Candidates excluded from the frontier because they violate hard constraints.
   */
  infeasible: CandidateEvaluationResult[];

  /**
   * All feasible candidate records evaluated.
   */
  allFeasible: ParetoCandidateRecord[];

  /**
   * List of objective names evaluated.
   */
  objectivesUsed: string[];
}

/**
 * Checks whether candidate A dominates candidate B.
 * A dominates B (A ≻ B) if:
 * 1. A is at least as good as B on every objective (within numerical tolerance).
 * 2. A is strictly better than B on at least one objective (beyond numerical tolerance).
 */
export function checkParetoDominance(
  candidateOrRecordA:
    | CandidateEvaluationResult
    | { objectiveValues: Record<string, number> },
  candidateOrRecordB:
    | CandidateEvaluationResult
    | { objectiveValues: Record<string, number> },
  objectives: ParetoObjective[] = CANONICAL_PARETO_OBJECTIVES,
  tolerance: number = DEFAULT_PARETO_TOLERANCE
): {
  dominates: boolean;
  strictlyBetterObjectives: string[];
  strictlyBetterOn: string[];
  explanation?: string;
} {
  const getObjVal = (
    c:
      | CandidateEvaluationResult
      | { objectiveValues: Record<string, number> },
    obj: ParetoObjective
  ): number => {
    if ("objectiveValues" in c && c.objectiveValues[obj.name] !== undefined) {
      return c.objectiveValues[obj.name];
    }
    return obj.getValue(c as CandidateEvaluationResult);
  };

  let atLeastAsGoodOnAll = true;
  const strictlyBetterObjectives: string[] = [];

  for (const obj of objectives) {
    const valA = getObjVal(candidateOrRecordA, obj);
    const valB = getObjVal(candidateOrRecordB, obj);

    if (obj.direction === "lower_is_better") {
      // For lower is better: valA <= valB + tol means A is at least as good as B
      if (valA > valB + tolerance) {
        atLeastAsGoodOnAll = false;
        break;
      }
      // Strictly better: valA < valB - tol
      if (valA < valB - tolerance) {
        strictlyBetterObjectives.push(obj.name);
      }
    } else {
      // For higher is better: valA >= valB - tol means A is at least as good as B
      if (valA < valB - tolerance) {
        atLeastAsGoodOnAll = false;
        break;
      }
      // Strictly better: valA > valB + tol
      if (valA > valB + tolerance) {
        strictlyBetterObjectives.push(obj.name);
      }
    }
  }

  const dominates = atLeastAsGoodOnAll && strictlyBetterObjectives.length > 0;

  let explanation: string | undefined;
  if (dominates) {
    explanation = `At least as good across all objectives and strictly better on: [${strictlyBetterObjectives.join(
      ", "
    )}].`;
  }

  return {
    dominates,
    strictlyBetterObjectives,
    strictlyBetterOn: strictlyBetterObjectives,
    explanation,
  };
}


/**
 * Computes the Pareto efficient frontier across candidate recovery patches.
 *
 * Guarantees:
 * 1. Domain-independent: Operates on arbitrary objective definitions without hard-coding task IDs or event assumptions.
 * 2. Infeasible candidates are completely excluded from the valid recovery frontier.
 * 3. Does not promote provisional candidates to verified feasibility.
 * 4. Deterministic: Equal metric vectors and empty/single candidate inputs are handled predictably.
 * 5. Input immutability: Does not mutate any input candidate evaluations.
 */
export function computeParetoFrontier(
  candidates: CandidateEvaluationResult[],
  options?: ParetoFrontierOptions
): ParetoFrontierResult {
  const objectives = options?.objectives ?? CANONICAL_PARETO_OBJECTIVES;
  const tolerance = options?.tolerance ?? DEFAULT_PARETO_TOLERANCE;
  const objectivesUsed = objectives.map((o) => o.name);

  // 1. Separate feasible from infeasible candidates
  const feasibleCandidates: CandidateEvaluationResult[] = [];
  const infeasibleCandidates: CandidateEvaluationResult[] = [];

  for (const c of candidates) {
    if (c.validation.hardConstraintsPass && c.classification !== "infeasible") {
      feasibleCandidates.push(c);
    } else {
      infeasibleCandidates.push(c);
    }
  }

  // 2. Build initial Pareto records for all feasible candidates
  const feasibleRecords: ParetoCandidateRecord[] = feasibleCandidates.map((c) => {
    const objectiveValues: Record<string, number> = {};
    for (const obj of objectives) {
      objectiveValues[obj.name] = obj.getValue(c);
    }
    return {
      candidateId: c.candidateId,
      label: c.label,
      isFrontier: true,
      classification: c.classification,
      verificationStatus: c.verificationStatus,
      objectiveValues,
      dominatedBy: [],
      dominates: [],
      dominanceExplanations: [],
      candidate: c,
    };
  });

  // 3. Pairwise dominance comparison across all feasible candidates
  const n = feasibleRecords.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;

      const candA = feasibleRecords[i];
      const candB = feasibleRecords[j];

      const dominance = checkParetoDominance(candA, candB, objectives, tolerance);
      if (dominance.dominates) {
        candA.dominates.push(candB.candidateId);
        candB.dominatedBy.push(candA.candidateId);
        const expl = `Dominated by "${candA.candidateId}": strictly better on [${dominance.strictlyBetterObjectives.join(
          ", "
        )}] and equal or better on all other objectives.`;
        candB.dominanceExplanations.push(expl);
        candB.explanation = candB.dominanceExplanations.join("; ");
        candB.isFrontier = false;
      }
    }
  }

  // 4. Partition into frontier and dominated sets
  const frontier: ParetoCandidateRecord[] = [];
  const dominated: ParetoCandidateRecord[] = [];

  for (const rec of feasibleRecords) {
    if (rec.isFrontier) {
      frontier.push(rec);
    } else {
      dominated.push(rec);
    }
  }

  // Deterministic sorting (alphabetical by candidate ID for stability)
  frontier.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  dominated.sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  return {
    frontier,
    dominated,
    infeasible: infeasibleCandidates,
    allFeasible: feasibleRecords,
    objectivesUsed,
  };
}
