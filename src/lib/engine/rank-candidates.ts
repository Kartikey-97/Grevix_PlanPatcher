import type {
  RankingPolicy,
  ProfileWeights,
  PreferenceProfileKey,
} from "../schemas/ranking-policy.schema";
import { RankingPolicySchema } from "../schemas/ranking-policy.schema";
import type {
  CandidateMetrics,
  VerificationStatus,
} from "../schemas/recovery-result.schema";
import type {
  CandidateEvaluationResult,
  FeasibilityClassification,
} from "./evaluate-candidates";

/**
 * Canonical default ranking policy matching fixtures/planpatch/ranking-policy.json.
 */
export const DEFAULT_RANKING_POLICY: RankingPolicy = RankingPolicySchema.parse({
  schemaVersion: "1.0.0",
  direction: "lower_score_is_better",
  metrics: {
    changeFootprint: {
      formula: "E = min(changedTaskCount / originalTaskCount, 1)",
    },
    lostTaskValue: {
      formula:
        "L = min(sum(priority_i for removed_or_materially_degraded_tasks) / sum(original_task_priorities), 1)",
    },
    budgetUsage: {
      formula: "C = projectedTotalCost / activeBudgetLimit",
    },
    scheduleMovement: {
      formula: "M = min(weightedMeanAbsoluteStartShiftHours / 8, 1)",
    },
    deadlinePressure: {
      formula:
        "Q = 0 if no deadline exists or slackHours >= 24; otherwise Q = 1 - max(slackHours, 0) / 24",
    },
    scheduleDisruption: {
      formula: "S = 0.7 * M + 0.3 * Q",
    },
    uncertainty: {
      formula: "R = unknownDecisionCriticalFactCount / 5",
    },
  },
  profiles: {
    preserve_plan: {
      label: "Preserve the Plan",
      weights: {
        changeFootprint: 0.3,
        lostTaskValue: 0.25,
        budgetUsage: 0.2,
        scheduleDisruption: 0.15,
        uncertainty: 0.1,
      },
    },
    minimize_spending: {
      label: "Minimize Spending",
      weights: {
        changeFootprint: 0.1,
        lostTaskValue: 0.1,
        budgetUsage: 0.7,
        scheduleDisruption: 0.05,
        uncertainty: 0.05,
      },
    },
    protect_deadline: {
      label: "Protect the Deadline",
      weights: {
        changeFootprint: 0.15,
        lostTaskValue: 0.15,
        budgetUsage: 0.1,
        scheduleDisruption: 0.5,
        uncertainty: 0.1,
      },
    },
  },
  compositeFormula: "J(P) = wE*E(P) + wL*L(P) + wC*C(P) + wS*S(P) + wR*R(P)",
  decisionOrder: [
    "Reject candidates violating a hard constraint.",
    "Classify remaining candidates as verified-in-fixture or provisional based on unknown facts.",
    "Rank candidates within the same verification tier using the selected preference profile and the composite score J(P). Lower is better.",
    "If scores tie, prefer fewer changed tasks, then lower uncertainty, then stable candidate ID order.",
    "Never allow a score to override a fixed task, hard requirement, or unconfirmed real-world fact.",
  ],
});

/**
 * A ranked candidate entry conforming to recovery result contracts with rich evaluation metadata.
 */
export interface RankedCandidateEntry {
  rank: number;
  candidateId: string;
  label: string;
  score: number;
  classification: FeasibilityClassification;
  verificationStatus: VerificationStatus;
  changedTaskCount: number;
  unknownFactCount: number;
  metrics: CandidateMetrics;
  explanation: string;
  feasible: boolean;
  isFeasible: boolean;
}

export interface CandidateRankingOptions {
  /**
   * Custom ranking policy. Defaults to DEFAULT_RANKING_POLICY.
   */
  policy?: RankingPolicy;

  /**
   * Whether to strictly separate verification tiers (ranking fully verified candidates
   * ahead of provisional candidates before comparing scores).
   * Defaults to false, which ranks all feasible candidates by composite score with tie-breakers,
   * matching canonical fixture specification verify_fixtures.py.
   */
  separateVerificationTiers?: boolean;
}

export interface CandidateRankingInput {
  candidates: CandidateEvaluationResult[];
  policy?: RankingPolicy;
  selectedProfile?: PreferenceProfileKey | string;
  separateVerificationTiers?: boolean;
}

export interface CandidateRankingResult {
  success: boolean;
  policy: RankingPolicy;
  rankings: Record<string, RankedCandidateEntry[]>;
  scores: Record<string, Record<string, number>>; // candidateId -> profileId -> score
  winners: Record<string, RankedCandidateEntry | undefined>; // profileId -> top candidate
  feasibleCandidateCount: number;
  infeasibleCandidateCount: number;
  infeasibleCandidates: CandidateEvaluationResult[];
}

/**
 * Computes the composite score J(P) for a candidate given profile weights.
 * Formula: J(P) = wE*E + wL*L + wC*C + wS*S + wR*R
 */
