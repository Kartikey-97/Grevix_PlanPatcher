import type {
  Plan,
  Task,
  Dependency,
  GlobalConstraints,
} from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import {
  CandidatePatchSchema,
  type CandidatePatch,
  type TaskOverride,
} from "../schemas/patch.schema";
import type {
  VerificationStatus,
  CandidateMetrics,
  ValidationReport,
  MovedTaskStartTime,
} from "../schemas/recovery-result.schema";
import type {
  SyncState,
  PublicationStatus,
  ConflictRecord,
} from "../schemas/sync.schema";
import { rebuildGraph } from "../graph/rebuild-graph";
import { validateExplainableGraph } from "../graph/validate-explainable";
import { schedulePlan, DEFAULT_TOLERANCE } from "./schedule";
import {
  validateConstraints,
  getDomainValidators,
  type ConstraintIssue,
  type ConstraintValidationResult,
} from "./validate-constraints";
import {
  propagateImpact,
  type ImpactPropagationResult,
} from "./propagate-impact";
import { guardRecovery } from "./guard-recovery";

export type FeasibilityClassification =
  | "feasible"
  | "provisionally_feasible"
  | "infeasible";

export interface CandidateApplicationResult {
  candidatePlan: Plan;
  candidateGraph: ExplainableDependencyGraph;
  removedDependencyIds: string[];
  applicationIssues: ConstraintIssue[];
}

export interface CandidateEvaluationResult {
  candidateId: string;
  label: string;
  classification: FeasibilityClassification;
  explanation: string;
  candidatePlan: Plan;
  candidateGraph: ExplainableDependencyGraph;
  projectedTotalCost: number;
  budgetLimit?: number | null;
  budgetMargin?: number | null;
  taskCount: number;
  earliestProjectFinishHours: number;
  deadlineHours?: number | null;
  deadlineSlackHours?: number | null;
  changedTaskIds: string[];
  removedTaskIds: string[];
  lostTaskIds: string[];
  preservedTaskIds: string[];
  removedDependencyIds: string[];
  movedTaskStartTimes: MovedTaskStartTime[];
  weightedMeanAbsoluteStartShiftHours: number;
  metrics: CandidateMetrics;
  unknownFacts: string[];
  verificationStatus: VerificationStatus;
  verificationRequirements: string[];
  validation: ValidationReport;
  constraintViolations: ConstraintIssue[];
  warnings: string[];
  suggestedActions: string[];
  impactAnalysis: ImpactPropagationResult;
}

export interface BaselineEvaluationSummary {
  totalCost: number;
  projectFinishHours: number;
  budgetLimit?: number | null;
  budgetMargin?: number | null;
  deadlineHours?: number | null;
  deadlineSlackHours?: number | null;
  isFeasible: boolean;
  violations: ConstraintIssue[];
}

export interface EvaluateCandidatesInput {
  baselinePlan: Plan;
  baselineGraph: ExplainableDependencyGraph;
  candidates: CandidatePatch[];
  constraintOverrides?: Partial<GlobalConstraints>;
  syncState?: SyncState;
  publicationStatus?: PublicationStatus;
  activeConflicts?: ConflictRecord[];
  isOffline?: boolean;
  tolerance?: number;
}

export interface EvaluateCandidatesResult {
  success: boolean;
  error?: string;
  blockingIssues: string[];
  warnings: string[];
  baselineEvaluation?: BaselineEvaluationSummary;
  evaluations: CandidateEvaluationResult[];
  feasibleCount: number;
  provisionallyFeasibleCount: number;
  infeasibleCount: number;
}

function clonePlan(plan: Plan): Plan {
  return JSON.parse(JSON.stringify(plan));
}

/**
 * Applies a candidate patch to a clean deep copy of the baseline plan.
 * Explicitly records incident dependencies removed with tasks and detects dangling edges.
 */
