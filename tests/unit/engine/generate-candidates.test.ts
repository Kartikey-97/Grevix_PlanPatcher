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
  type Disruption,
} from "../../../src/lib/schemas/scenario.schema";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import {
  generateCandidates,
  type CandidateGenerationInput,
} from "../../../src/lib/engine/generate-candidates";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";

const FIXTURES_DIR = path.resolve(__dirname, "../../../fixtures/planpatch");

function loadCanonicalFixtures() {
  const planRaw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "plan.json"), "utf-8")
  );
  const scenariosRaw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "scenarios.json"), "utf-8")
  );

  const plan = PlanSchema.parse(planRaw);
  const scenariosDoc = ScenariosDocSchema.parse(scenariosRaw);
  const graph = rebuildGraph(plan);

  return { plan, scenariosDoc, graph };
}

describe("Candidate Generation Engine (S5C.1)", () => {
  beforeEach(() => {
    registerEventPlanningValidator();
  });

  it("1. Resource unavailability with multiple declared alternatives generates candidate for each alternative", () => {
    const { plan, graph } = loadCanonicalFixtures();

    const disruption: Disruption = {
      type: "task_unavailable",
      targetTaskId: "T03", // "Book venue" has 5 alternatives: community-hall, campus-auditorium, lecture-hall, department-hall, rapid-confirmed-hall
      field: "bookingStatus",
      newValue: "unavailable",
      description: "Original venue booking cancelled",
    };

    const res = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    expect(res.success).toBe(true);
    expect(res.blockingIssues).toHaveLength(0);
    expect(res.candidates.length).toBeGreaterThanOrEqual(5);

    // Verify candidates correspond to the declared alternatives
    const candidateIds = res.candidates.map((c) => c.id);
    expect(candidateIds).toContain("cand-alt-T03-community-hall");
    expect(candidateIds).toContain("cand-alt-T03-campus-auditorium");
    expect(candidateIds).toContain("cand-alt-T03-lecture-hall");
    expect(candidateIds).toContain("cand-alt-T03-department-hall");
    expect(candidateIds).toContain("cand-alt-T03-rapid-confirmed-hall");

    // Verify community-hall candidate properties
    const commCandidate = res.candidates.find(
      (c) => c.id === "cand-alt-T03-community-hall"
    )!;
    expect(commCandidate.taskOverrides["T03"]).toBeDefined();
    expect(commCandidate.taskOverrides["T03"].cost).toBe(7000);
    expect(commCandidate.taskOverrides["T03"].durationHours).toBe(26);

    // Verify field propagation downstream: T07 receives venueLayoutType and venueCapacity, T08 receives venueAddress
    expect(commCandidate.changedTaskIds).toContain("T03");
    expect(commCandidate.changedTaskIds).toContain("T07");
    expect(commCandidate.changedTaskIds).toContain("T08");
    expect(commCandidate.taskOverrides["T07"]?.inputs?.["venueCapacity"]).toBe(120);
    expect(commCandidate.taskOverrides["T08"]?.inputs?.["venueAddress"]).toBe(
      "Demo Community Hall, Demo University"
    );
  });

  it("2. Attribute changes that affect only relevant fields create targeted candidate", () => {
    const { plan, graph } = loadCanonicalFixtures();

    const disruption: Disruption = {
      type: "attribute_change",
      targetTaskId: "T11", // Recruit volunteers (cost: 500, durationHours: 24)
      field: "cost",
      oldValue: 500,
      newValue: 800,
      description: "Volunteer recruitment costs increased",
    };

    const res = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    expect(res.success).toBe(true);
    const attrCand = res.candidates.find(
      (c) => c.id === "cand-attr-T11-cost"
    );
    expect(attrCand).toBeDefined();
    expect(attrCand!.changedTaskIds).toEqual(["T11"]);
    expect(attrCand!.taskOverrides["T11"]?.cost).toBe(800);
    expect(attrCand!.removedTaskIds).toHaveLength(0);
  });

  it("3. Budget reduction generates candidates using cheaper alternatives and optional task removal", () => {
    const { plan, graph } = loadCanonicalFixtures();

    const disruption: Disruption = {
      type: "budget_reduction",
      field: "budgetLimit",
      oldValue: 25000,
      newValue: 16000,
      description: "Budget cut from 25000 to 16000",
    };

    const res = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
      maxCandidates: 10,
    });

    expect(res.success).toBe(true);
    expect(res.candidates.length).toBeGreaterThan(0);

    // Should include cheaper alternatives like AV packages, catering packages, and department hall
    const candidateIds = res.candidates.map((c) => c.id);
    const hasCheaperAlt = candidateIds.some(
      (id) =>
        id.includes("basic-av") ||
        id.includes("standard-av") ||
        id.includes("department-hall") ||
        id.includes("lecture-hall") ||
        id.includes("combo-lean")
    );
    expect(hasCheaperAlt).toBe(true);

    // All candidates must have the new budget constraint override
    for (const cand of res.candidates) {
      expect(cand.constraintOverrides?.budgetLimit).toBe(16000);
    }
  });

  it("4. Deadline change considers declared faster alternatives on critical path", () => {
    const { plan, graph } = loadCanonicalFixtures();

    const disruption: Disruption = {
      type: "deadline_moved",
      field: "deadlineHours",
      oldValue: 288,
      newValue: 120,
      description: "Deadline moved to 120 hours",
    };

    const res = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    expect(res.success).toBe(true);
    expect(res.candidates.length).toBeGreaterThan(0);

    // Should include early-close-registration (T05) and rapid-confirmed-hall (T03)
    const candidateIds = res.candidates.map((c) => c.id);
    const hasFastOption = candidateIds.some(
      (id) =>
        id.includes("early-close-registration") ||
        id.includes("rapid-confirmed-hall") ||
        id.includes("fast-track")
    );
    expect(hasFastOption).toBe(true);

    for (const cand of res.candidates) {
      expect(cand.constraintOverrides?.deadlineHours).toBe(120);
    }
  });

  it("5. Fixed tasks are never silently removed or modified by the generator", () => {
    const { plan, graph } = loadCanonicalFixtures();

    // T01 is fixed policy
    const t01 = plan.tasks.find((t) => t.id === "T01")!;
    expect(t01.policy).toBe("fixed");

    const disruption: Disruption = {
      type: "task_unavailable",
      targetTaskId: "T01",
      description: "T01 became unavailable",
    };

    const res = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    expect(res.success).toBe(false);
    expect(res.candidates).toHaveLength(0);
    expect(res.blockingIssues[0]).toContain("fixed project requirement");
    expect(res.unsupportedReason).toContain("fixed policy");
  });

  it("6. Unknown or nonexistent alternatives are flagged with unknownFacts rather than treated as verified resources", () => {
    const { plan, graph } = loadCanonicalFixtures();

    // Create a modified plan where a replaceable task references an uncataloged alternative
    const testPlan: Plan = {
      ...plan,
      tasks: plan.tasks.map((t) =>
        t.id === "T11"
          ? { ...t, alternatives: ["nonexistent-volunteer-agency-999"] }
          : t
      ),
    };

    const disruption: Disruption = {
      type: "task_unavailable",
      targetTaskId: "T11",
    };

    const res = generateCandidates({
      baselinePlan: testPlan,
      baselineGraph: graph,
      disruption,
    });

    expect(res.success).toBe(true);
    const flaggedCand = res.candidates.find((c) =>
      c.id.includes("nonexistent-volunteer-agency-999")
    );
    expect(flaggedCand).toBeDefined();
    expect(flaggedCand!.unknownFacts).toContain(
      "unresolved_alternative_nonexistent-volunteer-agency-999"
    );
  });

  it("7. Missing alternatives on replaceable task produce an actionable no-candidate result", () => {
    const { plan, graph } = loadCanonicalFixtures();

    // T04 has policy replaceable and no alternatives declared
    const t04 = plan.tasks.find((t) => t.id === "T04")!;
    expect(t04.policy).toBe("replaceable");
    expect(t04.alternatives ?? []).toHaveLength(0);

    const disruption: Disruption = {
      type: "task_unavailable",
      targetTaskId: "T04",
      description: "Speaker confirmation unavailable",
    };

    const res = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    expect(res.success).toBe(true);
    expect(res.candidates).toHaveLength(0);
    expect(res.unsupportedReason).toContain("no declared alternatives");
    expect(res.blockingIssues[0]).toContain("No alternatives declared");
  });

  it("8. Stale, invalid, or conflicted baselines are rejected via recovery guard", () => {
    const { plan, graph } = loadCanonicalFixtures();

    // Simulate stale graph by modifying task without rebuilding graph
    const stalePlan: Plan = {
      ...plan,
      tasks: plan.tasks.map((t) =>
        t.id === "T01" ? { ...t, durationHours: 99 } : t
      ),
    };

    const disruption: Disruption = {
      type: "task_unavailable",
      targetTaskId: "T03",
    };

    const res = generateCandidates({
      baselinePlan: stalePlan,
      baselineGraph: graph, // graph still has durationHours: 2 for T01
      disruption,
    });

    expect(res.success).toBe(false);
    expect(res.candidates).toHaveLength(0);
    expect(res.error).toContain("Recovery guard blocked");
    expect(res.blockingIssues.some((i) => i.includes("fingerprint"))).toBe(true);
  });

  it("9. Repeated calls produce identical candidate IDs, contents, and ordering (determinism)", () => {
    const { plan, graph } = loadCanonicalFixtures();

    const disruption: Disruption = {
      type: "task_unavailable",
      targetTaskId: "T03",
    };

    const run1 = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    const run2 = generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    expect(run1).toEqual(run2);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it("10. Candidate generation never mutates the accepted baseline plan or graph", () => {
    const { plan, graph } = loadCanonicalFixtures();

    const planSnapshot = JSON.stringify(plan);
    const graphSnapshot = JSON.stringify(graph);

    generateCandidates({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption: {
        type: "task_unavailable",
        targetTaskId: "T03",
      },
    });

    expect(JSON.stringify(plan)).toBe(planSnapshot);
    expect(JSON.stringify(graph)).toBe(graphSnapshot);
  });

  it("11. Generic non-event planning plan functions correctly without event-specific assumptions", () => {
    // Construct a generic CI/CD deployment plan
    const genericTasks: Task[] = [
      {
        id: "BUILD",
        title: "Build container image",
        cost: 50,
        durationHours: 2,
        priority: 5,
        policy: "fixed",
        status: "planned",
        inputs: {},
        outputs: { imageTag: "v1.2.3" },
      },
      {
        id: "TEST",
        title: "Run automated tests",
        cost: 100,
        durationHours: 4,
        priority: 4,
        policy: "replaceable",
        status: "planned",
        inputs: { imageTag: "v1.2.3" },
        outputs: { testsPassed: true },
        alternatives: ["fast-unit-tests"],
      },
      {
        id: "DEPLOY",
        title: "Deploy to cloud cluster",
        cost: 200,
        durationHours: 1,
        priority: 5,
        policy: "replaceable",
        status: "planned",
        inputs: { testsPassed: true },
        outputs: { deploymentLive: true },
        alternatives: ["canary-deploy"],
      },
      {
        id: "TELEMETRY",
        title: "Optional telemetry dashboard",
        cost: 150,
        durationHours: 2,
        priority: 2,
        policy: "optional",
        status: "planned",
        inputs: {},
        outputs: { dashboardLive: true },
      },
    ];

    const genericDeps: Dependency[] = [
      {
        id: "D_BUILD_TEST",
        fromTaskId: "BUILD",
        toTaskId: "TEST",
        blocksExecution: true,
        fieldMappings: [{ sourceField: "imageTag", targetInput: "imageTag", optional: false }],
        origin: "system_template",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
      {
        id: "D_TEST_DEPLOY",
        fromTaskId: "TEST",
        toTaskId: "DEPLOY",
        blocksExecution: true,
        fieldMappings: [{ sourceField: "testsPassed", targetInput: "testsPassed", optional: false }],
        origin: "system_template",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
    ];

    const genericPlan: Plan = PlanSchema.parse({
      schemaVersion: "1.0.0",
      id: "cloud-ci-pipeline",
      name: "Cloud CI Pipeline",
      planRevision: 1,
      constraints: {
        budgetLimit: 400,
        currency: "USD",
        deadlineHours: 10,
      },
      tasks: genericTasks,
      dependencies: genericDeps,
      demoAlternatives: {
        tests: [
          {
            id: "fast-unit-tests",
            name: "Fast Unit Tests Only",
            cost: 40,
            durationHours: 1,
            testsPassed: true,
          },
        ],
        deployments: [
          {
            id: "canary-deploy",
            name: "Canary Rollout",
            cost: 180,
            durationHours: 2,
            deploymentLive: true,
          },
        ],
      },
    });

    const genericGraph = rebuildGraph(genericPlan);

    // Test resource unavailability on TEST
    const res = generateCandidates({
      baselinePlan: genericPlan,
      baselineGraph: genericGraph,
      disruption: {
        type: "task_unavailable",
        targetTaskId: "TEST",
      },
    });

    expect(res.success).toBe(true);
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].id).toBe("cand-alt-TEST-fast-unit-tests");
    expect(res.candidates[0].taskOverrides["TEST"]?.cost).toBe(40);
    expect(res.candidates[0].taskOverrides["TEST"]?.durationHours).toBe(1);

    // Test budget reduction on generic plan
    const budgetRes = generateCandidates({
      baselinePlan: genericPlan,
      baselineGraph: genericGraph,
      disruption: {
        type: "budget_reduction",
        newValue: 300, // Total cost is 50 + 100 + 200 + 150 = 500
      },
    });

    expect(budgetRes.success).toBe(true);
    // Should include removal of optional TELEMETRY task and fast-unit-tests
    const budgetIds = budgetRes.candidates.map((c) => c.id);
    expect(budgetIds).toContain("cand-budget-remove-TELEMETRY");
    expect(budgetIds).toContain("cand-budget-TEST-fast-unit-tests");
  });

  it("12. Compatible with all three canonical scenario fixtures", () => {
    const { plan, scenariosDoc, graph } = loadCanonicalFixtures();

    for (const scenario of scenariosDoc.scenarios) {
      const res = generateCandidates({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: scenario.disruption,
        canonicalPatches: scenario.candidatePatches,
        constraintOverrides: scenario.constraintOverrides,
      });

      expect(res.success).toBe(true);
      expect(res.blockingIssues).toHaveLength(0);

      // Verify that all canonical scenario candidate patches are present
      for (const expectedPatch of scenario.candidatePatches) {
        const found = res.candidates.find((c) => c.id === expectedPatch.id);
        expect(found).toBeDefined();
        expect(found!.label).toBe(expectedPatch.label);
        expect(found!.changedTaskIds).toEqual(expectedPatch.changedTaskIds);
        expect(found!.removedTaskIds).toEqual(expectedPatch.removedTaskIds);
      }
    }
  });
});
