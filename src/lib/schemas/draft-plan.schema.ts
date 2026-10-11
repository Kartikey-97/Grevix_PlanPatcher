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
 * Task alternative within a draft plan for disruption recovery.
 */
export const DraftTaskAlternativeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  cost: z.number().min(0).default(0),
  costProvenance: FieldProvenanceSchema.default("ai_estimate"),
  durationHours: z.number().min(0).default(0),
  durationProvenance: FieldProvenanceSchema.default("ai_estimate"),
  unknownFacts: z.array(z.string()).default([]),
  notes: z.string().optional(),
  status: z.enum(["suggested", "confirmed"]).default("suggested"),
  availability: z.string().optional(),
  inputs: z.record(z.unknown()).optional(),
  outputs: z.record(z.unknown()).optional(),
});
export type DraftTaskAlternative = z.infer<typeof DraftTaskAlternativeSchema>;

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
  alternatives: z.array(DraftTaskAlternativeSchema).optional(),
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
  demoAlternatives: z.record(z.unknown()).optional(),
});

export type DraftPlan = z.infer<typeof DraftPlanSchema>;

/**
 * Converts a verified or user-adjusted DraftPlan into a canonical Plan schema object.
 * Missing budget or deadline stays undefined (disabled in constraint solver).
 * Never fabricates values just to satisfy the schema.
 */
export function convertDraftToPlan(draft: DraftPlan): Plan {
  const demoAlternativesCatalog: Record<string, unknown> = {
    ...(draft.demoAlternatives ?? {}),
  };

  const tasks: Task[] = draft.tasks.map((dt) => {
    if (dt.cost === null || dt.cost === undefined || isNaN(dt.cost)) {
      throw new Error(
        `Cannot convert draft task "${dt.id}" to canonical Plan: cost is unresolved (missing). Required schema fields must be explicitly supplied or confirmed.`
      );
    }
    if (dt.durationHours === null || dt.durationHours === undefined || isNaN(dt.durationHours)) {
      throw new Error(
        `Cannot convert draft task "${dt.id}" to canonical Plan: durationHours is unresolved (missing). Required schema fields must be explicitly supplied or confirmed.`
      );
    }

    const altIds: string[] = [];
    if (dt.alternatives && dt.alternatives.length > 0) {
      for (const alt of dt.alternatives) {
        altIds.push(alt.id);
        demoAlternativesCatalog[alt.id] = {
          id: alt.id,
          title: alt.title,
          name: alt.title,
          cost: alt.cost,
          durationHours: alt.durationHours,
          unknownFacts: alt.unknownFacts,
          notes: alt.notes,
          availability: alt.availability,
          inputs: alt.inputs ?? {},
          outputs: alt.outputs ?? {},
        };
      }
    }

    return {
      id: dt.id,
      title: dt.title,
      cost: dt.cost,
      durationHours: dt.durationHours,
      priority: dt.priority,
      policy: (dt.policy === "flexible" ? "replaceable" : dt.policy) as TaskPolicy,
      status: "pending",
      inputs: {},
      outputs: {},
      alternatives: altIds.length > 0 ? altIds : undefined,
    };
  });

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
    demoAlternatives:
      Object.keys(demoAlternativesCatalog).length > 0
        ? demoAlternativesCatalog
        : undefined,
  };
}
