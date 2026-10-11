import type { Plan, Task, Dependency, GlobalConstraints } from "../schemas/plan.schema";
import type { ConflictRecord, ConflictType, ConflictResolutionStatus } from "../schemas/sync.schema";

export interface ThreeWayMergeOptions {
  author?: string;
  generateId?: () => string;
}

export interface ThreeWayMergeResult {
  success: boolean;
  hasConflicts: boolean;
  conflicts: ConflictRecord[];
  mergedPlan: Plan;
  isGraphBlockedByConflict: boolean;
}

/**
 * Deep equality check for values, objects, and arrays.
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as Record<string, unknown>).sort();
    const keysB = Object.keys(b as Record<string, unknown>).sort();
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i]) return false;
      if (!isEqual((a as Record<string, unknown>)[keysA[i]], (b as Record<string, unknown>)[keysB[i]])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function clone<T>(val: T): T {
  if (val === undefined) return undefined as unknown as T;
  return JSON.parse(JSON.stringify(val));
}

let conflictCounter = 0;
function defaultConflictId(): string {
  conflictCounter++;
  return `conflict-${Date.now()}-${conflictCounter}`;
}

/**
 * Merges a scalar or leaf field using the 3-way merge rules:
 * 1. If local === base, return remote.
 * 2. If remote === base, return local.
 * 3. If local === remote, return local.
 * 4. If diverged and local !== remote, return conflict.
 */
function mergeScalarLeaf<T>(
  baseVal: T,
  localVal: T,
  remoteVal: T,
  conflictMeta: {
    entityType: "task" | "dependency" | "constraint";
    entityId: string;
    fieldPath: string;
    conflictType?: ConflictType;
  },
  conflicts: ConflictRecord[],
  idGen: () => string
): T {
  if (isEqual(localVal, baseVal)) {
    return clone(remoteVal);
  }
  if (isEqual(remoteVal, baseVal)) {
    return clone(localVal);
  }
  if (isEqual(localVal, remoteVal)) {
    return clone(localVal);
  }

  // Divergent conflict
  conflicts.push({
    id: idGen(),
    conflictType: conflictMeta.conflictType ?? "same_field_edit",
    entityType: conflictMeta.entityType,
    entityId: conflictMeta.entityId,
    fieldPath: conflictMeta.fieldPath,
    baseValue: clone(baseVal),
    localValue: clone(localVal),
    remoteValue: clone(remoteVal),
    resolutionStatus: "unresolved",
  });

  // Preserve local draft value in merged plan while tracking conflict
  return clone(localVal);
}

/**
 * 3-way merge for dictionary objects (e.g. task.inputs, task.outputs, constraints).
 * Independent edits to different keys merge cleanly without false conflicts.
 */
