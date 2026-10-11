import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  PlanSchema,
  type Plan,
} from "../../../src/lib/schemas/plan.schema";
import {
  ScenariosDocSchema,
  type ScenariosDoc,
} from "../../../src/lib/schemas/scenario.schema";
import {
  RankingPolicySchema,
  type RankingPolicy,
} from "../../../src/lib/schemas/ranking-policy.schema";
import {
  ExpectedResultsDocSchema,
  type ExpectedResultsDoc,
} from "../../../src/lib/schemas/recovery-result.schema";
import { type CandidatePatch } from "../../../src/lib/schemas/patch.schema";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { generateCandidates } from "../../../src/lib/engine/generate-candidates";
import {
  evaluateCandidate,
  evaluateCandidates,
  type CandidateEvaluationResult,
} from "../../../src/lib/engine/evaluate-candidates";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";
import {
  rankCandidates,
  rankCandidatesForProfile,
  selectWinningCandidate,
  DEFAULT_RANKING_POLICY,
  type RankedCandidateEntry,
} from "../../../src/lib/engine/rank-candidates";
import { computeParetoFrontier } from "../../../src/lib/engine/pareto-frontier";

const FIXTURES_DIR = path.resolve(__dirname, "../../../fixtures/planpatch");

function loadFixtures() {
  const plan = PlanSchema.parse(
    JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, "plan.json"), "utf-8"))
  );
  const scenariosDoc = ScenariosDocSchema.parse(
    JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "scenarios.json"), "utf-8")
    )
  );
  const rankingPolicy = RankingPolicySchema.parse(
    JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "ranking-policy.json"), "utf-8")
    )
  );
  const expectedResultsDoc = ExpectedResultsDocSchema.parse(
    JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "expected-results.json"), "utf-8")
    )
  );
  const graph = rebuildGraph(plan);

  return { plan, scenariosDoc, rankingPolicy, expectedResultsDoc, graph };
}

