import { NextResponse } from "next/server";
import {
  interpretDisruption,
  InterpretDisruptionInputSchema,
  type GeminiModelClient,
  type InterpretationResult,
  classifyGeminiError,
} from "../../../lib/ai/disruption-interpreter";

/**
 * Core handler supporting optional dependency injection for model client.
 * Keeps interpretation strictly separate from authorization and plan execution.
 */
export async function handleInterpretDisruption(
  request: Request,
  injectedClient?: GeminiModelClient
): Promise<NextResponse<InterpretationResult>> {
  // 1. Verify JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<InterpretationResult>(
      {
        status: "error",
        error: "Malformed JSON in request body.",
        originalPrompt: "",
      },
      { status: 400 }
    );
  }

  // 2. Validate request input against schema
  const parsedInput = InterpretDisruptionInputSchema.safeParse(body);
  if (!parsedInput.success) {
    const errorDetails = parsedInput.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    return NextResponse.json<InterpretationResult>(
      {
        status: "error",
        error: `Invalid request payload: ${errorDetails}`,
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
    return NextResponse.json<InterpretationResult>(
      {
        status: "error",
        error:
          "GEMINI_API_KEY is not configured on the server. Natural-language disruption interpretation is unavailable.",
        userFriendlyMessage:
          "Gemini API key is not configured on the server. Please configure GEMINI_API_KEY or select from the pre-configured scenarios.",
        category: "AUTH_OR_CONFIG_MISSING",
        canRetry: false,
        originalPrompt: parsedInput.data.prompt,
      },
      { status: 500 }
    );
  }

  // 4. Run server-side interpretation
  try {
    const result = await interpretDisruption(parsedInput.data, injectedClient);

    // Differentiate HTTP status based on result status
    if (result.status === "error") {
      return NextResponse.json<InterpretationResult>(result, { status: 500 });
    }

    // 200 for both "success" and "clarification_needed"
    return NextResponse.json<InterpretationResult>(result, { status: 200 });
  } catch (err: unknown) {
    const classified = classifyGeminiError(err);
    return NextResponse.json<InterpretationResult>(
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