function mergeDictionary(
  baseDict: Record<string, unknown> = {},
  localDict: Record<string, unknown> = {},
  remoteDict: Record<string, unknown> = {},
  entityType: "task" | "dependency" | "constraint",
  entityId: string,
  fieldPrefix: string,
  conflicts: ConflictRecord[],
  idGen: () => string
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const allKeys = Array.from(
    new Set([...Object.keys(baseDict), ...Object.keys(localDict), ...Object.keys(remoteDict)])
  ).sort();

  for (const key of allKeys) {
    const bVal = baseDict[key];
    const lVal = localDict[key];
    const rVal = remoteDict[key];
    const fieldPath = fieldPrefix ? `${fieldPrefix}.${key}` : key;

    // Case 1: Key did not exist in base (bVal === undefined)
    if (bVal === undefined) {
      if (lVal !== undefined && rVal === undefined) {
        // Local added key; remote untouched -> accept local addition cleanly
        merged[key] = clone(lVal);
        continue;
      }
      if (rVal !== undefined && lVal === undefined) {
        // Remote added key; local untouched -> accept remote addition cleanly
        merged[key] = clone(rVal);
        continue;
      }
      if (lVal !== undefined && rVal !== undefined) {
        // Both added the key!
        if (isEqual(lVal, rVal)) {
          merged[key] = clone(lVal);
        } else {
          // Both added the same key with different values -> conflict!
          conflicts.push({
            id: idGen(),
            conflictType: "same_field_edit",
            entityType,
            entityId,
            fieldPath,
            baseValue: null,
            localValue: clone(lVal),
            remoteValue: clone(rVal),
            resolutionStatus: "unresolved",
          });
          merged[key] = clone(lVal);
        }
        continue;
      }
      continue;
    }

    // Case 2: Key existed in base (bVal !== undefined)
    if (lVal === undefined && rVal === undefined) {
      // Both deleted the key cleanly
      continue;
    }

    // Local removed, remote untouched (bVal === rVal)
    if (lVal === undefined && isEqual(bVal, rVal)) {
      continue;
    }

    // Remote removed, local untouched (bVal === lVal)
    if (rVal === undefined && isEqual(bVal, lVal)) {
      continue;
    }

    // Delete vs modify on this key
    if (lVal === undefined && !isEqual(bVal, rVal)) {
      conflicts.push({
        id: idGen(),
        conflictType: entityType === "task" ? "task_delete_modify" : "same_field_edit",
        entityType,
        entityId,
        fieldPath,
        baseValue: clone(bVal),
        localValue: null,
        remoteValue: clone(rVal),
        resolutionStatus: "unresolved",
      });
      merged[key] = clone(rVal);
      continue;
    }

    if (rVal === undefined && !isEqual(bVal, lVal)) {
      conflicts.push({
        id: idGen(),
        conflictType: entityType === "task" ? "task_modify_delete" : "same_field_edit",
        entityType,
        entityId,
        fieldPath,
        baseValue: clone(bVal),
        localValue: clone(lVal),
        remoteValue: null,
        resolutionStatus: "unresolved",
      });
      merged[key] = clone(lVal);
      continue;
    }

    // Both have values (or both retained key): merge scalar / nested leaf
    merged[key] = mergeScalarLeaf(
      bVal,
      lVal,
      rVal,
      { entityType, entityId, fieldPath },
      conflicts,
      idGen
    );
  }

  return merged;
}

/**
 * Merges two task versions against base task.
 */
function mergeTask(
  baseTask: Task,
  localTask: Task,
  remoteTask: Task,
  conflicts: ConflictRecord[],
  idGen: () => string
): Task {
  const taskId = baseTask.id;

  const title = mergeScalarLeaf(
    baseTask.title,
    localTask.title,
    remoteTask.title,
    { entityType: "task", entityId: taskId, fieldPath: "title" },
    conflicts,
    idGen
  );

  const cost = mergeScalarLeaf(
    baseTask.cost,
    localTask.cost,
    remoteTask.cost,
    { entityType: "task", entityId: taskId, fieldPath: "cost" },
    conflicts,
    idGen
  );

  const durationHours = mergeScalarLeaf(
    baseTask.durationHours,
    localTask.durationHours,
    remoteTask.durationHours,
    { entityType: "task", entityId: taskId, fieldPath: "durationHours" },
    conflicts,
    idGen
  );

  const priority = mergeScalarLeaf(
    baseTask.priority,
    localTask.priority,
    remoteTask.priority,
    { entityType: "task", entityId: taskId, fieldPath: "priority" },
    conflicts,
    idGen
  );

  const policy = mergeScalarLeaf(
    baseTask.policy,
    localTask.policy,
    remoteTask.policy,
    { entityType: "task", entityId: taskId, fieldPath: "policy" },
    conflicts,
    idGen
  );

  const status = mergeScalarLeaf(
    baseTask.status,
    localTask.status,
    remoteTask.status,
    { entityType: "task", entityId: taskId, fieldPath: "status" },
    conflicts,
    idGen
  );

  const inputs = mergeDictionary(
    (baseTask.inputs ?? {}) as Record<string, unknown>,
    (localTask.inputs ?? {}) as Record<string, unknown>,
    (remoteTask.inputs ?? {}) as Record<string, unknown>,
    "task",
    taskId,
    "inputs",
    conflicts,
    idGen
  );

  const outputs = mergeDictionary(
    (baseTask.outputs ?? {}) as Record<string, unknown>,
    (localTask.outputs ?? {}) as Record<string, unknown>,
    (remoteTask.outputs ?? {}) as Record<string, unknown>,
    "task",
    taskId,
    "outputs",
    conflicts,
    idGen
  );

  return {
    id: taskId,
    title,
    cost,
    durationHours,
    priority,
    policy,
    status,
    inputs,
    outputs,
    alternatives: localTask.alternatives ?? remoteTask.alternatives ?? baseTask.alternatives,
  };
}

