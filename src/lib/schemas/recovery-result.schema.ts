import { z } from "zod";

export const VerificationStatusSchema = z.enum([
  "verified_in_fixture", // Seeded/fixture complete, assumed true for deterministic test only
  "provisional",          // Contains unknown material facts/assumptions
  "real_world_verified",  // Confirmed by external proof/booking (not used for fictional fixtures)
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const CandidateMetricsSchema = z.object({
  changeFootprint_E: z.number().min(0).max(1),
  lostTaskValue_L: z.number().min(0).max(1),
  budgetUsage_C: z.number().min(0).nullable(), // null when budget constraint is disabled
  movement_M: z.number().min(0).max(1),
  deadlinePressure_Q: z.number().min(0).max(1),
  scheduleDisruption_S: z.number().min(0).max(1),
  uncertainty_R: z.number().min(0).max(1),
});
export type CandidateMetrics = z.infer<typeof CandidateMetricsSchema>;

export const ValidationReportSchema = z.object({
  budgetPass: z.boolean(),
  deadlinePass: z.boolean(),
  capacityPass: z.boolean(),
  accessibilityPass: z.boolean(),
  fixedTasksPreserved: z.boolean(),
  acyclic: z.boolean(),
  hardConstraintsPass: z.boolean(),
  failedReasons: z.array(z.string()).optional(),
});
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

export const MovedTaskStartTimeSchema = z.object({
  taskId: z.string(),
  priority: z.number(),
  absoluteStartShiftHours: z.number().nonnegative(),
});
export type MovedTaskStartTime = z.infer<typeof MovedTaskStartTimeSchema>;

export const EvaluatedCandidateSchema = z.object({
  candidateId: z.string(),
  label: z.string(),
  changedTaskIds: z.array(z.string()),
  removedTaskIds: z.array(z.string()),
  lostTaskIds: z.array(z.string()),
  projectedTotalCost: z.number().nonnegative(),
  budgetLimit: z.number().nullable().optional(),
  budgetMargin: z.number().nullable().optional(),
  taskCount: z.number().int().nonnegative(),
  earliestProjectFinishHours: z.number().nonnegative(),
  deadlineHours: z.number().nullable().optional(),
  deadlineSlackHours: z.number().nullable().optional(),
  movedTaskStartTimes: z.array(MovedTaskStartTimeSchema),
  weightedMeanAbsoluteStartShiftHours: z.number().nonnegative(),
  metrics: CandidateMetricsSchema,
  unknownFacts: z.array(z.string()),
  verificationStatus: VerificationStatusSchema,
  validation: ValidationReportSchema,
  scores: z.record(z.number()),
});
export type EvaluatedCandidate = z.infer<typeof EvaluatedCandidateSchema>;

export const RankedEntrySchema = z.object({
  rank: z.number().int().positive(),
  candidateId: z.string(),
  score: z.number(),
});
export type RankedEntry = z.infer<typeof RankedEntrySchema>;

export const BaselineAfterDisruptionSchema = z.object({
  totalCostBeforePatch: z.number().nonnegative(),
  budgetLimit: z.number().nullable().optional(),
  deadlineHours: z.number().nullable().optional(),
  originalFinishHours: z.number().nonnegative(),
  originalTaskPrioritySum: z.number().nonnegative(),
  baselineValidation: z.object({
    budgetPass: z.boolean(),
    deadlinePass: z.boolean(),
    overallHardConstraintsPass: z.boolean(),
    failedReasons: z.array(z.string()).optional(),
  }),
  note: z.string().optional(),
});
export type BaselineAfterDisruption = z.infer<typeof BaselineAfterDisruptionSchema>;

export const ScenarioRecoveryResultSchema = z.object({
  scenarioId: z.string(),
  title: z.string(),
  purpose: z.string().optional(),
  baselineAfterDisruption: BaselineAfterDisruptionSchema,
  candidates: z.array(EvaluatedCandidateSchema),
  rankings: z.record(z.array(RankedEntrySchema)),
});
export type ScenarioRecoveryResult = z.infer<typeof ScenarioRecoveryResultSchema>;

export const ExpectedResultsDocSchema = z.object({
  schemaVersion: z.string(),
  generatedBy: z.string().optional(),
  baseline: z.object({
    taskCount: z.number().int().positive(),
    totalCost: z.number().nonnegative(),
    budgetLimit: z.number().nonnegative(),
    deadlineHours: z.number().nonnegative(),
    earliestFinishHours: z.number().nonnegative(),
    deadlineSlackHours: z.number().nonnegative(),
    prioritySum: z.number().int().positive(),
    earliestTimes: z.record(
      z.object({
        startHours: z.number().nonnegative(),
        finishHours: z.number().nonnegative(),
      })
    ),
    criticalPathOne: z.array(z.string()),
    criticalPathTwo: z.array(z.string()),
  }),
  scenarios: z.array(ScenarioRecoveryResultSchema),
  expectedWinners: z.record(z.record(z.string())),
});
export type ExpectedResultsDoc = z.infer<typeof ExpectedResultsDocSchema>;
