import { PlanSchema, type Plan, type Task, type Dependency } from "../schemas/plan.schema";
import { validateExplainableGraph, type GraphValidationResult } from "../graph/validate-explainable";
import { schedulePlan, type ScheduleResult } from "./schedule";
import { getDomainValidators } from "./validate-constraints";

export interface CustomPlanValidationResult {
  isValid: boolean;
  plan?: Plan;
  schemaErrors: string[];
  graphErrors: string[];
  warnings: string[];
  schedule?: ScheduleResult;
  isDomainVerified: boolean;
  domainName: string;
}

/**
 * Validates a custom plan end-to-end using existing production schemas,
 * explainable graph validation, topological scheduling, and domain validator registry.
 */
export function validateCustomPlan(rawPlan: unknown): CustomPlanValidationResult {
  const schemaErrors: string[] = [];
  const graphErrors: string[] = [];
  const warnings: string[] = [];

  // 1. Zod Schema Validation
  const parsed = PlanSchema.safeParse(rawPlan);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const fieldPath = issue.path.join(".") || "root";
      schemaErrors.push(`${fieldPath}: ${issue.message}`);
    }
    return {
      isValid: false,
      schemaErrors,
      graphErrors,
      warnings,
      isDomainVerified: false,
      domainName: (rawPlan as { domain?: string })?.domain ?? "unknown",
    };
  }

  const plan = parsed.data;
  const domainName = plan.domain || "generic";

  // 2. Explainable Graph Validation (Cycle detection, missing endpoints, self-loops)
  const graphValidation: GraphValidationResult = validateExplainableGraph({
    tasks: plan.tasks,
    dependencies: plan.dependencies,
  });

  if (!graphValidation.isValid || graphValidation.hasCycles) {
    for (const issue of graphValidation.issues) {
      if (issue.severity === "error") {
        graphErrors.push(
          `Graph Error [${issue.code}]: ${issue.message} (${issue.suggestedAction})`
        );
      } else {
        warnings.push(`Graph Notice [${issue.code}]: ${issue.message}`);
      }
    }

    if (graphValidation.hasCycles) {
      graphErrors.push(
        `Dependency Cycle Detected involving tasks: ${graphValidation.cycleNodes.join(
          ", "
        )}. A project schedule cannot be computed for cyclic dependencies.`
      );
    }
  }

  warnings.push(...graphValidation.warnings);

  // If schema or graph errors exist, return invalid before scheduling
  if (schemaErrors.length > 0 || graphErrors.length > 0) {
    return {
      isValid: false,
      plan,
      schemaErrors,
      graphErrors,
      warnings,
      isDomainVerified: false,
      domainName,
    };
  }

  // 3. Exact Topological Schedule Calculation
  const schedule = schedulePlan(plan, {
    deadlineHours: plan.constraints.deadlineHours,
  });

  if (!schedule.success) {
    graphErrors.push(schedule.error || "Topological scheduling calculation failed.");
    return {
      isValid: false,
      plan,
      schemaErrors,
      graphErrors,
      warnings,
      isDomainVerified: false,
      domainName,
    };
  }

  // 4. Domain Validator Check (Explicit Verification Tiering)
  const domainValidators = getDomainValidators(domainName);
  const isDomainVerified = domainValidators.length > 0;

  if (!isDomainVerified) {
    warnings.push(
      `Unverified Domain: No domain-specific constraint validator is registered for "${domainName}". Structural validity and schedule metrics are verified, but domain-specific rules require manual verification.`
    );
  }

  return {
    isValid: true,
    plan,
    schemaErrors: [],
    graphErrors: [],
    warnings,
    schedule,
    isDomainVerified,
    domainName,
  };
}

/**
 * Provides a sensible, valid default custom plan representing a software engineering lifecycle.
 * (Design -> Backend & Frontend -> QA Testing -> Security -> Production Deployment).
 */
