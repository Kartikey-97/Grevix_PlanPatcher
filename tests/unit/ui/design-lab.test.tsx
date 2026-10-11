import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DesignLabNav } from "../../../src/components/design-lab/DesignLabNav";
import { SimplifiedHybrid } from "../../../src/components/design-lab/SimplifiedHybrid";
import { ConceptAEditorial } from "../../../src/components/design-lab/ConceptAEditorial";
import { ConceptBInteractive } from "../../../src/components/design-lab/ConceptBInteractive";
import { ConceptCTechnical } from "../../../src/components/design-lab/ConceptCTechnical";
import { ConceptComparisonModal } from "../../../src/components/design-lab/ConceptComparisonModal";
import DesignLabPage from "../../../src/app/design-lab/page";
import {
  CONCEPTS,
  DAG_NODES_DATA,
  SCENARIO_PRESETS_DATA,
  COMPARISON_CRITERIA_DATA,
} from "../../../src/components/design-lab/design-lab-data";

describe("PlanPatch Design Lab — Prototypes and Comparison Matrix", () => {
  describe("1. Design Data and Presets Integrity", () => {
    it("defines simplified hybrid and prototype concepts with distinctive metadata", () => {
      expect(CONCEPTS["simplified"]).toBeDefined();
      expect(CONCEPTS["concept-a"]).toBeDefined();
      expect(CONCEPTS["concept-b"]).toBeDefined();
      expect(CONCEPTS["concept-c"]).toBeDefined();

      expect(CONCEPTS["simplified"].name).toBe("Simplified Hybrid");
      expect(CONCEPTS["concept-a"].name).toBe("Editorial & Cinematic");
      expect(CONCEPTS["concept-b"].name).toBe("Interactive Product");
    });

    it("includes 16 canonical Campus Tech Fest tasks in DAG data", () => {
      expect(DAG_NODES_DATA.length).toBe(16);
      const t01 = DAG_NODES_DATA.find((n) => n.id === "T01");
      const t03 = DAG_NODES_DATA.find((n) => n.id === "T03");
      const t15 = DAG_NODES_DATA.find((n) => n.id === "T15");

      expect(t01).toBeDefined();
      expect(t01?.isCritical).toBe(true);
      expect(t03).toBeDefined();
      expect(t03?.title).toBe("Book venue");
      expect(t15).toBeDefined();
      expect(t15?.earliestFinish).toBe(132);
    });

    it("provides 3 realistic scenarios with real baseline numbers", () => {
      expect(SCENARIO_PRESETS_DATA.length).toBe(3);

      const s1 = SCENARIO_PRESETS_DATA.find((s) => s.id === "s1-venue");
      expect(s1).toBeDefined();
      expect(s1?.baseline.totalCost).toBe(18000);
      expect(s1?.baseline.budgetLimit).toBe(25000);
      expect(s1?.recoveryCandidates.length).toBeGreaterThanOrEqual(2);

      const s2 = SCENARIO_PRESETS_DATA.find((s) => s.id === "s2-budget");
      expect(s2).toBeDefined();
      expect(s2?.baseline.budgetLimit).toBe(16000);
      expect(s2?.baseline.hardConstraintPass).toBe(false);

      const s3 = SCENARIO_PRESETS_DATA.find((s) => s.id === "s3-deadline");
      expect(s3).toBeDefined();
      expect(s3?.baseline.deadlineHours).toBe(120);
      expect(s3?.baseline.slackHours).toBe(-12.0);
    });

    it("evaluates all 5 comparison criteria", () => {
      expect(COMPARISON_CRITERIA_DATA.length).toBe(5);
      for (const crit of COMPARISON_CRITERIA_DATA) {
        expect(crit.conceptAScore).toBeGreaterThanOrEqual(1);
        expect(crit.conceptAScore).toBeLessThanOrEqual(5);
        expect(crit.conceptBScore).toBeGreaterThanOrEqual(1);
        expect(crit.conceptBScore).toBeLessThanOrEqual(5);
        expect(crit.conceptCScore).toBeGreaterThanOrEqual(1);
        expect(crit.conceptCScore).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("2. DesignLabNav Component", () => {
    it("renders concept switcher tabs with Simplified (Recommended)", () => {
      const html = renderToString(
        <DesignLabNav
          activeConceptId="simplified"
          onSelectConcept={vi.fn()}
          onOpenComparison={vi.fn()}
        />
      );

      expect(html).toContain("PlanPatch");
      expect(html).toContain("Design Lab");
      expect(html).toContain("Simplified (Recommended)");
      expect(html).toContain("Concept A: Editorial");
      expect(html).toContain("Concept B: Interactive");
      expect(html).toContain("Compare Matrix");
      expect(html).toContain("Live Workspace");
    });
  });

  describe("3. SimplifiedHybrid Component (The Clean Fusion & Hybrid Recovery Showcase)", () => {
    it("renders hero banner, confident headline, navigation CTA, and 3-step recovery process", () => {
      const html = renderToString(<SimplifiedHybrid />);

      // Headline and brand
      expect(html).toContain("Plans change.");
      expect(html).toContain("Know what to change next.");
      expect(html).toContain("BEFORE &amp; AFTER RECOVERY SHOWCASE");
      expect(html).toContain("Open in Full Recovery Workspace");

      // Scenario pills
      expect(html).toContain("Venue Cancelled");
      expect(html).toContain("Budget Cut to ₹16k");
      expect(html).toContain("Deadline Moved to 120h");

      // Recovery process steps
      expect(html).toContain("THE RECOVERY PROCESS");
      expect(html).toContain("Ingest Disruption");
      expect(html).toContain("Explore Pareto Frontier");
      expect(html).toContain("Apply Verified Patch");
    });

    it("renders balanced two-panel before/after layout with center transition indicator", () => {
      const html = renderToString(<SimplifiedHybrid />);

      // Left panel: Before
      expect(html).toContain("Before: Disrupted Baseline");
      expect(html).toContain("Constraint Violated");
      expect(html).toContain("Projected Cost");
      expect(html).toContain("Earliest Finish");
      expect(html).toContain("BASELINE SCHEDULE STRIP");

      // Center transition
      expect(html).toContain("Pareto Search");

      // Right panel: After
      expect(html).toContain("RECOMMENDED ACTION");
      expect(html).toContain("Relocate to Community Hall");
      expect(html).toContain("RECOVERY SCHEDULE STRIP");
    });

    it("switches scenarios and updates before and after states for all 3 canonical disruptions", () => {
      // Scenario 1: Venue Cancelled
      const htmlS1 = renderToString(<SimplifiedHybrid initialScenarioId="S1-venue-cancelled" />);
      expect(htmlS1).toContain("Venue Availability Failed");
      expect(htmlS1).toContain("bookingStatus: unavailable · 9 downstream tasks blocked");
      expect(htmlS1).toContain("Relocate to Community Hall");
      expect(htmlS1).toContain("Candidate: S1-A-community-hall");
      expect(htmlS1).toContain("16 of 16");

      // Scenario 2: Budget Cut
      const htmlS2 = renderToString(<SimplifiedHybrid initialScenarioId="S2-budget-cut" />);
      expect(htmlS2).toContain("Budget Limit Violated");
      expect(htmlS2).toContain("Cost ₹18,000 &gt; ₹16,000 limit");
      expect(htmlS2).toContain("Lecture Hall with Lean Logistics");
      expect(htmlS2).toContain("Candidate: S2-A-lecture-hall-lean");
      expect(htmlS2).toContain("₹15,700");

      // Scenario 3: Deadline Moved
      const htmlS3 = renderToString(<SimplifiedHybrid initialScenarioId="S3-deadline-moved-earlier" />);
      expect(htmlS3).toContain("Deadline Overrun Violated");
      expect(htmlS3).toContain("Finish 132.0h &gt; 120.0h deadline");
      expect(htmlS3).toContain("Fast-Track Registration Window");
      expect(htmlS3).toContain("Candidate: S3-A-early-registration-close");
      expect(htmlS3).toContain("116.0h");
    });

    it("separates feasibility, Pareto status, and real-world verification claims without universal guarantee language", () => {
      const htmlS1 = renderToString(<SimplifiedHybrid initialScenarioId="S1-venue-cancelled" />);
      // Feasibility
      expect(htmlS1).toContain("Hard Constraints Pass");
      // Pareto status
      expect(htmlS1).toContain("Pareto Frontier (Non-Dominated)");
      // Real-world verification status
      expect(htmlS1).toContain("Provisional Verification");
    });

    it("surfaces at most 3 prominent key metrics and non-redundant distinct outcomes", () => {
      const htmlS1 = renderToString(<SimplifiedHybrid initialScenarioId="S1-venue-cancelled" />);
      expect(htmlS1).toContain("Projected Cost");
      expect(htmlS1).toContain("₹20,000");
      expect(htmlS1).toContain("Earliest Finish");
      expect(htmlS1).toContain("134.0h");
      expect(htmlS1).toContain("Scope Preserved");
      expect(htmlS1).toContain("16 of 16");

      // Non-redundant data-driven outcomes
      expect(htmlS1).toContain("16 of 16 tasks preserved with zero priority loss");
      expect(htmlS1).toContain("₹5,000 buffer remaining below ₹25,000 budget cap");
      expect(htmlS1).toContain("Single-session format maintained without splitting rooms");
    });

    it("renders compact schedule strips for both baseline and recovery states", () => {
      const html = renderToString(<SimplifiedHybrid initialScenarioId="S1-venue-cancelled" />);
      expect(html).toContain("BASELINE SCHEDULE STRIP");
      expect(html).toContain("Book Venue");
      expect(html).toContain("RECOVERY SCHEDULE STRIP");
      expect(html).toContain("Community Hall");
      expect(html).toContain("Finish: 134h (+2h)");
    });

    it("supports light and dark modes and accent color palettes without runtime error", () => {
      const htmlLight = renderToString(<SimplifiedHybrid initialThemeMode="light" initialColorScheme="teal" />);
      expect(htmlLight).toContain("Theme: <strong class=\"text-slate-900\">LIGHT</strong>");
      expect(htmlLight).toContain("Teal (Clean)");

      const htmlDarkLime = renderToString(<SimplifiedHybrid initialThemeMode="dark" initialColorScheme="lime" />);
      expect(htmlDarkLime).toContain("Theme: <strong class=\"text-white\">DARK</strong>");
      expect(htmlDarkLime).toContain("Lime (Punchy)");
    });

    it("supports progressive disclosure for inspecting detailed engine evidence", () => {
      const htmlCollapsed = renderToString(<SimplifiedHybrid initialEvidenceExpanded={false} />);
      expect(htmlCollapsed).toContain("Why this recommendation? (Detailed Engine Evidence)");
      expect(htmlCollapsed).not.toContain("Objective Scores &amp; Ranking Rationale:");

      const htmlExpanded = renderToString(<SimplifiedHybrid initialEvidenceExpanded={true} />);
      expect(htmlExpanded).toContain("Objective Scores &amp; Ranking Rationale:");
      expect(htmlExpanded).toContain("Real-World Verification Requirements:");
      expect(htmlExpanded).toContain("Task-Level Mutations Diff:");
      expect(htmlExpanded).toContain("Preserve Plan (Quality-First)");
      expect(htmlExpanded).toContain("venue_availability: Demo Community Hall availability is unconfirmed in live booking system");
    });

    it("wires navigation link to full workspace with preselected scenario and candidate", () => {
      const html = renderToString(<SimplifiedHybrid initialScenarioId="S1-venue-cancelled" />);
      expect(html).toContain("href=\"/?scenario=S1-venue-cancelled&amp;candidate=S1-A-community-hall\"");
      expect(html).toContain("Apply in Full Workspace");
    });
  });

  describe("4. Concept A (Editorial & Cinematic — Preferred Direction)", () => {
    it("renders editorial headline, supporting copy, and primary/secondary CTAs", () => {
      const html = renderToString(<ConceptAEditorial />);

      expect(html).toContain("Plans change.");
      expect(html).toContain("Know what to change next.");
      expect(html).toContain(
        "When a task fails, a resource disappears, or a deadline moves, PlanPatch finds alternative recovery paths while preserving the work that still matters."
      );
      expect(html).toContain("DETERMINISTIC RECOVERY");

      // CTAs
      expect(html).toContain("Create a plan");
      expect(html).toContain("href=\"/?mode=custom\"");
      expect(html).toContain("Explore demo");
      expect(html).toContain("href=\"/?mode=demo\"");
    });

    it("renders compact adaptive recovery illustration titled WHEN PLANS CHANGE with readable labels instead of technical IDs", () => {
      const html = renderToString(<ConceptAEditorial />);

      expect(html).toContain("WHEN PLANS CHANGE");
      expect(html).toContain("Prepare");
      expect(html).toContain("Venue");
      expect(html).toContain("Event");

      // Verifies no engineering task ID nodes in the graphic
      expect(html).not.toContain(">T1<");
      expect(html).not.toContain(">T2<");
      expect(html).not.toContain(">T3<");
      expect(html).not.toContain("STATE: OPTIMAL BASELINE");
    });

    it("renders baseline state with interactive simulate trigger", () => {
      const html = renderToString(<ConceptAEditorial initialDisrupted={false} />);

      expect(html).toContain("ORIGINAL PLAN");
      expect(html).toContain("Prepare → Venue → Event");
      expect(html).toContain("Simulate disruption");
    });

    it("renders disrupted state with RESOURCE UNAVAILABLE marker and alternative venue rerouting", () => {
      const html = renderToString(<ConceptAEditorial initialDisrupted={true} />);

      expect(html).toContain("RESOURCE UNAVAILABLE");
      expect(html).toContain("Alt Venue");
      expect(html).toContain("Community Hall");
      expect(html).toContain("Prepare → Alternative venue → Event");
      expect(html).toContain("+2h shift · 100% tasks kept");
      expect(html).toContain("Reset illustration");

      // Provisional caveat included
      expect(html).toContain("Conceptual preview · Real-world availability subject to facilities sign-off.");
    });

    it("renders concise 3-step product flow below hero", () => {
      const html = renderToString(<ConceptAEditorial />);

      expect(html).toContain("HOW IT WORKS");
      expect(html).toContain("Three steps from disruption to resolution");
      expect(html).toContain("Describe a disruption");
      expect(html).toContain("Evaluate recovery alternatives");
      expect(html).toContain("Review the recommended plan");
    });
  });

  describe("5. Concept B (Interactive Product Experience) Component", () => {
    it("renders interactive scenario triggers and candidate patch details", () => {
      const html = renderToString(<ConceptBInteractive />);

      expect(html).toContain("Deterministic recovery in real time.");
      expect(html).toContain("Venue Cancelled");
      expect(html).toContain("Incident Injected");

      // Baseline status
      expect(html).toContain("Baseline Plan");
      expect(html).toContain("Recovery Candidate");
      expect(html).toContain("Optimization Profile");

      // Action Link
      expect(html).toContain("Open in Workspace");
    });
  });

  describe("6. Concept C (Technical Control Room) Component", () => {
    it("renders high-density ops ticker, interactive DAG nodes, and hotkey shortcuts", () => {
      const html = renderToString(<ConceptCTechnical />);

      expect(html).toContain("OPS-ROOM V2");
      expect(html).toContain("PLAN: CAMPUS-TECH-FEST-01");
      expect(html).toContain("CRITICAL FLOAT:");
      expect(html).toContain("0.0h");
      expect(html).toContain("BUDGET UTILIZATION:");
      expect(html).toContain("72.0%");

      // Hotkey badges
      expect(html).toContain("[1]");
      expect(html).toContain("[2]");
      expect(html).toContain("[3]");
      expect(html).toContain("[Esc]");

      // DAG tasks
      expect(html).toContain("T01");
      expect(html).toContain("T02");
      expect(html).toContain("T03");
      expect(html).toContain("T15");
      expect(html).toContain("TASK TELEMETRY INSPECTOR");
      expect(html).toContain("DISRUPTION INJECTION MATRIX");
      expect(html).toContain("Open Full PlanPatch Workspace");
    });
  });

  describe("7. ConceptComparisonModal Component", () => {
    it("renders evaluation criteria, highlights Simplified Hybrid, and marks Concept C disqualified", () => {
      const html = renderToString(
        <ConceptComparisonModal
          isOpen={true}
          onClose={vi.fn()}
          activeConceptId="simplified"
          onSelectConcept={vi.fn()}
        />
      );

      expect(html).toContain("PlanPatch Design Evaluation &amp; Direction");
      expect(html).toContain("SELECTED DIRECTION");
      expect(html).toContain("Simplified Hybrid");
      expect(html).toContain("CONCEPT A");
      expect(html).toContain("CONCEPT B");
      expect(html).toContain("CONCEPT C");
      expect(html).toContain("Disqualified");
      expect(html).toContain("Design Action Taken");
      expect(html).toContain("View Simplified Hybrid");
    });

    it("returns null when isOpen is false", () => {
      const html = renderToString(
        <ConceptComparisonModal
          isOpen={false}
          onClose={vi.fn()}
          activeConceptId="simplified"
          onSelectConcept={vi.fn()}
        />
      );

      expect(html).toBe("");
    });
  });

  describe("8. DesignLabPage Shell Integration", () => {
    it("renders the design lab page shell with Simplified Hybrid active by default", () => {
      const html = renderToString(<DesignLabPage />);

      expect(html).toContain("PlanPatch");
      expect(html).toContain("Design Lab");
      expect(html).toContain("Compare 3 Concepts Matrix");
      // Default concept is Simplified Hybrid
      expect(html).toContain("Plans change.");
      expect(html).toContain("Know what to change next.");
      expect(html).toContain("Before: Disrupted Baseline");
      expect(html).toContain("RECOMMENDED ACTION");
    });
  });
});
