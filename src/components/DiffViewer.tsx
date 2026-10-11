"use client";

import React, { useState } from "react";
import type { Plan } from "../lib/schemas/plan.schema";
import type { CandidateEvaluationResult } from "../lib/engine/evaluate-candidates";
import type { CandidatePatch } from "../lib/schemas/patch.schema";
import { PlanTimeline } from "./plan/PlanTimeline";
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
    <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      {/* Diff Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              Candidate Diff & Impact Inspector
            </h3>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              {candidateEvaluation.candidateId}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Comparing Baseline Plan against candidate: &ldquo;{candidateEvaluation.label}&rdquo;
          </p>
        </div>

        {/* Preview status & actions */}
        <div className="flex items-center gap-2">
          {isPreviewActive ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                <Check className="w-3.5 h-3.5" />
                Active Local Preview
              </span>
              <button
                type="button"
                onClick={onRevertPreview}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Revert to Baseline
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAcceptPreview(candidateEvaluation.candidatePlan)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition shadow-xs"
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
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-slate-400" />
            Total Cost
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-bold text-slate-900 font-mono">
              ₹{candidateCost.toLocaleString()}
            </span>
            <span
              className={`text-xs font-semibold font-mono ${
                costDelta < 0
                  ? "text-emerald-700"
                  : costDelta > 0
                  ? "text-amber-700"
                  : "text-slate-500"
              }`}
            >
              {costDelta > 0 ? `+₹${costDelta.toLocaleString()}` : costDelta < 0 ? `-₹${Math.abs(costDelta).toLocaleString()}` : "±₹0"}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Baseline: ₹{baselineCost.toLocaleString()} &bull; Budget: ₹
            {(candidateEvaluation.budgetLimit ?? baselinePlan.constraints.budgetLimit ?? 25000).toLocaleString()}
          </div>
        </div>

        {/* Schedule Finish Comparison */}
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Earliest Finish
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-bold text-slate-900 font-mono">
              {candidateFinish}h
            </span>
            <span
              className={`text-xs font-semibold font-mono ${
                finishDelta < 0
                  ? "text-emerald-700"
                  : finishDelta > 0
                  ? "text-amber-700"
                  : "text-slate-500"
              }`}
            >
              {finishDelta > 0 ? `+${finishDelta}h` : finishDelta < 0 ? `${finishDelta}h` : "±0h"}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Baseline: {baselineFinish}h &bull; Deadline: {effectiveDeadline}h
          </div>
        </div>

        {/* Schedule Slack */}
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            Remaining Slack
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-base font-bold font-mono ${
                candidateSlack >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {candidateSlack}h
            </span>
            <span className="text-xs text-slate-500">
              {candidateSlack >= 24 ? "Healthy buffer" : candidateSlack > 0 ? "Tight margin" : "Overdue"}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Effective deadline: {effectiveDeadline}h
          </div>
        </div>
      </div>

      {/* Impact Detail Switcher: Timeline Comparison vs Task Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <span>Candidate Impact Analysis</span>
            <span className="text-slate-400 font-normal">
              ({changedTaskIds.size} changed, {removedTaskIds.size} removed)
            </span>
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setDiffViewTab("timeline")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                diffViewTab === "timeline"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Schedule Timeline Comparison</span>
            </button>
            <button
              type="button"
              onClick={() => setDiffViewTab("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                diffViewTab === "table"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-slate-600" />
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
          <div className="border border-slate-200 rounded-lg overflow-x-auto shadow-xs">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100">
                {baselinePlan.tasks.map((baseTask) => {
                  const isChanged = changedTaskIds.has(baseTask.id);
                  const isRemoved = removedTaskIds.has(baseTask.id);
                  const candTask = candidateEvaluation.candidatePlan.tasks.find(
                    (t) => t.id === baseTask.id
                  );

                  if (!isChanged && !isRemoved) {
                    return (
                      <tr key={baseTask.id} className="text-slate-400 opacity-60">
                        <td className="py-2 px-3 font-mono font-semibold">{baseTask.id}</td>
                        <td className="py-2 px-3">
                          <span className="text-[11px] text-slate-500">Preserved</span>
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
                      <tr key={baseTask.id} className="bg-red-50/50">
                        <td className="py-2 px-3 font-mono font-bold text-red-900">{baseTask.id}</td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800">
                            Removed
                          </span>
                        </td>
                        <td className="py-2 px-3 line-through text-slate-600">{baseTask.title}</td>
                        <td className="py-2 px-3 text-red-700 italic">Task dropped from plan</td>
                        <td className="py-2 px-3 text-emerald-700 font-mono">
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
                    <tr key={baseTask.id} className="bg-indigo-50/50">
                      <td className="py-2 px-3 font-mono font-bold text-indigo-900">{baseTask.id}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                          Modified
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{baseTask.title}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">
                        {candTask?.title}
                        {baseTask.title !== candTask?.title && (
                          <span className="block text-[10px] text-indigo-600">
                            (Substituted alternative)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <span className="text-slate-900 font-semibold">
                          ₹{candTask?.cost.toLocaleString()}
                        </span>{" "}
                        <span
                          className={`text-[11px] ${
                            taskDelta < 0
                              ? "text-emerald-700"
                              : taskDelta > 0
                              ? "text-amber-700"
                              : "text-slate-500"
                          }`}
                        >
                          ({taskDelta > 0 ? `+₹${taskDelta}` : taskDelta < 0 ? `-₹${Math.abs(taskDelta)}` : "±0"})
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {candTask?.durationHours}h{" "}
                        {candTask && candTask.durationHours !== baseTask.durationHours && (
                          <span className="text-[10px] text-slate-500">
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
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70 text-xs text-slate-600 flex items-start gap-2">
        <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-800">
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
