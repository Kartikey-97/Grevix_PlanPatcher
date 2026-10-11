import { z } from "zod";
import { GlobalConstraintsSchema, TaskPolicySchema, TaskStatusSchema } from "./plan.schema";

export const TaskOverrideSchema = z.object({
  title: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  durationHours: z.number().nonnegative().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  policy: TaskPolicySchema.optional(),
  status: TaskStatusSchema.optional(),
  inputs: z.record(z.unknown()).optional(),
  outputs: z.record(z.unknown()).optional(),
});
export type TaskOverride = z.infer<typeof TaskOverrideSchema>;

export const CandidatePatchSchema = z.object({
  id: z.string(),
  label: z.string(),
  changedTaskIds: z.array(z.string()).default([]),
  removedTaskIds: z.array(z.string()).default([]),
  lostTaskIds: z.array(z.string()).default([]),
  unknownFacts: z.array(z.string()).default([]),
  taskOverrides: z.record(TaskOverrideSchema).default({}),
  constraintOverrides: GlobalConstraintsSchema.partial().optional(),
  reasoning: z.string().optional(),
  expectedImpactedFields: z.record(z.array(z.string())).optional(),
  expectedImpact: z.record(z.unknown()).optional(),
});
export type CandidatePatch = z.infer<typeof CandidatePatchSchema>;
