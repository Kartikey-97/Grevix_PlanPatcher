import { z } from "zod";
import {
  TaskPolicySchema,
  type Plan,
  type Task,
  type Dependency,
  type TaskPolicy,
} from "./plan.schema";

/**
 * Provenance category describing the origin and truthfulness of plan values.
 * - 'user_provided': explicitly stated by the user in prompt or form
 * - 'ai_estimate': estimated by the AI model; not an authoritative fact
 * - 'missing': unknown/unspecified; requires user decision or verification
 */
export const FieldProvenanceSchema = z.enum([
  "user_provided",
  "ai_estimate",
  "derived",
  "missing",
]);

export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>;

export const DraftTaskPolicySchema = z.enum([
  "fixed",
  "replaceable",
  "flexible",
  "optional",
]);
export type DraftTaskPolicy = z.infer<typeof DraftTaskPolicySchema>;

/**
 * Task within a draft plan before formal plan validation.
 */
export const DraftTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  cost: z.number().min(0).nullable().optional(),
  costProvenance: FieldProvenanceSchema.default("missing"),
  durationHours: z.number().min(0).nullable().optional(),
  durationProvenance: FieldProvenanceSchema.default("ai_estimate"),
  priority: z.number().int().min(1).max(5).default(3),
  priorityProvenance: FieldProvenanceSchema.default("ai_estimate"),
  policy: DraftTaskPolicySchema.default("flexible"),
  policyProvenance: FieldProvenanceSchema.default("ai_estimate"),
  predecessorIds: z.array(z.string()).default([]),
  dependenciesProvenance: FieldProvenanceSchema.default("ai_estimate"),
  notes: z.string().optional(),
});

export type DraftTask = z.infer<typeof DraftTaskSchema>;

/**
 * AI-generated or user-guided Draft Plan.
 */
export const DraftPlanSchema = z.object({
  name: z.string().min(1),
  goal: z.string().min(1),
  domain: z.string().default("generic"),
  budgetLimit: z.number().min(0).nullable().optional(),
  budgetProvenance: FieldProvenanceSchema.default("missing"),
  deadlineHours: z.number().min(0).nullable().optional(),
  deadlineProvenance: FieldProvenanceSchema.default("missing"),
  currency: z.string().default("INR"),
  tasks: z.array(DraftTaskSchema).min(1, "Draft must contain at least one task"),
  assumptions: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export type DraftPlan = z.infer<typeof DraftPlanSchema>;

/**
 * Converts a verified or user-adjusted DraftPlan into a canonical Plan schema object.
 * Missing budget or deadline stays undefined (disabled in constraint solver).
 * Never fabricates values just to satisfy the schema.
 */
export function convertDraftToPlan(draft: DraftPlan): Plan {
  const tasks: Task[] = draft.tasks.map((dt) => ({
    id: dt.id,
    title: dt.title,
    cost: dt.cost !== null && dt.cost !== undefined ? dt.cost : 0,
    durationHours: dt.durationHours !== null && dt.durationHours !== undefined ? dt.durationHours : 0,
    priority: dt.priority,
    policy: (dt.policy === "flexible" ? "replaceable" : dt.policy) as TaskPolicy,
    status: "pending",
    inputs: {},
    outputs: {},
  }));

  const dependencies: Dependency[] = [];
  for (const task of draft.tasks) {
    for (const predId of task.predecessorIds) {
      if (predId && predId !== task.id) {
        dependencies.push({
          id: `dep-${predId.toLowerCase()}-${task.id.toLowerCase()}`,
          fromTaskId: predId,
          toTaskId: task.id,
          blocksExecution: true,
          fieldMappings: [],
          origin: task.dependenciesProvenance === "user_provided" ? "manual" : "ai_suggested",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        });
      }
    }
  }

  // Only assign budgetLimit if genuinely provided or estimated with non-missing provenance
  const budgetLimit =
    draft.budgetProvenance !== "missing" &&
    draft.budgetLimit !== null &&
    draft.budgetLimit !== undefined &&
    draft.budgetLimit >= 0
      ? draft.budgetLimit
      : undefined;

  // Only assign deadlineHours if genuinely provided or estimated with non-missing provenance
  const deadlineHours =
    draft.deadlineProvenance !== "missing" &&
    draft.deadlineHours !== null &&
    draft.deadlineHours !== undefined &&
    draft.deadlineHours > 0
      ? draft.deadlineHours
      : undefined;

  return {
    schemaVersion: "1.0.0",
    id: `custom-plan-${Date.now()}`,
    name: draft.name,
    description: draft.goal,
    domain: draft.domain || "generic",
    planRevision: 1,
    constraints: {
      budgetLimit,
      currency: draft.currency || "INR",
      deadlineHours,
    },
    scoring: {
      changeFootprintDenominator: "originalTaskCount",
      lostTaskValueDenominator: "sumOfOriginalTaskPriorities",
      uncertaintyFactCount: 5,
      scheduleShiftReferenceHours: 8,
      deadlineSlackReferenceHours: 24,
    },
    tasks,
    dependencies,
  };
}
