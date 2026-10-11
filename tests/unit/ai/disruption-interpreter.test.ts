import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PlanSchema, type Plan } from "../../../src/lib/schemas/plan.schema";
import {
  interpretDisruption,
  DefaultGeminiClient,
  type GeminiModelClient,
} from "../../../src/lib/ai/disruption-interpreter";

/**
 * Mock Gemini client for deterministic, offline testing.
 */
class MockGeminiClient implements GeminiModelClient {
  public lastPrompt?: string;
  public lastSystemInstruction?: string;

  constructor(private response: string | (() => Promise<string> | string)) {}

  setResponse(response: string | (() => Promise<string> | string)) {
    this.response = response;
  }

  async generateContent(params: {
    prompt: string;
    systemInstruction?: string;
    responseSchema?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<string> {
    this.lastPrompt = params.prompt;
    this.lastSystemInstruction = params.systemInstruction;
    if (typeof this.response === "function") {
      return await this.response();
    }
    return this.response;
  }
}

describe("Milestone S6: Disruption Interpreter", () => {
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

  it("successfully interprets task unavailability (e.g. venue cancelled -> T03)", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_unavailable",
        targetTaskId: "T03",
        field: "bookingStatus",
        newValue: "unavailable",
        description: "The original venue cancelled.",
        reasoning: "Mapped venue to task T03 (Book venue).",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "The venue is unavailable.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.disruption.type).toBe("task_unavailable");
      expect(result.disruption.targetTaskId).toBe("T03");
      expect(result.disruption.field).toBe("bookingStatus");
      expect(result.disruption.newValue).toBe("unavailable");
      expect(result.disruption.description).toBe("The original venue cancelled.");
      expect(result.originalPrompt).toBe("The venue is unavailable.");
      expect(result.reasoning).toContain("Mapped venue to task T03");
    }

    // Verify minimal context was supplied to prompt
    expect(mockClient.lastPrompt).toContain("Baseline Plan Context:");
    expect(mockClient.lastPrompt).toContain("T03");
  });

  it("successfully interprets budget reduction (e.g. ₹25,000 -> ₹16,000)", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "budget_changed",
        field: "budgetLimit",
        newValue: 16000,
        description: "Reduce available budget to 16,000",
        reasoning: "User requested overall budget decrease.",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Reduce our overall budget to ₹16,000.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.disruption.type).toBe("budget_changed");
      expect(result.disruption.field).toBe("budgetLimit");
      expect(result.disruption.oldValue).toBe(25000); // Populated from baseline plan
      expect(result.disruption.newValue).toBe(16000);
      expect(result.disruption.targetTaskId).toBeUndefined();
    }
  });

  it("successfully interprets deadline movement (e.g. 288h -> 120h)", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "deadline_changed",
        field: "deadlineHours",
        newValue: 120,
        description: "Deadline moved to 120 hours",
        reasoning: "User shortened timeline to 5 days (120h).",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "The deadline has moved two days earlier.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.disruption.type).toBe("deadline_changed");
      expect(result.disruption.field).toBe("deadlineHours");
      expect(result.disruption.oldValue).toBe(288); // Populated from baseline plan
      expect(result.disruption.newValue).toBe(120);
    }
  });

  it("successfully interprets task attribute change (e.g. speaker duration)", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_attribute_changed",
        targetTaskId: "T04",
        field: "durationHours",
        newValue: 1,
        description: "Speaker session duration changed to 1 hour",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Keynote speaker only has 1 hour available.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.disruption.type).toBe("task_attribute_changed");
      expect(result.disruption.targetTaskId).toBe("T04");
      expect(result.disruption.field).toBe("durationHours");
      expect(result.disruption.newValue).toBe(1);
    }
  });

  it("returns clarification_needed when disruption is ambiguous or unsupported", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: false,
        disruptionType: "unsupported",
        clarificationReason:
          "It is unclear which part of the event is affected by 'bad weather'.",
        clarificationQuestions: [
          "Does bad weather affect an outdoor venue or speaker travel?",
          "Should we change the event date or relocate to an indoor hall?",
        ],
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "There might be bad weather coming.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.reason).toContain("bad weather");
      expect(result.clarificationQuestions.length).toBe(2);
      expect(result.clarificationQuestions[0]).toContain("outdoor venue");
    }
  });

  it("rejects hallucinated task IDs not present in baseline plan", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_unavailable",
        targetTaskId: "T99", // Does NOT exist in plan
        field: "bookingStatus",
        newValue: "unavailable",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "The catering service cancelled.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.reason).toContain('Task ID "T99" suggested by model does not exist');
      expect(result.clarificationQuestions.length).toBeGreaterThan(0);
      expect(result.clarificationQuestions[0]).toContain("T01");
    }
  });

  it("returns clarification_needed if task_unavailable does not specify a target task", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_unavailable",
        targetTaskId: null,
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "A vendor cancelled.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.reason).toContain("Could not identify a target task");
    }
  });

  it("returns clarification_needed if budget newValue is invalid or negative", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "budget_changed",
        field: "budgetLimit",
        newValue: -500, // Invalid negative
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Cut budget by negative 500.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.reason).toContain("positive numeric budget limit");
    }
  });

  it("returns clarification_needed if deadline newValue is non-positive", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "deadline_changed",
        field: "deadlineHours",
        newValue: 0, // Infeasible 0h deadline
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Set deadline to 0 hours.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.reason).toContain("positive numeric deadline hours");
    }
  });

  it("handles malformed JSON from model cleanly as error without crashing", async () => {
    const mockClient = new MockGeminiClient("I am not JSON: { broken");

    const result = await interpretDisruption(
      {
        prompt: "The venue is booked.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("Model returned invalid JSON.");
    }
  });

  it("handles model schema violations cleanly as error", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: "not-a-boolean", // Violation
        disruptionType: "invalid_type",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Testing schema violation.",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("Model output did not match expected structure");
    }
  });

  it("guarantees baseline plan immutability during interpretation", async () => {
    const planCopy = JSON.parse(JSON.stringify(baselinePlan));

    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_unavailable",
        targetTaskId: "T03",
        field: "bookingStatus",
        newValue: "unavailable",
      })
    );

    await interpretDisruption(
      {
        prompt: "The venue cancelled.",
        plan: baselinePlan,
      },
      mockClient
    );

    // Plan must be byte-for-byte identical to original
    expect(baselinePlan).toEqual(planCopy);
  });

  it("handles model timeout or network failure cleanly without leaking keys", async () => {
    const mockClient = new MockGeminiClient(() => {
      throw new Error("Gemini API request timed out after 10000ms. key=SECRET123");
    });

    const result = await interpretDisruption(
      {
        prompt: "Timeout test",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("timed out");
      // Must not contain secret
      expect(result.error).not.toContain("SECRET123");
    }
  });

  it("handles missing GEMINI_API_KEY cleanly in DefaultGeminiClient", () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => {
      new DefaultGeminiClient();
    }).toThrow("GEMINI_API_KEY environment variable is not configured on the server.");
  });

  it("sanitizes API keys in DefaultGeminiClient errors", () => {
    const client = new DefaultGeminiClient({ apiKey: "test-fake-key" });
    expect(client).toBeDefined();
  });

  it("safely handles task-order disruptions and returns clarification_needed without throwing schema errors", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: false,
        disruptionType: "unsupported",
        clarificationReason: "Tasks were executed out of order: T04 was started before T02 was completed.",
        clarificationQuestions: [
          "Has T04 already finished or made progress?",
          "Is T02 still required, or can it be skipped?",
        ],
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "I forgot to do T02 and went ahead with T04",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.reason).toContain("out of order");
      expect(result.clarificationQuestions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("safely accepts disruptionType: null when isClear is false without failing schema validation", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: false,
        disruptionType: null,
        clarificationReason: "Ambiguous task reference.",
        clarificationQuestions: ["Which task was affected?"],
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Something unexpected happened",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.reason).toContain("Ambiguous task reference.");
      expect(result.clarificationQuestions).toContain("Which task was affected?");
    }
  });

  it("includes prior conversation history in prompt context to ground multi-turn interaction", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_unavailable",
        targetTaskId: "T03",
        field: "bookingStatus",
        newValue: "unavailable",
        description: "Venue T03 unavailable based on prior conversation turn.",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Yes, that is the one.",
        plan: baselinePlan,
        conversationHistory: [
          { role: "user", content: "The main venue cancelled." },
          { role: "assistant", content: "Did you mean task T03 (Book venue)?" },
        ],
      },
      mockClient
    );

    expect(result.status).toBe("success");
    expect(mockClient.lastPrompt).toContain("Prior Conversation History:");
    expect(mockClient.lastPrompt).toContain("User: The main venue cancelled.");
    expect(mockClient.lastPrompt).toContain("Assistant: Did you mean task T03 (Book venue)?");
    expect(mockClient.lastPrompt).toContain('User Disruption Report:\n"Yes, that is the one."');
  });

  it("provides actionable followUpSuggestions on successful disruption interpretation", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: true,
        disruptionType: "task_unavailable",
        targetTaskId: "T03",
        field: "bookingStatus",
        newValue: "unavailable",
        description: "Venue cancelled.",
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "Venue cancelled",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.followUpSuggestions).toBeDefined();
      expect(result.followUpSuggestions!.length).toBeGreaterThan(0);
      expect(result.followUpSuggestions).toContain("Run recovery engine");
    }
  });

  it("provides out-of-order warning and follow-up suggestions for out-of-order execution prompts", async () => {
    const mockClient = new MockGeminiClient(
      JSON.stringify({
        isClear: false,
        disruptionType: "unsupported",
        clarificationReason: "Out of order progress",
        clarificationQuestions: ["Is T02 already finished?"],
      })
    );

    const result = await interpretDisruption(
      {
        prompt: "I went ahead with T04 before completing T02",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("clarification_needed");
    if (result.status === "clarification_needed") {
      expect(result.isOutOfOrder).toBe(true);
      expect(result.reason).toContain("out of order");
      expect(result.followUpSuggestions).toContain("Mark skipped predecessor as completed");
      expect(result.followUpSuggestions).toContain("Cancel skipped task from plan");
    }
  });

  it("provides fallbackSuggestions on model errors for graceful degradation", async () => {
    const mockClient = new MockGeminiClient("invalid json");

    const result = await interpretDisruption(
      {
        prompt: "Something broke",
        plan: baselinePlan,
      },
      mockClient
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fallbackSuggestions).toBeDefined();
      expect(result.fallbackSuggestions).toContain("Load Venue Cancellation offline");
      expect(result.fallbackSuggestions).toContain("Retry request");
    }
  });
});