export function createDefaultCustomPlan(): Plan {
  return {
    schemaVersion: "1.0.0",
    id: "software-release-pipeline",
    name: "Enterprise Web App Release",
    description: "Standard software development pipeline with architectural, implementation, testing, and deployment stages.",
    domain: "software-engineering",
    planRevision: 1,
    constraints: {
      budgetLimit: 95000,
      currency: "INR",
      deadlineHours: 160,
    },
    scoring: {
      changeFootprintDenominator: "originalTaskCount",
      lostTaskValueDenominator: "sumOfOriginalTaskPriorities",
      uncertaintyFactCount: 5,
      scheduleShiftReferenceHours: 8,
      deadlineSlackReferenceHours: 24,
    },
    tasks: [
      {
        id: "T01",
        title: "Architecture & API Specification",
        cost: 15000,
        durationHours: 24,
        priority: 5,
        policy: "fixed",
        status: "pending",
        inputs: {},
        outputs: {},
      },
      {
        id: "T02",
        title: "Backend Services & Database Migration",
        cost: 25000,
        durationHours: 40,
        priority: 4,
        policy: "replaceable",
        status: "pending",
        inputs: {},
        outputs: {},
      },
      {
        id: "T03",
        title: "Frontend Application & UI Components",
        cost: 20000,
        durationHours: 36,
        priority: 4,
        policy: "replaceable",
        status: "pending",
        inputs: {},
        outputs: {},
      },
      {
        id: "T04",
        title: "End-to-End Testing & QA Signoff",
        cost: 15000,
        durationHours: 24,
        priority: 5,
        policy: "fixed",
        status: "pending",
        inputs: {},
        outputs: {},
      },
      {
        id: "T05",
        title: "Performance & Security Penetration Audit",
        cost: 12000,
        durationHours: 16,
        priority: 3,
        policy: "optional",
        status: "pending",
        inputs: {},
        outputs: {},
      },
      {
        id: "T06",
        title: "Production Deployment & CDN Warmup",
        cost: 8000,
        durationHours: 8,
        priority: 5,
        policy: "fixed",
        status: "pending",
        inputs: {},
        outputs: {},
      },
    ],
    dependencies: [
      {
        id: "dep-t01-t02",
        fromTaskId: "T01",
        toTaskId: "T02",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
      {
        id: "dep-t01-t03",
        fromTaskId: "T01",
        toTaskId: "T03",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
      {
        id: "dep-t02-t04",
        fromTaskId: "T02",
        toTaskId: "T04",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
      {
        id: "dep-t03-t04",
        fromTaskId: "T03",
        toTaskId: "T04",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
      {
        id: "dep-t04-t05",
        fromTaskId: "T04",
        toTaskId: "T05",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
      {
        id: "dep-t04-t06",
        fromTaskId: "T04",
        toTaskId: "T06",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
      {
        id: "dep-t05-t06",
        fromTaskId: "T05",
        toTaskId: "T06",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      },
    ],
  };
}

/**
 * Creates an empty starter plan with 1 initial task.
 */
export function createEmptyCustomPlan(): Plan {
  return {
    schemaVersion: "1.0.0",
    id: `custom-plan-${Date.now().toString(36)}`,
    name: "New Custom Project",
    description: "User-defined custom operational plan",
    domain: "general",
    planRevision: 1,
    constraints: {
      budgetLimit: 50000,
      currency: "INR",
      deadlineHours: 100,
    },
    scoring: {
      changeFootprintDenominator: "originalTaskCount",
      lostTaskValueDenominator: "sumOfOriginalTaskPriorities",
      uncertaintyFactCount: 5,
      scheduleShiftReferenceHours: 8,
      deadlineSlackReferenceHours: 24,
    },
    tasks: [
      {
        id: "T01",
        title: "Initial Project Task",
        cost: 5000,
        durationHours: 10,
        priority: 4,
        policy: "fixed",
        status: "pending",
        inputs: {},
        outputs: {},
      },
    ],
    dependencies: [],
  };
}

/**
 * Exports a plan as a formatted JSON string.
 */
export function exportPlanToJson(plan: Plan): string {
  return JSON.stringify(plan, null, 2);
}

/**
 * Parses and validates an imported JSON string into a Plan.
 */
export function importPlanFromJson(jsonString: string): {
  success: boolean;
  plan?: Plan;
  error?: string;
} {
  try {
    const raw = JSON.parse(jsonString);
    const parsed = PlanSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        success: false,
        error: `Schema error: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ")}`,
      };
    }
    return {
      success: true,
      plan: parsed.data,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: `Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
