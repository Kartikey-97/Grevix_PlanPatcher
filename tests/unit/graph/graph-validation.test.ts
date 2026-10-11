import { describe, it, expect } from "vitest";
import { validateExplainableGraph } from "../../../src/lib/graph/validate-explainable";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S2: Explainable Graph Validation", () => {
  it("validates canonical baseline plan as 100% valid with 0 errors and 0 cycles", () => {
    const result = validateExplainableGraph(canonicalPlan);
    expect(result.isValid).toBe(true);
    expect(result.hasCycles).toBe(false);
    expect(result.missingTaskReferences).toHaveLength(0);
    expect(result.invalidFieldMappings).toHaveLength(0);
    expect(result.hasUnreviewedDependencies).toBe(false);
    expect(result.confirmedDependencyIds).toHaveLength(27);
  });

  describe("Structural Validation Failures", () => {
    it("detects missing task endpoint references", () => {
      const brokenPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      brokenPlan.dependencies.push({
        id: "D-broken",
        fromTaskId: "T01",
        toTaskId: "T_NON_EXISTENT",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Broken test edge",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateExplainableGraph(brokenPlan);
      expect(result.isValid).toBe(false);
      expect(result.missingTaskReferences).toContain("T_NON_EXISTENT");
      expect(result.issues.some((i) => i.code === "MISSING_TASK_ENDPOINT")).toBe(true);
    });

    it("detects self-loops", () => {
      const loopPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      loopPlan.dependencies.push({
        id: "D-loop",
        fromTaskId: "T02",
        toTaskId: "T02",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Invalid self-loop",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateExplainableGraph(loopPlan);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "SELF_LOOP")).toBe(true);
    });

    it("detects directed cycles (Kahn's algorithm cycle check)", () => {
      const cyclicPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // T15 is downstream of T01; adding T15 -> T01 creates a directed cycle
      cyclicPlan.dependencies.push({
        id: "D-cycle",
        fromTaskId: "T15",
        toTaskId: "T01",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Creates feedback cycle",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateExplainableGraph(cyclicPlan);
      expect(result.isValid).toBe(false);
      expect(result.hasCycles).toBe(true);
      expect(result.cycleNodes).toBeDefined();
      expect(result.cycleNodes).toContain("T01");
      expect(result.cycleNodes).toContain("T15");
      expect(result.issues.some((i) => i.code === "DIRECTED_CYCLE")).toBe(true);
    });

    it("accurately isolates actual cycle members from downstream blocked tasks using Tarjan SCC", () => {
      const cyclePlan: Plan = {
        schemaVersion: "1.0.0",
        id: "cycle-scc-demo",
        name: "Cycle SCC Demo",
        planRevision: 1,
        constraints: { currency: "INR" },
        scoring: {
          changeFootprintDenominator: "originalTaskCount",
          lostTaskValueDenominator: "sumOfOriginalTaskPriorities",
          uncertaintyFactCount: 5,
          scheduleShiftReferenceHours: 8,
          deadlineSlackReferenceHours: 24,
        },
        tasks: [
          { id: "C1", title: "Cycle 1", cost: 0, durationHours: 1, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
          { id: "C2", title: "Cycle 2", cost: 0, durationHours: 1, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
          { id: "BLOCKED", title: "Blocked Downstream", cost: 0, durationHours: 1, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
          { id: "OK", title: "Independent OK", cost: 0, durationHours: 1, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
        ],
        dependencies: [
          // Directed cycle between C1 and C2
          { id: "D-C1-C2", fromTaskId: "C1", toTaskId: "C2", blocksExecution: true, fieldMappings: [], reason: "C1 -> C2", origin: "manual", confirmationStatus: "confirmed", modificationHistory: [] },
          { id: "D-C2-C1", fromTaskId: "C2", toTaskId: "C1", blocksExecution: true, fieldMappings: [], reason: "C2 -> C1", origin: "manual", confirmationStatus: "confirmed", modificationHistory: [] },
          // Downstream task BLOCKED depends on C2 (blocked by cycle, but not in cycle)
          { id: "D-C2-BLOCKED", fromTaskId: "C2", toTaskId: "BLOCKED", blocksExecution: true, fieldMappings: [], reason: "C2 -> BLOCKED", origin: "manual", confirmationStatus: "confirmed", modificationHistory: [] },
        ],
      };

      const result = validateExplainableGraph(cyclePlan);
      expect(result.isValid).toBe(false);
      expect(result.hasCycles).toBe(true);
      // cycleNodes contains ONLY true cycle members
      expect(result.cycleNodes).toEqual(["C1", "C2"]);
      // blockedByCycleNodes contains downstream blocked task
      expect(result.blockedByCycleNodes).toEqual(["BLOCKED"]);
      // Issues list contains both codes with appropriate entity targeting
      expect(result.issues.some((i) => i.code === "DIRECTED_CYCLE")).toBe(true);
      expect(result.issues.some((i) => i.code === "BLOCKED_BY_CYCLE")).toBe(true);
      const blockedIssue = result.issues.find((i) => i.code === "BLOCKED_BY_CYCLE");
      expect(blockedIssue?.affectedEntityIds).toEqual(["BLOCKED"]);
    });

    it("detects duplicate task IDs", () => {
      const dupTaskPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      dupTaskPlan.tasks.push({
        ...dupTaskPlan.tasks[0],
      });

      const result = validateExplainableGraph(dupTaskPlan);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "DUPLICATE_TASK_ID")).toBe(true);
    });

    it("detects duplicate edge IDs", () => {
      const dupEdgePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      dupEdgePlan.dependencies.push({
        ...dupEdgePlan.dependencies[0],
      });

      const result = validateExplainableGraph(dupEdgePlan);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "DUPLICATE_EDGE_ID")).toBe(true);
    });
  });

  describe("Field Mapping Validation", () => {
    it("detects invalid source output field mapping", () => {
      const badSourcePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // D01 maps from T01 to T02. T01 outputs are goalApproved and targetAudience.
      badSourcePlan.dependencies[0].fieldMappings.push({
        sourceField: "nonExistentOutput",
        targetInput: "goalApproved",
        optional: false,
      });

      const result = validateExplainableGraph(badSourcePlan);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "INVALID_FIELD_MAPPING_SOURCE")).toBe(true);
      expect(result.invalidFieldMappings.length).toBeGreaterThan(0);
    });

    it("detects invalid target input field mapping", () => {
      const badTargetPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      badTargetPlan.dependencies[0].fieldMappings.push({
        sourceField: "goalApproved",
        targetInput: "",
        optional: false,
      });

      const result = validateExplainableGraph(badTargetPlan);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "INVALID_FIELD_MAPPING_TARGET")).toBe(true);
      expect(result.invalidFieldMappings.length).toBeGreaterThan(0);
    });

    it("rejects a missing required target input when optional is false", () => {
      const badTargetPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // D01 connects T01 -> T02. T02 inputs are goalApproved and targetAudience.
      badTargetPlan.dependencies[0].fieldMappings.push({
        sourceField: "goalApproved",
        targetInput: "nonExistentInputOnT02",
        optional: false,
      });

      const result = validateExplainableGraph(badTargetPlan);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "NONEXISTENT_TARGET_INPUT")).toBe(true);
      const errorIssue = result.issues.find((i) => i.code === "NONEXISTENT_TARGET_INPUT");
      expect(errorIssue?.severity).toBe("error");
      expect(result.invalidFieldMappings.some((m) => m.includes("nonExistentInputOnT02"))).toBe(true);
    });

    it("handles an explicitly optional mapping according to declared semantics (info issue, graph remains valid)", () => {
      const optionalPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // Add an explicitly optional mapping to an undeclared target input
      optionalPlan.dependencies[0].fieldMappings.push({
        sourceField: "goalApproved",
        targetInput: "optionalContextNote",
        optional: true,
      });

      const result = validateExplainableGraph(optionalPlan);
      expect(result.isValid).toBe(true);
      expect(result.issues.some((i) => i.code === "OPTIONAL_MAPPING_NOT_DECLARED")).toBe(true);
      const infoIssue = result.issues.find((i) => i.code === "OPTIONAL_MAPPING_NOT_DECLARED");
      expect(infoIssue?.severity).toBe("info");
      expect(result.invalidFieldMappings).toHaveLength(0);
    });

    it("evaluates equivalent mappings identically regardless of dependency ID (no ID-specific special casing)", () => {
      const createPlanWithEdge = (depId: string, optional: boolean): Plan => {
        const base: Plan = JSON.parse(JSON.stringify(canonicalPlan));
        base.dependencies.push({
          id: depId,
          fromTaskId: "T01",
          toTaskId: "T02",
          blocksExecution: false,
          fieldMappings: [
            {
              sourceField: "goalApproved",
              targetInput: "undeclaredInputForEquivalenceTest",
              optional,
            },
          ],
          reason: "Equivalence test edge",
          origin: "manual",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        });
        return base;
      };

      // When optional = true, arbitrary IDs and D14-style IDs both pass as info
      const resCustomOpt = validateExplainableGraph(createPlanWithEdge("D-custom-alpha", true));
      const resD14StyleOpt = validateExplainableGraph(createPlanWithEdge("D14-clone", true));
      expect(resCustomOpt.isValid).toBe(true);
      expect(resD14StyleOpt.isValid).toBe(true);
      expect(resCustomOpt.issues.find((i) => i.code === "OPTIONAL_MAPPING_NOT_DECLARED")?.severity).toBe("info");
      expect(resD14StyleOpt.issues.find((i) => i.code === "OPTIONAL_MAPPING_NOT_DECLARED")?.severity).toBe("info");

      // When optional = false, arbitrary IDs and D14-style IDs both fail as errors
      const resCustomReq = validateExplainableGraph(createPlanWithEdge("D-custom-alpha", false));
      const resD14StyleReq = validateExplainableGraph(createPlanWithEdge("D14-clone", false));
      expect(resCustomReq.isValid).toBe(false);
      expect(resD14StyleReq.isValid).toBe(false);
      expect(resCustomReq.issues.find((i) => i.code === "NONEXISTENT_TARGET_INPUT")?.severity).toBe("error");
      expect(resD14StyleReq.issues.find((i) => i.code === "NONEXISTENT_TARGET_INPUT")?.severity).toBe("error");
    });
  });

  describe("Parallel & Independent Tasks", () => {
    it("validates independent parallel branches cleanly without false cycle alarms", () => {
      const parallelPlan: Plan = {
        schemaVersion: "1.0.0",
        id: "parallel-demo",
        name: "Parallel Demo",
        planRevision: 1,
        constraints: { currency: "INR" },
        scoring: {
          changeFootprintDenominator: "originalTaskCount",
          lostTaskValueDenominator: "sumOfOriginalTaskPriorities",
          uncertaintyFactCount: 5,
          scheduleShiftReferenceHours: 8,
          deadlineSlackReferenceHours: 24,
        },
        tasks: [
          { id: "A", title: "Task A", cost: 0, durationHours: 1, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
          { id: "B1", title: "Branch 1", cost: 0, durationHours: 2, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
          { id: "B2", title: "Branch 2", cost: 0, durationHours: 3, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
          { id: "C", title: "Join C", cost: 0, durationHours: 1, priority: 3, policy: "fixed", status: "planned", inputs: {}, outputs: {} },
        ],
        dependencies: [
          { id: "D-A-B1", fromTaskId: "A", toTaskId: "B1", blocksExecution: true, fieldMappings: [], reason: "A -> B1", origin: "manual", confirmationStatus: "confirmed", modificationHistory: [] },
          { id: "D-A-B2", fromTaskId: "A", toTaskId: "B2", blocksExecution: true, fieldMappings: [], reason: "A -> B2", origin: "manual", confirmationStatus: "confirmed", modificationHistory: [] },
          { id: "D-B1-C", fromTaskId: "B1", toTaskId: "C", blocksExecution: true, fieldMappings: [], reason: "B1 -> C", origin: "manual", confirmationStatus: "confirmed", modificationHistory: [] },
          { id: "D-B2-C", fromTaskId: "B2", toTaskId: "C", blocksExecution: true, fieldMappings: [], reason: "B2 -> C", origin: "manual", confirmationStatus: "confirmed", modificationHistory: [] },
        ],
      };

      const result = validateExplainableGraph(parallelPlan);
      expect(result.isValid).toBe(true);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("Trust & Confirmation Status Classification", () => {
    it("classifies unreviewed edge as warning without causing structural invalidity", () => {
      const unreviewedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      unreviewedPlan.dependencies[0].confirmationStatus = "unreviewed";

      const result = validateExplainableGraph(unreviewedPlan);
      // Unreviewed edge does NOT make the graph structurally invalid (isValid remains true)
      expect(result.isValid).toBe(true);
      expect(result.hasUnreviewedDependencies).toBe(true);
      expect(result.unreviewedDependencyIds).toContain(unreviewedPlan.dependencies[0].id);
      expect(result.issues.some((i) => i.code === "UNREVIEWED_DEPENDENCY")).toBe(true);
    });

    it("classifies provisional edge as info item", () => {
      const provisionalPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      provisionalPlan.dependencies[0].confirmationStatus = "provisional";

      const result = validateExplainableGraph(provisionalPlan);
      expect(result.isValid).toBe(true);
      expect(result.provisionalDependencyIds).toContain(provisionalPlan.dependencies[0].id);
      expect(result.issues.some((i) => i.code === "PROVISIONAL_DEPENDENCY")).toBe(true);
    });
  });

  describe("Duplicate and Parallel Relationship Policy", () => {
    it("preserves multiple distinct edges between same tasks with distinct field mappings", () => {
      const parallelEdgePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // T01 -> T02 already has D01. Add secondaryAudience input to T02 and add D01-aux with distinct mappings
      const t02 = parallelEdgePlan.tasks.find((t) => t.id === "T02")!;
      t02.inputs = { ...t02.inputs, secondaryAudience: "students" };

      parallelEdgePlan.dependencies.push({
        id: "D01-aux",
        fromTaskId: "T01",
        toTaskId: "T02",
        blocksExecution: false,
        fieldMappings: [
          { sourceField: "targetAudience", targetInput: "secondaryAudience", optional: false },
        ],
        reason: "Secondary non-blocking data feed",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateExplainableGraph(parallelEdgePlan);
      expect(result.isValid).toBe(true);
      expect(result.issues.some((i) => i.code === "DISTINCT_PARALLEL_RELATIONSHIP")).toBe(true);
      const infoIssue = result.issues.find((i) => i.code === "DISTINCT_PARALLEL_RELATIONSHIP");
      expect(infoIssue?.severity).toBe("info");
      expect(infoIssue?.affectedEntityIds).toContain("D01");
      expect(infoIssue?.affectedEntityIds).toContain("D01-aux");
    });

    it("rejects exact duplicate relationship records between the same tasks", () => {
      const dupEdgePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const orig = dupEdgePlan.dependencies[0]; // D01: T01 -> T02
      // Push an edge with a different ID but identical endpoint, blocking semantics, and field mappings
      dupEdgePlan.dependencies.push({
        id: "D01-clone",
        fromTaskId: orig.fromTaskId,
        toTaskId: orig.toTaskId,
        blocksExecution: orig.blocksExecution,
        fieldMappings: JSON.parse(JSON.stringify(orig.fieldMappings)),
        reason: "Clone of D01",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateExplainableGraph(dupEdgePlan);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "EXACT_DUPLICATE_RELATIONSHIP")).toBe(true);
      const dupIssue = result.issues.find((i) => i.code === "EXACT_DUPLICATE_RELATIONSHIP");
      expect(dupIssue?.severity).toBe("error");
      expect(dupIssue?.affectedEntityIds).toContain("D01");
      expect(dupIssue?.affectedEntityIds).toContain("D01-clone");
    });
  });
});

