import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PlanSchema, type Plan } from "../../../src/lib/schemas/plan.schema";
import { type GeminiModelClient } from "../../../src/lib/ai/disruption-interpreter";
import { POST } from "../../../src/app/api/interpret-disruption/route";
import { handleInterpretDisruption } from "../../../src/app/api/interpret-disruption/route-handler";

/**
 * Mock Gemini client for route testing.
 */
class MockGeminiClient implements GeminiModelClient {
  constructor(private response: string | (() => Promise<string> | string)) {}

  async generateContent(): Promise<string> {
    if (typeof this.response === "function") {
      return await this.response();
    }
    return this.response;
  }
}

describe("Milestone S6: Interpret Disruption API Route", () => {
  let baselinePlan: Plan;
  const originalEnvKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    const rawPlan = fs.readFileSync(
      path.resolve(__dirname, "../../../fixtures/planpatch/plan.json"),
      "utf-8"
    );
    baselinePlan = PlanSchema.parse(JSON.parse(rawPlan));
  });

  afterEach(() => {
    if (originalEnvKey !== undefined) {
      process.env.GEMINI_API_KEY = originalEnvKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("returns 200 with parsed disruption for valid request", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_unavailable",
        targetTaskId: "T03",
        field: "bookingStatus",
        newValue: "unavailable",
        description: "The venue is unavailable.",
      })
    );

    const request = new Request("http://localhost:3000/api/interpret-disruption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "The venue is unavailable.",
        plan: baselinePlan,
      }),
    });

    const response = await handleInterpretDisruption(request, mockClient);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.disruption.type).toBe("task_unavailable");
    expect(body.disruption.targetTaskId).toBe("T03");
  });

  it("returns 200 with clarification questions when input is ambiguous", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: false,
        disruptionType: "unsupported",
        clarificationReason: "Could not identify affected resource.",
        clarificationQuestions: ["Which task is affected?"],
      })
    );

    const request = new Request("http://localhost:3000/api/interpret-disruption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Something happened.",
        plan: baselinePlan,
      }),
    });

    const response = await handleInterpretDisruption(request, mockClient);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("clarification_needed");
    expect(body.clarificationQuestions).toContain("Which task is affected?");
  });

  it("returns 400 Bad Request when request body is not valid JSON", async () => {
    const request = new Request("http://localhost:3000/api/interpret-disruption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.error).toContain("Malformed JSON");
  });

  it("returns 400 Bad Request when request body fails schema validation", async () => {
    const request = new Request("http://localhost:3000/api/interpret-disruption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "", // Empty prompt violates min(1)
        plan: baselinePlan,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.error).toContain("Invalid request payload");
  });

  it("returns 500 when GEMINI_API_KEY is missing on server", async () => {
    delete process.env.GEMINI_API_KEY;

    const request = new Request("http://localhost:3000/api/interpret-disruption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Venue is cancelled",
        plan: baselinePlan,
      }),
    });

    // Calling POST directly with no injected client
    const response = await POST(request);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.error).toContain("GEMINI_API_KEY is not configured");
  });

  it("returns 500 when model returns invalid JSON or times out", async () => {
    const mockClient = new MockGeminiClient("invalid json");

    const request = new Request("http://localhost:3000/api/interpret-disruption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "The venue is unavailable.",
        plan: baselinePlan,
      }),
    });

    const response = await handleInterpretDisruption(request, mockClient);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.error).toContain("Model returned invalid JSON.");
  });
});
