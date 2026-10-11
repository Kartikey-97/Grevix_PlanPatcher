import type { Plan } from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import {
  validateExplainableGraph,
  type GraphValidationResult,
} from "../graph/validate-explainable";
import { topologicalSort } from "./topological-sort";

export const DEFAULT_TOLERANCE = 1e-6;

export interface SchedulableTask {
  id: string;
  durationHours: number;
  [key: string]: unknown;
}

export interface SchedulableDependency {
  id?: string;
  fromTaskId: string;
  toTaskId: string;
  blocksExecution?: boolean;
  [key: string]: unknown;
}

export interface ScheduleOptions {
  /**
   * Explicit project deadline in hours.
   * If not provided, latest-start, latest-finish, and deadline slack are not computed,
   * clearly distinguishing earliest-finish from deadline-constrained metrics.
   */
  deadlineHours?: number;

  /**
   * Floating-point tolerance for zero-slack and path comparisons.
   * Default: 1e-6.
   */
  tolerance?: number;

  /**
   * Whether to run full explainable graph validation before scheduling.
   * Default: true.
   */
  enforceValidation?: boolean;
}

export interface TaskSchedule {
  taskId: string;
  durationHours: number;
  earliestStart: number;
  earliestFinish: number;

  /**
   * Latest start anchored at project deadline (when deadlineHours is provided).
   */
  latestStart?: number;

  /**
   * Latest finish anchored at project deadline (when deadlineHours is provided).
   */
  latestFinish?: number;

  /**
   * Slack relative to the project deadline: latestStart - earliestStart.
   * Can be positive, zero, or negative (when deadline is infeasible).
   */
  slack?: number;

  /**
   * Explicit alias for slack to clearly distinguish deadline slack from criticalPathFloat.
   */
  deadlineSlack?: number;

  /**
   * True if deadline slack is negative (deadline < earliest possible finish).
   */
  isDeadlineViolated: boolean;

  /**
   * Latest finish anchored at earliest project finish (projectFinishHours).
   */
  latestFinishProject: number;

  /**
   * Latest start anchored at earliest project finish (projectFinishHours).
   */
  latestStartProject: number;

  /**
   * Critical-path float anchored at earliest project finish: latestStartProject - earliestStart.
   * Always >= 0 in an acyclic DAG. Exactly 0 for tasks lying on a critical path.
   */
  criticalPathFloat: number;

  /**
   * Whether this task is on a critical path (criticalPathFloat <= tolerance).
   */
  isCritical: boolean;
}

export interface ScheduleResult {
  success: boolean;
  error?: string;
  validationIssues?: string[];
  tasks: Record<string, TaskSchedule>;
  topologicalOrder: string[];

  /**
   * Earliest finish across all tasks in the project.
   */
  projectEarliestFinish: number;

  /**
   * Project finish time (alias for projectEarliestFinish).
   */
  projectFinishHours: number;

  /**
   * Whether an explicit deadline was provided.
   */
  hasDeadline: boolean;

  /**
   * Explicit project deadline in hours (if supplied).
   */
  deadlineHours?: number;

  /**
   * Project deadline margin / slack: deadlineHours - projectEarliestFinish.
   */
  projectSlack?: number;

  /**
   * Alias for projectSlack representing deadline margin.
   */
  projectDeadlineMargin?: number;

  /**
   * Whether projectEarliestFinish <= deadlineHours within numerical tolerance.
   */
  isDeadlineFeasible?: boolean;

  /**
   * Tasks lying on any critical path (criticalPathFloat <= tolerance).
   */
  criticalTaskIds: string[];

  /**
   * All tying longest paths from start to project completion.
   */
  criticalPaths: string[][];

  /**
   * Tasks where deadlineSlack is zero (|deadlineSlack| <= tolerance). Only present when deadline is provided.
   */
  zeroSlackTaskIds: string[];

  /**
   * Tasks where criticalPathFloat is zero (|criticalPathFloat| <= tolerance).
   */
  zeroFloatTaskIds: string[];
}

