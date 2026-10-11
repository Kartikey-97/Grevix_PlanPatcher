import type { Plan, Task, Dependency } from "../schemas/plan.schema";
import type { PlanOperation, OperationType } from "../schemas/sync.schema";

export type OperationStatus = "pending" | "applied" | "rejected" | "conflicted";

export interface QueuedOperationEntry {
  operation: PlanOperation;
  status: OperationStatus;
  enqueuedAt: string;
  appliedAt?: string;
  error?: string;
}

export interface ApplyOperationResult {
  success: boolean;
  plan: Plan;
  idempotentReplay?: boolean;
  error?: string;
}

export interface ApplyAllOperationsResult {
  currentPlan: Plan;
  appliedCount: number;
  idempotentReplays: number;
  failedOperations: Array<{ operation: PlanOperation; reason: string }>;
}

/**
 * Deep clone helper using JSON serialization.
 */
function clonePlan<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deeply sets a nested property on an object by dot-separated path.
 */
function setNestedField(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let curr = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (curr[key] === undefined || curr[key] === null || typeof curr[key] !== "object") {
      curr[key] = {};
    }
    curr = curr[key] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  curr[lastKey] = value;
}

/**
 * Pure, in-memory Operation Queue for offline plan modifications.
 *
 * Capabilities:
 * - Records typed plan-edit operations with stable unique IDs and base revision.
 * - Retains the exact base snapshot needed for three-way merging.
 * - Enforces idempotency: re-applying an operation ID does not duplicate edits or dependencies.
 * - Validates target existence and dependency endpoint validity before applying.
 * - Independent of browser storage or React runtimes.
 */
export class OperationQueue {
  private readonly baseSnapshot: Plan;
  private readonly baseRevision: number;
  private currentDraftPlan: Plan;
  private readonly operations: QueuedOperationEntry[] = [];
  private readonly appliedOperationIds = new Set<string>();

  constructor(basePlan: Plan) {
    this.baseSnapshot = clonePlan(basePlan);
    this.baseRevision = basePlan.planRevision ?? 1;
    this.currentDraftPlan = clonePlan(basePlan);
  }

  /**
   * Returns a copy of the original base plan snapshot.
   */
  public getBaseSnapshot(): Plan {
    return clonePlan(this.baseSnapshot);
  }

  /**
   * Returns the base revision number for this queue.
   */
  public getBaseRevision(): number {
    return this.baseRevision;
  }

  /**
   * Returns the current working draft plan with all successfully applied edits.
   */
  public getCurrentDraftPlan(): Plan {
    return clonePlan(this.currentDraftPlan);
  }

  /**
   * Returns all queued operation entries.
   */
  public getAllOperations(): QueuedOperationEntry[] {
    return clonePlan(this.operations);
  }

  /**
   * Returns only operations currently in "pending" status.
   */
  public getPendingOperations(): PlanOperation[] {
    return this.operations
      .filter((e) => e.status === "pending")
      .map((e) => clonePlan(e.operation));
  }

  /**
   * Returns all operations that have been applied.
   */
  public getAppliedOperations(): PlanOperation[] {
    return this.operations
      .filter((e) => e.status === "applied")
      .map((e) => clonePlan(e.operation));
  }

  /**
   * Enqueues a new plan operation.
   */
  public enqueue(op: PlanOperation): void {
    if (this.operations.some((e) => e.operation.id === op.id)) {
      // Already queued with this ID
      return;
    }
    this.operations.push({
      operation: clonePlan(op),
      status: "pending",
      enqueuedAt: new Date().toISOString(),
    });
  }

