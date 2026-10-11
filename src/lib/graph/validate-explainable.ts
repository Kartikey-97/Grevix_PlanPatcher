import type { Plan, Dependency } from "../schemas/plan.schema";
import type { ExplainableDependency } from "../schemas/graph.schema";

export type ValidationIssueSeverity = "error" | "warning" | "info";

export interface GraphValidationIssue {
  code:
    | "DUPLICATE_TASK_ID"
    | "DUPLICATE_EDGE_ID"
    | "EXACT_DUPLICATE_RELATIONSHIP"
    | "DISTINCT_PARALLEL_RELATIONSHIP"
    | "MISSING_TASK_ENDPOINT"
    | "SELF_LOOP"
    | "DIRECTED_CYCLE"
    | "BLOCKED_BY_CYCLE"
    | "INVALID_FIELD_MAPPING_SOURCE"
    | "INVALID_FIELD_MAPPING_TARGET"
    | "NONEXISTENT_TARGET_INPUT"
    | "OPTIONAL_MAPPING_NOT_DECLARED"
    | "MISSING_EDGE_EXPLANATION"
    | "UNREVIEWED_DEPENDENCY"
    | "PROVISIONAL_DEPENDENCY";
  severity: ValidationIssueSeverity;
  affectedEntityIds: string[];
  message: string;
  suggestedAction: string;
}

export interface GraphValidationResult {
  isValid: boolean;
  hasCycles: boolean;
  cycleNodes: string[];
  blockedByCycleNodes: string[];
  issues: GraphValidationIssue[];
  missingTaskReferences: string[];
  invalidFieldMappings: string[];
  unreviewedDependencyIds: string[];
  reviewedDependencyIds: string[];
  confirmedDependencyIds: string[];
  provisionalDependencyIds: string[];
  hasUnreviewedDependencies: boolean;
  warnings: string[];
}

/**
 * Validates a plan's tasks and explainable dependencies.
 *
 * Rules:
 * 1. Unique task and edge IDs.
 * 2. All edge endpoints refer to existing tasks.
 * 3. Self-loops are rejected.
 * 4. Cycle diagnostics: Kahn's algorithm for acyclicity + Tarjan's SCC to separate actual cycle members from downstream blocked nodes.
 * 5. Field mappings: source outputs checked; required target inputs must exist on destination task; optional mappings distinguished.
 * 6. Duplicate relationships: Exact duplicate edges rejected; distinct parallel edges preserved with info audit.
 * 7. Trust status: unreviewed edges cataloged without breaking structural validity.
 */
