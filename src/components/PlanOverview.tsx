"use client";

import React, { useState } from "react";
import type { Plan } from "../lib/schemas/plan.schema";
import { schedulePlan } from "../lib/engine/schedule";
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
    <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      {/* Plan Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {plan.name}
            </h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {plan.domain}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                isDemo
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-purple-50 text-purple-700 border-purple-200"
              }`}
            >
              {isDemo ? "Demo Fixture" : "Custom Plan"}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
            {plan.description}
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Tasks Count */}
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Layers className="w-4 h-4 text-slate-400" />
            <span>Tasks</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {plan.tasks.length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {plan.tasks.filter((t) => t.policy === "fixed").length} fixed requirements
          </div>
        </div>

        {/* Budget Limit & Usage */}
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Coins className="w-4 h-4 text-slate-400" />
            <span>Cost & Budget</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            ₹{totalCost.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {budgetLimit !== undefined ? (
              <>
                Limit: ₹{budgetLimit.toLocaleString()}{" "}
                {budgetRemaining !== null && (
                  <span
                    className={`font-medium ${
                      budgetRemaining >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    ({budgetRemaining >= 0 ? `₹${budgetRemaining.toLocaleString()} remaining` : `₹${Math.abs(budgetRemaining).toLocaleString()} over budget`})
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">No Budget Limit Set</span>
            )}
          </div>
        </div>

        {/* Earliest Finish & Deadline */}
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Schedule & Deadline</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {earliestFinish}h
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {deadlineHours !== undefined ? (
              <>
                Deadline: {deadlineHours}h{" "}
                {deadlineSlack !== null && (
                  <span
                    className={`font-medium ${
                      deadlineSlack >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    ({deadlineSlack >= 0 ? `${deadlineSlack}h slack` : `${Math.abs(deadlineSlack)}h overdue`})
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">No Deadline Set</span>
            )}
          </div>
        </div>

        {/* Constraints & Attendance / Operational Target */}
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span>Operations Target</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {plan.constraints.expectedAttendance ?? plan.tasks.filter((t) => t.policy === "fixed").length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
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
          className="flex items-center justify-between w-full text-left py-2 px-3 rounded-lg bg-slate-100/70 hover:bg-slate-100 text-slate-700 text-sm font-medium transition"
        >
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            Inspect Plan Schedule, Tasks ({plan.tasks.length}) &amp; Dependencies ({plan.dependencies.length})
          </span>
          {isTasksExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {isTasksExpanded && (
          <div className="mt-4 space-y-4">
            {/* View Mode Toggle: Timeline vs Table */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setInspectMode("timeline")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectMode === "timeline"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Schedule Timeline &amp; Critical Path
                </button>
                <button
                  type="button"
                  onClick={() => setInspectMode("table")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectMode === "table"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Tasks &amp; Dependency Table
                </button>
              </div>

              <span className="text-[11px] text-slate-400">
                {inspectMode === "timeline" ? "Interactive topological Gantt" : "Tabular representation"}
              </span>
            </div>

            {inspectMode === "timeline" ? (
              <PlanTimeline baselinePlan={plan} />
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-x-auto shadow-sm">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
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
                  <tbody className="divide-y divide-slate-100">
                    {plan.tasks.map((task) => {
                      const predecessors = plan.dependencies
                        .filter((d) => d.toTaskId === task.id)
                        .map((d) => d.fromTaskId);

                      return (
                        <tr key={task.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                            {task.id}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {task.title}
                          </td>
                          <td className="py-2 px-3">₹{task.cost.toLocaleString()}</td>
                          <td className="py-2 px-3">{task.durationHours}h</td>
                          <td className="py-2 px-3">{task.priority}/5</td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                                task.policy === "fixed"
                                  ? "bg-slate-100 text-slate-800 font-semibold"
                                  : task.policy === "optional"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {task.policy}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-mono">
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