/**
 * Merges dependency entities by ID, preserving provenance and distinct semantics.
 */
function mergeDependency(
  baseDep: Dependency,
  localDep: Dependency,
  remoteDep: Dependency,
  conflicts: ConflictRecord[],
  idGen: () => string
): Dependency {
  const depId = baseDep.id;

  const blocksExecution = mergeScalarLeaf(
    baseDep.blocksExecution,
    localDep.blocksExecution,
    remoteDep.blocksExecution,
    { entityType: "dependency", entityId: depId, fieldPath: "blocksExecution" },
    conflicts,
    idGen
  );

  const reason = mergeScalarLeaf(
    baseDep.reason ?? "",
    localDep.reason ?? "",
    remoteDep.reason ?? "",
    { entityType: "dependency", entityId: depId, fieldPath: "reason" },
    conflicts,
    idGen
  );

  const confirmationStatus = mergeScalarLeaf(
    baseDep.confirmationStatus ?? "confirmed",
    localDep.confirmationStatus ?? "confirmed",
    remoteDep.confirmationStatus ?? "confirmed",
    { entityType: "dependency", entityId: depId, fieldPath: "confirmationStatus" },
    conflicts,
    idGen
  );

  // Field mappings merge
  let fieldMappings = clone(localDep.fieldMappings ?? []);
  if (!isEqual(localDep.fieldMappings, remoteDep.fieldMappings)) {
    if (isEqual(localDep.fieldMappings, baseDep.fieldMappings)) {
      fieldMappings = clone(remoteDep.fieldMappings ?? []);
    } else if (isEqual(remoteDep.fieldMappings, baseDep.fieldMappings)) {
      fieldMappings = clone(localDep.fieldMappings ?? []);
    } else {
      conflicts.push({
        id: idGen(),
        conflictType: "same_field_edit",
        entityType: "dependency",
        entityId: depId,
        fieldPath: "fieldMappings",
        baseValue: clone(baseDep.fieldMappings ?? []),
        localValue: clone(localDep.fieldMappings ?? []),
        remoteValue: clone(remoteDep.fieldMappings ?? []),
        resolutionStatus: "unresolved",
      });
    }
  }

  // Combine provenance modification histories deterministically without loss
  const seenHist = new Set<string>();
  const combinedHistory = [
    ...(baseDep.modificationHistory ?? []),
    ...(remoteDep.modificationHistory ?? []),
    ...(localDep.modificationHistory ?? []),
  ].filter((rec) => {
    const key = `${rec.timestamp}:${rec.author}:${rec.action}:${rec.notes ?? ""}`;
    if (seenHist.has(key)) return false;
    seenHist.add(key);
    return true;
  });

  return {
    id: depId,
    fromTaskId: baseDep.fromTaskId,
    toTaskId: baseDep.toTaskId,
    blocksExecution,
    fieldMappings,
    reason,
    origin: baseDep.origin ?? "system_template",
    confirmationStatus,
    relevantSourceFields: localDep.relevantSourceFields ?? remoteDep.relevantSourceFields ?? baseDep.relevantSourceFields,
    relevantTargetFields: localDep.relevantTargetFields ?? remoteDep.relevantTargetFields ?? baseDep.relevantTargetFields,
    modificationHistory: combinedHistory,
    removeEdgeIfSourceRemoved: localDep.removeEdgeIfSourceRemoved ?? remoteDep.removeEdgeIfSourceRemoved ?? baseDep.removeEdgeIfSourceRemoved,
  };
}

