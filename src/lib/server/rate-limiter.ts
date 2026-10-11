import { NextResponse } from "next/server";

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  name?: string;
  message?: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
}

interface ClientRecord {
  timestamps: number[];
}

/**
 * In-memory sliding-window rate limiter for protecting Gemini API quota.
 *
 * NOTE ON SERVERLESS / DISTRIBUTED ARCHITECTURES:
 * In a distributed, multi-instance serverless deployment (e.g. AWS Lambda, Vercel multi-region),
 * each isolated serverless node maintains its own in-memory store. For global quota enforcement
 * across thousands of ephemeral containers, a shared persistent store such as Upstash Redis
 * would be used.
 * Within a single process (development, Node server, or warm container), this in-memory limiter
 * provides immediate protection against rapid loops, accidental UI clicks, and client-side quota exhaustion.
 */
export class RateLimiter {
  private clients = new Map<string, ClientRecord>();
  private windowMs: number;
  private maxRequests: number;
  private message: string;

  constructor(options?: Partial<RateLimiterOptions>) {
    this.windowMs = options?.windowMs ?? 60_000; // 1 minute
    this.maxRequests = options?.maxRequests ?? 15; // 15 requests per minute
    this.message =
      options?.message ??
      "The Gemini AI service is experiencing high request volume. Rate limit exceeded. Please wait a moment before trying again.";
  }

  /**
   * Checks whether the client is within allowed rate limits.
   */
  public check(clientId: string, now: number = Date.now()): RateLimitCheckResult {
    let record = this.clients.get(clientId);
    if (!record) {
      record = { timestamps: [] };
      this.clients.set(clientId, record);
    }

    const cutoff = now - this.windowMs;
    // Prune expired timestamps
    record.timestamps = record.timestamps.filter((t) => t > cutoff);

    const count = record.timestamps.length;
    if (count >= this.maxRequests) {
      const oldest = record.timestamps[0];
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));

      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetMs,
        retryAfterSeconds,
      };
    }

    // Allow and record
    record.timestamps.push(now);
    const resetMs = this.windowMs;
    const retryAfterSeconds = 0;

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - record.timestamps.length,
      resetMs,
      retryAfterSeconds,
    };
  }

  /**
   * Formats a standard HTTP 429 response with appropriate Retry-After and RateLimit headers.
   */
  public create429Response<T = unknown>(
    check: RateLimitCheckResult,
    originalPrompt: string = ""
  ): NextResponse<T> {
    const userMessage = `Rate limit reached. Please wait ${check.retryAfterSeconds}s before retrying.`;

    const body = {
      status: "error" as const,
      error: `Too Many Requests: Rate limit of ${check.limit} requests per ${Math.round(
        this.windowMs / 1000
      )}s exceeded.`,
      userFriendlyMessage: userMessage,
      category: "RATE_LIMIT_OR_OVERLOAD" as const,
      canRetry: true,
      retryAfterSeconds: check.retryAfterSeconds,
      originalPrompt,
    };

    return NextResponse.json(body as unknown as T, {
      status: 429,
      headers: {
        "Retry-After": String(check.retryAfterSeconds),
        "X-RateLimit-Limit": String(check.limit),
        "X-RateLimit-Remaining": String(check.remaining),
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + check.resetMs) / 1000)),
      },
    });
  }

  /**
   * Resets all client records (useful for test isolation).
   */
  public reset(): void {
    this.clients.clear();
  }
}

/**
 * Extracts a safe client identifier from standard request headers.
 */
export function extractClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // Fallback to anonymous local client
  return "local-client";
}

/**
 * Validates and bounds user input payloads to prevent memory exhaustion and runaway token consumption.
 */
export function validatePayloadBounds(
  prompt: string,
  history?: Array<{ role?: string; content?: string; [key: string]: unknown }>
): { valid: boolean; reason?: string } {
  if (typeof prompt !== "string") {
    return { valid: false, reason: "Prompt must be a string." };
  }

  if (prompt.length > 4000) {
    return {
      valid: false,
      reason: `Prompt exceeds maximum allowed size of 4,000 characters (received ${prompt.length}).`,
    };
  }

  if (history && Array.isArray(history)) {
    if (history.length > 20) {
      return {
        valid: false,
        reason: `Conversation history exceeds maximum of 20 turns (received ${history.length}).`,
      };
    }

    for (const msg of history) {
      if (typeof msg.content === "string" && msg.content.length > 3000) {
        return {
          valid: false,
          reason: "Individual conversation turn exceeds maximum of 3,000 characters.",
        };
      }
    }
  }

  return { valid: true };
}

// Global shared instances for route handlers
export const disruptionRateLimiter = new RateLimiter({
  windowMs: 60_000,
  maxRequests: 15,
});

export const draftPlanRateLimiter = new RateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
});
