import { describe, it, expect, beforeEach } from "vitest";
import { LocalDemoSyncAdapter } from "../../../src/lib/sync/local-demo-sync-adapter";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import { computeStructuralFingerprint } from "../../../src/lib/sync/fingerprint";
import type { Plan, Dependency } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S3: Reconciliation & Atomic Publication Safety", () => {
  let adapter: LocalDemoSyncAdapter;
  let basePlan: Plan;

  beforeEach(() => {
    basePlan = JSON.parse(JSON.stringify(canonicalPlan));
    adapter = new LocalDemoSyncAdapter(basePlan);
  });

  it("publishes an offline dependency addition into the rebuilt graph upon successful reconciliation", async () => {
    const localPlan: Plan = JSON.parse(JSON.stringify(basePlan));
    const newEdge: Dependency = {
      id: "D-NEW-OFFLINE",
      fromTaskId: "T01",
      toTaskId: "T08",
      blocksExecution: true,
      fieldMappings: [],
      reason: "Directions need high-level goals context",
      origin: "manual",
      confirmationStatus: "confirmed",
      modificationHistory: [],
    };
    localPlan.dependencies.push(newEdge);

    const result = await adapter.reconcile(localPlan, basePlan);
    expect(result.success).toBe(true);
    expect(result.status).toBe("published");
    expect(result.publishedPlan).toBeDefined();
    expect(result.publishedGraph).toBeDefined();

    // Verify the newly added offline edge is present in the published graph
    const publishedEdge = result.publishedGraph?.edges.find((e) => e.id === "D-NEW-OFFLINE");
    expect(publishedEdge).toBeDefined();
    expect(publishedEdge?.fromTaskId).toBe("T01");
    expect(publishedEdge?.toTaskId).toBe("T08");
  });

  it("blocks publication if a merge introduces a cycle, preserving the accepted baseline", async () => {
    const initialBaselinePlan = adapter.getAcceptedBaselinePlan();
    const initialBaselineGraph = adapter.getAcceptedBaselineGraph();

    const localPlan: Plan = JSON.parse(JSON.stringify(basePlan));
    // T15 is downstream of T01; adding T15 -> T01 creates a directed cycle
    const cyclicEdge: Dependency = {
      id: "D-CYCLE",
      fromTaskId: "T15",
      toTaskId: "T01",
      blocksExecution: true,
      fieldMappings: [],
      reason: "Creates invalid cycle",
      origin: "manual",
      confirmationStatus: "confirmed",
      modificationHistory: [],
    };
    localPlan.dependencies.push(cyclicEdge);

    const result = await adapter.reconcile(localPlan, basePlan);
    expect(result.success).toBe(false);
    expect(result.status).toBe("validation_failed");
    expect(result.validationErrors?.some((e) => e.includes("Cycle detected"))).toBe(true);

    // Baseline plan and graph MUST remain untouched
    const currentBaselinePlan = adapter.getAcceptedBaselinePlan();
    const currentBaselineGraph = adapter.getAcceptedBaselineGraph();
    expect(currentBaselinePlan.dependencies).toHaveLength(initialBaselinePlan.dependencies.length);
    expect(currentBaselineGraph.validationSummary.isValid).toBe(true);
    expect(currentBaselineGraph.validationSummary.hasCycles).toBe(false);

    // Staged draft should be retained for inspection
    const stagedDraft = adapter.getStagedDraftPlan();
    expect(stagedDraft).toBeDefined();
    expect(stagedDraft?.dependencies.some((d) => d.id === "D-CYCLE")).toBe(true);
  });

  it("handles a merge involving a deleted task and an inbound dependency safely", async () => {
    const localPlan: Plan = JSON.parse(JSON.stringify(basePlan));
    // Local deletes task T16 (sponsor booth)
    localPlan.tasks = localPlan.tasks.filter((t) => t.id !== "T16");
    // Also removes incident edges locally
    localPlan.dependencies = localPlan.dependencies.filter(
      (d) => d.fromTaskId !== "T16" && d.toTaskId !== "T16"
    );

    // Remote made an independent modification to T03 cost
    const remotePlan: Plan = JSON.parse(JSON.stringify(basePlan));
    remotePlan.tasks.find((t) => t.id === "T03")!.cost = 4500;
    adapter.setRemotePlan(remotePlan);

    const result = await adapter.reconcile(localPlan, basePlan);
    expect(result.success).toBe(true);
    expect(result.status).toBe("published");

    // Published plan has T16 removed and no dangling references
    expect(result.publishedPlan?.tasks.find((t) => t.id === "T16")).toBeUndefined();
    expect(result.publishedGraph?.validationSummary.isValid).toBe(true);
    expect(result.publishedGraph?.validationSummary.missingTaskReferences).toHaveLength(0);
  });

  it("produces identical deterministic results across repeated reconciliations", async () => {
    const localPlan: Plan = JSON.parse(JSON.stringify(basePlan));
    localPlan.tasks.find((t) => t.id === "T01")!.title = "Updated Goals Title";

    const res1 = await adapter.reconcile(localPlan, basePlan);

    // Run reconciliation again on fresh adapter with same inputs
    const freshAdapter = new LocalDemoSyncAdapter(basePlan);
    const res2 = await freshAdapter.reconcile(localPlan, basePlan);

    expect(res1.status).toBe(res2.status);
    expect(res1.publishedRevision).toBe(res2.publishedRevision);

    const fp1 = computeStructuralFingerprint(res1.publishedPlan!);
    const fp2 = computeStructuralFingerprint(res2.publishedPlan!);
    expect(fp1).toBe(fp2);

    expect(res1.publishedGraph?.graphInputFingerprint).toBe(
      res2.publishedGraph?.graphInputFingerprint
    );
  });

  it("publishes matching plan and graph fingerprints upon clean reconciliation", async () => {
    const localPlan: Plan = JSON.parse(JSON.stringify(basePlan));
    localPlan.tasks.find((t) => t.id === "T03")!.durationHours = 26;

    const result = await adapter.reconcile(localPlan, basePlan);
    expect(result.success).toBe(true);
    expect(result.status).toBe("published");

    const planFp = computeStructuralFingerprint(result.publishedPlan!);
    const graphFp = result.publishedGraph?.graphInputFingerprint;

    // The graph's input fingerprint MUST match the published plan's structural fingerprint
    expect(graphFp).toBe(planFp);
    expect(result.publishedGraph?.consistencyState).toBe("current_valid");
  });

  it("supports full conflict resolution workflow, publishing only after resolution", async () => {
    const localPlan: Plan = JSON.parse(JSON.stringify(basePlan));
    const remotePlan: Plan = JSON.parse(JSON.stringify(basePlan));

    localPlan.tasks.find((t) => t.id === "T03")!.cost = 4200;
    remotePlan.tasks.find((t) => t.id === "T03")!.cost = 4800;
    adapter.setRemotePlan(remotePlan);

    // 1. Initial reconcile detects conflict and stops
    const initialResult = await adapter.reconcile(localPlan, basePlan);
    expect(initialResult.status).toBe("conflict");
    expect(initialResult.conflicts).toHaveLength(1);

    const conflictId = initialResult.conflicts![0].id;

    // 2. Resolve conflict with custom agreed cost (4500)
    adapter.resolveConflict(conflictId, { customValue: 4500 });

    // 3. Reconcile with resolutions publishes atomically
    const finalResult = await adapter.reconcileWithResolutions();
    expect(finalResult.success).toBe(true);
    expect(finalResult.status).toBe("published");

    const publishedT03 = finalResult.publishedPlan?.tasks.find((t) => t.id === "T03");
    expect(publishedT03?.cost).toBe(4500);
    expect(finalResult.publishedGraph?.consistencyState).toBe("current_valid");
  });
});