export function applyCandidateToPlan(
  baselinePlan: Plan,
  candidate: CandidatePatch,
  constraintOverrides?: Partial<GlobalConstraints>
): CandidateApplicationResult {
  const candidatePlan = clonePlan(baselinePlan);
  const applicationIssues: ConstraintIssue[] = [];
  const removedTaskIds = new Set(candidate.removedTaskIds);

  // Update plan revision for the candidate
  candidatePlan.planRevision = (baselinePlan.planRevision ?? 1) + 1;

  // 1. Fixed task removal safety check
  for (const removedId of candidate.removedTaskIds) {
    const baseTask = baselinePlan.tasks.find((t) => t.id === removedId);
    if (baseTask?.policy === "fixed") {
      applicationIssues.push({
        code: "FIXED_TASK_REMOVED",
        severity: "error",
        affectedTaskIds: [removedId],
        message: `Fixed task "${removedId}" (${baseTask.title}) cannot be removed by candidate "${candidate.id}".`,
        suggestedAction: "Restore the fixed task to candidate plan.",
      });
    }
  }

  // 2. Remove tasks
  candidatePlan.tasks = candidatePlan.tasks.filter(
    (t) => !removedTaskIds.has(t.id)
  );

  // 3. Remove incident dependencies explicitly and record them
  const removedDependencyIds: string[] = [];
  const remainingDependencies: Dependency[] = [];

  for (const dep of candidatePlan.dependencies) {
    const isSourceRemoved = removedTaskIds.has(dep.fromTaskId);
    const isTargetRemoved = removedTaskIds.has(dep.toTaskId);

    if (isSourceRemoved || isTargetRemoved) {
      removedDependencyIds.push(dep.id);
    } else {
      remainingDependencies.push(dep);
    }
  }
  candidatePlan.dependencies = remainingDependencies;

  // 4. Verify no dangling dependency endpoints remain
  const remainingTaskIds = new Set(candidatePlan.tasks.map((t) => t.id));
  for (const dep of candidatePlan.dependencies) {
    if (!remainingTaskIds.has(dep.fromTaskId)) {
      applicationIssues.push({
        code: "INVALID_GRAPH_STRUCTURE",
        severity: "error",
        message: `Dependency "${dep.id}" points to missing source task "${dep.fromTaskId}".`,
        suggestedAction: "Restore source task or remove dependency.",
      });
    }
    if (!remainingTaskIds.has(dep.toTaskId)) {
      applicationIssues.push({
        code: "INVALID_GRAPH_STRUCTURE",
        severity: "error",
        message: `Dependency "${dep.id}" points to missing target task "${dep.toTaskId}".`,
        suggestedAction: "Restore target task or remove dependency.",
      });
    }
  }

  // 5. Apply task overrides
  for (const [taskId, override] of Object.entries(candidate.taskOverrides)) {
    const task = candidatePlan.tasks.find((t) => t.id === taskId);
    if (!task) continue;

    // Check fixed task modification
    const baseTask = baselinePlan.tasks.find((t) => t.id === taskId);
    if (baseTask?.policy === "fixed") {
      const changedProps: string[] = [];
      if (override.cost !== undefined && override.cost !== baseTask.cost)
        changedProps.push("cost");
      if (
        override.durationHours !== undefined &&
        override.durationHours !== baseTask.durationHours
      )
        changedProps.push("durationHours");
      if (
        override.priority !== undefined &&
        override.priority !== baseTask.priority
      )
        changedProps.push("priority");
      if (override.policy !== undefined && override.policy !== baseTask.policy)
        changedProps.push("policy");
      if (override.inputs && Object.keys(override.inputs).length > 0)
        changedProps.push("inputs");
      if (override.outputs && Object.keys(override.outputs).length > 0)
        changedProps.push("outputs");

      if (changedProps.length > 0) {
        applicationIssues.push({
          code: "FIXED_TASK_MODIFIED",
          severity: "error",
          affectedTaskIds: [taskId],
          message: `Fixed task "${taskId}" (${baseTask.title}) was modified in candidate "${candidate.id}": [${changedProps.join(
            ", "
          )}].`,
          suggestedAction: "Revert edits to fixed task.",
        });
      }
    }

    if (override.title !== undefined) task.title = override.title;
    if (override.cost !== undefined) task.cost = override.cost;
    if (override.durationHours !== undefined)
      task.durationHours = override.durationHours;
    if (override.priority !== undefined) task.priority = override.priority;
    if (override.policy !== undefined) task.policy = override.policy;
    if (override.status !== undefined) task.status = override.status;
    if (override.inputs !== undefined) {
      task.inputs = { ...task.inputs, ...override.inputs };
    }
    if (override.outputs !== undefined) {
      task.outputs = { ...task.outputs, ...override.outputs };
    }
  }

  // 6. Apply merged constraint overrides
  candidatePlan.constraints = {
    ...candidatePlan.constraints,
    ...(constraintOverrides ?? {}),
    ...(candidate.constraintOverrides ?? {}),
  };

  // 7. Rebuild graph from candidate plan
  const candidateGraph = rebuildGraph(candidatePlan, {
    graphId: `graph-${candidatePlan.id}-candidate-${candidate.id}`,
    enforceValidation: false,
  });

  return {
    candidatePlan,
    candidateGraph,
    removedDependencyIds,
    applicationIssues,
  };
}

