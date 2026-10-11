import { describe, it, expect } from "vitest";
import {
  validateConstraints,
  registerDomainValidator,
  unregisterDomainValidator,
  type DomainConstraintValidator,
} from "../../../src/lib/engine/validate-constraints";
import "../../../src/lib/engine/event-planning-validator"; // auto-registers eventPlanningValidator
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S5B.1: Generic Constraint Validator Registry & Domain Rule Decoupling", () => {
  // Helper to create a generic, domain-free software / non-event plan
  function createGenericNonEventPlan(overrides?: Partial<Plan>): Plan {
    return {
      schemaVersion: "1.0.0",
      id: "cloud-deployment-plan",
      name: "Cloud Infrastructure Deployment",
      planRevision: 1,
      domain: "software-engineering",
      constraints: {
        budgetLimit: 5000,
        currency: "USD",
        deadlineHours: 50,
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
          id: "ProvisionDB",
          title: "Provision PostgreSQL Database",
          cost: 1200,
          durationHours: 6,
          priority: 5,
          policy: "fixed",
          status: "confirmed",
          inputs: {},
          outputs: { connectionString: "postgres://db:5432" },
        },
        {
          id: "DeployBackend",
          title: "Deploy Containerized Backend",
          cost: 800,
          durationHours: 4,
          priority: 4,
          policy: "replaceable",
          status: "confirmed",
          inputs: { dbUrl: "postgres://db:5432" },
          outputs: { apiEndpoint: "https://api.example.com" },
        },
        {
          id: "RunSmokeTests",
          title: "Execute API Smoke Tests",
          cost: 300,
          durationHours: 2,
          priority: 3,
          policy: "replaceable",
          status: "confirmed",
          inputs: { targetUrl: "https://api.example.com" },
          outputs: { testsPassed: true },
        },
      ],
      dependencies: [
        {
          id: "D_DB_Backend",
          fromTaskId: "ProvisionDB",
          toTaskId: "DeployBackend",
          blocksExecution: true,
          fieldMappings: [{ sourceField: "connectionString", targetInput: "dbUrl", optional: false }],
          reason: "Backend requires database connection string.",
          origin: "manual",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        },
        {
          id: "D_Backend_Tests",
          fromTaskId: "DeployBackend",
          toTaskId: "RunSmokeTests",
          blocksExecution: true,
          fieldMappings: [{ sourceField: "apiEndpoint", targetInput: "targetUrl", optional: false }],
          reason: "Smoke tests target live backend endpoint.",
          origin: "manual",
          confirmationStatus: "confirmed",
          modificationHistory: [],
        },
      ],
      ...overrides,
    };
  }

  describe("1. Generic Budget Constraints", () => {
    it("omitted budget disables the budget constraint check cleanly", () => {
      const plan = createGenericNonEventPlan();
      delete plan.constraints.budgetLimit;

      const result = validateConstraints({ candidatePlan: plan });

      expect(result.budgetPass).toBe(true);
      expect(result.metrics.budgetLimit).toBeUndefined();
      expect(result.metrics.budgetMargin).toBeUndefined();
      expect(result.issues.some((i) => i.code === "BUDGET_EXCEEDED")).toBe(false);
    });

    it("zero budget permits zero-cost plans and rejects non-zero cost plans", () => {
      const plan = createGenericNonEventPlan();
      plan.constraints.budgetLimit = 0;

      // Plan has positive cost (1200 + 800 + 300 = 2300 > 0)
      const resNonZero = validateConstraints({ candidatePlan: plan });
      expect(resNonZero.budgetPass).toBe(false);
      expect(resNonZero.hardConstraintsPass).toBe(false);
      expect(resNonZero.issues.some((i) => i.code === "BUDGET_EXCEEDED")).toBe(true);

      // Set all costs to 0
      plan.tasks.forEach((t) => (t.cost = 0));
      const resZeroCost = validateConstraints({ candidatePlan: plan });
      expect(resZeroCost.budgetPass).toBe(true);
      expect(resZeroCost.metrics.totalCost).toBe(0);
      expect(resZeroCost.metrics.budgetMargin).toBe(0);
    });

    it("budget violation is flagged as a hard constraint failure", () => {
      const plan = createGenericNonEventPlan();
      // Total cost = 2300; set budget to 2000
      plan.constraints.budgetLimit = 2000;

      const result = validateConstraints({ candidatePlan: plan });
      expect(result.budgetPass).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === "BUDGET_EXCEEDED")).toBe(true);
    });
  });

  describe("2. Generic Deadline Feasibility", () => {
    it("deadline violation is detected using the pure scheduler", () => {
      const plan = createGenericNonEventPlan();
      // ProvisionDB (6h) -> DeployBackend (4h) -> RunSmokeTests (2h) = 12h
      // Set deadline to 10h (infeasible)
      plan.constraints.deadlineHours = 10;

      const result = validateConstraints({ candidatePlan: plan });
      expect(result.deadlinePass).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.metrics.projectFinishHours).toBe(12);
      expect(result.metrics.deadlineHours).toBe(10);
      expect(result.metrics.deadlineSlackHours).toBe(-2);
      expect(result.issues.some((i) => i.code === "DEADLINE_EXCEEDED")).toBe(true);
    });

    it("feasible deadline passes cleanly", () => {
      const plan = createGenericNonEventPlan();
      plan.constraints.deadlineHours = 15; // 12h <= 15h

      const result = validateConstraints({ candidatePlan: plan });
      expect(result.deadlinePass).toBe(true);
      expect(result.metrics.deadlineSlackHours).toBe(3);
    });
  });

  describe("3. Fixed-Task Preservation", () => {
    it("detects modification of a fixed task relative to baseline", () => {
      const basePlan = createGenericNonEventPlan();
      const candPlan: Plan = JSON.parse(JSON.stringify(basePlan));
      // ProvisionDB is fixed: modify its duration
      candPlan.tasks.find((t) => t.id === "ProvisionDB")!.durationHours = 10;

      const result = validateConstraints({
        baselinePlan: basePlan,
        candidatePlan: candPlan,
      });

      expect(result.fixedTasksPreserved).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.issues.some((i) => i.code === "FIXED_TASK_MODIFIED")).toBe(true);
      expect(result.issues.find((i) => i.code === "FIXED_TASK_MODIFIED")?.affectedTaskIds).toContain("ProvisionDB");
    });

    it("detects removal of a fixed task relative to baseline", () => {
      const basePlan = createGenericNonEventPlan();
      const candPlan: Plan = JSON.parse(JSON.stringify(basePlan));
      // Remove fixed task ProvisionDB
      candPlan.tasks = candPlan.tasks.filter((t) => t.id !== "ProvisionDB");
      candPlan.dependencies = []; // prune incident edges

      const result = validateConstraints({
        baselinePlan: basePlan,
        candidatePlan: candPlan,
      });

      expect(result.fixedTasksPreserved).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.issues.some((i) => i.code === "FIXED_TASK_REMOVED")).toBe(true);
    });
  });

  describe("4. Graph Structural Validity", () => {
    it("detects invalid cyclic dependency graphs as a hard constraint failure", () => {
      const plan = createGenericNonEventPlan();
      // Add cycle: RunSmokeTests -> ProvisionDB
      plan.dependencies.push({
        id: "D_Cycle",
        fromTaskId: "RunSmokeTests",
        toTaskId: "ProvisionDB",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Introduces directed cycle",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const result = validateConstraints({ candidatePlan: plan });
      expect(result.acyclic).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.issues.some((i) => i.code === "INVALID_GRAPH_STRUCTURE")).toBe(true);
    });
  });

  describe("5. Generic Engine on Non-Event Plan", () => {
    it("operates without any venue, capacity, or attendance rules on non-event domains", () => {
      const plan = createGenericNonEventPlan();
      // No capacity outputs, no attendance constraints, no accessibility constraints
      const result = validateConstraints({ candidatePlan: plan });

      expect(result.isValid).toBe(true);
      expect(result.hardConstraintsPass).toBe(true);
      expect(result.budgetPass).toBe(true);
      expect(result.deadlinePass).toBe(true);
      expect(result.fixedTasksPreserved).toBe(true);
      expect(result.acyclic).toBe(true);
      // Zero domain-specific errors emitted
      expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });
  });

  describe("6. Typed Domain Constraint Validator Registry", () => {
    it("executes a registered domain-specific validator and flags violation", () => {
      const customValidator: DomainConstraintValidator = {
        id: "cloud-security-compliance",
        description: "Enforces TLS encryption on all deployed API endpoints.",
        validate: (ctx) => {
          const apiTask = ctx.candidatePlan.tasks.find((t) => t.id === "DeployBackend");
          const endpoint = apiTask?.outputs?.apiEndpoint as string | undefined;
          if (!endpoint || !endpoint.startsWith("https://")) {
            return {
              passed: false,
              issues: [
                {
                  code: "INSECURE_ENDPOINT",
                  severity: "error",
                  message: "API endpoint must use HTTPS encryption.",
                  affectedTaskIds: ["DeployBackend"],
                },
              ],
            };
          }
          return { passed: true, issues: [] };
        },
      };

      registerDomainValidator("software-engineering", customValidator);

      const plan = createGenericNonEventPlan();
      // Invalidate endpoint (http instead of https)
      plan.tasks.find((t) => t.id === "DeployBackend")!.outputs = {
        apiEndpoint: "http://insecure-api.example.com",
      };

      const result = validateConstraints({ candidatePlan: plan });

      expect(result.domainChecksPass).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.issues.some((i) => i.code === "INSECURE_ENDPOINT")).toBe(true);

      // Clean up validator
      unregisterDomainValidator("software-engineering", "cloud-security-compliance");
    });

    it("flags UNREVIEWED_ASSUMPTION if domain-specific constraints are declared but no validator is registered", () => {
      const plan = createGenericNonEventPlan();
      plan.domain = "unregistered-custom-domain";
      // Declare domain constraint without registering a validator
      plan.constraints.expectedAttendance = 500;

      const result = validateConstraints({ candidatePlan: plan });

      // Does not silently ignore: surfaces unreviewed assumption
      expect(result.issues.some((i) => i.code === "UNREVIEWED_ASSUMPTION")).toBe(true);
      expect(result.issues.find((i) => i.code === "UNREVIEWED_ASSUMPTION")?.severity).toBe("warning");
    });
  });

  describe("7. Determinism", () => {
    it("produces identical validation results upon repeated execution", () => {
      const plan = createGenericNonEventPlan();
      const res1 = validateConstraints({ candidatePlan: plan });
      const res2 = validateConstraints({ candidatePlan: plan });

      expect(res1).toEqual(res2);
    });
  });

  describe("8. Campus Tech Fest Canonical Event Validator", () => {
    it("validates canonical fixture capacity, accessibility, and baseline cleanly via eventPlanningValidator", () => {
      const result = validateConstraints({ candidatePlan: canonicalPlan });

      expect(result.isValid).toBe(true);
      expect(result.hardConstraintsPass).toBe(true);
      expect(result.budgetPass).toBe(true);
      expect(result.deadlinePass).toBe(true);
      expect(result.fixedTasksPreserved).toBe(true);
      expect(result.acyclic).toBe(true);
      expect(result.domainChecksPass).toBe(true);
      expect(result.metrics.totalCost).toBe(18000);
      expect(result.metrics.projectFinishHours).toBe(132.0);
    });

    it("eventPlanningValidator flags insufficient venue capacity on candidate", () => {
      const candPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // T03 venue capacity reduced to 50 (expected attendance is 100 in 1 session)
      candPlan.tasks.find((t) => t.id === "T03")!.outputs = {
        ...candPlan.tasks.find((t) => t.id === "T03")!.outputs,
        capacity: 50,
      };

      const result = validateConstraints({ candidatePlan: candPlan });

      expect(result.domainChecksPass).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.issues.some((i) => i.code === "CAPACITY_INSUFFICIENT")).toBe(true);
    });

    it("eventPlanningValidator flags accessibility failure on candidate", () => {
      const candPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // T03 venue marked non-accessible when minimumAccessibility is required
      candPlan.tasks.find((t) => t.id === "T03")!.outputs = {
        ...candPlan.tasks.find((t) => t.id === "T03")!.outputs,
        accessible: false,
      };

      const result = validateConstraints({ candidatePlan: candPlan });

      expect(result.domainChecksPass).toBe(false);
      expect(result.hardConstraintsPass).toBe(false);
      expect(result.issues.some((i) => i.code === "ACCESSIBILITY_NOT_MET")).toBe(true);
    });
  });
});
