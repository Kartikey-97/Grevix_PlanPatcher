import { z } from "zod";

export const ProfileWeightsSchema = z.object({
  changeFootprint: z.number().min(0).max(1),
  lostTaskValue: z.number().min(0).max(1),
  budgetUsage: z.number().min(0).max(1),
  scheduleDisruption: z.number().min(0).max(1),
  uncertainty: z.number().min(0).max(1),
});
export type ProfileWeights = z.infer<typeof ProfileWeightsSchema>;

export const PreferenceProfileSchema = z.object({
  label: z.string(),
  weights: ProfileWeightsSchema,
});
export type PreferenceProfile = z.infer<typeof PreferenceProfileSchema>;

export const PreferenceProfileKeySchema = z.enum([
  "preserve_plan",
  "minimize_spending",
  "protect_deadline",
]);
export type PreferenceProfileKey = z.infer<typeof PreferenceProfileKeySchema>;

export const RankingPolicySchema = z.object({
  schemaVersion: z.string(),
  direction: z.literal("lower_score_is_better"),
  metrics: z.record(z.unknown()),
  profiles: z.record(PreferenceProfileSchema),
  compositeFormula: z.string().optional(),
  decisionOrder: z.array(z.string()).optional(),
  importantLimitations: z.array(z.string()).optional(),
});
export type RankingPolicy = z.infer<typeof RankingPolicySchema>;