export function scoreCandidate(
  candidate: CandidateEvaluationResult,
  weights: ProfileWeights
): number {
  const e = candidate.metrics.changeFootprint_E;
  const l = candidate.metrics.lostTaskValue_L;
  const c = candidate.metrics.budgetUsage_C ?? 0;
  const s = candidate.metrics.scheduleDisruption_S;
  const r = candidate.metrics.uncertainty_R;

  const rawScore =
    weights.changeFootprint * e +
    weights.lostTaskValue * l +
    weights.budgetUsage * c +
    weights.scheduleDisruption * s +
    weights.uncertainty * r;

  return Number(rawScore.toFixed(8));
}

/**
 * Scores a candidate evaluation across all profiles declared in a ranking policy.
 */
export function scoreCandidateAllProfiles(
  candidate: CandidateEvaluationResult,
  policy: RankingPolicy = DEFAULT_RANKING_POLICY
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [profileKey, profile] of Object.entries(policy.profiles)) {
    result[profileKey] = scoreCandidate(candidate, profile.weights);
  }
  return result;
}

/**
 * Deterministic tie-breaking comparator for candidates:
 * 1. Score (lower is better by default)
 * 2. Fewer changed tasks
 * 3. Lower uncertainty (fewer unknown facts)
 * 4. Stable candidateId alphabetical order
 */
function compareCandidates(
  a: CandidateEvaluationResult,
  b: CandidateEvaluationResult,
  scoreA: number,
  scoreB: number,
  separateTiers: boolean,
  direction: "lower_score_is_better" | "higher_score_is_better" = "lower_score_is_better"
): number {
  // Optional tier separation (verified ahead of provisional)
  if (separateTiers) {
    const tierA = a.classification === "feasible" ? 0 : 1;
    const tierB = b.classification === "feasible" ? 0 : 1;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
  }

  // 1. Score comparison with floating-point epsilon (1e-8)
  const scoreDiff =
    direction === "lower_score_is_better" ? scoreA - scoreB : scoreB - scoreA;
  if (Math.abs(scoreDiff) > 1e-8) {
    return scoreDiff < 0 ? -1 : 1;
  }

  // 2. Fewer changed tasks
  const changedA = a.changedTaskIds.length;
  const changedB = b.changedTaskIds.length;
  if (changedA !== changedB) {
    return changedA - changedB;
  }

  // 3. Lower uncertainty (fewer unknown facts)
  const unknownA = a.unknownFacts.length;
  const unknownB = b.unknownFacts.length;
  if (unknownA !== unknownB) {
    return unknownA - unknownB;
  }

  // 4. Stable candidate ID alphabetical order
  return a.candidateId.localeCompare(b.candidateId);
}

/**
 * Ranks candidate evaluations for a specific preference profile.
 * Feasible candidates are placed at the top (ranks 1..k), followed by
 * any infeasible candidates (ranks k+1..n) with feasible: false.
 */
export function rankCandidatesForProfile(
  candidates: CandidateEvaluationResult[],
  profileKey: PreferenceProfileKey | string,
  policy: RankingPolicy = DEFAULT_RANKING_POLICY,
  options?: CandidateRankingOptions
): RankedCandidateEntry[] {
  const profile = policy.profiles[profileKey];
  if (!profile) {
    throw new Error(
      `Unknown preference profile "${profileKey}". Available profiles: [${Object.keys(
        policy.profiles
      ).join(", ")}]`
    );
  }

  // Separate feasible and infeasible candidates
  const feasibleCandidates: CandidateEvaluationResult[] = [];
  const infeasibleCandidates: CandidateEvaluationResult[] = [];

  for (const c of candidates) {
    if (c.validation.hardConstraintsPass && c.classification !== "infeasible") {
      feasibleCandidates.push(c);
    } else {
      infeasibleCandidates.push(c);
    }
  }

  // Compute scores and pair with candidates
  const scoredFeasible = feasibleCandidates.map((c) => ({
    candidate: c,
    score: scoreCandidate(c, profile.weights),
  }));

  // Sort feasible deterministically
  const separateTiers = options?.separateVerificationTiers ?? false;
  scoredFeasible.sort((pairA, pairB) =>
    compareCandidates(
      pairA.candidate,
      pairB.candidate,
      pairA.score,
      pairB.score,
      separateTiers,
      policy.direction
    )
  );

  // Scored infeasible
  const scoredInfeasible = infeasibleCandidates.map((c) => ({
    candidate: c,
    score: scoreCandidate(c, profile.weights),
  }));

  scoredInfeasible.sort((pairA, pairB) =>
    compareCandidates(
      pairA.candidate,
      pairB.candidate,
      pairA.score,
      pairB.score,
      false,
      policy.direction
    )
  );

  const results: RankedCandidateEntry[] = [];

  // Feasible entries (ranks 1..k)
  for (let i = 0; i < scoredFeasible.length; i++) {
    const pair = scoredFeasible[i];
    results.push({
      rank: i + 1,
      candidateId: pair.candidate.candidateId,
      label: pair.candidate.label,
      score: pair.score,
      classification: pair.candidate.classification,
      verificationStatus: pair.candidate.verificationStatus,
      changedTaskCount: pair.candidate.changedTaskIds.length,
      unknownFactCount: pair.candidate.unknownFacts.length,
      metrics: pair.candidate.metrics,
      explanation: pair.candidate.explanation,
      feasible: true,
      isFeasible: true,
    });
  }

  // Infeasible entries (ranks k+1..n)
  const offset = scoredFeasible.length;
  for (let i = 0; i < scoredInfeasible.length; i++) {
    const pair = scoredInfeasible[i];
    results.push({
      rank: offset + i + 1,
      candidateId: pair.candidate.candidateId,
      label: pair.candidate.label,
      score: pair.score,
      classification: pair.candidate.classification,
      verificationStatus: pair.candidate.verificationStatus,
      changedTaskCount: pair.candidate.changedTaskIds.length,
      unknownFactCount: pair.candidate.unknownFacts.length,
      metrics: pair.candidate.metrics,
      explanation: pair.candidate.explanation,
      feasible: false,
      isFeasible: false,
    });
  }

  return results;
}

