import { z } from "zod";
import { PlanSchema, type Plan } from "../schemas/plan.schema";
import { DisruptionSchema, type Disruption } from "../schemas/scenario.schema";
import type { GeminiErrorCategory } from "./gemini-client";

/**
 * Raw output schema expected from the Gemini model.
 */
export const RawModelDisruptionSchema = z.object({
  isClear: z.boolean().default(true).describe("Whether the user disruption description is clear and actionable without ambiguity"),
  disruptionType: z.enum([
    "task_unavailable",
    "budget_changed",
    "deadline_changed",
    "task_attribute_changed",
    "unsupported",
  ]).nullable().optional().describe("The normalized disruption category"),
  targetTaskId: z.string().nullable().optional().describe("Task ID affected, if applicable"),
  field: z.string().nullable().optional().describe("Field modified, e.g. bookingStatus, budgetLimit, deadlineHours"),
  oldValue: z.unknown().optional().describe("Previous value if known from plan context"),
  newValue: z.unknown().optional().describe("New value inferred from user request"),
  description: z.string().optional().describe("Clean concise summary of the disruption"),
  reasoning: z.string().optional().describe("Explanation of how the disruption was extracted"),
  clarificationReason: z.string().nullable().optional().describe("Why clarification is required, if not clear"),
  clarificationQuestions: z.array(z.string()).optional().describe("Questions to ask user if clarification is needed"),
});

export type RawModelDisruption = z.infer<typeof RawModelDisruptionSchema>;

/**
 * Conversational message format for multi-turn session grounding.
 */
export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

/**
 * Request input for disruption interpretation.
 */
export const InterpretDisruptionInputSchema = z.object({
  prompt: z.string().min(1, "Disruption prompt cannot be empty").max(2000),
  plan: PlanSchema,
  conversationHistory: z.array(ConversationMessageSchema).optional(),
});

export type InterpretDisruptionInput = z.infer<typeof InterpretDisruptionInputSchema>;

/**
 * The strictly typed result of the AI disruption interpretation.
 * Keeps interpretation separate from authorization and execution.
 */
export type InterpretationResult =
  | {
      status: "success";
      disruption: Disruption;
      confidence?: number;
      reasoning?: string;
      originalPrompt: string;
      followUpSuggestions?: string[];
    }
  | {
      status: "clarification_needed";
      reason: string;
      clarificationQuestions: string[];
      originalPrompt: string;
      followUpSuggestions?: string[];
      isOutOfOrder?: boolean;
    }
  | {
      status: "error";
      error: string;
      originalPrompt: string;
      category?: GeminiErrorCategory;
      userFriendlyMessage?: string;
      canRetry?: boolean;
      fallbackSuggestions?: string[];
    };

export {
  type GeminiModelClient,
  DefaultGeminiClient,
  classifyGeminiError,
  sanitizeErrorMessage,
  type GeminiErrorCategory,
  type ClassifiedGeminiError,
} from "./gemini-client";
import {
  type GeminiModelClient,
  DefaultGeminiClient,
  classifyGeminiError,
  sanitizeErrorMessage,
} from "./gemini-client";

/**
 * Builds minimal context from the baseline plan to ground model interpretation.
 * Only sends task identifiers, titles, policies, costs, durations, and constraints.
 */
function buildPlanContext(plan: Plan) {
  return {
    planId: plan.id,
    currency: plan.constraints.currency,
    currentBudgetLimit: plan.constraints.budgetLimit,
    currentDeadlineHours: plan.constraints.deadlineHours,
    tasks: plan.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      policy: t.policy,
      cost: t.cost,
      durationHours: t.durationHours,
      inputs: Object.keys(t.inputs),
      outputs: Object.keys(t.outputs),
    })),
  };
}

/**
 * System prompt instructing Gemini to strictly parse natural language disruptions
 * into the structured DisruptionSchema.
 */