/**
 * Generic Deterministic Scheduling Engine.
 *
 * Implements:
 * 1. Precedence rules: Only dependencies with blocksExecution !== false impose scheduling precedence.
 * 2. Forward pass:
 *    - ES(v) = max(EF(u)) across blocking predecessors u.
 *    - EF(v) = ES(v) + duration(v).
 *    - Tasks without blocking predecessors start at time 0.0.
 * 3. Project finish: Maximum EF across all tasks in the graph (projectFinishHours).
 * 4. Critical-Path Float (Backward pass anchored at projectFinishHours):
 *    - LF_proj(v) = min(LS_proj(w)) across blocking successors w (initialized to projectFinishHours for terminal tasks).
 *    - LS_proj(v) = LF_proj(v) - duration(v).
 *    - criticalPathFloat(v) = LS_proj(v) - ES(v).
 *    - Critical tasks have criticalPathFloat <= tolerance (0 float).
 * 5. Deadline Slack (Backward pass anchored at deadlineHours, when provided):
 *    - LF_deadline(v) = min(LS_deadline(w)) across blocking successors w (initialized to deadlineHours for terminal tasks).
 *    - LS_deadline(v) = LF_deadline(v) - duration(v).
 *    - deadlineSlack(v) = LS_deadline(v) - ES(v).
 * 6. Disconnected components: Parallel branches execute concurrently without artificial serialization.
 * 7. Impossible deadlines: Explicitly reports negative deadline slack and isDeadlineFeasible = false without
 *    manufacturing artificial durations or hiding deadline violations.
 * 8. Graph safety: Refuses to schedule structurally invalid or cyclic graphs, returning structured diagnostics.
 */
