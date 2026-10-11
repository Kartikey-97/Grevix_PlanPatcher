"use client";

import React from "react";
import type { Plan } from "../lib/schemas/plan.schema";
import type { InterpretationResult } from "../lib/ai/disruption-interpreter";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  HelpCircle,
  FileQuestion,
  Layers,
  Calendar,
  Coins,
} from "lucide-react";

interface InterpretationReviewProps {
  result: InterpretationResult;
  plan: Plan;
  onConfirm: () => void;
  onCancel: () => void;
  isRunningRecovery: boolean;
  onSelectSuggestion?: (suggestion: string) => void;
}

export function InterpretationReview({
  result,
  plan,
  onConfirm,
  onCancel,
  isRunningRecovery,
  onSelectSuggestion,
}: InterpretationReviewProps) {
  if (result.status === "error") {
    return (
      <section className="bg-red-50/70 border border-red-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-red-900">
              Interpretation Error
            </h3>
            <p className="text-sm text-red-700">{result.error}</p>
            <p className="text-xs text-red-600/80 mt-1">
              Original prompt: &ldquo;{result.originalPrompt}&rdquo;
            </p>
          </div>
        </div>

        {result.fallbackSuggestions && result.fallbackSuggestions.length > 0 && onSelectSuggestion && (
          <div className="space-y-2 pt-2 border-t border-red-100">
            <div className="text-xs font-semibold text-red-900 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-red-600" />
              <span>Offline Fallbacks & Options:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.fallbackSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectSuggestion(sug)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-red-900 border border-red-300 rounded-lg hover:bg-red-50 transition shadow-2xs"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-red-100">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Revise Prompt or Select Scenario
          </button>
        </div>
      </section>
    );
  }

  if (result.status === "clarification_needed") {
    return (
      <section className="bg-amber-50/80 border border-amber-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-amber-900">
                Clarification Required Before Recovery
              </h3>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                Ambiguous Disruption
              </span>
            </div>
            <p className="text-sm text-amber-800">{result.reason}</p>
            <div className="text-xs text-amber-700/80 italic">
              User prompt: &ldquo;{result.originalPrompt}&rdquo;
            </div>
          </div>
        </div>

        {/* Out-of-order specific callout */}
        {result.isOutOfOrder && (
          <div className="bg-amber-100/90 border border-amber-300 rounded-lg p-3.5 text-xs text-amber-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>Out-of-Order Execution Boundary</span>
            </div>
            <p className="leading-relaxed">
              PlanPatch’s automatic graph recovery solves causal and constraint disruptions (such as cancellations and budget changes) on remaining planned tasks, but cannot rewrite already-executed past steps without confirming current task states.
            </p>
          </div>
        )}

        {result.clarificationQuestions && result.clarificationQuestions.length > 0 && (
          <div className="bg-white/80 rounded-lg p-4 border border-amber-200/80 space-y-2">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileQuestion className="w-4 h-4 text-amber-600" />
              Clarification Inquiries:
            </div>
            <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
              {result.clarificationQuestions.map((q, idx) => (
                <li key={idx} className="leading-relaxed">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Clickable Suggestions */}
        {result.followUpSuggestions && result.followUpSuggestions.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Suggested Follow-Ups (Click to Submit):</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.followUpSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectSuggestion?.(sug)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-slate-800 border border-amber-300 rounded-lg hover:bg-amber-100 hover:border-amber-400 transition shadow-2xs text-left"
                >
                  <span>{sug}</span>
                  <ArrowRight className="w-3 h-3 text-amber-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-amber-900/80 bg-amber-100/50 p-2.5 rounded-lg border border-amber-200/50">
          The recovery engine refuses to invent unstated disruption parameters. Please refine your
          prompt with specific task IDs, numerical budget figures, or deadline hours.
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-amber-200/60">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Revise Prompt
          </button>
        </div>
      </section>
    );
  }

  // status === "success"
  const disruption = result.disruption;
  const targetTask = disruption.targetTaskId
    ? plan.tasks.find((t) => t.id === disruption.targetTaskId)
    : undefined;

  return (
    <section className="bg-white rounded-xl border border-indigo-100 shadow-sm p-6 space-y-5">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Review Interpreted Disruption
            </h3>
            <p className="text-xs text-slate-500">
              Grounded representation extracted from: &ldquo;{result.originalPrompt}&rdquo;
            </p>
          </div>
        </div>

        <span className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full self-start sm:self-auto">
          Interpretation Ready for Review
        </span>
      </div>

      {/* Structured Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Disruption Type */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Disruption Type
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-slate-900">
            {disruption.type}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Normalized category
          </div>
        </div>

        {/* Target Entity / Field */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Target Parameter / Task
          </div>
          <div className="mt-1 text-sm font-bold text-slate-900 flex items-center gap-1.5">
            {disruption.targetTaskId ? (
              <>
                <span className="font-mono text-indigo-700">
                  {disruption.targetTaskId}
                </span>
                {targetTask && (
                  <span className="text-xs font-normal text-slate-600 truncate">
                    ({targetTask.title})
                  </span>
                )}
              </>
            ) : disruption.field ? (
              <span className="font-mono text-indigo-700">
                {disruption.field}
              </span>
            ) : (
              <span className="text-slate-500 font-normal">Plan-level</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Field: {disruption.field ?? "n/a"}
          </div>
        </div>

        {/* Value Transition */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Value Shift
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 flex items-center gap-2">
            {disruption.oldValue !== undefined && (
              <>
                <span className="text-slate-500 line-through text-xs font-mono">
                  {String(disruption.oldValue)}
                </span>
                <span className="text-slate-400">→</span>
              </>
            )}
            <span className="text-indigo-600 font-mono font-bold">
              {disruption.newValue !== undefined
                ? String(disruption.newValue)
                : "unavailable"}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Effective new parameter
          </div>
        </div>
      </div>

      {/* Description & Reasoning */}
      <div className="p-3.5 bg-slate-50/70 rounded-lg border border-slate-200/70 space-y-1.5">
        <div className="text-xs font-semibold text-slate-700">
          Interpretation Summary:
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          {disruption.description}
        </p>
        {result.reasoning && (
          <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200/50">
            Grounding rationale: {result.reasoning}
          </p>
        )}
      </div>

      {/* Deliberate Confirmation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={isRunningRecovery}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Cancel & Edit Input
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRunningRecovery}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {isRunningRecovery ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Running Deterministic Engine...</span>
              </>
            ) : (
              <>
                <span>Run Recovery Engine</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
