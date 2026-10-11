import { describe, it, expect } from "vitest";
import {
  scoreCandidate,
  scoreCandidateAllProfiles,
  rankCandidatesForProfile,
  selectWinningCandidate,
  rankCandidates,
  DEFAULT_RANKING_POLICY,
  type RankedCandidateEntry,
} from "../../../src/lib/engine/rank-candidates";
import type { CandidateEvaluationResult } from "../../../src/lib/engine/evaluate-candidates";
import type { RankingPolicy } from "../../../src/lib/schemas/ranking-policy.schema";

function makeMockEvaluation(
  id: string,
  overrides: {
    feasible?: boolean;
    changeFootprint_E?: number;
    lostTaskValue_L?: number;
    budgetUsage_C?: number;
    scheduleDisruption_S?: number;
    uncertainty_R?: number;
    changedTaskIds?: string[];
    unknownFacts?: string[];
    verificationStatus?: "verified_in_fixture" | "provisional" | "real_world_verified";
  } = {}
): CandidateEvaluationResult {
  const feasible = overrides.feasible ?? true;
  return {
    candidateId: id,
    label: `Candidate ${id}`,
    classification: feasible ? (overrides.verificationStatus === "provisional" ? "provisionally_feasible" : "feasible") : "infeasible",
    validation: {
      budgetPass: feasible,
      deadlinePass: feasible,
      capacityPass: feasible,
      accessibilityPass: feasible,
      fixedTasksPreserved: feasible,
      acyclic: feasible,
      hardConstraintsPass: feasible,
      failedReasons: feasible ? [] : ["Hard constraint failed"],
    },
    metrics: {
      changeFootprint_E: overrides.changeFootprint_E ?? 0.2,
      lostTaskValue_L: overrides.lostTaskValue_L ?? 0.0,
      budgetUsage_C: overrides.budgetUsage_C ?? 0.5,
      movement_M: 0.1,
      deadlinePressure_Q: 0.0,
      scheduleDisruption_S: overrides.scheduleDisruption_S ?? 0.2,
      uncertainty_R: overrides.uncertainty_R ?? 0.1,
    },
    changedTaskIds: overrides.changedTaskIds ?? ["T1"],
    removedTaskIds: [],
    lostTaskIds: [],
    projectedTotalCost: 1000,
    budgetLimit: 2000,
    budgetMargin: 1000,
    taskCount: 10,
    earliestProjectFinishHours: 50,
    deadlineHours: 100,
    deadlineSlackHours: 50,
    movedTaskStartTimes: [],
    weightedMeanAbsoluteStartShiftHours: 0,
    unknownFacts: overrides.unknownFacts ?? [],
    verificationStatus: overrides.verificationStatus ?? "verified_in_fixture",
  } as unknown as CandidateEvaluationResult;
}


