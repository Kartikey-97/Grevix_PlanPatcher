"use client";

import React, { useState } from "react";
import type { Plan } from "../lib/schemas/plan.schema";
import type { CandidateEvaluationResult } from "../lib/engine/evaluate-candidates";
import type { CandidatePatch } from "../lib/schemas/patch.schema";
import { PlanTimeline } from "./plan/PlanTimeline";
import { useTheme } from "../lib/theme-context";
import {
  GitCompare,
  CheckCircle,
  RotateCcw,
  ArrowRight,
  Clock,
  Coins,
  Layers,
  Info,
  AlertCircle,
  Sliders,
  Check,
  X,
} from "lucide-react";

interface DiffViewerProps {
  baselinePlan: Plan;
  candidateEvaluation: CandidateEvaluationResult;
  candidatePatch?: CandidatePatch;
  isPreviewActive: boolean;
  onAcceptPreview: (plan: Plan) => void;
  onRevertPreview: () => void;
}

export function DiffViewer({
  baselinePlan,
  candidateEvaluation,
  candidatePatch,
  isPreviewActive,
  onAcceptPreview,
  onRevertPreview,
}: DiffViewerProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [diffViewTab, setDiffViewTab] = useState<"timeline" | "table">("timeline");

  const baselineCost = baselinePlan.tasks.reduce((sum, t) => sum + t.cost, 0);
  const candidateCost = candidateEvaluation.projectedTotalCost;
  const costDelta = candidateCost - baselineCost;

  const baselineFinish = 132; // Canonical baseline finish
  const candidateFinish = candidateEvaluation.earliestProjectFinishHours;
  const finishDelta = candidateFinish - baselineFinish;

  const baselineDeadline = baselinePlan.constraints.deadlineHours ?? 288;
  const effectiveDeadline =
    candidateEvaluation.deadlineHours ?? baselineDeadline;
  const candidateSlack = candidateEvaluation.deadlineSlackHours ?? 0;

  // Set of changed, removed, preserved tasks
  const changedTaskIds = new Set(candidateEvaluation.changedTaskIds);
  const removedTaskIds = new Set(candidateEvaluation.removedTaskIds);
  const preservedTaskIds = new Set(candidateEvaluation.preservedTaskIds);

  return (
    <section
      className={`rounded-xl p-6 space-y-6 transition-colors border ${
        isLight
          ? "bg-white border-slate-200/80 shadow-sm text-slate-900"
          : "bg-[#0d1322] border-slate-800 shadow-xl text-slate-100"
      }`}
    >
      {/* Diff Header */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ${
          isLight ? "border-slate-100" : "border-slate-800"
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            <GitCompare className={`w-5 h-5 ${isLight ? "text-indigo-600" : "text-teal-400"}`} />
            <h3 className={`text-lg font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              Candidate Diff & Impact Inspector
            </h3>
            <span
              className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                isLight
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-teal-950/60 text-teal-300 border-teal-800/80"
              }`}
            >
              {candidateEvaluation.candidateId}
            </span>
          </div>
          <p className={`text-xs mt-1 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Comparing Baseline Plan against candidate: &ldquo;{candidateEvaluation.label}&rdquo;
          </p>
        </div>

        {/* Preview status & actions */}
        <div className="flex items-center gap-2">
          {isPreviewActive ? (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  isLight
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-emerald-950/60 text-emerald-300 border-emerald-800/80"
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                Active Local Preview
              </span>
              <button
                type="button"
                onClick={onRevertPreview}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  isLight
                    ? "text-slate-700 bg-white border-slate-300 hover:bg-slate-50"
                    : "text-slate-200 bg-slate-800/90 border-slate-700 hover:bg-slate-700"
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Revert to Baseline
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAcceptPreview(candidateEvaluation.candidatePlan)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition shadow-xs ${
                isLight
                  ? "text-white bg-slate-900 hover:bg-slate-800"
                  : "text-slate-950 bg-teal-400 hover:bg-teal-300 font-bold"
              }`}
            >
              <span>Accept & Preview Patch</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Plan-Level Impact Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Cost Comparison */}
        <div
          className={`p-3.5 rounded-lg border ${
            isLight ? "bg-slate-50 border-slate-200/80" : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <div
            className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <Coins className={`w-3.5 h-3.5 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
            Total Cost
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-base font-bold font-mono ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              ₹{candidateCost.toLocaleString()}
            </span>
            <span
              className={`text-xs font-semibold font-mono ${
                costDelta < 0
                  ? isLight
                    ? "text-emerald-700"
                    : "text-emerald-400"
                  : costDelta > 0
                  ? isLight
                    ? "text-amber-700"
                    : "text-amber-400"
                  : isLight
                  ? "text-slate-500"
                  : "text-slate-400"
              }`}
            >
              {costDelta > 0
                ? `+₹${costDelta.toLocaleString()}`
                : costDelta < 0
                ? `-₹${Math.abs(costDelta).toLocaleString()}`
                : "±₹0"}
            </span>
          </div>
          <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Baseline: ₹{baselineCost.toLocaleString()} &bull; Budget: ₹
            {(candidateEvaluation.budgetLimit ?? baselinePlan.constraints.budgetLimit ?? 25000).toLocaleString()}
          </div>
        </div>

        {/* Schedule Finish Comparison */}
        <div
          className={`p-3.5 rounded-lg border ${
            isLight ? "bg-slate-50 border-slate-200/80" : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <div
            className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <Clock className={`w-3.5 h-3.5 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
            Earliest Finish
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-base font-bold font-mono ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              {candidateFinish}h
            </span>
            <span
              className={`text-xs font-semibold font-mono ${
                finishDelta < 0
                  ? isLight
                    ? "text-emerald-700"
                    : "text-emerald-400"
                  : finishDelta > 0
                  ? isLight
                    ? "text-amber-700"
                    : "text-amber-400"
                  : isLight
                  ? "text-slate-500"
                  : "text-slate-400"
              }`}
            >
              {finishDelta > 0 ? `+${finishDelta}h` : finishDelta < 0 ? `${finishDelta}h` : "±0h"}
            </span>
          </div>
          <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Baseline: {baselineFinish}h &bull; Deadline: {effectiveDeadline}h
          </div>
        </div>

        {/* Schedule Slack */}
        <div
          className={`p-3.5 rounded-lg border ${
            isLight ? "bg-slate-50 border-slate-200/80" : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <div
            className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <Sliders className={`w-3.5 h-3.5 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
            Remaining Slack
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-base font-bold font-mono ${
                candidateSlack >= 0
                  ? isLight
                    ? "text-emerald-700"
                    : "text-emerald-400"
                  : isLight
                  ? "text-red-700"
                  : "text-red-400"
              }`}
            >
              {candidateSlack}h
            </span>
            <span className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              {candidateSlack >= 24 ? "Healthy buffer" : candidateSlack > 0 ? "Tight margin" : "Overdue"}
            </span>
          </div>
          <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Effective deadline: {effectiveDeadline}h
          </div>
        </div>
      </div>

      {/* Impact Detail Switcher: Timeline Comparison vs Task Table */}
      <div className="space-y-4">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b ${
            isLight ? "border-slate-100" : "border-slate-800"
          }`}
        >
          <div
            className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? "text-slate-700" : "text-slate-300"
            }`}
          >
            <span>Candidate Impact Analysis</span>
            <span className={isLight ? "text-slate-400 font-normal" : "text-slate-500 font-normal"}>
              ({changedTaskIds.size} changed, {removedTaskIds.size} removed)
            </span>
          </div>

          <div
            className={`flex items-center p-0.5 rounded-lg border self-start sm:self-auto ${
              isLight ? "bg-slate-100 border-slate-200" : "bg-slate-900 border-slate-800"
            }`}
          >
            <button
              type="button"
              onClick={() => setDiffViewTab("timeline")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                diffViewTab === "timeline"
                  ? isLight
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "bg-[#131b2e] text-teal-300 shadow-xs font-semibold"
                  : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${isLight ? "text-indigo-600" : "text-teal-400"}`} />
              <span>Schedule Timeline Comparison</span>
            </button>
            <button
              type="button"
              onClick={() => setDiffViewTab("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                diffViewTab === "table"
                  ? isLight
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "bg-[#131b2e] text-teal-300 shadow-xs font-semibold"
                  : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className={`w-3.5 h-3.5 ${isLight ? "text-slate-600" : "text-slate-400"}`} />
              <span>Task Modifications Table</span>
            </button>
          </div>
        </div>

        {diffViewTab === "timeline" ? (
          <PlanTimeline
            baselinePlan={baselinePlan}
            proposedPlan={candidateEvaluation.candidatePlan}
            candidatePatch={candidatePatch}
            candidateEvaluation={candidateEvaluation}
            initialMode="comparison"
          />
        ) : (
          <div
            className={`border rounded-lg overflow-x-auto shadow-xs ${
              isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-[#0d1322]"
            }`}
          >
            <table
              className={`w-full text-left text-xs ${
                isLight ? "text-slate-600" : "text-slate-300"
              }`}
            >
              <thead
                className={`font-semibold border-b ${
                  isLight
                    ? "bg-slate-50 text-slate-700 border-slate-200"
                    : "bg-slate-900/90 text-slate-300 border-slate-800"
                }`}
              >
                <tr>
                  <th className="py-2.5 px-3">Task ID</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Baseline Title</th>
                  <th className="py-2.5 px-3">Candidate Title / Overrides</th>
                  <th className="py-2.5 px-3">Cost Delta</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Policy</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-slate-800/80"}`}>
                {baselinePlan.tasks.map((baseTask) => {
                  const isChanged = changedTaskIds.has(baseTask.id);
                  const isRemoved = removedTaskIds.has(baseTask.id);
                  const candTask = candidateEvaluation.candidatePlan.tasks.find(
                    (t) => t.id === baseTask.id
                  );

                  if (!isChanged && !isRemoved) {
                    return (
                      <tr
                        key={baseTask.id}
                        className={isLight ? "text-slate-400 opacity-60" : "text-slate-500 opacity-50"}
                      >
                        <td className="py-2 px-3 font-mono font-semibold">{baseTask.id}</td>
                        <td className="py-2 px-3">
                          <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                            Preserved
                          </span>
                        </td>
                        <td className="py-2 px-3">{baseTask.title}</td>
                        <td className="py-2 px-3 font-mono">—</td>
                        <td className="py-2 px-3">₹{baseTask.cost.toLocaleString()}</td>
                        <td className="py-2 px-3">{baseTask.durationHours}h</td>
                        <td className="py-2 px-3">{baseTask.policy}</td>
                      </tr>
                    );
                  }

                  if (isRemoved) {
                    return (
                      <tr
                        key={baseTask.id}
                        className={isLight ? "bg-red-50/50" : "bg-red-950/20"}
                      >
                        <td
                          className={`py-2 px-3 font-mono font-bold ${
                            isLight ? "text-red-900" : "text-red-400"
                          }`}
                        >
                          {baseTask.id}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isLight
                                ? "bg-red-100 text-red-800"
                                : "bg-red-950/80 text-red-300 border border-red-800/60"
                            }`}
                          >
                            Removed
                          </span>
                        </td>
                        <td
                          className={`py-2 px-3 line-through ${
                            isLight ? "text-slate-600" : "text-slate-400"
                          }`}
                        >
                          {baseTask.title}
                        </td>
                        <td className={`py-2 px-3 italic ${isLight ? "text-red-700" : "text-red-400"}`}>
                          Task dropped from plan
                        </td>
                        <td
                          className={`py-2 px-3 font-mono ${
                            isLight ? "text-emerald-700" : "text-emerald-400"
                          }`}
                        >
                          -₹{baseTask.cost.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 line-through">{baseTask.durationHours}h</td>
                        <td className="py-2 px-3">{baseTask.policy}</td>
                      </tr>
                    );
                  }

                  // isChanged
                  const taskDelta = candTask ? candTask.cost - baseTask.cost : 0;
                  return (
                    <tr
                      key={baseTask.id}
                      className={isLight ? "bg-indigo-50/50" : "bg-teal-950/20"}
                    >
                      <td
                        className={`py-2 px-3 font-mono font-bold ${
                          isLight ? "text-indigo-900" : "text-teal-400"
                        }`}
                      >
                        {baseTask.id}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            isLight
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-teal-950/80 text-teal-300 border border-teal-800/60"
                          }`}
                        >
                          Modified
                        </span>
                      </td>
                      <td className={`py-2 px-3 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                        {baseTask.title}
                      </td>
                      <td
                        className={`py-2 px-3 font-medium ${
                          isLight ? "text-slate-900" : "text-slate-100"
                        }`}
                      >
                        {candTask?.title}
                        {baseTask.title !== candTask?.title && (
                          <span
                            className={`block text-[10px] ${
                              isLight ? "text-indigo-600" : "text-teal-400"
                            }`}
                          >
                            (Substituted alternative)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <span
                          className={`font-semibold ${
                            isLight ? "text-slate-900" : "text-slate-100"
                          }`}
                        >
                          ₹{candTask?.cost.toLocaleString()}
                        </span>{" "}
                        <span
                          className={`text-[11px] ${
                            taskDelta < 0
                              ? isLight
                                ? "text-emerald-700"
                                : "text-emerald-400"
                              : taskDelta > 0
                              ? isLight
                                ? "text-amber-700"
                                : "text-amber-400"
                              : isLight
                              ? "text-slate-500"
                              : "text-slate-400"
                          }`}
                        >
                          ({taskDelta > 0 ? `+₹${taskDelta}` : taskDelta < 0 ? `-₹${Math.abs(taskDelta)}` : "±0"})
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {candTask?.durationHours}h{" "}
                        {candTask && candTask.durationHours !== baseTask.durationHours && (
                          <span
                            className={`text-[10px] ${
                              isLight ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            (was {baseTask.durationHours}h)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono">{candTask?.policy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Persistence Disclaimer Banner */}
      <div
        className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
          isLight
            ? "bg-slate-50 border-slate-200/70 text-slate-600"
            : "bg-[#131b2e] border-slate-800 text-slate-300"
        }`}
      >
        <Info className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
        <div>
          <span className={`font-semibold ${isLight ? "text-slate-800" : "text-slate-100"}`}>
            Local Workspace Preview Note:
          </span>{" "}
          Accepting this candidate updates the local active plan in memory to explore schedule and
          budget feasibility. No persistent database record is mutated and no live vendor booking
          is performed.
        </div>
      </div>
    </section>
  );
}
