import { describe, it, expect } from "vitest";
import {
  checkParetoDominance,
  computeParetoFrontier,
  CANONICAL_PARETO_OBJECTIVES,
} from "../../../src/lib/engine/pareto-frontier";
import type { CandidateEvaluationResult } from "../../../src/lib/engine/evaluate-candidates";

function makeMockCandidate(
  id: string,
  overrides: {
    feasible?: boolean;
    verificationStatus?: "verified_in_fixture" | "provisional" | "real_world_verified";
    changeFootprint_E?: number;
    lostTaskValue_L?: number;
    budgetUsage_C?: number;
    scheduleDisruption_S?: number;
    uncertainty_R?: number;
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
      failedReasons: feasible ? [] : ["Violation"],
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
    changedTaskIds: ["T1"],
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
    unknownFacts: overrides.verificationStatus === "provisional" ? ["fact"] : [],
    verificationStatus: overrides.verificationStatus ?? "verified_in_fixture",
  } as unknown as CandidateEvaluationResult;
}


describe("Pareto Frontier Analysis (S5C.3)", () => {
  describe("Canonical Objectives", () => {
    it("defines the 5 canonical objectives in lower_is_better direction", () => {
      expect(CANONICAL_PARETO_OBJECTIVES).toHaveLength(5);
      const keys = CANONICAL_PARETO_OBJECTIVES.map((o) => o.key);
      expect(keys).toEqual([
        "changeFootprint_E",
        "lostTaskValue_L",
        "budgetUsage_C",
        "scheduleDisruption_S",
        "uncertainty_R",
      ]);
      for (const obj of CANONICAL_PARETO_OBJECTIVES) {
        expect(obj.direction).toBe("lower_is_better");
      }
    });
  });

  describe("Pairwise Dominance (checkParetoDominance)", () => {
    it("determines candidate A dominates candidate B when A is strictly lower on one metric and equal on others", () => {
      const cA = makeMockCandidate("A", {
        changeFootprint_E: 0.1,
        lostTaskValue_L: 0.0,
        budgetUsage_C: 0.5,
        scheduleDisruption_S: 0.2,
        uncertainty_R: 0.1,
      });

      const cB = makeMockCandidate("B", {
        changeFootprint_E: 0.2, // worse
        lostTaskValue_L: 0.0,
        budgetUsage_C: 0.5,
        scheduleDisruption_S: 0.2,
        uncertainty_R: 0.1,
      });

      const domResult = checkParetoDominance(cA, cB);
      expect(domResult.dominates).toBe(true);
      expect(domResult.strictlyBetterOn).toEqual(["changeFootprint_E"]);

      // Reverse: B does not dominate A
      const revResult = checkParetoDominance(cB, cA);
      expect(revResult.dominates).toBe(false);
      expect(revResult.strictlyBetterOn).toEqual([]);
    });

    it("determines neither dominates when there is a trade-off (better on some, worse on others)", () => {
      const cA = makeMockCandidate("A", {
        changeFootprint_E: 0.1, // better
        budgetUsage_C: 0.8,     // worse
      });

      const cB = makeMockCandidate("B", {
        changeFootprint_E: 0.4, // worse
        budgetUsage_C: 0.3,     // better
      });

      const aDominatesB = checkParetoDominance(cA, cB);
      const bDominatesA = checkParetoDominance(cB, cA);

      expect(aDominatesB.dominates).toBe(false);
      expect(bDominatesA.dominates).toBe(false);
    });

    it("determines neither dominates when objective vectors are identical", () => {
      const cA = makeMockCandidate("A", {
        changeFootprint_E: 0.2,
        lostTaskValue_L: 0.1,
        budgetUsage_C: 0.5,
        scheduleDisruption_S: 0.3,
        uncertainty_R: 0.0,
      });

      const cB = makeMockCandidate("B", {
        changeFootprint_E: 0.2,
        lostTaskValue_L: 0.1,
        budgetUsage_C: 0.5,
        scheduleDisruption_S: 0.3,
        uncertainty_R: 0.0,
      });

      const aDominatesB = checkParetoDominance(cA, cB);
      const bDominatesA = checkParetoDominance(cB, cA);

      expect(aDominatesB.dominates).toBe(false);
      expect(bDominatesA.dominates).toBe(false);
      expect(aDominatesB.strictlyBetterOn).toEqual([]);
    });
  });

  describe("Frontier Partitioning (computeParetoFrontier)", () => {
    it("partitions mutually non-dominating candidates all onto the frontier", () => {
      const cA = makeMockCandidate("A", { changeFootprint_E: 0.1, budgetUsage_C: 0.8 });
      const cB = makeMockCandidate("B", { changeFootprint_E: 0.4, budgetUsage_C: 0.2 });

      const frontierRes = computeParetoFrontier([cA, cB]);
      expect(frontierRes.frontier).toHaveLength(2);
      expect(frontierRes.frontier.map((f) => f.candidateId).sort()).toEqual(["A", "B"]);
      expect(frontierRes.dominated).toHaveLength(0);
      expect(frontierRes.infeasible).toHaveLength(0);
    });

    it("identifies dominated candidates and provides clear explanation with dominating IDs", () => {
      const cDominating = makeMockCandidate("Best", {
        changeFootprint_E: 0.1,
        lostTaskValue_L: 0.0,
        budgetUsage_C: 0.2,
        scheduleDisruption_S: 0.1,
        uncertainty_R: 0.0,
      });

      const cDominated = makeMockCandidate("Worst", {
        changeFootprint_E: 0.5,
        lostTaskValue_L: 0.1,
        budgetUsage_C: 0.6,
        scheduleDisruption_S: 0.4,
        uncertainty_R: 0.2,
      });

      const frontierRes = computeParetoFrontier([cDominating, cDominated]);
      expect(frontierRes.frontier).toHaveLength(1);
      expect(frontierRes.frontier[0].candidateId).toBe("Best");

      expect(frontierRes.dominated).toHaveLength(1);
      const dominatedEntry = frontierRes.dominated[0];
      expect(dominatedEntry.candidate.candidateId).toBe("Worst");
      expect(dominatedEntry.dominatedBy).toEqual(["Best"]);
      expect(dominatedEntry.explanation).toContain("Best");
    });

    it("filters out infeasible candidates from the Pareto frontier", () => {
      const cInfeasible = makeMockCandidate("Infeasible", {
        feasible: false,
        changeFootprint_E: 0.01, // fantastic score, but invalid
        budgetUsage_C: 0.01,
      });

      const cFeasible = makeMockCandidate("Feasible", {
        feasible: true,
        changeFootprint_E: 0.3,
        budgetUsage_C: 0.5,
      });

      const frontierRes = computeParetoFrontier([cInfeasible, cFeasible]);
      expect(frontierRes.frontier).toHaveLength(1);
      expect(frontierRes.frontier[0].candidateId).toBe("Feasible");
      expect(frontierRes.infeasible).toHaveLength(1);
      expect(frontierRes.infeasible[0].candidateId).toBe("Infeasible");
    });

    it("preserves provisional vs verified verification status on frontier items", () => {
      const cVerified = makeMockCandidate("Verified", {
        verificationStatus: "verified_in_fixture",
        changeFootprint_E: 0.2,
        budgetUsage_C: 0.7,
      });

      const cProvisional = makeMockCandidate("Provisional", {
        verificationStatus: "provisional",
        changeFootprint_E: 0.5,
        budgetUsage_C: 0.2,
      });

      const frontierRes = computeParetoFrontier([cVerified, cProvisional]);
      expect(frontierRes.frontier).toHaveLength(2);

      const itemVer = frontierRes.frontier.find((f) => f.candidateId === "Verified");
      const itemProv = frontierRes.frontier.find((f) => f.candidateId === "Provisional");

      expect(itemVer?.verificationStatus).toBe("verified_in_fixture");
      expect(itemProv?.verificationStatus).toBe("provisional");
    });

    it("handles empty candidate list", () => {
      const res = computeParetoFrontier([]);
      expect(res.frontier).toEqual([]);
      expect(res.dominated).toEqual([]);
      expect(res.infeasible).toEqual([]);
    });

    it("handles single feasible candidate", () => {
      const c1 = makeMockCandidate("Solo");
      const res = computeParetoFrontier([c1]);
      expect(res.frontier).toHaveLength(1);
      expect(res.frontier[0].candidateId).toBe("Solo");
      expect(res.dominated).toHaveLength(0);
      expect(res.infeasible).toHaveLength(0);
    });

    it("does not mutate original candidate array", () => {
      const c1 = makeMockCandidate("A");
      const c2 = makeMockCandidate("B");
      const original = [c1, c2];
      computeParetoFrontier(original);
      expect(original[0]).toBe(c1);
      expect(original[1]).toBe(c2);
    });
  });
});