/**
 * Classifies candidate feasibility into feasible, provisionally_feasible, or infeasible.
 */
function classifyFeasibility(
  validation: ValidationReport,
  constraintViolations: ConstraintIssue[],
  unknownFacts: string[],
  domainUnverified: boolean,
  unconfirmedEdgesCount: number
): { classification: FeasibilityClassification; explanation: string } {
  // 1. Infeasible if any hard constraint fails or any error-severity issue exists
  const hasHardViolation =
    !validation.hardConstraintsPass ||
    constraintViolations.some((issue) => issue.severity === "error");

  if (hasHardViolation) {
    const errorReasons = constraintViolations
      .filter((i) => i.severity === "error")
      .map((i) => `[${i.code}] ${i.message}`);
    if (validation.failedReasons && validation.failedReasons.length > 0) {
      errorReasons.push(...validation.failedReasons);
    }
    const uniqueReasons = Array.from(new Set(errorReasons));
    return {
      classification: "infeasible",
      explanation: `Candidate violates hard constraints: ${uniqueReasons.join(
        "; "
      )}`,
    };
  }

  // 2. Provisionally feasible if hard constraints pass but material assumptions exist
  const provisionalReasons: string[] = [];
  if (unknownFacts.length > 0) {
    provisionalReasons.push(
      `Contains ${unknownFacts.length} unknown material fact(s): [${unknownFacts.join(
        ", "
      )}]`
    );
  }
  if (domainUnverified) {
    provisionalReasons.push(
      "Declared domain has no registered domain validator for independent verification"
    );
  }
  if (unconfirmedEdgesCount > 0) {
    provisionalReasons.push(
      `Graph contains ${unconfirmedEdgesCount} unconfirmed or unreviewed dependency edge(s)`
    );
  }
  const warningIssues = constraintViolations.filter(
    (i) => i.severity === "warning"
  );
  if (warningIssues.length > 0) {
    provisionalReasons.push(...warningIssues.map((w) => w.message));
  }

  if (provisionalReasons.length > 0) {
    return {
      classification: "provisionally_feasible",
      explanation: `Deterministic constraints pass, but candidate remains provisional: ${provisionalReasons.join(
        "; "
      )}`,
    };
  }

  // 3. Fully feasible
  return {
    classification: "feasible",
    explanation:
      "All applicable hard constraints pass, required domain validators verified the plan, and no unknown material facts or unverified assumptions remain.",
  };
}

/**
 * Evaluates a single candidate patch against the accepted baseline plan.
 */
