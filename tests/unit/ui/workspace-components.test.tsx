import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PlanOverview } from "../../../src/components/PlanOverview";
import {
  DisruptionInput,
  CANONICAL_EXAMPLE_PROMPTS,
} from "../../../src/components/DisruptionInput";
import { InterpretationReview } from "../../../src/components/InterpretationReview";
import { RecoveryComparison } from "../../../src/components/RecoveryComparison";
import { DiffViewer } from "../../../src/components/DiffViewer";
import {
  getCanonicalPlan,
  getCanonicalScenariosDoc,
  getCanonicalRankingPolicy,
} from "../../../src/data/load-demo-fixtures";
import { runRecovery } from "../../../src/lib/engine/run-recovery";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";

describe("Milestone S7: PlanPatch Interactive Workspace UI Components", () => {
  const plan = getCanonicalPlan();
  const graph = rebuildGraph(plan);
  const scenariosDoc = getCanonicalScenariosDoc();
  const rankingPolicy = getCanonicalRankingPolicy();

  registerEventPlanningValidator();

  describe("1. PlanOverview Component", () => {
    it("renders baseline plan name, domain, metrics, and disclaimer", () => {
      const html = renderToString(<PlanOverview plan={plan} />);

      expect(html).toContain("Campus Tech Fest");
      expect(html).toContain("event-planning");
      expect(html).toContain("Domain Rules Active");
      expect(html).toContain("Tasks");
      expect(html).toContain("Cost &amp; Budget");
      expect(html).toContain("Schedule &amp; Deadline");
      expect(html).toContain("Fictional sample data");
    });

    it("renders cleanly when budget and deadline constraints are unspecified", () => {
      const planNoConstraints = {
        ...plan,
        constraints: {
          currency: "INR",
        },
      };
      const html = renderToString(<PlanOverview plan={planNoConstraints} />);

      expect(html).toContain("No Budget Limit Set");
      expect(html).toContain("No Deadline Set");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("undefined");
    });

    it("distinguishes unregistered domain badge for custom domain plans", () => {
      const planUnregistered = {
        ...plan,
        domain: "machine-learning-ops",
      };
      const html = renderToString(<PlanOverview plan={planUnregistered} />);

      expect(html).toContain("Unregistered Domain");
      expect(html).toContain("machine-learning-ops");
    });
  });

  describe("2. DisruptionInput Component", () => {
    it("provides the canonical example prompt chips and offline quick load triggers", () => {
      expect(CANONICAL_EXAMPLE_PROMPTS).toHaveLength(3);
      expect(CANONICAL_EXAMPLE_PROMPTS[0].prompt).toBe("The venue is unavailable.");
      expect(CANONICAL_EXAMPLE_PROMPTS[1].prompt).toBe(
        "Reduce our overall budget to ₹16,000."
      );
      expect(CANONICAL_EXAMPLE_PROMPTS[2].prompt).toBe(
        "The deadline has moved two days earlier."
      );

      const html = renderToString(
        <DisruptionInput
          onAnalyzePrompt={async () => {}}
          onDirectScenarioSelect={() => {}}
          isInterpreting={false}
        />
      );

      expect(html).toContain("Venue Cancellation");
      expect(html).toContain("Budget Cut to ₹16,000");
      expect(html).toContain("Deadline Moved 2 Days Earlier");
      expect(html).toContain("Quick Load (Offline)");
      expect(html).toContain("Analyze Change");
    });
  });

  describe("3. InterpretationReview Component", () => {
    it("renders clarification state with explicit questions and blocked recovery", () => {
      const html = renderToString(
        <InterpretationReview
          result={{
            status: "clarification_needed",
            reason: "The disruption does not specify which venue task or budget is modified.",
            clarificationQuestions: [
              "Which task is affected?",
              "What is the new budget or deadline?",
            ],
            originalPrompt: "Something is broken",
          }}
          plan={plan}
          onConfirm={() => {}}
          onCancel={() => {}}
          isRunningRecovery={false}
        />
      );

      expect(html).toContain("Clarification Required Before Recovery");
      expect(html).toContain("Which task is affected?");
      expect(html).toContain("Revise Prompt");
      // Must not display "Run Recovery Engine" button when clarification is needed
      expect(html).not.toContain("Run Recovery Engine");
    });

    it("renders error state with sanitized error and recovery options", () => {
      const html = renderToString(
        <InterpretationReview
          result={{
            status: "error",
            error: "Gemini API rate limit exceeded.",
            originalPrompt: "The venue is gone",
          }}
          plan={plan}
          onConfirm={() => {}}
          onCancel={() => {}}
          isRunningRecovery={false}
        />
      );

      expect(html).toContain("Interpretation Error");
      expect(html).toContain("Gemini API rate limit exceeded.");
      expect(html).toContain("Revise Prompt or Select Scenario");
    });

    it("renders success state with structured fields and Run Recovery Engine action", () => {
      const html = renderToString(
        <InterpretationReview
          result={{
            status: "success",
            disruption: {
              type: "task_unavailable",
              targetTaskId: "T03",
              field: "bookingStatus",
              newValue: "unavailable",
              description: "Main Auditorium is unavailable.",
            },
            originalPrompt: "The venue is unavailable.",
            reasoning: "Matched venue booking task T03.",
          }}
          plan={plan}
          onConfirm={() => {}}
          onCancel={() => {}}
          isRunningRecovery={false}
        />
      );

      expect(html).toContain("Review Interpreted Disruption");
      expect(html).toContain("task_unavailable");
      expect(html).toContain("T03");
      expect(html).toContain("unavailable");
      expect(html).toContain("Run Recovery Engine");
    });
  });

  describe("4. RecoveryComparison Component", () => {
    it("renders winner card, metrics table, and provisional facts warning for S1", () => {
      const scenario = scenariosDoc.scenarios.find(
        (s) => s.id === "S1-venue-cancelled"
      )!;
      const recoveryResult = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: scenario.disruption,
        canonicalPatches: scenario.candidatePatches,
        constraintOverrides: scenario.constraintOverrides,
        rankingPolicy,
        selectedProfile: "preserve_plan",
      });

      const html = renderToString(
        <RecoveryComparison
          recoveryResult={recoveryResult}
          selectedProfile="preserve_plan"
          onSelectProfile={() => {}}
          selectedCandidateId={recoveryResult.winner?.candidateId ?? null}
          onSelectCandidate={() => {}}
        />
      );

      expect(html).toContain("Recovery Candidate Rankings &amp; Trade-offs");
      expect(html).toContain("Preserve the Plan");
      expect(html).toContain("Minimize Spending");
      expect(html).toContain("Protect the Deadline");
      expect(html).toContain("S1-A-community-hall");
      expect(html).toContain("Provisionally Feasible");
      expect(html).toContain("Required Real-World Verifications");
      expect(html).toContain("venue_availability");
      expect(html).toContain("Frontier");
    });

    it("renders empty/infeasible state if all candidates violate hard constraints", () => {
      const scenario = scenariosDoc.scenarios.find(
        (s) => s.id === "S1-venue-cancelled"
      )!;
      const recoveryResult = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: {
          type: "budget_changed",
          field: "budgetLimit",
          oldValue: 25000,
          newValue: 5000,
          description: "Impossible budget of ₹5,000",
        },
        canonicalPatches: scenario.candidatePatches,
        constraintOverrides: { budgetLimit: 5000 },
        rankingPolicy,
        selectedProfile: "preserve_plan",
      });

      const html = renderToString(
        <RecoveryComparison
          recoveryResult={recoveryResult}
          selectedProfile="preserve_plan"
          onSelectProfile={() => {}}
          selectedCandidateId={null}
          onSelectCandidate={() => {}}
        />
      );

      expect(html).toContain("No Feasible Recovery Winner Found");
      expect(html).toContain("hard constraint");
    });
  });

  describe("5. DiffViewer Component", () => {
    it("renders side-by-side cost/finish deltas and task overrides with disclaimer", () => {
      const scenario = scenariosDoc.scenarios.find(
        (s) => s.id === "S1-venue-cancelled"
      )!;
      const recoveryResult = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: scenario.disruption,
        canonicalPatches: scenario.candidatePatches,
        constraintOverrides: scenario.constraintOverrides,
        rankingPolicy,
        selectedProfile: "preserve_plan",
      });

      const candidateEval = recoveryResult.evaluations[0];
      const candidatePatch = recoveryResult.candidates[0];

      const html = renderToString(
        <DiffViewer
          baselinePlan={plan}
          candidateEvaluation={candidateEval}
          candidatePatch={candidatePatch}
          isPreviewActive={false}
          onAcceptPreview={() => {}}
          onRevertPreview={() => {}}
        />
      );

      expect(html).toContain("Candidate Diff &amp; Impact Inspector");
      expect(html).toContain("Total Cost");
      expect(html).toContain("Earliest Finish");
      expect(html).toContain("Remaining Slack");
      expect(html).toContain("Task Modifications");
      expect(html).toContain("Accept &amp; Preview Patch");
      expect(html).toContain("Local Workspace Preview Note");
    });
  });

  describe("6. CustomPlanBuilder Component", () => {
    it("renders prompt-first guided flow with What are you planning?, constraints, and actions", async () => {
      const { CustomPlanBuilder } = await import(
        "../../../src/components/CustomPlanBuilder"
      );
      const html = renderToString(
        <CustomPlanBuilder
          onLoadPlanToWorkspace={() => {}}
          onCancel={() => {}}
          initialMode="prompt"
        />
      );

      expect(html).toContain("Create Your Own Plan");
      expect(html).toContain("What are you planning?");
      expect(html).toContain("Generate Plan Draft");
      expect(html).toContain("Software Template");
      expect(html).toContain("Blank Plan");
      expect(html).toContain("Import JSON");
      expect(html).toContain("Export JSON");
      expect(html).toContain("Budget Limit (₹ INR)");
      expect(html).toContain("Deadline (Hours)");
      expect(html).toContain("Local workspace memory only");
    });

    it("renders manual task matrix with tasks, validation, and workspace opening", async () => {
      const { CustomPlanBuilder } = await import(
        "../../../src/components/CustomPlanBuilder"
      );
      const html = renderToString(
        <CustomPlanBuilder
          onLoadPlanToWorkspace={() => {}}
          onCancel={() => {}}
          initialMode="manual"
        />
      );

      expect(html).toContain("Create Your Own Plan");
      expect(html).toContain("Plan Name");
      expect(html).toContain("Domain / Category");
      expect(html).toContain("Budget Limit (₹ INR)");
      expect(html).toContain("Deadline (Hours)");
      expect(html).toContain("Add Task");
      expect(html).toContain("Validate &amp; Calculate Baseline");
      expect(html).toContain("Open in Recovery Workspace");
    });
  });

  describe("7. Plan-Selection Entry Point in Workspace", () => {
    it("renders both 'Open Demo Plan' and 'Create Your Own Plan' options", async () => {
      const { PlanPatchWorkspace } = await import(
        "../../../src/components/PlanPatchWorkspace"
      );
      const html = renderToString(<PlanPatchWorkspace />);

      expect(html).toContain("Open Demo Plan");
      expect(html).toContain("Create Your Own Plan");
      expect(html).toContain("Campus Tech Fest");
    });
  });
});