/**
 * Selects the top winning candidate for a specific preference profile.
 * Supports passing either an already ranked RankedCandidateEntry[] or raw CandidateEvaluationResult[].
 * Returns undefined if no candidates are feasible or if input is empty.
 */
export function selectWinningCandidate(
  candidatesOrRanked: (CandidateEvaluationResult | RankedCandidateEntry)[],
  profileKey?: PreferenceProfileKey | string,
  policy: RankingPolicy = DEFAULT_RANKING_POLICY,
  options?: CandidateRankingOptions
): RankedCandidateEntry | undefined {
  if (candidatesOrRanked.length === 0) {
    return undefined;
  }

  const first = candidatesOrRanked[0];
  if ("rank" in first && "score" in first && "candidateId" in first) {
    const rankedList = candidatesOrRanked as RankedCandidateEntry[];
    return rankedList.find((r) => r.feasible ?? r.isFeasible) ?? undefined;
  }

  if (!profileKey) {
    throw new Error(
      `profileKey is required when calling selectWinningCandidate with raw candidate evaluations.`
    );
  }

  const rawList = candidatesOrRanked as CandidateEvaluationResult[];
  const ranked = rankCandidatesForProfile(rawList, profileKey, policy, options);
  return ranked.find((r) => r.feasible ?? r.isFeasible) ?? undefined;
}

/**
 * Evaluates, scores, and ranks candidate recovery options across all profiles in a policy.
 * Input evaluations and candidate plans remain strictly immutable.
 * Supports both object input { candidates, policy, ... } and direct arguments (candidates, policy, options).
 */
export function rankCandidates(
  candidatesOrInput: CandidateEvaluationResult[] | CandidateRankingInput,
  maybePolicy?: RankingPolicy,
  maybeOptions?: CandidateRankingOptions
): CandidateRankingResult {
  const input: CandidateRankingInput = Array.isArray(candidatesOrInput)
    ? {
        candidates: candidatesOrInput,
        policy: maybePolicy,
        separateVerificationTiers: maybeOptions?.separateVerificationTiers,
      }
    : candidatesOrInput;

  const policy = input.policy ?? DEFAULT_RANKING_POLICY;
  const separateTiers = input.separateVerificationTiers ?? false;

  const feasibleCandidates: CandidateEvaluationResult[] = [];
  const infeasibleCandidates: CandidateEvaluationResult[] = [];

  for (const c of input.candidates) {
    if (c.validation.hardConstraintsPass && c.classification !== "infeasible") {
      feasibleCandidates.push(c);
    } else {
      infeasibleCandidates.push(c);
    }
  }

  // Pre-calculate all profile scores for all candidates
  const candidateScores: Record<string, Record<string, number>> = {};
  for (const c of input.candidates) {
    candidateScores[c.candidateId] = scoreCandidateAllProfiles(c, policy);
  }

  // Build rankings per profile
  const rankings: Record<string, RankedCandidateEntry[]> = {};
  const winners: Record<string, RankedCandidateEntry | undefined> = {};

  for (const profileKey of Object.keys(policy.profiles)) {
    const rankedList = rankCandidatesForProfile(
      input.candidates,
      profileKey,
      policy,
      { separateVerificationTiers: separateTiers }
    );
    rankings[profileKey] = rankedList;
    winners[profileKey] = selectWinningCandidate(rankedList);
  }

  return {
    success: true,
    policy,
    rankings,
    scores: candidateScores,
    winners,
    feasibleCandidateCount: feasibleCandidates.length,
    infeasibleCandidateCount: infeasibleCandidates.length,
    infeasibleCandidates,
  };
}

