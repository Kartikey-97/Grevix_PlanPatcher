import { describe, it, expect } from "vitest";
import {
  GlobalConstraintsSchema,
  TaskSchema,
  DependencySchema,
  VerificationStatusSchema,
  ProfileWeightsSchema,
  EvaluatedCandidateSchema,
} from "../../src/lib/schemas";

describe("Milestone B: Schema & Specification Rules", () => {
  describe("Generic Budget Semantics (Requirement 3)", () => {
    it("allows omitted budget, disabling budget limit", () => {
      const parsed = GlobalConstraintsSchema.parse({ currency: "INR" });
      expect(parsed.budgetLimit).toBeUndefined();
    });

    it("permits budget limit of zero (for zero-cost plans)", () => {
      const parsed = GlobalConstraintsSchema.parse({ budgetLimit: 0 });
      expect(parsed.budgetLimit).toBe(0);
    });

    it("strictly rejects negative budget limits as invalid", () => {
      const result = GlobalConstraintsSchema.safeParse({ budgetLimit: -100 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/too_small|nonnegative|greater than or equal to 0/i);
      }
    });
  });

  describe("Verification Status Semantics (Requirement 4)", () => {
    it("supports verified_in_fixture, provisional, and real_world_verified statuses", () => {
      expect(VerificationStatusSchema.parse("verified_in_fixture")).toBe("verified_in_fixture");
      expect(VerificationStatusSchema.parse("provisional")).toBe("provisional");
      expect(VerificationStatusSchema.parse("real_world_verified")).toBe("real_world_verified");
    });

    it("rejects invalid verification status labels", () => {
      const result = VerificationStatusSchema.safeParse("arbitrary_confirmed");
      expect(result.success).toBe(false);
    });

    it("ensures candidate schema tracks unknown material facts as visible assumptions", () => {
      const candidateData = {
        candidateId: "C01",
        label: "Sample Candidate",
        changedTaskIds: ["T03"],
        removedTaskIds: [],
        lostTaskIds: [],
        projectedTotalCost: 20000,
        taskCount: 16,
        earliestProjectFinishHours: 134,
        movedTaskStartTimes: [],
        weightedMeanAbsoluteStartShiftHours: 0,
        metrics: {
          changeFootprint_E: 0.1875,
          lostTaskValue_L: 0,
          budgetUsage_C: 0.8,
          movement_M: 0.25,
          deadlinePressure_Q: 0,
          scheduleDisruption_S: 0.175,
          uncertainty_R: 0.2,
        },
        unknownFacts: ["venue_availability"],
        verificationStatus: "provisional" as const,
        validation: {
          budgetPass: true,
          deadlinePass: true,
          capacityPass: true,
          accessibilityPass: true,
          fixedTasksPreserved: true,
          acyclic: true,
          hardConstraintsPass: true,
        },
        scores: {
          preserve_plan: 0.2625,
        },
      };

      const parsed = EvaluatedCandidateSchema.parse(candidateData);
      expect(parsed.verificationStatus).toBe("provisional");
      expect(parsed.unknownFacts).toContain("venue_availability");
    });
  });

  describe("Task & Dependency Integrity", () => {
    it("validates task policies fixed, replaceable, and optional", () => {
      const baseTask = {
        id: "T01",
        title: "Test Task",
        cost: 100,
        durationHours: 10,
        priority: 3,
        status: "planned",
      };

      expect(TaskSchema.safeParse({ ...baseTask, policy: "fixed" }).success).toBe(true);
      expect(TaskSchema.safeParse({ ...baseTask, policy: "replaceable" }).success).toBe(true);
      expect(TaskSchema.safeParse({ ...baseTask, policy: "optional" }).success).toBe(true);
      expect(TaskSchema.safeParse({ ...baseTask, policy: "unknown" }).success).toBe(false);
    });

    it("rejects negative cost or negative duration", () => {
      const baseTask = {
        id: "T01",
        title: "Test Task",
        priority: 3,
        policy: "fixed",
        status: "planned",
      };

      expect(TaskSchema.safeParse({ ...baseTask, cost: -5, durationHours: 10 }).success).toBe(false);
      expect(TaskSchema.safeParse({ ...baseTask, cost: 5, durationHours: -10 }).success).toBe(false);
    });

    it("rejects priority outside 1 to 5 scale", () => {
      const baseTask = {
        id: "T01",
        title: "Test Task",
        cost: 0,
        durationHours: 1,
        policy: "fixed",
        status: "planned",
      };

      expect(TaskSchema.safeParse({ ...baseTask, priority: 0 }).success).toBe(false);
      expect(TaskSchema.safeParse({ ...baseTask, priority: 6 }).success).toBe(false);
      expect(TaskSchema.safeParse({ ...baseTask, priority: 3.5 }).success).toBe(false);
      expect(TaskSchema.safeParse({ ...baseTask, priority: 5 }).success).toBe(true);
    });

    it("requires sourceField and targetInput on field mappings", () => {
      const validDep = {
        id: "D01",
        fromTaskId: "T01",
        toTaskId: "T02",
        blocksExecution: true,
        fieldMappings: [{ sourceField: "goalApproved", targetInput: "goalApproved" }],
      };
      expect(DependencySchema.safeParse(validDep).success).toBe(true);

      const invalidDep = {
        id: "D01",
        fromTaskId: "T01",
        toTaskId: "T02",
        blocksExecution: true,
        fieldMappings: [{ sourceField: "goalApproved" }],
      };
      expect(DependencySchema.safeParse(invalidDep).success).toBe(false);
    });
  });

  describe("Preference Profile Weight Invariants", () => {
    it("ensures weights are non-negative and bounded by 1", () => {
      const validWeights = {
        changeFootprint: 0.3,
        lostTaskValue: 0.25,
        budgetUsage: 0.2,
        scheduleDisruption: 0.15,
        uncertainty: 0.1,
      };
      expect(ProfileWeightsSchema.safeParse(validWeights).success).toBe(true);

      const invalidWeights = {
        ...validWeights,
        budgetUsage: -0.1,
      };
      expect(ProfileWeightsSchema.safeParse(invalidWeights).success).toBe(false);
    });
  });
});