describe("End-to-End Recovery Pipeline (S5C.3)", () => {
  beforeEach(() => {
    registerEventPlanningValidator();
  });

  describe("Full Production Pipeline Integration (Generation -> Evaluation -> Ranking -> Winner Selection)", () => {
    it("traces all stages through production functions matching all 9 canonical expected winners", () => {
      // Stage 1: Load canonical baseline plan and disruption scenarios
      const { plan, scenariosDoc, rankingPolicy, expectedResultsDoc, graph } =
        loadFixtures();

      const profiles = ["preserve_plan", "minimize_spending", "protect_deadline"] as const;

      for (const scenario of scenariosDoc.scenarios) {
        // Stage 2: Generate candidates using production generateCandidates
        const genBatch = generateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          disruption: scenario.disruption,
          canonicalPatches: scenario.candidatePatches,
          constraintOverrides: scenario.constraintOverrides,
        });

        expect(genBatch.success).toBe(true);
        expect(genBatch.blockingIssues).toHaveLength(0);
        expect(genBatch.candidates.length).toBeGreaterThanOrEqual(
          scenario.candidatePatches.length
        );

        // Stage 3: Evaluate each generated candidate using production evaluateCandidates
        const evalBatch = evaluateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          candidates: genBatch.candidates,
          constraintOverrides: scenario.constraintOverrides,
        });

        expect(evalBatch.success).toBe(true);
        expect(evalBatch.evaluations.length).toBe(genBatch.candidates.length);

        // Stage 4: Rank evaluations across all profiles using production rankCandidates
        const rankingBatch = rankCandidates(evalBatch.evaluations, rankingPolicy);
        expect(rankingBatch.success).toBe(true);

        // Stage 5 & 6: Select winner for each profile and compare with expected-results.json
        const expectedWinnersForScenario =
          expectedResultsDoc.expectedWinners[scenario.id];
        expect(expectedWinnersForScenario).toBeDefined();

        for (const profileId of profiles) {
          const expectedWinnerId = expectedWinnersForScenario[profileId];

          // Winner from batch result
          const actualWinnerFromBatch = rankingBatch.winners[profileId];
          expect(actualWinnerFromBatch).toBeDefined();
          expect(actualWinnerFromBatch?.candidateId).toBe(expectedWinnerId);
          expect(actualWinnerFromBatch?.feasible).toBe(true);

          // Winner from standalone selectWinningCandidate API
          const actualWinnerFromSelect = selectWinningCandidate(
            rankingBatch.rankings[profileId]
          );
          expect(actualWinnerFromSelect).toBeDefined();
          expect(actualWinnerFromSelect?.candidateId).toBe(expectedWinnerId);
          expect(actualWinnerFromSelect?.feasible).toBe(true);
        }
      }
    });

    it("matches canonical composite scores to within 1e-6 for all evaluated candidates across all profiles", () => {
      const { plan, scenariosDoc, rankingPolicy, expectedResultsDoc, graph } =
        loadFixtures();

      const profiles = ["preserve_plan", "minimize_spending", "protect_deadline"] as const;

      for (const scenario of scenariosDoc.scenarios) {
        const expectedScenario = expectedResultsDoc.scenarios.find(
          (s) => s.scenarioId === scenario.id
        )!;
        expect(expectedScenario).toBeDefined();

        // Pass through production candidate generator
        const genBatch = generateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          disruption: scenario.disruption,
          canonicalPatches: scenario.candidatePatches,
          constraintOverrides: scenario.constraintOverrides,
        });

        // Pass through production evaluator
        const evalBatch = evaluateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          candidates: genBatch.candidates,
          constraintOverrides: scenario.constraintOverrides,
        });

        // Pass through production ranker
        const rankingBatch = rankCandidates(evalBatch.evaluations, rankingPolicy);

        // Verify scores against expected-results.json
        for (const expectedCand of expectedScenario.candidates) {
          for (const profileId of profiles) {
            const expectedScore = expectedCand.scores[profileId];
            const scoredCand = rankingBatch.rankings[profileId].find(
              (r) => r.candidateId === expectedCand.candidateId
            );

            expect(scoredCand).toBeDefined();
            expect(scoredCand!.score).toBeCloseTo(expectedScore, 6);
          }
        }
      }
    });

    it("reproduces exact canonical candidate rankings per scenario and preference profile", () => {
      const { plan, scenariosDoc, rankingPolicy, expectedResultsDoc, graph } =
        loadFixtures();

      const profiles = ["preserve_plan", "minimize_spending", "protect_deadline"] as const;

      for (const scenario of scenariosDoc.scenarios) {
        const expectedScenario = expectedResultsDoc.scenarios.find(
          (s) => s.scenarioId === scenario.id
        )!;

        const genBatch = generateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          disruption: scenario.disruption,
          canonicalPatches: scenario.candidatePatches,
          constraintOverrides: scenario.constraintOverrides,
        });

        const evalBatch = evaluateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          candidates: genBatch.candidates,
          constraintOverrides: scenario.constraintOverrides,
        });

        const rankingBatch = rankCandidates(evalBatch.evaluations, rankingPolicy);

        for (const profileId of profiles) {
          const expectedRankList = expectedScenario.rankings[profileId];
          const actualRankList = rankingBatch.rankings[profileId];

          expect(actualRankList).toHaveLength(expectedRankList.length);

          for (let i = 0; i < expectedRankList.length; i++) {
            expect(actualRankList[i].rank).toBe(expectedRankList[i].rank);
            expect(actualRankList[i].candidateId).toBe(
              expectedRankList[i].candidateId
            );
            expect(actualRankList[i].score).toBeCloseTo(
              expectedRankList[i].score,
              6
            );
          }
        }
      }
    });
  });

  describe("Pareto Frontier Across All Canonical Scenarios", () => {
    it("computes Pareto trade-off frontier for Scenario 1 (S1-A vs S1-B)", () => {
      const { plan, scenariosDoc, graph } = loadFixtures();
      const s1 = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

      const genBatch = generateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        constraintOverrides: s1.constraintOverrides,
      });

      const evalBatch = evaluateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        candidates: genBatch.candidates,
        constraintOverrides: s1.constraintOverrides,
      });

      const paretoResult = computeParetoFrontier(evalBatch.evaluations);

      // Neither candidate dominates the other:
      // S1-A has lower change footprint (0.1875 vs 0.375) and schedule disruption (0.175 vs 0.70)
      // S1-B has lower budget usage (0.68 vs 0.80)
      // Both should be on the Pareto frontier!
      expect(paretoResult.frontier).toHaveLength(2);
      const frontierIds = paretoResult.frontier.map((f) => f.candidateId).sort();
      expect(frontierIds).toEqual(["S1-A-community-hall", "S1-B-campus-auditorium"]);
      expect(paretoResult.dominated).toHaveLength(0);
      expect(paretoResult.infeasible).toHaveLength(0);
    });

    it("computes Pareto frontier for Scenario 2 and Scenario 3", () => {
      const { plan, scenariosDoc, graph } = loadFixtures();

      for (const scenarioId of ["S2-budget-cut", "S3-deadline-moved-earlier"]) {
        const scenario = scenariosDoc.scenarios.find((s) => s.id === scenarioId)!;
        const genBatch = generateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          disruption: scenario.disruption,
          canonicalPatches: scenario.candidatePatches,
          constraintOverrides: scenario.constraintOverrides,
        });

        const evalBatch = evaluateCandidates({
          baselinePlan: plan,
          baselineGraph: graph,
          candidates: genBatch.candidates,
          constraintOverrides: scenario.constraintOverrides,
        });

        const paretoResult = computeParetoFrontier(evalBatch.evaluations);
        expect(paretoResult.frontier.length).toBeGreaterThanOrEqual(1);
        expect(paretoResult.infeasible).toHaveLength(0);
      }
    });
  });

  describe("Winner Selection Safety & Infeasible Rejection (Acceptance Check)", () => {
    it("infeasible candidate with superior raw score is never selected when a feasible candidate exists", () => {
      const { plan, scenariosDoc, rankingPolicy, graph } = loadFixtures();
      const s1 = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

      const genBatch = generateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        constraintOverrides: s1.constraintOverrides,
      });

      const evalBatch = evaluateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        candidates: genBatch.candidates,
        constraintOverrides: s1.constraintOverrides,
      });

      // Construct an infeasible candidate that has an artificially unbeatable raw score (0.001)
      const infeasibleCandidate: CandidateEvaluationResult = {
        ...evalBatch.evaluations[0],
        candidateId: "S1-SUPER-CHEAP-BUT-BROKEN",
        label: "Broken Mega Cut",
        classification: "infeasible",
        validation: {
          ...evalBatch.evaluations[0].validation,
          budgetPass: false,
          hardConstraintsPass: false,
          failedReasons: ["Budget exceeded by ₹50,000"],
        },
        metrics: {
          changeFootprint_E: 0.001,
          lostTaskValue_L: 0.0,
          budgetUsage_C: 0.001,
          movement_M: 0.0,
          deadlinePressure_Q: 0.0,
          scheduleDisruption_S: 0.001,
          uncertainty_R: 0.0,
        },
      };

      const mixedEvaluations = [...evalBatch.evaluations, infeasibleCandidate];

      // Rank across profiles
      const rankingBatch = rankCandidates(mixedEvaluations, rankingPolicy);

      for (const profileId of ["preserve_plan", "minimize_spending", "protect_deadline"] as const) {
        const winner = rankingBatch.winners[profileId];

        // Winner MUST be defined, MUST be feasible, and MUST NEVER be the broken candidate
        expect(winner).toBeDefined();
        expect(winner?.candidateId).not.toBe("S1-SUPER-CHEAP-BUT-BROKEN");
        expect(winner?.feasible).toBe(true);
        expect(winner?.isFeasible).toBe(true);

        // Also test selectWinningCandidate API directly on the ranked list
        const directWinner = selectWinningCandidate(rankingBatch.rankings[profileId]);
        expect(directWinner).toBeDefined();
        expect(directWinner?.candidateId).not.toBe("S1-SUPER-CHEAP-BUT-BROKEN");
        expect(directWinner?.feasible).toBe(true);
      }
    });

    it("returns undefined winner when all candidates are infeasible", () => {
      const { plan, scenariosDoc, rankingPolicy, graph } = loadFixtures();
      const s1 = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

      const genBatch = generateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        constraintOverrides: s1.constraintOverrides,
      });

      const evalBatch = evaluateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        candidates: genBatch.candidates,
        constraintOverrides: s1.constraintOverrides,
      });

      // Mark ALL candidates as infeasible
      const allInfeasible: CandidateEvaluationResult[] = evalBatch.evaluations.map(
        (e) => ({
          ...e,
          classification: "infeasible" as const,
          validation: {
            ...e.validation,
            hardConstraintsPass: false,
            budgetPass: false,
            failedReasons: ["Hard constraint failure"],
          },
        })
      );

      // Test selectWinningCandidate on raw evaluations
      const rawWinner = selectWinningCandidate(
        allInfeasible,
        "preserve_plan",
        rankingPolicy
      );
      expect(rawWinner).toBeUndefined();

      // Test rankCandidates batch
      const batchResult = rankCandidates(allInfeasible, rankingPolicy);
      for (const profileId of ["preserve_plan", "minimize_spending", "protect_deadline"] as const) {
        expect(batchResult.winners[profileId]).toBeUndefined();
      }

      // Test selectWinningCandidate on ranked entries
      const rankedWinner = selectWinningCandidate(batchResult.rankings.preserve_plan);
      expect(rankedWinner).toBeUndefined();
    });

    it("selectWinningCandidate does not rely solely on ranking order: actively checks feasibility", () => {
      // Simulate an incorrectly ordered or manipulated list where an infeasible candidate is placed at index 0
      const fakeRankedList: RankedCandidateEntry[] = [
        {
          rank: 1,
          candidateId: "FAKE-TOP-INFEASIBLE",
          label: "Infeasible at Rank 1",
          score: 0.05,
          classification: "infeasible",
          verificationStatus: "provisional",
          changedTaskCount: 1,
          unknownFactCount: 0,
          metrics: {
            changeFootprint_E: 0.05,
            lostTaskValue_L: 0,
            budgetUsage_C: 0.05,
            movement_M: 0,
            deadlinePressure_Q: 0,
            scheduleDisruption_S: 0,
            uncertainty_R: 0,
          },
          explanation: "Infeasible test entry",
          feasible: false,
          isFeasible: false,
        },
        {
          rank: 2,
          candidateId: "LEGITIMATE-FEASIBLE",
          label: "Feasible Candidate",
          score: 0.25,
          classification: "provisionally_feasible",
          verificationStatus: "provisional",
          changedTaskCount: 3,
          unknownFactCount: 1,
          metrics: {
            changeFootprint_E: 0.25,
            lostTaskValue_L: 0,
            budgetUsage_C: 0.5,
            movement_M: 0,
            deadlinePressure_Q: 0,
            scheduleDisruption_S: 0.1,
            uncertainty_R: 0.2,
          },
          explanation: "Feasible test entry",
          feasible: true,
          isFeasible: true,
        },
      ];

      // Even though FAKE-TOP-INFEASIBLE is at index 0, selectWinningCandidate MUST skip it and select the feasible one
      const winner = selectWinningCandidate(fakeRankedList);
      expect(winner).toBeDefined();
      expect(winner?.candidateId).toBe("LEGITIMATE-FEASIBLE");
      expect(winner?.feasible).toBe(true);
    });

    it("provisional candidates retain provisional status throughout generation, evaluation, and ranking", () => {
      const { plan, scenariosDoc, rankingPolicy, graph } = loadFixtures();
      const s1 = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

      // 1. Generation
      const genBatch = generateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        constraintOverrides: s1.constraintOverrides,
      });

      const communityHallPatch = genBatch.candidates.find(
        (c) => c.id === "S1-A-community-hall"
      )!;
      expect(communityHallPatch.unknownFacts).toContain("venue_availability");

      // 2. Evaluation
      const evalBatch = evaluateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        candidates: genBatch.candidates,
        constraintOverrides: s1.constraintOverrides,
      });

      const communityHallEval = evalBatch.evaluations.find(
        (e) => e.candidateId === "S1-A-community-hall"
      )!;
      // Must be provisionally feasible, never promoted to fully verified
      expect(communityHallEval.classification).toBe("provisionally_feasible");
      expect(communityHallEval.verificationStatus).toBe("provisional");
      expect(communityHallEval.unknownFacts).toContain("venue_availability");

      // 3. Ranking & Winner Selection
      const rankingBatch = rankCandidates(evalBatch.evaluations, rankingPolicy);
      const winner = rankingBatch.winners.preserve_plan;

      expect(winner).toBeDefined();
      expect(winner?.candidateId).toBe("S1-A-community-hall");
      expect(winner?.verificationStatus).toBe("provisional");
      expect(winner?.classification).toBe("provisionally_feasible");
      // Never promoted to verified
      expect(winner?.verificationStatus).not.toBe("verified_in_fixture");
      expect(winner?.verificationStatus).not.toBe("real_world_verified");
    });
  });

  describe("Negative Verification & Sensitivity Tests", () => {
    it("fails or changes winner if ranking direction is inverted to higher_score_is_better", () => {
      const { plan, scenariosDoc, rankingPolicy, graph } = loadFixtures();
      const s1 = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

      const genBatch = generateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        constraintOverrides: s1.constraintOverrides,
      });

      const evalBatch = evaluateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        candidates: genBatch.candidates,
        constraintOverrides: s1.constraintOverrides,
      });

      // Normal preserve_plan winner is S1-A-community-hall (score: 0.2625 vs S1-B: 0.39740625)
      const normalWinner = selectWinningCandidate(
        rankCandidatesForProfile(evalBatch.evaluations, "preserve_plan", rankingPolicy)
      );
      expect(normalWinner?.candidateId).toBe("S1-A-community-hall");

      // Inverted direction policy
      const invertedPolicy: RankingPolicy = {
        ...rankingPolicy,
        direction: "higher_score_is_better" as any,
      };

      const invertedRanked = rankCandidatesForProfile(
        evalBatch.evaluations,
        "preserve_plan",
        invertedPolicy
      );
      const invertedWinner = selectWinningCandidate(invertedRanked);

      // With higher_score_is_better, S1-B (score 0.3974) would win over S1-A (score 0.2625)
      expect(invertedWinner?.candidateId).toBe("S1-B-campus-auditorium");
      expect(invertedWinner?.candidateId).not.toBe(normalWinner?.candidateId);
    });

    it("alters winner if preference profile weights are modified", () => {
      const { plan, scenariosDoc, rankingPolicy, graph } = loadFixtures();
      const s1 = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

      const genBatch = generateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        constraintOverrides: s1.constraintOverrides,
      });

      const evalBatch = evaluateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        candidates: genBatch.candidates,
        constraintOverrides: s1.constraintOverrides,
      });

      // Under preserve_plan, S1-A wins
      // Now modify preserve_plan to put 100% weight on budgetUsage (where S1-B is better)
      const alteredPolicy: RankingPolicy = {
        ...rankingPolicy,
        profiles: {
          ...rankingPolicy.profiles,
          preserve_plan: {
            ...rankingPolicy.profiles.preserve_plan,
            weights: {
              changeFootprint: 0.0,
              lostTaskValue: 0.0,
              budgetUsage: 1.0,
              scheduleDisruption: 0.0,
              uncertainty: 0.0,
            },
          },
        },
      };

      const alteredRanked = rankCandidatesForProfile(
        evalBatch.evaluations,
        "preserve_plan",
        alteredPolicy
      );
      const alteredWinner = selectWinningCandidate(alteredRanked);

      // S1-B has budgetUsage 0.68 vs S1-A's 0.80, so S1-B wins with budget-only weights
      expect(alteredWinner?.candidateId).toBe("S1-B-campus-auditorium");
    });
  });
});
