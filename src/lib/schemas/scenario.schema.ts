import { z } from "zod";
import { GlobalConstraintsSchema } from "./plan.schema";
import { CandidatePatchSchema } from "./patch.schema";

export const DisruptionSchema = z.object({
  type: z.string(),
  targetTaskId: z.string().optional(),
  field: z.string().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  description: z.string().optional(),
});
export type Disruption = z.infer<typeof DisruptionSchema>;

export const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string().optional(),
  disruption: DisruptionSchema,
  constraintOverrides: GlobalConstraintsSchema.partial().default({}),
  candidatePatches: z.array(CandidatePatchSchema),
  expectedBehavior: z.array(z.string()).optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const ScenariosDocSchema = z.object({
  schemaVersion: z.string(),
  scenarioCount: z.number().int().optional(),
  scenarios: z.array(ScenarioSchema),
});
export type ScenariosDoc = z.infer<typeof ScenariosDocSchema>;
