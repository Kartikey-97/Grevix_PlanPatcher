import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  draftPlan,
  generateSmartFallbackDraftPlan,
  type DraftPlanInput,
} from "../../../src/lib/ai/draft-plan-interpreter";
import {
  convertDraftToPlan,
  DraftPlanSchema,
  type DraftPlan,
} from "../../../src/lib/schemas/draft-plan.schema";
import { PlanSchema } from "../../../src/lib/schemas/plan.schema";
import {
  classifyGeminiError,
  sanitizeErrorMessage,
  executeWithRetry,
  type GeminiModelClient,
} from "../../../src/lib/ai/gemini-client";
import { handleDraftPlan } from "../../../src/app/api/draft-plan/route-handler";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";

/**
 * Mock client for offline, deterministic testing.
 */
class MockGeminiClient implements GeminiModelClient {
  public callCount = 0;
  public lastPrompt?: string;

  constructor(private response: string | (() => Promise<string> | string)) {}

  setResponse(response: string | (() => Promise<string> | string)) {
    this.response = response;
  }

  async generateContent(params: { prompt: string }): Promise<string> {
    this.callCount++;
    this.lastPrompt = params.prompt;
    if (typeof this.response === "function") {
      return await this.response();
    }
    return this.response;
  }
}

describe("Milestone S7.3: AI-Assisted Plan Creation and Resilient Gemini UX", () => {
  const originalEnvKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    registerEventPlanningValidator();
  });

  afterEach(() => {
    if (originalEnvKey !== undefined) {
      process.env.GEMINI_API_KEY = originalEnvKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  describe("1. draftPlan Core Interpreter", () => {
    it("successfully creates a phased draft with user-provided budget and deadline", async () => {
      const mockClient = new MockGeminiClient(
        JSON.stringify({
          name: "Full-Stack SaaS Platform",
          goal: "Build and deploy an MVP web service with database, auth, and UI.",
          domain: "software-engineering",
          budgetLimit: 50000,
          budgetProvenance: "user_provided",
          deadlineHours: 168,
          deadlineProvenance: "user_provided",
          currency: "INR",
          tasks: [
            {
              id: "T01",
              title: "Architecture & Schema Design",
              description: "Design relational schema and API contracts",
              cost: 10000,
              costProvenance: "ai_estimate",
              durationHours: 24,
              durationProvenance: "ai_estimate",
              priority: 5,
              policy: "fixed",
              predecessorIds: [],
            },
            {
              id: "T02",
              title: "Backend API & Database Setup",
              description: "Implement core REST API and data access",
              cost: 20000,
              costProvenance: "ai_estimate",
              durationHours: 48,
              durationProvenance: "ai_estimate",
              priority: 4,
              policy: "flexible",
              predecessorIds: ["T01"],
            },
            {
              id: "T03",
              title: "Frontend Client Development",
              description: "Build Next.js web application interface",
              cost: 15000,
              costProvenance: "ai_estimate",
              durationHours: 48,
              durationProvenance: "ai_estimate",
              priority: 3,
              policy: "flexible",
              predecessorIds: ["T01"],
            },
            {
              id: "T04",
              title: "Automated Testing & Security Audit",
              description: "End-to-end integration tests and vulnerability scan",
              cost: 5000,
              costProvenance: "ai_estimate",
              durationHours: 24,
              durationProvenance: "ai_estimate",
              priority: 4,
              policy: "flexible",
              predecessorIds: ["T02", "T03"],
            },
          ],
          assumptions: ["Standard 2-person engineering team", "Managed cloud database"],
          missingInformation: ["Target cloud hosting provider not specified"],
        })
      );

      const result = await draftPlan(
        {
          prompt: "I want to build a full-stack SaaS platform in 7 days.",
          budgetLimit: 50000,
          deadlineHours: 168,
          currency: "INR",
        },
        mockClient
      );

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.draft.name).toBe("Full-Stack SaaS Platform");
        expect(result.draft.budgetLimit).toBe(50000);
        expect(result.draft.budgetProvenance).toBe("user_provided");
        expect(result.draft.deadlineHours).toBe(168);
        expect(result.draft.deadlineProvenance).toBe("user_provided");
        expect(result.draft.tasks).toHaveLength(4);
        expect(result.draft.tasks[0].id).toBe("T01");
        expect(result.draft.tasks[1].predecessorIds).toContain("T01");
        expect(result.draft.tasks[0].costProvenance).toBe("ai_estimate");
        expect(result.assumptions).toContain("Standard 2-person engineering team");
        expect(result.missingInformation).toContain(
          "Target cloud hosting provider not specified"
        );
        // "software-engineering" has no registered domain validator -> unverified domain
        expect(result.isDomainVerified).toBe(false);
      }
    });

    it("correctly identifies verified domain for event-planning", async () => {
      const mockClient = new MockGeminiClient(
        JSON.stringify({
          name: "Annual Developer Summit",
          goal: "Organize campus event with venue and catering",
          domain: "event-planning",
          budgetLimit: null,
          budgetProvenance: "missing",
          deadlineHours: null,
          deadlineProvenance: "missing",
          currency: "INR",
          tasks: [
            {
              id: "T01",
              title: "Secure Main Auditorium",
              cost: 25000,
              costProvenance: "ai_estimate",
              durationHours: 12,
              durationProvenance: "ai_estimate",
              priority: 5,
              policy: "fixed",
              predecessorIds: [],
            },
          ],
          assumptions: [],
          missingInformation: ["Actual attendee count"],
        })
      );

      const result = await draftPlan(
        { prompt: "Organize a developer conference" },
        mockClient
      );

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.domainName).toBe("event-planning");
        expect(result.isDomainVerified).toBe(true);
        expect(result.draft.budgetProvenance).toBe("missing");
      }
    });

    it("preserves user-provided budget limit of 0 with user_provided provenance", async () => {
      const mockClient = new MockGeminiClient(
        JSON.stringify({
          name: "Self-Paced Machine Learning",
          goal: "Learn machine learning using open-source courses and free tools",
          domain: "education",
          budgetLimit: 0,
          budgetProvenance: "user_provided",
          deadlineHours: 29,
          deadlineProvenance: "user_provided",
          currency: "INR",
          tasks: [
            {
              id: "T01",
              title: "Linear Algebra & Calculus Foundations",
              cost: 0,
              costProvenance: "user_provided",
              durationHours: 10,
              durationProvenance: "ai_estimate",
              priority: 5,
              policy: "fixed",
              predecessorIds: [],
            },
            {
              id: "T02",
              title: "Python & Scikit-Learn Exercises",
              cost: 0,
              costProvenance: "user_provided",
              durationHours: 19,
              durationProvenance: "ai_estimate",
              priority: 4,
              policy: "flexible",
              predecessorIds: ["T01"],
            },
          ],
          assumptions: ["Using free online tutorials"],
          missingInformation: [],
        })
      );

      const result = await draftPlan(
        {
          prompt: "i want to learn machiine learning",
          budgetLimit: 0,
          deadlineHours: 29,
        },
        mockClient
      );

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.draft.budgetLimit).toBe(0);
        expect(result.draft.budgetProvenance).toBe("user_provided");
        expect(result.draft.deadlineHours).toBe(29);
        expect(result.draft.deadlineProvenance).toBe("user_provided");

        const plan = convertDraftToPlan(result.draft);
        expect(plan.constraints.budgetLimit).toBe(0);
      }
    });

    it("ensures unspecified budget and deadline remain missing and are not labeled user_provided", async () => {
      const mockClient = new MockGeminiClient(
        JSON.stringify({
          name: "Self-Paced ML Learning",
          goal: "Learn machine learning basics",
          domain: "education",
          budgetLimit: null,
          budgetProvenance: "user_provided", // Model falsely claimed user provided it!
          deadlineHours: null,
          deadlineProvenance: "user_provided", // Model falsely claimed user provided it!
          currency: "INR",
          tasks: [
            {
              id: "T01",
              title: "Python & Math Prerequisites",
              cost: 0,
              costProvenance: "user_provided", // Model falsely claimed user provided it!
              durationHours: 10,
              durationProvenance: "ai_estimate",
              priority: 4,
              policy: "fixed",
              predecessorIds: [],
            },
          ],
          assumptions: ["Self-study using online docs"],
          missingInformation: ["Target completion date"],
        })
      );

      const result = await draftPlan(
        {
          prompt: "I want to learn ML",
          // budgetLimit and deadlineHours omitted
        },
        mockClient
      );

      expect(result.status).toBe("success");
      if (result.status === "success") {
        // Budget and deadline provenance should be demoted from user_provided to missing
        expect(result.draft.budgetProvenance).toBe("missing");
        expect(result.draft.deadlineProvenance).toBe("missing");
        // Task cost provenance drafted by AI must not be falsely claimed as user_provided
        expect(result.draft.tasks[0].costProvenance).toBe("ai_estimate");
        expect(result.draft.tasks[0].policyProvenance).toBe("ai_estimate");

        // When converting to Plan, omitted budget/deadline must stay undefined (never fabricated 0)
        const plan = convertDraftToPlan(result.draft);
        expect(plan.constraints.budgetLimit).toBeUndefined();
        expect(plan.constraints.deadlineHours).toBeUndefined();
      }
    });

    it("breaks dependency cycles if model proposes circular dependencies", async () => {
      const mockClient = new MockGeminiClient(
        JSON.stringify({
          name: "Cyclic Test Project",
          goal: "Test cycle breaking",
          domain: "generic",
          budgetLimit: null,
          budgetProvenance: "missing",
          deadlineHours: null,
          deadlineProvenance: "missing",
          currency: "INR",
          tasks: [
            {
              id: "T01",
              title: "Task 1",
              cost: 1000,
              costProvenance: "ai_estimate",
              durationHours: 10,
              durationProvenance: "ai_estimate",
              priority: 3,
              policy: "flexible",
              // T01 circularly depends on T02
              predecessorIds: ["T02"],
            },
            {
              id: "T02",
              title: "Task 2",
              cost: 2000,
              costProvenance: "ai_estimate",
              durationHours: 10,
              durationProvenance: "ai_estimate",
              priority: 3,
              policy: "flexible",
              // T02 depends on T01
              predecessorIds: ["T01"],
            },
          ],
          assumptions: [],
          missingInformation: [],
        })
      );

      const result = await draftPlan(
        { prompt: "Run cycle test project" },
        mockClient
      );

      expect(result.status).toBe("success");
      if (result.status === "success") {
        // T01 (index 0) cannot depend on later task T02, so the backward cycle was broken
        expect(result.draft.tasks[0].predecessorIds).not.toContain("T02");
        expect(result.draft.tasks[1].predecessorIds).toContain("T01");
      }
    });

    it("synthesizes resilient ML domain fallback draft when requested", () => {
      const fallback = generateSmartFallbackDraftPlan({
        prompt: "i want to learn ml",
      });
      expect(fallback.name).toContain("Machine Learning");
      expect(fallback.domain).toBe("education");
      expect(fallback.tasks.length).toBe(5);
      expect(fallback.budgetProvenance).toBe("missing");
      expect(fallback.deadlineProvenance).toBe("missing");
      expect(fallback.tasks[0].costProvenance).toBe("ai_estimate");
      expect(fallback.tasks[1].predecessorIds).toContain("T01");

      const converted = convertDraftToPlan(fallback);
      expect(converted.tasks).toHaveLength(5);
      expect(converted.dependencies.length).toBeGreaterThanOrEqual(4);
      expect(converted.constraints.budgetLimit).toBeUndefined();
    });

    it("synthesizes resilient culinary and cooking domain draft for 'i want to learn how to cook'", () => {
      const fallback = generateSmartFallbackDraftPlan({
        prompt: "i want to learn how to cook",
      });
      expect(fallback.name).toContain("Culinary & Cooking");
      expect(fallback.domain).toBe("culinary");
      expect(fallback.tasks).toHaveLength(5);
      expect(fallback.tasks[0].title).toContain("Kitchen Setup");
      expect(fallback.tasks[1].title).toContain("Heat Control");
      expect(fallback.tasks[2].title).toContain("Stocks");
      expect(fallback.tasks[4].title).toContain("Meal Execution");
      expect(fallback.budgetProvenance).toBe("missing");
      expect(fallback.deadlineProvenance).toBe("missing");

      const converted = convertDraftToPlan(fallback);
      expect(converted.tasks).toHaveLength(5);
      expect(converted.dependencies.length).toBe(4);
    });
  });

  describe("2. Error Categorization & Resilient UX", () => {
    it("classifies rate limits and overloads (429/503/RESOURCE_EXHAUSTED) as retryable", () => {
      const err = new Error("Gemini API call failed: HTTP 429 RESOURCE_EXHAUSTED quota exceeded");
      const classified = classifyGeminiError(err);

      expect(classified.category).toBe("RATE_LIMIT_OR_OVERLOAD");
      expect(classified.canRetry).toBe(true);
      expect(classified.userMessage).toContain("high demand or rate limits");
    });

    it("classifies timeouts and aborts as retryable network errors", () => {
      const err = new Error("Gemini API request timed out after 30000ms.");
      const classified = classifyGeminiError(err);

      expect(classified.category).toBe("NETWORK_OR_TIMEOUT");
      expect(classified.canRetry).toBe(true);
      expect(classified.userMessage).toContain("timed out");
    });

    it("classifies missing GEMINI_API_KEY as non-retryable configuration error", () => {
      const err = new Error("GEMINI_API_KEY environment variable is not configured on the server.");
      const classified = classifyGeminiError(err);

      expect(classified.category).toBe("AUTH_OR_CONFIG_MISSING");
      expect(classified.canRetry).toBe(false);
      expect(classified.userMessage).toContain("not configured");
    });

    it("sanitizes API keys and sensitive tokens from error messages", () => {
      const sensitive = "Error at https://example.com?key=AIzaSyA123456789&foo=bar with x-goog-api-key: AQ.Ab8RN6Kf6fhAW6dfQ";
      const sanitized = sanitizeErrorMessage(sensitive);

      expect(sanitized).not.toContain("AIzaSyA123456789");
      expect(sanitized).not.toContain("AQ.Ab8RN6Kf6fhAW6dfQ");
      expect(sanitized).toContain("key=***");
    });

    it("executeWithRetry retries transient errors up to bounded limit", async () => {
      let attempts = 0;
      const result = await executeWithRetry(
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error("HTTP 503 Service Unavailable");
          }
          return "recovered_data";
        },
        { maxRetries: 1, delayMs: 10 }
      );

      expect(attempts).toBe(2);
      expect(result).toBe("recovered_data");
    });
  });

  describe("3. Draft-to-Plan Conversion & Validation", () => {
    it("converts a valid DraftPlan into a canonical Plan passing PlanSchema", () => {
      const draft: DraftPlan = {
        name: "Test Draft Conversion",
        goal: "Demonstrate draft conversion",
        domain: "software-engineering",
        budgetLimit: 75000,
        budgetProvenance: "user_provided",
        deadlineHours: 120,
        deadlineProvenance: "user_provided",
        currency: "INR",
        tasks: [
          {
            id: "T01",
            title: "Phase 1",
            cost: 10000,
            costProvenance: "user_provided",
            durationHours: 20,
            durationProvenance: "user_provided",
            priority: 4,
            priorityProvenance: "user_provided",
            policy: "fixed",
            policyProvenance: "user_provided",
            predecessorIds: [],
            dependenciesProvenance: "user_provided",
          },
          {
            id: "T02",
            title: "Phase 2",
            cost: 20000,
            costProvenance: "ai_estimate",
            durationHours: 30,
            durationProvenance: "ai_estimate",
            priority: 3,
            priorityProvenance: "ai_estimate",
            policy: "flexible",
            policyProvenance: "ai_estimate",
            predecessorIds: ["T01"],
            dependenciesProvenance: "ai_estimate",
          },
        ],
        assumptions: [],
        missingInformation: [],
      };

      const converted = convertDraftToPlan(draft);
      const parseResult = PlanSchema.safeParse(converted);

      expect(parseResult.success).toBe(true);
      expect(converted.tasks).toHaveLength(2);
      expect(converted.dependencies).toHaveLength(1);
      expect(converted.dependencies[0].fromTaskId).toBe("T01");
      expect(converted.dependencies[0].toTaskId).toBe("T02");
    });
  });

  describe("4. /api/draft-plan Route Handler", () => {
    it("returns 200 with draft plan for valid prompt and injected client", async () => {
      const mockClient = new MockGeminiClient(
        JSON.stringify({
          name: "API Route Generated Plan",
          goal: "Generated through route handler",
          domain: "software-engineering",
          budgetLimit: 40000,
          budgetProvenance: "user_provided",
          deadlineHours: 96,
          deadlineProvenance: "user_provided",
          currency: "INR",
          tasks: [
            {
              id: "T01",
              title: "Setup API Infrastructure",
              cost: 15000,
              costProvenance: "ai_estimate",
              durationHours: 30,
              durationProvenance: "ai_estimate",
              priority: 4,
              policy: "flexible",
              predecessorIds: [],
            },
          ],
          assumptions: [],
          missingInformation: [],
        })
      );

      const request = new Request("http://localhost:3000/api/draft-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Build an API service",
          budgetLimit: 40000,
          deadlineHours: 96,
        }),
      });

      const response = await handleDraftPlan(request, mockClient);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.draft.name).toBe("API Route Generated Plan");
      expect(body.draft.tasks).toHaveLength(1);
    });

    it("returns 400 Bad Request for malformed JSON or empty prompt", async () => {
      const request = new Request("http://localhost:3000/api/draft-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "" }),
      });

      const response = await handleDraftPlan(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.status).toBe("error");
    });

    it("returns 500 with AUTH_OR_CONFIG_MISSING when GEMINI_API_KEY is not configured", async () => {
      delete process.env.GEMINI_API_KEY;

      const request = new Request("http://localhost:3000/api/draft-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Some valid plan request" }),
      });

      const response = await handleDraftPlan(request);
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.status).toBe("error");
      expect(body.category).toBe("AUTH_OR_CONFIG_MISSING");
      expect(body.canRetry).toBe(false);
      expect(body.userFriendlyMessage).toContain("Gemini API key is not configured");
    });
  });
});
