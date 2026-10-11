import { handleDraftPlan } from "./route-handler";

/**
 * POST /api/draft-plan
 * AI-assisted plan drafting using Gemini with resilient error handling and explicit provenance.
 */
export async function POST(request: Request) {
  return handleDraftPlan(request);
}
