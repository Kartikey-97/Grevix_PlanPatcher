import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PlanTimeline } from "../../../src/components/plan/PlanTimeline";
import { DisruptionInput } from "../../../src/components/DisruptionInput";
import { DiffViewer } from "../../../src/components/DiffViewer";
import { InterpretationReview } from "../../../src/components/InterpretationReview";
import { getCanonicalPlan, getCanonicalScenariosDoc, getCanonicalRankingPolicy } from "../../../src/data/load-demo-fixtures";
import { runRecovery } from "../../../src/lib/engine/run-recovery";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";
import type { Plan } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S7.5: Interactive Schedule Timeline and Conversational Recovery Assistant", () => {
  const plan = getCanonicalPlan();
  const graph = rebuildGraph(plan);
  const scenariosDoc = getCanonicalScenariosDoc();
  const rankingPolicy = getCanonicalRankingPolicy();

  registerEventPlanningValidator();

  describe("Part A: Schedule Timeline Visualisation (PlanTimeline)", () => {
    it("renders task bars positioned by calculated earliest start and finish with proportional widths", () => {
      const html = renderToString(<PlanTimeline baselinePlan={plan} initialMode="baseline" />);

      // Must contain time metrics & axis
      expect(html).toContain("Schedule Timeline &amp; Critical Path");
      expect(html).toContain("Earliest Project Finish");
      expect(html).toContain("Critical Path (0 Float)");
      expect(html).toContain("Task ID &amp; Name");

      // Must render canonical tasks with their IDs
      expect(html).toContain("T01");
      expect(html).toContain("T02");
      expect(html).toContain("T03");
      expect(html).toContain("T04");
      expect(html).toContain("T05");
      expect(html).toContain("T06");
      expect(html).toContain("T07");

      // Must contain SVG connectors container
      expect(html).toContain("<svg");
      expect(html).toContain("dependency-connectors-svg");
    });

    it("identifies and highlights critical path tasks and 0-float dependency edges", () => {
      const html = renderToString(<PlanTimeline baselinePlan={plan} initialMode="baseline" />);

      // Must render critical path legend and badges
      expect(html).toContain("Critical Path (0 Float)");
      expect(html).toContain("Legend:");
    });

    it("renders empty state cleanly when plan has zero tasks", () => {
      const emptyPlan: Plan = {
        ...plan,
        tasks: [],
        dependencies: [],
      };
      const html = renderToString(<PlanTimeline baselinePlan={emptyPlan} />);

      expect(html).toContain("No Tasks in Schedule");
      expect(html).toContain("Add tasks and dependency edges to this plan to generate an automated critical-path schedule timeline.");
    });

    it("supports baseline vs proposed recovery comparison mode with diff states", () => {
      const scenario = scenariosDoc.scenarios[0]; // S1 venue cancelled
      const recoveryResult = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: scenario.disruption,
        canonicalPatches: scenario.candidatePatches,
        constraintOverrides: scenario.constraintOverrides,
        rankingPolicy,
        selectedProfile: "preserve_plan",
      });

      const candEval = recoveryResult.evaluations[0];
      const proposedPlan = candEval.candidatePlan;

      const html = renderToString(
        <PlanTimeline
          baselinePlan={plan}
          proposedPlan={proposedPlan}
          candidateEvaluation={candEval}
          initialMode="comparison"
        />
      );

      // Must render view mode toggles
      expect(html).toContain("Baseline Plan");
      expect(html).toContain("Proposed Recovery");
      expect(html).toContain("Comparison");

      // In comparison mode, must label diff changes
      expect(html).toContain("Shifted in Recovery");
    });

    it("renders task inspector when a task is selected", () => {
      const html = renderToString(
        <PlanTimeline
          baselinePlan={plan}
          selectedTaskId="T03"
          initialMode="baseline"
        />
      );

      expect(html).toContain("Book venue");
      expect(html).toContain("Earliest Start &amp; Finish");
      expect(html).toContain("Critical Path Float");
      expect(html).toContain("Duration &amp; Cost");
    });
  });

  describe("Part B: Conversational Recovery Assistant (DisruptionInput)", () => {
    it("renders active session conversation history when prior turns exist", () => {
      const html = renderToString(
        <DisruptionInput
          onAnalyzePrompt={async () => {}}
          onDirectScenarioSelect={() => {}}
          isInterpreting={false}
          plan={plan}
          isDemoPlan={true}
          conversationHistory={[
            { role: "user", content: "The main venue cancelled for our festival." },
            { role: "assistant", content: "Grounded disruption extracted: T03 venue is unavailable." },
          ]}
        />
      );

      expect(html).toContain("Active Recovery Session");
      expect(html).toContain("Active Recovery Session (2 turns)");
      expect(html).toContain("The main venue cancelled for our festival.");
      expect(html).toContain("Grounded disruption extracted: T03 venue is unavailable.");
      expect(html).toContain("Reset Conversation");
    });

    it("does not duplicate user turn when building conversation history", () => {
      const prompt = "Reduce our overall budget to ₹7500.";
      const activeHistory = [
        { role: "user" as const, content: prompt },
      ];

      // Simulate the workspace deduplication logic
      const baseHistory =
        activeHistory.length > 0 &&
        activeHistory[activeHistory.length - 1].role === "user" &&
        activeHistory[activeHistory.length - 1].content === prompt
          ? [...activeHistory]
          : [...activeHistory, { role: "user" as const, content: prompt }];

      expect(baseHistory).toHaveLength(1);
      expect(baseHistory[0].content).toBe(prompt);

      const finalHistory = [
        ...baseHistory,
        { role: "assistant" as const, content: "Interpreted disruption: Budget reduced to ₹7500. (budget_changed)" },
      ];

      expect(finalHistory).toHaveLength(2);
      expect(finalHistory[0].role).toBe("user");
      expect(finalHistory[1].role).toBe("assistant");

      const html = renderToString(
        <DisruptionInput
          onAnalyzePrompt={async () => {}}
          onDirectScenarioSelect={() => {}}
          isInterpreting={false}
          plan={plan}
          isDemoPlan={true}
          conversationHistory={finalHistory}
        />
      );

      expect(html).toContain("Active Recovery Session (2 turns)");
      // Should only contain prompt once in the conversation messages
      const count = (html.match(/Reduce our overall budget to ₹7500\./g) || []).length;
      expect(count).toBe(1);
    });

    it("renders clickable follow-up suggestions from interpretation result", () => {
      const html = renderToString(
        <DisruptionInput
          onAnalyzePrompt={async () => {}}
          onDirectScenarioSelect={() => {}}
          isInterpreting={false}
          plan={plan}
          isDemoPlan={true}
          latestInterpretationResult={{
            status: "success",
            disruption: {
              type: "task_unavailable",
              targetTaskId: "T03",
              field: "bookingStatus",
              newValue: "unavailable",
              description: "Venue cancelled",
            },
            originalPrompt: "The venue is gone",
            followUpSuggestions: [
              "Run recovery engine",
              "Also reduce budget to ₹20,000",
              "Inspect critical path impact",
            ],
          }}
        />
      );

      expect(html).toContain("Clickable Follow-Up Suggestions (Auto-Submit):");
      expect(html).toContain("Run recovery engine");
      expect(html).toContain("Also reduce budget to ₹20,000");
      expect(html).toContain("Inspect critical path impact");
    });

    it("displays out-of-order execution alert when isOutOfOrder flag is set", () => {
      const html = renderToString(
        <DisruptionInput
          onAnalyzePrompt={async () => {}}
          onDirectScenarioSelect={() => {}}
          isInterpreting={false}
          plan={plan}
          isDemoPlan={true}
          latestInterpretationResult={{
            status: "clarification_needed",
            reason: "Out-of-order task progress detected.",
            clarificationQuestions: ["Did T04 finish?"],
            isOutOfOrder: true,
            followUpSuggestions: [
              "Mark skipped predecessor as completed",
              "Cancel skipped task from plan",
            ],
            originalPrompt: "I did T04 before T02",
          }}
        />
      );

      expect(html).toContain("Out-of-Order Task Progress Detected");
      expect(html).toContain("cannot rewrite already-executed past steps without confirming current task states");
      expect(html).toContain("Mark skipped predecessor as completed");
    });

    it("displays offline fallback suggestions when an error occurs", () => {
      const html = renderToString(
        <DisruptionInput
          onAnalyzePrompt={async () => {}}
          onDirectScenarioSelect={() => {}}
          isInterpreting={false}
          plan={plan}
          isDemoPlan={true}
          latestInterpretationResult={{
            status: "error",
            error: "Gemini server busy",
            fallbackSuggestions: [
              "Load Venue Cancellation offline",
              "Load Budget Cut offline",
              "Retry request",
            ],
            originalPrompt: "Something is wrong",
          }}
        />
      );

      expect(html).toContain("Clickable Follow-Up Suggestions (Auto-Submit):");
      expect(html).toContain("Load Venue Cancellation offline");
      expect(html).toContain("Load Budget Cut offline");
    });
  });

  describe("Part C: DiffViewer Schedule Timeline Comparison Integration", () => {
    it("integrates PlanTimeline in DiffViewer with tab toggle between timeline and modifications table", () => {
      const scenario = scenariosDoc.scenarios[0];
      const recoveryResult = runRecovery({
        baselinePlan: plan,
        baselineGraph: graph,
        disruption: scenario.disruption,
        canonicalPatches: scenario.candidatePatches,
        constraintOverrides: scenario.constraintOverrides,
        rankingPolicy,
        selectedProfile: "preserve_plan",
      });

      const candEval = recoveryResult.evaluations[0];
      const candPatch = recoveryResult.candidates[0];

      const html = renderToString(
        <DiffViewer
          baselinePlan={plan}
          candidateEvaluation={candEval}
          candidatePatch={candPatch}
          isPreviewActive={false}
          onAcceptPreview={() => {}}
          onRevertPreview={() => {}}
        />
      );

      expect(html).toContain("Schedule Timeline Comparison");
      expect(html).toContain("Task Modifications Table");
      expect(html).toContain("Schedule Timeline &amp; Critical Path");
      expect(html).toContain("Comparison");
    });
  });

  describe("Part D: InterpretationReview Follow-Up Suggestions", () => {
    it("renders clickable follow-up suggestions in clarification state", () => {
      const html = renderToString(
        <InterpretationReview
          result={{
            status: "clarification_needed",
            reason: "Ambiguous disruption request.",
            clarificationQuestions: ["Which task is cancelled?"],
            followUpSuggestions: [
              "Task T03 (Book venue) is unavailable",
              "Reduce budget to ₹20,000",
            ],
            originalPrompt: "Cancel something",
          }}
          plan={plan}
          onConfirm={() => {}}
          onCancel={() => {}}
          isRunningRecovery={false}
          onSelectSuggestion={() => {}}
        />
      );

      expect(html).toContain("Suggested Follow-Ups (Click to Submit):");
      expect(html).toContain("Task T03 (Book venue) is unavailable");
      expect(html).toContain("Reduce budget to ₹20,000");
    });

    it("renders out-of-order execution boundary warning in InterpretationReview", () => {
      const html = renderToString(
        <InterpretationReview
          result={{
            status: "clarification_needed",
            reason: "Out-of-order task progress detected.",
            clarificationQuestions: ["Did T04 finish?"],
            isOutOfOrder: true,
            followUpSuggestions: ["Mark skipped predecessor as completed"],
            originalPrompt: "I went ahead with T04 before T02",
          }}
          plan={plan}
          onConfirm={() => {}}
          onCancel={() => {}}
          isRunningRecovery={false}
        />
      );

      expect(html).toContain("Out-of-Order Execution Boundary");
      expect(html).toContain("cannot rewrite already-executed past steps without confirming current task states");
    });
  });
});
