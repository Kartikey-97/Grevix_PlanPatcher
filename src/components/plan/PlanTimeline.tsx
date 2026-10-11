"use client";

import React, { useState, useMemo } from "react";
import type { Plan, Task } from "../../lib/schemas/plan.schema";
import type { CandidatePatch } from "../../lib/schemas/patch.schema";
import type { EvaluatedCandidate } from "../../lib/schemas/recovery-result.schema";
import type { CandidateEvaluationResult } from "../../lib/engine/evaluate-candidates";
import { schedulePlan, type ScheduleResult, type TaskSchedule } from "../../lib/engine/schedule";
import { useTheme } from "../../lib/theme-context";
import {
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Info,
  Maximize2,
  Minimize2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  GitBranch,
  ZoomIn,
  Compass,
} from "lucide-react";

export type TimelineViewMode = "baseline" | "proposed" | "comparison";


export interface PlanTimelineProps {
  baselinePlan: Plan;
  proposedPlan?: Plan;
  candidatePatch?: CandidatePatch;
  candidateEvaluation?: EvaluatedCandidate | CandidateEvaluationResult;
  initialMode?: TimelineViewMode;
  onSelectTask?: (taskId: string) => void;
  selectedTaskId?: string | null;
  className?: string;
}

interface RenderTaskItem {
  id: string;
  title: string;
  policy: "fixed" | "flexible" | "replaceable" | "optional";
  status: string;
  cost: number;
  durationHours: number;
  earliestStart: number;
  earliestFinish: number;
  isCritical: boolean;
  criticalPathFloat: number;
  deadlineSlack?: number;
  isDeadlineViolated: boolean;
  predecessorIds: string[];
  successorIds: string[];
  // Comparison diff flags
  diffState: "unchanged" | "added" | "removed" | "modified_duration" | "modified_start";
  baselineStart?: number;
  baselineFinish?: number;
  baselineDuration?: number;
}