describe("Candidate Ranking Engine (S5C.3)", () => {
  describe("Composite Scoring Formula J(P)", () => {
    it("computes exact score according to profile weights", () => {
      const candidate = makeMockEvaluation("C1", {
        changeFootprint_E: 0.1875,
        lostTaskValue_L: 0.0,
        budgetUsage_C: 0.8,
        scheduleDisruption_S: 0.175,
        uncertainty_R: 0.2,
      });

      // preserve_plan weights: E: 0.30, L: 0.25, C: 0.20, S: 0.15, R: 0.10
      // 0.30*0.1875 + 0.25*0 + 0.20*0.8 + 0.15*0.175 + 0.10*0.2 = 0.2625
      const profile = DEFAULT_RANKING_POLICY.profiles.preserve_plan;
      const score = scoreCandidate(candidate, profile.weights);
      const expected =
        0.30 * 0.1875 + 0.25 * 0.0 + 0.20 * 0.8 + 0.15 * 0.175 + 0.10 * 0.2;
      expect(score).toBeCloseTo(expected, 6);
      expect(score).toBe(0.2625);
    });

    it("computes scores for all profiles at once", () => {
      const candidate = makeMockEvaluation("C1", {
        changeFootprint_E: 0.2,
        lostTaskValue_L: 0.1,
        budgetUsage_C: 0.4,
        scheduleDisruption_S: 0.3,
        uncertainty_R: 0.0,
      });

      const scores = scoreCandidateAllProfiles(candidate, DEFAULT_RANKING_POLICY);
      expect(scores).toHaveProperty("preserve_plan");
      expect(scores).toHaveProperty("minimize_spending");
      expect(scores).toHaveProperty("protect_deadline");

      expect(typeof scores.preserve_plan).toBe("number");
      expect(typeof scores.minimize_spending).toBe("number");
      expect(typeof scores.protect_deadline).toBe("number");
    });
  });

  describe("Profile Weight Sensitivity", () => {
    it("demonstrates a candidate winning under one profile but losing under another", () => {
      // Candidate A: Low change footprint and disruption, higher cost
      const candidateA = makeMockEvaluation("A", {
        changeFootprint_E: 0.1,
        lostTaskValue_L: 0.0,
        budgetUsage_C: 0.9,
        scheduleDisruption_S: 0.1,
        uncertainty_R: 0.0,
      });

      // Candidate B: High change footprint and disruption, much lower cost
      const candidateB = makeMockEvaluation("B", {
        changeFootprint_E: 0.8,
        lostTaskValue_L: 0.0,
        budgetUsage_C: 0.1,
        scheduleDisruption_S: 0.7,
        uncertainty_R: 0.0,
      });

      const evalList = [candidateA, candidateB];

      const rankedPreserve = rankCandidatesForProfile(
        evalList,
        "preserve_plan",
        DEFAULT_RANKING_POLICY
      );
      // Under preserve_plan, candidate A should win
      expect(rankedPreserve[0].candidateId).toBe("A");
      expect(rankedPreserve[1].candidateId).toBe("B");

      const rankedSpending = rankCandidatesForProfile(
        evalList,
        "minimize_spending",
        DEFAULT_RANKING_POLICY
      );
      // Under minimize_spending (budgetUsage weight 0.50), candidate B should win
      expect(rankedSpending[0].candidateId).toBe("B");
      expect(rankedSpending[1].candidateId).toBe("A");
    });
  });

  describe("Infeasible Candidate Handling", () => {
    it("places infeasible candidates at the bottom regardless of raw scores", () => {
      // Candidate I has an artificially amazing score (all 0s), but is infeasible
      const candidateInfeasible = makeMockEvaluation("Infeasible", {
        feasible: false,
        changeFootprint_E: 0.0,
        lostTaskValue_L: 0.0,
        budgetUsage_C: 0.0,
        scheduleDisruption_S: 0.0,
        uncertainty_R: 0.0,
      });

      // Candidate F has higher objective values, but is feasible
      const candidateFeasible = makeMockEvaluation("Feasible", {
        feasible: true,
        changeFootprint_E: 0.5,
        lostTaskValue_L: 0.5,
        budgetUsage_C: 0.5,
        scheduleDisruption_S: 0.5,
        uncertainty_R: 0.5,
      });

      const ranked = rankCandidatesForProfile(
        [candidateInfeasible, candidateFeasible],
        "preserve_plan",
        DEFAULT_RANKING_POLICY
      );

      expect(ranked[0].candidateId).toBe("Feasible");
      expect(ranked[0].feasible).toBe(true);
      expect(ranked[0].rank).toBe(1);

      expect(ranked[1].candidateId).toBe("Infeasible");
      expect(ranked[1].feasible).toBe(false);
      expect(ranked[1].rank).toBe(2);

      const winner = selectWinningCandidate(ranked);
      expect(winner?.candidateId).toBe("Feasible");
    });

    it("returns null or undefined winner if all candidates are infeasible", () => {
      const candidate1 = makeMockEvaluation("I1", { feasible: false });
      const candidate2 = makeMockEvaluation("I2", { feasible: false });

      const ranked = rankCandidatesForProfile(
        [candidate1, candidate2],
        "preserve_plan",
        DEFAULT_RANKING_POLICY
      );

      const winner = selectWinningCandidate(ranked);
      expect(winner).toBeUndefined();
    });
  });

  describe("Deterministic Tie-Breaking", () => {
    it("breaks score ties by fewer changedTaskIds", () => {
      // Both have identical metric values, but C1 changed 2 tasks, C2 changed 4 tasks
      const c1 = makeMockEvaluation("C1", {
        changeFootprint_E: 0.2,
        changedTaskIds: ["T1", "T2"],
      });
      const c2 = makeMockEvaluation("C2", {
        changeFootprint_E: 0.2,
        changedTaskIds: ["T1", "T2", "T3", "T4"],
      });

      const ranked = rankCandidatesForProfile([c2, c1], "preserve_plan", DEFAULT_RANKING_POLICY);
      expect(ranked[0].candidateId).toBe("C1");
      expect(ranked[1].candidateId).toBe("C2");
    });

    it("breaks score and changedTaskIds ties by fewer unknownFacts", () => {
      const c1 = makeMockEvaluation("C1", {
        changeFootprint_E: 0.2,
        changedTaskIds: ["T1"],
        unknownFacts: ["fact_a"],
      });
      const c2 = makeMockEvaluation("C2", {
        changeFootprint_E: 0.2,
        changedTaskIds: ["T1"],
        unknownFacts: ["fact_a", "fact_b"],
      });

      const ranked = rankCandidatesForProfile([c2, c1], "preserve_plan", DEFAULT_RANKING_POLICY);
      expect(ranked[0].candidateId).toBe("C1");
      expect(ranked[1].candidateId).toBe("C2");
    });

    it("breaks score, changedTaskIds, and unknownFacts ties by stable candidateId order", () => {
      const cBeta = makeMockEvaluation("Beta", {
        changeFootprint_E: 0.2,
        changedTaskIds: ["T1"],
        unknownFacts: [],
      });
      const cAlpha = makeMockEvaluation("Alpha", {
        changeFootprint_E: 0.2,
        changedTaskIds: ["T1"],
        unknownFacts: [],
      });

      const ranked = rankCandidatesForProfile(
        [cBeta, cAlpha],
        "preserve_plan",
        DEFAULT_RANKING_POLICY
      );
      expect(ranked[0].candidateId).toBe("Alpha");
      expect(ranked[1].candidateId).toBe("Beta");
    });
  });

  describe("Edge Cases and Immutability", () => {
    it("handles empty candidate evaluation list gracefully", () => {
      const ranked = rankCandidatesForProfile([], "preserve_plan", DEFAULT_RANKING_POLICY);
      expect(ranked).toEqual([]);
      expect(selectWinningCandidate(ranked)).toBeUndefined();

      const batch = rankCandidates([], DEFAULT_RANKING_POLICY);
      expect(batch.rankings.preserve_plan).toEqual([]);
      expect(batch.winners.preserve_plan).toBeUndefined();
    });

    it("handles single candidate evaluation list", () => {
      const c1 = makeMockEvaluation("Single");
      const ranked = rankCandidatesForProfile([c1], "preserve_plan", DEFAULT_RANKING_POLICY);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].candidateId).toBe("Single");
      expect(selectWinningCandidate(ranked)?.candidateId).toBe("Single");
    });

    it("does not mutate the original candidate evaluation array or objects", () => {
      const c1 = makeMockEvaluation("C1");
      const c2 = makeMockEvaluation("C2");
      const list = [c1, c2];
      const originalC1 = JSON.parse(JSON.stringify(c1));
      const originalC2 = JSON.parse(JSON.stringify(c2));

      rankCandidates(list, DEFAULT_RANKING_POLICY);

      expect(c1).toEqual(originalC1);
      expect(c2).toEqual(originalC2);
      expect(list[0]).toBe(c1);
      expect(list[1]).toBe(c2);
    });

    it("operates on generic, domain-independent evaluations without campus assumptions", () => {
      const genericA = makeMockEvaluation("procurement-alt-1", {
        changeFootprint_E: 0.3,
        budgetUsage_C: 0.6,
      });
      const genericB = makeMockEvaluation("procurement-alt-2", {
        changeFootprint_E: 0.1,
        budgetUsage_C: 0.8,
      });

      const batch = rankCandidates([genericA, genericB], DEFAULT_RANKING_POLICY);
      expect(batch.rankings.preserve_plan[0].candidateId).toBe("procurement-alt-2");
      expect(batch.rankings.minimize_spending[0].candidateId).toBe("procurement-alt-1");
    });
  });
});
