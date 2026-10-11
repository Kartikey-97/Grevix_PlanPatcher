"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ArrowRight,
  Zap,
  RefreshCw,
  FileText,
  RotateCcw,
  MessageSquare,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  CornerDownLeft,
} from "lucide-react";
import type { Disruption } from "../lib/schemas/scenario.schema";
import type { Plan } from "../lib/schemas/plan.schema";
import type {
  InterpretationResult,
  ConversationMessage,
} from "../lib/ai/disruption-interpreter";

interface ExamplePrompt {
  label: string;
  scenarioId: string;
  prompt: string;
  description: string;
  fallbackDisruption: Disruption;
}

export const CANONICAL_EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    label: "Venue Cancellation",
    scenarioId: "S1-venue-cancelled",
    prompt: "The venue is unavailable.",
    description: "Original venue booking cancelled (T03)",
    fallbackDisruption: {
      type: "task_unavailable",
      targetTaskId: "T03",
      field: "bookingStatus",
      newValue: "unavailable",
      description: "The original venue cancelled.",
    },
  },
  {
    label: "Budget Cut to ₹16,000",
    scenarioId: "S2-budget-cut",
    prompt: "Reduce our overall budget to ₹16,000.",
    description: "Budget limit drops from ₹25,000 to ₹16,000",
    fallbackDisruption: {
      type: "budget_changed",
      field: "budgetLimit",
      oldValue: 25000,
      newValue: 16000,
      description: "The available budget is reduced to ₹16,000.",
    },
  },
  {
    label: "Deadline Moved 2 Days Earlier",
    scenarioId: "S3-deadline-moved-earlier",
    prompt: "The deadline has moved two days earlier.",
    description: "Plan-readiness deadline moves from 288h to 120h",
    fallbackDisruption: {
      type: "deadline_changed",
      field: "deadlineHours",
      oldValue: 288,
      newValue: 120,
      description: "The plan must be ready by 120 hours instead of 288 hours.",
    },
  },
];

export interface DisruptionInputProps {
  onAnalyzePrompt: (
    prompt: string,
    scenarioId?: string,
    conversationHistory?: ConversationMessage[]
  ) => Promise<void>;
  onDirectScenarioSelect: (scenarioId: string, disruption: Disruption) => void;
  isInterpreting: boolean;
  plan?: Plan;
  isDemoPlan?: boolean;
  latestInterpretationResult?: InterpretationResult | null;
  conversationHistory?: ConversationMessage[];
  onResetConversation?: () => void;
}