export function evaluateCandidate(
  baselinePlan: Plan,
  baselineGraph: ExplainableDependencyGraph,
  candidate: CandidatePatch,
  constraintOverrides?: Partial<GlobalConstraints>,
  tolerance: number = DEFAULT_TOLERANCE
): CandidateEvaluationResult {
  // 1. Validate candidate patch against schema
  const parsedCandidate = CandidatePatchSchema.parse(candidate);

  // 2. Apply candidate to plan copy
  const {
    candidatePlan,
    candidateGraph,
    removedDependencyIds,
    applicationIssues,
  } = applyCandidateToPlan(
    baselinePlan,
    parsedCandidate,
    constraintOverrides
  );

  // 3. Check structural validity of candidate graph
  const graphValidation = validateExplainableGraph(candidatePlan);

  // 4. Baseline and candidate scheduling
  const baselineSched = schedulePlan(baselinePlan, {
    tolerance,
    enforceValidation: false,
  });

  const candidateSched = schedulePlan(candidatePlan, {
    tolerance,
    enforceValidation: false,
  });

  // Calculate moved task start times
  const movedTaskStartTimes: MovedTaskStartTime[] = [];
  const candidateTaskById = new Map(candidatePlan.tasks.map((t) => [t.id, t]));

  for (const [taskId, times] of Object.entries(candidateSched.tasks)) {
    const baseTimes = baselineSched.tasks[taskId];
    if (!baseTimes) continue;

    const delta = Math.abs(times.earliestStart - baseTimes.earliestStart);
    if (delta > tolerance) {
      const task = candidateTaskById.get(taskId);
      if (task) {
        movedTaskStartTimes.push({
          taskId,
          priority: task.priority,
          absoluteStartShiftHours: Number(delta.toFixed(6)),
        });
      }
    }
  }

  let weightedMeanShift = 0;
  if (movedTaskStartTimes.length > 0) {
    const totalPriority = movedTaskStartTimes.reduce(
      (sum, m) => sum + m.priority,
      0
    );
    const weightedSum = movedTaskStartTimes.reduce(
      (sum, m) => sum + m.priority * m.absoluteStartShiftHours,
      0
    );
    weightedMeanShift = totalPriority > 0 ? weightedSum / totalPriority : 0;
  }

  // 5. Impact propagation
  const impactAnalysis = propagateImpact({
    baselinePlan,
    baselineGraph,
    candidatePlan,
    tolerance,
  });

  // 6. Constraint validation
  const constraintValidation: ConstraintValidationResult = validateConstraints({
    baselinePlan,
    candidatePlan,
    candidateSchedule: candidateSched,
    constraintOverrides: {
      ...(constraintOverrides ?? {}),
      ...(parsedCandidate.constraintOverrides ?? {}),
    },
    tolerance,
  });

  // Combine application issues and constraint issues
  const allViolations: ConstraintIssue[] = [
    ...applicationIssues,
    ...constraintValidation.issues,
  ];

  if (!graphValidation.isValid) {
    const errorMessages = graphValidation.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message);
    allViolations.push({
      code: "INVALID_GRAPH_STRUCTURE",
      severity: "error",
      message: `Graph validation failed: ${errorMessages.join("; ")}`,
      suggestedAction: "Resolve graph cycles and reference errors.",
    });
  }

  // 7. Cost, budget & deadline metrics
  const totalCost = candidatePlan.tasks.reduce((sum, t) => sum + t.cost, 0);
  const budgetLimit = candidatePlan.constraints.budgetLimit;
  const budgetMargin =
    budgetLimit !== undefined ? budgetLimit - totalCost : null;
  const deadlineHours = candidatePlan.constraints.deadlineHours;
  const finish = candidateSched.projectEarliestFinish;
  const slack =
    deadlineHours !== undefined ? deadlineHours - finish : null;

  // 8. Normalized candidate metrics (E, L, C, M, Q, S, R)
  const originalTaskCount = baselinePlan.tasks.length;
  const originalPrioritySum = baselinePlan.tasks.reduce(
    (sum, t) => sum + t.priority,
    0
  );
  const originalTaskById = new Map(baselinePlan.tasks.map((t) => [t.id, t]));

  const e = Math.min(
    parsedCandidate.changedTaskIds.length / originalTaskCount,
    1.0
  );

  const lostPrioritySum = parsedCandidate.lostTaskIds.reduce((sum, id) => {
    const orig = originalTaskById.get(id);
    return sum + (orig ? orig.priority : 0);
  }, 0);
  const l =
    originalPrioritySum > 0
      ? Math.min(lostPrioritySum / originalPrioritySum, 1.0)
      : 0.0;

  let c: number | null = null;
  if (budgetLimit !== undefined) {
    c = budgetLimit > 0 ? totalCost / budgetLimit : totalCost === 0 ? 0.0 : 1.0;
  }

  const shiftRefHours =
    baselinePlan.scoring?.scheduleShiftReferenceHours ?? 8;
  const m = Math.min(weightedMeanShift / shiftRefHours, 1.0);

  const slackRefHours =
    baselinePlan.scoring?.deadlineSlackReferenceHours ?? 24;
  let q = 0.0;
  if (slack !== null) {
    if (slack < slackRefHours) {
      q = 1.0 - Math.max(slack, 0.0) / slackRefHours;
    }
  }

  const s = 0.7 * m + 0.3 * q;

  const factCountRef = baselinePlan.scoring?.uncertaintyFactCount ?? 5;
  const r = Math.min(parsedCandidate.unknownFacts.length / factCountRef, 1.0);

  const metrics: CandidateMetrics = {
    changeFootprint_E: Number(e.toFixed(8)),
    lostTaskValue_L: Number(l.toFixed(8)),
    budgetUsage_C: c !== null ? Number(c.toFixed(8)) : null,
    movement_M: Number(m.toFixed(8)),
    deadlinePressure_Q: Number(q.toFixed(8)),
    scheduleDisruption_S: Number(s.toFixed(8)),
    uncertainty_R: Number(r.toFixed(8)),
  };

  // 9. Validation Report
  const budgetPass =
    budgetLimit === undefined || totalCost <= budgetLimit + tolerance;
  const deadlinePass =
    deadlineHours === undefined || finish <= deadlineHours + tolerance;
  const fixedTasksPreserved = !allViolations.some((v) =>
    ["FIXED_TASK_REMOVED", "FIXED_TASK_MODIFIED"].includes(v.code)
  );
  const acyclic = !graphValidation.hasCycles;

  const capacityPass = !allViolations.some(
    (v) => v.code === "CAPACITY_INSUFFICIENT"
  );
  const accessibilityPass = !allViolations.some(
    (v) => v.code === "ACCESSIBILITY_NOT_MET"
  );

  const hardConstraintsPass =
    budgetPass &&
    deadlinePass &&
    fixedTasksPreserved &&
    acyclic &&
    capacityPass &&
    accessibilityPass &&
    !allViolations.some((v) => v.severity === "error");

  const validation: ValidationReport = {
    budgetPass,
    deadlinePass,
    capacityPass,
    accessibilityPass,
    fixedTasksPreserved,
    acyclic,
    hardConstraintsPass,
    failedReasons: allViolations
      .filter((v) => v.severity === "error")
      .map((v) => v.message),
  };

  // 10. Check domain validator presence
  let domainUnverified = false;
  if (baselinePlan.domain) {
    const domainValidators = getDomainValidators(baselinePlan.domain);
    if (domainValidators.length === 0) {
      domainUnverified = true;
    }
  }

  // 11. Count unconfirmed edges
  const unconfirmedEdgesCount = (candidateGraph.edges ?? []).filter(
    (d) => d.confirmationStatus !== "confirmed"
  ).length;

  // 12. Feasibility classification & explanation
  const { classification, explanation } = classifyFeasibility(
    validation,
    allViolations,
    parsedCandidate.unknownFacts,
    domainUnverified,
    unconfirmedEdgesCount
  );

  // 13. Verification status & requirements
  let verificationStatus: VerificationStatus = "verified_in_fixture";
  if (parsedCandidate.unknownFacts.length > 0 || domainUnverified) {
    verificationStatus = "provisional";
  }

  const verificationRequirements: string[] = [];
  for (const fact of parsedCandidate.unknownFacts) {
    verificationRequirements.push(`Verify material fact: "${fact}"`);
  }
  if (domainUnverified) {
    verificationRequirements.push(
      `Register and execute domain validator for domain "${baselinePlan.domain}"`
    );
  }
  if (unconfirmedEdgesCount > 0) {
    verificationRequirements.push(
      `Review and confirm ${unconfirmedEdgesCount} provisional dependency edge(s)`
    );
  }

  const warnings = allViolations
    .filter((v) => v.severity === "warning")
    .map((v) => v.message);

  const suggestedActions = Array.from(
    new Set(
      allViolations
        .map((v) => v.suggestedAction)
        .filter((a): a is string => Boolean(a))
        .concat(impactAnalysis.requiredActions)
    )
  );

  return {
    candidateId: parsedCandidate.id,
    label: parsedCandidate.label,
    classification,
    explanation,
    candidatePlan,
    candidateGraph,
    projectedTotalCost: totalCost,
    budgetLimit: budgetLimit ?? null,
    budgetMargin: budgetMargin ?? null,
    taskCount: candidatePlan.tasks.length,
    earliestProjectFinishHours: Number(finish.toFixed(4)),
    deadlineHours: deadlineHours ?? null,
    deadlineSlackHours: slack !== null ? Number(slack.toFixed(4)) : null,
    changedTaskIds: parsedCandidate.changedTaskIds,
    removedTaskIds: parsedCandidate.removedTaskIds,
    lostTaskIds: parsedCandidate.lostTaskIds,
    preservedTaskIds: candidatePlan.tasks.map((t) => t.id),
    removedDependencyIds,
    movedTaskStartTimes,
    weightedMeanAbsoluteStartShiftHours: Number(weightedMeanShift.toFixed(6)),
    metrics,
    unknownFacts: parsedCandidate.unknownFacts,
    verificationStatus,
    verificationRequirements,
    validation,
    constraintViolations: allViolations,
    warnings,
    suggestedActions,
    impactAnalysis,
  };
}

