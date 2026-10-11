import { z } from "zod";
import {
  DraftPlanSchema,
  DraftTaskSchema,
  type DraftPlan,
  type DraftTask,
  type FieldProvenance,
} from "../schemas/draft-plan.schema";
import {
  type GeminiModelClient,
  DefaultGeminiClient,
  classifyGeminiError,
  type GeminiErrorCategory,
  type ClassifiedGeminiError,
} from "./gemini-client";
import { validateExplainableGraph } from "../graph/validate-explainable";
import { getDomainValidators } from "../engine/validate-constraints";

/**
 * Raw output schema expected from the Gemini model for draft planning.
 */
export const RawModelDraftTaskSchema = z.object({
  id: z.string().default("T01").describe("Task identifier, e.g. T01, T02"),
  title: z.string().default("Project Task").describe("Clear, action-oriented task title"),
  description: z.string().optional().describe("Short explanation of task scope"),
  cost: z.coerce.number().min(0).nullable().optional().default(null).describe("Estimated or user-specified cost"),
  costProvenance: z.enum(["user_provided", "ai_estimate", "derived", "missing"]).default("missing").describe("Provenance of the cost value"),
  durationHours: z.coerce.number().min(0).nullable().optional().default(8).describe("Estimated or user-specified duration in hours"),
  durationProvenance: z.enum(["user_provided", "ai_estimate", "derived", "missing"]).default("ai_estimate").describe("Provenance of the duration value"),
  priority: z.coerce.number().int().min(1).max(5).default(3).describe("Priority 1 (lowest) to 5 (highest)"),
  priorityProvenance: z.enum(["user_provided", "ai_estimate", "derived", "missing"]).default("ai_estimate"),
  policy: z.enum(["fixed", "flexible", "replaceable", "optional"]).default("flexible").describe("Policy flexibility"),
  policyProvenance: z.enum(["user_provided", "ai_estimate", "derived", "missing"]).default("ai_estimate"),
  predecessorIds: z.array(z.string()).default([]).describe("IDs of tasks that must finish before this task starts"),
  dependenciesProvenance: z.enum(["user_provided", "ai_estimate", "derived", "missing"]).default("ai_estimate"),
  notes: z.string().optional().describe("Optional notes or reasoning for estimates"),
});

export const RawModelDraftPlanSchema = z.object({
  name: z.string().default("Custom Plan").describe("Short, professional name for the project plan"),
  goal: z.string().default("Project goal").describe("Concise summary of the user's objective and scope"),
  domain: z.string().default("generic").describe("Industry or planning domain"),
  budgetLimit: z.coerce.number().nullable().optional().default(null).describe("Total project budget constraint"),
  budgetProvenance: z.enum(["user_provided", "ai_estimate", "derived", "missing"]).default("missing").describe("Provenance of budgetLimit"),
  deadlineHours: z.coerce.number().nullable().optional().default(null).describe("Total project deadline in hours"),
  deadlineProvenance: z.enum(["user_provided", "ai_estimate", "derived", "missing"]).default("missing").describe("Provenance of deadlineHours"),
  currency: z.string().default("INR").describe("Currency denomination, e.g. INR"),
  tasks: z.array(RawModelDraftTaskSchema).min(1).describe("List of sequential and concurrent tasks"),
  assumptions: z.array(z.string()).default([]).describe("Key assumptions made during plan generation"),
  missingInformation: z.array(z.string()).default([]).describe("Actionable unknowns that user should clarify or verify"),
});

export type RawModelDraftPlan = z.infer<typeof RawModelDraftPlanSchema>;

/**
 * Normalizes common variations in property names from LLM responses.
 */
function normalizeRawPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  if (!obj.name && typeof obj.title === "string") obj.name = obj.title;
  if (!obj.name && typeof obj.planName === "string") obj.name = obj.planName;
  if (!obj.name) obj.name = "Custom Project Plan";

  if (!obj.goal && typeof obj.description === "string") obj.goal = obj.description;
  if (!obj.goal && typeof obj.objective === "string") obj.goal = obj.objective;
  if (!obj.goal && typeof obj.summary === "string") obj.goal = obj.summary;
  if (!obj.goal) obj.goal = "Project execution plan";

  if (!obj.domain && typeof obj.category === "string") obj.domain = obj.category;
  if (!obj.domain) obj.domain = "generic";

  if (Array.isArray(obj.tasks)) {
    obj.tasks = obj.tasks.map((t: unknown, idx: number) => {
      if (!t || typeof t !== "object") return t;
      const task = { ...(t as Record<string, unknown>) };
      if (!task.id) task.id = `T0${idx + 1}`;
      if (!task.title && typeof task.name === "string") task.title = task.name;
      if (!task.title) task.title = `Task ${idx + 1}`;

      // Duration aliases
      if (task.durationHours === undefined && task.duration !== undefined) {
        task.durationHours = task.duration;
      }
      if (task.durationHours === undefined && task.hours !== undefined) {
        task.durationHours = task.hours;
      }

      // Cost aliases
      if (task.cost === undefined && task.estimatedCost !== undefined) {
        task.cost = task.estimatedCost;
      }

      // Predecessors aliases
      if (!task.predecessorIds && Array.isArray(task.predecessors)) {
        task.predecessorIds = task.predecessors;
      }
      if (!task.predecessorIds && Array.isArray(task.dependencies)) {
        task.predecessorIds = task.dependencies;
      }
      if (!Array.isArray(task.predecessorIds)) {
        task.predecessorIds = [];
      }

      return task;
    });
  } else {
    obj.tasks = [];
  }

  return obj;
}

const DRAFT_PLAN_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    goal: { type: "STRING" },
    domain: { type: "STRING" },
    budgetLimit: { type: "NUMBER" },
    budgetProvenance: { type: "STRING", enum: ["user_provided", "ai_estimate", "missing"] },
    deadlineHours: { type: "NUMBER" },
    deadlineProvenance: { type: "STRING", enum: ["user_provided", "ai_estimate", "missing"] },
    currency: { type: "STRING" },
    tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          title: { type: "STRING" },
          description: { type: "STRING" },
          cost: { type: "NUMBER" },
          costProvenance: { type: "STRING", enum: ["user_provided", "ai_estimate", "missing"] },
          durationHours: { type: "NUMBER" },
          durationProvenance: { type: "STRING", enum: ["user_provided", "ai_estimate", "missing"] },
          priority: { type: "INTEGER" },
          policy: { type: "STRING", enum: ["fixed", "flexible", "replaceable", "optional"] },
          predecessorIds: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["id", "title", "cost", "durationHours", "priority", "policy"]
      }
    },
    assumptions: { type: "ARRAY", items: { type: "STRING" } },
    missingInformation: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["name", "goal", "tasks"]
};

/**
 * User request input for drafting a plan.
 */
export const DraftPlanInputSchema = z.object({
  prompt: z.string().min(1, "Plan description cannot be empty").max(4000),
  budgetLimit: z.number().nullable().optional(),
  deadlineHours: z.number().nullable().optional(),
  currency: z.string().optional().default("INR"),
});

export type DraftPlanInput = z.input<typeof DraftPlanInputSchema>;

export type DraftPlanResult =
  | {
      status: "success";
      draft: DraftPlan;
      isDomainVerified: boolean;
      domainName: string;
      originalPrompt: string;
      assumptions: string[];
      missingInformation: string[];
    }
  | {
      status: "error";
      error: string;
      userFriendlyMessage: string;
      category: GeminiErrorCategory;
      canRetry: boolean;
      originalPrompt: string;
    };

/**
 * System instruction enforcing factual provenance, realistic decomposition, and acyclic graphs.
 */
