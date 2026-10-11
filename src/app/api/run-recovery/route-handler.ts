import { NextResponse } from "next/server";
import { z } from "zod";
import { PlanSchema, type Plan, type GlobalConstraints } from "../../../lib/schemas/plan.schema";
import { DisruptionSchema, type Disruption } from "../../../lib/schemas/scenario.schema";
import { rebuildGraph } from "../../../lib/graph/rebuild-graph";
import { registerEventPlanningValidator } from "../../../lib/engine/event-planning-validator";
import { runRecovery, type RunRecoveryResult } from "../../../lib/engine/run-recovery";
import {
  getCanonicalPlan,
  getCanonicalScenariosDoc,
  getCanonicalRankingPolicy,
} from "../../../data/load-demo-fixtures";

export const RunRecoveryRequestSchema = z.object({
  scenarioId: z.string().optional(),
  disruption: DisruptionSchema,
  selectedProfile: z
    .enum(["preserve_plan", "minimize_spending", "protect_deadline"])
    .default("preserve_plan"),
  plan: PlanSchema.optional(),
  constraintOverrides: z.record(z.unknown()).optional(),
});

export type RunRecoveryRequest = z.infer<typeof RunRecoveryRequestSchema>;

export async function handleRunRecovery(request: Request): Promise<NextResponse> {
  // Register domain validator for demo fixture domain
  registerEventPlanningValidator();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Malformed JSON in request body.",
        blockingIssues: ["Malformed JSON in request body."],
      },
      { status: 400 }
    );
  }

  const parsed = RunRecoveryRequestSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    return NextResponse.json(
      {
        success: false,
        error: `Invalid recovery request: ${errorMsg}`,
        blockingIssues: ["Request validation failed."],
      },
      { status: 400 }
    );
  }

  const { scenarioId, disruption, selectedProfile, constraintOverrides } = parsed.data;

  // Always use validated baseline plan (server fixture by default)
  const baselinePlan: Plan = parsed.data.plan ?? getCanonicalPlan();

  // Secure Graph Derivation: Always derive graph on server; never trust browser graph
  const baselineGraph = rebuildGraph(baselinePlan);

  // Look up canonical scenario if specified
  let canonicalPatches = undefined;
  let mergedOverrides: Partial<GlobalConstraints> | undefined =
    constraintOverrides as Partial<GlobalConstraints> | undefined;

  if (scenarioId) {
    const scenariosDoc = getCanonicalScenariosDoc();
    const matchedScenario = scenariosDoc.scenarios.find((s) => s.id === scenarioId);
    if (matchedScenario) {
      canonicalPatches = matchedScenario.candidatePatches;
      mergedOverrides = {
        ...(matchedScenario.constraintOverrides ?? {}),
        ...(mergedOverrides ?? {}),
      };
    }
  }

  const rankingPolicy = getCanonicalRankingPolicy();

  try {
    const result: RunRecoveryResult = runRecovery({
      baselinePlan,
      baselineGraph,
      disruption,
      canonicalPatches,
      constraintOverrides: mergedOverrides,
      selectedProfile,
      rankingPolicy,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal error during recovery orchestration.";
    return NextResponse.json(
      {
        success: false,
        error: message,
        blockingIssues: [message],
      },
      { status: 500 }
    );
  }
}
