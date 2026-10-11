import { describe, it, expect, beforeEach } from "vitest";
import { OperationQueue } from "../../../src/lib/sync/operation-queue";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { PlanOperation } from "../../../src/lib/schemas/sync.schema";
import type { Plan, Task, Dependency } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S3: Offline Operation Queue", () => {
  let queue: OperationQueue;
  let basePlan: Plan;

  beforeEach(() => {
    basePlan = JSON.parse(JSON.stringify(canonicalPlan));
    queue = new OperationQueue(basePlan);
  });

  it("retains the exact base snapshot and base revision", () => {
    expect(queue.getBaseRevision()).toBe(1);
    const snap = queue.getBaseSnapshot();
    expect(snap.id).toBe(basePlan.id);
    expect(snap.tasks).toHaveLength(16);
    expect(snap.dependencies).toHaveLength(27);
  });

  it("applies task_update_field operations cleanly to draft plan", () => {
    const op: PlanOperation = {
      id: "op-01",
      baseRevision: 1,
      timestamp: "2026-10-11T12:00:00Z",
      author: "operator-offline",
      type: "task_update_field",
      targetId: "T03",
      fieldPath: "durationHours",
      oldValue: 24,
      newValue: 30,
    };

    queue.enqueue(op);
    const res = queue.applyAll();
    expect(res.appliedCount).toBe(1);
    expect(res.failedOperations).toHaveLength(0);

    const draft = queue.getCurrentDraftPlan();
    const t03 = draft.tasks.find((t) => t.id === "T03");
    expect(t03?.durationHours).toBe(30);
  });

  it("makes operation replay idempotent by stable operation ID", () => {
    const op: PlanOperation = {
      id: "op-idempotent-1",
      baseRevision: 1,
      timestamp: "2026-10-11T12:00:00Z",
      author: "operator-offline",
      type: "task_update_field",
      targetId: "T01",
      fieldPath: "cost",
      oldValue: 0,
      newValue: 500,
    };

    // Apply first time
    const res1 = queue.applyOperation(op);
    expect(res1.success).toBe(true);
    expect(res1.idempotentReplay).toBeFalsy();

    // Replay with identical op ID
    const res2 = queue.applyOperation(op);
    expect(res2.success).toBe(true);
    expect(res2.idempotentReplay).toBe(true);

    const draft = queue.getCurrentDraftPlan();
    const t01 = draft.tasks.find((t) => t.id === "T01");
    expect(t01?.cost).toBe(500);
  });

  it("applies task_add and prevents duplicate additions", () => {
    const newTask: Task = {
      id: "T-NEW",
      title: "New Offline Task",
      cost: 1500,
      durationHours: 8,
      priority: 3,
      policy: "replaceable",
      status: "planned",
      inputs: {},
      outputs: { newOutput: "ready" },
    };

    const op: PlanOperation = {
      id: "op-add-task",
      baseRevision: 1,
      timestamp: "2026-10-11T12:00:00Z",
      author: "operator-offline",
      type: "task_add",
      targetId: "T-NEW",
      payload: newTask,
    };

    queue.enqueue(op);
    const res = queue.applyAll();
    expect(res.appliedCount).toBe(1);

    const draft = queue.getCurrentDraftPlan();
    expect(draft.tasks.find((t) => t.id === "T-NEW")).toBeDefined();

    // Re-applying does not duplicate
    const resReplay = queue.applyOperation(op);
    expect(resReplay.success).toBe(true);
    expect(queue.getCurrentDraftPlan().tasks.filter((t) => t.id === "T-NEW")).toHaveLength(1);
  });

  it("detects operations targeting deleted or non-existent tasks", () => {
    const op: PlanOperation = {
      id: "op-missing-target",
      baseRevision: 1,
      timestamp: "2026-10-11T12:00:00Z",
      author: "operator-offline",
      type: "task_update_field",
      targetId: "T_DOES_NOT_EXIST",
      fieldPath: "cost",
      newValue: 1000,
    };

    const res = queue.applyOperation(op);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Target task 'T_DOES_NOT_EXIST' not found");
  });

  it("detects dependency_add with invalid endpoints", () => {
    const op: PlanOperation = {
      id: "op-bad-edge",
      baseRevision: 1,
      timestamp: "2026-10-11T12:00:00Z",
      author: "operator-offline",
      type: "dependency_add",
      targetId: "D-BAD",
      payload: {
        id: "D-BAD",
        fromTaskId: "T01",
        toTaskId: "T_NON_EXISTENT",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Invalid edge",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
    };

    const res = queue.applyOperation(op);
    expect(res.success).toBe(false);
    expect(res.error).toContain("reference non-existent task");
  });

  it("deduplicates identical dependency additions even under different op IDs", () => {
    const dep: Dependency = {
      id: "D-OFFLINE-1",
      fromTaskId: "T01",
      toTaskId: "T03",
      blocksExecution: true,
      fieldMappings: [],
      reason: "Direct dependency",
      origin: "manual",
      confirmationStatus: "confirmed",
      modificationHistory: [],
    };

    const op1: PlanOperation = {
      id: "op-add-dep-1",
      baseRevision: 1,
      timestamp: "2026-10-11T12:00:00Z",
      author: "operator-offline",
      type: "dependency_add",
      targetId: dep.id,
      payload: dep,
    };

    const op2: PlanOperation = {
      id: "op-add-dep-2",
      baseRevision: 1,
      timestamp: "2026-10-11T12:01:00Z",
      author: "operator-offline",
      type: "dependency_add",
      targetId: "D-OFFLINE-DUPLICATE",
      payload: { ...dep, id: "D-OFFLINE-DUPLICATE" },
    };

    const res1 = queue.applyOperation(op1);
    expect(res1.success).toBe(true);

    const res2 = queue.applyOperation(op2);
    expect(res2.success).toBe(true);
    expect(res2.idempotentReplay).toBe(true);

    // Only one edge between T01 and T03 with identical blocking & mappings exists
    const matchingEdges = queue
      .getCurrentDraftPlan()
      .dependencies.filter((d) => d.fromTaskId === "T01" && d.toTaskId === "T03");
    expect(matchingEdges).toHaveLength(1);
  });
});