const INTERPRETER_SYSTEM_INSTRUCTION = `
You are a precise, security-conscious AI disruption interpreter for PlanPatch, an automated plan recovery engine.
Your sole job is to translate a user's natural language disruption report into a structured Disruption object.

CRITICAL BOUNDARIES:
- You NEVER generate patches, modify tasks, evaluate feasibility, or override constraints.
- You NEVER invent task IDs. Only use task IDs present in the supplied plan context.
- If the user refers to a task by title (e.g. "venue", "registration"), resolve it to the exact task ID in the plan.
- If the user references a task that does NOT exist, or if the request is ambiguous, set isClear: false and formulate clear clarification questions.
- For task-order, skipped task, or progress incidents (e.g. "I forgot to do T02 and went ahead with T04"):
  Set isClear: false.
  Set disruptionType: "unsupported".
  In clarificationReason, explain that tasks were executed out of order or dependencies were bypassed.
  In clarificationQuestions, formulate clear questions asking whether the advanced task has already started or finished, and whether the skipped task is still required or can be dropped.
- For budget cuts: set disruptionType: "budget_changed", field: "budgetLimit", and newValue to the requested numeric limit.
- For deadline changes: set disruptionType: "deadline_changed", field: "deadlineHours", and newValue to the requested numeric hours.
- For task unavailability/cancellation: set disruptionType: "task_unavailable", targetTaskId to the task ID, field: "bookingStatus", newValue: "unavailable".
- For task attribute modifications: set disruptionType: "task_attribute_changed", targetTaskId to the task ID, field to the affected property, and newValue.
- If the user request cannot be mapped to any known task or constraint, set isClear: false.

Return strictly valid JSON conforming to the requested schema.
`.trim();

/**
 * Detects whether a prompt refers to out-of-order or bypassed progress.
 */
export function isOutOfOrderReport(prompt: string, reason?: string | null): boolean {
  const text = `${prompt} ${reason ?? ""}`.toLowerCase();
  return (
    text.includes("went ahead") ||
    text.includes("out of order") ||
    text.includes("before completing") ||
    text.includes("forgot to do") ||
    text.includes("skipped") ||
    text.includes("already started") ||
    text.includes("bypassed")
  );
}

/**
 * Contextual suggestion generators
 */
export function generateClarificationSuggestions(plan: Plan, isOutOfOrder: boolean): string[] {
  if (isOutOfOrder) {
    return [
      "Mark skipped predecessor as completed",
      "Cancel skipped task from plan",
      "Keep baseline plan unchanged",
    ];
  }
  const suggestions: string[] = [];
  const sampleTasks = plan.tasks.slice(0, 2);
  sampleTasks.forEach((t) => {
    suggestions.push(`Task ${t.id} (${t.title}) is unavailable`);
  });
  if (plan.constraints.budgetLimit) {
    const cut = Math.round(plan.constraints.budgetLimit * 0.8);
    suggestions.push(`Reduce budget to ₹${cut.toLocaleString()}`);
  } else {
    suggestions.push("Set budget limit to ₹20,000");
  }
  return suggestions.slice(0, 3);
}

export function generateSuccessSuggestions(disruption: Disruption, plan: Plan): string[] {
  const suggestions: string[] = ["Run recovery engine"];
  if (disruption.type !== "budget_changed" && plan.constraints.budgetLimit) {
    const cut = Math.round(plan.constraints.budgetLimit * 0.8);
    suggestions.push(`Also reduce budget to ₹${cut.toLocaleString()}`);
  }
  if (disruption.type !== "deadline_changed" && plan.constraints.deadlineHours) {
    const tighter = Math.round(plan.constraints.deadlineHours * 0.75);
    suggestions.push(`Also tighten deadline to ${tighter}h`);
  }
  suggestions.push("Inspect critical path impact");
  return suggestions.slice(0, 3);
}

/**
 * Server-side entry point for converting natural language disruption reports
 * into verified Disruption objects.
 *
 * Guarantees:
 * 1. Plan immutability: The baseline plan is never modified.
 * 2. Model untrustedness: All model outputs are validated through Zod and cross-referenced with plan tasks.
 * 3. Safe error boundaries: Errors never expose API keys or internal stack traces.
 * 4. Separation of concerns: Successful interpretation does not authorize or apply recovery patches.
 */
