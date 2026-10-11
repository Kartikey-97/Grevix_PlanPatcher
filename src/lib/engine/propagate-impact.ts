import type { Plan, Task, Dependency, GlobalConstraints } from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import type { SyncState, PublicationStatus, ConflictRecord } from "../schemas/sync.schema";
import { guardRecovery } from "./guard-recovery";
import { schedulePlan, type ScheduleResult, DEFAULT_TOLERANCE } from "./schedule";
import {
  validateConstraints,
  type ConstraintValidationResult,
  type ConstraintIssue,
} from "./validate-constraints";

export type ImpactCategory =
  | "directly_changed"
  | "input_fields_affected"
  | "requires_review"
  | "blocked_by_prerequisite"
  | "scheduling_affected"
  | "constraint_violated"
  | "unaffected";

export type ImpactSeverity = "error" | "warning" | "info";

export interface TaskImpactEntry {
  taskId: string;
  category: ImpactCategory;
  severity: ImpactSeverity;
  affectedFields: string[];
  propagationPath: string[];
  reason: string;
}

export interface PlanPatchChangeSet {
  changedTaskIds?: string[];
  taskOverrides?: Record<string, Partial<Task>>;
  removedTaskIds?: string[];
  addedTasks?: Task[];
  modifiedDependencies?: Dependency[];
  removedDependencyIds?: string[];
  constraintOverrides?: Partial<GlobalConstraints>;
}

export interface ImpactPropagationInput {
  baselinePlan: Plan;
  baselineGraph: ExplainableDependencyGraph;
  candidatePlan?: Plan;
  changeSet?: PlanPatchChangeSet;
  syncState?: SyncState;
  publicationStatus?: PublicationStatus;
  activeConflicts?: ConflictRecord[];
  isOffline?: boolean;
  tolerance?: number;
}

export interface ImpactPropagationResult {
  success: boolean;
  error?: string;
  blockingIssues: string[];
  requiredActions: string[];
  impacts: TaskImpactEntry[];
  directlyChangedTaskIds: string[];
  inputAffectedTaskIds: string[];
  reviewTaskIds: string[];
  blockedTaskIds: string[];
  schedulingAffectedTaskIds: string[];
  constraintViolatedTaskIds: string[];
  unaffectedTaskIds: string[];
  allAffectedTaskIds: string[];
  constraintValidation?: ConstraintValidationResult;
  baselineSchedule?: ScheduleResult;
  candidateSchedule?: ScheduleResult;
}

/**
 * Deep clone an object safely.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Compare two records to find keys with changed values.
 */
function findChangedKeys(
  base: Record<string, unknown> = {},
  candidate: Record<string, unknown> = {}
): string[] {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(candidate)]);
  const changed: string[] = [];
  for (const k of allKeys) {
    if (JSON.stringify(base[k]) !== JSON.stringify(candidate[k])) {
      changed.push(k);
    }
  }
  return changed.sort();
}

/**
 * Applies a change set to a baseline plan to derive a candidate plan.
 */
function applyChangeSet(base: Plan, changeSet: PlanPatchChangeSet): Plan {
  const plan = deepClone(base);
  const removedSet = new Set(changeSet.removedTaskIds ?? []);

  // 1. Remove tasks
  plan.tasks = plan.tasks.filter((t) => !removedSet.has(t.id));

  // 2. Apply task overrides
  const overrides = changeSet.taskOverrides ?? {};
  for (const task of plan.tasks) {
    const override = overrides[task.id];
    if (override) {
      if (override.cost !== undefined) task.cost = override.cost;
      if (override.durationHours !== undefined) task.durationHours = override.durationHours;
      if (override.priority !== undefined) task.priority = override.priority;
      if (override.policy !== undefined) task.policy = override.policy;
      if (override.status !== undefined) task.status = override.status;
      if (override.title !== undefined) task.title = override.title;
      if (override.inputs !== undefined) {
        task.inputs = { ...task.inputs, ...override.inputs };
      }
      if (override.outputs !== undefined) {
        task.outputs = { ...task.outputs, ...override.outputs };
      }
      if (override.outputDependencies !== undefined) {
        task.outputDependencies = {
          ...task.outputDependencies,
          ...override.outputDependencies,
        };
      }
    }
  }

  // 3. Add added tasks
  if (changeSet.addedTasks) {
    plan.tasks.push(...deepClone(changeSet.addedTasks));
  }

  // 4. Update dependencies
  const removedDeps = new Set(changeSet.removedDependencyIds ?? []);
  const taskIds = new Set(plan.tasks.map((t) => t.id));

  plan.dependencies = plan.dependencies
    .filter((d) => !removedDeps.has(d.id))
    // Automatically prune dangling edges of intentionally removed tasks
    .filter((d) => taskIds.has(d.fromTaskId) && taskIds.has(d.toTaskId));

  if (changeSet.modifiedDependencies) {
    const modMap = new Map(changeSet.modifiedDependencies.map((d) => [d.id, d]));
    plan.dependencies = plan.dependencies.map((d) => modMap.get(d.id) ?? d);
  }

  // 5. Apply constraint overrides
  if (changeSet.constraintOverrides) {
    plan.constraints = {
      ...plan.constraints,
      ...changeSet.constraintOverrides,
    };
  }

  return plan;
}

