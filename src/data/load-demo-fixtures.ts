import rawPlan from "../../fixtures/planpatch/plan.json";
import rawScenarios from "../../fixtures/planpatch/scenarios.json";
import rawRankingPolicy from "../../fixtures/planpatch/ranking-policy.json";
import rawExpectedResults from "../../fixtures/planpatch/expected-results.json";

import {
  PlanSchema,
  ScenariosDocSchema,
  RankingPolicySchema,
  ExpectedResultsDocSchema,
  type Plan,
  type ScenariosDoc,
  type RankingPolicy,
  type ExpectedResultsDoc,
} from "../lib/schemas";

export const canonicalPlan: Plan = PlanSchema.parse(rawPlan);
export const canonicalScenariosDoc: ScenariosDoc = ScenariosDocSchema.parse(rawScenarios);
export const canonicalRankingPolicy: RankingPolicy = RankingPolicySchema.parse(rawRankingPolicy);
export const canonicalExpectedResults: ExpectedResultsDoc = ExpectedResultsDocSchema.parse(rawExpectedResults);

export function getCanonicalPlan(): Plan {
  return JSON.parse(JSON.stringify(canonicalPlan));
}

export function getCanonicalScenariosDoc(): ScenariosDoc {
  return JSON.parse(JSON.stringify(canonicalScenariosDoc));
}

export function getCanonicalRankingPolicy(): RankingPolicy {
  return JSON.parse(JSON.stringify(canonicalRankingPolicy));
}

export function getCanonicalExpectedResults(): ExpectedResultsDoc {
  return JSON.parse(JSON.stringify(canonicalExpectedResults));
}
