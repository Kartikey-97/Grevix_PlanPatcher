"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Terminal,
  Activity,
  Layers,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  Sliders,
  CheckCircle2,
  Clock,
  Coins,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  Maximize2,
  Command,
} from "lucide-react";
import { DAG_NODES_DATA, SCENARIO_PRESETS_DATA } from "./design-lab-data";
import type { DAGTaskNode } from "./types";

export function ConceptCTechnical() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("T03");
  const [activeScenarioKey, setActiveScenarioKey] = useState<string | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState<boolean>(false);

  // Selected node object
  const selectedNode =
    DAG_NODES_DATA.find((n) => n.id === selectedNodeId) ?? DAG_NODES_DATA[2];

  // Upstream prerequisites (nodes that must finish before this node)
  const upstreamPrereqIds = selectedNode.predecessors;

  // Downstream dependents (nodes waiting on this node)
  const downstreamDependentIds = selectedNode.successors;

  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "1") {
        setActiveScenarioKey("s1-venue");
        setSelectedNodeId("T03");
      } else if (e.key === "2") {
        setActiveScenarioKey("s2-budget");
        setSelectedNodeId("T08");
      } else if (e.key === "3") {
        setActiveScenarioKey("s3-deadline");
        setSelectedNodeId("T05");
      } else if (e.key === "Escape") {
        setActiveScenarioKey(null);
        setSelectedNodeId("T03");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#06090e] text-slate-200 font-sans selection:bg-sky-500 selection:text-black">
      {/* Top Operations Telemetry Ticker */}
      <div className="border-b border-slate-800 bg-[#090d16] px-4 py-2.5 text-xs font-mono">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded bg-sky-500/10 px-2 py-0.5 font-bold text-sky-400 border border-sky-500/20">
              <Terminal className="h-3.5 w-3.5" />
              OPS-ROOM V2
            </span>
            <span className="text-slate-400">PLAN: CAMPUS-TECH-FEST-01</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SYSTEM OPERATIONAL
            </span>
          </div>

          {/* Real-time Telemetry Metrics */}
          <div className="flex flex-wrap items-center gap-6 text-slate-300">
            <div>
              <span className="text-slate-500">HEALTH: </span>
              <span className="font-bold text-emerald-400">94.2%</span>
            </div>
            <div>
              <span className="text-slate-500">CRITICAL FLOAT: </span>
              <span className="font-bold text-rose-400">0.0h</span>
            </div>
            <div>
              <span className="text-slate-500">BUDGET UTILIZATION: </span>
              <span className="font-bold text-slate-100">72.0% (₹18k/₹25k)</span>
            </div>
            <div>
              <span className="text-slate-500">SLACK: </span>
              <span className="font-bold text-sky-400">+156.0h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Console: Split Screen */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Sub-header with hotkey pill hints */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-sky-400" />
              PlanPatch Dependency Operations Console
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Topological DAG explorer · Zero-float critical path tracking · Hotkey scenario injection
            </p>
          </div>

          {/* Keyboard Shortcut Hints */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500">SHORTCUTS:</span>
            <button
              type="button"
              onClick={() => {
                setActiveScenarioKey("s1-venue");
                setSelectedNodeId("T03");
              }}
              className={`rounded border px-2 py-1 transition-colors ${
                activeScenarioKey === "s1-venue"
                  ? "border-sky-400 bg-sky-950 text-sky-300"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              <kbd className="font-bold text-white">[1]</kbd> Venue
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveScenarioKey("s2-budget");
                setSelectedNodeId("T08");
              }}
              className={`rounded border px-2 py-1 transition-colors ${
                activeScenarioKey === "s2-budget"
                  ? "border-sky-400 bg-sky-950 text-sky-300"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              <kbd className="font-bold text-white">[2]</kbd> Budget
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveScenarioKey("s3-deadline");
                setSelectedNodeId("T05");
              }}
              className={`rounded border px-2 py-1 transition-colors ${
                activeScenarioKey === "s3-deadline"
                  ? "border-sky-400 bg-sky-950 text-sky-300"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              <kbd className="font-bold text-white">[3]</kbd> Deadline
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveScenarioKey(null);
                setSelectedNodeId("T03");
              }}
              className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-slate-400 hover:text-slate-200"
            >
              <kbd className="font-bold text-white">[Esc]</kbd> Reset
            </button>
          </div>
        </div>

        {/* Console Workspace: 65% DAG on Left / 35% Inspector on Right */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column (65%): Interactive DAG Graph */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0e17] p-5 shadow-2xl lg:col-span-8 flex flex-col justify-between">
            <div>
              {/* DAG Top Controls */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
                    Directed Acyclic Dependency Graph (16 Tasks)
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                    TOPOLOGICAL ORDER 1-16
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCriticalOnly(!showCriticalOnly)}
                    className={`rounded px-2 py-1 text-xs font-mono transition-colors border ${
                      showCriticalOnly
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                        : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                    }`}
                  >
                    {showCriticalOnly ? "SHOW ALL" : "CRITICAL PATH ONLY"}
                  </button>
                </div>
              </div>

              {/* Legend Strip */}
              <div className="my-3 flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-rose-500 bg-rose-500/20" />
                  <span>Critical Path (0h Float)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-sky-400 bg-sky-400/20" />
                  <span>Upstream Prereq</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-amber-400 bg-amber-400/20" />
                  <span>Downstream Dependent</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-slate-600 bg-slate-800" />
                  <span>Parallel Slack Node</span>
                </div>
              </div>

              {/* Node Grid Layout */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {DAG_NODES_DATA.map((node) => {
                  const isSelected = node.id === selectedNodeId;
                  const isUpstream = upstreamPrereqIds.includes(node.id);
                  const isDownstream = downstreamDependentIds.includes(node.id);
                  const isDisruptedNode =
                    activeScenarioKey &&
                    SCENARIO_PRESETS_DATA.find((s) => s.id === activeScenarioKey)
                      ?.disruptedTaskId === node.id;

                  if (showCriticalOnly && !node.isCritical) {
                    return null;
                  }

                  let borderClass = "border-slate-800/80 bg-slate-900/60 text-slate-400";
                  if (isSelected) {
                    borderClass =
                      "border-sky-400 bg-sky-950/40 text-white ring-2 ring-sky-400/30 shadow-lg shadow-sky-950";
                  } else if (isDisruptedNode) {
                    borderClass =
                      "border-rose-500 bg-rose-950/30 text-rose-300 ring-2 ring-rose-500/40 animate-pulse";
                  } else if (isUpstream) {
                    borderClass =
                      "border-sky-500/50 bg-sky-950/20 text-sky-200 ring-1 ring-sky-500/30";
                  } else if (isDownstream) {
                    borderClass =
                      "border-amber-500/50 bg-amber-950/20 text-amber-200 ring-1 ring-amber-500/30";
                  } else if (node.isCritical) {
                    borderClass =
                      "border-rose-500/40 bg-slate-900/90 text-slate-200";
                  }

                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all hover:border-slate-600 hover:bg-slate-800/80 ${borderClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-white">
                          {node.id}
                        </span>
                        {node.isCritical && (
                          <span className="rounded bg-rose-500/10 px-1 py-0.2 font-mono text-[9px] font-bold text-rose-400 border border-rose-500/20">
                            CP
                          </span>
                        )}
                        {isDisruptedNode && (
                          <span className="rounded bg-rose-500 px-1 py-0.2 font-mono text-[9px] font-bold text-white">
                            FAIL
                          </span>
                        )}
                      </div>

                      <div className="my-2 line-clamp-2 text-xs font-medium">
                        {node.title}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-800/60 pt-1.5 font-mono text-[10px] text-slate-500">
                        <span>{node.durationHours}h</span>
                        <span>₹{node.cost.toLocaleString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom DAG Status Bar */}
            <div className="mt-6 flex flex-wrap items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/70 p-3 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-sky-400" />
                <span>
                  SELECTED: <strong className="text-white">{selectedNode.id}</strong> ·{" "}
                  {selectedNode.title}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span>PREREQS: {upstreamPrereqIds.length || "0 (ROOT)"}</span>
                <span>DEPENDENTS: {downstreamDependentIds.length || "0 (LEAF)"}</span>
              </div>
            </div>
          </div>

          {/* Right Column (35%): Task Inspector & Disruption Injector */}
          <div className="space-y-6 lg:col-span-4">
            {/* Task Telemetry Inspector Card */}
            <div className="rounded-xl border border-slate-800 bg-[#0a0e17] p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-sky-400">
                    TASK TELEMETRY INSPECTOR
                  </span>
                </div>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-white">
                  {selectedNode.id}
                </span>
              </div>

              {/* Node Title and Policy */}
              <div className="mt-4">
                <h3 className="text-base font-bold text-white">
                  {selectedNode.title}
                </h3>
                <div className="mt-1 flex items-center gap-2 font-mono text-xs text-slate-400">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 capitalize">
                    {selectedNode.policy}
                  </span>
                  <span>Category: {selectedNode.category}</span>
                </div>
              </div>

              {/* Detailed Metrics Table */}
              <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-3 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Earliest Window:</span>
                  <span className="text-slate-200">
                    {selectedNode.earliestStart}h → {selectedNode.earliestFinish}h
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Duration:</span>
                  <span className="text-slate-200">{selectedNode.durationHours} hours</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Unit Cost:</span>
                  <span className="text-slate-200">₹{selectedNode.cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Critical Path:</span>
                  <span
                    className={
                      selectedNode.isCritical
                        ? "font-bold text-rose-400"
                        : "text-slate-400"
                    }
                  >
                    {selectedNode.isCritical ? "YES (Float = 0h)" : "NO (Has Slack)"}
                  </span>
                </div>
              </div>

              {/* Prerequisites and Dependents List */}
              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-[10px] font-mono uppercase text-sky-400 font-bold">
                    Direct Predecessors ({upstreamPrereqIds.length}):
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {upstreamPrereqIds.length === 0 ? (
                      <span className="text-xs text-slate-500 font-mono">
                        None (Root task)
                      </span>
                    ) : (
                      upstreamPrereqIds.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSelectedNodeId(p)}
                          className="rounded bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 font-mono text-xs text-sky-300 hover:bg-sky-900/60"
                        >
                          {p}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                    Direct Dependents ({downstreamDependentIds.length}):
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {downstreamDependentIds.length === 0 ? (
                      <span className="text-xs text-slate-500 font-mono">
                        None (Leaf milestone)
                      </span>
                    ) : (
                      downstreamDependentIds.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSelectedNodeId(s)}
                          className="rounded bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 font-mono text-xs text-amber-300 hover:bg-amber-900/60"
                        >
                          {s}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Disruption Injector Widget */}
            <div className="rounded-xl border border-slate-800 bg-[#0a0e17] p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-400">
                  DISRUPTION INJECTION MATRIX
                </span>
                <span className="text-xs text-slate-500 font-mono">HOTKEYS 1-3</span>
              </div>

              <div className="mt-4 space-y-2">
                {SCENARIO_PRESETS_DATA.map((sc, i) => {
                  const isActive = activeScenarioKey === sc.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => {
                        setActiveScenarioKey(sc.id);
                        setSelectedNodeId(sc.disruptedTaskId);
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        isActive
                          ? "border-rose-500 bg-rose-950/30 text-white ring-1 ring-rose-500"
                          : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span>
                          [{i + 1}] {sc.name}
                        </span>
                        <span className="text-rose-400">{sc.disruptedTaskId}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">
                        {sc.triggerHeadline}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Workspace Action CTA */}
              <div className="mt-5 border-t border-slate-800/80 pt-4">
                <Link
                  href="/"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-sky-500/20 hover:bg-sky-400 transition-colors"
                >
                  Open Full PlanPatch Workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
