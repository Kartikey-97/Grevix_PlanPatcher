/**
 * Shared Gemini API client and resilient error categorization module.
 * Protects secrets, prevents leakage, and provides clear user-friendly guidance.
 */

export type GeminiErrorCategory =
  | "RATE_LIMIT_OR_OVERLOAD"
  | "NETWORK_OR_TIMEOUT"
  | "AUTH_OR_CONFIG_MISSING"
  | "INVALID_MODEL_OUTPUT"
  | "UPSTREAM_FAILURE";

export interface ClassifiedGeminiError {
  category: GeminiErrorCategory;
  userMessage: string;
  canRetry: boolean;
  technicalDetails?: string;
}

/**
 * Sanitizes any raw string to prevent leaking API keys or secrets.
 */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/key=[^&\s]+/gi, "key=***")
    .replace(/x-goog-api-key:[^\n\r]+/gi, "x-goog-api-key: ***")
    .replace(/AQ\.[A-Za-z0-9_-]+/g, "AQ.***")
    .replace(/AIza[0-9A-Za-z-_]+/g, "AIza***");
}

/**
 * Classifies unknown errors into structured, user-friendly categories.
 */
export function classifyGeminiError(err: unknown): ClassifiedGeminiError {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();
  const sanitized = sanitizeErrorMessage(rawMsg);

  // 1. Missing authentication or server configuration
  if (
    lower.includes("gemini_api_key") ||
    lower.includes("api key") ||
    lower.includes("unauthenticated") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("forbidden")
  ) {
    return {
      category: "AUTH_OR_CONFIG_MISSING",
      userMessage:
        "Gemini API key is not configured or unauthorized on the server. You can configure GEMINI_API_KEY in .env.local or use manual templates.",
      canRetry: false,
      technicalDetails: sanitized,
    };
  }

  // 2. Rate limit or upstream overload
  if (
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("overloaded") ||
    lower.includes("unavailable") ||
    lower.includes("high demand")
  ) {
    return {
      category: "RATE_LIMIT_OR_OVERLOAD",
      userMessage:
        "The Gemini AI service is temporarily experiencing high demand or rate limits. Please try again in a moment.",
      canRetry: true,
      technicalDetails: sanitized,
    };
  }

  // 3. Network or timeout
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("timed-out") ||
    lower.includes("aborterror") ||
    lower.includes("abort") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return {
      category: "NETWORK_OR_TIMEOUT",
      userMessage:
        "The AI request timed out or experienced a network connection problem. Please check your network and retry.",
      canRetry: true,
      technicalDetails: sanitized,
    };
  }

  // 4. Invalid or malformed output
  if (
    lower.includes("invalid json") ||
    lower.includes("malformed") ||
    lower.includes("schema validation") ||
    lower.includes("unexpected structure")
  ) {
    return {
      category: "INVALID_MODEL_OUTPUT",
      userMessage:
        "The AI model produced an unexpected or malformed response. You can refine your prompt or retry.",
      canRetry: true,
      technicalDetails: sanitized,
    };
  }

  // 5. General upstream failure
  return {
    category: "UPSTREAM_FAILURE",
    userMessage:
      "An unexpected upstream error occurred while communicating with the AI service. Please retry or continue manually.",
    canRetry: true,
    technicalDetails: sanitized,
  };
}

/**
 * Executes an async operation with bounded 1-time retry for transient overload errors.
 * Note: Does not auto-retry long timeouts to avoid doubling user wait times.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    delayMs?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 1;
  const delayMs = options?.delayMs ?? 500;
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (err: unknown) {
      attempt++;
      const classified = classifyGeminiError(err);
      // Auto-retry transient rate limits / overloads (429/503), but do NOT auto-retry timeouts
      if (
        attempt > maxRetries ||
        !classified.canRetry ||
        classified.category === "NETWORK_OR_TIMEOUT"
      ) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Abstraction for calling the Gemini model.
 * Enables zero-network, zero-cost deterministic testing through dependency injection.
 */
export interface GeminiModelClient {
  generateContent(params: {
    prompt: string;
    systemInstruction?: string;
    responseSchema?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<string>;
}

/**
 * Default server-side Gemini client using native fetch and standard Google AI endpoint.
 * Reads API key exclusively from process.env.GEMINI_API_KEY.
 * Never logs or exposes the key.
 */
export class DefaultGeminiClient implements GeminiModelClient {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(options?: { apiKey?: string; model?: string; timeoutMs?: number }) {
    const key = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not configured on the server.");
    }
    const envModel = process.env.GEMINI_MODEL;
    let selectedModel = options?.model ?? envModel ?? "gemini-3.5-flash-lite";
    if (
      selectedModel === "gemini-flash-latest" ||
      selectedModel === "gemini-2.5-flash" ||
      selectedModel === "gemini-3.8-flash"
    ) {
      selectedModel = "gemini-3.5-flash-lite";
    }
    this.apiKey = key;
    this.model = selectedModel;
    this.timeoutMs =
      options?.timeoutMs ??
      (process.env.GEMINI_TIMEOUT_MS
        ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10)
        : 20000);
  }

  async generateContent(params: {
    prompt: string;
    systemInstruction?: string;
    responseSchema?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent`;

    return await executeWithRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        const combinedSignal = params.signal ?? controller.signal;

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: params.prompt }],
                },
              ],
              systemInstruction: params.systemInstruction
                ? {
                    parts: [{ text: params.systemInstruction }],
                  }
                : undefined,
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: params.responseSchema,
              },
            }),
            signal: combinedSignal,
          });

          if (!response.ok) {
            let errMessage = `HTTP ${response.status}`;
            try {
              const errData = await response.json();
              if (errData?.error?.message) {
                errMessage = errData.error.message;
              }
            } catch {
              // Ignore JSON parse error on response body
            }
            const sanitized = sanitizeErrorMessage(errMessage);
            throw new Error(`Gemini API call failed: ${sanitized}`);
          }

          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text || typeof text !== "string") {
            throw new Error("Gemini returned empty or malformed candidate text.");
          }

          return text;
        } catch (err: unknown) {
          if (err instanceof Error) {
            if (err.name === "AbortError") {
              throw new Error(`Gemini API request timed out after ${this.timeoutMs}ms.`);
            }
            const sanitized = sanitizeErrorMessage(err.message);
            throw new Error(sanitized);
          }
          throw new Error("Unknown error while communicating with Gemini API.");
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { maxRetries: 1, delayMs: 400 }
    );
  }
}