/**
 * Deterministic Three-Way Plan Merge.
 *
 * Algorithm:
 * - Compares P_base, P_local, and P_remote.
 * - Merges scalar plan attributes and constraints.
 * - Handles tasks and dependencies collections by ID.
 * - Detects symmetric delete-versus-modify conflicts.
 * - Merges non-conflicting nested dictionary fields cleanly.
 * - Preserves provenance and edge semantics.
 * - Flags graph-blocking conflicts (e.g. broken endpoints, deleted tasks).
 */
export function threeWayMerge(
  basePlan: Plan,
  localPlan: Plan,
  remotePlan: Plan,
  options?: ThreeWayMergeOptions
): ThreeWayMergeResult {
  const conflicts: ConflictRecord[] = [];
  const idGen = options?.generateId ?? defaultConflictId;

  // 1. Merge Plan-level metadata
  const name = mergeScalarLeaf(
    basePlan.name,
    localPlan.name,
    remotePlan.name,
    { entityType: "constraint", entityId: "plan", fieldPath: "name" },
    conflicts,
    idGen
  );

  const description = mergeScalarLeaf(
    basePlan.description ?? "",
    localPlan.description ?? "",
    remotePlan.description ?? "",
    { entityType: "constraint", entityId: "plan", fieldPath: "description" },
    conflicts,
    idGen
  );

  // 2. Merge Global Constraints
  const mergedConstraints = mergeDictionary(
    basePlan.constraints as unknown as Record<string, unknown>,
    localPlan.constraints as unknown as Record<string, unknown>,
    remotePlan.constraints as unknown as Record<string, unknown>,
    "constraint",
    "global_constraints",
    "constraints",
    conflicts,
    idGen
  ) as unknown as GlobalConstraints;

  // 3. Merge Tasks Collection
  const baseTasks = new Map(basePlan.tasks.map((t) => [t.id, t]));
  const localTasks = new Map(localPlan.tasks.map((t) => [t.id, t]));
  const remoteTasks = new Map(remotePlan.tasks.map((t) => [t.id, t]));

  const allTaskIds = Array.from(
    new Set([...baseTasks.keys(), ...localTasks.keys(), ...remoteTasks.keys()])
  ).sort();

  const mergedTasks: Task[] = [];

  for (const tid of allTaskIds) {
    const inBase = baseTasks.get(tid);
    const inLocal = localTasks.get(tid);
    const inRemote = remoteTasks.get(tid);

    if (inBase) {
      if (inLocal && inRemote) {
        // Exists in all three
        mergedTasks.push(mergeTask(inBase, inLocal, inRemote, conflicts, idGen));
      } else if (!inLocal && !inRemote) {
        // Deleted in both local and remote -> cleanly deleted
        continue;
      } else if (!inLocal && inRemote) {
        // Deleted locally, present remotely
        if (isEqual(inBase, inRemote)) {
          // Remote made no edits; local deletion accepted
          continue;
        } else {
          // Remote modified task while local deleted it -> symmetric conflict
          conflicts.push({
            id: idGen(),
            conflictType: "task_delete_modify",
            entityType: "task",
            entityId: tid,
            fieldPath: "task",
            baseValue: clone(inBase),
            localValue: null,
            remoteValue: clone(inRemote),
            resolutionStatus: "unresolved",
          });
          // Keep remote task in merged draft for inspection
          mergedTasks.push(clone(inRemote));
        }
      } else if (inLocal && !inRemote) {
        // Present locally, deleted remotely
        if (isEqual(inBase, inLocal)) {
          // Local made no edits; remote deletion accepted
          continue;
        } else {
          // Local modified task while remote deleted it -> symmetric conflict
          conflicts.push({
            id: idGen(),
            conflictType: "task_modify_delete",
            entityType: "task",
            entityId: tid,
            fieldPath: "task",
            baseValue: clone(inBase),
            localValue: clone(inLocal),
            remoteValue: null,
            resolutionStatus: "unresolved",
          });
          // Keep local task in merged draft for inspection
          mergedTasks.push(clone(inLocal));
        }
      }
    } else {
      // Not in base -> added in local and/or remote
      if (inLocal && inRemote) {
        if (isEqual(inLocal, inRemote)) {
          mergedTasks.push(clone(inLocal));
        } else {
          // Both added task with same ID but different contents
          mergedTasks.push(mergeTask(inLocal, inLocal, inRemote, conflicts, idGen));
        }
      } else if (inLocal) {
        mergedTasks.push(clone(inLocal));
      } else if (inRemote) {
        mergedTasks.push(clone(inRemote));
      }
    }
  }

  // 4. Merge Dependencies Collection
  const baseDeps = new Map(basePlan.dependencies.map((d) => [d.id, d]));
  const localDeps = new Map(localPlan.dependencies.map((d) => [d.id, d]));
  const remoteDeps = new Map(remotePlan.dependencies.map((d) => [d.id, d]));

  const allDepIds = Array.from(
    new Set([...baseDeps.keys(), ...localDeps.keys(), ...remoteDeps.keys()])
  ).sort();

  const mergedDeps: Dependency[] = [];
  const seenEdgeSignatures = new Set<string>();

  for (const did of allDepIds) {
    const inBase = baseDeps.get(did);
    const inLocal = localDeps.get(did);
    const inRemote = remoteDeps.get(did);

    let candidateDep: Dependency | null = null;

    if (inBase) {
      if (inLocal && inRemote) {
        candidateDep = mergeDependency(inBase, inLocal, inRemote, conflicts, idGen);
      } else if (!inLocal && !inRemote) {
        continue;
      } else if (!inLocal && inRemote) {
        if (isEqual(inBase, inRemote)) {
          continue;
        } else {
          conflicts.push({
            id: idGen(),
            conflictType: "dependency_delete_modify",
            entityType: "dependency",
            entityId: did,
            fieldPath: "dependency",
            baseValue: clone(inBase),
            localValue: null,
            remoteValue: clone(inRemote),
            resolutionStatus: "unresolved",
          });
          candidateDep = clone(inRemote);
        }
      } else if (inLocal && !inRemote) {
        if (isEqual(inBase, inLocal)) {
          continue;
        } else {
          conflicts.push({
            id: idGen(),
            conflictType: "dependency_modify_delete",
            entityType: "dependency",
            entityId: did,
            fieldPath: "dependency",
            baseValue: clone(inBase),
            localValue: clone(inLocal),
            remoteValue: null,
            resolutionStatus: "unresolved",
          });
          candidateDep = clone(inLocal);
        }
      }
    } else {
      // Newly added in local and/or remote
      if (inLocal && inRemote) {
        if (isEqual(inLocal, inRemote)) {
          candidateDep = clone(inLocal);
        } else {
          candidateDep = mergeDependency(inLocal, inLocal, inRemote, conflicts, idGen);
        }
      } else if (inLocal) {
        candidateDep = clone(inLocal);
      } else if (inRemote) {
        candidateDep = clone(inRemote);
      }
    }

    if (candidateDep) {
      // Relationship deduplication: check if an identical relationship is already recorded
      const sig = `${candidateDep.fromTaskId}-->${candidateDep.toTaskId}:${candidateDep.blocksExecution}:${JSON.stringify(
        [...(candidateDep.fieldMappings ?? [])].sort((a, b) => a.sourceField.localeCompare(b.sourceField))
      )}`;
      if (!seenEdgeSignatures.has(sig)) {
        seenEdgeSignatures.add(sig);
        mergedDeps.push(candidateDep);
      }
    }
  }

  // 5. Build reconciled plan
  const baseRev = basePlan.planRevision ?? 1;
  const localRev = localPlan.planRevision ?? baseRev;
  const remoteRev = remotePlan.planRevision ?? baseRev;
  const targetRevision = Math.max(localRev, remoteRev) + 1;

  const mergedPlan: Plan = {
    schemaVersion: basePlan.schemaVersion ?? "1.0.0",
    id: basePlan.id,
    name,
    description,
    domain: basePlan.domain,
    planRevision: targetRevision,
    updatedAt: new Date().toISOString(),
    constraints: mergedConstraints,
    scoring: clone(basePlan.scoring),
    tasks: mergedTasks,
    dependencies: mergedDeps,
    demoAlternatives: clone(basePlan.demoAlternatives),
    notes: clone(basePlan.notes),
  };

  // Determine if unresolved conflicts block graph publication
  const isGraphBlockedByConflict = conflicts.some(
    (c) =>
      c.resolutionStatus === "unresolved" &&
      (c.entityType === "task" ||
        c.entityType === "dependency" ||
        c.fieldPath?.startsWith("inputs") ||
        c.fieldPath?.startsWith("outputs") ||
        c.fieldPath?.startsWith("fieldMappings") ||
        c.conflictType === "task_delete_modify" ||
        c.conflictType === "task_modify_delete" ||
        c.conflictType === "dependency_delete_modify" ||
        c.conflictType === "dependency_modify_delete")
  );

  return {
    success: conflicts.length === 0,
    hasConflicts: conflicts.length > 0,
    conflicts,
    mergedPlan,
    isGraphBlockedByConflict,
  };
}