export function DisruptionInput({
  onAnalyzePrompt,
  onDirectScenarioSelect,
  isInterpreting,
  plan,
  isDemoPlan = true,
  latestInterpretationResult,
  conversationHistory: externalHistory,
  onResetConversation,
}: DisruptionInputProps) {
  const [prompt, setPrompt] = useState("");
  const [activeScenarioId, setActiveScenarioId] = useState<string | undefined>();
  const [localHistory, setLocalHistory] = useState<ConversationMessage[]>(
    () => externalHistory ?? []
  );

  // Sync external history if provided
  useEffect(() => {
    if (externalHistory) {
      setLocalHistory(externalHistory);
    }
  }, [externalHistory]);

  const activeHistory = externalHistory && externalHistory.length > 0 ? externalHistory : localHistory;

  // If a custom plan is active, build relevant quick examples from its tasks
  const customExamples: ExamplePrompt[] = React.useMemo(() => {
    if (isDemoPlan || !plan) return CANONICAL_EXAMPLE_PROMPTS;

    const firstNonFixedTask =
      plan.tasks.find((t) => t.policy !== "fixed") || plan.tasks[0];
    const budgetLimit = plan.constraints.budgetLimit ?? 50000;
    const reducedBudget = Math.max(1000, Math.round(budgetLimit * 0.75));
    const deadlineHours = plan.constraints.deadlineHours ?? 100;
    const reducedDeadline = Math.max(10, Math.round(deadlineHours * 0.8));

    return [
      {
        label: `Task Unavailable (${firstNonFixedTask?.id ?? "T01"})`,
        scenarioId: `custom-task-unavailable`,
        prompt: `Task ${firstNonFixedTask?.id ?? "T01"} (${firstNonFixedTask?.title ?? "Task"}) is no longer available.`,
        description: `Mark ${firstNonFixedTask?.id ?? "T01"} as unavailable in this plan.`,
        fallbackDisruption: {
          type: "task_unavailable",
          targetTaskId: firstNonFixedTask?.id ?? "T01",
          field: "bookingStatus",
          newValue: "unavailable",
          description: `Task ${firstNonFixedTask?.id ?? "T01"} cancelled.`,
        },
      },
      {
        label: `Reduce Budget to ₹${reducedBudget.toLocaleString()}`,
        scenarioId: `custom-budget-cut`,
        prompt: `Reduce our overall budget to ₹${reducedBudget}.`,
        description: `Budget limit reduced from ₹${budgetLimit} to ₹${reducedBudget}.`,
        fallbackDisruption: {
          type: "budget_changed",
          field: "budgetLimit",
          oldValue: budgetLimit,
          newValue: reducedBudget,
          description: `Budget reduced to ₹${reducedBudget}.`,
        },
      },
      {
        label: `Move Deadline to ${reducedDeadline}h`,
        scenarioId: `custom-deadline-shift`,
        prompt: `The project deadline has moved to ${reducedDeadline} hours.`,
        description: `Deadline moved from ${deadlineHours}h to ${reducedDeadline}h.`,
        fallbackDisruption: {
          type: "deadline_changed",
          field: "deadlineHours",
          oldValue: deadlineHours,
          newValue: reducedDeadline,
          description: `Deadline tightened to ${reducedDeadline} hours.`,
        },
      },
    ];
  }, [isDemoPlan, plan]);

  const activeExamples = isDemoPlan ? CANONICAL_EXAMPLE_PROMPTS : customExamples;

  const handleSelectExample = (ex: ExamplePrompt) => {
    setPrompt(ex.prompt);
    setActiveScenarioId(ex.scenarioId);
  };

  const handleExecutePrompt = async (textToSubmit: string, scenarioId?: string) => {
    if (!textToSubmit.trim() || isInterpreting) return;
    const trimmed = textToSubmit.trim();
    setPrompt("");

    // Update history locally
    const updatedHistory: ConversationMessage[] = [
      ...localHistory,
      { role: "user", content: trimmed },
    ];
    setLocalHistory(updatedHistory);

    await onAnalyzePrompt(trimmed, scenarioId, updatedHistory);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExecutePrompt(prompt, activeScenarioId);
  };

  const handleSuggestionClick = (suggestionText: string) => {
    handleExecutePrompt(suggestionText);
  };

  const handleReset = () => {
    setPrompt("");
    setActiveScenarioId(undefined);
    setLocalHistory([]);
    onResetConversation?.();
  };

  // Follow-up suggestions from latest result
  const followUpSuggestions =
    latestInterpretationResult?.status === "clarification_needed"
      ? latestInterpretationResult.followUpSuggestions
      : latestInterpretationResult?.status === "success"
      ? latestInterpretationResult.followUpSuggestions
      : latestInterpretationResult?.status === "error"
      ? latestInterpretationResult.fallbackSuggestions
      : undefined;

  return (
    <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-5">
      {/* Header with Title and Assistant Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Conversational Recovery Assistant</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Describe cancellations, budget cuts, or schedule changes. Multi-turn grounding maintains recent context.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeHistory.length > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition"
              title="Clear conversation history and start fresh"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Conversation
            </button>
          )}
          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
            AI Interpreter (Gemini) • Grounded in Active Plan
          </span>
        </div>
      </div>

      {/* Multi-turn Conversation Session History */}
      {activeHistory.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 space-y-3">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
            <span>Active Recovery Session ({activeHistory.length} turns)</span>
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 text-xs">
            {activeHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    AI
                  </div>
                )}
                <div
                  className={`p-2.5 rounded-lg max-w-[85%] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-none shadow-xs font-medium"
                      : "bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-2xs"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    You
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Out-of-Order Warning Banner if active */}
      {latestInterpretationResult?.status === "clarification_needed" &&
        latestInterpretationResult.isOutOfOrder && (
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Out-of-Order Task Progress Detected</span>
            </div>
            <p className="leading-relaxed text-amber-900">
              PlanPatch’s automatic graph recovery solves causal and constraint disruptions (such as cancellations and budget changes) on remaining planned tasks, but cannot rewrite already-executed past steps without confirming current task states.
            </p>
          </div>
        )}

      {/* Contextual Clickable Follow-Up Suggestions */}
      {followUpSuggestions && followUpSuggestions.length > 0 && (
        <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/80 space-y-2">
          <div className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Clickable Follow-Up Suggestions (Auto-Submit):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {followUpSuggestions.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isInterpreting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-indigo-900 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-xs transition disabled:opacity-50 text-left"
              >
                <span>{suggestion}</span>
                <CornerDownLeft className="w-3 h-3 text-indigo-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Example Chips */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          {isDemoPlan
            ? "Canonical Scenarios & Example Prompts:"
            : "Example Disruption Prompts for Active Plan:"}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {activeExamples.map((ex) => (
            <div
              key={ex.scenarioId}
              className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                activeScenarioId === ex.scenarioId
                  ? "bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200"
                  : "bg-slate-50/80 border-slate-200/80 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="text-xs font-bold text-slate-800">{ex.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 italic">
                  &ldquo;{ex.prompt}&rdquo;
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200/50">
                <button
                  type="button"
                  onClick={() => handleSelectExample(ex)}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  Use Prompt
                </button>
                <span className="text-slate-300 text-xs">•</span>
                <button
                  type="button"
                  onClick={() => onDirectScenarioSelect(ex.scenarioId, ex.fallbackDisruption)}
                  className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
                  title="Run directly using structured disruption fixture (no API call required)"
                >
                  Quick Load (Offline)
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3 pt-1">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              const matching = activeExamples.find(
                (p) => p.prompt.toLowerCase() === e.target.value.trim().toLowerCase()
              );
              setActiveScenarioId(matching?.scenarioId);
            }}
            placeholder="e.g., The venue is unavailable, or reduce our overall budget to ₹16,000..."
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition shadow-inner"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            {activeScenarioId ? (
              <span className="text-indigo-700 font-medium flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                Linked to scenario: {activeScenarioId}
              </span>
            ) : (
              <span>General disruption input mapped against active plan tasks and constraints.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeHistory.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            <button
              type="submit"
              disabled={!prompt.trim() || isInterpreting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              {isInterpreting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Interpreting with Gemini...
                </>
              ) : (
                <>
                  <span>Analyze Change</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
