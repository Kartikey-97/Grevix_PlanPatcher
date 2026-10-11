import { z } from "zod";

export const TaskPolicySchema = z.enum(["fixed", "replaceable", "optional"]);
export type TaskPolicy = z.infer<typeof TaskPolicySchema>;

export const TaskStatusSchema = z.string();
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const FieldMappingSchema = z.object({
  sourceField: z.string(),
  targetInput: z.string(),
});
export type FieldMapping = z.infer<typeof FieldMappingSchema>;

export const DependencySchema = z.object({
  id: z.string(),
  fromTaskId: z.string(),
  toTaskId: z.string(),
  blocksExecution: z.boolean(),
  fieldMappings: z.array(FieldMappingSchema).default([]),
  reason: z.string().optional(),
  removeEdgeIfSourceRemoved: z.boolean().optional(),
});
export type Dependency = z.infer<typeof DependencySchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  cost: z.number().nonnegative(),
  durationHours: z.number().nonnegative(),
  priority: z.number().int().min(1).max(5),
  policy: TaskPolicySchema,
  status: TaskStatusSchema,
  inputs: z.record(z.unknown()).default({}),
  outputs: z.record(z.unknown()).default({}),
  alternatives: z.array(z.string()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const GlobalConstraintsSchema = z.object({
  // Generic budget semantics:
  // - Omitted budgetLimit means the budget constraint and budget-usage scoring dimension are disabled.
  // - budgetLimit of 0 permits only zero-cost candidates.
  // - Negative budget limit is invalid (nonnegative).
  budgetLimit: z.number().nonnegative().optional(),
  currency: z.string().default("INR"),
  deadlineHours: z.number().nonnegative().optional(),
  expectedAttendance: z.number().int().nonnegative().optional(),
  minimumAccessibility: z.boolean().optional(),
  requiredOutput: z.string().optional(),
  preferredSessionMode: z.string().optional(),
  multipleSessionsAllowed: z.boolean().optional(),
  deadlineKind: z.string().optional(),
  deadlineDescription: z.string().optional(),
});
export type GlobalConstraints = z.infer<typeof GlobalConstraintsSchema>;

export const ScoringConfigSchema = z.object({
  changeFootprintDenominator: z.string().default("originalTaskCount"),
  lostTaskValueDenominator: z.string().default("sumOfOriginalTaskPriorities"),
  uncertaintyFactCount: z.number().default(5),
  scheduleShiftReferenceHours: z.number().default(8),
  deadlineSlackReferenceHours: z.number().default(24),
});
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

export const PlanSchema = z.object({
  schemaVersion: z.string(),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  domain: z.string().optional(),
  constraints: GlobalConstraintsSchema,
  scoring: ScoringConfigSchema.default({}),
  tasks: z.array(TaskSchema),
  dependencies: z.array(DependencySchema),
  demoAlternatives: z.record(z.unknown()).optional(),
  notes: z.array(z.string()).optional(),
});
export type Plan = z.infer<typeof PlanSchema>;