/**
 * Generic Field-Aware Disruption Impact Propagation & Constraint Checking.
 *
 * Enforces S5B Invariants:
 * 1. Operates only on valid, fresh baseline graphs (via guardRecovery).
 * 2. Distinguishes directly changed, input-affected, review-required, blocked,
 *    scheduling-affected, constraint-violated, and unaffected tasks.
 * 3. Follows field mappings from source outputs to target inputs.
 * 4. Respects explicit task outputDependencies when declared. If undeclared,
 *    flags task for review rather than inventing downstream causal assumptions.
 * 5. Recalculates schedules using the pure scheduling engine without mutating task records.
 * 6. Validates constraints (budget, deadline, fixed tasks, acyclicity).
 * 7. Never mutates the baseline plan or graph.
 */
export function propagateImpact(
  input: ImpactPropagationInput
): ImpactPropagationResult {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;

  // 1. Synchronization Safety Check (Requirement 5)
  const guard = guardRecovery({
    plan: input.baselinePlan,
    graph: input.baselineGraph,
    syncState: input.syncState,
    publicationStatus: input.publicationStatus,
    activeConflicts: input.activeConflicts,
    isOffline: input.isOffline,
  });

  if (!guard.canCalculate) {
    return {
      success: false,
      error: `Impact analysis blocked: baseline plan/graph is not in a valid state for calculation (${guard.freshnessStatus}). ${guard.blockingIssues.join(
        "; "
      )}`,
      blockingIssues: guard.blockingIssues,
      requiredActions: guard.requiredActions,
      impacts: [],
      directlyChangedTaskIds: [],
      inputAffectedTaskIds: [],
      reviewTaskIds: [],
      blockedTaskIds: [],
      schedulingAffectedTaskIds: [],
      constraintViolatedTaskIds: [],
      unaffectedTaskIds: [],
      allAffectedTaskIds: [],
    };
  }

  // 2. Resolve Candidate Plan
  const baselinePlan = input.baselinePlan;
  let candidatePlan: Plan;
  if (input.candidatePlan) {
    candidatePlan = input.candidatePlan;
  } else if (input.changeSet) {
    candidatePlan = applyChangeSet(baselinePlan, input.changeSet);
  } else {
    candidatePlan = deepClone(baselinePlan);
  }

  // 3. Evaluate Constraints on Candidate Plan
  const constraintValidation = validateConstraints({
    baselinePlan,
    candidatePlan,
    tolerance,
  });

  // 4. Compute Schedules for Baseline and Candidate
  const baselineSchedule = schedulePlan(baselinePlan, { tolerance });
  const candidateSchedule = constraintValidation.schedule ?? schedulePlan(candidatePlan, { tolerance });

  const impacts: TaskImpactEntry[] = [];
  const directlyChangedTaskIds = new Set<string>();
  const inputAffectedTaskIds = new Set<string>();
  const reviewTaskIds = new Set<string>();
  const blockedTaskIds = new Set<string>();
  const schedulingAffectedTaskIds = new Set<string>();
  const constraintViolatedTaskIds = new Set<string>();

  const baseTasksById = new Map(baselinePlan.tasks.map((t) => [t.id, t]));
  const candTasksById = new Map(candidatePlan.tasks.map((t) => [t.id, t]));

  // Track changed output fields per task for data-flow propagation
  const taskChangedOutputs = new Map<string, Set<string>>();

  // ---------------------------------------------------------
  // Step A: Detect Directly Changed Tasks & Directly Changed Outputs
  // ---------------------------------------------------------
  // A1. Removed tasks
  for (const baseTask of baselinePlan.tasks) {
    if (!candTasksById.has(baseTask.id)) {
      directlyChangedTaskIds.add(baseTask.id);
      impacts.push({
        taskId: baseTask.id,
        category: "directly_changed",
        severity: "warning",
        affectedFields: ["*removed*"],
        propagationPath: [baseTask.id],
        reason: `Task '${baseTask.id}' was removed in the candidate plan.`,
      });
    }
  }

  // A2. Added tasks
  for (const candTask of candidatePlan.tasks) {
    if (!baseTasksById.has(candTask.id)) {
      directlyChangedTaskIds.add(candTask.id);
      impacts.push({
        taskId: candTask.id,
        category: "directly_changed",
        severity: "info",
        affectedFields: ["*added*"],
        propagationPath: [candTask.id],
        reason: `Task '${candTask.id}' was newly introduced in the candidate plan.`,
      });
      // New task outputs are considered available/changed
      const newOutputs = new Set(Object.keys(candTask.outputs ?? {}));
      if (newOutputs.size > 0) {
        taskChangedOutputs.set(candTask.id, newOutputs);
      }
    }
  }

  // A3. Modified tasks
  for (const candTask of candidatePlan.tasks) {
    const baseTask = baseTasksById.get(candTask.id);
    if (baseTask) {
      const changedFields: string[] = [];
      if (candTask.cost !== baseTask.cost) changedFields.push("cost");
      if (candTask.durationHours !== baseTask.durationHours) changedFields.push("durationHours");
      if (candTask.status !== baseTask.status) changedFields.push("status");
      if (candTask.title !== baseTask.title) changedFields.push("title");
      if (candTask.policy !== baseTask.policy) changedFields.push("policy");

      const changedInputs = findChangedKeys(baseTask.inputs, candTask.inputs);
      if (changedInputs.length > 0) {
        changedFields.push(...changedInputs.map((k) => `input:${k}`));
      }

      const changedOutputs = findChangedKeys(baseTask.outputs, candTask.outputs);
      if (changedOutputs.length > 0) {
        changedFields.push(...changedOutputs.map((k) => `output:${k}`));
        taskChangedOutputs.set(candTask.id, new Set(changedOutputs));
      }

      if (changedFields.length > 0) {
        directlyChangedTaskIds.add(candTask.id);
        impacts.push({
          taskId: candTask.id,
          category: "directly_changed",
          severity: "info",
          affectedFields: changedFields,
          propagationPath: [candTask.id],
          reason: `Task '${candTask.id}' attributes were directly modified: [${changedFields.join(", ")}].`,
        });
      }
    }
  }

  // ---------------------------------------------------------
  // Step B: Detect Blocked Tasks (Unavailable / Removed Prerequisite)
  // ---------------------------------------------------------
  for (const dep of baselinePlan.dependencies) {
    if (dep.blocksExecution !== false) {
      const fromTask = candTasksById.get(dep.fromTaskId);
      const isUnavailable =
        !fromTask ||
        fromTask.status === "unavailable" ||
        fromTask.status === "cancelled" ||
        fromTask.status === "failed";

      if (isUnavailable && candTasksById.has(dep.toTaskId)) {
        blockedTaskIds.add(dep.toTaskId);
        impacts.push({
          taskId: dep.toTaskId,
          category: "blocked_by_prerequisite",
          severity: "error",
          affectedFields: ["prerequisite:" + dep.fromTaskId],
          propagationPath: [dep.fromTaskId, dep.toTaskId],
          reason: `Blocking prerequisite '${dep.fromTaskId}' became unavailable or was removed.`,
        });
      }
    }
  }

  // ---------------------------------------------------------
  // Step C: Field-Aware Data Changes & Input-to-Output Propagation
  // ---------------------------------------------------------
  // Build adjacency map of field-mapping dependencies: sourceTaskId -> dependencies
  const dependenciesBySource = new Map<string, Dependency[]>();
  for (const dep of candidatePlan.dependencies) {
    if (!dependenciesBySource.has(dep.fromTaskId)) {
      dependenciesBySource.set(dep.fromTaskId, []);
    }
    dependenciesBySource.get(dep.fromTaskId)!.push(dep);
  }

  // Queue of tasks whose outputs changed: [taskId, propagationPath]
  const dataQueue: Array<{ taskId: string; path: string[] }> = [];
  for (const [tid] of taskChangedOutputs.entries()) {
    dataQueue.push({ taskId: tid, path: [tid] });
  }

  const visitedDataEdges = new Set<string>();

  while (dataQueue.length > 0) {
    const { taskId: currentTaskId, path: currentPath } = dataQueue.shift()!;
    const changedSourceOutputs = taskChangedOutputs.get(currentTaskId);
    if (!changedSourceOutputs || changedSourceOutputs.size === 0) {
      continue;
    }

    const outgoingDeps = dependenciesBySource.get(currentTaskId) ?? [];
    for (const dep of outgoingDeps) {
      const edgeKey = `${dep.id}:${Array.from(changedSourceOutputs).sort().join(",")}`;
      if (visitedDataEdges.has(edgeKey)) {
        continue;
      }
      visitedDataEdges.add(edgeKey);

      // Inspect declared fieldMappings on this edge
      const matchingTargetInputs: string[] = [];
      const matchingSourceFields: string[] = [];

      for (const mapping of dep.fieldMappings ?? []) {
        if (changedSourceOutputs.has(mapping.sourceField)) {
          matchingTargetInputs.push(mapping.targetInput);
          matchingSourceFields.push(mapping.sourceField);
        }
      }

      if (matchingTargetInputs.length > 0) {
        const destTaskId = dep.toTaskId;
        const destTask = candTasksById.get(destTaskId);
        const propagationPath = [...currentPath, destTaskId];

        inputAffectedTaskIds.add(destTaskId);
        impacts.push({
          taskId: destTaskId,
          category: "input_fields_affected",
          severity: "warning",
          affectedFields: matchingTargetInputs,
          propagationPath,
          reason: `Input field(s) [${matchingTargetInputs.join(
            ", "
          )}] consume changed output field(s) [${matchingSourceFields.join(
            ", "
          )}] from upstream task '${currentTaskId}'.`,
        });

        if (destTask) {
          // Check Input-to-Output propagation (Requirement 3C)
          const outputDeps = destTask.outputDependencies;
          if (outputDeps && Object.keys(outputDeps).length > 0) {
            // Task has explicit output dependency declarations
            const newlyAffectedOutputs: string[] = [];
            for (const [outKey, requiredInputs] of Object.entries(outputDeps)) {
              const intersects = requiredInputs.some((req) =>
                matchingTargetInputs.includes(req)
              );
              if (intersects) {
                newlyAffectedOutputs.push(outKey);
              }
            }

            if (newlyAffectedOutputs.length > 0) {
              // Add to destTask changed outputs and continue downstream propagation
              if (!taskChangedOutputs.has(destTaskId)) {
                taskChangedOutputs.set(destTaskId, new Set());
              }
              const existing = taskChangedOutputs.get(destTaskId)!;
              newlyAffectedOutputs.forEach((o) => existing.add(o));

              dataQueue.push({ taskId: destTaskId, path: propagationPath });
            }
          } else {
            // Requirement 3C: Input-to-output relationship is undeclared/unknown
            // Mark task for review without inventing downstream causal propagation
            const hasOutputs = destTask.outputs && Object.keys(destTask.outputs).length > 0;
            if (hasOutputs) {
              reviewTaskIds.add(destTaskId);
              impacts.push({
                taskId: destTaskId,
                category: "requires_review",
                severity: "warning",
                affectedFields: matchingTargetInputs,
                propagationPath,
                reason: `Task '${destTaskId}' received changed inputs [${matchingTargetInputs.join(
                  ", "
                )}], but has no explicit outputDependencies declaration. Human review required to determine if its outputs must be updated.`,
              });
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------
  // Step D: Detect Scheduling Timing Shifts
  // ---------------------------------------------------------
  if (baselineSchedule.success && candidateSchedule.success) {
    for (const candTask of candidatePlan.tasks) {
      const baseSched = baselineSchedule.tasks[candTask.id];
      const candSched = candidateSchedule.tasks[candTask.id];

      if (baseSched && candSched) {
        const startShift = Math.abs(candSched.earliestStart - baseSched.earliestStart);
        const finishShift = Math.abs(candSched.earliestFinish - baseSched.earliestFinish);
        const criticalShift = candSched.isCritical !== baseSched.isCritical;
        const floatShift = Math.abs(candSched.criticalPathFloat - baseSched.criticalPathFloat);

        const hasTimingChange =
          startShift > tolerance ||
          finishShift > tolerance ||
          criticalShift ||
          floatShift > tolerance;

        if (hasTimingChange) {
          schedulingAffectedTaskIds.add(candTask.id);
          const changedTimingFields: string[] = [];
          if (startShift > tolerance) changedTimingFields.push("earliestStart");
          if (finishShift > tolerance) changedTimingFields.push("earliestFinish");
          if (criticalShift) changedTimingFields.push("isCritical");
          if (floatShift > tolerance) changedTimingFields.push("criticalPathFloat");

          impacts.push({
            taskId: candTask.id,
            category: "scheduling_affected",
            severity: "info",
            affectedFields: changedTimingFields,
            propagationPath: [candTask.id],
            reason: `Schedule timing shifted: start ${baseSched.earliestStart}h -> ${candSched.earliestStart}h, finish ${baseSched.earliestFinish}h -> ${candSched.earliestFinish}h. Task record preserved.`,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------
  // Step E: Attach Constraint Violations
  // ---------------------------------------------------------
  for (const issue of constraintValidation.issues) {
    if (issue.severity === "error") {
      const affectedIds = issue.affectedTaskIds ?? [];
      if (affectedIds.length > 0) {
        for (const tid of affectedIds) {
          constraintViolatedTaskIds.add(tid);
          impacts.push({
            taskId: tid,
            category: "constraint_violated",
            severity: "error",
            affectedFields: [issue.code],
            propagationPath: [tid],
            reason: issue.message,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------
  // Step F: Collect Unaffected Tasks
  // ---------------------------------------------------------
  const allAffectedTaskIds = new Set<string>([
    ...directlyChangedTaskIds,
    ...inputAffectedTaskIds,
    ...reviewTaskIds,
    ...blockedTaskIds,
    ...schedulingAffectedTaskIds,
    ...constraintViolatedTaskIds,
  ]);

  const unaffectedTaskIds = new Set<string>();
  for (const candTask of candidatePlan.tasks) {
    if (!allAffectedTaskIds.has(candTask.id)) {
      unaffectedTaskIds.add(candTask.id);
      impacts.push({
        taskId: candTask.id,
        category: "unaffected",
        severity: "info",
        affectedFields: [],
        propagationPath: [candTask.id],
        reason: "Task verified as unaffected under declared dependency and scheduling model.",
      });
    }
  }

  return {
    success: true,
    blockingIssues: [],
    requiredActions: [],
    impacts,
    directlyChangedTaskIds: Array.from(directlyChangedTaskIds).sort(),
    inputAffectedTaskIds: Array.from(inputAffectedTaskIds).sort(),
    reviewTaskIds: Array.from(reviewTaskIds).sort(),
    blockedTaskIds: Array.from(blockedTaskIds).sort(),
    schedulingAffectedTaskIds: Array.from(schedulingAffectedTaskIds).sort(),
    constraintViolatedTaskIds: Array.from(constraintViolatedTaskIds).sort(),
    unaffectedTaskIds: Array.from(unaffectedTaskIds).sort(),
    allAffectedTaskIds: Array.from(allAffectedTaskIds).sort(),
    constraintValidation,
    baselineSchedule,
    candidateSchedule,
  };
}
