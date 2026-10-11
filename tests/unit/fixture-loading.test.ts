import { describe, it, expect } from "vitest";
import {
  canonicalPlan,
  canonicalScenariosDoc,
  canonicalRankingPolicy,
  canonicalExpectedResults,
} from "../../src/data/load-demo-fixtures";

describe("Milestone B: Canonical Fixture Loading & Validation", () => {
  describe("plan.json", () => {
    it("loads and validates canonical baseline plan", () => {
      expect(canonicalPlan.id).toBe("campus-tech-fest");
      expect(canonicalPlan.tasks).toHaveLength(16);
    });

    it("matches canonical baseline cost, budget, deadline, and priority sum", () => {
      const totalCost = canonicalPlan.tasks.reduce((sum, t) => sum + t.cost, 0);
      const totalPriority = canonicalPlan.tasks.reduce((sum, t) => sum + t.priority, 0);

      expect(totalCost).toBe(18000);
      expect(canonicalPlan.constraints.budgetLimit).toBe(25000);
      expect(canonicalPlan.constraints.deadlineHours).toBe(288);
      expect(totalPriority).toBe(64);
    });

    it("verifies all task policies belong to fixed, replaceable, or optional", () => {
      const validPolicies = new Set(["fixed", "replaceable", "optional"]);
      for (const task of canonicalPlan.tasks) {
        expect(validPolicies.has(task.policy)).toBe(true);
      }
    });

    it("verifies all dependencies reference valid task IDs", () => {
      const taskIds = new Set(canonicalPlan.tasks.map((t) => t.id));
      for (const dep of canonicalPlan.dependencies) {
        expect(taskIds.has(dep.fromTaskId)).toBe(true);
        expect(taskIds.has(dep.toTaskId)).toBe(true);
      }
    });
  });

  describe("scenarios.json", () => {
    it("loads and validates all 3 disruption scenarios", () => {
      expect(canonicalScenariosDoc.scenarios).toHaveLength(3);
      const scenarioIds = canonicalScenariosDoc.scenarios.map((s) => s.id);
      expect(scenarioIds).toEqual([
        "S1-venue-cancelled",
        "S2-budget-cut",
        "S3-deadline-moved-earlier",
      ]);
    });

    it("verifies candidate patches per scenario", () => {
      for (const scenario of canonicalScenariosDoc.scenarios) {
        expect(scenario.candidatePatches.length).toBeGreaterThanOrEqual(2);
        for (const candidate of scenario.candidatePatches) {
          expect(candidate.id).toBeTruthy();
          expect(candidate.label).toBeTruthy();
          // Unknown facts must be an array (for visibility of assumptions)
          expect(Array.isArray(candidate.unknownFacts)).toBe(true);
        }
      }
    });
  });

  describe("ranking-policy.json", () => {
    it("loads and validates ranking policy with 3 preference profiles", () => {
      expect(canonicalRankingPolicy.direction).toBe("lower_score_is_better");
      const profiles = Object.keys(canonicalRankingPolicy.profiles);
      expect(profiles).toContain("preserve_plan");
      expect(profiles).toContain("minimize_spending");
      expect(profiles).toContain("protect_deadline");
    });

    it("verifies weights sum to 1.0 for each profile", () => {
      for (const [key, profile] of Object.entries(canonicalRankingPolicy.profiles)) {
        const sum =
          profile.weights.changeFootprint +
          profile.weights.lostTaskValue +
          profile.weights.budgetUsage +
          profile.weights.scheduleDisruption +
          profile.weights.uncertainty;
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe("expected-results.json", () => {
    it("loads and validates numeric acceptance expectations", () => {
      expect(canonicalExpectedResults.baseline.taskCount).toBe(16);
      expect(canonicalExpectedResults.baseline.totalCost).toBe(18000);
      expect(canonicalExpectedResults.baseline.earliestFinishHours).toBe(132);
      expect(canonicalExpectedResults.baseline.deadlineSlackHours).toBe(156);
      expect(canonicalExpectedResults.baseline.prioritySum).toBe(64);
    });

    it("verifies expected winners across all 9 scenario/preference permutations", () => {
      const winners = canonicalExpectedResults.expectedWinners;
      expect(winners["S1-venue-cancelled"]).toEqual({
        preserve_plan: "S1-A-community-hall",
        minimize_spending: "S1-B-campus-auditorium",
        protect_deadline: "S1-A-community-hall",
      });
      expect(winners["S2-budget-cut"]).toEqual({
        preserve_plan: "S2-A-lecture-hall-lean",
        minimize_spending: "S2-B-department-hall-lean",
        protect_deadline: "S2-A-lecture-hall-lean",
      });
      expect(winners["S3-deadline-moved-earlier"]).toEqual({
        preserve_plan: "S3-A-early-registration-close",
        minimize_spending: "S3-A-early-registration-close",
        protect_deadline: "S3-B-fast-track-venue-and-registration",
      });
    });
  });
});