  /**
   * Applies an individual operation to the target plan with idempotency and safety checks.
   */
  public applyOperation(op: PlanOperation, plan?: Plan): ApplyOperationResult {
    const targetPlan = plan ? clonePlan(plan) : this.currentDraftPlan;

    // 1. Idempotency check by operation ID
    if (this.appliedOperationIds.has(op.id)) {
      return {
        success: true,
        plan: targetPlan,
        idempotentReplay: true,
      };
    }

    // 2. Execute operation according to type
    switch (op.type) {
      case "task_add": {
        const newTask = op.payload as Task;
        if (!newTask || !newTask.id) {
          return { success: false, plan: targetPlan, error: "task_add payload must include a valid task with id" };
        }
        if (targetPlan.tasks.some((t) => t.id === newTask.id)) {
          // Idempotent task addition: if task already exists with identical ID, update or keep
          return { success: true, plan: targetPlan, idempotentReplay: true };
        }
        targetPlan.tasks.push(clonePlan(newTask));
        break;
      }

      case "task_update_field": {
        const task = targetPlan.tasks.find((t) => t.id === op.targetId);
        if (!task) {
          return {
            success: false,
            plan: targetPlan,
            error: `Target task '${op.targetId}' not found; may have been deleted`,
          };
        }
        if (!op.fieldPath) {
          return { success: false, plan: targetPlan, error: "fieldPath required for task_update_field" };
        }
        setNestedField(task as unknown as Record<string, unknown>, op.fieldPath, op.newValue);
        break;
      }

      case "task_remove": {
        const idx = targetPlan.tasks.findIndex((t) => t.id === op.targetId);
        if (idx === -1) {
          // Task already removed — idempotent
          return { success: true, plan: targetPlan, idempotentReplay: true };
        }
        targetPlan.tasks.splice(idx, 1);
        // Also remove incident edges to prevent dangling pointers if marked
        targetPlan.dependencies = targetPlan.dependencies.filter(
          (d) => d.fromTaskId !== op.targetId && d.toTaskId !== op.targetId
        );
        break;
      }

      case "dependency_add": {
        const newDep = (op.payload as Dependency) ?? {
          id: op.targetId,
          fromTaskId: (op.newValue as Record<string, unknown>)?.fromTaskId as string,
          toTaskId: (op.newValue as Record<string, unknown>)?.toTaskId as string,
          blocksExecution: (op.newValue as Record<string, unknown>)?.blocksExecution as boolean ?? true,
          fieldMappings: (op.newValue as Record<string, unknown>)?.fieldMappings as Dependency["fieldMappings"] ?? [],
          reason: (op.newValue as Record<string, unknown>)?.reason as string ?? "Manual offline dependency",
          origin: "manual" as const,
          confirmationStatus: "confirmed" as const,
          modificationHistory: [],
        };

        if (!newDep.fromTaskId || !newDep.toTaskId) {
          return { success: false, plan: targetPlan, error: "dependency_add requires valid fromTaskId and toTaskId" };
        }

        // Validate endpoints exist
        const fromExists = targetPlan.tasks.some((t) => t.id === newDep.fromTaskId);
        const toExists = targetPlan.tasks.some((t) => t.id === newDep.toTaskId);
        if (!fromExists || !toExists) {
          return {
            success: false,
            plan: targetPlan,
            error: `Dependency endpoints [${newDep.fromTaskId} -> ${newDep.toTaskId}] reference non-existent task(s)`,
          };
        }

        // Deduplication: check if identical dependency already exists
        const isIdentical = targetPlan.dependencies.some(
          (d) =>
            d.fromTaskId === newDep.fromTaskId &&
            d.toTaskId === newDep.toTaskId &&
            d.blocksExecution === newDep.blocksExecution &&
            JSON.stringify(d.fieldMappings ?? []) === JSON.stringify(newDep.fieldMappings ?? [])
        );
        if (isIdentical) {
          return { success: true, plan: targetPlan, idempotentReplay: true };
        }

        // Check if ID is already used
        const existingIdx = targetPlan.dependencies.findIndex((d) => d.id === newDep.id);
        if (existingIdx !== -1) {
          targetPlan.dependencies[existingIdx] = clonePlan(newDep);
        } else {
          targetPlan.dependencies.push(clonePlan(newDep));
        }
        break;
      }

      case "dependency_update": {
        const dep = targetPlan.dependencies.find((d) => d.id === op.targetId);
        if (!dep) {
          return {
            success: false,
            plan: targetPlan,
            error: `Target dependency '${op.targetId}' not found`,
          };
        }
        if (!op.fieldPath) {
          return { success: false, plan: targetPlan, error: "fieldPath required for dependency_update" };
        }
        setNestedField(dep as unknown as Record<string, unknown>, op.fieldPath, op.newValue);
        break;
      }

      case "dependency_remove": {
        const idx = targetPlan.dependencies.findIndex((d) => d.id === op.targetId);
        if (idx === -1) {
          // Already removed — idempotent
          return { success: true, plan: targetPlan, idempotentReplay: true };
        }
        targetPlan.dependencies.splice(idx, 1);
        break;
      }

      case "constraint_update": {
        if (!op.fieldPath) {
          return { success: false, plan: targetPlan, error: "fieldPath required for constraint_update" };
        }
        setNestedField(targetPlan.constraints as unknown as Record<string, unknown>, op.fieldPath, op.newValue);
        break;
      }

      default:
        return { success: false, plan: targetPlan, error: `Unsupported operation type: ${(op as { type: string }).type}` };
    }

    // Mark operation ID as applied
    this.appliedOperationIds.add(op.id);
    if (!plan) {
      this.currentDraftPlan = targetPlan;
    }

    // Update entry in internal list if present
    const entry = this.operations.find((e) => e.operation.id === op.id);
    if (entry) {
      entry.status = "applied";
      entry.appliedAt = new Date().toISOString();
    }

    return { success: true, plan: targetPlan };
  }

  /**
   * Applies all pending operations in sequential order.
   */
  public applyAll(): ApplyAllOperationsResult {
    let appliedCount = 0;
    let idempotentReplays = 0;
    const failedOperations: Array<{ operation: PlanOperation; reason: string }> = [];

    for (const entry of this.operations) {
      if (entry.status !== "pending") continue;

      const res = this.applyOperation(entry.operation);
      if (res.success) {
        if (res.idempotentReplay) {
          idempotentReplays++;
        } else {
          appliedCount++;
        }
        entry.status = "applied";
        entry.appliedAt = new Date().toISOString();
      } else {
        entry.status = "rejected";
        entry.error = res.error;
        failedOperations.push({ operation: entry.operation, reason: res.error ?? "Unknown error" });
      }
    }

    return {
      currentPlan: clonePlan(this.currentDraftPlan),
      appliedCount,
      idempotentReplays,
      failedOperations,
    };
  }

  /**
   * Resets queue and draft plan back to base snapshot.
   */
  public reset(): void {
    this.currentDraftPlan = clonePlan(this.baseSnapshot);
    this.operations.length = 0;
    this.appliedOperationIds.clear();
  }
}
