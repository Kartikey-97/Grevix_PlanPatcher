import { describe, it, expect, beforeEach } from "vitest";
import {
  validateCustomPlan,
  createDefaultCustomPlan,
  createEmptyCustomPlan,
  exportPlanToJson,
  importPlanFromJson,
} from "../../../src/lib/engine/custom-plan";
import { runRecovery } from "../../../src/lib/engine/run-recovery";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { getCanonicalPlan } from "../../../src/data/load-demo-fixtures";
import { registerEventPlanningValidator } from "../../../src/lib/engine/event-planning-validator";
import type { Plan } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S7.2: Custom Plan Engine & Validation (custom-plan.ts)", () => {
  beforeEach(() => {
    registerEventPlanningValidator();
  });
  describe("1. Valid Generic Plan Creation & Baseline Schedule Calculation", () => {
    it("validates a software engineering project (Dev -> Testing -> Deploy) through the real engine", () => {
      const softwarePlan: Plan = {
        schemaVersion: "1.0.0",
        id: "saas-app-v1",
        name: "SaaS App v1.0",
        domain: "software-engineering",
        description: "Cloud application development milestone",
        planRevision: 1,
        constraints: {
          budgetLimit: 80000,
          currency: "INR",
          deadlineHours: 120,
        },
        scoring: {
          changeFootprintDenominator: "originalTaskCount",
          lostTaskValueDenominator: "sumOfOriginalTaskPriorities",
          uncertaintyFactCount: 5,
          scheduleShiftReferenceHours: 8,
          deadlineSlackReferenceHours: 24,
        },
        tasks: [
          {
            id: "DEV",
            title: "Core Feature Development",
            cost: 35000,
            durationHours: 48,
            priority: 5,
            policy: "fixed",
            status: "pending",
            inputs: {},
            outputs: {},
          },
          {
            id: "TEST",
            title: "Automated QA & Integration Tests",
            cost: 20000,
            durationHours: 24,
            priority: 4,
            policy: "replaceable",
            status: "pending",
            inputs: {},
            outputs: {},
          },
          {
            id: "DEPLOY",
            title: "Zero-Downtime Deployment",
            cost: 10000,
            durationHours: 8,
            priority: 5,
            policy: "fixed",
            status: "pending",
            inputs: {},
            outputs: {},
          },
        ],
        dependencies: [
          {
            id: "dep-dev-test",
            fromTaskId: "DEV",
            toTaskId: "TEST",
            blocksExecution: true,
            fieldMappings: [],
            origin: "manual",
            confirmationStatus: "confirmed",
            modificationHistory: [],
          },
          {
            id: "dep-test-deploy",
            fromTaskId: "TEST",
            toTaskId: "DEPLOY",
            blocksExecution: true,
            fieldMappings: [],
            origin: "manual",
            confirmationStatus: "confirmed",
            modificationHistory: [],
          },
        ],
      };

      const result = validateCustomPlan(softwarePlan);

      expect(result.isValid).toBe(true);
      expect(result.schemaErrors).toHaveLength(0);
      expect(result.graphErrors).toHaveLength(0);
      expect(result.schedule).toBeDefined();

      // Topological Earliest Finish = 48 + 24 + 8 = 80 hours
      expect(result.schedule?.projectFinishHours).toBe(80);
      // Deadline Slack = 120 - 80 = 40 hours
      expect(result.schedule?.projectSlack).toBe(40);
      expect(result.schedule?.isDeadlineFeasible).toBe(true);

      // Total Cost = 35,000 + 20,000 + 10,000 = 65,000
      const totalCost = softwarePlan.tasks.reduce((sum, t) => sum + t.cost, 0);
      expect(totalCost).toBe(65000);

      // Critical Path contains all 3 sequential tasks
      expect(result.schedule?.criticalTaskIds).toEqual(
        expect.arrayContaining(["DEV", "TEST", "DEPLOY"])
      );
    });

    it("creates and validates the default template without errors", () => {
      const defaultPlan = createDefaultCustomPlan();
      const result = validateCustomPlan(defaultPlan);

      expect(result.isValid).toBe(true);
      expect(result.plan?.tasks.length).toBe(6);
      expect(result.plan?.dependencies.length).toBe(7);
      expect(result.schedule?.projectFinishHours).toBeGreaterThan(0);
    });

    it("creates and validates an empty starter plan with 1 task", () => {
      const emptyPlan = createEmptyCustomPlan();
      const result = validateCustomPlan(emptyPlan);

      expect(result.isValid).toBe(true);
      expect(result.plan?.tasks.length).toBe(1);
      expect(result.schedule?.projectFinishHours).toBe(10);
    });
  });

  describe("2. Cycle and Dependency Graph Rejection", () => {
    it("rejects a direct dependency cycle (T01 -> T02 -> T01) with clear diagnostics", () => {
      const cyclicPlan = createDefaultCustomPlan();
      // Introduce cycle by adding T06 -> T01 (since T01 already reaches T06)
      cyclicPlan.dependencies.push({
        id: "dep-cycle",
        fromTaskId: "T06",
        toTaskId: "T01",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateCustomPlan(cyclicPlan);

      expect(result.isValid).toBe(false);
      expect(result.graphErrors.length).toBeGreaterThan(0);
      expect(result.graphErrors.some((e) => e.includes("Cycle"))).toBe(true);
      expect(result.schedule).toBeUndefined(); // Refuses to schedule cyclic graph
    });

    it("rejects missing task endpoints (dependency referencing nonexistent task)", () => {
      const brokenPlan = createDefaultCustomPlan();
      brokenPlan.dependencies.push({
        id: "dep-ghost",
        fromTaskId: "T01",
        toTaskId: "NON_EXISTENT_TASK_99",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateCustomPlan(brokenPlan);

      expect(result.isValid).toBe(false);
      expect(result.graphErrors.some((e) => e.includes("MISSING_TASK_ENDPOINT"))).toBe(
        true
      );
    });

    it("rejects self-loop dependency (T01 -> T01)", () => {
      const selfLoopPlan = createDefaultCustomPlan();
      selfLoopPlan.dependencies.push({
        id: "dep-self",
        fromTaskId: "T01",
        toTaskId: "T01",
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateCustomPlan(selfLoopPlan);

      expect(result.isValid).toBe(false);
      expect(result.graphErrors.some((e) => e.includes("SELF_LOOP"))).toBe(true);
    });
  });

  describe("3. Schema Validation Failures", () => {
    it("rejects negative costs with specific field error", () => {
      const badPlan = createDefaultCustomPlan();
      badPlan.tasks[0].cost = -5000;

      const result = validateCustomPlan(badPlan);

      expect(result.isValid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes("tasks.0.cost"))).toBe(true);
    });

    it("rejects negative task duration", () => {
      const badPlan = createDefaultCustomPlan();
      badPlan.tasks[0].durationHours = -12;

      const result = validateCustomPlan(badPlan);

      expect(result.isValid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes("tasks.0.durationHours"))).toBe(
        true
      );
    });

    it("rejects invalid task priority outside 1..5 range", () => {
      const badPlan = createDefaultCustomPlan();
      badPlan.tasks[0].priority = 10;

      const result = validateCustomPlan(badPlan);

      expect(result.isValid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes("tasks.0.priority"))).toBe(true);
    });

    it("rejects negative budgetLimit in global constraints", () => {
      const badPlan = createDefaultCustomPlan();
      badPlan.constraints.budgetLimit = -10000;

      const result = validateCustomPlan(badPlan);

      expect(result.isValid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes("constraints.budgetLimit"))).toBe(
        true
      );
    });
  });

  describe("4. Unknown Domain Handling & Verification Tiering", () => {
    it("flags unregistered domain as unverified without crashing or fabricating rules", () => {
      const customPlan = createDefaultCustomPlan();
      customPlan.domain = "biotech-research";

      const result = validateCustomPlan(customPlan);

      expect(result.isValid).toBe(true); // Structure is valid
      expect(result.isDomainVerified).toBe(false); // But domain constraints are unverified
      expect(result.warnings.some((w) => w.includes("Unverified Domain"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("biotech-research"))).toBe(true);
    });

    it("recognizes registered event-planning domain as domain verified", () => {
      const eventPlan = createDefaultCustomPlan();
      eventPlan.domain = "event-planning";

      const result = validateCustomPlan(eventPlan);

      expect(result.isValid).toBe(true);
      expect(result.isDomainVerified).toBe(true);
    });
  });

  describe("5. JSON Import & Export Round-Trip", () => {
    it("exports a valid plan to JSON and successfully re-imports it intact", () => {
      const original = createDefaultCustomPlan();
      const exportedJson = exportPlanToJson(original);

      expect(typeof exportedJson).toBe("string");
      expect(exportedJson).toContain("Enterprise Web App Release");

      const importResult = importPlanFromJson(exportedJson);
      expect(importResult.success).toBe(true);
      expect(importResult.plan).toEqual(original);
    });

    it("rejects malformed JSON syntax on import", () => {
      const malformedJson = "{ name: 'Broken JSON', ";
      const result = importPlanFromJson(malformedJson);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid JSON syntax");
    });

    it("rejects structurally invalid plan JSON on import", () => {
      const invalidPlanJson = JSON.stringify({
        name: "Missing required fields",
        tasks: [],
      });
      const result = importPlanFromJson(invalidPlanJson);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Schema error");
    });
  });

  describe("6. Isolation from Canonical Demo Fixture", () => {
    it("ensures custom plan creation and mutation never alter canonical fixture", () => {
      const snapshotBefore = JSON.stringify(getCanonicalPlan());

      // Create, mutate, and validate a custom plan
      const custom = createDefaultCustomPlan();
      custom.name = "Mutated Custom Name";
      custom.tasks[0].title = "Custom Title";
      custom.tasks[0].cost = 999999;
      validateCustomPlan(custom);

      const snapshotAfter = JSON.stringify(getCanonicalPlan());
      expect(snapshotAfter).toBe(snapshotBefore);
    });
  });

  describe("7. Execution Through Real Recovery Engine", () => {
    it("runs recovery orchestrator with custom software plan and budget reduction", () => {
      const customPlan = createDefaultCustomPlan();
      const customGraph = rebuildGraph(customPlan);

      const recoveryResult = runRecovery({
        baselinePlan: customPlan,
        baselineGraph: customGraph,
        disruption: {
          type: "budget_changed",
          field: "budgetLimit",
          oldValue: 95000,
          newValue: 70000,
          description: "Cut development budget to ₹70,000",
        },
        selectedProfile: "preserve_plan",
      });

      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.baselinePreserved).toBe(true);
      expect(recoveryResult.effectiveConstraintOverrides.budgetLimit).toBe(70000);
      expect(recoveryResult.disruption.newValue).toBe(70000);
    });
  });
});
