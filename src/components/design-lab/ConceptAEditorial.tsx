"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Zap,
  Sun,
  Moon,
  GitBranch,
} from "lucide-react";

import { useTheme } from "../../lib/theme-context";

export interface ConceptAEditorialProps {
  initialDisrupted?: boolean;
  initialTheme?: "dark" | "light";
  showNav?: boolean;
}

export function ConceptAEditorial({
  initialDisrupted = false,
  initialTheme,
  showNav = true,
}: ConceptAEditorialProps = {}) {
  const { theme: currentTheme, toggleTheme: globalToggleTheme } = useTheme();
  const [isDisrupted, setIsDisrupted] = useState<boolean>(initialDisrupted);
  const theme = initialTheme ?? currentTheme;

  const isLight = theme === "light";
  const teal = isLight ? "#0d9488" : "#2dd4bf";
  const tealLight = isLight ? "#14b8a6" : "#5eead4";

  const toggleTheme = () => {
    globalToggleTheme();
  };

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-300 ${
        isLight
          ? "bg-[#f8fafc] text-slate-900 selection:bg-teal-500 selection:text-white"
          : "bg-[#070b12] text-slate-100 selection:bg-teal-400 selection:text-slate-950"
      }`}
    >
      {/* ── Top Navigation Bar ── */}
      {showNav && (
        <header
          className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
            isLight
              ? "border-slate-200/90 bg-white/85"
              : "border-slate-800/80 bg-[#070b12]/85"
          }`}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-black text-slate-950 shadow-sm transition-transform group-hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)",
                }}
              >
                P
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-base font-extrabold tracking-tight ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}
                >
                  PlanPatch
                </span>
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  Change-aware planning
                </span>
              </div>
            </Link>

            {/* Nav actions: Workspace link, Design Lab link, Theme toggle, Quick CTA */}
            <div className="flex items-center gap-2.5 sm:gap-4">
              <Link
                href="/design-lab"
                className={`hidden rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex ${
                  isLight
                    ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                Design Lab
              </Link>

              <Link
                href="/workspace"
                className={`hidden rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex ${
                  isLight
                    ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                Workspace
              </Link>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all hover:scale-105 active:scale-95 ${
                  isLight
                    ? "border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50"
                    : "border-slate-800 bg-slate-900/90 text-slate-300 hover:border-slate-700 hover:text-white"
                }`}
              >
                {isLight ? (
                  <Moon className="h-4 w-4 text-slate-700" />
                ) : (
                  <Sun className="h-4 w-4 text-teal-400" />
                )}
              </button>

              {/* Header CTA */}
              <Link
                href="/?mode=custom"
                className="hidden items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-950 shadow-sm transition-all hover:opacity-90 active:scale-95 md:inline-flex"
                style={{
                  background: "linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Create a plan</span>
              </Link>
            </div>
          </div>
        </header>
      )}

      {/* ── Hero Section ── */}
      <div className="relative overflow-hidden border-b border-slate-800/40 pb-16 pt-10 sm:pt-16 lg:pb-24">
        {/* Subtle Ambient Radial Glow */}
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[550px] w-[900px] -translate-x-1/2 rounded-full blur-3xl transition-opacity duration-500"
          style={{
            background: isLight
              ? "radial-gradient(ellipse at center, rgba(13,148,136,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 75%)"
              : "radial-gradient(ellipse at center, rgba(45,212,191,0.14) 0%, rgba(20,184,166,0.05) 45%, transparent 75%)",
          }}
        />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Eyebrow badge */}
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-semibold tracking-wider transition-colors ${
                isLight
                  ? "border-teal-500/30 bg-teal-50 text-teal-700"
                  : "border-teal-400/30 bg-teal-400/10 text-teal-400"
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              DETERMINISTIC RECOVERY
            </span>
          </div>

          {/* Hero Section: Left / Right Clean Composition */}
          <div className="mt-8 grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-12">
            {/* Left Narrative Column */}
            <div className="lg:col-span-6 xl:col-span-6">
              <h1
                className={`text-4xl font-extrabold tracking-tight sm:text-6xl sm:leading-[1.08] lg:text-7xl ${
                  isLight ? "text-slate-950" : "text-white"
                }`}
              >
                Plans change.{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: isLight
                      ? "linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #0284c7 100%)"
                      : "linear-gradient(135deg, #2dd4bf 0%, #5eead4 40%, #a5f3fc 100%)",
                  }}
                >
                  Know what to change next.
                </span>
              </h1>

              <p
                className={`mt-5 max-w-2xl text-base leading-relaxed sm:text-lg ${
                  isLight ? "text-slate-600" : "text-slate-300"
                }`}
              >
                When a task fails, a resource disappears, or a deadline moves, PlanPatch
                finds alternative recovery paths while preserving the work that still matters.
              </p>

              {/* Action Buttons: Primary & Secondary */}
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link
                  href="/?mode=custom"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-slate-950 shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)",
                    boxShadow: "0 4px 20px rgba(45,212,191,0.25)",
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Create a plan
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/?mode=demo"
                  className={`inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
                    isLight
                      ? "border-slate-300 bg-white text-slate-700 shadow-xs hover:border-slate-400 hover:bg-slate-50"
                      : "border-slate-700 bg-slate-900/90 text-slate-200 hover:border-slate-600 hover:bg-slate-800"
                  }`}
                >
                  <Calendar className="h-4 w-4 text-teal-400" />
                  Explore demo
                </Link>
              </div>

              {/* Subtle feature markers */}
              <div
                className={`mt-9 flex flex-wrap items-center gap-5 text-xs ${
                  isLight ? "text-slate-500" : "text-slate-400"
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  Pareto frontier ranking
                </div>
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  Deterministic topological scheduling
                </div>
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  Zero fabricated constraints
                </div>
              </div>
            </div>

            {/* Right Column: Compact Adaptive Recovery Illustration ("WHEN PLANS CHANGE") */}
            <div className="lg:col-span-6 xl:col-span-6">
              <div
                className={`relative rounded-2xl border p-6 sm:p-7 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
                  isLight
                    ? "border-slate-200/90 bg-white shadow-slate-200/60"
                    : "border-slate-800/90 bg-[#0d1526]/95"
                }`}
                style={{
                  boxShadow: isLight
                    ? "0 20px 45px -10px rgba(0,0,0,0.07)"
                    : "0 25px 60px -15px rgba(0,0,0,0.6)",
                }}
              >
                {/* Panel Header */}
                <div
                  className={`flex items-center justify-between border-b pb-4 ${
                    isLight ? "border-slate-100" : "border-slate-800/80"
                  }`}
                >
                  <span
                    className={`font-mono text-xs sm:text-sm font-bold uppercase tracking-widest ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    WHEN PLANS CHANGE
                  </span>

                  {/* Restrained disruption status badge */}
                  {isDisrupted ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-mono font-bold text-rose-400">
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                      RESOURCE UNAVAILABLE
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono font-medium ${
                        isLight
                          ? "border-teal-200 bg-teal-50/80 text-teal-700"
                          : "border-teal-500/30 bg-teal-500/10 text-teal-400"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-teal-400" />
                      ORIGINAL PLAN
                    </span>
                  )}
                </div>

                {/* Custom SVG Adaptive Path Illustration (Clean canvas with zero overlapping text) */}
                <div
                  className={`relative my-5 w-full select-none overflow-hidden rounded-xl border transition-colors ${
                    isLight
                      ? "border-slate-100 bg-slate-50/70"
                      : "border-slate-800/80 bg-[#030712]"
                  }`}
                >
                  <svg
                    viewBox="0 0 540 230"
                    className="h-auto w-full"
                    role="img"
                    aria-label={
                      isDisrupted
                        ? "Illustration showing Venue unavailable and adaptive rerouting to Alternative venue"
                        : "Illustration showing baseline path Prepare to Venue to Event"
                    }
                  >
                    <defs>
                      {/* Technical Grid Dots */}
                      <pattern
                        id="techDotsHero"
                        x="0"
                        y="0"
                        width="24"
                        height="24"
                        patternUnits="userSpaceOnUse"
                      >
                        <circle
                          cx="2.5"
                          cy="2.5"
                          r="1"
                          fill={isLight ? "#cbd5e1" : "#1e293b"}
                          opacity={isLight ? 0.8 : 0.6}
                        />
                      </pattern>

                      {/* Card Soft Drop Shadow */}
                      <filter
                        id="nodeCardShadow"
                        x="-10%"
                        y="-10%"
                        width="120%"
                        height="130%"
                      >
                        <feDropShadow
                          dx="0"
                          dy="2"
                          stdDeviation="3"
                          floodOpacity={isLight ? 0.08 : 0.3}
                        />
                      </filter>
                    </defs>

                    {/* Grid Background */}
                    <rect width="100%" height="100%" fill="url(#techDotsHero)" />

                    {/* BASELINE CONNECTOR 1: Prepare -> Venue */}
                    <path
                      d="M 145 167 L 205 167"
                      stroke={
                        isDisrupted
                          ? "#f43f5e"
                          : isLight
                          ? "#94a3b8"
                          : "#475569"
                      }
                      strokeWidth={isDisrupted ? "2" : "2.5"}
                      strokeDasharray={isDisrupted ? "5 4" : "none"}
                      opacity={isDisrupted ? 0.6 : 1}
                    />

                    {/* BASELINE CONNECTOR 2: Venue -> Event */}
                    <path
                      d="M 335 167 L 395 167"
                      stroke={isLight ? "#94a3b8" : "#475569"}
                      strokeWidth="2.5"
                      strokeDasharray={isDisrupted ? "5 4" : "none"}
                      opacity={isDisrupted ? 0.25 : 1}
                    />

                    {/* ADAPTED CURVED REROUTING PATHS (Prepare -> Alternative Venue -> Event) */}
                    {isDisrupted && (
                      <g>
                        {/* Curved Arch 1: Prepare (145, 167) -> Alternative Venue (195, 56) */}
                        <path
                          d="M 145 167 C 175 167, 165 56, 195 56"
                          stroke={teal}
                          strokeWidth="3"
                          fill="none"
                          strokeLinecap="round"
                        />
                        {/* Curved Arch 2: Alternative Venue (345, 56) -> Event (395, 167) */}
                        <path
                          d="M 345 56 C 375 56, 365 167, 395 167"
                          stroke={teal}
                          strokeWidth="3"
                          fill="none"
                          strokeLinecap="round"
                        />
                      </g>
                    )}

                    {/* NODE 1: PREPARE (Subdued, preserved foundation task) */}
                    <g transform="translate(25, 135)">
                      <rect
                        width="120"
                        height="64"
                        rx="14"
                        fill={isLight ? "#ffffff" : "#0f172a"}
                        stroke={isLight ? "#e2e8f0" : "#334155"}
                        strokeWidth="1.6"
                        filter="url(#nodeCardShadow)"
                      />
                      <text
                        x="60"
                        y="29"
                        textAnchor="middle"
                        fill={isLight ? "#1e293b" : "#f1f5f9"}
                        fontWeight="600"
                        fontSize="13"
                        fontFamily="system-ui, sans-serif"
                      >
                        Prepare
                      </text>
                      <text
                        x="60"
                        y="47"
                        textAnchor="middle"
                        fill={isLight ? "#64748b" : "#64748b"}
                        fontFamily="monospace"
                        fontSize="11"
                      >
                        Planning
                      </text>
                    </g>

                    {/* NODE 2 (ORIGINAL): VENUE (Crossed out & Unavailable when disrupted) */}
                    <g transform="translate(205, 135)">
                      {isDisrupted ? (
                        <>
                          <rect
                            width="130"
                            height="64"
                            rx="14"
                            fill={isLight ? "#fff1f2" : "rgba(159,18,57,0.18)"}
                            stroke="#f43f5e"
                            strokeWidth="1.6"
                            strokeDasharray="5 4"
                          />
                          {/* Diagonal cross indicator */}
                          <line
                            x1="18"
                            y1="14"
                            x2="112"
                            y2="50"
                            stroke="#f43f5e"
                            strokeWidth="2"
                            opacity="0.85"
                          />
                          <text
                            x="65"
                            y="29"
                            textAnchor="middle"
                            fill="#fb7185"
                            fontWeight="600"
                            fontSize="13"
                            fontFamily="system-ui, sans-serif"
                          >
                            Venue
                          </text>
                          <text
                            x="65"
                            y="47"
                            textAnchor="middle"
                            fill="#f43f5e"
                            fontFamily="monospace"
                            fontSize="11"
                            fontWeight="700"
                          >
                            Unavailable
                          </text>
                        </>
                      ) : (
                        <>
                          <rect
                            width="130"
                            height="64"
                            rx="14"
                            fill={isLight ? "#ffffff" : "#0f172a"}
                            stroke={isLight ? "#cbd5e1" : "#475569"}
                            strokeWidth="1.6"
                            filter="url(#nodeCardShadow)"
                          />
                          <text
                            x="65"
                            y="29"
                            textAnchor="middle"
                            fill={isLight ? "#1e293b" : "#f1f5f9"}
                            fontWeight="600"
                            fontSize="13"
                            fontFamily="system-ui, sans-serif"
                          >
                            Venue
                          </text>
                          <text
                            x="65"
                            y="47"
                            textAnchor="middle"
                            fill={isLight ? "#64748b" : "#64748b"}
                            fontFamily="monospace"
                            fontSize="11"
                          >
                            Auditorium
                          </text>
                        </>
                      )}
                    </g>

                    {/* NODE 2 (REPLACEMENT): ALTERNATIVE VENUE (Centered cleanly above Venue) */}
                    {isDisrupted && (
                      <g transform="translate(195, 24)">
                        <rect
                          width="150"
                          height="64"
                          rx="14"
                          fill={
                            isLight
                              ? "#f0fdfa"
                              : "rgba(13,148,136,0.22)"
                          }
                          stroke={teal}
                          strokeWidth="2.2"
                        />
                        {/* Checkmark badge pill */}
                        <circle cx="133" cy="16" r="7.5" fill={teal} />
                        <path
                          d="M 130 16 L 132.5 18.5 L 136.5 13.5"
                          stroke={isLight ? "#ffffff" : "#022c22"}
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <text
                          x="75"
                          y="29"
                          textAnchor="middle"
                          fill={teal}
                          fontWeight="700"
                          fontSize="13"
                          fontFamily="system-ui, sans-serif"
                        >
                          Alt Venue
                        </text>
                        <text
                          x="75"
                          y="47"
                          textAnchor="middle"
                          fill={tealLight}
                          fontFamily="monospace"
                          fontSize="11"
                          fontWeight="700"
                        >
                          Community Hall
                        </text>
                      </g>
                    )}

                    {/* NODE 3: EVENT (Subdued, preserved downstream destination) */}
                    <g transform="translate(395, 135)">
                      <rect
                        width="120"
                        height="64"
                        rx="14"
                        fill={isLight ? "#ffffff" : "#0f172a"}
                        stroke={isLight ? "#e2e8f0" : "#334155"}
                        strokeWidth="1.6"
                        filter="url(#nodeCardShadow)"
                      />
                      <text
                        x="60"
                        y="29"
                        textAnchor="middle"
                        fill={isLight ? "#1e293b" : "#f1f5f9"}
                        fontWeight="600"
                        fontSize="13"
                        fontFamily="system-ui, sans-serif"
                      >
                        Event
                      </text>
                      <text
                        x="60"
                        y="47"
                        textAnchor="middle"
                        fill={isLight ? "#64748b" : "#64748b"}
                        fontFamily="monospace"
                        fontSize="11"
                      >
                        Preserved
                      </text>
                    </g>
                  </svg>
                </div>

                {/* Dynamic path outcome banner — placed neatly below canvas so nodes are never obscured */}
                <div
                  className={`rounded-xl border p-4 sm:p-5 text-sm transition-all duration-300 ${
                    isDisrupted
                      ? isLight
                        ? "border-teal-200 bg-teal-50/70"
                        : "border-teal-500/30 bg-teal-950/30"
                      : isLight
                      ? "border-slate-200/80 bg-slate-50/80"
                      : "border-slate-800/90 bg-slate-900/60"
                  }`}
                >
                  {isDisrupted ? (
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className="font-semibold text-sm sm:text-base flex items-center gap-2"
                          style={{ color: teal }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Prepare → Alternative venue → Event
                        </span>
                        <span
                          className="font-mono text-xs sm:text-sm font-bold"
                          style={{ color: tealLight }}
                        >
                          +2h shift · 100% tasks kept
                        </span>
                      </div>
                      <p
                        className={`mt-2 text-xs leading-relaxed ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        Conceptual preview · Real-world availability subject to facilities sign-off.
                      </p>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center justify-between ${
                        isLight ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      <span
                        className={`font-medium text-sm sm:text-base ${
                          isLight ? "text-slate-800" : "text-slate-300"
                        }`}
                      >
                        Prepare → Venue → Event
                      </span>
                      <span
                        className={`font-mono text-xs ${
                          isLight ? "text-slate-500" : "text-slate-500"
                        }`}
                      >
                        Baseline schedule
                      </span>
                    </div>
                  )}
                </div>

                {/* Section 3: Interactive Simulation Trigger */}
                <div className="mt-4 flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setIsDisrupted((prev) => !prev)}
                    aria-pressed={isDisrupted}
                    className={`flex items-center gap-2 rounded-xl border px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 ${
                      isDisrupted
                        ? isLight
                          ? "border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100"
                          : "border-teal-400/40 bg-teal-400/10 text-teal-300 hover:bg-teal-400/20"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                    }`}
                  >
                    {isDisrupted ? (
                      <>
                        <RotateCcw className="h-4 w-4 text-teal-400" />
                        <span>Reset illustration</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-rose-400" />
                        <span>Simulate disruption</span>
                      </>
                    )}
                  </button>

                  <span
                    className={`text-xs font-mono ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    {isDisrupted ? "Adapted Path Active" : "Click to test adaptation"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Narrative 3-Step Flow (Concise & Restrained) ── */}
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="text-center">
          <h2
            className="text-sm sm:text-base font-mono font-bold tracking-widest uppercase"
            style={{ color: teal }}
          >
            HOW IT WORKS
          </h2>
          <p
            className={`mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            Three steps from disruption to resolution
          </p>
          <p
            className={`mt-4 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed ${
              isLight ? "text-slate-600" : "text-slate-400"
            }`}
          >
            A clean, three-phase recovery loop designed to keep projects on schedule without manual spreadsheet surgery.
          </p>
        </div>

        <div className="mt-12 sm:mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          <div
            className={`rounded-2xl border p-8 sm:p-9 transition-all duration-300 shadow-md hover:shadow-xl ${
              isLight
                ? "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
            }`}
          >
            <div className="font-mono text-3xl sm:text-4xl font-black tracking-tight" style={{ color: teal }}>
              01
            </div>
            <h3
              className={`mt-4 text-xl sm:text-2xl font-bold tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              Describe a disruption
            </h3>
            <p
              className={`mt-3 text-sm sm:text-base leading-relaxed ${
                isLight ? "text-slate-600" : "text-slate-400"
              }`}
            >
              State what broke in ordinary words — a vendor cancellation, budget cut, or tight deadline. No manual graph edits.
            </p>
          </div>

          <div
            className={`rounded-2xl border p-8 sm:p-9 transition-all duration-300 shadow-md hover:shadow-xl ${
              isLight
                ? "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
            }`}
          >
            <div className="font-mono text-3xl sm:text-4xl font-black tracking-tight" style={{ color: teal }}>
              02
            </div>
            <h3
              className={`mt-4 text-xl sm:text-2xl font-bold tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              Evaluate recovery alternatives
            </h3>
            <p
              className={`mt-3 text-sm sm:text-base leading-relaxed ${
                isLight ? "text-slate-600" : "text-slate-400"
              }`}
            >
              PlanPatch&apos;s deterministic solver explores the Pareto frontier to find topologically sound schedules balancing cost, slack, and scope.
            </p>
          </div>

          <div
            className={`rounded-2xl border p-8 sm:p-9 transition-all duration-300 shadow-md hover:shadow-xl ${
              isLight
                ? "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
            }`}
          >
            <div className="font-mono text-3xl sm:text-4xl font-black tracking-tight" style={{ color: teal }}>
              03
            </div>
            <h3
              className={`mt-4 text-xl sm:text-2xl font-bold tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              Review the recommended plan
            </h3>
            <p
              className={`mt-3 text-sm sm:text-base leading-relaxed ${
                isLight ? "text-slate-600" : "text-slate-400"
              }`}
            >
              Inspect the atomic recovery patch, compare exact trade-offs against baseline, and accept verified changes with confidence.
            </p>
          </div>
        </div>
      </div>

      {/* ── Minimal Technical Footer ── */}
      <footer
        className={`border-t py-8 text-xs transition-colors ${
          isLight
            ? "border-slate-200/90 text-slate-500"
            : "border-slate-800/80 text-slate-400"
        }`}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" style={{ color: teal }} />
            <span>PlanPatch · Change-aware planning engine</span>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/workspace"
              className="hover:underline transition-all"
              style={{ color: teal }}
            >
              Full Workspace
            </Link>
            <Link
              href="/design-lab"
              className="hover:underline transition-all"
              style={{ color: teal }}
            >
              Design Lab
            </Link>
            <span>Pareto Multi-Objective Optimization</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