export function validateExplainableGraph(
  plan: Pick<Plan, "tasks"> & { dependencies: Array<Dependency | ExplainableDependency> }
): GraphValidationResult {
  const issues: GraphValidationIssue[] = [];
  const missingTaskReferences = new Set<string>();
  const invalidFieldMappings = new Set<string>();
  const unreviewedDependencyIds: string[] = [];
  const reviewedDependencyIds: string[] = [];
  const confirmedDependencyIds: string[] = [];
  const provisionalDependencyIds: string[] = [];

  // 1. Task ID uniqueness
  const taskById = new Map<string, (typeof plan.tasks)[0]>();
  const seenTaskIds = new Set<string>();
  for (const task of plan.tasks) {
    if (seenTaskIds.has(task.id)) {
      issues.push({
        code: "DUPLICATE_TASK_ID",
        severity: "error",
        affectedEntityIds: [task.id],
        message: `Duplicate task ID detected: '${task.id}'.`,
        suggestedAction: "Ensure every task has a unique identifier.",
      });
    } else {
      seenTaskIds.add(task.id);
      taskById.set(task.id, task);
    }
  }

  // 2. Edge ID uniqueness and duplicate relationship inspection
  const seenEdgeIds = new Set<string>();
  const edgesByPair = new Map<string, Array<Dependency | ExplainableDependency>>();

  for (const dep of plan.dependencies) {
    // Unique edge ID
    if (seenEdgeIds.has(dep.id)) {
      issues.push({
        code: "DUPLICATE_EDGE_ID",
        severity: "error",
        affectedEntityIds: [dep.id],
        message: `Duplicate dependency edge ID detected: '${dep.id}'.`,
        suggestedAction: "Assign a unique ID to every dependency edge.",
      });
    } else {
      seenEdgeIds.add(dep.id);
    }

    const pairKey = `${dep.fromTaskId}-->${dep.toTaskId}`;
    const existing = edgesByPair.get(pairKey) ?? [];
    existing.push(dep);
    edgesByPair.set(pairKey, existing);
  }

  // Inspect relationships between same node pairs
  for (const [pairKey, pairEdges] of edgesByPair.entries()) {
    if (pairEdges.length > 1) {
      // Check for exact duplicates vs legitimate distinct parallel edges
      const checkedPairs = new Set<string>();

      for (let i = 0; i < pairEdges.length; i++) {
        for (let j = i + 1; j < pairEdges.length; j++) {
          const e1 = pairEdges[i];
          const e2 = pairEdges[j];
          const compKey = `${e1.id}<->${e2.id}`;
          if (checkedPairs.has(compKey)) continue;
          checkedPairs.add(compKey);

          const maps1 = JSON.stringify(
            [...(e1.fieldMappings ?? [])]
              .map((m) => ({ s: m.sourceField, t: m.targetInput }))
              .sort((a, b) => a.s.localeCompare(b.s) || a.t.localeCompare(b.t))
          );
          const maps2 = JSON.stringify(
            [...(e2.fieldMappings ?? [])]
              .map((m) => ({ s: m.sourceField, t: m.targetInput }))
              .sort((a, b) => a.s.localeCompare(b.s) || a.t.localeCompare(b.t))
          );

          const isExactDuplicate =
            e1.blocksExecution === e2.blocksExecution && maps1 === maps2;

          if (isExactDuplicate) {
            issues.push({
              code: "EXACT_DUPLICATE_RELATIONSHIP",
              severity: "error",
              affectedEntityIds: [e1.id, e2.id],
              message: `Exact duplicate dependency edge detected between '${e1.fromTaskId}' and '${e1.toTaskId}' (${e1.id} and ${e2.id}) with identical execution blocking and field mappings.`,
              suggestedAction:
                "Deduplicate exact duplicate dependency records; remove redundant edge.",
            });
          } else {
            // Legitimate distinct parallel edges (preserve!)
            issues.push({
              code: "DISTINCT_PARALLEL_RELATIONSHIP",
              severity: "info",
              affectedEntityIds: [e1.id, e2.id],
              message: `Distinct parallel dependencies exist between '${e1.fromTaskId}' and '${e1.toTaskId}' (${e1.id} and ${e2.id}) carrying distinct field mappings or execution semantics.`,
              suggestedAction:
                "Both edges are preserved as distinct valid data contracts.",
            });
          }
        }
      }
    }
  }

  // 3. Endpoint validity, self-loops, field mappings, and trust
  for (const dep of plan.dependencies) {
    const fromExists = taskById.has(dep.fromTaskId);
    const toExists = taskById.has(dep.toTaskId);

    if (!fromExists) {
      missingTaskReferences.add(dep.fromTaskId);
      issues.push({
        code: "MISSING_TASK_ENDPOINT",
        severity: "error",
        affectedEntityIds: [dep.id, dep.fromTaskId],
        message: `Dependency edge '${dep.id}' references non-existent source task '${dep.fromTaskId}'.`,
        suggestedAction: "Point the dependency to an existing task or create the missing task.",
      });
    }

    if (!toExists) {
      missingTaskReferences.add(dep.toTaskId);
      issues.push({
        code: "MISSING_TASK_ENDPOINT",
        severity: "error",
        affectedEntityIds: [dep.id, dep.toTaskId],
        message: `Dependency edge '${dep.id}' references non-existent target task '${dep.toTaskId}'.`,
        suggestedAction: "Point the dependency to an existing task or create the missing task.",
      });
    }

    if (dep.fromTaskId === dep.toTaskId) {
      issues.push({
        code: "SELF_LOOP",
        severity: "error",
        affectedEntityIds: [dep.id, dep.fromTaskId],
        message: `Dependency edge '${dep.id}' forms a self-loop on task '${dep.fromTaskId}'.`,
        suggestedAction: "A task cannot depend on its own execution; remove the self-referencing edge.",
      });
    }

    // Field mapping validation
    if (fromExists && toExists && dep.fieldMappings && dep.fieldMappings.length > 0) {
      const fromTask = taskById.get(dep.fromTaskId)!;
      const toTask = taskById.get(dep.toTaskId)!;

      const availableOutputs = fromTask.outputs ? Object.keys(fromTask.outputs) : [];
      const declaredInputs = toTask.inputs ? Object.keys(toTask.inputs) : [];

      for (const mapping of dep.fieldMappings) {
        // 1. Source field validation
        if (!mapping.sourceField || mapping.sourceField.trim() === "") {
          const mappingKey = `${dep.id}:[empty]->${mapping.targetInput}`;
          invalidFieldMappings.add(mappingKey);
          issues.push({
            code: "INVALID_FIELD_MAPPING_SOURCE",
            severity: "error",
            affectedEntityIds: [dep.id, dep.fromTaskId],
            message: `Dependency '${dep.id}' has an empty or missing source field mapping.`,
            suggestedAction: "Specify a non-empty sourceField from the upstream task's outputs.",
          });
        } else if (availableOutputs.length > 0 && !availableOutputs.includes(mapping.sourceField)) {
          const mappingKey = `${dep.id}:${mapping.sourceField}->${mapping.targetInput}`;
          invalidFieldMappings.add(mappingKey);
          issues.push({
            code: "INVALID_FIELD_MAPPING_SOURCE",
            severity: "error",
            affectedEntityIds: [dep.id, dep.fromTaskId],
            message: `Dependency '${dep.id}' consumes field '${mapping.sourceField}' not produced in '${dep.fromTaskId}' outputs (available: [${availableOutputs.join(", ")}]).`,
            suggestedAction: "Update the field mapping or declare the output field on the source task.",
          });
        }

        // 2. Target input validation
        if (!mapping.targetInput || mapping.targetInput.trim() === "") {
          const mappingKey = `${dep.id}:${mapping.sourceField}->[empty]`;
          invalidFieldMappings.add(mappingKey);
          issues.push({
            code: "INVALID_FIELD_MAPPING_TARGET",
            severity: "error",
            affectedEntityIds: [dep.id, dep.toTaskId],
            message: `Dependency '${dep.id}' has an empty or missing target input field mapping.`,
            suggestedAction: "Specify a non-empty targetInput identifier on the downstream task.",
          });
        } else {
          // Check if targetInput exists in destination task inputs
          const isTargetDeclared = declaredInputs.includes(mapping.targetInput);
          const isOptionalMapping = mapping.optional === true;

          if (!isTargetDeclared) {
            if (isOptionalMapping) {
              issues.push({
                code: "OPTIONAL_MAPPING_NOT_DECLARED",
                severity: "info",
                affectedEntityIds: [dep.id, dep.toTaskId],
                message: `Optional dependency mapping '${mapping.sourceField} -> ${mapping.targetInput}' on '${dep.id}' is not declared in '${dep.toTaskId}.inputs'.`,
                suggestedAction: "This optional mapping is permitted as a non-binding contextual parameter.",
              });
            } else {
              const mappingKey = `${dep.id}:${mapping.sourceField}->${mapping.targetInput}`;
              invalidFieldMappings.add(mappingKey);
              issues.push({
                code: "NONEXISTENT_TARGET_INPUT",
                severity: "error",
                affectedEntityIds: [dep.id, dep.toTaskId],
                message: `Destination task '${dep.toTaskId}' does not declare required input field '${mapping.targetInput}' (declared inputs: [${declaredInputs.join(", ")}]).`,
                suggestedAction: `Declare '${mapping.targetInput}' in '${dep.toTaskId}.inputs' or mark the field mapping as optional: true.`,
              });
            }
          }
        }
      }
    }

    // Edge explanation check
    const reason = dep.reason?.trim();
    if (!reason) {
      issues.push({
        code: "MISSING_EDGE_EXPLANATION",
        severity: "warning",
        affectedEntityIds: [dep.id],
        message: `Dependency edge '${dep.id}' has no human-readable operational reason.`,
        suggestedAction: "Provide an operational explanation justifying why this dependency exists.",
      });
    }

    // Trust & confirmation status categorization
    const status = dep.confirmationStatus ?? "confirmed";
    if (status === "unreviewed") {
      unreviewedDependencyIds.push(dep.id);
      issues.push({
        code: "UNREVIEWED_DEPENDENCY",
        severity: "warning",
        affectedEntityIds: [dep.id],
        message: `Dependency '${dep.id}' is unreviewed (newly imported or proposed).`,
        suggestedAction: "An operator must inspect and confirm this dependency before recovery operations commit.",
      });
    } else if (status === "reviewed") {
      reviewedDependencyIds.push(dep.id);
    } else if (status === "confirmed") {
      confirmedDependencyIds.push(dep.id);
    } else if (status === "provisional") {
      provisionalDependencyIds.push(dep.id);
      issues.push({
        code: "PROVISIONAL_DEPENDENCY",
        severity: "info",
        affectedEntityIds: [dep.id],
        message: `Dependency '${dep.id}' is a provisional planning assumption.`,
        suggestedAction: "Acknowledge that recovery plans depending on this edge remain provisional.",
      });
    }
  }

  // 4. Cycle Detection: Kahn's Algorithm + Tarjan's SCC for Accurate Diagnostics
  let hasCycles = false;
  let cycleNodes: string[] = [];
  let blockedByCycleNodes: string[] = [];

  const validTaskIds = Array.from(taskById.keys());
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const tid of validTaskIds) {
    inDegree.set(tid, 0);
    adjacency.set(tid, []);
  }

  for (const dep of plan.dependencies) {
    if (dep.fromTaskId !== dep.toTaskId && taskById.has(dep.fromTaskId) && taskById.has(dep.toTaskId)) {
      adjacency.get(dep.fromTaskId)!.push(dep.toTaskId);
      inDegree.set(dep.toTaskId, (inDegree.get(dep.toTaskId) ?? 0) + 1);
    }
  }

  // Step 4A: Kahn's Algorithm to detect if any cycle exists
  const queue: string[] = [];
  for (const [tid, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(tid);
    }
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    visitedCount++;
    for (const nxt of adjacency.get(curr) ?? []) {
      const nextDeg = inDegree.get(nxt)! - 1;
      inDegree.set(nxt, nextDeg);
      if (nextDeg === 0) {
        queue.push(nxt);
      }
    }
  }

  if (visitedCount < validTaskIds.length) {
    hasCycles = true;
    const unprocessedNodes = validTaskIds.filter((tid) => (inDegree.get(tid) ?? 0) > 0);

    // Step 4B: Tarjan's Strongly Connected Components algorithm
    // Finds the EXACT cycles among unprocessed nodes, separating actual cycle members from downstream blocked nodes
    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    function strongConnect(v: string) {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      for (const w of adjacency.get(v) ?? []) {
        if (!unprocessedNodes.includes(w)) continue;
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        sccs.push(scc);
      }
    }

    for (const node of unprocessedNodes) {
      if (!indices.has(node)) {
        strongConnect(node);
      }
    }

    // Actual cycle members are nodes in SCCs of size > 1, or size == 1 with a self-loop
    const actualCycleSet = new Set<string>();
    for (const scc of sccs) {
      if (scc.length > 1) {
        for (const node of scc) actualCycleSet.add(node);
      } else if (scc.length === 1) {
        const singleNode = scc[0];
        if (adjacency.get(singleNode)?.includes(singleNode)) {
          actualCycleSet.add(singleNode);
        }
      }
    }

    cycleNodes = Array.from(actualCycleSet).sort();
    // Downstream blocked nodes are unprocessed nodes NOT in the actual cycle
    blockedByCycleNodes = unprocessedNodes
      .filter((node) => !actualCycleSet.has(node))
      .sort();

    issues.push({
      code: "DIRECTED_CYCLE",
      severity: "error",
      affectedEntityIds: cycleNodes,
      message: `Directed cycle detected involving actual cycle members: [${cycleNodes.join(", ")}].`,
      suggestedAction:
        "Remove or reverse at least one cyclic dependency edge among the cycle members to restore an acyclic DAG.",
    });

    if (blockedByCycleNodes.length > 0) {
      issues.push({
        code: "BLOCKED_BY_CYCLE",
        severity: "error",
        affectedEntityIds: blockedByCycleNodes,
        message: `Downstream task(s) [${blockedByCycleNodes.join(", ")}] are not part of any cycle, but their execution is blocked by upstream cycles.`,
        suggestedAction: `Resolve the upstream cycle in [${cycleNodes.join(", ")}] to unblock execution of these downstream tasks.`,
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning").map((i) => i.message);

  return {
    isValid: !hasErrors,
    hasCycles,
    cycleNodes,
    blockedByCycleNodes,
    issues,
    missingTaskReferences: Array.from(missingTaskReferences),
    invalidFieldMappings: Array.from(invalidFieldMappings),
    unreviewedDependencyIds,
    reviewedDependencyIds,
    confirmedDependencyIds,
    provisionalDependencyIds,
    hasUnreviewedDependencies: unreviewedDependencyIds.length > 0,
    warnings,
  };
}
