"use client";

import React, { useState } from "react";
import type { Plan } from "../lib/schemas/plan.schema";
import { schedulePlan } from "../lib/engine/schedule";
import { useTheme } from "../lib/theme-context";
import {
  Calendar,
  Coins,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { PlanTimeline } from "./plan/PlanTimeline";

interface PlanOverviewProps {
  plan: Plan;
}

export function PlanOverview({ plan }: PlanOverviewProps) {
  const { isLight, isDark } = useTheme();
  const [isTasksExpanded, setIsTasksExpanded] = useState(false);
  const [inspectMode, setInspectMode] = useState<"timeline" | "table">("timeline");

  const totalCost = plan.tasks.reduce((sum, t) => sum + t.cost, 0);
  const budgetLimit = plan.constraints.budgetLimit;
  const budgetRemaining =
    budgetLimit !== undefined ? budgetLimit - totalCost : null;
  const deadlineHours = plan.constraints.deadlineHours;

  // Calculate topological schedule dynamically for baseline earliest finish
  const scheduleResult = schedulePlan(plan);
  const earliestFinish = scheduleResult.success
    ? scheduleResult.projectFinishHours
    : 132;
  const deadlineSlack =
    scheduleResult.success && scheduleResult.hasDeadline
      ? scheduleResult.projectSlack ?? null
      : deadlineHours !== undefined
      ? deadlineHours - earliestFinish
      : null;

  const isDemo = plan.id === "campus-tech-fest" || plan.name === "Campus Tech Fest";

  return (
    <section
      className={`rounded-xl border shadow-sm p-6 space-y-6 transition-colors ${
        isLight
          ? "bg-white border-slate-200/80 text-slate-900"
          : "bg-[#0d1322] border-slate-800 text-slate-100"
      }`}
    >
      {/* Plan Header */}
      <div
        className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b transition-colors ${
          isLight ? "border-slate-100" : "border-slate-800"
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            <h2
              className={`text-xl font-bold tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              {plan.name}
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isLight
                  ? "bg-slate-100 text-slate-700 border-slate-200"
                  : "bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              {plan.domain}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                isDemo
                  ? isLight
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-blue-950/60 text-blue-300 border-blue-800"
                  : isLight
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : "bg-purple-950/60 text-purple-300 border-purple-800"
              }`}
            >
              {isDemo ? "Demo Fixture" : "Custom Plan"}
            </span>
          </div>
          <p
            className={`text-sm mt-1 max-w-3xl leading-relaxed ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {plan.description}
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Tasks Count */}
        <div
          className={`p-4 rounded-lg border transition-colors ${
            isLight
              ? "bg-slate-50 border-slate-100"
              : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <Layers className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
            <span>Tasks</span>
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            {plan.tasks.length}
          </div>
          <div
            className={`text-xs mt-0.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {plan.tasks.filter((t) => t.policy === "fixed").length} fixed requirements
          </div>
        </div>

        {/* Budget Limit & Usage */}
        <div
          className={`p-4 rounded-lg border transition-colors ${
            isLight
              ? "bg-slate-50 border-slate-100"
              : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <Coins className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
            <span>Cost & Budget</span>
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            ₹{totalCost.toLocaleString()}
          </div>
          <div
            className={`text-xs mt-0.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {budgetLimit !== undefined ? (
              <>
                Limit: ₹{budgetLimit.toLocaleString()}{" "}
                {budgetRemaining !== null && (
                  <span
                    className={`font-medium ${
                      budgetRemaining >= 0
                        ? isLight
                          ? "text-emerald-700"
                          : "text-emerald-400"
                        : isLight
                        ? "text-red-700"
                        : "text-rose-400"
                    }`}
                  >
                    ({budgetRemaining >= 0 ? `₹${budgetRemaining.toLocaleString()} remaining` : `₹${Math.abs(budgetRemaining).toLocaleString()} over budget`})
                  </span>
                )}
              </>
            ) : (
              <span className={isLight ? "text-slate-400" : "text-slate-500"}>No Budget Limit Set</span>
            )}
          </div>
        </div>

        {/* Earliest Finish & Deadline */}
        <div
          className={`p-4 rounded-lg border transition-colors ${
            isLight
              ? "bg-slate-50 border-slate-100"
              : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <Clock className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
            <span>Schedule & Deadline</span>
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            {earliestFinish}h
          </div>
          <div
            className={`text-xs mt-0.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {deadlineHours !== undefined ? (
              <>
                Deadline: {deadlineHours}h{" "}
                {deadlineSlack !== null && (
                  <span
                    className={`font-medium ${
                      deadlineSlack >= 0
                        ? isLight
                          ? "text-emerald-700"
                          : "text-emerald-400"
                        : isLight
                        ? "text-red-700"
                        : "text-rose-400"
                    }`}
                  >
                    ({deadlineSlack >= 0 ? `${deadlineSlack}h slack` : `${Math.abs(deadlineSlack)}h overdue`})
                  </span>
                )}
              </>
            ) : (
              <span className={isLight ? "text-slate-400" : "text-slate-500"}>No Deadline Set</span>
            )}
          </div>
        </div>

        {/* Constraints & Attendance / Operational Target */}
        <div
          className={`p-4 rounded-lg border transition-colors ${
            isLight
              ? "bg-slate-50 border-slate-100"
              : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <ShieldCheck className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
            <span>Operations Target</span>
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            {plan.constraints.expectedAttendance ?? plan.tasks.filter((t) => t.policy === "fixed").length}
          </div>
          <div
            className={`text-xs mt-0.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {plan.constraints.expectedAttendance !== undefined
              ? "Target Attendees • Accessible"
              : `${plan.domain ?? "General"} • Deliverables`}
          </div>
        </div>
      </div>

      {/* Collapsible Task & Schedule Inspector */}
      <div className="pt-2">
        <button
          onClick={() => setIsTasksExpanded(!isTasksExpanded)}
          className={`flex items-center justify-between w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-medium transition ${
            isLight
              ? "bg-slate-100/70 hover:bg-slate-100 text-slate-700"
              : "bg-[#131b2e] hover:bg-[#19243d] text-slate-200 border border-slate-800"
          }`}
        >
          <span className="flex items-center gap-2">
            <Calendar className={`w-4 h-4 ${isLight ? "text-slate-500" : "text-teal-400"}`} />
            Inspect Plan Schedule, Tasks ({plan.tasks.length}) &amp; Dependencies ({plan.dependencies.length})
          </span>
          {isTasksExpanded ? (
            <ChevronUp className={`w-4 h-4 ${isLight ? "text-slate-500" : "text-slate-400"}`} />
          ) : (
            <ChevronDown className={`w-4 h-4 ${isLight ? "text-slate-500" : "text-slate-400"}`} />
          )}
        </button>

        {isTasksExpanded && (
          <div className="mt-4 space-y-4">
            {/* View Mode Toggle: Timeline vs Table */}
            <div
              className={`flex items-center justify-between pb-2 border-b transition-colors ${
                isLight ? "border-slate-100" : "border-slate-800"
              }`}
            >
              <div
                className={`inline-flex rounded-lg border p-0.5 text-xs font-medium ${
                  isLight
                    ? "border-slate-200 bg-slate-100/60"
                    : "border-slate-700 bg-[#131b2e]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setInspectMode("timeline")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectMode === "timeline"
                      ? isLight
                        ? "bg-white text-slate-900 shadow-xs font-semibold"
                        : "bg-teal-600 text-white shadow-xs font-semibold"
                      : isLight
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Schedule Timeline &amp; Critical Path
                </button>
                <button
                  type="button"
                  onClick={() => setInspectMode("table")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectMode === "table"
                      ? isLight
                        ? "bg-white text-slate-900 shadow-xs font-semibold"
                        : "bg-teal-600 text-white shadow-xs font-semibold"
                      : isLight
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Tasks &amp; Dependency Table
                </button>
              </div>

              <span className={`text-[11px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                {inspectMode === "timeline" ? "Interactive topological Gantt" : "Tabular representation"}
              </span>
            </div>

            {inspectMode === "timeline" ? (
              <PlanTimeline baselinePlan={plan} />
            ) : (
              <div
                className={`border rounded-lg overflow-x-auto shadow-sm transition-colors ${
                  isLight ? "border-slate-200" : "border-slate-800"
                }`}
              >
                <table
                  className={`w-full text-left text-xs ${
                    isLight ? "text-slate-600" : "text-slate-300"
                  }`}
                >
                  <thead
                    className={`font-semibold border-b transition-colors ${
                      isLight
                        ? "bg-slate-50 text-slate-700 border-slate-200"
                        : "bg-[#111827] text-slate-200 border-slate-800"
                    }`}
                  >
                    <tr>
                      <th className="py-2.5 px-3">ID</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3">Cost</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Priority</th>
                      <th className="py-2.5 px-3">Policy</th>
                      <th className="py-2.5 px-3">Predecessors</th>
                    </tr>
                  </thead>
                  <tbody
                    className={`divide-y transition-colors ${
                      isLight ? "divide-slate-100" : "divide-slate-800/60"
                    }`}
                  >
                    {plan.tasks.map((task) => {
                      const predecessors = plan.dependencies
                        .filter((d) => d.toTaskId === task.id)
                        .map((d) => d.fromTaskId);

                      return (
                        <tr
                          key={task.id}
                          className={`transition ${
                            isLight
                              ? "hover:bg-slate-50/80"
                              : "hover:bg-[#151f33]"
                          }`}
                        >
                          <td
                            className={`py-2 px-3 font-mono font-semibold ${
                              isLight ? "text-slate-900" : "text-teal-400"
                            }`}
                          >
                            {task.id}
                          </td>
                          <td
                            className={`py-2 px-3 font-medium ${
                              isLight ? "text-slate-800" : "text-slate-100"
                            }`}
                          >
                            {task.title}
                          </td>
                          <td className="py-2 px-3">₹{task.cost.toLocaleString()}</td>
                          <td className="py-2 px-3">{task.durationHours}h</td>
                          <td className="py-2 px-3">{task.priority}/5</td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                                task.policy === "fixed"
                                  ? isLight
                                    ? "bg-slate-100 text-slate-800 font-semibold"
                                    : "bg-slate-800 text-slate-200 font-semibold border border-slate-700"
                                  : task.policy === "optional"
                                  ? isLight
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-amber-950/60 text-amber-300 border border-amber-800"
                                  : isLight
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-blue-950/60 text-blue-300 border border-blue-800"
                              }`}
                            >
                              {task.policy}
                            </span>
                          </td>
                          <td
                            className={`py-2 px-3 font-mono ${
                              isLight ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            {predecessors.length > 0
                              ? predecessors.join(", ")
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