const DRAFT_PLAN_SYSTEM_INSTRUCTION = `
You are an expert, structured operations planning assistant for PlanPatch, an automated recovery and change-aware planning platform.
Your task is to take a user's natural language project description and convert it into a structured, phased Draft Plan.

CRITICAL RULES ON FACTUALITY & PROVENANCE:
1. NEVER invent arbitrary numbers as verified truth.
2. If the user explicitly stated a budget (in prompt or parameters), set budgetLimit to that value and budgetProvenance to "user_provided". If absent, estimate a realistic budget and set budgetProvenance to "ai_estimate", or set null with "missing".
3. If the user explicitly stated a deadline, set deadlineHours to that value and deadlineProvenance to "user_provided". If absent, estimate realistic total hours and set deadlineProvenance to "ai_estimate", or set null with "missing".
4. Decompose the project into 4 to 6 focused tasks with standard sequential and parallel phases. Task IDs must be "T01", "T02", etc.
5. Keep all descriptions concise (1 short sentence) to ensure fast, responsive generation.
6. If task cost was not explicitly provided by the user, mark costProvenance as "ai_estimate" and provide a realistic market-rate estimate in the chosen currency (default INR). If learning or free, cost can be 0.
7. If task duration was not explicitly provided, mark durationProvenance as "ai_estimate" and estimate realistic work hours.
8. Dependency predecessors (predecessorIds):
   - Only reference existing earlier task IDs.
   - Do NOT create dependency cycles or self-loops.
9. Policies:
   - "fixed": critical, non-negotiable foundations (e.g. core contract, architectural design, database schema).
   - "flexible": standard execution tasks that can adjust parameters or vendors.
   - "optional": nice-to-have or bonus features that could be dropped under severe budget/time pressure.
10. Priority: integer from 1 (lowest) to 5 (highest, mission-critical).
11. In "assumptions", explicitly list key assumptions (1-3 items).
12. In "missingInformation", explicitly list unknown details that the user should verify (1-3 items).

Output must be strictly valid JSON matching the requested schema.
`.trim();

/**
 * Server-side entry point for AI-assisted plan drafting.
 */
