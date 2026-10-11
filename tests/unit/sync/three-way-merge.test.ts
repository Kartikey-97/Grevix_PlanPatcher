import { describe, it, expect } from "vitest";
import {
  threeWayMerge,
  resolveConflict,
  applyResolvedConflictsToPlan,
} from "../../../src/lib/sync/three-way-merge";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan, Task, Dependency } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S3: Three-Way Merge Algorithm", () => {
  it("merges non-conflicting edits to different fields successfully", () => {
    const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

    // Local changes T03 durationHours from 24 to 30
    localPlan.tasks.find((t) => t.id === "T03")!.durationHours = 30;
    // Remote changes T03 cost from 5000 to 4500
    remotePlan.tasks.find((t) => t.id === "T03")!.cost = 4500;

    const result = threeWayMerge(basePlan, localPlan, remotePlan);
    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);

    const mergedT03 = result.mergedPlan.tasks.find((t) => t.id === "T03");
    expect(mergedT03?.durationHours).toBe(30); // preserved from local
    expect(mergedT03?.cost).toBe(4500); // incorporated from remote
  });

  it("detects divergent edits to the same field and generates a conflict record", () => {
    const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

    // Both diverged on T03 durationHours: local = 28, remote = 36 (base was 24)
    localPlan.tasks.find((t) => t.id === "T03")!.durationHours = 28;
    remotePlan.tasks.find((t) => t.id === "T03")!.durationHours = 36;

    const result = threeWayMerge(basePlan, localPlan, remotePlan);
    expect(result.success).toBe(false);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);

    const conflict = result.conflicts[0];
    expect(conflict.conflictType).toBe("same_field_edit");
    expect(conflict.entityType).toBe("task");
    expect(conflict.entityId).toBe("T03");
    expect(conflict.fieldPath).toBe("durationHours");
    expect(conflict.baseValue).toBe(24);
    expect(conflict.localValue).toBe(28);
    expect(conflict.remoteValue).toBe(36);
    expect(conflict.resolutionStatus).toBe("unresolved");
  });

  describe("Symmetric Delete-versus-Modify Conflicts", () => {
    it("detects task_delete_modify (local deleted, remote modified)", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      // Local deletes T16 (sponsor booth)
      localPlan.tasks = localPlan.tasks.filter((t) => t.id !== "T16");
      // Remote substantively modifies T16 cost
      remotePlan.tasks.find((t) => t.id === "T16")!.cost = 999;

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.some((c) => c.conflictType === "task_delete_modify")).toBe(true);
      const conflict = result.conflicts.find((c) => c.conflictType === "task_delete_modify");
      expect(conflict?.entityId).toBe("T16");
      expect(conflict?.localValue).toBeNull();
      expect((conflict?.remoteValue as Task).cost).toBe(999);
    });

    it("detects task_modify_delete (local modified, remote deleted)", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      // Local modifies T16
      localPlan.tasks.find((t) => t.id === "T16")!.durationHours = 4;
      // Remote deletes T16
      remotePlan.tasks = remotePlan.tasks.filter((t) => t.id !== "T16");

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.some((c) => c.conflictType === "task_modify_delete")).toBe(true);
      const conflict = result.conflicts.find((c) => c.conflictType === "task_modify_delete");
      expect(conflict?.entityId).toBe("T16");
      expect(conflict?.remoteValue).toBeNull();
      expect((conflict?.localValue as Task).durationHours).toBe(4);
    });

    it("detects dependency_delete_modify (local deleted edge, remote modified edge)", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      // Local deletes D01
      localPlan.dependencies = localPlan.dependencies.filter((d) => d.id !== "D01");
      // Remote modifies D01 reason
      remotePlan.dependencies.find((d) => d.id === "D01")!.reason = "Modified remote reason";

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.some((c) => c.conflictType === "dependency_delete_modify")).toBe(true);
      const conflict = result.conflicts.find((c) => c.conflictType === "dependency_delete_modify");
      expect(conflict?.entityId).toBe("D01");
      expect(conflict?.localValue).toBeNull();
    });

    it("detects dependency_modify_delete (local modified edge, remote deleted edge)", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      // Local modifies D01
      localPlan.dependencies.find((d) => d.id === "D01")!.blocksExecution = false;
      // Remote deletes D01
      remotePlan.dependencies = remotePlan.dependencies.filter((d) => d.id !== "D01");

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.some((c) => c.conflictType === "dependency_modify_delete")).toBe(true);
      const conflict = result.conflicts.find((c) => c.conflictType === "dependency_modify_delete");
      expect(conflict?.entityId).toBe("D01");
      expect(conflict?.remoteValue).toBeNull();
    });
  });

  describe("Independent Nested Dictionary Edits", () => {
    it("merges two independent edits to different nested output fields without false conflict", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      // T01 outputs has: goalApproved: true, targetAudience: "students"
      // Local adds output "eventTagline": "Innovate Together"
      localPlan.tasks.find((t) => t.id === "T01")!.outputs = {
        ...localPlan.tasks.find((t) => t.id === "T01")!.outputs,
        eventTagline: "Innovate Together",
      };

      // Remote adds output "budgetTier": "standard"
      remotePlan.tasks.find((t) => t.id === "T01")!.outputs = {
        ...remotePlan.tasks.find((t) => t.id === "T01")!.outputs,
        budgetTier: "standard",
      };

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.success).toBe(true);
      expect(result.hasConflicts).toBe(false);

      const mergedT01Outputs = result.mergedPlan.tasks.find((t) => t.id === "T01")!.outputs as Record<string, unknown>;
      expect(mergedT01Outputs.eventTagline).toBe("Innovate Together");
      expect(mergedT01Outputs.budgetTier).toBe("standard");
      expect(mergedT01Outputs.goalApproved).toBe(true);
      expect(mergedT01Outputs.targetAudience).toBe("students");
    });
  });

  describe("Dependency Deduplication & Provenance Preservation", () => {
    it("does not produce duplicate edges when identical dependency is independently added in both", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      const newEdge: Dependency = {
        id: "D-CROSS",
        fromTaskId: "T01",
        toTaskId: "T08",
        blocksExecution: false,
        fieldMappings: [],
        reason: "Directions need high-level event context",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      };

      localPlan.dependencies.push(JSON.parse(JSON.stringify(newEdge)));
      remotePlan.dependencies.push(JSON.parse(JSON.stringify(newEdge)));

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.success).toBe(true);
      const matchingEdges = result.mergedPlan.dependencies.filter((d) => d.fromTaskId === "T01" && d.toTaskId === "T08");
      expect(matchingEdges).toHaveLength(1);
    });

    it("preserves legitimate parallel dependencies with separate mappings and distinct semantics", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      // Local adds non-blocking edge between T01 and T02 with distinct mapping
      const parallelEdge: Dependency = {
        id: "D01-PARALLEL",
        fromTaskId: "T01",
        toTaskId: "T02",
        blocksExecution: false,
        fieldMappings: [{ sourceField: "targetAudience", targetInput: "targetAudience", optional: true }],
        reason: "Non-blocking secondary feed",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      };
      localPlan.dependencies.push(parallelEdge);

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.success).toBe(true);

      const t01ToT02Edges = result.mergedPlan.dependencies.filter((d) => d.fromTaskId === "T01" && d.toTaskId === "T02");
      expect(t01ToT02Edges).toHaveLength(2); // D01 and D01-PARALLEL both preserved
    });

    it("preserves unreviewed and provisional edge provenance without silent promotion", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      // Local adds an AI-suggested unreviewed edge
      const unreviewedEdge: Dependency = {
        id: "D-AI-SUGGESTED",
        fromTaskId: "T09",
        toTaskId: "T11",
        blocksExecution: true,
        fieldMappings: [],
        reason: "AI suggested volunteers need brand assets",
        origin: "ai_suggested",
        confirmationStatus: "unreviewed",
        modificationHistory: [
          {
            timestamp: "2026-10-11T12:00:00Z",
            author: "gemini-suggester",
            action: "created",
            notes: "Proposed coordination dependency",
          },
        ],
      };
      localPlan.dependencies.push(unreviewedEdge);

      const result = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(result.success).toBe(true);

      const mergedEdge = result.mergedPlan.dependencies.find((d) => d.id === "D-AI-SUGGESTED");
      expect(mergedEdge).toBeDefined();
      expect(mergedEdge?.origin).toBe("ai_suggested");
      expect(mergedEdge?.confirmationStatus).toBe("unreviewed"); // NOT promoted to confirmed!
      expect(mergedEdge?.modificationHistory).toHaveLength(1);
    });
  });

  describe("Explicit Conflict Resolution Operations", () => {
    it("supports resolving conflict by local value, remote value, or custom value", () => {
      const basePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const localPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      const remotePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));

      localPlan.tasks.find((t) => t.id === "T03")!.cost = 4000;
      remotePlan.tasks.find((t) => t.id === "T03")!.cost = 6000;

      const mergeResult = threeWayMerge(basePlan, localPlan, remotePlan);
      expect(mergeResult.hasConflicts).toBe(true);

      const conflict = mergeResult.conflicts[0];

      // Resolve choosing local
      const resolvedLocal = resolveConflict(conflict, "local");
      expect(resolvedLocal.resolutionStatus).toBe("resolved_local");
      expect(resolvedLocal.resolvedValue).toBe(4000);

      // Resolve choosing remote
      const resolvedRemote = resolveConflict(conflict, "remote");
      expect(resolvedRemote.resolutionStatus).toBe("resolved_remote");
      expect(resolvedRemote.resolvedValue).toBe(6000);

      // Resolve choosing custom negotiated value
      const resolvedCustom = resolveConflict(conflict, { customValue: 5200 });
      expect(resolvedCustom.resolutionStatus).toBe("resolved_custom");
      expect(resolvedCustom.resolvedValue).toBe(5200);

      // Apply resolution to plan
      const finalPlan = applyResolvedConflictsToPlan(mergeResult.mergedPlan, [resolvedCustom]);
      const finalT03 = finalPlan.tasks.find((t) => t.id === "T03");
      expect(finalT03?.cost).toBe(5200);
    });
  });
});
