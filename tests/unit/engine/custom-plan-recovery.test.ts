import { describe, it, expect } from "vitest";
import { runRecovery } from "../../../src/lib/engine/run-recovery";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { generateSmartFallbackDraftPlan } from "../../../src/lib/ai/draft-plan-interpreter";
import { convertDraftToPlan } from "../../../src/lib/schemas/draft-plan.schema";
import type { Disruption } from "../../../src/lib/schemas/scenario.schema";

describe("Milestone Challenge 3 — Custom Plan Recovery with Declared Alternatives", () => {
  const draft = generateSmartFallbackDraftPlan({
    prompt: "I want to learn how to cook delicious healthy meals",
  });
  const plan = convertDraftToPlan(draft);
  const graph = rebuildGraph(plan);

  it("verifies culinary draft declares recovery alternatives and optional tasks", () => {
    expect(plan.tasks.length).toBeGreaterThanOrEqual(4);

    const t02 = plan.tasks.find((t) => t.id === "T02");
    expect(t02).toBeDefined();
    expect(t02?.alternatives).toBeDefined();
    expect(t02?.alternatives?.length).toBeGreaterThanOrEqual(1);

    const t04 = plan.tasks.find((t) => t.id === "T04");
    expect(t04).toBeDefined();
    expect(t04?.policy).toBe("optional");

    expect(plan.demoAlternatives).toBeDefined();
    expect(Object.keys(plan.demoAlternatives!)).toContain("alt-t02-pantry-searing");
  });

  it("successfully finds feasible recovery winner when T02 becomes unavailable (Disruption 1)", () => {
    const disruption: Disruption = {
      type: "task_unavailable",
      targetTaskId: "T02",
      field: "bookingStatus",
      newValue: "unavailable",
      description: "Heat Control & Sautéing Techniques is unavailable.",
    };

    const recoveryResult = runRecovery({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
    });

    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.hasFeasibleWinner).toBe(true);
    expect(recoveryResult.winner).toBeDefined();
    expect(
      recoveryResult.feasibleCount + recoveryResult.provisionallyFeasibleCount
    ).toBeGreaterThan(0);
    expect(recoveryResult.generatedCandidateCount).toBeGreaterThan(0);

    // The winning candidate must replace T02 with one of its declared alternatives
    const winnerCandidate = recoveryResult.candidates.find(
      (c) => c.id === recoveryResult.winner?.candidateId
    );
    expect(winnerCandidate).toBeDefined();
    expect(winnerCandidate!.changedTaskIds).toContain("T02");
    expect(
      winnerCandidate!.id.includes("alt-t02-pantry-searing") ||
      winnerCandidate!.id.includes("alt-t02-express-saute")
    ).toBe(true);

    // Provenance of unverified facts must be preserved
    expect(winnerCandidate!.unknownFacts.length).toBeGreaterThan(0);
  });

  it("successfully finds feasible recovery winner under reduced budget (Disruption 2)", () => {
    const totalCost = plan.tasks.reduce((sum, t) => sum + t.cost, 0);
    const reducedBudget = Math.round(totalCost * 0.75); // 25% budget cut

    const disruption: Disruption = {
      type: "budget_changed",
      field: "budgetLimit",
      oldValue: totalCost,
      newValue: reducedBudget,
      description: `Budget reduced to ₹${reducedBudget}.`,
    };

    const recoveryResult = runRecovery({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
      constraintOverrides: { budgetLimit: reducedBudget },
    });

    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.hasFeasibleWinner).toBe(true);
    expect(recoveryResult.winner).toBeDefined();
    expect(
      recoveryResult.feasibleCount + recoveryResult.provisionallyFeasibleCount
    ).toBeGreaterThan(0);
    const winnerEval = recoveryResult.evaluations.find(
      (e) => e.candidateId === recoveryResult.winner?.candidateId
    );
    expect(winnerEval).toBeDefined();
    // Winner evaluation totalCost must not exceed reducedBudget
    expect(winnerEval!.projectedTotalCost).toBeLessThanOrEqual(reducedBudget);
  });

  it("successfully finds feasible recovery winner under tightened deadline (Disruption 3)", () => {
    const baseDuration = plan.tasks.reduce((sum, t) => sum + t.durationHours, 0);
    const tightenedDeadline = Math.round(baseDuration * 0.75); // 25% tighter schedule

    const disruption: Disruption = {
      type: "deadline_changed",
      field: "deadlineHours",
      oldValue: baseDuration,
      newValue: tightenedDeadline,
      description: `Deadline tightened to ${tightenedDeadline} hours.`,
    };

    const recoveryResult = runRecovery({
      baselinePlan: plan,
      baselineGraph: graph,
      disruption,
      constraintOverrides: { deadlineHours: tightenedDeadline },
    });

    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.hasFeasibleWinner).toBe(true);
    expect(recoveryResult.winner).toBeDefined();
    expect(
      recoveryResult.feasibleCount + recoveryResult.provisionallyFeasibleCount
    ).toBeGreaterThan(0);
    const winnerEval = recoveryResult.evaluations.find(
      (e) => e.candidateId === recoveryResult.winner?.candidateId
    );
    expect(winnerEval).toBeDefined();
    // Winner evaluation hard constraints must pass
    expect(winnerEval!.validation.hardConstraintsPass).toBe(true);
  });
});
