"use client";

import React, { useState } from "react";
import { DesignLabNav } from "../../components/design-lab/DesignLabNav";
import { SimplifiedHybrid } from "../../components/design-lab/SimplifiedHybrid";
import { ConceptAEditorial } from "../../components/design-lab/ConceptAEditorial";
import { ConceptBInteractive } from "../../components/design-lab/ConceptBInteractive";
import { ConceptCTechnical } from "../../components/design-lab/ConceptCTechnical";
import { ConceptComparisonModal } from "../../components/design-lab/ConceptComparisonModal";
import type { ConceptId } from "../../components/design-lab/types";
import { Trophy, HelpCircle } from "lucide-react";

export default function DesignLabPage() {
  const [activeConceptId, setActiveConceptId] = useState<ConceptId>("simplified");
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const conceptQuery = searchParams.get("concept") as ConceptId | null;
    if (
      conceptQuery &&
      ["simplified", "concept-a", "concept-b", "concept-c"].includes(conceptQuery)
    ) {
      setActiveConceptId(conceptQuery);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans">
      {/* Sticky Concept Switcher Navigation */}
      <DesignLabNav
        activeConceptId={activeConceptId}
        onSelectConcept={setActiveConceptId}
        onOpenComparison={() => setIsComparisonOpen(true)}
      />

      {/* Main Concept Canvas */}
      <main className="flex-1">
        {activeConceptId === "simplified" && <SimplifiedHybrid />}
        {activeConceptId === "concept-a" && <ConceptAEditorial />}
        {activeConceptId === "concept-b" && <ConceptBInteractive />}
        {activeConceptId === "concept-c" && <ConceptCTechnical />}
      </main>

      {/* Floating Compare Action Pill */}
      <div className="fixed bottom-6 right-6 z-30">
        <button
          type="button"
          onClick={() => setIsComparisonOpen(true)}
          className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300 shadow-xl backdrop-blur-md transition-all hover:bg-amber-500/20 hover:scale-105 active:scale-95"
        >
          <Trophy className="h-4 w-4" />
          <span>Compare 3 Concepts Matrix</span>
        </button>
      </div>

      {/* Comparison Drawer / Modal */}
      <ConceptComparisonModal
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        activeConceptId={activeConceptId}
        onSelectConcept={setActiveConceptId}
      />
    </div>
  );
}
