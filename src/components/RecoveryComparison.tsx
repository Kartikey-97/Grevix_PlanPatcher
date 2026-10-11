"use client";

import React from "react";
import type { RunRecoveryResult } from "../lib/engine/run-recovery";
import type { RankedCandidateEntry } from "../lib/engine/rank-candidates";
import type { PreferenceProfileKey } from "../lib/schemas/ranking-policy.schema";
import { useTheme } from "../lib/theme-context";
import {
  Trophy,
  CheckCircle,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowUpDown,
  Coins,
  Clock,
  Layers,
  ChevronRight,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";

interface RecoveryComparisonProps {
  recoveryResult: RunRecoveryResult;
  selectedProfile: PreferenceProfileKey | string;
  onSelectProfile: (profile: PreferenceProfileKey) => void;
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
}

const PROFILE_DESCRIPTIONS: Record<
  string,
  { label: string; tag: string; weightsText: string }
> = {
  preserve_plan: {
    label: "Preserve the Plan",
    tag: "Minimal changes, low task loss",
    weightsText: "30% footprint, 25% value, 20% budget, 15% schedule, 10% uncertainty",
  },
  minimize_spending: {
    label: "Minimize Spending",
    tag: "Direct cost reduction priority",
    weightsText: "70% budget usage, 10% footprint, 10% value, 5% schedule, 5% uncertainty",
  },
  protect_deadline: {
    label: "Protect the Deadline",
    tag: "Tight schedule defense",
    weightsText: "50% schedule disruption, 15% footprint, 15% value, 10% budget, 10% uncertainty",
  },
};

export function RecoveryComparison({
  recoveryResult,
  selectedProfile,
  onSelectProfile,
  selectedCandidateId,
  onSelectCandidate,
}: RecoveryComparisonProps) {
  const { isLight, isDark } = useTheme();
  const currentRankings: RankedCandidateEntry[] =
    recoveryResult.rankings[selectedProfile] ?? recoveryResult.rankedCandidates;
  const currentWinner: RankedCandidateEntry | undefined =
    recoveryResult.winners[selectedProfile] ?? recoveryResult.winner;

  const paretoIds = new Set(recoveryResult.paretoFrontier.map((p) => p.candidateId));

  return (
    <section
      className={`rounded-xl border shadow-sm p-6 space-y-6 transition-colors ${
        isLight
          ? "bg-white border-slate-200/80 text-slate-900"
          : "bg-[#0d1322] border-slate-800 text-slate-100"
      }`}
    >
      {/* Header & Profile Switcher */}
      <div
        className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b transition-colors ${
          isLight ? "border-slate-100" : "border-slate-800"
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            <h3
              className={`text-lg font-bold tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              Recovery Candidate Rankings & Trade-offs
            </h3>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                isLight
                  ? "bg-slate-100 text-slate-700 border-slate-200"
                  : "bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              Deterministic Evaluation
            </span>
          </div>
          <p
            className={`text-xs mt-1 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Evaluated {recoveryResult.generatedCandidateCount} candidate(s) under effective
            constraints. Compare objective metrics and switch trade-off profiles.
          </p>
        </div>

        {/* Profile Buttons */}
        <div
          className={`flex flex-wrap items-center gap-1.5 p-1 rounded-lg border transition-colors ${
            isLight
              ? "bg-slate-100/80 border-slate-200/60"
              : "bg-[#131b2e] border-slate-700"
          }`}
        >
          {(["preserve_plan", "minimize_spending", "protect_deadline"] as PreferenceProfileKey[]).map(
            (pKey) => {
              const meta = PROFILE_DESCRIPTIONS[pKey];
              const isSelected = selectedProfile === pKey;
              return (
                <button
                  key={pKey}
                  type="button"
                  onClick={() => onSelectProfile(pKey)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    isSelected
                      ? isLight
                        ? "bg-white text-teal-800 shadow-sm border border-slate-200/80"
                        : "bg-teal-600 text-white shadow-sm"
                      : isLight
                      ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                      : "text-slate-400 hover:text-white hover:bg-[#1a253f]"
                  }`}
                  title={meta.weightsText}
                >
                  {meta.label}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Profile Weights Legend */}
      <div
        className={`text-[11px] flex items-center justify-between px-3.5 py-2 rounded-lg border transition-colors ${
          isLight
            ? "bg-slate-50/70 border-slate-200/50 text-slate-500"
            : "bg-[#111827] border-slate-800 text-slate-400"
        }`}
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-teal-500" />
          <span>
            Active Profile:{" "}
            <strong className={isLight ? "text-slate-800" : "text-slate-200"}>
              {PROFILE_DESCRIPTIONS[selectedProfile]?.label ?? selectedProfile}
            </strong>{" "}
            &mdash; {PROFILE_DESCRIPTIONS[selectedProfile]?.weightsText}
          </span>
        </div>
        <span className={isLight ? "text-slate-400 hidden sm:inline" : "text-slate-500 hidden sm:inline"}>
          Formula: J(P) = wE*E + wL*L + wC*C + wS*S + wR*R
        </span>
      </div>

      {/* Winner Spotlight Card */}
      {currentWinner ? (
        <div
          className={`rounded-xl border p-5 transition ${
            currentWinner.classification === "feasible"
              ? isLight
                ? "bg-emerald-50/40 border-emerald-200/80 shadow-sm"
                : "bg-[#0a1e19]/60 border-emerald-900/80 shadow-sm"
              : currentWinner.classification === "provisionally_feasible"
              ? isLight
                ? "bg-amber-50/40 border-amber-200/80 shadow-sm"
                : "bg-[#1f1906]/60 border-amber-900/80 shadow-sm"
              : isLight
              ? "bg-red-50/40 border-red-200/80 shadow-sm"
              : "bg-[#210c0e]/60 border-red-900/80 shadow-sm"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-black/5">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold ${
                  currentWinner.classification === "feasible"
                    ? isLight
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-emerald-950/80 text-emerald-300 border border-emerald-700"
                    : currentWinner.classification === "provisionally_feasible"
                    ? isLight
                      ? "bg-amber-100 text-amber-800"
                      : "bg-amber-950/80 text-amber-300 border border-amber-700"
                    : isLight
                    ? "bg-red-100 text-red-800"
                    : "bg-red-950/80 text-red-300 border border-red-700"
                }`}
              >
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                      isLight
                        ? "text-slate-600 bg-white/80 border-slate-200/60"
                        : "text-teal-400 bg-[#131b2e] border-slate-700"
                    }`}
                  >
                    {currentWinner.candidateId}
                  </span>
                  <h4
                    className={`text-base font-bold ${
                      isLight ? "text-slate-900" : "text-white"
                    }`}
                  >
                    {currentWinner.label}
                  </h4>
                </div>
                <div
                  className={`text-xs mt-0.5 ${
                    isLight ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  Recommended winner under &ldquo;
                  {PROFILE_DESCRIPTIONS[selectedProfile]?.label}&rdquo; profile
                </div>
              </div>
            </div>

            {/* Feasibility Badge */}
            <div className="flex flex-col sm:items-end gap-1">
              {currentWinner.classification === "feasible" ? (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    isLight
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  Feasible &bull; Hard Constraints Met
                </span>
              ) : currentWinner.classification === "provisionally_feasible" ? (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    isLight
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-amber-950/80 text-amber-300 border-amber-800"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Provisionally Feasible &bull; Unverified Facts
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    isLight
                      ? "bg-red-100 text-red-800 border-red-300"
                      : "bg-red-950/80 text-red-300 border-red-800"
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  Infeasible &bull; Hard Constraint Violation
                </span>
              )}
              <div
                className={`text-xs font-semibold ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}
              >
                Composite Score J(P):{" "}
                <span
                  className={`font-mono text-sm font-bold ${
                    isLight ? "text-indigo-700" : "text-teal-400"
                  }`}
                >
                  {currentWinner.score.toFixed(4)}
                </span>
                <span className={isLight ? "text-[10px] text-slate-500 ml-1 font-normal" : "text-[10px] text-slate-400 ml-1 font-normal"}>
                  (lower is better)
                </span>
              </div>
            </div>
          </div>

          {/* Provisional Facts Callout */}
          {currentWinner.unknownFactCount > 0 && (
            <div
              className={`mt-3.5 p-3 rounded-lg border text-xs flex items-start gap-2 ${
                isLight
                  ? "bg-amber-100/60 border-amber-300/70 text-amber-900"
                  : "bg-amber-950/50 border-amber-850/80 text-amber-200"
              }`}
            >
              <HelpCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">
                  Required Real-World Verifications ({currentWinner.unknownFactCount}):
                </strong>{" "}
                This candidate assumes external facts not verified in the fixture:
                <ul className="list-disc list-inside mt-1 space-y-0.5 font-mono text-[11px]">
                  {recoveryResult.evaluations
                    .find((e) => e.candidateId === currentWinner.candidateId)
                    ?.unknownFacts.map((fact, idx) => (
                      <li key={idx}>{fact}</li>
                    ))}
                </ul>
              </div>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white/70 border-slate-200/70"
                  : "bg-[#131b2e] border-slate-800"
              }`}
            >
              <div
                className={`text-[11px] font-semibold uppercase ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Task Changes
              </div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {currentWinner.changedTaskCount} task(s) modified
              </div>
            </div>

            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white/70 border-slate-200/70"
                  : "bg-[#131b2e] border-slate-800"
              }`}
            >
              <div
                className={`text-[11px] font-semibold uppercase ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Budget Usage C(P)
              </div>
              <div
                className={`text-sm font-bold mt-0.5 font-mono ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {currentWinner.metrics.budgetUsage_C !== null
                  ? `${(currentWinner.metrics.budgetUsage_C * 100).toFixed(1)}%`
                  : "N/A"}
              </div>
            </div>

            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white/70 border-slate-200/70"
                  : "bg-[#131b2e] border-slate-800"
              }`}
            >
              <div
                className={`text-[11px] font-semibold uppercase ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Schedule Disruption S(P)
              </div>
              <div
                className={`text-sm font-bold mt-0.5 font-mono ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {currentWinner.metrics.scheduleDisruption_S.toFixed(3)}
              </div>
            </div>

            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white/70 border-slate-200/70"
                  : "bg-[#131b2e] border-slate-800"
              }`}
            >
              <div
                className={`text-[11px] font-semibold uppercase ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Pareto Frontier
              </div>
              <div className="text-sm font-bold mt-0.5">
                {paretoIds.has(currentWinner.candidateId) ? (
                  <span className="text-teal-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-teal-400" /> Optimal (Non-dominated)
                  </span>
                ) : (
                  <span className={isLight ? "text-slate-500 font-medium" : "text-slate-400 font-medium"}>Dominated</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onSelectCandidate(currentWinner.candidateId)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition shadow-xs ${
                isLight
                  ? "text-teal-800 bg-white border-teal-200 hover:bg-teal-50"
                  : "text-teal-300 bg-[#131b2e] border-teal-800 hover:bg-[#1a253f]"
              }`}
            >
              <span>Inspect Candidate Diff</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Empty / Infeasible State */
        <div
          className={`rounded-xl border p-5 space-y-3 ${
            isLight
              ? "border-red-200 bg-red-50/60"
              : "border-red-900/80 bg-red-950/40"
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4
                className={`text-base font-bold ${
                  isLight ? "text-red-900" : "text-red-200"
                }`}
              >
                No Feasible Recovery Winner Found
              </h4>
              <p
                className={`text-sm ${
                  isLight ? "text-red-700" : "text-red-300"
                }`}
              >
                {recoveryResult.noWinnerReason ??
                  "All candidate patches violate one or more hard constraints under effective conditions."}
              </p>
            </div>
          </div>

          {recoveryResult.blockingIssues.length > 0 && (
            <div
              className={`rounded-lg p-3 border text-xs space-y-1 ${
                isLight
                  ? "bg-white/80 border-red-200/80 text-red-800"
                  : "bg-[#1b1114] border-red-900/60 text-red-200"
              }`}
            >
              <div className={`font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                Violations Identified:
              </div>
              <ul className="list-disc list-inside space-y-0.5 font-mono">
                {recoveryResult.blockingIssues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Candidate Score Breakdown Table */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div
            className={`text-sm font-bold ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            Candidate Evaluations & Pareto Frontier ({currentRankings.length})
          </div>
          <div className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Click any row to inspect task overrides and plan impact
          </div>
        </div>

        <div
          className={`border rounded-xl overflow-x-auto shadow-xs transition-colors ${
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
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Candidate</th>
                <th className="py-2.5 px-3">Feasibility</th>
                <th className="py-2.5 px-3 font-mono text-center" title="Change Footprint E(P)">
                  E
                </th>
                <th className="py-2.5 px-3 font-mono text-center" title="Lost Task Value L(P)">
                  L
                </th>
                <th className="py-2.5 px-3 font-mono text-center" title="Budget Usage C(P)">
                  C
                </th>
                <th className="py-2.5 px-3 font-mono text-center" title="Schedule Movement M(P)">
                  M
                </th>
                <th className="py-2.5 px-3 font-mono text-center" title="Deadline Pressure Q(P)">
                  Q
                </th>
                <th className="py-2.5 px-3 font-mono text-center" title="Schedule Disruption S(P)">
                  S
                </th>
                <th className="py-2.5 px-3 font-mono text-center" title="Uncertainty R(P)">
                  R
                </th>
                <th className="py-2.5 px-3 font-mono text-right" title="Composite Score J(P)">
                  J(P)
                </th>
                <th className="py-2.5 px-3 text-center">Pareto</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y transition-colors ${
                isLight ? "divide-slate-100" : "divide-slate-800/60"
              }`}
            >
              {currentRankings.map((c) => {
                const isSelected = selectedCandidateId === c.candidateId;
                const isWinner = currentWinner?.candidateId === c.candidateId;
                const isPareto = paretoIds.has(c.candidateId);

                return (
                  <tr
                    key={c.candidateId}
                    onClick={() => onSelectCandidate(c.candidateId)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? isLight
                          ? "bg-teal-50/60"
                          : "bg-teal-950/40"
                        : isWinner
                        ? isLight
                          ? "bg-emerald-50/30 hover:bg-emerald-50/60"
                          : "bg-[#0b1c17]/40 hover:bg-[#0f2820]/60"
                        : isLight
                        ? "hover:bg-slate-50/80"
                        : "hover:bg-[#151f33]"
                    }`}
                  >
                    <td
                      className={`py-2.5 px-3 font-mono font-bold ${
                        isLight ? "text-slate-800" : "text-white"
                      }`}
                    >
                      #{c.rank}
                    </td>

                    <td className="py-2.5 px-3">
                      <div
                        className={`font-semibold flex items-center gap-1.5 ${
                          isLight ? "text-slate-900" : "text-white"
                        }`}
                      >
                        <span className="font-mono text-teal-400">{c.candidateId}</span>
                        {isWinner && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              isLight
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                            }`}
                          >
                            Winner
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[11px] truncate max-w-xs ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {c.label}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      {c.classification === "feasible" ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                            isLight
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                          }`}
                        >
                          Feasible
                        </span>
                      ) : c.classification === "provisionally_feasible" ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                            isLight
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-amber-950/60 text-amber-300 border-amber-800"
                          }`}
                        >
                          Provisional ({c.unknownFactCount} facts)
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                            isLight
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-red-950/60 text-red-300 border-red-800"
                          }`}
                        >
                          Infeasible
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-center">
                      {c.metrics.changeFootprint_E.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center">
                      {c.metrics.lostTaskValue_L.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center">
                      {c.metrics.budgetUsage_C !== null
                        ? c.metrics.budgetUsage_C.toFixed(2)
                        : "—"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center">
                      {c.metrics.movement_M.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center">
                      {c.metrics.deadlinePressure_Q.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-3 font-mono text-center font-semibold ${
                        isLight ? "text-slate-800" : "text-white"
                      }`}
                    >
                      {c.metrics.scheduleDisruption_S.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center">
                      {c.metrics.uncertainty_R.toFixed(2)}
                    </td>

                    <td
                      className={`py-2.5 px-3 font-mono text-right font-bold ${
                        isLight ? "text-slate-900" : "text-teal-400"
                      }`}
                    >
                      {c.score.toFixed(4)}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {isPareto ? (
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            isLight
                              ? "bg-teal-50 text-teal-700 border-teal-200"
                              : "bg-teal-950/60 text-teal-300 border-teal-800"
                          }`}
                        >
                          Frontier
                        </span>
                      ) : (
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                            isLight ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          Dominated
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCandidate(c.candidateId);
                        }}
                        className={`text-[11px] font-semibold hover:underline ${
                          isLight
                            ? "text-teal-700 hover:text-teal-900"
                            : "text-teal-400 hover:text-teal-300"
                        }`}
                      >
                        Inspect Diff
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