export async function interpretDisruption(
  input: InterpretDisruptionInput,
  client?: GeminiModelClient
): Promise<InterpretationResult> {
  const originalPrompt = input.prompt.trim();

  // 1. Input validation
  const inputValidation = InterpretDisruptionInputSchema.safeParse(input);
  if (!inputValidation.success) {
    return {
      status: "error",
      error: `Invalid input: ${inputValidation.error.issues.map((i) => i.message).join("; ")}`,
      originalPrompt,
    };
  }

  // Ensure baseline plan is not mutated
  const planSnapshot = JSON.stringify(input.plan);

  try {
    // 2. Initialize or verify model client
    const activeClient = client ?? new DefaultGeminiClient();

    // 3. Assemble minimal plan context + recent conversation history
    const planContext = buildPlanContext(input.plan);
    const boundedHistory = (input.conversationHistory ?? []).slice(-8);
    const historyBlock =
      boundedHistory.length > 0
        ? `\nPrior Conversation History:\n${boundedHistory
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n")}\n`
        : "";

    const userPrompt = `
Baseline Plan Context:
${JSON.stringify(planContext, null, 2)}
${historyBlock}
User Disruption Report:
"${originalPrompt}"
`.trim();

    // 4. Request structured output from Gemini
    const rawResponse = await activeClient.generateContent({
      prompt: userPrompt,
      systemInstruction: INTERPRETER_SYSTEM_INSTRUCTION,
    });

    // 5. Parse and validate JSON
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawResponse);
    } catch {
      return {
        status: "error",
        error: "Model returned invalid JSON.",
        userFriendlyMessage: "The AI model returned an unparseable response. Please retry.",
        category: "INVALID_MODEL_OUTPUT",
        canRetry: true,
        fallbackSuggestions: [
          "Load Venue Cancellation offline",
          "Load Budget Cut offline",
          "Retry request",
        ],
        originalPrompt,
      };
    }

    // Pre-normalize parsedJson to prevent schema failures on clarification objects
    if (typeof parsedJson === "object" && parsedJson !== null) {
      const obj = parsedJson as Record<string, unknown>;
      if (obj.isClear === false && (!obj.disruptionType || obj.disruptionType === null)) {
        obj.disruptionType = "unsupported";
      }
    }

    const modelParse = RawModelDisruptionSchema.safeParse(parsedJson);
    if (!modelParse.success) {
      // Check if model returned a clarification response that slightly diverged from schema
      if (typeof parsedJson === "object" && parsedJson !== null) {
        const obj = parsedJson as Record<string, unknown>;
        if (obj.isClear === false || obj.clarificationReason || Array.isArray(obj.clarificationQuestions)) {
          const outOfOrder = isOutOfOrderReport(
            originalPrompt,
            typeof obj.clarificationReason === "string" ? obj.clarificationReason : null
          );
          return {
            status: "clarification_needed",
            reason: outOfOrder
              ? "Tasks were executed out of order. Out-of-order task progress detected: PlanPatch's automatic graph recovery solves causal and constraint disruptions (such as cancellations and budget changes) on remaining planned tasks, but cannot rewrite already-executed past steps without confirming current task states."
              : typeof obj.clarificationReason === "string" && obj.clarificationReason.trim()
              ? obj.clarificationReason
              : "The disruption indicates an out-of-order or ambiguous task event requiring confirmation.",
            clarificationQuestions:
              Array.isArray(obj.clarificationQuestions) && obj.clarificationQuestions.length > 0
                ? (obj.clarificationQuestions as string[])
                : [
                    "Which tasks have already started or finished?",
                    "Are the skipped predecessor tasks still required, or can they be cancelled?",
                  ],
            followUpSuggestions: generateClarificationSuggestions(input.plan, outOfOrder),
            isOutOfOrder: outOfOrder,
            originalPrompt,
          };
        }
      }

      return {
        status: "error",
        error: `Model output did not match expected structure: ${modelParse.error.issues.map((i) => i.message).join("; ")}`,
        userFriendlyMessage: "We could not determine the disruption from your description. Please describe what changed (e.g., cancelled task, budget decrease, or deadline change).",
        category: "INVALID_MODEL_OUTPUT",
        canRetry: true,
        fallbackSuggestions: [
          "Load Venue Cancellation offline",
          "Load Budget Cut offline",
          "Retry request",
        ],
        originalPrompt,
      };
    }

    const raw = modelParse.data;
    const outOfOrder = isOutOfOrderReport(originalPrompt, raw.clarificationReason);

    // 6. Handle clarification needed from model
    if (!raw.isClear || raw.disruptionType === "unsupported" || !raw.disruptionType || outOfOrder) {
      const reason = outOfOrder
        ? "Tasks were executed out of order. Out-of-order task progress detected: PlanPatch's automatic graph recovery solves causal and constraint disruptions (such as cancellations and budget changes) on remaining planned tasks, but cannot rewrite already-executed past steps without confirming current task states."
        : raw.clarificationReason ||
          "The disruption request could not be mapped unambiguously to the plan tasks or constraints.";

      return {
        status: "clarification_needed",
        reason,
        clarificationQuestions:
          raw.clarificationQuestions && raw.clarificationQuestions.length > 0
            ? raw.clarificationQuestions
            : [
                "Could you specify which exact task or constraint is affected?",
                "Could you provide the target value or timeline change?",
              ],
        followUpSuggestions: generateClarificationSuggestions(input.plan, outOfOrder),
        isOutOfOrder: outOfOrder,
        originalPrompt,
      };
    }

    // 7. Post-validate model claims against actual baseline plan (Treat model as untrusted)
    if (raw.disruptionType === "task_unavailable" || raw.disruptionType === "task_attribute_changed") {
      if (!raw.targetTaskId) {
        return {
          status: "clarification_needed",
          reason: "Could not identify a target task from the disruption description.",
          clarificationQuestions: [
            `Which task was affected? Available tasks are: ${input.plan.tasks
              .map((t) => `${t.id} (${t.title})`)
              .join(", ")}.`,
          ],
          followUpSuggestions: generateClarificationSuggestions(input.plan, false),
          originalPrompt,
        };
      }

      // Check whether targetTaskId actually exists in baseline plan
      const existingTask = input.plan.tasks.find((t) => t.id === raw.targetTaskId);
      if (!existingTask) {
        return {
          status: "clarification_needed",
          reason: `Task ID "${raw.targetTaskId}" suggested by model does not exist in the baseline plan.`,
          clarificationQuestions: [
            `Did you mean one of the existing tasks? (${input.plan.tasks
              .map((t) => `${t.id} (${t.title})`)
              .join(", ")})`,
          ],
          followUpSuggestions: generateClarificationSuggestions(input.plan, false),
          originalPrompt,
        };
      }
    }

    if (raw.disruptionType === "budget_changed") {
      if (typeof raw.newValue !== "number" || isNaN(raw.newValue) || raw.newValue < 0) {
        return {
          status: "clarification_needed",
          reason: "Could not parse a valid positive numeric budget limit from the request.",
          clarificationQuestions: [
            `What is the new total budget limit? (Current budget: ${input.plan.constraints.currency} ${input.plan.constraints.budgetLimit})`,
          ],
          followUpSuggestions: generateClarificationSuggestions(input.plan, false),
          originalPrompt,
        };
      }
    }

    if (raw.disruptionType === "deadline_changed") {
      if (typeof raw.newValue !== "number" || isNaN(raw.newValue) || raw.newValue <= 0) {
        return {
          status: "clarification_needed",
          reason: "Could not determine a valid positive numeric deadline hours value from the request.",
          clarificationQuestions: [
            `What is the new project deadline in hours or days? (Current deadline: ${input.plan.constraints.deadlineHours} hours)`,
          ],
          followUpSuggestions: generateClarificationSuggestions(input.plan, false),
          originalPrompt,
        };
      }
    }

    // 8. Construct authoritative Disruption object conforming to existing DisruptionSchema
    const candidateDisruption: Disruption = {
      type: raw.disruptionType,
      targetTaskId: raw.targetTaskId ?? undefined,
      field: raw.field ?? (raw.disruptionType === "task_unavailable" ? "bookingStatus" : undefined),
      oldValue:
        raw.oldValue ??
        (raw.disruptionType === "budget_changed"
          ? input.plan.constraints.budgetLimit
          : raw.disruptionType === "deadline_changed"
          ? input.plan.constraints.deadlineHours
          : undefined),
      newValue: raw.newValue ?? (raw.disruptionType === "task_unavailable" ? "unavailable" : undefined),
      description: raw.description || originalPrompt,
    };

    const finalValidation = DisruptionSchema.safeParse(candidateDisruption);
    if (!finalValidation.success) {
      return {
        status: "error",
        error: `Extracted disruption failed canonical schema validation: ${finalValidation.error.issues
          .map((i) => i.message)
          .join("; ")}`,
        originalPrompt,
      };
    }

    return {
      status: "success",
      disruption: finalValidation.data,
      reasoning: raw.reasoning,
      followUpSuggestions: generateSuccessSuggestions(finalValidation.data, input.plan),
      originalPrompt,
    };
  } catch (err: unknown) {
    const classified = classifyGeminiError(err);
    return {
      status: "error",
      error: classified.technicalDetails || classified.userMessage,
      userFriendlyMessage: classified.userMessage,
      category: classified.category,
      canRetry: classified.canRetry,
      fallbackSuggestions: [
        "Load Venue Cancellation offline",
        "Load Budget Cut offline",
        "Retry request",
      ],
      originalPrompt,
    };
  } finally {
    // Assert plan immutability guarantee
    if (JSON.stringify(input.plan) !== planSnapshot) {
      throw new Error("Invariant violation: baseline plan was mutated during AI disruption interpretation.");
    }
  }
}
