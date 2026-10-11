"use client";

import React from "react";
import Link from "next/link";
import {
  Compass,
  Zap,
  Terminal,
  Trophy,
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { CONCEPTS } from "./design-lab-data";
import type { ConceptId } from "./types";

interface DesignLabNavProps {
  activeConceptId: ConceptId;
  onSelectConcept: (conceptId: ConceptId) => void;
  onOpenComparison: () => void;
}

export function DesignLabNav({
  activeConceptId,
  onSelectConcept,
  onOpenComparison,
}: DesignLabNavProps) {
  const currentMeta = CONCEPTS[activeConceptId];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#070a11]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand and Lab title */}
        <div className="flex items-center gap-3">
          <Link
            href="/design-lab"
            className="flex items-center gap-2 text-white font-bold tracking-tight text-sm hover:opacity-90 transition-opacity"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-400 text-slate-950 font-black text-xs">
              PP
            </div>
            <span>
              PlanPatch <span className="text-teal-400 font-mono">/</span> Design Lab
            </span>
          </Link>

          {/* Active Concept pill */}
          <span className="hidden items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-mono text-slate-300 md:inline-flex">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: currentMeta.accentColor }}
            />
            {currentMeta.badge}
          </span>
        </div>

        {/* Concept Switcher Tabs */}
        <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => onSelectConcept("simplified")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeConceptId === "simplified"
                ? "bg-lime-400 text-slate-950 shadow font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Simplified (Recommended)</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectConcept("concept-a")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeConceptId === "concept-a"
                ? "bg-slate-800 text-white shadow font-bold border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Concept A: Editorial</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectConcept("concept-b")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeConceptId === "concept-b"
                ? "bg-indigo-600 text-white shadow font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Concept B: Interactive</span>
          </button>
        </div>

        {/* Right actions: Compare Matrix & Back to Workspace */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenComparison}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Trophy className="h-3.5 w-3.5" />
            <span>Compare Matrix</span>
          </button>

          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700 transition-colors"
          >
            <span>Live Workspace</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>
      </div>
    </header>
  );
}
