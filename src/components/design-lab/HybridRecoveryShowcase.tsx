"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Coins,
  Check,
  Sun,
  Moon,
  Palette,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ExternalLink,
  Layers,
  Activity,
  FileCheck2,
  Calendar,
} from "lucide-react";
import {
  HYBRID_SCENARIOS_DATA,
  type HybridShowcaseScenario,
  type TimelineTaskItem,
} from "./hybrid-showcase-data";

export type ColorScheme = "indigo" | "teal" | "lime";
export type ThemeMode = "dark" | "light";

export interface HybridRecoveryShowcaseProps {
  initialScenarioId?: string;
  initialThemeMode?: ThemeMode;
  initialColorScheme?: ColorScheme;
  initialEvidenceExpanded?: boolean;
}

export function HybridRecoveryShowcase({
  initialScenarioId = "S1-venue-cancelled",
  initialThemeMode = "dark",
  initialColorScheme = "indigo",
  initialEvidenceExpanded = false,
}: HybridRecoveryShowcaseProps = {}) {
  const [activeScenarioId, setActiveScenarioId] = useState<string>(initialScenarioId);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState<boolean>(initialEvidenceExpanded);

  const scenario: HybridShowcaseScenario =
    HYBRID_SCENARIOS_DATA.find((s) => s.id === activeScenarioId) ??
    HYBRID_SCENARIOS_DATA[0];

  const isLight = themeMode === "light";

  // Palette styles mapping
  const schemeStyles = {
    indigo: {
      badgeBorder: isLight
        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
        : "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
      gradient: isLight
        ? "from-indigo-600 via-purple-600 to-indigo-800"
        : "from-indigo-400 via-purple-300 to-pink-300",
      btnPrimary: isLight
        ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25"
        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30",
      activePill: isLight
        ? "border-indigo-600 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-600 shadow-sm font-bold"
        : "border-indigo-500 bg-indigo-500/20 text-white ring-1 ring-indigo-400 shadow-lg shadow-indigo-950 font-bold",
      accentBg: isLight ? "bg-indigo-50/70 border-indigo-200 text-indigo-950" : "bg-indigo-950/20 border-indigo-500/30 text-indigo-200",
      accentTag: isLight ? "text-indigo-800" : "text-indigo-400",
      link: isLight ? "text-indigo-700 hover:text-indigo-800" : "text-indigo-400 hover:text-indigo-300",
      timelineHighlight: isLight ? "bg-indigo-600 text-white border-indigo-700" : "bg-indigo-500 text-white border-indigo-400",
    },
    teal: {
      badgeBorder: isLight
        ? "border-teal-200 bg-teal-50 text-teal-700"
        : "border-teal-500/30 bg-teal-500/10 text-teal-400",
      gradient: isLight
        ? "from-teal-600 via-emerald-600 to-cyan-700"
        : "from-teal-300 via-emerald-300 to-cyan-200",
      btnPrimary: isLight
        ? "bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/25"
        : "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-600/30",
      activePill: isLight
        ? "border-teal-600 bg-teal-50 text-teal-950 ring-2 ring-teal-600 shadow-sm font-bold"
        : "border-teal-500 bg-teal-500/20 text-white ring-1 ring-teal-400 shadow-lg shadow-teal-950 font-bold",
      accentBg: isLight ? "bg-teal-50/70 border-teal-200 text-teal-950" : "bg-teal-950/20 border-teal-500/30 text-teal-200",
      accentTag: isLight ? "text-teal-800" : "text-teal-400",
      link: isLight ? "text-teal-700 hover:text-teal-800" : "text-teal-400 hover:text-teal-300",
      timelineHighlight: isLight ? "bg-teal-600 text-white border-teal-700" : "bg-teal-500 text-white border-teal-400",
    },
    lime: {
      badgeBorder: isLight
        ? "border-lime-300 bg-lime-50 text-lime-800"
        : "border-lime-400/30 bg-lime-400/10 text-lime-400",
      gradient: isLight
        ? "from-emerald-600 via-teal-600 to-lime-700"
        : "from-lime-300 via-emerald-300 to-teal-200",
      btnPrimary: isLight
        ? "bg-lime-500 hover:bg-lime-600 text-slate-950 shadow-lime-500/20"
        : "bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-lime-400/20",
      activePill: isLight
        ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600 shadow-sm font-bold"
        : "border-lime-400 bg-lime-400/20 text-white ring-1 ring-lime-400 shadow-lg shadow-lime-950 font-bold",
      accentBg: isLight ? "bg-emerald-50/70 border-emerald-300 text-emerald-950" : "bg-emerald-950/20 border-emerald-500/30 text-emerald-200",
      accentTag: isLight ? "text-emerald-800" : "text-emerald-400",
      link: isLight ? "text-emerald-700 hover:text-emerald-800" : "text-lime-400 hover:text-lime-300",
      timelineHighlight: isLight ? "bg-emerald-600 text-white border-emerald-700" : "bg-emerald-500 text-white border-emerald-400",
    },
  }[colorScheme];

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isLight
          ? "bg-[#f8fafc] text-slate-900 selection:bg-indigo-600 selection:text-white"
          : "bg-[#080c14] text-slate-100 selection:bg-indigo-500 selection:text-white"
      }`}
    >
      {/* Top Preference Bar (Theme & Palette Switcher) */}
      <div
        className={`border-b px-4 py-2 text-xs transition-colors ${
          isLight
            ? "border-slate-200 bg-white/90 text-slate-600 backdrop-blur-md"
            : "border-slate-800/80 bg-[#0b101c]/90 text-slate-400 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">
              HYBRID RECOVERY SHOWCASE:
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-[11px]">
              Theme: <strong className={isLight ? "text-slate-900" : "text-white"}>{themeMode.toUpperCase()}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Color Palette Switcher */}
            <div className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-slate-500" />
              <div
                className={`flex rounded-lg border p-0.5 ${
                  isLight ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-950"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setColorScheme("indigo")}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                    colorScheme === "indigo"
                      ? isLight
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "bg-indigo-600 text-white"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Indigo (Modern)
                </button>
                <button
                  type="button"
                  onClick={() => setColorScheme("teal")}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                    colorScheme === "teal"
                      ? isLight
                        ? "bg-white text-teal-700 shadow-xs"
                        : "bg-teal-600 text-white"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Teal (Clean)
                </button>
                <button
                  type="button"
                  onClick={() => setColorScheme("lime")}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                    colorScheme === "lime"
                      ? isLight
                        ? "bg-white text-emerald-800 shadow-xs"
                        : "bg-lime-400 text-slate-950"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Lime (Punchy)
                </button>
              </div>
            </div>

            {/* Light / Dark Mode Toggle */}
            <div
              className={`flex rounded-lg border p-0.5 ${
                isLight ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-950"
              }`}
            >
              <button
                type="button"
                onClick={() => setThemeMode("light")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                  isLight
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sun className="h-3 w-3 text-amber-500" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setThemeMode("dark")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                  !isLight
                    ? "bg-slate-800 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Moon className="h-3 w-3 text-indigo-400" />
                Dark
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden pb-12 pt-8 sm:pt-14">
        {/* Subtle background glow */}
        <div
          className={`pointer-events-none absolute -top-40 left-1/2 h-[450px] w-[700px] -translate-x-1/2 rounded-full blur-3xl transition-opacity duration-500 ${
            isLight
              ? "bg-gradient-to-b from-indigo-200/40 via-slate-100/20 to-transparent opacity-60"
              : "bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent opacity-90"
          }`}
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Eyebrow */}
          <div className="text-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold tracking-wide transition-all ${schemeStyles.badgeBorder}`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              BEFORE & AFTER RECOVERY SHOWCASE
            </span>

            {/* Confident, Clean Headline */}
            <h1
              className={`mt-4 text-4xl font-extrabold tracking-tight sm:text-6xl sm:leading-[1.1] ${
                isLight ? "text-slate-950" : "text-white"
              }`}
            >
              Plans change.{" "}
              <span
                className={`bg-gradient-to-r ${schemeStyles.gradient} bg-clip-text text-transparent`}
              >
                Know what to change next.
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className={`mx-auto mt-3 max-w-2xl text-base leading-relaxed sm:text-lg ${
                isLight ? "text-slate-600" : "text-slate-300"
              }`}
            >
              When vendor cancellations, budget cuts, or schedule shifts hit, PlanPatch computes
              mathematically guaranteed, topologically sound recovery alternatives in seconds.
            </p>

            {/* Workspace CTA */}
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href={`/?scenario=${scenario.id}&candidate=${scenario.recovery.candidateId}`}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold shadow-md transition-all active:scale-[0.98] ${schemeStyles.btnPrimary}`}
              >
                <Sparkles className="h-4 w-4" />
                Open in Full Recovery Workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Section 5: Scenario Selector Tabs */}
          <div className="mt-10">
            <div
              role="tablist"
              aria-label="Disruption Scenarios"
              className="flex flex-wrap items-center justify-center gap-2"
            >
              {HYBRID_SCENARIOS_DATA.map((sc) => {
                const isSelected = sc.id === activeScenarioId;
                return (
                  <button
                    key={sc.id}
                    role="tab"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => setActiveScenarioId(sc.id)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                      isSelected
                        ? schemeStyles.activePill
                        : isLight
                        ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-xs"
                        : "border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-sm">{sc.icon}</span>
                    <span>{sc.tabLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Section 2: Balanced Two-Panel Before & After Comparison */}
            <div
              key={activeScenarioId}
              className={`animate-plan-fade mt-6 rounded-2xl border p-5 transition-all duration-300 sm:p-7 ${
                isLight
                  ? "border-slate-200 bg-white shadow-xl shadow-slate-200/60"
                  : "border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-xl"
              }`}
            >
              <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-11">
                {/* LEFT PANEL — BEFORE: The Disrupted Plan (5 cols) */}
                <div
                  className={`rounded-xl border p-5 lg:col-span-5 flex flex-col justify-between ${
                    isLight
                      ? "border-rose-200 bg-rose-50/30"
                      : "border-rose-500/25 bg-rose-950/15"
                  }`}
                >
                  <div>
                    {/* Header: Baseline Plan & Status */}
                    <div className="flex items-center justify-between border-b pb-3 border-rose-200/50">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-500">
                          Before: Disrupted Baseline
                        </span>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                          isLight
                            ? "bg-rose-200/80 text-rose-800"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        Constraint Violated
                      </span>
                    </div>

                    {/* Disruption Diagnostic Banner (Restrained coral treatment, not large empty box) */}
                    <div
                      className={`mt-4 rounded-lg border p-3 ${
                        isLight
                          ? "border-rose-300 bg-rose-100/60 text-slate-900"
                          : "border-rose-500/40 bg-rose-950/40 text-rose-200"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{scenario.disruption.violatedConstraintTitle}</span>
                      </div>
                      <p className={`mt-1 text-xs leading-relaxed ${isLight ? "text-slate-700" : "text-rose-100/90"}`}>
                        {scenario.disruption.description}
                      </p>
                      <div className="mt-2 font-mono text-[11px] font-semibold text-rose-500">
                        {scenario.disruption.violatedConstraintDetail}
                      </div>
                    </div>

                    {/* Baseline Metrics Grid */}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div
                        className={`rounded-lg border p-2.5 ${
                          isLight ? "border-slate-200 bg-white" : "border-slate-800/80 bg-slate-950/50"
                        }`}
                      >
                        <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                          Projected Cost
                        </span>
                        <div className={`font-mono text-base font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                          ₹{scenario.baseline.totalCost.toLocaleString()}
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">
                          Budget Cap: ₹{scenario.baseline.budgetLimit.toLocaleString()}
                        </span>
                      </div>

                      <div
                        className={`rounded-lg border p-2.5 ${
                          isLight ? "border-slate-200 bg-white" : "border-slate-800/80 bg-slate-950/50"
                        }`}
                      >
                        <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                          Earliest Finish
                        </span>
                        <div className={`font-mono text-base font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                          {scenario.baseline.finishHours}h
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">
                          Deadline: {scenario.baseline.deadlineHours}h ({scenario.baseline.slackHours > 0 ? "+" : ""}
                          {scenario.baseline.slackHours}h slack)
                        </span>
                      </div>
                    </div>

                    {/* Compact Schedule Strip (Requirement 2 & 3: Visual timeline showing what's affected) */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1.5">
                        <span>BASELINE SCHEDULE STRIP</span>
                        <span>0h → 132h</span>
                      </div>
                      <div className="space-y-1.5">
                        {scenario.baseline.timelineTasks.map((task) => {
                          let barColor = isLight ? "bg-slate-200 text-slate-700" : "bg-slate-800 text-slate-300";
                          if (task.status === "disrupted") {
                            barColor = isLight ? "bg-rose-500 text-white font-bold" : "bg-rose-600 text-white font-bold";
                          } else if (task.status === "affected") {
                            barColor = isLight ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-amber-950/40 text-amber-300 border border-amber-500/30";
                          }
                          return (
                            <div key={task.id} className="flex items-center gap-2 text-[11px] font-mono">
                              <span className="w-16 shrink-0 truncate text-slate-400 text-[10px]">{task.id}</span>
                              <div
                                className={`flex-1 rounded px-2 py-0.5 text-[10px] truncate flex items-center justify-between ${barColor}`}
                              >
                                <span>{task.title}</span>
                                <span>{task.start}h–{task.finish}h</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className={`mt-4 border-t pt-2.5 text-[11px] font-mono text-rose-500 ${isLight ? "border-rose-200/50" : "border-rose-500/20"}`}>
                    Diagnostic: {scenario.baseline.brokenReason}
                  </div>
                </div>

                {/* CENTER TRANSITION INDICATOR (1 col) */}
                <div className="flex flex-col items-center justify-center lg:col-span-1 py-2 lg:py-0">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-md transition-transform duration-300 hover:scale-105 ${
                      isLight
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-indigo-500/40 bg-indigo-950/50 text-indigo-300"
                    }`}
                  >
                    <ArrowRight className="h-5 w-5" />
                  </div>
                  <span className="mt-1 text-[9px] font-mono uppercase tracking-widest text-slate-500 text-center hidden lg:block">
                    Pareto Search
                  </span>
                </div>

                {/* RIGHT PANEL — AFTER: The Proposed Recovery (5 cols) - Visual Focal Point */}
                <div
                  className={`rounded-xl border p-5 lg:col-span-5 flex flex-col justify-between shadow-lg ${
                    isLight
                      ? "border-slate-200 bg-slate-50/80"
                      : "border-slate-800 bg-slate-950/70"
                  }`}
                >
                  <div>
                    {/* Item 1: Recovery Status (Feasibility, Pareto, and Real-world Verification separated!) */}
                    <div className="flex flex-wrap items-center gap-1.5 border-b pb-3 border-slate-200/60 dark:border-slate-800">
                      {/* Feasibility Tag */}
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          scenario.recovery.feasibilityStatus === "feasible"
                            ? isLight
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                        }`}
                      >
                        ✓ {scenario.recovery.feasibilityLabel}
                      </span>

                      {/* Pareto Status Tag */}
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          isLight
                            ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                        }`}
                      >
                        ★ {scenario.recovery.paretoLabel}
                      </span>

                      {/* Real-world Verification Tag */}
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          scenario.recovery.verificationStatus === "verified"
                            ? "bg-emerald-100 text-emerald-800"
                            : isLight
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        }`}
                      >
                        ⏱ {scenario.recovery.verificationLabel}
                      </span>
                    </div>

                    {/* Item 2: Recommended Action (Clear, prominent title) */}
                    <div className="mt-3.5">
                      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                        RECOMMENDED ACTION
                      </div>
                      <h3
                        className={`mt-0.5 text-xl font-extrabold sm:text-2xl ${
                          isLight ? "text-slate-950" : "text-white"
                        }`}
                      >
                        {scenario.recovery.recommendedAction}
                      </h3>
                    </div>

                    {/* Item 3: Reason (Crisp 1-2 sentence trade-off explanation) */}
                    <p
                      className={`mt-2 text-xs leading-relaxed font-medium ${
                        isLight ? "text-slate-700" : "text-slate-300"
                      }`}
                    >
                      {scenario.recovery.reason}
                    </p>

                    {/* Item 4: Key Outcomes (At most 3 prominent metrics) */}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {scenario.recovery.keyMetrics.map((km, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg border p-2 text-center ${
                            isLight
                              ? "border-slate-200 bg-white"
                              : "border-slate-800/80 bg-slate-900/60"
                          }`}
                        >
                          <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                            {km.label}
                          </span>
                          <div className={`font-mono text-sm font-bold ${isLight ? "text-slate-950" : "text-white"}`}>
                            {km.value}
                          </div>
                          <div
                            className={`font-mono text-[10px] font-semibold ${
                              km.deltaType === "positive"
                                ? "text-emerald-500"
                                : km.deltaType === "negative"
                                ? "text-amber-500"
                                : "text-slate-400"
                            }`}
                          >
                            {km.deltaText}
                          </div>
                          <div className="text-[9px] text-slate-400 line-clamp-1 mt-0.5">
                            {km.subtext}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Item 5: Compact Recovery Timeline (Relative changes to baseline) */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1.5">
                        <span>RECOVERY SCHEDULE STRIP</span>
                        <span className="text-emerald-500 font-bold">
                          {`Finish: ${scenario.recovery.newFinishHours}h (${scenario.recovery.finishDeltaHours > 0 ? "+" : ""}${scenario.recovery.finishDeltaHours}h)`}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {scenario.recovery.recoveryTimelineTasks.map((task) => {
                          let barColor = isLight ? "bg-slate-200 text-slate-700" : "bg-slate-800 text-slate-300";
                          if (task.status === "modified") {
                            barColor = schemeStyles.timelineHighlight;
                          } else if (task.status === "compressed") {
                            barColor = isLight ? "bg-emerald-600 text-white font-bold" : "bg-emerald-500 text-white font-bold";
                          } else if (task.status === "shifted") {
                            barColor = isLight ? "bg-indigo-100 text-indigo-900 border border-indigo-300" : "bg-indigo-950/50 text-indigo-300 border border-indigo-500/30";
                          }
                          return (
                            <div key={task.id} className="flex items-center gap-2 text-[11px] font-mono">
                              <span className="w-16 shrink-0 truncate text-slate-400 text-[10px]">{task.id}</span>
                              <div
                                className={`flex-1 rounded px-2 py-0.5 text-[10px] truncate flex items-center justify-between ${barColor}`}
                              >
                                <span>{task.title}</span>
                                <span>{task.start}h–{task.finish}h</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Data-Driven Distinct Outcomes (NOT generic repetitive pills) */}
                  <div className={`mt-4 border-t pt-3 ${isLight ? "border-slate-200" : "border-slate-800"}`}>
                    <div className="flex flex-wrap gap-1.5">
                      {scenario.recovery.distinctOutcomes.map((outcome, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${
                            isLight
                              ? "border-slate-200 bg-white text-slate-700"
                              : "border-slate-800 bg-slate-900 text-slate-300"
                          }`}
                        >
                          <CheckCheck className="h-3 w-3 text-emerald-500 shrink-0" />
                          {outcome}
                        </span>
                      ))}
                    </div>

                    {/* Section 7: Progressive Disclosure ("Why this recommendation?") */}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setIsEvidenceExpanded(!isEvidenceExpanded)}
                        className={`flex w-full items-center justify-between rounded-lg border p-2 text-xs font-semibold transition-colors ${
                          isLight
                            ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            : "border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-indigo-500" />
                          Why this recommendation? (Detailed Engine Evidence)
                        </span>
                        {isEvidenceExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>

                      {isEvidenceExpanded && (
                        <div
                          className={`mt-2 rounded-lg border p-3 text-xs space-y-3 ${
                            isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-slate-900/90"
                          }`}
                        >
                          {/* Objective Scores */}
                          <div>
                            <div className="font-mono text-[10px] uppercase font-bold text-slate-500">
                              Objective Scores & Ranking Rationale:
                            </div>
                            <div className="mt-1 grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                              {scenario.recovery.detailedEvidence.objectiveScores.map((sc, i) => (
                                <div
                                  key={i}
                                  className={`rounded p-1.5 border ${
                                    sc.isWinner
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold"
                                      : "border-slate-700 bg-slate-800/40 text-slate-400"
                                  }`}
                                >
                                  <div className="text-[9px] truncate">{sc.profileName}</div>
                                  <div className="text-xs">{sc.score.toFixed(4)}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Verification Requirement Checklist */}
                          <div>
                            <div className="font-mono text-[10px] uppercase font-bold text-amber-500">
                              Real-World Verification Requirements:
                            </div>
                            <ul className="mt-1 space-y-1 text-[11px] text-slate-400">
                              {scenario.recovery.detailedEvidence.unverifiedFactsDetail.map((uf, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                  <span>{uf}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Task Diff List */}
                          <div>
                            <div className="font-mono text-[10px] uppercase font-bold text-slate-500">
                              Task-Level Mutations Diff:
                            </div>
                            <div className="mt-1 space-y-1 font-mono text-[10px]">
                              {scenario.recovery.detailedEvidence.taskDiffs.map((td, i) => (
                                <div
                                  key={i}
                                  className="flex items-start justify-between rounded bg-slate-800/40 p-1.5 border border-slate-700/50"
                                >
                                  <div>
                                    <strong className="text-slate-200">{td.taskId}</strong> ({td.title})
                                    <p className="text-[10px] text-slate-400 mt-0.5">{td.description}</p>
                                  </div>
                                  <span className="capitalize text-indigo-400 shrink-0 ml-2">
                                    {td.action}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom CTA to Full Workspace */}
                    <div className="mt-4 flex items-center justify-between border-t pt-3 border-slate-200/60 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 font-mono">
                        {`Candidate: ${scenario.recovery.candidateId}`}
                      </span>
                      <Link
                        href={`/?scenario=${scenario.id}&candidate=${scenario.recovery.candidateId}`}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${schemeStyles.link}`}
                      >
                        Apply in Full Workspace
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 Steps Process */}
          <div
            className={`mt-16 border-t pt-12 ${
              isLight ? "border-slate-200" : "border-slate-800/80"
            }`}
          >
            <div className="text-center">
              <h2
                className={`text-xs font-mono font-bold tracking-widest uppercase ${
                  isLight ? "text-indigo-600" : "text-indigo-400"
                }`}
              >
                THE RECOVERY PROCESS
              </h2>
              <p
                className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${
                  isLight ? "text-slate-950" : "text-white"
                }`}
              >
                Three steps from disruption to resolution
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div
                className={`rounded-xl border p-5 transition-all ${
                  isLight
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-slate-800/80 bg-slate-900/40"
                }`}
              >
                <div className={`font-mono text-xs font-bold ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                  STEP 01
                </div>
                <h3 className={`mt-1.5 text-base font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  Ingest Disruption
                </h3>
                <p className={`mt-1.5 text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  Map cancellations, budget reductions, or compressed deadlines directly to task nodes without fabricated details.
                </p>
              </div>

              <div
                className={`rounded-xl border p-5 transition-all ${
                  isLight
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-slate-800/80 bg-slate-900/40"
                }`}
              >
                <div className={`font-mono text-xs font-bold ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                  STEP 02
                </div>
                <h3 className={`mt-1.5 text-base font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  Explore Pareto Frontier
                </h3>
                <p className={`mt-1.5 text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  Eliminate non-compliant candidates and identify non-dominated alternatives balancing cost, slack, and schedule stability.
                </p>
              </div>

              <div
                className={`rounded-xl border p-5 transition-all ${
                  isLight
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-slate-800/80 bg-slate-900/40"
                }`}
              >
                <div className={`font-mono text-xs font-bold ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                  STEP 03
                </div>
                <h3 className={`mt-1.5 text-base font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                  Apply Verified Patch
                </h3>
                <p className={`mt-1.5 text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  Reconcile dependency edges and start times atomically. Distinguish verified facts from provisional requirements before locking.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
