import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  PlanSchema,
  type Plan,
  type Task,
  type Dependency,
} from "../../../src/lib/schemas/plan.schema";
import {
  ScenariosDocSchema,
  type ScenariosDoc,
} from "../../../src/lib/schemas/scenario.schema";
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
} from "../../../src/lib/engine/evaluate-candidates";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";

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
  const expectedResultsDoc = ExpectedResultsDocSchema.parse(
    JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "expected-results.json"), "utf-8")
    )
  );
  const graph = rebuildGraph(plan);

  return { plan, scenariosDoc, expectedResultsDoc, graph };
}

describe("Candidate Evaluation & Feasibility Classification (S5C.2)", () => {
  beforeEach(() => {
    registerEventPlanningValidator();
  });

  it("1. Generated venue alternative that passes all applicable constraints evaluates successfully", () => {
    const { plan, graph } = loadFixtures();

    const genRes = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption: {
        type: "task_unavailable",
        targetTaskId: "T03",
        field: "bookingStatus",
        newValue: "unavailable",
      },
    });

    expect(genRes.success).toBe(true);
    const commCand = genRes.candidates.find(
      (c) => c.id === "cand-alt-T03-community-hall"
    )!;
    expect(commCand).toBeDefined();

    const evalRes = evaluateCandidate(plan, graph, commCand);

    expect(evalRes.validation.hardConstraintsPass).toBe(true);
    expect(evalRes.validation.budgetPass).toBe(true);
    expect(evalRes.validation.deadlinePass).toBe(true);
    expect(evalRes.validation.fixedTasksPreserved).toBe(true);
    expect(evalRes.validation.acyclic).toBe(true);
    expect(evalRes.validation.capacityPass).toBe(true);
    expect(evalRes.validation.accessibilityPass).toBe(true);

    // Because community-hall has unknown availability, it should be provisionally feasible
    expect(evalRes.classification).toBe("provisionally_feasible");
    expect(evalRes.verificationStatus).toBe("provisional");
    expect(evalRes.unknownFacts).toContain("venue_availability");
    expect(evalRes.verificationRequirements.length).toBeGreaterThan(0);
  });

  it("2. Candidate exceeding budget is classified as infeasible with violation details", () => {
    const { plan, graph } = loadFixtures();

    // Patch that drives cost over 25000 budget
    const overBudgetPatch: CandidatePatch = {
      id: "over-budget-patch",
      label: "Luxurious Venue Upgrade",
      changedTaskIds: ["T03"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {
        T03: {
          cost: 35000, // baseline total 18000 - 5000 + 35000 = 48000 > 25000
        },
      },
    };

    const evalRes = evaluateCandidate(plan, graph, overBudgetPatch);

    expect(evalRes.classification).toBe("infeasible");
    expect(evalRes.validation.budgetPass).toBe(false);
    expect(evalRes.validation.hardConstraintsPass).toBe(false);
    expect(evalRes.constraintViolations.some((v) => v.code === "BUDGET_EXCEEDED")).toBe(
      true
    );
    expect(evalRes.explanation).toContain("BUDGET_EXCEEDED");
  });

  it("3. Candidate violating project deadline is classified as infeasible", () => {
    const { plan, graph } = loadFixtures();

    // Critical task extended by 300 hours (deadline is 288h)
    const latePatch: CandidatePatch = {
      id: "late-patch",
      label: "Excessive Duration Expansion",
      changedTaskIds: ["T04"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {
        T04: {
          durationHours: 300,
        },
      },
    };

    const evalRes = evaluateCandidate(plan, graph, latePatch);

    expect(evalRes.classification).toBe("infeasible");
    expect(evalRes.validation.deadlinePass).toBe(false);
    expect(evalRes.validation.hardConstraintsPass).toBe(false);
    expect(
      evalRes.constraintViolations.some((v) => v.code === "DEADLINE_EXCEEDED")
    ).toBe(true);
    expect(evalRes.explanation).toContain("DEADLINE_EXCEEDED");
  });

  it("4. Fixed-task modifications and removals are rejected as infeasible", () => {
    const { plan, graph } = loadFixtures();

    // 4a. Removal of fixed task T01
    const removeFixedPatch: CandidatePatch = {
      id: "remove-fixed-patch",
      label: "Remove Goal Definition",
      changedTaskIds: [],
      removedTaskIds: ["T01"],
      lostTaskIds: ["T01"],
      unknownFacts: [],
      taskOverrides: {},
    };

    const evalRemove = evaluateCandidate(plan, graph, removeFixedPatch);
    expect(evalRemove.classification).toBe("infeasible");
    expect(evalRemove.validation.fixedTasksPreserved).toBe(false);
    expect(
      evalRemove.constraintViolations.some((v) => v.code === "FIXED_TASK_REMOVED")
    ).toBe(true);

    // 4b. Modification of fixed task T09
    const modifyFixedPatch: CandidatePatch = {
      id: "modify-fixed-patch",
      label: "Modify Fixed Logo Cost",
      changedTaskIds: ["T09"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {
        T09: {
          cost: 9999,
        },
      },
    };

    const evalModify = evaluateCandidate(plan, graph, modifyFixedPatch);
    expect(evalModify.classification).toBe("infeasible");
    expect(evalModify.validation.fixedTasksPreserved).toBe(false);
    expect(
      evalModify.constraintViolations.some((v) => v.code === "FIXED_TASK_MODIFIED")
    ).toBe(true);
  });

  it("5. Cyclic candidate graph is classified as infeasible", () => {
    const { plan } = loadFixtures();

    // Create a plan with a cycle: T01 -> T02 -> T01
    const cyclicPlan: Plan = {
      ...plan,
      dependencies: [
        ...plan.dependencies,
        {
          id: "CYCLE_EDGE",
          fromTaskId: "T02",
          toTaskId: "T01",
          blocksExecution: true,
          fieldMappings: [],
          origin: "manual",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        },
      ],
    };
    const cyclicGraph = rebuildGraph(cyclicPlan);

    const dummyPatch: CandidatePatch = {
      id: "dummy-patch",
      label: "Dummy Patch on Cyclic Plan",
      changedTaskIds: [],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {},
    };

    const evalRes = evaluateCandidate(cyclicPlan, cyclicGraph, dummyPatch);
    expect(evalRes.classification).toBe("infeasible");
    expect(evalRes.validation.acyclic).toBe(false);
    expect(evalRes.validation.hardConstraintsPass).toBe(false);
  });

  it("6. Incident dependencies are explicitly removed and audited when an optional task is removed", () => {
    const { plan, graph } = loadFixtures();

    // Add an optional task with incident dependencies
    const optionalTaskId = "T_OPTIONAL_PHOTO";
    const testPlan: Plan = {
      ...plan,
      tasks: [
        ...plan.tasks,
        {
          id: optionalTaskId,
          title: "Optional Photographer",
          cost: 600,
          durationHours: 4,
          priority: 2,
          policy: "optional",
          status: "planned",
          inputs: {},
          outputs: {},
        },
      ],
      dependencies: [
        ...plan.dependencies,
        {
          id: "D_INCIDENT_IN",
          fromTaskId: "T01",
          toTaskId: optionalTaskId,
          blocksExecution: true,
          fieldMappings: [],
          origin: "system_template",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        },
        {
          id: "D_INCIDENT_OUT",
          fromTaskId: optionalTaskId,
          toTaskId: "T15",
          blocksExecution: false,
          fieldMappings: [],
          origin: "system_template",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        },
      ],
    };
    const testGraph = rebuildGraph(testPlan);

    const removeOptionalPatch: CandidatePatch = {
      id: "remove-optional-photographer",
      label: "Drop Optional Photographer",
      changedTaskIds: [],
      removedTaskIds: [optionalTaskId],
      lostTaskIds: [optionalTaskId],
      unknownFacts: [],
      taskOverrides: {},
    };

    const evalRes = evaluateCandidate(testPlan, testGraph, removeOptionalPatch);

    expect(evalRes.validation.hardConstraintsPass).toBe(true);
    expect(evalRes.removedTaskIds).toContain(optionalTaskId);
    expect(evalRes.removedDependencyIds).toContain("D_INCIDENT_IN");
    expect(evalRes.removedDependencyIds).toContain("D_INCIDENT_OUT");

    // The candidate plan and graph must no longer contain the removed task or dependencies
    expect(
      evalRes.candidatePlan.tasks.some((t) => t.id === optionalTaskId)
    ).toBe(false);
    expect(
      evalRes.candidatePlan.dependencies.some(
        (d) => d.id === "D_INCIDENT_IN" || d.id === "D_INCIDENT_OUT"
      )
    ).toBe(false);
    expect(evalRes.candidateGraph.nodes.some((n) => n.id === optionalTaskId)).toBe(
      false
    );
  });

  it("7. Task removal leaving an un-cleared dangling dependency is rejected as infeasible", () => {
    const { plan, graph } = loadFixtures();

    // Construct a candidate plan that manually removed a task without updating dependencies
    const brokenPlan: Plan = {
      ...plan,
      tasks: plan.tasks.filter((t) => t.id !== "T02"), // Missing T02, but dependencies still reference T02
    };
    const brokenGraph = rebuildGraph(brokenPlan);

    const testPatch: CandidatePatch = {
      id: "test-patch-on-broken-graph",
      label: "Test patch",
      changedTaskIds: [],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {},
    };

    const evalRes = evaluateCandidate(brokenPlan, brokenGraph, testPatch);
    expect(evalRes.classification).toBe("infeasible");
    expect(
      evalRes.constraintViolations.some(
        (v) => v.code === "INVALID_GRAPH_STRUCTURE"
      )
    ).toBe(true);
  });

  it("8. Unknown material facts produce a provisional result rather than verified feasibility", () => {
    const { plan, graph } = loadFixtures();

    // A candidate that passes all constraints but has unknown material facts
    const provisionalPatch: CandidatePatch = {
      id: "provisional-patch",
      label: "Provisional Vendor Selection",
      changedTaskIds: ["T06"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: ["vendor_insurance_confirmed", "audio_feed_compatible"],
      taskOverrides: {
        T06: {
          cost: 2000,
        },
      },
    };

    const evalRes = evaluateCandidate(plan, graph, provisionalPatch);

    expect(evalRes.validation.hardConstraintsPass).toBe(true);
    expect(evalRes.classification).toBe("provisionally_feasible");
    expect(evalRes.verificationStatus).toBe("provisional");
    expect(evalRes.verificationRequirements).toContain(
      'Verify material fact: "vendor_insurance_confirmed"'
    );
    expect(evalRes.verificationRequirements).toContain(
      'Verify material fact: "audio_feed_compatible"'
    );
  });

  it("9. Missing required domain validators prevent a verified-feasible result", () => {
    const { plan, graph } = loadFixtures();

    // Plan declares an unregistered domain "aerospace-defense"
    const unverifiedDomainPlan: Plan = {
      ...plan,
      domain: "aerospace-defense",
    };
    const testGraph = rebuildGraph(unverifiedDomainPlan);

    // Candidate with no unknown facts that satisfies all constraints
    const cleanPatch: CandidatePatch = {
      id: "clean-patch",
      label: "Clean Minor Adjustment",
      changedTaskIds: ["T06"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {
        T06: {
          cost: 2100,
        },
      },
    };

    const evalRes = evaluateCandidate(unverifiedDomainPlan, testGraph, cleanPatch);

    expect(evalRes.validation.hardConstraintsPass).toBe(true);
    // Because the declared domain has no registered validator, it cannot claim full verification
    expect(evalRes.classification).toBe("provisionally_feasible");
    expect(evalRes.verificationStatus).toBe("provisional");
    expect(evalRes.explanation).toContain(
      "Declared domain has no registered domain validator"
    );
  });

  it("10. Valid generic plans without campus-event-specific assumptions evaluate to feasible", () => {
    // Construct a generic software deployment plan
    const genericTasks: Task[] = [
      {
        id: "BUILD",
        title: "Build container image",
        cost: 100,
        durationHours: 2,
        priority: 5,
        policy: "fixed",
        status: "planned",
        inputs: {},
        outputs: { imageTag: "v1.2.3" },
      },
      {
        id: "DEPLOY",
        title: "Deploy to staging",
        cost: 200,
        durationHours: 1,
        priority: 4,
        policy: "replaceable",
        status: "planned",
        inputs: { imageTag: "v1.2.3" },
        outputs: { stagingReady: true },
      },
    ];

    const genericDeps: Dependency[] = [
      {
        id: "DEP_1",
        fromTaskId: "BUILD",
        toTaskId: "DEPLOY",
        blocksExecution: true,
        fieldMappings: [{ sourceField: "imageTag", targetInput: "imageTag", optional: false }],
        origin: "system_template",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
    ];

    const genericPlan: Plan = PlanSchema.parse({
      schemaVersion: "1.0.0",
      id: "software-release-pipeline",
      name: "Software Release Pipeline",
      planRevision: 1,
      constraints: {
        budgetLimit: 500,
        currency: "USD",
        deadlineHours: 8,
      },
      tasks: genericTasks,
      dependencies: genericDeps,
    });

    const genericGraph = rebuildGraph(genericPlan);

    const validPatch: CandidatePatch = {
      id: "deploy-optimization",
      label: "Optimize Staging Deploy",
      changedTaskIds: ["DEPLOY"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {
        DEPLOY: {
          cost: 150,
          durationHours: 0.5,
        },
      },
    };

    const evalRes = evaluateCandidate(genericPlan, genericGraph, validPatch);

    expect(evalRes.validation.hardConstraintsPass).toBe(true);
    expect(evalRes.classification).toBe("feasible");
    expect(evalRes.verificationStatus).toBe("verified_in_fixture");
    expect(evalRes.projectedTotalCost).toBe(250);
    expect(evalRes.budgetMargin).toBe(250);
    expect(evalRes.earliestProjectFinishHours).toBe(2.5);
    expect(evalRes.deadlineSlackHours).toBe(5.5);
  });

  it("11. Impact and schedule results correctly reflect proposed changes", () => {
    const { plan, graph } = loadFixtures();

    const patch: CandidatePatch = {
      id: "extended-duration-patch",
      label: "Extend Venue Duration",
      changedTaskIds: ["T03"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: [],
      taskOverrides: {
        T03: {
          durationHours: 28, // +4 hours relative to baseline 24
        },
      },
    };

    const evalRes = evaluateCandidate(plan, graph, patch);

    expect(evalRes.impactAnalysis.directlyChangedTaskIds).toContain("T03");
    // Start of T05 (downstream of T03) shifts from 30h to 34h (+4h)
    const t05Shift = evalRes.movedTaskStartTimes.find((m) => m.taskId === "T05");
    expect(t05Shift).toBeDefined();
    expect(t05Shift!.absoluteStartShiftHours).toBe(4);
    expect(evalRes.earliestProjectFinishHours).toBe(136); // Baseline 132 + 4
  });

  it("12. Candidate evaluation never mutates the accepted baseline plan or graph", () => {
    const { plan, graph } = loadFixtures();

    const planBefore = JSON.stringify(plan);
    const graphBefore = JSON.stringify(graph);

    const patch: CandidatePatch = {
      id: "mutation-test-patch",
      label: "Test Patch",
      changedTaskIds: ["T03"],
      removedTaskIds: ["T16"],
      lostTaskIds: ["T16"],
      unknownFacts: ["test_fact"],
      taskOverrides: {
        T03: { cost: 9999 },
      },
    };

    evaluateCandidate(plan, graph, patch);

    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(graph)).toBe(graphBefore);
  });

  it("13. Repeated calls produce identical candidate evaluations (determinism)", () => {
    const { plan, graph, scenariosDoc } = loadFixtures();

    const patch: CandidatePatch = {
      id: "determinism-patch",
      label: "Determinism Test",
      changedTaskIds: ["T06"],
      removedTaskIds: [],
      lostTaskIds: [],
      unknownFacts: ["fact_1"],
      taskOverrides: {
        T06: { cost: 1800 },
      },
    };

    const eval1 = evaluateCandidate(plan, graph, patch);
    const eval2 = evaluateCandidate(plan, graph, patch);

    expect(eval1).toEqual(eval2);
    expect(JSON.stringify(eval1)).toBe(JSON.stringify(eval2));

    // Batch determinism: multi-candidate order preservation and repeatability
    const scenario = scenariosDoc.scenarios[0];
    const batch1 = evaluateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      candidates: scenario.candidatePatches,
      constraintOverrides: scenario.constraintOverrides,
    });
    const batch2 = evaluateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      candidates: scenario.candidatePatches,
      constraintOverrides: scenario.constraintOverrides,
    });

    // Evaluations MUST strictly preserve input candidate order
    expect(batch1.evaluations.map((e) => e.candidateId)).toEqual(
      scenario.candidatePatches.map((c) => c.id)
    );
    expect(batch1).toEqual(batch2);
    expect(JSON.stringify(batch1)).toBe(JSON.stringify(batch2));
  });

  it("14. Compatibility with all three canonical disruption fixtures and exact metric parity", () => {
    const { plan, scenariosDoc, expectedResultsDoc, graph } = loadFixtures();

    for (const scenario of scenariosDoc.scenarios) {
      const expectedScenario = expectedResultsDoc.scenarios.find(
        (s) => s.scenarioId === scenario.id
      )!;
      expect(expectedScenario).toBeDefined();

      const evalBatch = evaluateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        candidates: scenario.candidatePatches,
        constraintOverrides: scenario.constraintOverrides,
      });

      expect(evalBatch.success).toBe(true);
      expect(evalBatch.evaluations).toHaveLength(
        scenario.candidatePatches.length
      );

      for (const expectedCand of expectedScenario.candidates) {
        const actualEval = evalBatch.evaluations.find(
          (e) => e.candidateId === expectedCand.candidateId
        )!;
        expect(actualEval).toBeDefined();

        // Exact match on cost, finish hours, and slack
        expect(actualEval.projectedTotalCost).toBe(
          expectedCand.projectedTotalCost
        );
        expect(actualEval.budgetLimit).toBe(expectedCand.budgetLimit);
        expect(actualEval.budgetMargin).toBe(expectedCand.budgetMargin);
        expect(actualEval.earliestProjectFinishHours).toBe(
          expectedCand.earliestProjectFinishHours
        );
        expect(actualEval.deadlineSlackHours).toBe(
          expectedCand.deadlineSlackHours
        );

        // Validation parity
        expect(actualEval.validation.budgetPass).toBe(
          expectedCand.validation.budgetPass
        );
        expect(actualEval.validation.deadlinePass).toBe(
          expectedCand.validation.deadlinePass
        );
        expect(actualEval.validation.capacityPass).toBe(
          expectedCand.validation.capacityPass
        );
        expect(actualEval.validation.accessibilityPass).toBe(
          expectedCand.validation.accessibilityPass
        );
        expect(actualEval.validation.fixedTasksPreserved).toBe(
          expectedCand.validation.fixedTasksPreserved
        );
        expect(actualEval.validation.acyclic).toBe(
          expectedCand.validation.acyclic
        );
        expect(actualEval.validation.hardConstraintsPass).toBe(
          expectedCand.validation.hardConstraintsPass
        );

        // Feasibility classification
        if (expectedCand.validation.hardConstraintsPass) {
          expect(actualEval.classification).toBe("provisionally_feasible");
        } else {
          expect(actualEval.classification).toBe("infeasible");
        }

        // Metrics parity (E, L, C, M, Q, S, R) within floating point epsilon
        expect(actualEval.metrics.changeFootprint_E).toBeCloseTo(
          expectedCand.metrics.changeFootprint_E,
          6
        );
        expect(actualEval.metrics.lostTaskValue_L).toBeCloseTo(
          expectedCand.metrics.lostTaskValue_L,
          6
        );
        expect(actualEval.metrics.budgetUsage_C).toBeCloseTo(
          expectedCand.metrics.budgetUsage_C!,
          6
        );
        expect(actualEval.metrics.movement_M).toBeCloseTo(
          expectedCand.metrics.movement_M,
          6
        );
        expect(actualEval.metrics.deadlinePressure_Q).toBeCloseTo(
          expectedCand.metrics.deadlinePressure_Q,
          6
        );
        expect(actualEval.metrics.scheduleDisruption_S).toBeCloseTo(
          expectedCand.metrics.scheduleDisruption_S,
          6
        );
        expect(actualEval.metrics.uncertainty_R).toBeCloseTo(
          expectedCand.metrics.uncertainty_R,
          6
        );
      }
    }
  });
});
