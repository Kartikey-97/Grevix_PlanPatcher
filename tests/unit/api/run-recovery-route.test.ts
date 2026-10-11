import { describe, it, expect, beforeEach } from "vitest";
import { handleRunRecovery } from "../../../src/app/api/run-recovery/route-handler";
import {
  getCanonicalPlan,
  getCanonicalScenariosDoc,
  getCanonicalExpectedResults,
} from "../../../src/data/load-demo-fixtures";
import type { RunRecoveryResult } from "../../../src/lib/engine/run-recovery";

describe("Milestone S7: /api/run-recovery Route Handler", () => {
  const plan = getCanonicalPlan();
  const scenariosDoc = getCanonicalScenariosDoc();
  const expectedResultsDoc = getCanonicalExpectedResults();

  it("returns 400 on malformed JSON payload", async () => {
    const request = new Request("http://localhost:3000/api/run-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json{{",
    });

    const response = await handleRunRecovery(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Malformed JSON");
  });

  it("returns 400 on missing or invalid disruption structure", async () => {
    const request = new Request("http://localhost:3000/api/run-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "S1-venue-cancelled",
        // disruption is missing
      }),
    });

    const response = await handleRunRecovery(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid recovery request");
  });

  it("returns clarification requirement on nonexistent target task ID", async () => {
    const request = new Request("http://localhost:3000/api/run-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disruption: {
          type: "task_unavailable",
          targetTaskId: "T999_NONEXISTENT",
          field: "bookingStatus",
          newValue: "unavailable",
          description: "Nonexistent task is cancelled",
        },
        selectedProfile: "preserve_plan",
      }),
    });

    const response = await handleRunRecovery(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as RunRecoveryResult;
    expect(body.success).toBe(false);
    expect(body.clarificationRequired).toBe(true);
    expect(body.clarificationReasons.some((r) => r.includes("T999_NONEXISTENT"))).toBe(true);
  });

  it("orchestrates canonical S1 (venue cancellation) and matches all profile winners", async () => {
    const scenario = scenariosDoc.scenarios.find((s) => s.id === "S1-venue-cancelled")!;

    for (const profile of ["preserve_plan", "minimize_spending", "protect_deadline"] as const) {
      const request = new Request("http://localhost:3000/api/run-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: "S1-venue-cancelled",
          disruption: scenario.disruption,
          selectedProfile: profile,
          plan,
        }),
      });

      const response = await handleRunRecovery(request);
      expect(response.status).toBe(200);

      const body = (await response.json()) as RunRecoveryResult;
      expect(body.success).toBe(true);
      expect(body.hasFeasibleWinner).toBe(true);

      const expectedWinner = expectedResultsDoc.expectedWinners["S1-venue-cancelled"][profile];
      expect(body.winner?.candidateId).toBe(expectedWinner);
    }
  });

  it("orchestrates canonical S2 (budget reduction) and matches all profile winners", async () => {
    const scenario = scenariosDoc.scenarios.find((s) => s.id === "S2-budget-cut")!;

    for (const profile of ["preserve_plan", "minimize_spending", "protect_deadline"] as const) {
      const request = new Request("http://localhost:3000/api/run-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: "S2-budget-cut",
          disruption: scenario.disruption,
          selectedProfile: profile,
          plan,
        }),
      });

      const response = await handleRunRecovery(request);
      expect(response.status).toBe(200);

      const body = (await response.json()) as RunRecoveryResult;
      expect(body.success).toBe(true);
      expect(body.hasFeasibleWinner).toBe(true);

      const expectedWinner = expectedResultsDoc.expectedWinners["S2-budget-cut"][profile];
      expect(body.winner?.candidateId).toBe(expectedWinner);
    }
  });

  it("orchestrates canonical S3 (deadline moved earlier) and matches all profile winners", async () => {
    const scenario = scenariosDoc.scenarios.find((s) => s.id === "S3-deadline-moved-earlier")!;

    for (const profile of ["preserve_plan", "minimize_spending", "protect_deadline"] as const) {
      const request = new Request("http://localhost:3000/api/run-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: "S3-deadline-moved-earlier",
          disruption: scenario.disruption,
          selectedProfile: profile,
          plan,
        }),
      });

      const response = await handleRunRecovery(request);
      expect(response.status).toBe(200);

      const body = (await response.json()) as RunRecoveryResult;
      expect(body.success).toBe(true);
      expect(body.hasFeasibleWinner).toBe(true);

      const expectedWinner = expectedResultsDoc.expectedWinners["S3-deadline-moved-earlier"][profile];
      expect(body.winner?.candidateId).toBe(expectedWinner);
    }
  });

  it("handles impossible constraint disruption with hasFeasibleWinner: false and descriptive reason", async () => {
    const request = new Request("http://localhost:3000/api/run-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "S1-venue-cancelled",
        disruption: {
          type: "budget_changed",
          field: "budgetLimit",
          oldValue: 25000,
          newValue: 5000, // Impossibly low budget: baseline is 22000, best alternative is 15000
          description: "Extreme budget collapse to ₹5,000",
        },
        selectedProfile: "preserve_plan",
        plan,
      }),
    });

    const response = await handleRunRecovery(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as RunRecoveryResult;
    expect(body.success).toBe(true);
    expect(body.hasFeasibleWinner).toBe(false);
    expect(body.noWinnerReason).toBeDefined();
    expect(body.noWinnerReason).toContain("hard constraint");
  });
});
