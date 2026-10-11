export interface SchedulableTaskRef {
  id: string;
  [key: string]: unknown;
}

export interface SchedulableDependencyRef {
  id?: string;
  fromTaskId: string;
  toTaskId: string;
  blocksExecution?: boolean;
  [key: string]: unknown;
}

export interface TopologicalSortOptions {
  /**
   * If true (default), only dependencies with blocksExecution === true impose execution ordering.
   * If false, all dependencies are considered.
   */
  onlyBlocking?: boolean;

  /**
   * Optional deterministic tie-breaker function for sorting ready tasks.
   * Defaults to lexicographical comparison by taskId string.
   */
  tieBreak?: (a: string, b: string) => number;
}

export interface TopologicalSortResult {
  success: boolean;
  order: string[];
  hasCycles: boolean;
  cycleNodes: string[];
  missingTaskReferences: string[];
  error?: string;
}

/**
 * Deterministic topological sort using Kahn's algorithm with stable priority tie-breaking.
 *
 * Guarantees:
 * 1. Independent of input array ordering: Tasks ready at the same step are dequeued deterministically
 *    using tieBreak (default: lexicographical order by task ID).
 * 2. Only dependencies with blocksExecution !== false impose scheduling precedence by default.
 * 3. Handles parallel disconnected branches without arbitrary serialization constraints.
 * 4. Detects cycles and missing endpoints, returning structured diagnostics.
 */
export function topologicalSort(
  tasks: SchedulableTaskRef[],
  dependencies: SchedulableDependencyRef[],
  options?: TopologicalSortOptions
): TopologicalSortResult {
  const onlyBlocking = options?.onlyBlocking ?? true;
  const comparator = options?.tieBreak ?? ((a: string, b: string) => a.localeCompare(b));

  const taskIds = new Set<string>();
  for (const t of tasks) {
    taskIds.add(t.id);
  }

  // 1. Check for missing task endpoint references
  const missingTaskReferences = new Set<string>();
  for (const dep of dependencies) {
    if (onlyBlocking && dep.blocksExecution === false) {
      continue;
    }
    if (!taskIds.has(dep.fromTaskId)) {
      missingTaskReferences.add(dep.fromTaskId);
    }
    if (!taskIds.has(dep.toTaskId)) {
      missingTaskReferences.add(dep.toTaskId);
    }
  }

  if (missingTaskReferences.size > 0) {
    const missing = Array.from(missingTaskReferences).sort();
    return {
      success: false,
      order: [],
      hasCycles: false,
      cycleNodes: [],
      missingTaskReferences: missing,
      error: `Dependencies reference non-existent task(s): [${missing.join(", ")}]`,
    };
  }

  // 2. Build adjacency and in-degree maps
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const tid of taskIds) {
    inDegree.set(tid, 0);
    outgoing.set(tid, []);
  }

  for (const dep of dependencies) {
    if (onlyBlocking && dep.blocksExecution === false) {
      continue;
    }
    // Self-loop detection
    if (dep.fromTaskId === dep.toTaskId) {
      return {
        success: false,
        order: [],
        hasCycles: true,
        cycleNodes: [dep.fromTaskId],
        missingTaskReferences: [],
        error: `Self-loop detected on task '${dep.fromTaskId}'`,
      };
    }
    inDegree.set(dep.toTaskId, (inDegree.get(dep.toTaskId) ?? 0) + 1);
    outgoing.get(dep.fromTaskId)!.push(dep.toTaskId);
  }

  // Sort outgoing adjacency lists for deterministic processing
  for (const [tid, succs] of outgoing.entries()) {
    succs.sort(comparator);
  }

  // 3. Initialize ready queue with all in-degree 0 tasks, sorted deterministically
  const readyQueue: string[] = [];
  for (const [tid, deg] of inDegree.entries()) {
    if (deg === 0) {
      readyQueue.push(tid);
    }
  }
  readyQueue.sort(comparator);

  // 4. Process Kahn's queue maintaining sorted order
  const order: string[] = [];
  while (readyQueue.length > 0) {
    const current = readyQueue.shift()!;
    order.push(current);

    for (const next of outgoing.get(current)!) {
      const nextDeg = inDegree.get(next)! - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        // Insert into readyQueue maintaining sorted order
        let insertIdx = 0;
        while (insertIdx < readyQueue.length && comparator(readyQueue[insertIdx], next) < 0) {
          insertIdx++;
        }
        readyQueue.splice(insertIdx, 0, next);
      }
    }
  }

  // 5. Check if all tasks were ordered (acyclic verification)
  if (order.length !== tasks.length) {
    const cycleNodes: string[] = [];
    for (const [tid, deg] of inDegree.entries()) {
      if (deg > 0) {
        cycleNodes.push(tid);
      }
    }
    cycleNodes.sort(comparator);

    return {
      success: false,
      order: [],
      hasCycles: true,
      cycleNodes,
      missingTaskReferences: [],
      error: `Directed cycle detected involving task(s): [${cycleNodes.join(", ")}]`,
    };
  }

  return {
    success: true,
    order,
    hasCycles: false,
    cycleNodes: [],
    missingTaskReferences: [],
  };
}

/**
 * Convenience wrapper that throws if the graph contains cycles or missing references.
 */
export function topologicalSortOrThrow(
  tasks: SchedulableTaskRef[],
  dependencies: SchedulableDependencyRef[],
  options?: TopologicalSortOptions
): string[] {
  const result = topologicalSort(tasks, dependencies, options);
  if (!result.success) {
    throw new Error(result.error ?? "Failed to topologically sort tasks");
  }
  return result.order;
}
