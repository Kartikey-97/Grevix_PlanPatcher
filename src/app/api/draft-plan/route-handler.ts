import { NextResponse } from "next/server";
import {
  draftPlan,
  DraftPlanInputSchema,
  generateSmartFallbackDraftPlan,
  type DraftPlanResult,
} from "../../../lib/ai/draft-plan-interpreter";
import {
  classifyGeminiError,
  type GeminiModelClient,
} from "../../../lib/ai/gemini-client";

/**
 * Core handler supporting optional dependency injection for model client.
 * Provides resilient, typed error responses with user-friendly messages.
 */
export async function handleDraftPlan(
  request: Request,
  injectedClient?: GeminiModelClient
): Promise<NextResponse<DraftPlanResult>> {
  // 1. Verify JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<DraftPlanResult>(
      {
        status: "error",
        error: "Malformed JSON in request body.",
        userFriendlyMessage: "The request body was malformed. Please try again.",
        category: "INVALID_MODEL_OUTPUT",
        canRetry: false,
        originalPrompt: "",
      },
      { status: 400 }
    );
  }

  // 2. Validate request input against schema
  const parsedInput = DraftPlanInputSchema.safeParse(body);
  if (!parsedInput.success) {
    const errorDetails = parsedInput.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    return NextResponse.json<DraftPlanResult>(
      {
        status: "error",
        error: `Invalid request payload: ${errorDetails}`,
        userFriendlyMessage: "Please provide a valid plan description.",
        category: "INVALID_MODEL_OUTPUT",
        canRetry: false,
        originalPrompt:
          typeof (body as Record<string, unknown>)?.prompt === "string"
            ? ((body as Record<string, unknown>).prompt as string)
            : "",
      },
      { status: 400 }
    );
  }

  // 3. Verify server-side configuration if no client is injected
  if (!injectedClient && !process.env.GEMINI_API_KEY) {
    return NextResponse.json<DraftPlanResult>(
      {
        status: "error",
        error: "GEMINI_API_KEY environment variable is not configured on the server.",
        userFriendlyMessage:
          "Gemini API key is not configured on the server. You can configure GEMINI_API_KEY or start from our software template or blank plan.",
        category: "AUTH_OR_CONFIG_MISSING",
        canRetry: false,
        originalPrompt: parsedInput.data.prompt,
      },
      { status: 500 }
    );
  }

  // 4. Run server-side plan drafting
  try {
    const result = await draftPlan(parsedInput.data, injectedClient);

    if (result.status === "error") {
      return NextResponse.json<DraftPlanResult>(result, { status: 500 });
    }

    return NextResponse.json<DraftPlanResult>(result, { status: 200 });
  } catch (err: unknown) {
    const classified = classifyGeminiError(err);
    return NextResponse.json<DraftPlanResult>(
      {
        status: "error",
        error: classified.technicalDetails || classified.userMessage,
        userFriendlyMessage: classified.userMessage,
        category: classified.category,
        canRetry: classified.canRetry,
        originalPrompt: parsedInput.data.prompt,
      },
      { status: 500 }
    );
  }
}
