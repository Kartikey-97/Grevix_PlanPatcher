"use client";

import React from "react";
import type { RunRecoveryResult } from "../lib/engine/run-recovery";
import type { RankedCandidateEntry } from "../lib/engine/rank-candidates";
import type { PreferenceProfileKey } from "../lib/schemas/ranking-policy.schema";
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
  const currentRankings: RankedCandidateEntry[] =
    recoveryResult.rankings[selectedProfile] ?? recoveryResult.rankedCandidates;
  const currentWinner: RankedCandidateEntry | undefined =
    recoveryResult.winners[selectedProfile] ?? recoveryResult.winner;

  const paretoIds = new Set(recoveryResult.paretoFrontier.map((p) => p.candidateId));

  return (
    <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      {/* Header & Profile Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              Recovery Candidate Rankings & Trade-offs
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              Deterministic Evaluation
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Evaluated {recoveryResult.generatedCandidateCount} candidate(s) under effective
            constraints. Compare objective metrics and switch trade-off profiles.
          </p>
        </div>

        {/* Profile Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-lg border border-slate-200/60">
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
                      ? "bg-white text-indigo-700 shadow-sm border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
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
      <div className="text-[11px] text-slate-500 flex items-center justify-between bg-slate-50/70 px-3.5 py-2 rounded-lg border border-slate-200/50">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
          <span>
            Active Profile:{" "}
            <strong className="text-slate-800">
              {PROFILE_DESCRIPTIONS[selectedProfile]?.label ?? selectedProfile}
            </strong>{" "}
            &mdash; {PROFILE_DESCRIPTIONS[selectedProfile]?.weightsText}
          </span>
        </div>
        <span className="text-slate-400 hidden sm:inline">
          Formula: J(P) = wE*E + wL*L + wC*C + wS*S + wR*R
        </span>
      </div>

      {/* Winner Spotlight Card */}
      {currentWinner ? (
        <div
          className={`rounded-xl border p-5 transition ${
            currentWinner.classification === "feasible"
              ? "bg-emerald-50/40 border-emerald-200/80 shadow-sm"
              : currentWinner.classification === "provisionally_feasible"
              ? "bg-amber-50/40 border-amber-200/80 shadow-sm"
              : "bg-red-50/40 border-red-200/80 shadow-sm"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-black/5">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold ${
                  currentWinner.classification === "feasible"
                    ? "bg-emerald-100 text-emerald-800"
                    : currentWinner.classification === "provisionally_feasible"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-600 bg-white/80 px-2 py-0.5 rounded border border-slate-200/60">
                    {currentWinner.candidateId}
                  </span>
                  <h4 className="text-base font-bold text-slate-900">
                    {currentWinner.label}
                  </h4>
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Recommended winner under &ldquo;
                  {PROFILE_DESCRIPTIONS[selectedProfile]?.label}&rdquo; profile
                </div>
              </div>
            </div>

            {/* Feasibility Badge */}
            <div className="flex flex-col sm:items-end gap-1">
              {currentWinner.classification === "feasible" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  Feasible &bull; Hard Constraints Met
                </span>
              ) : currentWinner.classification === "provisionally_feasible" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Provisionally Feasible &bull; Unverified Facts
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                  Infeasible &bull; Hard Constraint Violation
                </span>
              )}
              <div className="text-xs font-semibold text-slate-700">
                Composite Score J(P):{" "}
                <span className="font-mono text-indigo-700 text-sm">
                  {currentWinner.score.toFixed(4)}
                </span>
                <span className="text-[10px] text-slate-500 ml-1 font-normal">
                  (lower is better)
                </span>
              </div>
            </div>
          </div>

          {/* Provisional Facts Callout */}
          {currentWinner.unknownFactCount > 0 && (
            <div className="mt-3.5 p-3 rounded-lg bg-amber-100/60 border border-amber-300/70 text-xs text-amber-900 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">
                  Required Real-World Verifications ({currentWinner.unknownFactCount}):
                </strong>{" "}
                This candidate assumes external facts not verified in the fixture:
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-800 font-mono text-[11px]">
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
            <div className="p-2.5 bg-white/70 rounded-lg border border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Task Changes
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {currentWinner.changedTaskCount} task(s) modified
              </div>
            </div>

            <div className="p-2.5 bg-white/70 rounded-lg border border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Budget Usage C(P)
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                {currentWinner.metrics.budgetUsage_C !== null
                  ? `${(currentWinner.metrics.budgetUsage_C * 100).toFixed(1)}%`
                  : "N/A"}
              </div>
            </div>

            <div className="p-2.5 bg-white/70 rounded-lg border border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Schedule Disruption S(P)
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                {currentWinner.metrics.scheduleDisruption_S.toFixed(3)}
              </div>
            </div>

            <div className="p-2.5 bg-white/70 rounded-lg border border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Pareto Frontier
              </div>
              <div className="text-sm font-bold mt-0.5">
                {paretoIds.has(currentWinner.candidateId) ? (
                  <span className="text-indigo-700 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Optimal (Non-dominated)
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium">Dominated</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onSelectCandidate(currentWinner.candidateId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition shadow-xs"
            >
              <span>Inspect Candidate Diff</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Empty / Infeasible State */
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-base font-bold text-red-900">
                No Feasible Recovery Winner Found
              </h4>
              <p className="text-sm text-red-700">
                {recoveryResult.noWinnerReason ??
                  "All candidate patches violate one or more hard constraints under effective conditions."}
              </p>
            </div>
          </div>

          {recoveryResult.blockingIssues.length > 0 && (
            <div className="bg-white/80 rounded-lg p-3 border border-red-200/80 text-xs text-red-800 space-y-1">
              <div className="font-semibold text-slate-700">Violations Identified:</div>
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
          <div className="text-sm font-bold text-slate-900">
            Candidate Evaluations & Pareto Frontier ({currentRankings.length})
          </div>
          <div className="text-xs text-slate-500">
            Click any row to inspect task overrides and plan impact
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100">
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
                        ? "bg-indigo-50/60"
                        : isWinner
                        ? "bg-emerald-50/30 hover:bg-emerald-50/60"
                        : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      #{c.rank}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span className="font-mono text-indigo-700">{c.candidateId}</span>
                        {isWinner && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Winner
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">
                        {c.label}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      {c.classification === "feasible" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Feasible
                        </span>
                      ) : c.classification === "provisionally_feasible" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Provisional ({c.unknownFactCount} facts)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
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
                    <td className="py-2.5 px-3 font-mono text-center font-semibold text-slate-800">
                      {c.metrics.scheduleDisruption_S.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center">
                      {c.metrics.uncertainty_R.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-right font-bold text-slate-900">
                      {c.score.toFixed(4)}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {isPareto ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Frontier
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-slate-400">
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
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
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
