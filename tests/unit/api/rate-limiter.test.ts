import { describe, it, expect } from "vitest";
import {
  RateLimiter,
  validatePayloadBounds,
  extractClientIdentifier,
} from "../../../src/lib/server/rate-limiter";

describe("Milestone Challenge 3 — Server-side Rate Limiter & Payload Bounds", () => {
  describe("RateLimiter sliding-window behaviour", () => {
    it("permits requests within quota window", () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        name: "test-limiter",
      });

      const r1 = limiter.check("client-1");
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.check("client-1");
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.check("client-1");
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it("blocks requests exceeding quota window and returns reset time", () => {
      const limiter = new RateLimiter({
        windowMs: 10000,
        maxRequests: 2,
        name: "test-limiter",
      });

      limiter.check("client-2");
      limiter.check("client-2");
      const r3 = limiter.check("client-2");

      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.retryAfterSeconds).toBeGreaterThan(0);
      expect(r3.retryAfterSeconds).toBeLessThanOrEqual(10);
    });

    it("tracks different client identifiers independently", () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        name: "test-limiter",
      });

      const c1 = limiter.check("client-a");
      expect(c1.allowed).toBe(true);

      const c1_blocked = limiter.check("client-a");
      expect(c1_blocked.allowed).toBe(false);

      const c2 = limiter.check("client-b");
      expect(c2.allowed).toBe(true);
    });

    it("generates HTTP 429 response with typed headers and safe error json", async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        name: "test-limiter",
      });

      limiter.check("client-429");
      const checkResult = limiter.check("client-429");
      expect(checkResult.allowed).toBe(false);

      const res = limiter.create429Response(checkResult, "Test prompt disruption");
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe(String(checkResult.retryAfterSeconds));
      expect(res.headers.get("X-RateLimit-Limit")).toBe("1");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");

      const body = await res.json();
      expect(body.status).toBe("error");
      expect(body.category).toBe("RATE_LIMIT_OR_OVERLOAD");
      expect(body.canRetry).toBe(true);
      expect(body.userFriendlyMessage).toContain("Rate limit reached");
      expect(body.originalPrompt).toBe("Test prompt disruption");
    });
  });

  describe("Payload bounds checking", () => {
    it("accepts valid prompts and reasonable histories", () => {
      const result = validatePayloadBounds("Change venue booking to auditorium", [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects prompts exceeding maximum character bound (4000 chars)", () => {
      const hugePrompt = "A".repeat(4001);
      const result = validatePayloadBounds(hugePrompt);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("exceeds maximum allowed size");
    });

    it("rejects conversation history exceeding maximum turns (20 turns)", () => {
      const excessiveHistory = Array.from({ length: 21 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i}`,
      }));

      const result = validatePayloadBounds("Short prompt", excessiveHistory);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("exceeds maximum of 20 turns");
    });
  });

  describe("Client identifier extraction", () => {
    it("extracts from x-forwarded-for header", () => {
      const req = new Request("http://localhost:3000/api/interpret-disruption", {
        headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
      });
      expect(extractClientIdentifier(req)).toBe("203.0.113.195");
    });

    it("falls back to x-real-ip when x-forwarded-for is missing", () => {
      const req = new Request("http://localhost:3000/api/interpret-disruption", {
        headers: { "x-real-ip": "198.51.100.4" },
      });
      expect(extractClientIdentifier(req)).toBe("198.51.100.4");
    });

    it("falls back to local-client when no ip headers present", () => {
      const req = new Request("http://localhost:3000/api/interpret-disruption");
      expect(extractClientIdentifier(req)).toBe("local-client");
    });
  });
});
