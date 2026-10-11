import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PlanSchema, type Plan } from "../../../src/lib/schemas/plan.schema";
import {
  ScenariosDocSchema,
  type ScenariosDoc,
  type Disruption,
} from "../../../src/lib/schemas/scenario.schema";
import {
  RankingPolicySchema,
  type RankingPolicy,
} from "../../../src/lib/schemas/ranking-policy.schema";
import {
  ExpectedResultsDocSchema,
  type ExpectedResultsDoc,
} from "../../../src/lib/schemas/recovery-result.schema";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";
import {
  runRecovery,
  resolveEffectiveConstraintOverrides,
} from "../../../src/lib/engine/run-recovery";

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

describe("Milestone S6.1: Deterministic Recovery Orchestrator (runRecovery)", () => {
  beforeEach(() => {
    registerEventPlanningValidator();
  });

  describe("1. Canonical End-to-End Fixture Verification (All 9 Winners)", () => {
    it("matches all 9 canonical winners across all 3 scenarios and 3 profiles using runRecovery", () => {
      const { plan, scenariosDoc, rankingPolicy, expectedResultsDoc, graph } =
        loadFixtures();

      const profiles = [
        "preserve_plan",
        "minimize_spending",
        "protect_deadline",
      ] as const;

      for (const scenario of scenariosDoc.scenarios) {
        const expectedWinnersForScenario =
          expectedResultsDoc.expectedWinners[scenario.id];
        expect(expectedWinnersForScenario).toBeDefined();

        for (const profileId of profiles) {
          const expectedWinnerId = expectedWinnersForScenario[profileId];

          const result = runRecovery({
            baselinePlan: plan,
            baselineGraph: graph,
            disruption: scenario.disruption,
            canonicalPatches: scenario.candidatePatches,
            constraintOverrides: scenario.constraintOverrides,
            rankingPolicy,
            selectedProfile: profileId,
          });

          expect(result.success).toBe(true);
          expect(result.blockingIssues).toHaveLength(0);
          expect(result.hasFeasibleWinner).toBe(true);
          expect(result.winner).toBeDefined();
          expect(result.winner?.candidateId).toBe(expectedWinnerId);
          expect(result.winner?.isFeasible).toBe(true);

          // Verify Pareto analysis was populated
          expect(result.paretoFrontier.length).toBeGreaterThan(0);
          expect(result.paretoResult.frontier.length).toBeGreaterThan(0);

          // Verify baseline was preserved
          expect(result.baselinePreserved).toBe(true);
        }
      }
    });
  });

  describe("2. Disruption-to-Constraint Propagation", () => {
    it("propagates budget_changed disruption directly to effective constraints and evaluator", () => {
      const { plan, graph } = loadFixtures();

      const disruption: Disruption = {
        type: "budget_changed",
        field: "budgetLimit",
        oldValue: 25000,
        newValue: 16000,
        description: "Budget drops from ₹25,000 to ₹16,000",
      };

      // Even without explicit constraintOverrides passed, runRecovery extracts budgetLimit
      const result = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption,
      });

      expect(result.success).toBe(true);
      expect(result.effectiveConstraintOverrides.budgetLimit).toBe(16000);

      // Baseline plan costs ₹18,000, so under ₹16,000 it is infeasible
      expect(result.baselineEvaluation).toBeDefined();
      expect(result.baselineEvaluation?.budgetLimit).toBe(16000);
      expect(result.baselineEvaluation?.totalCost).toBe(18000);
      expect(result.baselineEvaluation?.budgetMargin).toBe(-2000); // Deficit of ₹2,000
      expect(result.baselineEvaluation?.isFeasible).toBe(false);
    });

    it("propagates deadline_changed disruption directly to effective constraints and evaluator", () => {
      const { plan, graph } = loadFixtures();

      const disruption: Disruption = {
        type: "deadline_changed",
        field: "deadlineHours",
        oldValue: 288,
        newValue: 120,
        description: "Deadline moved earlier to 120 hours",
      };

      const result = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption,
      });

      expect(result.success).toBe(true);
      expect(result.effectiveConstraintOverrides.deadlineHours).toBe(120);

      // Baseline finishes at 132h, so under 120h it is infeasible
      expect(result.baselineEvaluation).toBeDefined();
      expect(result.baselineEvaluation?.deadlineHours).toBe(120);
      expect(result.baselineEvaluation?.projectFinishHours).toBe(132);
      expect(result.baselineEvaluation?.deadlineSlackHours).toBe(-12); // Deficit of 12h
      expect(result.baselineEvaluation?.isFeasible).toBe(false);
    });

    it("resolveEffectiveConstraintOverrides merges explicit overrides with disruption values", () => {
      const disruption: Disruption = {
        type: "budget_reduction",
        field: "budgetLimit",
        newValue: 15000,
      };

      const explicit = { expectedAttendance: 120 };
      const merged = resolveEffectiveConstraintOverrides(disruption, explicit);

      expect(merged.budgetLimit).toBe(15000);
      expect(merged.expectedAttendance).toBe(120);
    });
  });

  describe("3. Resource/Venue Unavailability and Provisional Verification", () => {
    it("handles task_unavailable and identifies provisional status when unknown facts exist", () => {
      const { plan, graph, scenariosDoc } = loadFixtures();
      const s1 = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

      const result = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        selectedProfile: "preserve_plan",
      });

      expect(result.success).toBe(true);
      expect(result.winner?.candidateId).toBe("S1-A-community-hall");

      // Community Hall assumes venue_availability is unknown
      expect(result.winner?.unknownFactCount).toBeGreaterThan(0);
      expect(result.winner?.classification).toBe("provisionally_feasible");
      expect(result.winner?.verificationStatus).toBe("provisional");
      expect(result.warnings.some((w) => w.includes("provisionally feasible"))).toBe(
        true
      );
    });
  });

  describe("4. Error Boundaries and Structural Preconditions", () => {
    it("rejects cyclic baseline graphs before generating candidates", () => {
      const { plan } = loadFixtures();

      // Introduce a cyclic dependency in graph
      const cyclicPlan = JSON.parse(JSON.stringify(plan));
      cyclicPlan.dependencies.push({
        id: "D-cycle-test",
        fromTaskId: "T15",
        toTaskId: "T01",
        blocksExecution: true,
      });

      const cyclicGraph = rebuildGraph(cyclicPlan, { enforceValidation: false });

      const result = runRecovery({
        baselinePlan: cyclicPlan,
        baselineGraph: cyclicGraph,
        disruption: {
          type: "task_unavailable",
          targetTaskId: "T03",
        },
      });

      expect(result.success).toBe(false);
      expect(result.blockingIssues.some((b) => b.toLowerCase().includes("cycle"))).toBe(
        true
      );
      expect(result.hasFeasibleWinner).toBe(false);
      expect(result.baselinePreserved).toBe(true);
    });

    it("rejects disruptions targeting nonexistent task IDs with clarification request", () => {
      const { plan, graph } = loadFixtures();

      const result = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: {
          type: "task_unavailable",
          targetTaskId: "T999", // Nonexistent
        },
      });

      expect(result.success).toBe(false);
      expect(result.clarificationRequired).toBe(true);
      expect(result.clarificationReasons[0]).toContain("T999");
      expect(result.clarificationReasons[0]).toContain("T01");
      expect(result.hasFeasibleWinner).toBe(false);
    });

    it("handles unsupported disruption type gracefully with clarification request", () => {
      const { plan, graph } = loadFixtures();

      const result = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: {
          type: "alien_invasion_unsupported",
        },
      });

      expect(result.success).toBe(false);
      expect(result.clarificationRequired).toBe(true);
      expect(result.generatedCandidateCount).toBe(0);
      expect(result.hasFeasibleWinner).toBe(false);
    });

    it("handles all-candidates-infeasible scenario cleanly with explicit noWinnerReason", () => {
      const { plan, graph } = loadFixtures();

      // Extreme budget cut where no candidate can possibly satisfy ₹2,000 budget
      const result = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: {
          type: "budget_changed",
          field: "budgetLimit",
          newValue: 2000,
        },
      });

      expect(result.success).toBe(true);
      expect(result.feasibleCount).toBe(0);
      expect(result.hasFeasibleWinner).toBe(false);
      expect(result.winner).toBeUndefined();
      expect(result.noWinnerReason).toContain("hard constraints");
    });

    it("warns when plan domain has no registered domain-specific validator", () => {
      const { plan, graph } = loadFixtures();

      const customDomainPlan: Plan = {
        ...JSON.parse(JSON.stringify(plan)),
        domain: "space-mission-exploration",
      };
      const customGraph = rebuildGraph(customDomainPlan);

      const result = runRecovery({
        baselinePlan: customDomainPlan,
        baselineGraph: customGraph,
        disruption: {
          type: "task_unavailable",
          targetTaskId: "T03",
        },
      });

      expect(result.warnings.some((w) => w.includes("space-mission-exploration"))).toBe(
        true
      );
    });
  });

  describe("5. Immutability and Determinism", () => {
    it("guarantees baseline plan and graph are never mutated", () => {
      const { plan, graph, scenariosDoc } = loadFixtures();
      const s1 = scenariosDoc.scenarios[0];

      const planBefore = JSON.stringify(plan);
      const graphBefore = JSON.stringify(graph);

      runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s1.disruption,
        canonicalPatches: s1.candidatePatches,
        selectedProfile: "preserve_plan",
      });

      expect(JSON.stringify(plan)).toBe(planBefore);
      expect(JSON.stringify(graph)).toBe(graphBefore);
    });

    it("produces byte-for-byte identical results across repeated runs", () => {
      const { plan, graph, scenariosDoc } = loadFixtures();
      const s2 = scenariosDoc.scenarios.find((s) => s.id === "S2-budget-cut")!;

      const run1 = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s2.disruption,
        canonicalPatches: s2.candidatePatches,
        constraintOverrides: s2.constraintOverrides,
        selectedProfile: "minimize_spending",
      });

      const run2 = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: s2.disruption,
        canonicalPatches: s2.candidatePatches,
        constraintOverrides: s2.constraintOverrides,
        selectedProfile: "minimize_spending",
      });

      expect(run1.winner?.candidateId).toBe(run2.winner?.candidateId);
      expect(run1.scores).toEqual(run2.scores);
      expect(run1.paretoFrontier.map((f) => f.candidateId)).toEqual(
        run2.paretoFrontier.map((f) => f.candidateId)
      );
      expect(run1.baselineEvaluation).toEqual(run2.baselineEvaluation);
    });
  });

  describe("6. Generic Non-Campus Plans", () => {
    it("runs recovery orchestrator on arbitrary non-campus domain plans", () => {
      const genericPlan: Plan = PlanSchema.parse({
        schemaVersion: "1.0.0",
        id: "sprint-recovery-42",
        name: "Software Release Sprint",
        domain: "software-development",
        constraints: {
          currency: "USD",
          budgetLimit: 10000,
          deadlineHours: 80,
        },
        tasks: [
          {
            id: "DEV-1",
            title: "API Design",
            cost: 2000,
            durationHours: 10,
            priority: 5,
            policy: "fixed",
            status: "planned",
            inputs: {},
            outputs: { specReady: true },
          },
          {
            id: "DEV-2",
            title: "Core Service Implementation",
            cost: 5000,
            durationHours: 30,
            priority: 4,
            policy: "replaceable",
            status: "planned",
            alternatives: ["DEV-2-FAST"],
            inputs: { specReady: true },
            outputs: { codeReady: true },
          },
          {
            id: "DEV-3",
            title: "Automated Testing",
            cost: 1500,
            durationHours: 15,
            priority: 3,
            policy: "replaceable",
            status: "planned",
            inputs: { codeReady: true },
            outputs: { testsPassed: true },
          },
        ],
        dependencies: [
          {
            id: "DEP-1",
            fromTaskId: "DEV-1",
            toTaskId: "DEV-2",
            blocksExecution: true,
          },
          {
            id: "DEP-2",
            fromTaskId: "DEV-2",
            toTaskId: "DEV-3",
            blocksExecution: true,
          },
        ],
        demoAlternatives: {
          "DEV-2-FAST": [
            {
              id: "DEV-2-FAST",
              name: "Parallelized Service Implementation",
              cost: 6000,
              durationHours: 15,
              outputs: { codeReady: true },
            },
          ],
        },
      });

      const genericGraph = rebuildGraph(genericPlan);

      const disruption: Disruption = {
        type: "deadline_changed",
        field: "deadlineHours",
        oldValue: 80,
        newValue: 45,
        description: "Sprint release moved to 45 hours",
      };

      const result = runRecovery({
        baselinePlan: genericPlan,
        baselineGraph: genericGraph,
        disruption,
        selectedProfile: "protect_deadline",
      });

      expect(result.success).toBe(true);
      expect(result.effectiveConstraintOverrides.deadlineHours).toBe(45);
      expect(result.baselineEvaluation?.deadlineHours).toBe(45);
      // Original finish is 10 + 30 + 15 = 55h > 45h -> baseline is infeasible
      expect(result.baselineEvaluation?.isFeasible).toBe(false);

      // Fast alternative reduces duration to 10 + 15 + 15 = 40h <= 45h -> feasible!
      expect(result.generatedCandidateCount).toBeGreaterThan(0);
      expect(result.hasFeasibleWinner).toBe(true);
      expect(result.winner).toBeDefined();
      expect(result.winner?.isFeasible).toBe(true);
    });
  });
});
