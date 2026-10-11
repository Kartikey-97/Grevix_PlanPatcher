import { describe, it, expect } from "vitest";
import {
  scheduleGraph,
  schedulePlan,
  type SchedulableTask,
  type SchedulableDependency,
} from "../../../src/lib/engine/schedule";
import { topologicalSort } from "../../../src/lib/engine/topological-sort";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import expectedFixture from "../../../fixtures/planpatch/expected-results.json";

describe("Milestone S5A: Generic Scheduling Engine", () => {
  describe("1. Linear chain of tasks", () => {
    it("computes accurate forward pass, backward pass, project finish, and zero slack for a linear chain", () => {
      const tasks: SchedulableTask[] = [
        { id: "T1", durationHours: 10 },
        { id: "T2", durationHours: 20 },
        { id: "T3", durationHours: 15 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "T1", toTaskId: "T2", blocksExecution: true },
        { id: "D2", fromTaskId: "T2", toTaskId: "T3", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, deps, { deadlineHours: 45 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(45);
      expect(result.isDeadlineFeasible).toBe(true);
      expect(result.projectSlack).toBe(0);

      // Forward pass:
      expect(result.tasks["T1"].earliestStart).toBe(0);
      expect(result.tasks["T1"].earliestFinish).toBe(10);
      expect(result.tasks["T2"].earliestStart).toBe(10);
      expect(result.tasks["T2"].earliestFinish).toBe(30);
      expect(result.tasks["T3"].earliestStart).toBe(30);
      expect(result.tasks["T3"].earliestFinish).toBe(45);

      // Backward pass with deadline = 45:
      expect(result.tasks["T3"].latestFinish).toBe(45);
      expect(result.tasks["T3"].latestStart).toBe(30);
      expect(result.tasks["T3"].slack).toBe(0);

      expect(result.tasks["T2"].latestFinish).toBe(30);
      expect(result.tasks["T2"].latestStart).toBe(10);
      expect(result.tasks["T2"].slack).toBe(0);

      expect(result.tasks["T1"].latestFinish).toBe(10);
      expect(result.tasks["T1"].latestStart).toBe(0);
      expect(result.tasks["T1"].slack).toBe(0);

      // Critical path
      expect(result.criticalPaths).toEqual([["T1", "T2", "T3"]]);
      expect(result.criticalTaskIds).toEqual(["T1", "T2", "T3"]);
      expect(result.zeroSlackTaskIds).toEqual(["T1", "T2", "T3"]);
    });
  });

  describe("2. Parallel independent tasks (disconnected components)", () => {
    it("schedules independent tasks in parallel from time zero without arbitrary serialization", () => {
      const tasks: SchedulableTask[] = [
        { id: "TaskA", durationHours: 10 },
        { id: "TaskB", durationHours: 25 },
      ];
      const deps: SchedulableDependency[] = [];

      const result = scheduleGraph(tasks, deps, { deadlineHours: 25 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(25);

      // Both tasks start at time zero concurrently
      expect(result.tasks["TaskA"].earliestStart).toBe(0);
      expect(result.tasks["TaskA"].earliestFinish).toBe(10);
      expect(result.tasks["TaskB"].earliestStart).toBe(0);
      expect(result.tasks["TaskB"].earliestFinish).toBe(25);

      // TaskB is critical (25h duration determines finish), TaskA has 15h of slack
      expect(result.tasks["TaskB"].latestStart).toBe(0);
      expect(result.tasks["TaskB"].latestFinish).toBe(25);
      expect(result.tasks["TaskB"].slack).toBe(0);
      expect(result.tasks["TaskB"].isCritical).toBe(true);

      expect(result.tasks["TaskA"].latestStart).toBe(15);
      expect(result.tasks["TaskA"].latestFinish).toBe(25);
      expect(result.tasks["TaskA"].slack).toBe(15);
      expect(result.tasks["TaskA"].isCritical).toBe(false);

      expect(result.criticalPaths).toEqual([["TaskB"]]);
      expect(result.criticalTaskIds).toEqual(["TaskB"]);
    });
  });

  describe("3. Multiple blocking predecessors", () => {
    it("waits for the latest finishing blocking predecessor: ES(v) = max(EF(u))", () => {
      const tasks: SchedulableTask[] = [
        { id: "FastPredecessor", durationHours: 12 },
        { id: "SlowPredecessor", durationHours: 30 },
        { id: "Successor", durationHours: 8 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "FastPredecessor", toTaskId: "Successor", blocksExecution: true },
        { id: "D2", fromTaskId: "SlowPredecessor", toTaskId: "Successor", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, deps, { deadlineHours: 38 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(38);

      expect(result.tasks["Successor"].earliestStart).toBe(30);
      expect(result.tasks["Successor"].earliestFinish).toBe(38);

      // SlowPredecessor is critical; FastPredecessor has 18h slack (30 - 12)
      expect(result.tasks["SlowPredecessor"].slack).toBe(0);
      expect(result.tasks["SlowPredecessor"].isCritical).toBe(true);

      expect(result.tasks["FastPredecessor"].slack).toBe(18);
      expect(result.tasks["FastPredecessor"].isCritical).toBe(false);

      expect(result.criticalPaths).toEqual([["SlowPredecessor", "Successor"]]);
    });
  });

  describe("4. Non-blocking dependency precedence rule", () => {
    it("does not delay task start when dependency has blocksExecution === false", () => {
      const tasks: SchedulableTask[] = [
        { id: "DataProvider", durationHours: 40 },
        { id: "DataConsumer", durationHours: 10 },
      ];
      // Non-blocking field relationship
      const deps: SchedulableDependency[] = [
        {
          id: "D_INFO",
          fromTaskId: "DataProvider",
          toTaskId: "DataConsumer",
          blocksExecution: false,
        },
      ];

      const result = scheduleGraph(tasks, deps);

      expect(result.success).toBe(true);
      // Consumer is NOT delayed to hour 40; starts at hour 0!
      expect(result.tasks["DataConsumer"].earliestStart).toBe(0);
      expect(result.tasks["DataConsumer"].earliestFinish).toBe(10);

      expect(result.tasks["DataProvider"].earliestStart).toBe(0);
      expect(result.tasks["DataProvider"].earliestFinish).toBe(40);

      expect(result.projectEarliestFinish).toBe(40);
      expect(result.criticalPaths).toEqual([["DataProvider"]]);
    });
  });

  describe("5. Valid graph containing an isolated task", () => {
    it("correctly handles an isolated task alongside connected components", () => {
      const tasks: SchedulableTask[] = [
        { id: "Connected1", durationHours: 10 },
        { id: "Connected2", durationHours: 20 },
        { id: "Isolated", durationHours: 5 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "Connected1", toTaskId: "Connected2", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, deps, { deadlineHours: 30 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(30);

      expect(result.tasks["Isolated"].earliestStart).toBe(0);
      expect(result.tasks["Isolated"].earliestFinish).toBe(5);
      expect(result.tasks["Isolated"].latestFinish).toBe(30);
      expect(result.tasks["Isolated"].latestStart).toBe(25);
      expect(result.tasks["Isolated"].slack).toBe(25);
      expect(result.tasks["Isolated"].isCritical).toBe(false);

      expect(result.criticalPaths).toEqual([["Connected1", "Connected2"]]);
    });
  });

  describe("6. Zero-duration tasks (milestones)", () => {
    it("schedules zero-duration milestone tasks accurately without time shift", () => {
      const tasks: SchedulableTask[] = [
        { id: "Phase1", durationHours: 15 },
        { id: "MilestoneM1", durationHours: 0 },
        { id: "Phase2", durationHours: 20 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "Phase1", toTaskId: "MilestoneM1", blocksExecution: true },
        { id: "D2", fromTaskId: "MilestoneM1", toTaskId: "Phase2", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, deps, { deadlineHours: 35 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(35);

      expect(result.tasks["Phase1"].earliestStart).toBe(0);
      expect(result.tasks["Phase1"].earliestFinish).toBe(15);

      expect(result.tasks["MilestoneM1"].earliestStart).toBe(15);
      expect(result.tasks["MilestoneM1"].earliestFinish).toBe(15);
      expect(result.tasks["MilestoneM1"].latestStart).toBe(15);
      expect(result.tasks["MilestoneM1"].latestFinish).toBe(15);
      expect(result.tasks["MilestoneM1"].slack).toBe(0);

      expect(result.tasks["Phase2"].earliestStart).toBe(15);
      expect(result.tasks["Phase2"].earliestFinish).toBe(35);

      expect(result.criticalPaths).toEqual([["Phase1", "MilestoneM1", "Phase2"]]);
    });
  });

  describe("7. Critical-path calculation and slack", () => {
    it("distinguishes critical branch from non-critical branch in a diamond topology", () => {
      const tasks: SchedulableTask[] = [
        { id: "Fork", durationHours: 5 },
        { id: "ShortBranch", durationHours: 10 },
        { id: "LongBranch", durationHours: 25 },
        { id: "Join", durationHours: 10 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "Fork", toTaskId: "ShortBranch", blocksExecution: true },
        { id: "D2", fromTaskId: "Fork", toTaskId: "LongBranch", blocksExecution: true },
        { id: "D3", fromTaskId: "ShortBranch", toTaskId: "Join", blocksExecution: true },
        { id: "D4", fromTaskId: "LongBranch", toTaskId: "Join", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, deps, { deadlineHours: 40 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(40);

      // ShortBranch finishes at 15; Join cannot start until LongBranch finishes at 30
      expect(result.tasks["ShortBranch"].earliestStart).toBe(5);
      expect(result.tasks["ShortBranch"].earliestFinish).toBe(15);
      expect(result.tasks["ShortBranch"].latestStart).toBe(20);
      expect(result.tasks["ShortBranch"].latestFinish).toBe(30);
      expect(result.tasks["ShortBranch"].slack).toBe(15);
      expect(result.tasks["ShortBranch"].isCritical).toBe(false);

      expect(result.tasks["LongBranch"].earliestStart).toBe(5);
      expect(result.tasks["LongBranch"].earliestFinish).toBe(30);
      expect(result.tasks["LongBranch"].latestStart).toBe(5);
      expect(result.tasks["LongBranch"].latestFinish).toBe(30);
      expect(result.tasks["LongBranch"].slack).toBe(0);
      expect(result.tasks["LongBranch"].isCritical).toBe(true);

      expect(result.criticalPaths).toEqual([["Fork", "LongBranch", "Join"]]);
      expect(result.criticalTaskIds).toEqual(["Fork", "Join", "LongBranch"]);
    });
  });

  describe("8. Impossible deadlines (negative slack & violation reporting)", () => {
    it("explicitly reports negative slack and isDeadlineFeasible = false without masking violations", () => {
      const tasks: SchedulableTask[] = [
        { id: "Task1", durationHours: 20 },
        { id: "Task2", durationHours: 30 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "Task1", toTaskId: "Task2", blocksExecution: true },
      ];

      // Earliest finish is 50, but deadline is 35 (impossible by 15 hours)
      const result = scheduleGraph(tasks, deps, { deadlineHours: 35 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(50);
      expect(result.isDeadlineFeasible).toBe(false);
      expect(result.projectSlack).toBe(-15);

      // Terminal task Task2 has latestFinish 35, duration 30 -> latestStart 5. EarliestStart is 20 -> slack = -15
      expect(result.tasks["Task2"].latestStart).toBe(5);
      expect(result.tasks["Task2"].latestFinish).toBe(35);
      expect(result.tasks["Task2"].slack).toBe(-15);
      expect(result.tasks["Task2"].isDeadlineViolated).toBe(true);

      // Task1 has latestFinish 5, latestStart -15. EarliestStart 0 -> slack = -15
      expect(result.tasks["Task1"].latestStart).toBe(-15);
      expect(result.tasks["Task1"].latestFinish).toBe(5);
      expect(result.tasks["Task1"].slack).toBe(-15);
      expect(result.tasks["Task1"].isDeadlineViolated).toBe(true);
    });
  });

  describe("9. Graph safety: refusal to schedule cyclic or broken graphs", () => {
    it("refuses to schedule cyclic graph and returns structured diagnostics", () => {
      const tasks: SchedulableTask[] = [
        { id: "C1", durationHours: 10 },
        { id: "C2", durationHours: 10 },
      ];
      const cyclicDeps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "C1", toTaskId: "C2", blocksExecution: true },
        { id: "D2", fromTaskId: "C2", toTaskId: "C1", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, cyclicDeps);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.validationIssues?.some((i) => i.includes("DIRECTED_CYCLE"))).toBe(true);
      expect(Object.keys(result.tasks)).toHaveLength(0);
    });

    it("refuses to schedule graph with dangling task endpoint reference", () => {
      const tasks: SchedulableTask[] = [{ id: "T1", durationHours: 10 }];
      const brokenDeps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "T1", toTaskId: "T_NON_EXISTENT", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, brokenDeps);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.validationIssues?.some((i) => i.includes("MISSING_TASK_ENDPOINT"))).toBe(true);
    });
  });

  describe("10. Deterministic results independent of task-array ordering", () => {
    it("produces identical topological order and schedule regardless of input task array permutation", () => {
      const tasks: SchedulableTask[] = [
        { id: "Alpha", durationHours: 10 },
        { id: "Beta", durationHours: 15 },
        { id: "Gamma", durationHours: 20 },
        { id: "Delta", durationHours: 25 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "Alpha", toTaskId: "Gamma", blocksExecution: true },
        { id: "D2", fromTaskId: "Beta", toTaskId: "Delta", blocksExecution: true },
      ];

      const perm1 = [...tasks];
      const perm2 = [...tasks].reverse();
      const perm3 = [tasks[2], tasks[0], tasks[3], tasks[1]];

      const res1 = scheduleGraph(perm1, deps, { deadlineHours: 50 });
      const res2 = scheduleGraph(perm2, deps, { deadlineHours: 50 });
      const res3 = scheduleGraph(perm3, deps, { deadlineHours: 50 });

      expect(res1.topologicalOrder).toEqual(res2.topologicalOrder);
      expect(res2.topologicalOrder).toEqual(res3.topologicalOrder);

      expect(res1.projectEarliestFinish).toBe(res2.projectEarliestFinish);
      expect(res2.projectEarliestFinish).toBe(res3.projectEarliestFinish);

      expect(res1.tasks).toEqual(res2.tasks);
      expect(res2.tasks).toEqual(res3.tasks);
    });
  });

  describe("11. Generic deadlines: clearly distinguishing earliest from deadline calculations", () => {
    it("omits latest-time and deadline-slack calculations when no deadline is provided", () => {
      const tasks: SchedulableTask[] = [
        { id: "T1", durationHours: 10 },
        { id: "T2", durationHours: 15 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "T1", toTaskId: "T2", blocksExecution: true },
      ];

      const result = scheduleGraph(tasks, deps);

      expect(result.success).toBe(true);
      expect(result.hasDeadline).toBe(false);
      expect(result.deadlineHours).toBeUndefined();
      expect(result.projectSlack).toBeUndefined();
      expect(result.isDeadlineFeasible).toBeUndefined();

      // Earliest times are calculated
      expect(result.tasks["T1"].earliestStart).toBe(0);
      expect(result.tasks["T1"].earliestFinish).toBe(10);
      expect(result.tasks["T2"].earliestStart).toBe(10);
      expect(result.tasks["T2"].earliestFinish).toBe(25);
      expect(result.projectEarliestFinish).toBe(25);

      // Latest times are undefined without deadline
      expect(result.tasks["T1"].latestStart).toBeUndefined();
      expect(result.tasks["T1"].latestFinish).toBeUndefined();
      expect(result.tasks["T1"].slack).toBeUndefined();
    });
  });

  describe("12. Campus Tech Fest Canonical Regression Fixture", () => {
    it("recalculates expected 132.0-hour finish and critical paths from canonical graph without hard-coding", () => {
      // Schedule directly from canonical plan
      const result = schedulePlan(canonicalPlan);

      expect(result.success).toBe(true);

      // 1. Recalculates expected 132.0 earliest finish
      expect(result.projectEarliestFinish).toBe(132.0);
      expect(result.projectFinishHours).toBe(132.0);
      expect(result.projectEarliestFinish).toBe(expectedFixture.baseline.earliestFinishHours);

      // 2. Earliest start and finish match fixture for all 16 tasks
      for (const [taskId, expectedTimes] of Object.entries(expectedFixture.baseline.earliestTimes)) {
        const taskSchedule = result.tasks[taskId];
        expect(taskSchedule).toBeDefined();
        expect(taskSchedule.earliestStart).toBe(expectedTimes.startHours);
        expect(taskSchedule.earliestFinish).toBe(expectedTimes.finishHours);
      }

      // 3. Project deadline margin matches fixture (288 - 132 = 156 hours)
      expect(result.deadlineHours).toBe(288);
      expect(result.projectSlack).toBe(156.0);
      expect(result.projectDeadlineMargin).toBe(156.0);
      expect(result.projectSlack).toBe(expectedFixture.baseline.deadlineSlackHours);
      expect(result.isDeadlineFeasible).toBe(true);

      // 4. Critical paths: Exactly matches criticalPathOne and criticalPathTwo from fixture!
      const path1 = expectedFixture.baseline.criticalPathOne;
      const path2 = expectedFixture.baseline.criticalPathTwo;

      expect(result.criticalPaths).toContainEqual(path1);
      expect(result.criticalPaths).toContainEqual(path2);
      expect(result.criticalPaths).toHaveLength(2);

      // 5. Critical tasks match union of critical paths
      const expectedCriticalTasks = Array.from(new Set([...path1, ...path2])).sort();
      expect(result.criticalTaskIds).toEqual(expectedCriticalTasks);

      // Critical-path tasks have zero criticalPathFloat, but positive deadlineSlack (156.0)
      for (const tid of expectedCriticalTasks) {
        expect(result.tasks[tid].isCritical).toBe(true);
        expect(result.tasks[tid].criticalPathFloat).toBe(0.0);
        expect(result.tasks[tid].deadlineSlack).toBe(156.0);
        expect(result.tasks[tid].slack).toBe(156.0);
        expect(result.tasks[tid].isDeadlineViolated).toBe(false);
      }

      // Non-critical tasks have positive criticalPathFloat and deadlineSlack > 156.0
      expect(result.tasks["T08"].criticalPathFloat).toBeGreaterThan(0.0);
      expect(result.tasks["T08"].slack).toBeGreaterThan(156.0);
      expect(result.tasks["T08"].isCritical).toBe(false);

      expect(result.tasks["T10"].criticalPathFloat).toBeGreaterThan(0.0);
      expect(result.tasks["T10"].slack).toBeGreaterThan(156.0);
      expect(result.tasks["T10"].isCritical).toBe(false);

      expect(result.tasks["T16"].criticalPathFloat).toBeGreaterThan(0.0);
      expect(result.tasks["T16"].slack).toBeGreaterThan(156.0);
      expect(result.tasks["T16"].isCritical).toBe(false);
    });
  });

  describe("13. Distinction between Deadline Slack and Critical-Path Float", () => {
    it("handles a project whose deadline exceeds its earliest finish (D > T_finish)", () => {
      // Chain: A (10h) -> B (20h), and parallel C (15h)
      const tasks: SchedulableTask[] = [
        { id: "A", durationHours: 10 },
        { id: "B", durationHours: 20 },
        { id: "C", durationHours: 15 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "A", toTaskId: "B", blocksExecution: true },
      ];

      // Earliest finish is 30h. Deadline is 50h (exceeds finish by 20h)
      const result = scheduleGraph(tasks, deps, { deadlineHours: 50 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(30);
      expect(result.projectFinishHours).toBe(30);
      expect(result.projectSlack).toBe(20);
      expect(result.projectDeadlineMargin).toBe(20);
      expect(result.isDeadlineFeasible).toBe(true);

      // Critical path is A -> B
      expect(result.criticalPaths).toEqual([["A", "B"]]);
      expect(result.criticalTaskIds).toEqual(["A", "B"]);

      // Critical tasks have zero critical-path float, but positive deadline slack (20h)
      expect(result.tasks["A"].criticalPathFloat).toBe(0);
      expect(result.tasks["A"].deadlineSlack).toBe(20);
      expect(result.tasks["A"].slack).toBe(20);
      expect(result.tasks["A"].isCritical).toBe(true);

      expect(result.tasks["B"].criticalPathFloat).toBe(0);
      expect(result.tasks["B"].deadlineSlack).toBe(20);
      expect(result.tasks["B"].slack).toBe(20);
      expect(result.tasks["B"].isCritical).toBe(true);

      // Non-critical task C has critical-path float of 15h, and deadline slack of 35h (20 + 15)
      expect(result.tasks["C"].criticalPathFloat).toBe(15);
      expect(result.tasks["C"].deadlineSlack).toBe(35);
      expect(result.tasks["C"].slack).toBe(35);
      expect(result.tasks["C"].isCritical).toBe(false);
    });

    it("handles a project whose deadline equals its earliest finish (D = T_finish)", () => {
      // Chain: A (10h) -> B (20h), and parallel C (15h)
      const tasks: SchedulableTask[] = [
        { id: "A", durationHours: 10 },
        { id: "B", durationHours: 20 },
        { id: "C", durationHours: 15 },
      ];
      const deps: SchedulableDependency[] = [
        { id: "D1", fromTaskId: "A", toTaskId: "B", blocksExecution: true },
      ];

      // Earliest finish is 30h. Deadline is exactly 30h
      const result = scheduleGraph(tasks, deps, { deadlineHours: 30 });

      expect(result.success).toBe(true);
      expect(result.projectEarliestFinish).toBe(30);
      expect(result.projectFinishHours).toBe(30);
      expect(result.projectSlack).toBe(0);
      expect(result.projectDeadlineMargin).toBe(0);
      expect(result.isDeadlineFeasible).toBe(true);

      // When deadline == project finish, critical-path tasks have BOTH zero float and zero slack!
      expect(result.tasks["A"].criticalPathFloat).toBe(0);
      expect(result.tasks["A"].deadlineSlack).toBe(0);
      expect(result.tasks["A"].isCritical).toBe(true);

      expect(result.tasks["B"].criticalPathFloat).toBe(0);
      expect(result.tasks["B"].deadlineSlack).toBe(0);
      expect(result.tasks["B"].isCritical).toBe(true);

      // Non-critical task C has float 15h and slack 15h
      expect(result.tasks["C"].criticalPathFloat).toBe(15);
      expect(result.tasks["C"].deadlineSlack).toBe(15);
      expect(result.tasks["C"].isCritical).toBe(false);

      expect(result.zeroSlackTaskIds).toEqual(["A", "B"]);
      expect(result.zeroFloatTaskIds).toEqual(["A", "B"]);
    });
  });
});
