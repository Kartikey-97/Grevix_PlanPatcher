import type { Plan, GlobalConstraints } from "../schemas/plan.schema";
import {
  validateExplainableGraph,
  type GraphValidationResult,
} from "../graph/validate-explainable";
import { schedulePlan, type ScheduleResult, DEFAULT_TOLERANCE } from "./schedule";

export type ConstraintIssueSeverity = "error" | "warning" | "info";

export interface ConstraintIssue {
  code:
    | "BUDGET_EXCEEDED"
    | "DEADLINE_EXCEEDED"
    | "FIXED_TASK_REMOVED"
    | "FIXED_TASK_MODIFIED"
    | "INVALID_GRAPH_STRUCTURE"
    | "CAPACITY_INSUFFICIENT"
    | "ACCESSIBILITY_NOT_MET"
    | "UNREVIEWED_ASSUMPTION"
    | string;
  severity: ConstraintIssueSeverity;
  message: string;
  affectedTaskIds?: string[];
  suggestedAction?: string;
}

export interface ConstraintValidationMetrics {
  totalCost: number;
  budgetLimit?: number;
  budgetMargin?: number;
  projectFinishHours: number;
  deadlineHours?: number;
  deadlineSlackHours?: number;
}

export interface DomainConstraintValidationContext {
  baselinePlan?: Plan;
  candidatePlan: Plan;
  candidateSchedule?: ScheduleResult;
  constraintOverrides?: Partial<GlobalConstraints>;
  tolerance: number;
}

export interface DomainConstraintValidationResult {
  passed: boolean;
  issues: ConstraintIssue[];
  details?: Record<string, unknown>;
}

export interface DomainConstraintValidator {
  id: string;
  description?: string;
  validate: (
    context: DomainConstraintValidationContext
  ) => DomainConstraintValidationResult;
}

// ---------------------------------------------------------
// Domain Validator Registry
// ---------------------------------------------------------
const domainValidatorRegistry = new Map<string, DomainConstraintValidator[]>();

export function registerDomainValidator(
  domain: string,
  validator: DomainConstraintValidator
): void {
  const existing = domainValidatorRegistry.get(domain) ?? [];
  const filtered = existing.filter((v) => v.id !== validator.id);
  filtered.push(validator);
  domainValidatorRegistry.set(domain, filtered);
}

export function unregisterDomainValidator(
  domain: string,
  validatorId: string
): void {
  const existing = domainValidatorRegistry.get(domain) ?? [];
  domainValidatorRegistry.set(
    domain,
    existing.filter((v) => v.id !== validatorId)
  );
}

export function getDomainValidators(domain: string): DomainConstraintValidator[] {
  return [...(domainValidatorRegistry.get(domain) ?? [])];
}

export function clearDomainValidators(): void {
  domainValidatorRegistry.clear();
}

export interface ConstraintValidationInput {
  baselinePlan?: Plan;
  candidatePlan: Plan;
  candidateSchedule?: ScheduleResult;
  constraintOverrides?: Partial<GlobalConstraints>;
  customValidators?: DomainConstraintValidator[];
  domain?: string;
  tolerance?: number;
}

export interface ConstraintValidationResult {
  isValid: boolean;
  hardConstraintsPass: boolean;
  budgetPass: boolean;
  deadlinePass: boolean;
  fixedTasksPreserved: boolean;
  acyclic: boolean;
  domainChecksPass: boolean;
  issues: ConstraintIssue[];
  metrics: ConstraintValidationMetrics;
  schedule?: ScheduleResult;
}

/**
 * Pure generic validator for plan constraints.
 *
 * Core Engine Guarantees:
 * 1. 100% domain-independent: Contains zero hard-coded assumptions regarding event venue,
 *    catering, or attendance.
 * 2. Generic checks:
 *    - Optional budget constraint: disabled if omitted; zero-budget enforced if 0.
 *    - Project deadline feasibility using the pure scheduling engine.
 *    - Fixed-task preservation relative to the accepted baseline.
 *    - Graph structural validity & acyclicity.
 * 3. Domain extensibility:
 *    - Dispatches to registered domain validators via the registry or customValidators input.
 *    - Keeps hard violations, warnings, and unverified assumptions distinct.
 *    - If domain constraints are declared but no validator is available, flags UNREVIEWED_ASSUMPTION.
 */
