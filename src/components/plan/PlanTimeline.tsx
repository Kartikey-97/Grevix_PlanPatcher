"use client";

import React, { useState, useMemo } from "react";
import type { Plan, Task } from "../../lib/schemas/plan.schema";
import type { CandidatePatch } from "../../lib/schemas/patch.schema";
import type { EvaluatedCandidate } from "../../lib/schemas/recovery-result.schema";
import type { CandidateEvaluationResult } from "../../lib/engine/evaluate-candidates";
import { schedulePlan, type ScheduleResult, type TaskSchedule } from "../../lib/engine/schedule";
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
  const [viewMode, setViewMode] = useState<TimelineViewMode>(
    proposedPlan ? initialMode : "baseline"
  );
  const [internalSelectedTaskId, setInternalSelectedTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [showConnectors, setShowConnectors] = useState(true);

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
      <div className={`p-8 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3 ${className}`}>
        <Layers className="w-8 h-8 text-slate-400 mx-auto" />
        <h4 className="text-sm font-semibold text-slate-800">No Tasks in Schedule</h4>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
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

    // Sort tasks in topological execution order: earliestStart ascending, then duration descending
    items.sort((a, b) => {
      if (a.earliestStart !== b.earliestStart) {
        return a.earliestStart - b.earliestStart;
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

    const totalHours = Math.max(maxFinish, deadline > 0 ? deadline : maxFinish);

    return {
      taskItems: items,
      totalDurationHours: Math.ceil(totalHours * 1.05), // add 5% padding
      maxDeadlineHours: deadline > 0 ? deadline : undefined,
    };
  }, [
    baselinePlan,
    proposedPlan,
    baselineSchedule,
    proposedSchedule,
    viewMode,
    candidateEvaluation,
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
  const labelWidth = 180; // px for task name/id sidebar
  const minTimelineWidth = 640; // px
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
    <div className={`bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden ${className}`}>
      {/* 1. Header Toolbar */}
      <div className="p-4 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              Schedule Timeline &amp; Critical Path
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Deterministic DAG
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Calculated topological start &amp; finish times &bull; {displayedTasks.length} tasks scheduled &bull;{" "}
            Earliest Project Finish:{" "}
            <strong>
              {activeSchedule.projectFinishHours}h
            </strong>
            {activeSchedule.hasDeadline && (
              <span>
                {" "}
                &bull; Deadline: <strong>{activeSchedule.deadlineHours}h</strong> (
                <span
                  className={
                    (activeSchedule.projectSlack ?? 0) >= 0
                      ? "text-emerald-700 font-semibold"
                      : "text-rose-700 font-semibold"
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

        {/* View Mode & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {proposedPlan && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("baseline")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  viewMode === "baseline"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
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
                    : "text-slate-600 hover:text-slate-900"
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
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Comparison
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <button
              type="button"
              onClick={() => setShowCriticalOnly(!showCriticalOnly)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                showCriticalOnly
                  ? "bg-amber-50 text-amber-800 border-amber-300 font-semibold"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {showCriticalOnly ? "Show All Tasks" : "Critical Path Only"}
            </button>

            <button
              type="button"
              onClick={() => setShowConnectors(!showConnectors)}
              className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                showConnectors
                  ? "bg-slate-100 text-slate-800 border-slate-300"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
              title="Toggle Dependency Arrows"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Timeline Legend */}
      <div className="px-4 py-2 border-b border-slate-100 bg-white flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
        <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Legend:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-rose-500 inline-block shadow-2xs" />
          <span>Critical Path (0 Float)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-indigo-600 inline-block" />
          <span>Flexible / Standard Task</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-800 inline-block" />
          <span>Fixed Foundation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
          <span>Optional</span>
        </div>
        {viewMode === "comparison" && (
          <>
            <div className="flex items-center gap-1.5 text-purple-700">
              <span className="w-3 h-3 rounded bg-purple-500 inline-block" />
              <span>Shifted in Recovery</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-700">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              <span>Added Task</span>
            </div>
            <div className="flex items-center gap-1.5 text-rose-700">
              <span className="w-3 h-3 rounded border border-dashed border-rose-500 bg-rose-50 inline-block" />
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
            className="flex border-b border-slate-200 bg-slate-50/90 text-slate-600 font-mono text-[11px] sticky top-0 z-20"
            style={{ height: `${headerHeight}px` }}
          >
            {/* Task Name Column Header */}
            <div
              className="px-3 flex items-center font-semibold text-slate-700 border-r border-slate-200 shrink-0 bg-slate-50/95"
              style={{ width: `${labelWidth}px` }}
            >
              Task ID &amp; Name
            </div>

            {/* Time Axis Grid Header */}
            <div className="flex-1 relative">
              {timeTicks.map((tick) => (
                <div
                  key={tick}
                  className="absolute top-0 bottom-0 border-l border-slate-200/80 flex items-center pl-1 text-[10px]"
                  style={{ left: `${getPercent(tick)}%` }}
                >
                  <span className="text-slate-500">{tick}h</span>
                </div>
              ))}

              {/* Deadline line header mark */}
              {maxDeadlineHours !== undefined && (
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-500 z-30 flex items-center pl-1"
                  style={{ left: `${getPercent(maxDeadlineHours)}%` }}
                  title={`Project Deadline: ${maxDeadlineHours}h`}
                >
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1 rounded">
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
                  className="absolute top-0 bottom-0 border-l border-slate-100"
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
                  className={`flex items-center border-b border-slate-100 transition-colors ${
                    isSelected
                      ? "bg-blue-50/50"
                      : isHovered
                      ? "bg-slate-50/80"
                      : idx % 2 === 0
                      ? "bg-white"
                      : "bg-slate-50/30"
                  }`}
                  style={{ height: `${rowHeight}px` }}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                >
                  {/* Task Name / ID Sidebar Label */}
                  <div
                    className="px-3 flex items-center justify-between border-r border-slate-200 shrink-0 cursor-pointer h-full"
                    style={{ width: `${labelWidth}px` }}
                    onClick={() => handleTaskClick(task.id)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs font-bold text-slate-800 shrink-0">
                        {task.id}
                      </span>
                      <span className="text-xs font-medium text-slate-700 truncate" title={task.title}>
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
                          ? "ring-2 ring-blue-500 ring-offset-1 z-30"
                          : isHovered
                          ? "ring-1 ring-slate-400 z-20"
                          : "z-10"
                      }`}
                      style={{
                        left: `${barLeft}%`,
                        width: `${barWidth}%`,
                        minWidth: "24px",
                      }}
                      title={`${task.id}: ${task.title} (${task.durationHours}h) • Starts ${task.earliestStart}h, Finishes ${task.earliestFinish}h`}
                    >
                      <span className="truncate text-[11px] leading-tight font-semibold">
                        {task.durationHours}h
                      </span>

                      {task.isCritical && barWidth > 8 && (
                        <span className="text-[9px] bg-rose-700/60 px-1 py-0.2 rounded font-mono uppercase tracking-wider shrink-0 ml-1">
                          Crit
                        </span>
                      )}

                      {task.diffState === "modified_start" && barWidth > 8 && (
                        <span className="text-[9px] bg-purple-800/60 px-1 py-0.2 rounded shrink-0 ml-1">
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
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-700 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-100 text-blue-900 text-xs">
                {selectedTaskRecord.id}
              </span>
              <strong className="text-sm text-slate-900">{selectedTaskRecord.title}</strong>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-800 uppercase">
                {selectedTaskRecord.policy}
              </span>
              {selectedTaskRecord.isCritical && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-300">
                  Critical Path Task
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setInternalSelectedTaskId(null)}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
            >
              Close Inspector
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">Earliest Start &amp; Finish</span>
              <span className="text-xs font-bold text-slate-900">
                {selectedTaskRecord.earliestStart}h &rarr; {selectedTaskRecord.earliestFinish}h
              </span>
            </div>

            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">Duration &amp; Cost</span>
              <span className="text-xs font-bold text-slate-900">
                {selectedTaskRecord.durationHours} Hours &bull; ₹{selectedTaskRecord.cost.toLocaleString()}
              </span>
            </div>

            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">Critical Path Float</span>
              <span
                className={`text-xs font-bold ${
                  selectedTaskRecord.isCritical ? "text-rose-600" : "text-emerald-700"
                }`}
              >
                {selectedTaskRecord.criticalPathFloat}h Float
              </span>
            </div>

            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">Deadline Slack</span>
              <span className="text-xs font-bold text-slate-900">
                {selectedTaskRecord.deadlineSlack !== undefined
                  ? `${selectedTaskRecord.deadlineSlack}h Slack`
                  : "No Deadline Set"}
              </span>
            </div>
          </div>

          {/* Dependencies breakdown */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1 text-[11px]">
            <div className="flex-1">
              <span className="font-semibold text-slate-500">Blocking Predecessors:</span>{" "}
              {selectedTaskRecord.predecessorIds.length > 0 ? (
                selectedTaskRecord.predecessorIds.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleTaskClick(p)}
                    className="font-mono text-blue-700 hover:underline mr-1 font-semibold"
                  >
                    {p}
                  </button>
                ))
              ) : (
                <span className="text-slate-400 italic">None (Starts at Project Zero)</span>
              )}
            </div>

            <div className="flex-1">
              <span className="font-semibold text-slate-500">Direct Dependent Successors:</span>{" "}
              {selectedTaskRecord.successorIds.length > 0 ? (
                selectedTaskRecord.successorIds.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleTaskClick(s)}
                    className="font-mono text-blue-700 hover:underline mr-1 font-semibold"
                  >
                    {s}
                  </button>
                ))
              ) : (
                <span className="text-slate-400 italic">None (Terminal Task)</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