/**
 * Applies a specific conflict resolution (local, remote, or custom).
 */
export function resolveConflict(
  conflict: ConflictRecord,
  resolution: "local" | "remote" | { customValue: unknown }
): ConflictRecord {
  const resolved = clone(conflict);
  if (resolution === "local") {
    resolved.resolutionStatus = "resolved_local";
    resolved.resolvedValue = clone(conflict.localValue);
  } else if (resolution === "remote") {
    resolved.resolutionStatus = "resolved_remote";
    resolved.resolvedValue = clone(conflict.remoteValue);
  } else {
    resolved.resolutionStatus = "resolved_custom";
    resolved.resolvedValue = clone(resolution.customValue);
  }
  return resolved;
}

/**
 * Injects resolved conflict values into a merged plan draft.
 */
export function applyResolvedConflictsToPlan(
  plan: Plan,
  resolvedConflicts: ConflictRecord[]
): Plan {
  const updatedPlan = clone(plan);

  for (const c of resolvedConflicts) {
    if (c.resolutionStatus === "unresolved") continue;
    const val = c.resolvedValue;

    if (c.entityType === "task") {
      const task = updatedPlan.tasks.find((t) => t.id === c.entityId);
      if (c.conflictType === "task_delete_modify" || c.conflictType === "task_modify_delete") {
        if (val === null || val === undefined) {
          // Resolved by deleting task
          updatedPlan.tasks = updatedPlan.tasks.filter((t) => t.id !== c.entityId);
          updatedPlan.dependencies = updatedPlan.dependencies.filter(
            (d) => d.fromTaskId !== c.entityId && d.toTaskId !== c.entityId
          );
        } else if (typeof val === "object" && val !== null) {
          // Resolved by keeping task
          if (!task) {
            updatedPlan.tasks.push(clone(val as Task));
          } else {
            Object.assign(task, clone(val));
          }
        }
      } else if (task && c.fieldPath) {
        const parts = c.fieldPath.split(".");
        let curr = task as unknown as Record<string, unknown>;
        for (let i = 0; i < parts.length - 1; i++) {
          curr = curr[parts[i]] as Record<string, unknown>;
        }
        curr[parts[parts.length - 1]] = clone(val);
      }
    } else if (c.entityType === "dependency") {
      const dep = updatedPlan.dependencies.find((d) => d.id === c.entityId);
      if (c.conflictType === "dependency_delete_modify" || c.conflictType === "dependency_modify_delete") {
        if (val === null || val === undefined) {
          updatedPlan.dependencies = updatedPlan.dependencies.filter((d) => d.id !== c.entityId);
        } else if (typeof val === "object" && val !== null) {
          if (!dep) {
            updatedPlan.dependencies.push(clone(val as Dependency));
          } else {
            Object.assign(dep, clone(val));
          }
        }
      } else if (dep && c.fieldPath) {
        (dep as unknown as Record<string, unknown>)[c.fieldPath] = clone(val);
      }
    } else if (c.entityType === "constraint" && c.fieldPath) {
      const key = c.fieldPath.replace("constraints.", "");
      (updatedPlan.constraints as unknown as Record<string, unknown>)[key] = clone(val);
    }
  }

  return updatedPlan;
}