/**
 * Evaluates multiple candidates against the accepted baseline plan.
 */
export function evaluateCandidates(
  input: EvaluateCandidatesInput
): EvaluateCandidatesResult {
  const {
    baselinePlan,
    baselineGraph,
    candidates,
    constraintOverrides,
    syncState,
    publicationStatus,
    activeConflicts,
    isOffline,
    tolerance = DEFAULT_TOLERANCE,
  } = input;

  // 1. Guard recovery: Ensure baseline plan and graph are safe to evaluate against
  const guard = guardRecovery({
    plan: baselinePlan,
    graph: baselineGraph,
    syncState,
    publicationStatus,
    activeConflicts,
    isOffline,
  });

  if (!guard.canCalculate) {
    return {
      success: false,
      error: `Recovery guard rejected candidate evaluation: ${guard.blockingIssues.join(
        "; "
      )}`,
      blockingIssues: guard.blockingIssues,
      warnings: guard.warnings,
      evaluations: [],
      feasibleCount: 0,
      provisionallyFeasibleCount: 0,
      infeasibleCount: 0,
    };
  }

  // 2. Baseline evaluation under proposed constraints
  const baselineConstraints = {
    ...baselinePlan.constraints,
    ...(constraintOverrides ?? {}),
  };
  const baseSched = schedulePlan(baselinePlan, {
    tolerance,
    enforceValidation: false,
  });
  const baseCost = baselinePlan.tasks.reduce((sum, t) => sum + t.cost, 0);
  const baseValidation = validateConstraints({
    candidatePlan: baselinePlan,
    candidateSchedule: baseSched,
    constraintOverrides,
    tolerance,
  });

  const baselineEvaluation: BaselineEvaluationSummary = {
    totalCost: baseCost,
    projectFinishHours: baseSched.projectEarliestFinish,
    budgetLimit: baselineConstraints.budgetLimit ?? null,
    budgetMargin:
      baselineConstraints.budgetLimit !== undefined
        ? baselineConstraints.budgetLimit - baseCost
        : null,
    deadlineHours: baselineConstraints.deadlineHours ?? null,
    deadlineSlackHours:
      baselineConstraints.deadlineHours !== undefined
        ? baselineConstraints.deadlineHours - baseSched.projectEarliestFinish
        : null,
    isFeasible: baseValidation.isValid,
    violations: baseValidation.issues,
  };

  // 3. Evaluate each candidate
  const evaluations: CandidateEvaluationResult[] = [];
  let feasibleCount = 0;
  let provisionallyFeasibleCount = 0;
  let infeasibleCount = 0;

  for (const candidate of candidates) {
    const evaluation = evaluateCandidate(
      baselinePlan,
      baselineGraph,
      candidate,
      constraintOverrides,
      tolerance
    );

    evaluations.push(evaluation);

    if (evaluation.classification === "feasible") {
      feasibleCount++;
    } else if (evaluation.classification === "provisionally_feasible") {
      provisionallyFeasibleCount++;
    } else {
      infeasibleCount++;
    }
  }

  return {
    success: true,
    blockingIssues: [],
    warnings: guard.warnings,
    baselineEvaluation,
    evaluations,
    feasibleCount,
    provisionallyFeasibleCount,
    infeasibleCount,
  };
}