export function scheduleGraph(
  tasks: SchedulableTask[],
  dependencies: SchedulableDependency[],
  options?: ScheduleOptions
): ScheduleResult {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;
  const enforceValidation = options?.enforceValidation ?? true;

  // 1. Duration validation
  for (const t of tasks) {
    if (typeof t.durationHours !== "number" || isNaN(t.durationHours) || t.durationHours < 0) {
      return {
        success: false,
        error: `Task '${t.id}' has invalid durationHours (${t.durationHours}). Durations must be non-negative numbers.`,
        validationIssues: [`[INVALID_DURATION] Task '${t.id}' durationHours must be >= 0.`],
        tasks: {},
        topologicalOrder: [],
        projectEarliestFinish: 0,
        projectFinishHours: 0,
        hasDeadline: options?.deadlineHours !== undefined,
        deadlineHours: options?.deadlineHours,
        criticalTaskIds: [],
        criticalPaths: [],
        zeroSlackTaskIds: [],
        zeroFloatTaskIds: [],
      };
    }
  }

  // 2. Graph safety & structural validation
  if (enforceValidation) {
    const normalizedTasks: Plan["tasks"] = tasks.map((t) => ({
      id: t.id,
      title: typeof t.title === "string" ? t.title : t.id,
      durationHours: t.durationHours,
      policy: (t.policy as "fixed" | "replaceable" | "optional") ?? "replaceable",
      cost: typeof t.cost === "number" ? t.cost : 0,
      status: typeof t.status === "string" ? t.status : "pending",
      priority: typeof t.priority === "number" ? t.priority : 1,
      inputs: (t.inputs as Record<string, unknown>) ?? {},
      outputs: (t.outputs as Record<string, unknown>) ?? {},
    }));

    const normalizedDeps = dependencies.map((d) => ({
      id: d.id ?? `${d.fromTaskId}->${d.toTaskId}`,
      fromTaskId: d.fromTaskId,
      toTaskId: d.toTaskId,
      blocksExecution: d.blocksExecution !== false,
      fieldMappings: Array.isArray(d.fieldMappings) ? d.fieldMappings : [],
      reason: typeof d.reason === "string" ? d.reason : "Execution precedence constraint",
      origin: (d.origin as "manual" | "system_template" | "ai_suggested" | "reconciled") ?? "system_template",
      confirmationStatus: (d.confirmationStatus as "unreviewed" | "reviewed" | "confirmed" | "provisional") ?? "confirmed",
      modificationHistory: [],
    }));

    const validationResult: GraphValidationResult = validateExplainableGraph({
      tasks: normalizedTasks,
      dependencies: normalizedDeps,
    });

    if (!validationResult.isValid) {
      const errorIssues = validationResult.issues.filter((i) => i.severity === "error");
      return {
        success: false,
        error: `Graph validation failed: ${errorIssues.map((i) => i.message).join("; ")}`,
        validationIssues: validationResult.issues.map((i) => `[${i.code}] ${i.message}`),
        tasks: {},
        topologicalOrder: [],
        projectEarliestFinish: 0,
        projectFinishHours: 0,
        hasDeadline: options?.deadlineHours !== undefined,
        deadlineHours: options?.deadlineHours,
        criticalTaskIds: [],
        criticalPaths: [],
        zeroSlackTaskIds: [],
        zeroFloatTaskIds: [],
      };
    }
  }

  // 3. Deterministic Topological Sorting on blocking dependencies
  const sortResult = topologicalSort(tasks, dependencies, { onlyBlocking: true });
  if (!sortResult.success) {
    return {
      success: false,
      error: sortResult.error ?? "Failed to sort graph topologically.",
      validationIssues: sortResult.cycleNodes.length > 0
        ? [`[DIRECTED_CYCLE] Cycle detected in tasks: [${sortResult.cycleNodes.join(", ")}]`]
        : sortResult.missingTaskReferences.map((ref) => `[MISSING_TASK_ENDPOINT] Missing task: ${ref}`),
      tasks: {},
      topologicalOrder: [],
      projectEarliestFinish: 0,
      projectFinishHours: 0,
      hasDeadline: options?.deadlineHours !== undefined,
      deadlineHours: options?.deadlineHours,
      criticalTaskIds: [],
      criticalPaths: [],
      zeroSlackTaskIds: [],
      zeroFloatTaskIds: [],
    };
  }

  // 4. Index blocking predecessors and successors
  const blockingPredecessors = new Map<string, string[]>();
  const blockingSuccessors = new Map<string, string[]>();
  for (const tid of sortResult.order) {
    blockingPredecessors.set(tid, []);
    blockingSuccessors.set(tid, []);
  }

  for (const dep of dependencies) {
    if (dep.blocksExecution !== false) {
      blockingPredecessors.get(dep.toTaskId)?.push(dep.fromTaskId);
      blockingSuccessors.get(dep.fromTaskId)?.push(dep.toTaskId);
    }
  }

  // Sort predecessor and successor lists deterministically
  for (const preds of blockingPredecessors.values()) {
    preds.sort();
  }
  for (const succs of blockingSuccessors.values()) {
    succs.sort();
  }

  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  // 5. Forward Pass: Earliest Start (ES) and Earliest Finish (EF)
  const earliestTimes = new Map<string, { start: number; finish: number }>();
  for (const tid of sortResult.order) {
    const task = tasksById.get(tid)!;
    const preds = blockingPredecessors.get(tid) ?? [];
    let start = 0;
    for (const p of preds) {
      const pFinish = earliestTimes.get(p)!.finish;
      if (pFinish > start) {
        start = pFinish;
      }
    }
    const finish = start + task.durationHours;
    earliestTimes.set(tid, { start, finish });
  }

  // 6. Project Earliest Finish (projectFinishHours)
  let projectEarliestFinish = 0;
  for (const { finish } of earliestTimes.values()) {
    if (finish > projectEarliestFinish) {
      projectEarliestFinish = finish;
    }
  }
  const projectFinishHours = projectEarliestFinish;

  const reverseOrder = [...sortResult.order].reverse();

  // 7. Backward Pass A: Critical-Path Float anchored at projectFinishHours
  // For terminal tasks: LF_proj = projectFinishHours.
  const projectAnchorTimes = new Map<
    string,
    { start: number; finish: number; float: number }
  >();

  for (const tid of reverseOrder) {
    const task = tasksById.get(tid)!;
    const succs = blockingSuccessors.get(tid) ?? [];
    let finish: number;

    if (succs.length === 0) {
      finish = projectFinishHours;
    } else {
      finish = Infinity;
      for (const s of succs) {
        const sStart = projectAnchorTimes.get(s)!.start;
        if (sStart < finish) {
          finish = sStart;
        }
      }
    }

    const start = finish - task.durationHours;
    const earliestStart = earliestTimes.get(tid)!.start;
    const rawFloat = start - earliestStart;
    // Clean up floating point representation within tolerance
    const float = Math.abs(rawFloat) <= tolerance ? 0 : rawFloat;
    projectAnchorTimes.set(tid, { start, finish, float });
  }

  // 8. Backward Pass B: Deadline Slack anchored at deadlineHours (when deadlineHours is provided)
  const hasDeadline = options?.deadlineHours !== undefined;
  const deadlineHours = options?.deadlineHours;
  const deadlineAnchorTimes = new Map<
    string,
    { start: number; finish: number; slack: number }
  >();

  if (hasDeadline) {
    for (const tid of reverseOrder) {
      const task = tasksById.get(tid)!;
      const succs = blockingSuccessors.get(tid) ?? [];
      let finish: number;

      if (succs.length === 0) {
        finish = deadlineHours!;
      } else {
        finish = Infinity;
        for (const s of succs) {
          const sStart = deadlineAnchorTimes.get(s)!.start;
          if (sStart < finish) {
            finish = sStart;
          }
        }
      }

      const start = finish - task.durationHours;
      const earliestStart = earliestTimes.get(tid)!.start;
      const slack = start - earliestStart;
      deadlineAnchorTimes.set(tid, { start, finish, slack });
    }
  }

  // 9. Critical Path Identification
  // A task is critical if criticalPathFloat <= tolerance.
  // Multiple tying longest paths are traced backwards from terminal critical tasks to source tasks.
  function findCriticalPathsBackwards(currentId: string): string[][] {
    const preds = blockingPredecessors.get(currentId) ?? [];
    const currentStart = earliestTimes.get(currentId)!.start;

    const criticalPreds = preds.filter((p) => {
      const pFloat = projectAnchorTimes.get(p)!.float;
      const pFinish = earliestTimes.get(p)!.finish;
      return (
        pFloat <= tolerance &&
        Math.abs(currentStart - pFinish) <= tolerance
      );
    });

    if (criticalPreds.length === 0) {
      return [[currentId]];
    }

    const paths: string[][] = [];
    for (const p of criticalPreds) {
      const subPaths = findCriticalPathsBackwards(p);
      for (const sub of subPaths) {
        paths.push([...sub, currentId]);
      }
    }
    return paths;
  }

  let criticalPaths: string[][] = [];
  if (tasks.length > 0) {
    const terminalCriticalTasks = sortResult.order.filter((tid) => {
      const succs = blockingSuccessors.get(tid) ?? [];
      const float = projectAnchorTimes.get(tid)!.float;
      return succs.length === 0 && float <= tolerance;
    });

    for (const termId of terminalCriticalTasks) {
      const pathsForTerminal = findCriticalPathsBackwards(termId);
      criticalPaths.push(...pathsForTerminal);
    }
  }

  // Sort critical paths deterministically
  criticalPaths.sort((a, b) => a.join("->").localeCompare(b.join("->")));

  const criticalTaskIdsSet = new Set<string>();
  for (const tid of sortResult.order) {
    if (projectAnchorTimes.get(tid)!.float <= tolerance) {
      criticalTaskIdsSet.add(tid);
    }
  }
  const criticalTaskIds = Array.from(criticalTaskIdsSet).sort();
  const zeroFloatTaskIds = [...criticalTaskIds];

  // Zero-slack tasks (only defined when deadline is provided: |slack| <= tolerance)
  const zeroSlackTaskIds: string[] = [];
  if (hasDeadline) {
    for (const tid of sortResult.order) {
      const s = deadlineAnchorTimes.get(tid)?.slack;
      if (s !== undefined && Math.abs(s) <= tolerance) {
        zeroSlackTaskIds.push(tid);
      }
    }
  }

  // 10. Construct TaskSchedule map
  const taskScheduleMap: Record<string, TaskSchedule> = {};
  for (const tid of sortResult.order) {
    const task = tasksById.get(tid)!;
    const e = earliestTimes.get(tid)!;
    const p = projectAnchorTimes.get(tid)!;
    const d = deadlineAnchorTimes.get(tid);

    const isCritical = criticalTaskIdsSet.has(tid);
    const slack = d?.slack;
    const isDeadlineViolated = slack !== undefined && slack < -tolerance;

    taskScheduleMap[tid] = {
      taskId: tid,
      durationHours: task.durationHours,
      earliestStart: e.start,
      earliestFinish: e.finish,
      latestStart: d?.start,
      latestFinish: d?.finish,
      slack,
      deadlineSlack: slack,
      isDeadlineViolated,
      latestStartProject: p.start,
      latestFinishProject: p.finish,
      criticalPathFloat: p.float,
      isCritical,
    };
  }

  // 11. Compute project-level deadline slack and feasibility
  const projectSlack =
    deadlineHours !== undefined ? deadlineHours - projectEarliestFinish : undefined;
  const projectDeadlineMargin = projectSlack;
  const isDeadlineFeasible =
    deadlineHours !== undefined
      ? projectEarliestFinish <= deadlineHours + tolerance
      : undefined;

  return {
    success: true,
    tasks: taskScheduleMap,
    topologicalOrder: sortResult.order,
    projectEarliestFinish,
    projectFinishHours,
    hasDeadline,
    deadlineHours,
    projectSlack,
    projectDeadlineMargin,
    isDeadlineFeasible,
    criticalTaskIds,
    criticalPaths,
    zeroSlackTaskIds,
    zeroFloatTaskIds,
  };
}

/**
 * Schedules a canonical Plan.
 */
export function schedulePlan(
  plan: Plan,
  options?: ScheduleOptions
): ScheduleResult {
  const deadlineHours =
    options?.deadlineHours !== undefined
      ? options.deadlineHours
      : plan.constraints?.deadlineHours;

  return scheduleGraph(plan.tasks, plan.dependencies, {
    ...options,
    deadlineHours,
  });
}

/**
 * Schedules an ExplainableDependencyGraph.
 */
export function scheduleExplainableGraph(
  graph: ExplainableDependencyGraph,
  options?: ScheduleOptions
): ScheduleResult {
  const schedulableTasks: SchedulableTask[] = graph.nodes.map((node) => ({
    id: node.id,
    durationHours: node.durationHours,
    title: node.title,
    policy: node.policy,
  }));

  return scheduleGraph(schedulableTasks, graph.edges, options);
}