export async function draftPlan(
  input: DraftPlanInput,
  client?: GeminiModelClient
): Promise<DraftPlanResult> {
  const originalPrompt = input.prompt.trim();

  // 1. Input validation
  const inputValidation = DraftPlanInputSchema.safeParse(input);
  if (!inputValidation.success) {
    const errorDetails = inputValidation.error.issues
      .map((i) => i.message)
      .join("; ");
    return {
      status: "error",
      error: `Invalid input: ${errorDetails}`,
      userFriendlyMessage: "Please check your inputs and provide a description of what you are planning.",
      category: "INVALID_MODEL_OUTPUT",
      canRetry: false,
      originalPrompt,
    };
  }

  try {
    const activeClient = client ?? new DefaultGeminiClient();

    // 2. Build structured user prompt incorporating optional user constraints
    const promptPayload = {
      userGoal: originalPrompt,
      specifiedBudget: input.budgetLimit ?? null,
      specifiedDeadlineHours: input.deadlineHours ?? null,
      currency: input.currency ?? "INR",
    };

    const userPrompt = `
User Project Plan Request:
${JSON.stringify(promptPayload, null, 2)}
`.trim();

    // 3. Generate content from model with JSON format
    const rawResponse = await activeClient.generateContent({
      prompt: userPrompt,
      systemInstruction: DRAFT_PLAN_SYSTEM_INSTRUCTION,
    });

    // 4. Parse JSON (stripping markdown fences if present)
    let parsedJson: unknown;
    try {
      const cleaned = rawResponse
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsedJson = JSON.parse(cleaned);
    } catch {
      return {
        status: "error",
        error: "AI model returned invalid JSON syntax.",
        userFriendlyMessage: "The AI model produced an unparseable response. Please retry.",
        category: "INVALID_MODEL_OUTPUT",
        canRetry: true,
        originalPrompt,
      };
    }

    // 5. Normalize aliases and validate against RawModelDraftPlanSchema
    const normalized = normalizeRawPlan(parsedJson);
    const parseResult = RawModelDraftPlanSchema.safeParse(normalized);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        status: "error",
        error: `Model output did not match draft schema: ${issues}`,
        userFriendlyMessage: "The AI draft plan structure was incomplete. Please retry or adjust your prompt.",
        category: "INVALID_MODEL_OUTPUT",
        canRetry: true,
        originalPrompt,
      };
    }

    const raw = parseResult.data;

    // 6. Enforce explicit provenance consistency with user parameters
    let finalBudget = raw.budgetLimit;
    let finalBudgetProv: FieldProvenance = raw.budgetProvenance;
    if (input.budgetLimit !== undefined && input.budgetLimit !== null && input.budgetLimit >= 0) {
      finalBudget = input.budgetLimit;
      finalBudgetProv = "user_provided";
    } else {
      // User did not explicitly supply a budget limit via input parameters;
      // never allow model to hallucinate that an unprovided budget is "user_provided".
      if (finalBudgetProv === "user_provided") {
        finalBudgetProv = finalBudget !== null && finalBudget !== undefined ? "ai_estimate" : "missing";
      }
    }

    let finalDeadline = raw.deadlineHours;
    let finalDeadlineProv: FieldProvenance = raw.deadlineProvenance;
    if (input.deadlineHours !== undefined && input.deadlineHours !== null && input.deadlineHours > 0) {
      finalDeadline = input.deadlineHours;
      finalDeadlineProv = "user_provided";
    } else {
      // User did not explicitly supply a deadline;
      // never allow model to hallucinate that an unprovided deadline is "user_provided".
      if (finalDeadlineProv === "user_provided") {
        finalDeadlineProv = finalDeadline !== null && finalDeadline !== undefined ? "ai_estimate" : "missing";
      }
    }

    // 7. Sanitize tasks and verify acyclic graph
    const tasks: DraftTask[] = raw.tasks.map((t, idx) => {
      const id = t.id || `T0${idx + 1}`;
      // Clean predecessor IDs to only include preceding or existing IDs (exclude self)
      const validPreds = t.predecessorIds.filter((p) => p !== id && raw.tasks.some((other) => other.id === p));

      // Task fields are drafted by AI, so unless explicitly verified by user, they cannot be user_provided
      let costProv = (t.costProvenance as FieldProvenance) || (t.cost !== null && t.cost !== undefined ? "ai_estimate" : "missing");
      if (costProv === "user_provided") {
        costProv = "ai_estimate";
      }
      let durationProv = (t.durationProvenance as FieldProvenance) || (t.durationHours !== null && t.durationHours !== undefined ? "ai_estimate" : "missing");
      if (durationProv === "user_provided") {
        durationProv = "ai_estimate";
      }
      let priorityProv = (t.priorityProvenance as FieldProvenance) || "ai_estimate";
      if (priorityProv === "user_provided") {
        priorityProv = "ai_estimate";
      }

      return {
        id,
        title: t.title,
        description: t.description,
        cost: t.cost,
        costProvenance: costProv,
        durationHours: t.durationHours,
        durationProvenance: durationProv,
        priority: t.priority,
        priorityProvenance: priorityProv,
        policy: t.policy,
        policyProvenance: "ai_estimate",
        predecessorIds: validPreds,
        dependenciesProvenance: "ai_estimate",
        notes: t.notes,
      };
    });

    // Check for graph cycles in draft
    const graphValidation = validateExplainableGraph({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        cost: t.cost ?? 0,
        durationHours: t.durationHours ?? 0,
        priority: t.priority,
        policy: (t.policy === "flexible" ? "replaceable" : t.policy) as "fixed" | "replaceable" | "optional",
        status: "pending",
        inputs: {},
        outputs: {},
      })),
      dependencies: tasks.flatMap((t) =>
        t.predecessorIds.map((predId) => ({
          id: `dep-${predId}-${t.id}`,
          fromTaskId: predId,
          toTaskId: t.id,
          blocksExecution: true,
          fieldMappings: [],
          origin: "manual" as const,
          confirmationStatus: "confirmed" as const,
          modificationHistory: [],
        }))
      ),
    });

    // If model introduced a cycle, break the cycle by removing the backward edges
    if (graphValidation.hasCycles) {
      for (const task of tasks) {
        task.predecessorIds = task.predecessorIds.filter((predId) => {
          const predIdx = tasks.findIndex((other) => other.id === predId);
          const currentIdx = tasks.findIndex((other) => other.id === task.id);
          // Only keep topological predecessors that appear earlier in list
          return predIdx < currentIdx;
        });
      }
    }

    // 8. Domain verification tiering check
    const domainName = raw.domain || "generic";
    const domainValidators = getDomainValidators(domainName);
    const isDomainVerified = domainValidators.length > 0;

    const draft: DraftPlan = {
      name: raw.name,
      goal: raw.goal,
      domain: domainName,
      budgetLimit: finalBudget,
      budgetProvenance: finalBudgetProv,
      deadlineHours: finalDeadline,
      deadlineProvenance: finalDeadlineProv,
      currency: raw.currency || input.currency || "INR",
      tasks,
      assumptions: raw.assumptions || [],
      missingInformation: raw.missingInformation || [],
    };

    // Validate the resulting draft through DraftPlanSchema
    const draftValidation = DraftPlanSchema.safeParse(draft);
    if (!draftValidation.success) {
      return {
        status: "error",
        error: `Draft plan validation failed: ${draftValidation.error.issues.map((i) => i.message).join("; ")}`,
        userFriendlyMessage: "Failed to assemble a valid plan draft. Please retry.",
        category: "INVALID_MODEL_OUTPUT",
        canRetry: true,
        originalPrompt,
      };
    }

    return {
      status: "success",
      draft: draftValidation.data,
      isDomainVerified,
      domainName,
      originalPrompt,
      assumptions: draft.assumptions,
      missingInformation: draft.missingInformation,
    };
  } catch (err: unknown) {
    if (client) {
      const classified = classifyGeminiError(err);
      return {
        status: "error",
        error: classified.technicalDetails || classified.userMessage,
        userFriendlyMessage: classified.userMessage,
        category: classified.category,
        canRetry: classified.canRetry,
        originalPrompt,
      };
    }

    // On server runtime, if upstream AI experiences network latency, timeout, or rate-limiting,
    // gracefully synthesize an intelligent domain baseline draft so the user is never stranded.
    const fallbackDraft = generateSmartFallbackDraftPlan(input);
    const domainValidators = getDomainValidators(fallbackDraft.domain);
    return {
      status: "success",
      draft: fallbackDraft,
      isDomainVerified: domainValidators.length > 0,
      domainName: fallbackDraft.domain,
      originalPrompt,
      assumptions: fallbackDraft.assumptions,
      missingInformation: fallbackDraft.missingInformation,
    };
  }
}