export function PlanTimeline({
  baselinePlan,
  proposedPlan,
  candidatePatch,
  candidateEvaluation,
  initialMode = "baseline",
  onSelectTask,
  selectedTaskId: controlledSelectedTaskId,
  className = "",
}: PlanTimelineProps) {
  const { isLight, isDark } = useTheme();
  const [viewMode, setViewMode] = useState<TimelineViewMode>(
    proposedPlan ? initialMode : "baseline"
  );
  const [internalSelectedTaskId, setInternalSelectedTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [showConnectors, setShowConnectors] = useState(true);
  const [horizonMode, setHorizonMode] = useState<"fit" | "deadline">("fit");

  const activeSelectedTaskId = controlledSelectedTaskId ?? internalSelectedTaskId;

  // 1. Calculate schedule for baseline plan
  const baselineSchedule: ScheduleResult = useMemo(() => {
    return schedulePlan(baselinePlan);
  }, [baselinePlan]);

  // 2. Calculate schedule for proposed plan if available
  const proposedSchedule: ScheduleResult | null = useMemo(() => {
    if (!proposedPlan) return null;
    return schedulePlan(proposedPlan);
  }, [proposedPlan]);

  // 3. Determine active schedule and plan based on viewMode
  const activePlan = viewMode === "proposed" && proposedPlan ? proposedPlan : baselinePlan;
  const activeSchedule =
    viewMode === "proposed" && proposedSchedule ? proposedSchedule : baselineSchedule;

  // Empty state handling
  if (!activePlan || activePlan.tasks.length === 0) {
    return (
      <div
        className={`p-8 rounded-xl text-center space-y-3 transition-colors ${
          isLight
            ? "bg-slate-50 border border-slate-200 text-slate-800"
            : "bg-[#0d1322] border border-slate-800 text-slate-100"
        } ${className}`}
      >
        <Layers className={`w-8 h-8 mx-auto ${isLight ? "text-slate-400" : "text-slate-600"}`} />
        <h4 className={`text-sm font-semibold ${isLight ? "text-slate-800" : "text-slate-100"}`}>
          No Tasks in Schedule
        </h4>
        <p className={`text-xs max-w-sm mx-auto ${isLight ? "text-slate-500" : "text-slate-400"}`}>
          Add tasks and dependency edges to this plan to generate an automated critical-path schedule timeline.
        </p>
      </div>
    );
  }

  // 4. Compute merged task items for comparison or single view
  const { taskItems, totalDurationHours, maxDeadlineHours } = useMemo(() => {
    const baseTasksMap = new Map(baselinePlan.tasks.map((t) => [t.id, t]));
    const baseSchedMap = baselineSchedule.tasks;

    const propTasksMap = proposedPlan
      ? new Map(proposedPlan.tasks.map((t) => [t.id, t]))
      : new Map<string, Task>();
    const propSchedMap = proposedSchedule ? proposedSchedule.tasks : {};

    const removedIds = new Set(candidateEvaluation?.removedTaskIds ?? []);
    const changedIds = new Set(candidateEvaluation?.changedTaskIds ?? []);

    // All distinct task IDs
    const allTaskIds = new Set<string>();
    if (viewMode === "comparison") {
      baselinePlan.tasks.forEach((t) => allTaskIds.add(t.id));
      if (proposedPlan) proposedPlan.tasks.forEach((t) => allTaskIds.add(t.id));
    } else if (viewMode === "proposed" && proposedPlan) {
      proposedPlan.tasks.forEach((t) => allTaskIds.add(t.id));
    } else {
      baselinePlan.tasks.forEach((t) => allTaskIds.add(t.id));
    }

    const items: RenderTaskItem[] = [];

    allTaskIds.forEach((taskId) => {
      const baseTask = baseTasksMap.get(taskId);
      const baseSched = baseSchedMap[taskId];
      const propTask = propTasksMap.get(taskId);
      const propSched = propSchedMap[taskId];

      let diffState: RenderTaskItem["diffState"] = "unchanged";

      if (viewMode === "comparison" || viewMode === "proposed") {
        if (!propTask && baseTask) {
          diffState = "removed";
        } else if (propTask && !baseTask) {
          diffState = "added";
        } else if (baseTask && propTask && baseSched && propSched) {
          if (baseTask.durationHours !== propTask.durationHours) {
            diffState = "modified_duration";
          } else if (Math.abs(baseSched.earliestStart - propSched.earliestStart) > 1e-4) {
            diffState = "modified_start";
          }
        }
      }

      // Choose which plan attributes to display
      const displayTask = (viewMode === "proposed" ? propTask : baseTask) ?? baseTask ?? propTask!;
      const displaySched = (viewMode === "proposed" ? propSched : baseSched) ?? baseSched ?? propSched;

      if (!displayTask || !displaySched) return;

      // Extract blocking dependencies
      const relevantPlan = viewMode === "proposed" && proposedPlan ? proposedPlan : baselinePlan;
      const predecessors = relevantPlan.dependencies
        .filter((d) => d.toTaskId === taskId && d.blocksExecution !== false)
        .map((d) => d.fromTaskId);
      const successors = relevantPlan.dependencies
        .filter((d) => d.fromTaskId === taskId && d.blocksExecution !== false)
        .map((d) => d.toTaskId);

      items.push({
        id: taskId,
        title: displayTask.title,
        policy: displayTask.policy,
        status: displayTask.status,
        cost: displayTask.cost,
        durationHours: displayTask.durationHours,
        earliestStart: displaySched.earliestStart,
        earliestFinish: displaySched.earliestFinish,
        isCritical: displaySched.isCritical,
        criticalPathFloat: displaySched.criticalPathFloat,
        deadlineSlack: displaySched.deadlineSlack,
        isDeadlineViolated: displaySched.isDeadlineViolated,
        predecessorIds: predecessors,
        successorIds: successors,
        diffState,
        baselineStart: baseSched?.earliestStart,
        baselineFinish: baseSched?.earliestFinish,
        baselineDuration: baseTask?.durationHours,
      });
    });

    // Sort tasks in topological execution order:
    // 1. earliestStart ascending
    // 2. Critical path tasks first when start times are identical
    // 3. Longer duration tasks first to give cleaner cascade
    items.sort((a, b) => {
      if (a.earliestStart !== b.earliestStart) {
        return a.earliestStart - b.earliestStart;
      }
      if (a.isCritical !== b.isCritical) {
        return a.isCritical ? -1 : 1;
      }
      return b.durationHours - a.durationHours;
    });

    // Time horizon calculation
    const maxFinish = Math.max(
      baselineSchedule.projectFinishHours,
      proposedSchedule?.projectFinishHours ?? 0,
      ...items.map((i) => i.earliestFinish),
      1
    );

    const deadline = Math.max(
      baselinePlan.constraints.deadlineHours ?? 0,
      proposedPlan?.constraints.deadlineHours ?? 0
    );

    // In "fit" mode, scale timeline to actual active work + 15% breathing room (~152h)
    // In "deadline" mode, scale out to project deadline (~288h)
    const fitHorizon = Math.ceil(maxFinish * 1.15);
    const deadlineHorizon = Math.max(deadline > 0 ? deadline : maxFinish, maxFinish);
    const totalHours = horizonMode === "fit" ? fitHorizon : deadlineHorizon;

    return {
      taskItems: items,
      totalDurationHours: totalHours,
      maxDeadlineHours: deadline > 0 ? deadline : undefined,
      maxFinishHours: maxFinish,
    };
  }, [
    baselinePlan,
    proposedPlan,
    baselineSchedule,
    proposedSchedule,
    viewMode,
    candidateEvaluation,
    horizonMode,
  ]);

  // Filter tasks if critical only selected
  const displayedTasks = useMemo(() => {
    if (!showCriticalOnly) return taskItems;
    return taskItems.filter((t) => t.isCritical);
  }, [taskItems, showCriticalOnly]);

  // Selected task detail record
  const selectedTaskRecord = useMemo(() => {
    if (!activeSelectedTaskId) return null;
    return taskItems.find((t) => t.id === activeSelectedTaskId) ?? null;
  }, [taskItems, activeSelectedTaskId]);

  // 5. Layout Geometry Constants
  const rowHeight = 44; // px
  const headerHeight = 36; // px
  const labelWidth = 260; // px for task name/id sidebar - generous width prevents any truncation
  const minTimelineWidth = 720; // px
  const chartHeight = displayedTasks.length * rowHeight;

  // Compute time ticks (e.g. 10-12 ticks across the horizon)
  const timeTicks = useMemo(() => {
    const ticks: number[] = [];
    const step =
      totalDurationHours <= 24
        ? 2
        : totalDurationHours <= 72
        ? 6
        : totalDurationHours <= 168
        ? 12
        : 24;

    for (let t = 0; t <= totalDurationHours; t += step) {
      ticks.push(t);
    }
    if (ticks[ticks.length - 1] < totalDurationHours) {
      ticks.push(totalDurationHours);
    }
    return ticks;
  }, [totalDurationHours]);

  // Helper to map hours to percentage
  const getPercent = (hours: number) => {
    if (totalDurationHours <= 0) return 0;
    return (hours / totalDurationHours) * 100;
  };

  const handleTaskClick = (taskId: string) => {
    setInternalSelectedTaskId(taskId);
    onSelectTask?.(taskId);
  };

  return (
    <div
      className={`rounded-xl shadow-xs overflow-hidden transition-colors border ${
        isLight
          ? "bg-white border-slate-200/90 text-slate-900"
          : "bg-[#0d1322] border-slate-800 text-slate-100"
      } ${className}`}
    >
      {/* 1. Header Toolbar */}
      <div
        className={`p-4 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors ${
          isLight
            ? "border-slate-200/80 bg-slate-50/50 text-slate-900"
            : "border-slate-800 bg-[#111827]/80 text-slate-100"
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3
              className={`text-base font-bold tracking-tight flex items-center gap-1.5 ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              <Clock className="w-4 h-4 text-teal-500" />
              Schedule Timeline &amp; Critical Path
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                isLight
                  ? "bg-teal-50 text-teal-700 border-teal-200"
                  : "bg-teal-950/60 text-teal-300 border-teal-800"
              }`}
            >
              Deterministic DAG
            </span>
          </div>
          <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Calculated topological start &amp; finish times &bull; {displayedTasks.length} tasks scheduled &bull;{" "}
            Earliest Project Finish:{" "}
            <strong className={isLight ? "text-slate-900" : "text-slate-100"}>
              {activeSchedule.projectFinishHours}h
            </strong>
            {activeSchedule.hasDeadline && (
              <span>
                {" "}
                &bull; Deadline:{" "}
                <strong className={isLight ? "text-slate-900" : "text-slate-100"}>
                  {activeSchedule.deadlineHours}h
                </strong>{" "}
                (
                <span
                  className={
                    (activeSchedule.projectSlack ?? 0) >= 0
                      ? isLight
                        ? "text-emerald-700 font-semibold"
                        : "text-emerald-400 font-semibold"
                      : isLight
                      ? "text-rose-700 font-semibold"
                      : "text-rose-400 font-semibold"
                  }
                >
                  {(activeSchedule.projectSlack ?? 0) >= 0
                    ? `+${activeSchedule.projectSlack}h slack`
                    : `${activeSchedule.projectSlack}h overdue`}
                </span>
                )
              </span>
            )}
          </p>
        </div>

        {/* View Mode, Horizon Scale & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Horizon Scale Selector: Fit Work vs Full Deadline */}
          <div
            className={`inline-flex rounded-lg border p-0.5 shadow-2xs ${
              isLight ? "border-slate-200 bg-white" : "border-slate-700 bg-[#131b2e]"
            }`}
          >
            <button
              type="button"
              onClick={() => setHorizonMode("fit")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                horizonMode === "fit"
                  ? isLight
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-teal-600 text-white shadow-xs"
                  : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Scale timeline to fit active tasks with generous spacing"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Fit Work ({Math.ceil((activeSchedule.projectFinishHours || 132) * 1.15)}h)</span>
            </button>
            <button
              type="button"
              onClick={() => setHorizonMode("deadline")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                horizonMode === "deadline"
                  ? isLight
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-teal-600 text-white shadow-xs"
                  : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-white"
              }`}
              title="View full horizon out to project deadline limit"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Deadline ({activeSchedule.deadlineHours || 288}h)</span>
            </button>
          </div>

          {proposedPlan && (
            <div
              className={`inline-flex rounded-lg border p-0.5 shadow-2xs ${
                isLight ? "border-slate-200 bg-white" : "border-slate-700 bg-[#131b2e]"
              }`}
            >
              <button
                type="button"
                onClick={() => setViewMode("baseline")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  viewMode === "baseline"
                    ? isLight
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-800 text-white shadow-xs"
                    : isLight
                    ? "text-slate-600 hover:text-slate-900"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Baseline Plan
              </button>
              <button
                type="button"
                onClick={() => setViewMode("proposed")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  viewMode === "proposed"
                    ? "bg-blue-600 text-white shadow-xs"
                    : isLight
                    ? "text-slate-600 hover:text-slate-900"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Proposed Recovery
              </button>
              <button
                type="button"
                onClick={() => setViewMode("comparison")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  viewMode === "comparison"
                    ? "bg-purple-600 text-white shadow-xs"
                    : isLight
                    ? "text-slate-600 hover:text-slate-900"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Comparison
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setShowCriticalOnly(!showCriticalOnly)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                showCriticalOnly
                  ? isLight
                    ? "bg-amber-50 text-amber-800 border-amber-300 font-semibold"
                    : "bg-amber-950/50 text-amber-300 border-amber-700 font-semibold"
                  : isLight
                  ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  : "bg-[#131b2e] text-slate-300 border-slate-700 hover:bg-slate-800"
              }`}
            >
              {showCriticalOnly ? "Show All Tasks" : "Critical Path Only"}
            </button>

            <button
              type="button"
              onClick={() => setShowConnectors(!showConnectors)}
              className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                showConnectors
                  ? isLight
                    ? "bg-slate-100 text-slate-800 border-slate-300"
                    : "bg-slate-800 text-slate-200 border-slate-600"
                  : isLight
                  ? "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  : "bg-[#131b2e] text-slate-400 border-slate-700 hover:bg-slate-800"
              }`}
              title="Toggle Dependency Arrows"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Timeline Legend */}
      <div
        className={`px-4 py-2 border-b flex flex-wrap items-center gap-4 text-[11px] transition-colors ${
          isLight
            ? "border-slate-100 bg-white text-slate-600"
            : "border-slate-800 bg-[#0d1322] text-slate-300"
        }`}
      >
        <span
          className={`font-semibold uppercase tracking-wider text-[10px] ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Legend:
        </span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-rose-500 inline-block shadow-2xs" />
          <span>Critical Path (0 Float)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-indigo-600 inline-block" />
          <span>Flexible / Standard Task</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded inline-block ${isLight ? "bg-slate-800" : "bg-slate-400"}`} />
          <span>Fixed Foundation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
          <span>Optional</span>
        </div>
        {viewMode === "comparison" && (
          <>
            <div className={`flex items-center gap-1.5 ${isLight ? "text-purple-700" : "text-purple-400"}`}>
              <span className="w-3 h-3 rounded bg-purple-500 inline-block" />
              <span>Shifted in Recovery</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              <span>Added Task</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isLight ? "text-rose-700" : "text-rose-400"}`}>
              <span
                className={`w-3 h-3 rounded border border-dashed border-rose-500 inline-block ${
                  isLight ? "bg-rose-50" : "bg-rose-950/40"
                }`}
              />
              <span>Removed Task</span>
            </div>
          </>
        )}
      </div>

      {/* 3. Gantt Chart Body with Scrollable Area */}
      <div className="overflow-x-auto relative">
        <div className="min-w-[760px] relative select-none">
          {/* Timeline Header Time-Ticks Row */}
          <div
            className={`flex border-b font-mono text-[11px] sticky top-0 z-20 transition-colors ${
              isLight
                ? "border-slate-200 bg-slate-50/90 text-slate-600"
                : "border-slate-800 bg-[#111827] text-slate-400"
            }`}
            style={{ height: `${headerHeight}px` }}
          >
            {/* Task Name Column Header */}
            <div
              className={`px-3 flex items-center font-semibold border-r shrink-0 transition-colors ${
                isLight
                  ? "text-slate-700 border-slate-200 bg-slate-50/95"
                  : "text-slate-200 border-slate-800 bg-[#111827]"
              }`}
              style={{ width: `${labelWidth}px` }}
            >
              Task ID &amp; Name
            </div>

            {/* Time Axis Grid Header */}
            <div className="flex-1 relative">
              {timeTicks.map((tick) => (
                <div
                  key={tick}
                  className={`absolute top-0 bottom-0 border-l flex items-center pl-1 text-[10px] ${
                    isLight ? "border-slate-200/80 text-slate-500" : "border-slate-800/80 text-slate-400"
                  }`}
                  style={{ left: `${getPercent(tick)}%` }}
                >
                  <span>{tick}h</span>
                </div>
              ))}

              {/* Deadline line header mark */}
              {maxDeadlineHours !== undefined && (
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-500 z-30 flex items-center pl-1"
                  style={{ left: `${getPercent(maxDeadlineHours)}%` }}
                  title={`Project Deadline: ${maxDeadlineHours}h`}
                >
                  <span
                    className={`text-[10px] font-bold px-1 rounded ${
                      isLight
                        ? "text-rose-600 bg-rose-50 border border-rose-200"
                        : "text-rose-300 bg-rose-950/80 border border-rose-800"
                    }`}
                  >
                    Deadline {maxDeadlineHours}h
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Rows and SVG Visualization Layer */}
          <div className="relative" style={{ height: `${chartHeight}px` }}>
            {/* Vertical Time Gridlines Background */}
            <div
              className="absolute top-0 bottom-0 right-0 pointer-events-none"
              style={{ left: `${labelWidth}px` }}
            >
              {timeTicks.map((tick) => (
                <div
                  key={tick}
                  className={`absolute top-0 bottom-0 border-l ${
                    isLight ? "border-slate-100" : "border-slate-800/50"
                  }`}
                  style={{ left: `${getPercent(tick)}%` }}
                />
              ))}

              {/* Project Deadline Vertical Line */}
              {maxDeadlineHours !== undefined && (
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-400/90 z-20 pointer-events-none"
                  style={{ left: `${getPercent(maxDeadlineHours)}%` }}
                />
              )}
            </div>

            {/* SVG Connecting Dependency Edges Layer */}
            {showConnectors && (
              <svg
                className="absolute top-0 bottom-0 pointer-events-none z-10 dependency-connectors-svg"
                style={{
                  left: `${labelWidth}px`,
                  width: `calc(100% - ${labelWidth}px)`,
                  height: `${chartHeight}px`,
                }}
              >
                <defs>
                  <marker
                    id="arrowhead-default"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="#94a3b8" />
                  </marker>
                  <marker
                    id="arrowhead-critical"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="#f43f5e" />
                  </marker>
                  <marker
                    id="arrowhead-active"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="#3b82f6" />
                  </marker>
                </defs>

                {displayedTasks.flatMap((task, targetIdx) =>
                  task.predecessorIds.map((predId) => {
                    const sourceIdx = displayedTasks.findIndex((t) => t.id === predId);
                    if (sourceIdx < 0) return null;

                    const sourceTask = displayedTasks[sourceIdx];
                    const x1 = getPercent(sourceTask.earliestFinish);
                    const y1 = sourceIdx * rowHeight + rowHeight / 2;
                    const x2 = getPercent(task.earliestStart);
                    const y2 = targetIdx * rowHeight + rowHeight / 2;

                    // Highlight connector if source or target is hovered or selected
                    const isRelated =
                      hoveredTaskId === task.id ||
                      hoveredTaskId === predId ||
                      activeSelectedTaskId === task.id ||
                      activeSelectedTaskId === predId;

                    const isCriticalEdge =
                      sourceTask.isCritical &&
                      task.isCritical &&
                      Math.abs(task.earliestStart - sourceTask.earliestFinish) < 1e-4;

                    const strokeColor = isRelated
                      ? "#3b82f6"
                      : isCriticalEdge
                      ? "#f43f5e"
                      : "#cbd5e1";

                    const strokeWidth = isRelated ? 2 : isCriticalEdge ? 1.5 : 1;
                    const markerId = isRelated
                      ? "arrowhead-active"
                      : isCriticalEdge
                      ? "arrowhead-critical"
                      : "arrowhead-default";

                    // S-curve Bezier or Orthogonal path
                    const pathD =
                      Math.abs(y1 - y2) < 2
                        ? `M ${x1}% ${y1} L ${x2}% ${y2}`
                        : `M ${x1}% ${y1} C ${(x1 + x2) / 2}% ${y1}, ${(x1 + x2) / 2}% ${y2}, ${x2}% ${y2}`;

                    return (
                      <path
                        key={`edge-${predId}-${task.id}`}
                        d={pathD}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={isCriticalEdge && !isRelated ? "none" : undefined}
                        markerEnd={`url(#${markerId})`}
                        opacity={hoveredTaskId && !isRelated ? 0.3 : 0.85}
                      />
                    );
                  })
                )}
              </svg>
            )}

            {/* Task Rows & Bars */}
            {displayedTasks.map((task, idx) => {
              const isSelected = activeSelectedTaskId === task.id;
              const isHovered = hoveredTaskId === task.id;
              const barLeft = getPercent(task.earliestStart);
              const barWidth = Math.max(getPercent(task.durationHours), 0.8);

              // Styling bar based on critical status, policy, and diff state
              let barBg = "bg-indigo-600";
              let barBorder = "border-indigo-700";

              if (task.diffState === "removed") {
                barBg = "bg-rose-100 border border-dashed border-rose-400 text-rose-800";
                barBorder = "border-rose-400";
              } else if (task.diffState === "added") {
                barBg = "bg-emerald-600 text-white";
                barBorder = "border-emerald-700";
              } else if (task.diffState === "modified_start" || task.diffState === "modified_duration") {
                barBg = "bg-purple-600 text-white";
                barBorder = "border-purple-700";
              } else if (task.isCritical) {
                barBg = "bg-rose-500 text-white shadow-xs";
                barBorder = "border-rose-600";
              } else if (task.policy === "fixed") {
                barBg = "bg-slate-800 text-white";
                barBorder = "border-slate-900";
              } else if (task.policy === "optional") {
                barBg = "bg-amber-500 text-white";
                barBorder = "border-amber-600";
              }

              return (
                <div
                  key={task.id}
                  className={`flex items-center border-b transition-colors ${
                    isLight ? "border-slate-100" : "border-slate-800/60"
                  } ${
                    isSelected
                      ? isLight
                        ? "bg-teal-50/50"
                        : "bg-teal-950/40"
                      : isHovered
                      ? isLight
                        ? "bg-slate-50/80"
                        : "bg-[#141d2f]"
                      : idx % 2 === 0
                      ? isLight
                        ? "bg-white"
                        : "bg-[#0d1322]"
                      : isLight
                      ? "bg-slate-50/30"
                      : "bg-[#101726]/40"
                  }`}
                  style={{ height: `${rowHeight}px` }}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                >
                  {/* Task Name / ID Sidebar Label */}
                  <div
                    className={`px-3 flex items-center justify-between border-r shrink-0 cursor-pointer h-full transition-colors ${
                      isLight ? "border-slate-200" : "border-slate-800"
                    }`}
                    style={{ width: `${labelWidth}px` }}
                    onClick={() => handleTaskClick(task.id)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 pr-1">
                      <span
                        className={`font-mono text-xs font-bold shrink-0 ${
                          isLight ? "text-slate-800" : "text-teal-400"
                        }`}
                      >
                        {task.id}
                      </span>
                      <span
                        className={`text-xs font-semibold truncate ${
                          isLight ? "text-slate-700" : "text-slate-200"
                        }`}
                        title={task.title}
                      >
                        {task.title}
                      </span>
                    </div>

                    {task.isCritical && (
                      <span
                        className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
                        title="Critical Path (0 Float)"
                      />
                    )}
                  </div>

                  {/* Task Bar Chart Track */}
                  <div className="flex-1 h-full relative flex items-center">
                    {/* Visual Gantt Bar */}
                    <div
                      onClick={() => handleTaskClick(task.id)}
                      className={`absolute h-7 rounded-md cursor-pointer transition-all flex items-center justify-between px-2 text-xs font-medium ${barBg} ${
                        isSelected
                          ? "ring-2 ring-teal-400 ring-offset-1 z-30"
                          : isHovered
                          ? isLight
                            ? "ring-1 ring-slate-400 z-20"
                            : "ring-1 ring-slate-500 z-20"
                          : "z-10"
                      }`}
                      style={{
                        left: `${barLeft}%`,
                        width: `${barWidth}%`,
                        minWidth: "34px",
                      }}
                      title={`${task.id}: ${task.title} (${task.durationHours}h) • Starts ${task.earliestStart}h, Finishes ${task.earliestFinish}h`}
                    >
                      <span className="text-[11px] leading-tight font-bold font-mono whitespace-nowrap overflow-visible">
                        {task.durationHours}h
                      </span>

                      {task.isCritical && barWidth > 8 && (
                        <span className="text-[9px] bg-rose-700/70 px-1 py-0.2 rounded font-mono uppercase tracking-wider shrink-0 ml-1">
                          Crit
                        </span>
                      )}

                      {task.diffState === "modified_start" && barWidth > 8 && (
                        <span className="text-[9px] bg-purple-800/70 px-1 py-0.2 rounded shrink-0 ml-1">
                          Shifted
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Selected Task Inspection Panel */}
      {selectedTaskRecord && (
        <div
          className={`p-4 border-t text-xs space-y-2 transition-colors ${
            isLight
              ? "bg-slate-50 border-slate-200 text-slate-700"
              : "bg-[#111827] border-slate-800 text-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                  isLight
                    ? "bg-blue-100 text-blue-900"
                    : "bg-teal-950/80 text-teal-300 border border-teal-800"
                }`}
              >
                {selectedTaskRecord.id}
              </span>
              <strong
                className={`text-sm ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {selectedTaskRecord.title}
              </strong>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                  isLight
                    ? "bg-slate-200 text-slate-800"
                    : "bg-slate-800 text-slate-300 border border-slate-700"
                }`}
              >
                {selectedTaskRecord.policy}
              </span>
              {selectedTaskRecord.isCritical && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    isLight
                      ? "bg-rose-100 text-rose-800 border-rose-300"
                      : "bg-rose-950/80 text-rose-300 border-rose-800"
                  }`}
                >
                  Critical Path Task
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setInternalSelectedTaskId(null)}
              className={`text-xs font-semibold ${
                isLight
                  ? "text-slate-400 hover:text-slate-600"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Close Inspector
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white border-slate-200"
                  : "bg-[#151f32] border-slate-700/80 text-slate-200"
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase block ${
                  isLight ? "text-slate-400" : "text-slate-400"
                }`}
              >
                Earliest Start &amp; Finish
              </span>
              <span
                className={`text-xs font-bold ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {selectedTaskRecord.earliestStart}h &rarr; {selectedTaskRecord.earliestFinish}h
              </span>
            </div>

            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white border-slate-200"
                  : "bg-[#151f32] border-slate-700/80 text-slate-200"
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase block ${
                  isLight ? "text-slate-400" : "text-slate-400"
                }`}
              >
                Duration &amp; Cost
              </span>
              <span
                className={`text-xs font-bold ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {selectedTaskRecord.durationHours} Hours &bull; ₹{selectedTaskRecord.cost.toLocaleString()}
              </span>
            </div>

            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white border-slate-200"
                  : "bg-[#151f32] border-slate-700/80 text-slate-200"
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase block ${
                  isLight ? "text-slate-400" : "text-slate-400"
                }`}
              >
                Critical Path Float
              </span>
              <span
                className={`text-xs font-bold ${
                  selectedTaskRecord.isCritical
                    ? isLight
                      ? "text-rose-600"
                      : "text-rose-400"
                    : isLight
                    ? "text-emerald-700"
                    : "text-emerald-400"
                }`}
              >
                {selectedTaskRecord.criticalPathFloat}h Float
              </span>
            </div>

            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white border-slate-200"
                  : "bg-[#151f32] border-slate-700/80 text-slate-200"
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase block ${
                  isLight ? "text-slate-400" : "text-slate-400"
                }`}
              >
                Deadline Slack
              </span>
              <span
                className={`text-xs font-bold ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {selectedTaskRecord.deadlineSlack !== undefined
                  ? `${selectedTaskRecord.deadlineSlack}h Slack`
                  : "No Deadline Set"}
              </span>
            </div>
          </div>

          {/* Dependencies breakdown */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1 text-[11px]">
            <div className="flex-1">
              <span className={`font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Blocking Predecessors:
              </span>{" "}
              {selectedTaskRecord.predecessorIds.length > 0 ? (
                selectedTaskRecord.predecessorIds.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleTaskClick(p)}
                    className={`font-mono mr-1 font-semibold hover:underline ${
                      isLight ? "text-blue-700" : "text-teal-400"
                    }`}
                  >
                    {p}
                  </button>
                ))
              ) : (
                <span className={isLight ? "text-slate-400 italic" : "text-slate-500 italic"}>
                  None (Starts at Project Zero)
                </span>
              )}
            </div>

            <div className="flex-1">
              <span className={`font-semibold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Direct Dependent Successors:
              </span>{" "}
              {selectedTaskRecord.successorIds.length > 0 ? (
                selectedTaskRecord.successorIds.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleTaskClick(s)}
                    className={`font-mono mr-1 font-semibold hover:underline ${
                      isLight ? "text-blue-700" : "text-teal-400"
                    }`}
                  >
                    {s}
                  </button>
                ))
              ) : (
                <span className={isLight ? "text-slate-400 italic" : "text-slate-500 italic"}>
                  None (Terminal Task)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
