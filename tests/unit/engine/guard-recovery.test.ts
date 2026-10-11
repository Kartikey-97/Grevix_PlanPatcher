import { describe, it, expect } from "vitest";
import {
  guardRecovery,
  verifyBeforeCommit,
  verifyBeforePublish,
  commitPlanAndGraph,
  publishPlanAndGraph,
} from "../../../src/lib/engine/guard-recovery";
import { refreshGraphMetadata } from "../../../src/lib/graph/refresh-metadata";
import { computeExplanationMetadataFingerprint } from "../../../src/lib/sync/fingerprint";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan } from "../../../src/lib/schemas/plan.schema";
import type { ConflictRecord } from "../../../src/lib/schemas/sync.schema";

describe("Milestone S4: Recovery Guard & Consistency Gatekeeper", () => {
  it("allows a healthy, current, validated plan and graph through normally", () => {
    const graph = rebuildGraph(canonicalPlan);
    const result = guardRecovery({
      plan: canonicalPlan,
      graph,
      syncState: "in_sync",
      publicationStatus: "published",
    });

    expect(result.canCalculate).toBe(true);
    expect(result.canCommitLocally).toBe(true);
    expect(result.canPublishSynced).toBe(true);
    expect(result.requiresHumanReview).toBe(false);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.freshnessStatus).toBe("fully_fresh_and_valid");
    expect(result.syncState).toBe("in_sync");
    expect(result.publicationStatus).toBe("published");
  });

  it("blocks calculation when structural fingerprint mismatch occurs (stale graph)", () => {
    const graph = rebuildGraph(canonicalPlan);

    // Modify task duration in plan without rebuilding graph
    const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    modifiedPlan.tasks.find((t) => t.id === "T03")!.durationHours = 32;

    const result = guardRecovery({
      plan: modifiedPlan,
      graph,
    });

    expect(result.canCalculate).toBe(false);
    expect(result.canCommitLocally).toBe(false);
    expect(result.canPublishSynced).toBe(false);
    expect(result.freshnessStatus).toBe("structural_rebuild_required");
    expect(result.blockingIssues.some((issue) => issue.includes("structurally stale"))).toBe(true);
    expect(result.requiredActions.some((act) => act.includes("Rebuild and validate"))).toBe(true);
  });

  it("allows safe structural preview when only display-only metadata (task title or reason) is stale", () => {
    const graph = rebuildGraph(canonicalPlan);

    // Modify dependency reason without changing graph structure or confirmation status
    const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    modifiedPlan.dependencies[0].reason = "Newly clarified operational reason";
    modifiedPlan.tasks[0].title = "Renamed Event Brief";

    const result = guardRecovery({
      plan: modifiedPlan,
      graph,
    });

    // S4.1 Requirement 2: Safe structural preview is permitted
    expect(result.canCalculate).toBe(true);
    expect(result.freshnessStatus).toBe("metadata_refresh_required");
    expect(result.warnings.some((w) => w.includes("Display-only metadata"))).toBe(true);
    expect(result.requiredActions.some((act) => act.includes("Refresh graph explanation metadata"))).toBe(true);
  });

  it("blocks recovery calculation when trust-critical metadata (dependency confirmationStatus or origin) is stale", () => {
    const graph = rebuildGraph(canonicalPlan);

    // Modify confirmationStatus in plan from confirmed to provisional without refreshing graph
    const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    modifiedPlan.dependencies[0].confirmationStatus = "provisional";

    const result = guardRecovery({
      plan: modifiedPlan,
      graph,
    });

    // S4.1 Requirement 3: Stale trust metadata MUST block calculation
    expect(result.canCalculate).toBe(false);
    expect(result.canCommitLocally).toBe(false);
    expect(result.canPublishSynced).toBe(false);
    expect(result.requiresHumanReview).toBe(true);
    expect(result.blockingIssues.some((b) => b.includes("Trust-critical metadata"))).toBe(true);
    expect(result.requiredActions.some((act) => act.includes("Refresh graph trust metadata"))).toBe(true);
    expect(result.affectedTaskIds).toContain(modifiedPlan.dependencies[0].fromTaskId);
    expect(result.affectedTaskIds).toContain(modifiedPlan.dependencies[0].toTaskId);
  });

  describe("Structural Validation Failures", () => {
    it("blocks calculation on cyclic graphs and reports cycle member tasks", () => {
      const cyclicPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // T15 is downstream of T01; adding T15 -> T01 creates a directed cycle
      cyclicPlan.dependencies.push({
        id: "D-CYCLE",
        fromTaskId: "T15",
        toTaskId: "T01",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Creates directed cycle",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const cyclicGraph = rebuildGraph(cyclicPlan);
      const result = guardRecovery({
        plan: cyclicPlan,
        graph: cyclicGraph,
      });

      expect(result.canCalculate).toBe(false);
      expect(result.canCommitLocally).toBe(false);
      expect(result.canPublishSynced).toBe(false);
      expect(result.blockingIssues.some((issue) => issue.includes("Directed cycle detected"))).toBe(true);
      expect(result.affectedTaskIds).toContain("T01");
      expect(result.affectedTaskIds).toContain("T15");
      expect(result.requiredActions.some((act) => act.includes("Eliminate directed cycles"))).toBe(true);
    });

    it("blocks calculation on graphs with missing task endpoint references", () => {
      const brokenPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      brokenPlan.dependencies.push({
        id: "D-BROKEN",
        fromTaskId: "T01",
        toTaskId: "T_NON_EXISTENT",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Broken endpoint reference",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      const brokenGraph = rebuildGraph(brokenPlan);
      const result = guardRecovery({
        plan: brokenPlan,
        graph: brokenGraph,
      });

      expect(result.canCalculate).toBe(false);
      expect(result.canCommitLocally).toBe(false);
      expect(result.blockingIssues.some((issue) => issue.includes("references to non-existent tasks"))).toBe(true);
      expect(result.affectedTaskIds).toContain("T_NON_EXISTENT");
    });
  });

  describe("Unresolved Conflicts & Draft Integrity", () => {
    it("blocks calculation on conflicted drafts while preserving accepted baseline integrity", () => {
      const graph = rebuildGraph(canonicalPlan);
      const conflict: ConflictRecord = {
        id: "conflict-101",
        conflictType: "same_field_edit",
        entityType: "task",
        entityId: "T03",
        fieldPath: "cost",
        baseValue: 5000,
        localValue: 4200,
        remoteValue: 4800,
        resolutionStatus: "unresolved",
      };

      // 1. Guarding the conflicted draft blocks calculation
      const conflictedResult = guardRecovery({
        plan: canonicalPlan,
        graph,
        syncState: "conflict",
        activeConflicts: [conflict],
      });

      expect(conflictedResult.canCalculate).toBe(false);
      expect(conflictedResult.canCommitLocally).toBe(false);
      expect(conflictedResult.canPublishSynced).toBe(false);
      expect(conflictedResult.blockingIssues.some((b) => b.includes("unresolved merge conflict"))).toBe(true);
      expect(conflictedResult.affectedTaskIds).toContain("T03");

      // 2. The separate accepted baseline without conflicts passes cleanly
      const baselineResult = guardRecovery({
        plan: canonicalPlan,
        graph,
        syncState: "in_sync",
        activeConflicts: [],
      });

      expect(baselineResult.canCalculate).toBe(true);
      expect(baselineResult.canCommitLocally).toBe(true);
      expect(baselineResult.blockingIssues).toHaveLength(0);
    });
  });

  describe("Offline-Local Operation & Publication Boundaries", () => {
    it("allows local calculation and commit for valid offline-local plan, but blocks remote publication", () => {
      const graph = rebuildGraph(canonicalPlan);
      const result = guardRecovery({
        plan: canonicalPlan,
        graph,
        syncState: "offline_dirty",
        isOffline: true,
        pendingOperationsCount: 3,
      });

      // Offline mode allows local work cleanly
      expect(result.canCalculate).toBe(true);
      expect(result.canCommitLocally).toBe(true);

      // But prevents claiming remote synchronized publication
      expect(result.canPublishSynced).toBe(false);
      expect(result.warnings.some((w) => w.includes("offline mode"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("3 offline operation(s) are queued"))).toBe(true);
    });
  });

  describe("Trust & Unreviewed Dependencies", () => {
    it("surfaces review requirements for unreviewed edges, allowing preview but blocking automated commit", () => {
      const planWithUnreviewed: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      planWithUnreviewed.dependencies[0].confirmationStatus = "unreviewed";

      const graph = rebuildGraph(planWithUnreviewed);
      const result = guardRecovery({
        plan: planWithUnreviewed,
        graph,
      });

      // Provisional preview / calculation permitted
      expect(result.canCalculate).toBe(true);

      // Mandatory review required before committing
      expect(result.requiresHumanReview).toBe(true);
      expect(result.canCommitLocally).toBe(false);
      expect(result.canPublishSynced).toBe(false);
      expect(result.warnings.some((w) => w.includes("unreviewed dependency edge(s)"))).toBe(true);
      expect(result.requiredActions.some((act) => act.includes("inspect and confirm"))).toBe(true);

      // Affected tasks include endpoints of the unreviewed edge
      expect(result.affectedTaskIds).toContain(planWithUnreviewed.dependencies[0].fromTaskId);
      expect(result.affectedTaskIds).toContain(planWithUnreviewed.dependencies[0].toTaskId);
    });
  });

  describe("Pre-Commit & Pre-Publication Verification Gates (S4.1 Requirement 4)", () => {
    it("verifyBeforeCommit re-checks trust and freshness immediately before commit", () => {
      const graph = rebuildGraph(canonicalPlan);
      const healthyCheck = verifyBeforeCommit({ plan: canonicalPlan, graph });
      expect(healthyCheck.allowed).toBe(true);
      expect(healthyCheck.blockingIssues).toHaveLength(0);

      // Broken graph blocks commit
      const stalePlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      stalePlan.tasks[0].durationHours = 99;
      const staleCheck = verifyBeforeCommit({ plan: stalePlan, graph });
      expect(staleCheck.allowed).toBe(false);
      expect(staleCheck.blockingIssues.length).toBeGreaterThan(0);
    });

    it("verifyBeforePublish re-checks sync and publication readiness before remote publish", () => {
      const graph = rebuildGraph(canonicalPlan);
      const healthyPublish = verifyBeforePublish({
        plan: canonicalPlan,
        graph,
        syncState: "in_sync",
        publicationStatus: "published",
      });
      expect(healthyPublish.allowed).toBe(true);

      // Offline mode blocks remote publish
      const offlinePublish = verifyBeforePublish({
        plan: canonicalPlan,
        graph,
        syncState: "offline_dirty",
        isOffline: true,
      });
      expect(offlinePublish.allowed).toBe(false);
    });
  });

  describe("Metadata Refresh Commit Path (S4.1 Requirements 3, 4, 5)", () => {
    it("refreshGraphMetadata updates node titles, edge reasons, recomputes metadataFingerprint, and yields fully fresh graph", () => {
      const baselineGraph = rebuildGraph(canonicalPlan);
      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.tasks[0].title = "Updated Event Brief Title";
      modifiedPlan.dependencies[0].reason = "Updated operational explanation";

      // Before refresh: metadata is stale
      const beforeRefreshCheck = guardRecovery({
        plan: modifiedPlan,
        graph: baselineGraph,
      });
      expect(beforeRefreshCheck.canCalculate).toBe(true);
      expect(beforeRefreshCheck.freshnessStatus).toBe("metadata_refresh_required");

      // Execute refreshGraphMetadata
      const refreshResult = refreshGraphMetadata(baselineGraph, modifiedPlan);
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.freshness.isFullyFreshAndValid).toBe(true);
      expect(refreshResult.freshness.status).toBe("fully_fresh_and_valid");
      expect(refreshResult.graph.metadataFingerprint).toBe(
        computeExplanationMetadataFingerprint(modifiedPlan)
      );
      expect(refreshResult.graph.nodes.find((n) => n.id === "T01")!.title).toBe(
        "Updated Event Brief Title"
      );
      expect(refreshResult.graph.edges.find((e) => e.id === modifiedPlan.dependencies[0].id)!.reason).toBe(
        "Updated operational explanation"
      );
    });

    it("commitPlanAndGraph automatically refreshes display metadata before committing and ensures matching current data", () => {
      const baselineGraph = rebuildGraph(canonicalPlan);
      const draftPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      draftPlan.planRevision = 2;
      draftPlan.tasks[0].title = "Refined Event Brief";
      draftPlan.dependencies[0].reason = "Refined dependency reason";

      // Initial commit call with unrefreshed graph
      const commitResult = commitPlanAndGraph({
        currentPlan: draftPlan,
        currentGraph: baselineGraph,
        baselinePlan: canonicalPlan,
        baselineGraph,
      });

      expect(commitResult.success).toBe(true);
      expect(commitResult.committedPlan.planRevision).toBe(2);
      expect(commitResult.freshnessStatus).toBe("fully_fresh_and_valid");
      expect(commitResult.committedGraph.graphSourceRevision).toBe(2);
      expect(commitResult.committedGraph.metadataFingerprint).toBe(
        computeExplanationMetadataFingerprint(draftPlan)
      );
      expect(commitResult.committedGraph.nodes.find((n) => n.id === "T01")!.title).toBe(
        "Refined Event Brief"
      );
      expect(commitResult.committedGraph.edges.find((e) => e.id === draftPlan.dependencies[0].id)!.reason).toBe(
        "Refined dependency reason"
      );
    });

    it("retains existing accepted baseline and returns actionable error when structural staleness prevents refresh", () => {
      const baselineGraph = rebuildGraph(canonicalPlan);
      const invalidDraftPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // Structurally diverged: duration changed
      invalidDraftPlan.tasks[0].durationHours = 999;
      invalidDraftPlan.tasks[0].title = "Diverged Task Title";

      const commitResult = commitPlanAndGraph({
        currentPlan: invalidDraftPlan,
        currentGraph: baselineGraph,
        baselinePlan: canonicalPlan,
        baselineGraph,
      });

      // Commit fails safely
      expect(commitResult.success).toBe(false);
      // Accepted baseline is strictly preserved!
      expect(commitResult.committedPlan).toBe(canonicalPlan);
      expect(commitResult.committedGraph).toBe(baselineGraph);
      expect(commitResult.actionableError).toBeDefined();
      expect(commitResult.actionableError).toContain("structurally stale");
      expect(commitResult.blockingIssues.length).toBeGreaterThan(0);
      expect(commitResult.requiredActions.some((a) => a.includes("Rebuild and validate"))).toBe(true);
    });

    it("retains existing accepted baseline and returns actionable error when trust-critical metadata is stale", () => {
      const baselineGraph = rebuildGraph(canonicalPlan);
      const untrustedDraftPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // Confirmation status diverged without rebuild or trust review
      untrustedDraftPlan.dependencies[0].confirmationStatus = "provisional";

      const commitResult = commitPlanAndGraph({
        currentPlan: untrustedDraftPlan,
        currentGraph: baselineGraph,
        baselinePlan: canonicalPlan,
        baselineGraph,
      });

      expect(commitResult.success).toBe(false);
      expect(commitResult.committedPlan).toBe(canonicalPlan);
      expect(commitResult.committedGraph).toBe(baselineGraph);
      expect(commitResult.actionableError).toContain("Trust-critical metadata");
      expect(commitResult.requiresHumanReview).toBe(true);
    });

    it("retains existing accepted baseline when structural errors (cycles) are present", () => {
      const baselineGraph = rebuildGraph(canonicalPlan);
      const cyclicPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      cyclicPlan.dependencies.push({
        id: "D-CYC",
        fromTaskId: "T15",
        toTaskId: "T01",
        blocksExecution: true,
        fieldMappings: [],
        reason: "cycle edge",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });
      const cyclicGraph = rebuildGraph(cyclicPlan);

      const commitResult = commitPlanAndGraph({
        currentPlan: cyclicPlan,
        currentGraph: cyclicGraph,
        baselinePlan: canonicalPlan,
        baselineGraph,
      });

      expect(commitResult.success).toBe(false);
      expect(commitResult.committedPlan).toBe(canonicalPlan);
      expect(commitResult.committedGraph).toBe(baselineGraph);
      expect(commitResult.actionableError).toContain("Directed cycle detected");
    });

    it("publishPlanAndGraph refreshes metadata on publish or rejects and preserves baseline when offline", () => {
      const baselineGraph = rebuildGraph(canonicalPlan);
      const draftPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      draftPlan.tasks[0].title = "Remote-Ready Event Brief";

      // 1. Online publish succeeds and refreshes graph metadata
      const onlineResult = publishPlanAndGraph({
        currentPlan: draftPlan,
        currentGraph: baselineGraph,
        baselinePlan: canonicalPlan,
        baselineGraph,
        syncState: "in_sync",
        publicationStatus: "published",
      });
      expect(onlineResult.success).toBe(true);
      expect(onlineResult.committedGraph.metadataFingerprint).toBe(
        computeExplanationMetadataFingerprint(draftPlan)
      );

      // 2. Offline publish is rejected and retains baseline
      const offlineResult = publishPlanAndGraph({
        currentPlan: draftPlan,
        currentGraph: baselineGraph,
        baselinePlan: canonicalPlan,
        baselineGraph,
        syncState: "offline_dirty",
        isOffline: true,
      });
      expect(offlineResult.success).toBe(false);
      expect(offlineResult.committedPlan).toBe(canonicalPlan);
      expect(offlineResult.committedGraph).toBe(baselineGraph);
      expect(offlineResult.actionableError).toContain("Publication rejected");
    });
  });
});

