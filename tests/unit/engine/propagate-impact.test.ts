import { describe, it, expect } from "vitest";
import {
  propagateImpact,
  type ImpactPropagationInput,
} from "../../../src/lib/engine/propagate-impact";
import { validateConstraints } from "../../../src/lib/engine/validate-constraints";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan, Task, Dependency } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S5B: Disruption Impact Propagation & Constraint Checking", () => {
  // Helper to create a minimal valid plan
  function createTestPlan(overrides?: Partial<Plan>): Plan {
    return {
      schemaVersion: "1.0.0",
      id: "test-plan",
      name: "Test Generic Plan",
      planRevision: 1,
      constraints: {
        budgetLimit: 10000,
        currency: "INR",
        deadlineHours: 100,
      },
      scoring: {
        changeFootprintDenominator: "originalTaskCount",
        lostTaskValueDenominator: "sumOfOriginalTaskPriorities",
        uncertaintyFactCount: 5,
        scheduleShiftReferenceHours: 8,
        deadlineSlackReferenceHours: 24,
      },
      tasks: [
        {
          id: "T_Venue",
          title: "Book Venue",
          cost: 3000,
          durationHours: 10,
          priority: 5,
          policy: "replaceable",
          status: "confirmed",
          inputs: {},
          outputs: {
            capacity: 500,
            address: "Main Hall, North Campus",
          },
        },
        {
          id: "T_Seating",
          title: "Seating Plan",
          cost: 1000,
          durationHours: 5,
          priority: 4,
          policy: "replaceable",
          status: "confirmed",
          inputs: {
            venueCapacity: 500,
          },
          outputs: {
            layout: "banquet",
          },
        },
        {
          id: "T_Directions",
          title: "Campus Directions",
          cost: 500,
          durationHours: 4,
          priority: 3,
          policy: "replaceable",
          status: "confirmed",
          inputs: {
            venueAddress: "Main Hall, North Campus",
          },
          outputs: {
            publishedRoute: "North Gate Entrance",
          },
        },
        {
          id: "T_Unrelated",
          title: "Sponsorship Outreach",
          cost: 2000,
          durationHours: 12,
          priority: 4,
          policy: "replaceable",
          status: "confirmed",
          inputs: {},
          outputs: {
            sponsorCount: 3,
          },
        },
      ],
      dependencies: [
        {
          id: "D_Venue_Seating",
          fromTaskId: "T_Venue",
          toTaskId: "T_Seating",
          blocksExecution: true,
          fieldMappings: [
            { sourceField: "capacity", targetInput: "venueCapacity", optional: false },
          ],
          reason: "Seating arrangement depends on venue capacity.",
          origin: "manual",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        },
        {
          id: "D_Venue_Directions",
          fromTaskId: "T_Venue",
          toTaskId: "T_Directions",
          blocksExecution: true,
          fieldMappings: [
            { sourceField: "address", targetInput: "venueAddress", optional: false },
          ],
          reason: "Directions depend on venue address.",
          origin: "manual",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        },
      ],
      ...overrides,
    };
  }

  describe("1. Field-Aware Data Propagation", () => {
    it("capacity-only change affects only consumers of capacity and not directions", () => {
      const basePlan = createTestPlan();
      const baseGraph = rebuildGraph(basePlan);

      // Candidate changes only capacity from 500 to 300, leaving address unchanged
      const candidatePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      const venueTask = candidatePlan.tasks.find((t) => t.id === "T_Venue")!;
      venueTask.outputs = {
        capacity: 300,
        address: "Main Hall, North Campus", // unchanged
      };

      const result = propagateImpact({
        baselinePlan: basePlan,
        baselineGraph: baseGraph,
        candidatePlan,
      });

      expect(result.success).toBe(true);
      expect(result.directlyChangedTaskIds).toContain("T_Venue");

      // T_Seating consumes capacity: must be affected
      expect(result.inputAffectedTaskIds).toContain("T_Seating");
      const seatingImpact = result.impacts.find(
        (i) => i.taskId === "T_Seating" && i.category === "input_fields_affected"
      );
      expect(seatingImpact).toBeDefined();
      expect(seatingImpact?.affectedFields).toContain("venueCapacity");

      // T_Directions consumes address: must NOT be in inputAffectedTaskIds!
      expect(result.inputAffectedTaskIds).not.toContain("T_Directions");
    });

    it("address-only change affects directions but not seating tasks", () => {
      const basePlan = createTestPlan();
      const baseGraph = rebuildGraph(basePlan);

      // Candidate changes only address, leaving capacity unchanged
      const candidatePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      const venueTask = candidatePlan.tasks.find((t) => t.id === "T_Venue")!;
      venueTask.outputs = {
        capacity: 500, // unchanged
        address: "Auditorium West, South Campus", // changed
      };

      const result = propagateImpact({
        baselinePlan: basePlan,
        baselineGraph: baseGraph,
        candidatePlan,
      });

      expect(result.success).toBe(true);
      expect(result.directlyChangedTaskIds).toContain("T_Venue");

      // T_Directions consumes address: must be affected
      expect(result.inputAffectedTaskIds).toContain("T_Directions");
      const directionsImpact = result.impacts.find(
        (i) => i.taskId === "T_Directions" && i.category === "input_fields_affected"
      );
      expect(directionsImpact).toBeDefined();
      expect(directionsImpact?.affectedFields).toContain("venueAddress");

      // T_Seating consumes capacity: must NOT be in inputAffectedTaskIds!
      expect(result.inputAffectedTaskIds).not.toContain("T_Seating");
    });
  });

  describe("2. Schedule vs Task Record Decoupling", () => {
    it("task-duration change updates schedule timing without modifying downstream task records", () => {
      const basePlan = createTestPlan();
      const baseGraph = rebuildGraph(basePlan);

      // Increase venue duration from 10 to 18 hours (no data fields changed)
      const candidatePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      candidatePlan.tasks.find((t) => t.id === "T_Venue")!.durationHours = 18;

      const result = propagateImpact({
        baselinePlan: basePlan,
        baselineGraph: baseGraph,
        candidatePlan,
      });

      expect(result.success).toBe(true);
      expect(result.directlyChangedTaskIds).toEqual(["T_Venue"]);

      // Downstream tasks T_Seating and T_Directions have shifted schedules (start shifted from 10h to 18h)
      expect(result.schedulingAffectedTaskIds).toContain("T_Seating");
      expect(result.schedulingAffectedTaskIds).toContain("T_Directions");

      // But neither is in directlyChangedTaskIds or inputAffectedTaskIds!
      expect(result.directlyChangedTaskIds).not.toContain("T_Seating");
      expect(result.directlyChangedTaskIds).not.toContain("T_Directions");
      expect(result.inputAffectedTaskIds).not.toContain("T_Seating");
      expect(result.inputAffectedTaskIds).not.toContain("T_Directions");

      // Verify schedule values directly
      expect(result.candidateSchedule?.tasks["T_Seating"].earliestStart).toBe(18);
      expect(result.baselineSchedule?.tasks["T_Seating"].earliestStart).toBe(10);
    });

    it("non-blocking field relationships do not impose scheduling precedence", () => {
      const plan = createTestPlan();
      // Make dependency non-blocking
      plan.dependencies[0].blocksExecution = false;
      const graph = rebuildGraph(plan);

      const result = propagateImpact({
        baselinePlan: plan,
        baselineGraph: graph,
      });

      expect(result.success).toBe(true);
      // T_Seating starts at 0 hours despite depending on T_Venue for data!
      expect(result.baselineSchedule?.tasks["T_Seating"].earliestStart).toBe(0);
      expect(result.baselineSchedule?.tasks["T_Venue"].earliestStart).toBe(0);
    });
  });

  describe("3. Input-to-Output Dependency Metadata", () => {
    it("produces a review requirement instead of invented propagation when outputDependencies is missing", () => {
      const basePlan = createTestPlan({
        tasks: [
          {
            id: "T_Source",
            title: "Source Data",
            cost: 1000,
            durationHours: 5,
            priority: 3,
            policy: "replaceable",
            status: "confirmed",
            inputs: {},
            outputs: { rawData: "v1" },
          },
          {
            id: "T_Middle",
            title: "Middle Processing",
            cost: 1000,
            durationHours: 5,
            priority: 3,
            policy: "replaceable",
            status: "confirmed",
            inputs: { rawInput: "v1" },
            outputs: { processedData: "out1" },
            // NO outputDependencies declared!
          },
          {
            id: "T_Final",
            title: "Final Output Consumer",
            cost: 1000,
            durationHours: 5,
            priority: 3,
            policy: "replaceable",
            status: "confirmed",
            inputs: { finalInput: "out1" },
            outputs: {},
          },
        ],
        dependencies: [
          {
            id: "D1",
            fromTaskId: "T_Source",
            toTaskId: "T_Middle",
            blocksExecution: true,
            fieldMappings: [{ sourceField: "rawData", targetInput: "rawInput", optional: false }],
            reason: "Source to Middle",
            origin: "manual",
            confirmationStatus: "confirmed",
            modificationHistory: [],
          },
          {
            id: "D2",
            fromTaskId: "T_Middle",
            toTaskId: "T_Final",
            blocksExecution: true,
            fieldMappings: [{ sourceField: "processedData", targetInput: "finalInput", optional: false }],
            reason: "Middle to Final",
            origin: "manual",
            confirmationStatus: "confirmed",
            modificationHistory: [],
          },
        ],
      });
      const baseGraph = rebuildGraph(basePlan);

      // Upstream changes rawData
      const candidatePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      candidatePlan.tasks.find((t) => t.id === "T_Source")!.outputs = { rawData: "v2" };

      const result = propagateImpact({
        baselinePlan: basePlan,
        baselineGraph: baseGraph,
        candidatePlan,
      });

      expect(result.success).toBe(true);
      expect(result.inputAffectedTaskIds).toContain("T_Middle");

      // T_Middle is marked for review because its output dependencies are undeclared
      expect(result.reviewTaskIds).toContain("T_Middle");
      const middleReview = result.impacts.find(
        (i) => i.taskId === "T_Middle" && i.category === "requires_review"
      );
      expect(middleReview).toBeDefined();
      expect(middleReview?.reason).toContain("no explicit outputDependencies");

      // T_Final is NOT in inputAffectedTaskIds (no invented propagation)
      expect(result.inputAffectedTaskIds).not.toContain("T_Final");
    });

    it("propagates changes through multiple tasks when input-to-output relationships are declared", () => {
      const basePlan = createTestPlan({
        tasks: [
          {
            id: "T_Source",
            title: "Source Data",
            cost: 1000,
            durationHours: 5,
            priority: 3,
            policy: "replaceable",
            status: "confirmed",
            inputs: {},
            outputs: { rawData: "v1" },
          },
          {
            id: "T_Middle",
            title: "Middle Processing",
            cost: 1000,
            durationHours: 5,
            priority: 3,
            policy: "replaceable",
            status: "confirmed",
            inputs: { rawInput: "v1" },
            outputs: { processedData: "out1" },
            // Explicit outputDependencies declared:
            outputDependencies: {
              processedData: ["rawInput"],
            },
          },
          {
            id: "T_Final",
            title: "Final Output Consumer",
            cost: 1000,
            durationHours: 5,
            priority: 3,
            policy: "replaceable",
            status: "confirmed",
            inputs: { finalInput: "out1" },
            outputs: {},
          },
        ],
        dependencies: [
          {
            id: "D1",
            fromTaskId: "T_Source",
            toTaskId: "T_Middle",
            blocksExecution: true,
            fieldMappings: [{ sourceField: "rawData", targetInput: "rawInput", optional: false }],
            reason: "Source to Middle",
            origin: "manual",
            confirmationStatus: "confirmed",
            modificationHistory: [],
          },
          {
            id: "D2",
            fromTaskId: "T_Middle",
            toTaskId: "T_Final",
            blocksExecution: true,
            fieldMappings: [{ sourceField: "processedData", targetInput: "finalInput", optional: false }],
            reason: "Middle to Final",
            origin: "manual",
            confirmationStatus: "confirmed",
            modificationHistory: [],
          },
        ],
      });
      const baseGraph = rebuildGraph(basePlan);

      // Upstream changes rawData
      const candidatePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      candidatePlan.tasks.find((t) => t.id === "T_Source")!.outputs = { rawData: "v2" };

      const result = propagateImpact({
        baselinePlan: basePlan,
        baselineGraph: baseGraph,
        candidatePlan,
      });

      expect(result.success).toBe(true);
      expect(result.inputAffectedTaskIds).toContain("T_Middle");
      // Because outputDependencies declared that processedData depends on rawInput,
      // T_Final is now also reached via field-aware propagation!
      expect(result.inputAffectedTaskIds).toContain("T_Final");
      const finalImpact = result.impacts.find(
        (i) => i.taskId === "T_Final" && i.category === "input_fields_affected"
      );
      expect(finalImpact).toBeDefined();
      expect(finalImpact?.propagationPath).toEqual(["T_Source", "T_Middle", "T_Final"]);
    });

    it("verifies that an unrelated task is preserved and reported as unaffected", () => {
      const basePlan = createTestPlan();
      const baseGraph = rebuildGraph(basePlan);

      const candidatePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      candidatePlan.tasks.find((t) => t.id === "T_Venue")!.outputs = {
        capacity: 250,
        address: "Main Hall, North Campus",
      };

      const result = propagateImpact({
        baselinePlan: basePlan,
        baselineGraph: baseGraph,
        candidatePlan,
      });

      expect(result.success).toBe(true);
      expect(result.unaffectedTaskIds).toContain("T_Unrelated");
      const unrelatedImpact = result.impacts.find(
        (i) => i.taskId === "T_Unrelated" && i.category === "unaffected"
      );
      expect(unrelatedImpact).toBeDefined();
    });
  });

  describe("4. Constraint Validation Rules", () => {
    it("handles budget omission, zero budget, and budget violations correctly", () => {
      const plan = createTestPlan();

      // 1. Omitted budgetLimit disables the budget check
      const omittedBudgetPlan: Plan = JSON.parse(JSON.stringify(plan));
      delete omittedBudgetPlan.constraints.budgetLimit;
      const res1 = validateConstraints({ candidatePlan: omittedBudgetPlan });
      expect(res1.budgetPass).toBe(true);
      expect(res1.metrics.budgetLimit).toBeUndefined();

      // 2. Zero budget permits only zero-cost plans
      const zeroBudgetPlan: Plan = JSON.parse(JSON.stringify(plan));
      zeroBudgetPlan.constraints.budgetLimit = 0;
      const res2 = validateConstraints({ candidatePlan: zeroBudgetPlan });
      expect(res2.budgetPass).toBe(false); // plan costs 6500 > 0
      expect(res2.issues.some((i) => i.code === "BUDGET_EXCEEDED")).toBe(true);

      // Zero-cost plan passes zero budget
      zeroBudgetPlan.tasks.forEach((t) => (t.cost = 0));
      const res2ZeroCost = validateConstraints({ candidatePlan: zeroBudgetPlan });
      expect(res2ZeroCost.budgetPass).toBe(true);

      // 3. Normal budget exceeded
      const normalPlan: Plan = JSON.parse(JSON.stringify(plan));
      normalPlan.constraints.budgetLimit = 5000;
      // Plan total cost = 3000 + 1000 + 500 + 2000 = 6500 > 5000
      const res3 = validateConstraints({ candidatePlan: normalPlan });
      expect(res3.budgetPass).toBe(false);
      expect(res3.issues.some((i) => i.code === "BUDGET_EXCEEDED")).toBe(true);
    });

    it("detects deadline violations using the actual schedule calculation", () => {
      const plan = createTestPlan();
      // In createTestPlan, T_Venue (10h) -> T_Seating (5h), T_Unrelated (12h)
      // Longest path is 15h.
      plan.constraints.deadlineHours = 12; // Infeasible (15h > 12h)

      const res = validateConstraints({ candidatePlan: plan });
      expect(res.deadlinePass).toBe(false);
      expect(res.metrics.projectFinishHours).toBe(15);
      expect(res.metrics.deadlineHours).toBe(12);
      expect(res.issues.some((i) => i.code === "DEADLINE_EXCEEDED")).toBe(true);
    });

    it("identifies fixed-task modifications and removals relative to accepted baseline", () => {
      const basePlan = createTestPlan();
      // Set T_Unrelated as a fixed task
      basePlan.tasks.find((t) => t.id === "T_Unrelated")!.policy = "fixed";

      // 1. Candidate removes fixed task
      const removedPlan: Plan = JSON.parse(JSON.stringify(basePlan));
      removedPlan.tasks = removedPlan.tasks.filter((t) => t.id !== "T_Unrelated");
      const res1 = validateConstraints({ baselinePlan: basePlan, candidatePlan: removedPlan });
      expect(res1.fixedTasksPreserved).toBe(false);
      expect(res1.issues.some((i) => i.code === "FIXED_TASK_REMOVED")).toBe(true);

      // 2. Candidate modifies fixed task duration or cost
      const modifiedPlan: Plan = JSON.parse(JSON.stringify(basePlan));
      modifiedPlan.tasks.find((t) => t.id === "T_Unrelated")!.durationHours = 99;
      const res2 = validateConstraints({ baselinePlan: basePlan, candidatePlan: modifiedPlan });
      expect(res2.fixedTasksPreserved).toBe(false);
      expect(res2.issues.some((i) => i.code === "FIXED_TASK_MODIFIED")).toBe(true);

      // 3. Candidate preserves fixed task intact
      const intactPlan: Plan = JSON.parse(JSON.stringify(basePlan));
      const res3 = validateConstraints({ baselinePlan: basePlan, candidatePlan: intactPlan });
      expect(res3.fixedTasksPreserved).toBe(true);
    });
  });

  describe("5. Synchronization Safety & Determinism", () => {
    it("blocks impact analysis when graph is structurally stale, conflicted, or invalid", () => {
      const basePlan = createTestPlan();
      const baseGraph = rebuildGraph(basePlan);

      // Stale graph: baseline plan duration modified without rebuilding baseline graph
      const stalePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      stalePlan.tasks[0].durationHours = 999;

      const staleResult = propagateImpact({
        baselinePlan: stalePlan,
        baselineGraph: baseGraph,
      });

      expect(staleResult.success).toBe(false);
      expect(staleResult.blockingIssues.some((i) => i.includes("structurally stale"))).toBe(true);
      expect(staleResult.impacts).toHaveLength(0);

      // Conflicted sync state blocks calculation
      const conflictResult = propagateImpact({
        baselinePlan: basePlan,
        baselineGraph: baseGraph,
        syncState: "conflict",
        activeConflicts: [
          {
            id: "c1",
            conflictType: "same_field_edit",
            entityType: "task",
            entityId: "T_Venue",
            fieldPath: "cost",
            baseValue: 3000,
            localValue: 3200,
            remoteValue: 3500,
            resolutionStatus: "unresolved",
          },
        ],
      });

      expect(conflictResult.success).toBe(false);
      expect(conflictResult.blockingIssues.some((i) => i.includes("unresolved merge conflict"))).toBe(true);
    });

    it("produces deterministic results on repeated analysis of the same plan and changes", () => {
      const basePlan = createTestPlan();
      const baseGraph = rebuildGraph(basePlan);

      const candidatePlan: Plan = JSON.parse(JSON.stringify(basePlan));
      candidatePlan.tasks[0].outputs = { capacity: 250, address: "New Campus" };

      const run1 = propagateImpact({ baselinePlan: basePlan, baselineGraph: baseGraph, candidatePlan });
      const run2 = propagateImpact({ baselinePlan: basePlan, baselineGraph: baseGraph, candidatePlan });

      expect(run1).toEqual(run2);
    });
  });

  describe("6. Canonical Campus Tech Fest Regression Coverage", () => {
    it("baseline plan passes all constraints cleanly", () => {
      const baseGraph = rebuildGraph(canonicalPlan);
      const res = validateConstraints({ candidatePlan: canonicalPlan });

      expect(res.isValid).toBe(true);
      expect(res.hardConstraintsPass).toBe(true);
      expect(res.budgetPass).toBe(true);
      expect(res.deadlinePass).toBe(true);
      expect(res.fixedTasksPreserved).toBe(true);
      expect(res.acyclic).toBe(true);
      expect(res.metrics.totalCost).toBe(18000);
      expect(res.metrics.budgetMargin).toBe(7000);
      expect(res.metrics.projectFinishHours).toBe(132.0);
      expect(res.metrics.deadlineSlackHours).toBe(156.0);

      const impactRes = propagateImpact({
        baselinePlan: canonicalPlan,
        baselineGraph: baseGraph,
      });

      expect(impactRes.success).toBe(true);
      // Untouched baseline has 0 directly changed tasks and 16 unaffected tasks
      expect(impactRes.directlyChangedTaskIds).toHaveLength(0);
      expect(impactRes.unaffectedTaskIds).toHaveLength(16);
    });
  });
});