export function validateConstraints(
  input: ConstraintValidationInput
): ConstraintValidationResult {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const plan = input.candidatePlan;
  const constraints: GlobalConstraints = {
    ...plan.constraints,
    ...(input.constraintOverrides ?? {}),
  };

  const issues: ConstraintIssue[] = [];

  // 1. Cost & Budget Evaluation (Generic)
  const totalCost = plan.tasks.reduce((sum, t) => sum + t.cost, 0);
  const budgetLimit = constraints.budgetLimit;
  let budgetPass = true;
  let budgetMargin: number | undefined;

  if (budgetLimit !== undefined) {
    budgetMargin = budgetLimit - totalCost;
    if (totalCost > budgetLimit + tolerance) {
      budgetPass = false;
      issues.push({
        code: "BUDGET_EXCEEDED",
        severity: "error",
        message: `Total task cost (${totalCost} INR) exceeds budget limit (${budgetLimit} INR) by ${Math.abs(
          budgetMargin
        )} INR.`,
        suggestedAction: "Select lower-cost task alternatives or increase the configured budgetLimit.",
      });
    }
  }

  // 2. Schedule & Deadline Evaluation (Generic)
  const schedule =
    input.candidateSchedule ??
    schedulePlan(plan, {
      deadlineHours: constraints.deadlineHours,
      tolerance,
      enforceValidation: false, // validated below
    });

  const projectFinishHours = schedule.projectEarliestFinish;
  const deadlineHours = constraints.deadlineHours;
  let deadlinePass = true;
  let deadlineSlackHours: number | undefined;

  if (deadlineHours !== undefined) {
    deadlineSlackHours = deadlineHours - projectFinishHours;
    if (projectFinishHours > deadlineHours + tolerance) {
      deadlinePass = false;
      issues.push({
        code: "DEADLINE_EXCEEDED",
        severity: "error",
        message: `Project earliest completion (${projectFinishHours}h) exceeds deadline (${deadlineHours}h) by ${Math.abs(
          deadlineSlackHours
        )}h.`,
        suggestedAction: "Fast-track critical path tasks or extend the project deadline constraint.",
      });
    }
  }

  // 3. Fixed-Task Preservation (Generic)
  let fixedTasksPreserved = true;
  if (input.baselinePlan) {
    const candidateTasksById = new Map(plan.tasks.map((t) => [t.id, t]));
    const fixedBaselineTasks = input.baselinePlan.tasks.filter((t) => t.policy === "fixed");

    for (const baseTask of fixedBaselineTasks) {
      const candTask = candidateTasksById.get(baseTask.id);
      if (!candTask) {
        fixedTasksPreserved = false;
        issues.push({
          code: "FIXED_TASK_REMOVED",
          severity: "error",
          affectedTaskIds: [baseTask.id],
          message: `Fixed task '${baseTask.id}' (${baseTask.title}) was removed in candidate plan.`,
          suggestedAction: "Restore the fixed task to the plan.",
        });
      } else {
        const changedFields: string[] = [];
        if (candTask.cost !== baseTask.cost) changedFields.push("cost");
        if (candTask.durationHours !== baseTask.durationHours) changedFields.push("durationHours");
        if (candTask.priority !== baseTask.priority) changedFields.push("priority");
        if (candTask.policy !== baseTask.policy) changedFields.push("policy");

        if (JSON.stringify(candTask.inputs ?? {}) !== JSON.stringify(baseTask.inputs ?? {})) {
          changedFields.push("inputs");
        }
        if (JSON.stringify(candTask.outputs ?? {}) !== JSON.stringify(baseTask.outputs ?? {})) {
          changedFields.push("outputs");
        }

        if (changedFields.length > 0) {
          fixedTasksPreserved = false;
          issues.push({
            code: "FIXED_TASK_MODIFIED",
            severity: "error",
            affectedTaskIds: [baseTask.id],
            message: `Fixed task '${baseTask.id}' (${baseTask.title}) was modified in candidate plan: [${changedFields.join(
              ", "
            )}].`,
            suggestedAction: "Revert modifications to the fixed task.",
          });
        }
      }
    }
  }

  // 4. Graph Structural Validation (Generic Acyclicity & Endpoints)
  const graphValidation: GraphValidationResult = validateExplainableGraph({
    tasks: plan.tasks,
    dependencies: plan.dependencies,
  });

  const acyclic = graphValidation.isValid && !graphValidation.hasCycles;
  if (!acyclic) {
    for (const issue of graphValidation.issues.filter((i) => i.severity === "error")) {
      issues.push({
        code: "INVALID_GRAPH_STRUCTURE",
        severity: "error",
        affectedTaskIds: issue.affectedEntityIds,
        message: issue.message,
        suggestedAction: issue.suggestedAction,
      });
    }
  }

  // 5. Domain Validators & Unreviewed Assumption Checks
  const domain = input.domain ?? plan.domain;
  const validators: DomainConstraintValidator[] = [
    ...(input.customValidators ?? []),
    ...(domain ? getDomainValidators(domain) : []),
  ];

  let domainChecksPass = true;
  const executedValidatorIds = new Set<string>();

  if (validators.length > 0) {
    const context: DomainConstraintValidationContext = {
      baselinePlan: input.baselinePlan,
      candidatePlan: plan,
      candidateSchedule: schedule,
      constraintOverrides: input.constraintOverrides,
      tolerance,
    };

    for (const validator of validators) {
      executedValidatorIds.add(validator.id);
      const res = validator.validate(context);
      if (!res.passed) {
        domainChecksPass = false;
      }
      issues.push(...res.issues);
    }
  } else {
    // S5B.1 Requirement 5: Check if plan declares domain-specific constraints without registered validators
    const unverifiedFields: string[] = [];
    if (constraints.expectedAttendance !== undefined) unverifiedFields.push("expectedAttendance");
    if (constraints.minimumAccessibility !== undefined) unverifiedFields.push("minimumAccessibility");
    if (constraints.requiredOutput !== undefined) unverifiedFields.push("requiredOutput");

    if (unverifiedFields.length > 0) {
      issues.push({
        code: "UNREVIEWED_ASSUMPTION",
        severity: "warning",
        message: `Plan declares domain-specific constraint(s) [${unverifiedFields.join(
          ", "
        )}], but no validator is registered for domain '${domain ?? "generic"}'. These constraints remain unverified.`,
        suggestedAction: "Register a domain constraint validator or verify domain constraints manually.",
      });
    }
  }

  const hardConstraintsPass =
    budgetPass &&
    deadlinePass &&
    fixedTasksPreserved &&
    acyclic &&
    domainChecksPass;

  const isValid = hardConstraintsPass;

  return {
    isValid,
    hardConstraintsPass,
    budgetPass,
    deadlinePass,
    fixedTasksPreserved,
    acyclic,
    domainChecksPass,
    issues,
    metrics: {
      totalCost,
      budgetLimit,
      budgetMargin,
      projectFinishHours,
      deadlineHours,
      deadlineSlackHours,
    },
    schedule,
  };
}
