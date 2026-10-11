"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Zap,
  ArrowRight,
  Clock,
  Coins,
  AlertTriangle,
  Check,
} from "lucide-react";
import { SCENARIO_PRESETS_DATA } from "./design-lab-data";
import type { ScenarioImpactData } from "./types";

export function ConceptBInteractive() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>("s1-venue");
  const [selectedProfile, setSelectedProfile] = useState<
    "balanced" | "cost_first" | "quality_first"
  >("balanced");

  const currentScenario: ScenarioImpactData =
    SCENARIO_PRESETS_DATA.find((s) => s.id === activeScenarioId) ??
    SCENARIO_PRESETS_DATA[0];

  const activeCandidate =
    currentScenario.recoveryCandidates.find(
      (c) => c.profile === selectedProfile
    ) ?? currentScenario.recoveryCandidates[0];

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 selection:bg-indigo-500 selection:text-white pb-16">
      {/* Hero Section */}
      <div className="border-b border-slate-800/80 bg-gradient-to-b from-[#0f172a]/30 to-[#080c14] pb-12 pt-8 sm:pt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold tracking-wide text-indigo-400">
              <Zap className="h-3.5 w-3.5" />
              INTERACTIVE RECOVERY SIMULATOR
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              Deterministic recovery in real time.
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
              Select a disruption below to watch PlanPatch evaluate candidate patches and Pareto trade-offs.
            </p>
          </div>

          {/* Scenario Tabs */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {SCENARIO_PRESETS_DATA.map((scenario) => {
              const isSelected = scenario.id === activeScenarioId;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setActiveScenarioId(scenario.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-600/20 text-white shadow-sm ring-1 ring-indigo-400"
                      : "border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <AlertTriangle
                    className={`h-3.5 w-3.5 ${
                      isSelected ? "text-indigo-400" : "text-slate-500"
                    }`}
                  />
                  <span>{scenario.name}</span>
                </button>
              );
            })}
          </div>

          {/* Unified Simulator Card */}
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
            {/* Top Incident Summary */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                  Incident Injected
                </div>
                <div className="text-base font-bold text-white">
                  {currentScenario.triggerHeadline}
                </div>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Disrupted Node: <span className="text-rose-400 font-bold">{currentScenario.disruptedTaskId}</span>
              </div>
            </div>

            {/* Split Comparison */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left: Baseline Plan */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                    Baseline Plan
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono border ${
                      currentScenario.baseline.hardConstraintPass
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {currentScenario.baseline.hardConstraintPass ? "Feasible" : "Constraint Overrun"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Total Cost:</span>
                    <div className="font-mono text-base font-bold text-slate-200">
                      ₹{currentScenario.baseline.totalCost.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Finish:</span>
                    <div className="font-mono text-base font-bold text-slate-200">
                      {currentScenario.baseline.finishHours}h
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-400 border-t border-slate-800/60 pt-2.5">
                  {currentScenario.summary}
                </p>

                {/* Profile switch */}
                <div className="mt-4 border-t border-slate-800/60 pt-3">
                  <div className="text-[10px] font-mono uppercase text-slate-500">
                    Optimization Profile:
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {(["balanced", "cost_first", "quality_first"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSelectedProfile(p)}
                        className={`rounded px-2 py-1 text-[11px] font-semibold capitalize transition-all ${
                          selectedProfile === p
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-900 text-slate-400 hover:text-white"
                        }`}
                      >
                        {p.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Healed Candidate */}
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
                <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5">
                  <span className="text-xs font-mono font-bold text-indigo-400 uppercase">
                    Recovery Candidate
                  </span>
                  <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-300">
                    Pareto Winner
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className="text-sm font-bold text-white">
                    {activeCandidate.name}
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400">Projected Cost:</span>
                      <div className="font-mono text-base font-bold text-white">
                        ₹{activeCandidate.projectedCost.toLocaleString()}{" "}
                        <span
                          className={`text-xs ${
                            activeCandidate.costDelta <= 0
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          ({activeCandidate.costDelta > 0 ? "+" : ""}
                          ₹{activeCandidate.costDelta.toLocaleString()})
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400">Projected Finish:</span>
                      <div className="font-mono text-base font-bold text-white">
                        {activeCandidate.finishHours}h{" "}
                        <span className="text-xs text-slate-400">
                          ({activeCandidate.finishDelta > 0 ? "+" : ""}
                          {activeCandidate.finishDelta}h)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-300 leading-relaxed border-t border-indigo-500/20 pt-2.5">
                  {activeCandidate.tradeoffSummary}
                </p>

                <div className="mt-4 border-t border-indigo-500/20 pt-3 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-emerald-400">
                    ✓ Hard constraints verified
                  </span>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition-colors"
                  >
                    Open in Workspace
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