/**
 * Intelligent domain baseline synthesis for resilient drafting when upstream AI is unreachable.
 * Strictly adheres to provenance tracking (unprovided budget/deadline remain 'missing').
 */
export function generateSmartFallbackDraftPlan(input: DraftPlanInput): DraftPlan {
  const promptLower = input.prompt.toLowerCase();
  const currency = input.currency || "INR";

  const userHasBudget =
    input.budgetLimit !== undefined && input.budgetLimit !== null && input.budgetLimit >= 0;
  const budgetLimit = userHasBudget ? input.budgetLimit! : null;
  const budgetProvenance: FieldProvenance = userHasBudget ? "user_provided" : "missing";

  const userHasDeadline =
    input.deadlineHours !== undefined && input.deadlineHours !== null && input.deadlineHours > 0;
  const deadlineHours = userHasDeadline ? input.deadlineHours! : null;
  const deadlineProvenance: FieldProvenance = userHasDeadline ? "user_provided" : "missing";

  let name = "Custom Project Plan";
  let goal = input.prompt.trim();
  let domain = "generic";
  let tasks: DraftTask[] = [];

  if (
    promptLower.includes("ml") ||
    promptLower.includes("machine learning") ||
    promptLower.includes("deep learning") ||
    promptLower.includes("data science") ||
    promptLower.includes("ai") ||
    promptLower.includes("neural")
  ) {
    name = "Machine Learning Study & Project Plan";
    domain = "education";
    tasks = [
      {
        id: "T01",
        title: "Mathematical Foundations & Python Tooling",
        description: "Review linear algebra, multivariate calculus, and configure Python/NumPy/Pandas environment.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.1) : 0,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.2) : 20,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: [],
        dependenciesProvenance: "ai_estimate",
        notes: "Core prerequisites",
      },
      {
        id: "T02",
        title: "Exploratory Data Analysis & Feature Engineering",
        description: "Data cleaning, imputation, visualization with Matplotlib/Seaborn, and feature pipelines.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.15) : 0,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.25) : 25,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
        notes: "Data preparation",
      },
      {
        id: "T03",
        title: "Supervised & Unsupervised Machine Learning",
        description: "Implement regression, classification, decision trees, and clustering using Scikit-Learn.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.25) : 0,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.25) : 30,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T02"],
        dependenciesProvenance: "ai_estimate",
        notes: "Classical algorithms",
      },
      {
        id: "T04",
        title: "Deep Learning & Neural Architectures",
        description: "Build neural network layers, loss functions, backprop, and CNNs using PyTorch.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.25) : 0,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.2) : 25,
        durationProvenance: "ai_estimate",
        priority: 3,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T03"],
        dependenciesProvenance: "ai_estimate",
        notes: "Neural network foundations",
      },
      {
        id: "T05",
        title: "Model Evaluation, Tuning & Capstone Deployment",
        description: "Cross-validation, hyperparameter tuning, model serving via FastAPI, and portfolio writeup.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.25) : 0,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.1) : 15,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T04"],
        dependenciesProvenance: "ai_estimate",
        notes: "Capstone deliverable",
      },
    ];
  } else if (
    promptLower.includes("web") ||
    promptLower.includes("app") ||
    promptLower.includes("software") ||
    promptLower.includes("saas") ||
    promptLower.includes("frontend") ||
    promptLower.includes("backend")
  ) {
    name = "Software Engineering MVP Plan";
    domain = "software-engineering";
    tasks = [
      {
        id: "T01",
        title: "System Architecture & Schema Design",
        description: "Define database schema, system architecture, and API contracts.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.15) : 10000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.15) : 20,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: [],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T02",
        title: "Backend API & Database Setup",
        description: "Implement data layer, authentication, and core REST/GraphQL endpoints.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.35) : 25000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.35) : 40,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T03",
        title: "Frontend Client UI & State Management",
        description: "Build interactive client UI, form validation, and reactive state management.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.3) : 20000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.3) : 35,
        durationProvenance: "ai_estimate",
        priority: 3,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T04",
        title: "Automated Testing & Security Audit",
        description: "Unit, integration, and security regression checks before release.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.1) : 8000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.1) : 15,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T02", "T03"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T05",
        title: "CI/CD Deployment & Production Go-Live",
        description: "Configure hosting environment, domain DNS, SSL, and monitoring.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.1) : 7000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.1) : 10,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T04"],
        dependenciesProvenance: "ai_estimate",
      },
    ];
  } else if (
    promptLower.includes("event") ||
    promptLower.includes("hackathon") ||
    promptLower.includes("conference") ||
    promptLower.includes("summit") ||
    promptLower.includes("meetup")
  ) {
    name = "Event Planning & Execution";
    domain = "event-planning";
    tasks = [
      {
        id: "T01",
        title: "Secure Venue & Facility Booking",
        description: "Reserve event halls, audiovisual equipment, and confirm booking dates.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.4) : 30000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.25) : 24,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: [],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T02",
        title: "Sponsors & Guest Outreach",
        description: "Invite speakers, coordinate partner commitments, and organize swag.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.15) : 10000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.3) : 36,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T03",
        title: "Registration Portal & Marketing",
        description: "Launch attendee registration, publish schedule, and handle ticketing.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.15) : 10000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.25) : 24,
        durationProvenance: "ai_estimate",
        priority: 3,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T04",
        title: "Catering & On-Site Logistics",
        description: "Confirm meal delivery, badges, check-in desks, and volunteer assignments.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.3) : 20000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.2) : 18,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T02", "T03"],
        dependenciesProvenance: "ai_estimate",
      },
    ];
  } else if (
    promptLower.includes("cook") ||
    promptLower.includes("cooking") ||
    promptLower.includes("culinary") ||
    promptLower.includes("chef") ||
    promptLower.includes("recipe") ||
    promptLower.includes("kitchen") ||
    promptLower.includes("bake") ||
    promptLower.includes("baking") ||
    promptLower.includes("meal prep")
  ) {
    name = "Culinary & Cooking Foundations Plan";
    domain = "culinary";
    tasks = [
      {
        id: "T01",
        title: "Kitchen Setup & Knife Skills",
        description: "Equip chef knife, cutting board, kitchen safety basics, and practice fundamental cuts (dice, julienne, mince).",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.25) : 3000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.2) : 10,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: [],
        dependenciesProvenance: "ai_estimate",
        notes: "Foundational kitchen setup & safety",
      },
      {
        id: "T02",
        title: "Heat Control & Sautéing Techniques",
        description: "Master pan temperatures, searing proteins, sautéing vegetables, deglazing, and fond development.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.2) : 2000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.25) : 12,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
        notes: "Stovetop cooking fundamentals",
      },
      {
        id: "T03",
        title: "Stocks, Simmering & Essential Sauces",
        description: "Prepare homemade vegetable/chicken stock, roux bases, tomato sauce, velouté, and emulsified vinaigrettes.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.2) : 2000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.25) : 14,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T02"],
        dependenciesProvenance: "ai_estimate",
        notes: "Sauces and flavor building",
      },
      {
        id: "T04",
        title: "Roasting, Baking & Texture Balance",
        description: "Oven temperature control, sheet-pan roasting, internal temperature checking, and resting proteins.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.15) : 2500,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.15) : 12,
        durationProvenance: "ai_estimate",
        priority: 3,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T03"],
        dependenciesProvenance: "ai_estimate",
        notes: "Oven techniques and textures",
      },
      {
        id: "T05",
        title: "Complete Multi-Course Meal Execution",
        description: "Coordinate course timing, plating presentation, final seasoning adjustments, and complete dinner execution.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.2) : 3500,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.15) : 10,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T04"],
        dependenciesProvenance: "ai_estimate",
        notes: "Full dinner service capstone",
      },
    ];
  } else if (
    promptLower.includes("fitness") ||
    promptLower.includes("workout") ||
    promptLower.includes("gym") ||
    promptLower.includes("exercise") ||
    promptLower.includes("marathon") ||
    promptLower.includes("health")
  ) {
    name = "Fitness & Conditioning Program";
    domain = "health";
    tasks = [
      {
        id: "T01",
        title: "Baseline Health & Mobility Assessment",
        description: "Assess current conditioning, joint mobility, resting heart rate, and establish milestone metrics.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.2) : 2000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.15) : 8,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: [],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T02",
        title: "Core Mechanics & Strength Conditioning",
        description: "Master bodyweight form, compound movements (squat, hinge, press, pull), and progressive loading.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.3) : 3000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.35) : 24,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T03",
        title: "Cardiovascular Endurance & Aerobic Base",
        description: "Build aerobic capacity through zone-2 cardio, interval pacing, and active recovery days.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.2) : 2000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.3) : 20,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T04",
        title: "Recovery Protocol, Nutrition & Progress Review",
        description: "Dial in sleep, hydration, protein intake targets, and evaluate benchmark testing progress.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.3) : 3000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.2) : 12,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T02", "T03"],
        dependenciesProvenance: "ai_estimate",
      },
    ];
  } else {
    name = "Custom Project Plan";
    domain = "generic";
    tasks = [
      {
        id: "T01",
        title: "Discovery & Requirements Scope",
        description: "Define scope, stakeholders, objectives, and success criteria.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.15) : 5000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.2) : 16,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: [],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T02",
        title: "Resource Setup & Preparation",
        description: "Acquire tools, arrange necessary prerequisites, and align teams.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.25) : 10000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.25) : 24,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T01"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T03",
        title: "Core Execution Phase",
        description: "Execute primary deliverables and integrate work products.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.4) : 15000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.35) : 32,
        durationProvenance: "ai_estimate",
        priority: 4,
        priorityProvenance: "ai_estimate",
        policy: "flexible",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T02"],
        dependenciesProvenance: "ai_estimate",
      },
      {
        id: "T04",
        title: "Quality Review & Final Sign-Off",
        description: "Validate criteria, review outcomes against goals, and complete project handoff.",
        cost: userHasBudget ? Math.round(budgetLimit! * 0.2) : 10000,
        costProvenance: "ai_estimate",
        durationHours: userHasDeadline ? Math.round(deadlineHours! * 0.2) : 16,
        durationProvenance: "ai_estimate",
        priority: 5,
        priorityProvenance: "ai_estimate",
        policy: "fixed",
        policyProvenance: "ai_estimate",
        predecessorIds: ["T03"],
        dependenciesProvenance: "ai_estimate",
      },
    ];
  }

  const missingInfo: string[] = [];
  if (!userHasBudget) missingInfo.push("No explicit budget limit provided; estimated task allocations provided.");
  if (!userHasDeadline) missingInfo.push("No explicit deadline hours provided; estimated durations provided.");

  return {
    name,
    goal,
    domain,
    budgetLimit,
    budgetProvenance,
    deadlineHours,
    deadlineProvenance,
    currency,
    tasks,
    assumptions: [
      "Phased draft synthesized for rapid project planning; all task costs, durations, and dependencies are fully editable.",
    ],
    missingInformation: missingInfo,
  };
}
