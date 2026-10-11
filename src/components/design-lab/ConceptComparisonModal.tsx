"use client";

import React from "react";
import { X, CheckCircle2, AlertCircle, Sparkles, Star, Trophy, Ban } from "lucide-react";
import { COMPARISON_CRITERIA_DATA, CONCEPTS } from "./design-lab-data";
import type { ConceptId } from "./types";

interface ConceptComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeConceptId: ConceptId;
  onSelectConcept: (conceptId: ConceptId) => void;
}

export function ConceptComparisonModal({
  isOpen,
  onClose,
  activeConceptId,
  onSelectConcept,
}: ConceptComparisonModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-700 bg-[#0b101b] text-slate-100 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-lime-400" />
              <h2 className="text-lg font-bold text-white">
                PlanPatch Design Evaluation & Direction
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Comparative analysis following design review: eliminating clutter and focusing on high-signal recovery
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Top Recommendation Banner: The Simplified Hybrid */}
          <div
            className={`rounded-xl border p-5 transition-all ${
              activeConceptId === "simplified"
                ? "border-lime-400 bg-lime-950/30 ring-1 ring-lime-400"
                : "border-slate-800 bg-slate-900/80"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-lime-400/20 px-2.5 py-0.5 text-xs font-bold font-mono text-lime-400 border border-lime-400/30">
                  ★ SELECTED DIRECTION
                </span>
                <span className="text-sm font-bold text-white">
                  Simplified Hybrid (A's Visuals + B's Signal - Clutter)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectConcept("simplified");
                  onClose();
                }}
                className="rounded-lg bg-lime-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-lime-300 transition-colors"
              >
                View Simplified Hybrid
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Combines the bold typographic confidence and dark aesthetic of <strong>Concept A</strong> with
              the high-signal before/after disruption comparison of <strong>Concept B</strong>, while stripping away
              over 60% of the cognitive clutter (eliminating dense metric strips, essay-length paragraphs, and nested cards).
            </p>
          </div>

          {/* Three Prototype Score Summaries */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Concept A Card */}
            <div
              className={`rounded-xl border p-4 transition-all ${
                activeConceptId === "concept-a"
                  ? "border-slate-600 bg-slate-900"
                  : "border-slate-800/80 bg-slate-950/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold font-mono text-slate-300">
                  CONCEPT A
                </span>
                <span className="text-xs text-lime-400 font-semibold">Strong Aesthetics</span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-white">
                Editorial & Cinematic
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Looks great with bold headline and dark canvas, but was overloaded with too much narrative copy and nested sections.
              </p>
              <button
                type="button"
                onClick={() => {
                  onSelectConcept("concept-a");
                  onClose();
                }}
                className="mt-3 w-full rounded-lg bg-slate-800 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Switch to Concept A
              </button>
            </div>

            {/* Concept B Card */}
            <div
              className={`rounded-xl border p-4 transition-all ${
                activeConceptId === "concept-b"
                  ? "border-indigo-500 bg-indigo-950/20"
                  : "border-slate-800/80 bg-slate-950/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-bold font-mono text-indigo-400">
                  CONCEPT B
                </span>
                <span className="text-xs text-indigo-300 font-semibold">High Informative Value</span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-white">
                Interactive Product
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Highly informative scenario simulation, but suffered from card-in-card visual density and too many separate stat blocks.
              </p>
              <button
                type="button"
                onClick={() => {
                  onSelectConcept("concept-b");
                  onClose();
                }}
                className="mt-3 w-full rounded-lg bg-slate-800 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-slate-700"
              >
                Switch to Concept B
              </button>
            </div>

            {/* Concept C Card (Marked Rejected) */}
            <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-4 opacity-75">
              <div className="flex items-center justify-between">
                <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-bold font-mono text-rose-400">
                  CONCEPT C
                </span>
                <span className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                  <Ban className="h-3 w-3" /> Disqualified
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-slate-300">
                Technical Control Room
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Rejected during review. Terminal-style density was visually cluttered, noisy, and overwhelming for non-engineers.
              </p>
              <button
                type="button"
                onClick={() => {
                  onSelectConcept("concept-c");
                  onClose();
                }}
                className="mt-3 w-full rounded-lg bg-slate-900 border border-slate-800 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-300"
              >
                Inspect Archived C
              </button>
            </div>
          </div>

          {/* Strategic Synthesis */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-lime-400 font-mono uppercase tracking-wider">
              <Sparkles className="h-4 w-4" />
              Design Action Taken
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              We acted on the feedback:
              <br />
              1. <strong>Concept C is discarded</strong> from primary consideration.
              <br />
              2. <strong>Concept A & B decluttered</strong>: removed redundant cards, consolidated stats, and cut word count in half.
              <br />
              3. <strong>Simplified Hybrid created</strong>: a unified, single-card before/after disruption comparison framed by clean typography and generous negative space.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3.5 bg-slate-900/60">
          <span className="text-xs text-slate-400">
            Click any concept to preview instantly.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            Close Matrix
          </button>
        </div>
      </div>
    </div>
  );
}
