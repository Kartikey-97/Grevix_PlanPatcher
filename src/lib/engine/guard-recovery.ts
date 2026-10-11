import type { Plan } from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import type {
  SyncState,
  PublicationStatus,
  ConflictRecord,
} from "../schemas/sync.schema";
import {
  checkGraphFreshness,
  type GraphFreshnessStatus,
} from "../graph/check-freshness";
import { refreshGraphMetadata } from "../graph/refresh-metadata";

export interface RecoveryGuardInput {
  plan: Plan;
  graph: ExplainableDependencyGraph;
  syncState?: SyncState;
  publicationStatus?: PublicationStatus;
  activeConflicts?: ConflictRecord[];
  pendingOperationsCount?: number;
  isOffline?: boolean;
}

export interface RecoveryGuardResult {
  /**
   * Whether recovery calculation and candidate preview are permitted against this plan/graph pair.
   */
  canCalculate: boolean;

  /**
   * Whether an accepted recovery patch may be committed to the local working baseline.
   */
  canCommitLocally: boolean;

  /**
   * Whether the recovery plan is eligible for synchronized publication to the remote server.
   */
  canPublishSynced: boolean;

  /**
   * Whether human operator inspection is mandatory before committing or publishing.
   */
  requiresHumanReview: boolean;

  /**
   * List of critical issues blocking calculation, local commit, or publication.
   */
  blockingIssues: string[];

  /**
   * Advisory notices (e.g. offline status, provisional planning assumptions).
   */
  warnings: string[];

  /**
   * Task IDs directly affected by cycles, broken endpoints, conflicts, or unreviewed edges.
   */
  affectedTaskIds: string[];

  /**
   * Concrete actionable remediation steps to unblock recovery operations.
   */
  requiredActions: string[];

  /**
   * Diagnostic graph freshness status.
   */
  freshnessStatus: GraphFreshnessStatus;

  /**
   * Current synchronization state.
   */
  syncState: SyncState;

  /**
   * Current publication staging status.
   */
  publicationStatus: PublicationStatus;
}

/**
 * Deterministic Gatekeeper for Plan Recovery Operations.
 *
 * Enforces safety invariants:
 * - A stale structural graph MUST NOT be used to calculate recommendations.
 * - Stale dependency trust metadata MUST NOT be treated as current.
 * - An invalid graph structure (cycles, broken references) MUST block recovery calculation.
 * - An unpublished or conflicting draft MUST NOT be treated as an accepted baseline.
 * - Unreviewed dependencies MUST be surfaced explicitly and block automated commit until reviewed.
 * - Valid offline-local plans support local calculation and commitment, but are barred from
 *   claiming remote synchronized publication until reconnected and reconciled.
 * - Evaluates plan/graph pairs without mutating baseline state.
 */
export function guardRecovery(input: RecoveryGuardInput): RecoveryGuardResult {
  const syncState: SyncState =
    input.syncState ?? (input.isOffline ? "offline_dirty" : "in_sync");
  const publicationStatus: PublicationStatus =
    input.publicationStatus ?? "published";
  const activeConflicts = input.activeConflicts ?? [];
  const pendingOperationsCount = input.pendingOperationsCount ?? 0;
  const isOffline = input.isOffline ?? (syncState === "offline_dirty");

  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const affectedTaskIds = new Set<string>();
  const requiredActions: string[] = [];

  let canCalculate = true;
  let canCommitLocally = true;
  let canPublishSynced = true;
  let requiresHumanReview = false;

  // 1. Evaluate Graph Freshness (Structural & Metadata Fingerprints)
  const freshness = checkGraphFreshness(input.graph, input.plan);

  if (freshness.needsStructuralRebuild) {
    canCalculate = false;
    canCommitLocally = false;
    canPublishSynced = false;
    blockingIssues.push(
      "Graph is structurally stale: plan topology, durations, or field mappings have diverged from the graph's structural fingerprint."
    );
    requiredActions.push(
      "Rebuild and validate the explainable dependency graph before generating recovery recommendations."
    );
  }

  if (freshness.isTrustMetadataStale) {
    // S4.1 Requirement 3: Stale trust-critical metadata (confirmationStatus / origin) blocks calculation
    canCalculate = false;
    canCommitLocally = false;
    canPublishSynced = false;
    requiresHumanReview = true;
    blockingIssues.push(
      `Trust-critical metadata (dependency confirmationStatus or origin) is stale on edge(s) [${freshness.staleTrustDependencyIds.join(", ")}]. Graph must be refreshed before calculating recovery recommendations.`
    );
    freshness.staleTrustDependencyIds.forEach((id) => {
      const edge = input.graph.edges.find((e) => e.id === id);
      if (edge) {
        affectedTaskIds.add(edge.fromTaskId);
        affectedTaskIds.add(edge.toTaskId);
      }
    });
    requiredActions.push(
      "Refresh graph trust metadata and re-evaluate before calculating recovery recommendations."
    );
  } else if (freshness.isDisplayMetadataOnlyStale) {
    // S4.1 Requirement 2: Display-only staleness allows safe structural preview/calculation,
    // while returning a metadata-refresh requirement
    requiresHumanReview = true;
    warnings.push(
      "Display-only metadata (task titles or explanatory text) is stale. Safe structural preview is permitted, but metadata refresh is required before final commitment or publication."
    );
    requiredActions.push(
      "Refresh graph explanation metadata before committing or publishing recovery report."
    );
  }

  // 2. Evaluate Structural Graph Validity (Acyclicity, Endpoints, Field Mappings)
  const validation = input.graph.validationSummary;
  if (!validation.isValid) {
    canCalculate = false;
    canCommitLocally = false;
    canPublishSynced = false;
    blockingIssues.push(
      "Graph contains structural validation errors that prevent safe recovery calculations."
    );

    if (validation.hasCycles) {
      blockingIssues.push(
        `Directed cycle detected involving cycle tasks: [${validation.cycleNodes.join(", ")}].`
      );
      validation.cycleNodes.forEach((id) => affectedTaskIds.add(id));
      validation.blockedByCycleNodes.forEach((id) => affectedTaskIds.add(id));
      requiredActions.push(
        "Eliminate directed cycles by removing or reversing cyclic dependency edge(s) among cycle tasks to restore an acyclic DAG."
      );
    }

    if (validation.missingTaskReferences.length > 0) {
      blockingIssues.push(
        `Graph contains references to non-existent tasks: [${validation.missingTaskReferences.join(", ")}].`
      );
      validation.missingTaskReferences.forEach((id) => affectedTaskIds.add(id));
      requiredActions.push(
        "Point dangling dependency edges to existing tasks or restore missing tasks."
      );
    }

    if (validation.invalidFieldMappings.length > 0) {
      blockingIssues.push(
        `Graph contains invalid field mappings: [${validation.invalidFieldMappings.join(", ")}].`
      );
      requiredActions.push(
        "Correct invalid source/target field mappings on affected dependency edges."
      );
    }
  }

  // 3. Evaluate Unresolved Conflicts
  const unresolvedConflicts = activeConflicts.filter(
    (c) => c.resolutionStatus === "unresolved"
  );
  if (unresolvedConflicts.length > 0) {
    canCalculate = false;
    canCommitLocally = false;
    canPublishSynced = false;
    blockingIssues.push(
      `${unresolvedConflicts.length} unresolved merge conflict(s) block recovery on this plan version.`
    );
    unresolvedConflicts.forEach((c) => {
      if (c.entityType === "task") {
        affectedTaskIds.add(c.entityId);
      }
    });
    requiredActions.push(
      "Resolve all outstanding merge conflicts before generating or accepting recommendations for this draft."
    );
  }

  // 4. Evaluate Publication and Staging Status
  if (publicationStatus === "validation_failed") {
    canCalculate = false;
    canCommitLocally = false;
    canPublishSynced = false;
    blockingIssues.push(
      "Plan publication status is 'validation_failed'; draft failed structural validation."
    );
    requiredActions.push(
      "Re-validate and fix structural errors on the staged draft plan."
    );
  } else if (publicationStatus === "draft_unvalidated") {
    warnings.push(
      "Plan is currently an unvalidated draft; recommendations calculated will remain provisional until validation passes."
    );
  }

  // 5. Evaluate Trust and Confirmation Status
  const unreviewedIds = validation.unreviewedDependencyIds ?? [];
  const provisionalIds = validation.provisionalDependencyIds ?? [];

  if (unreviewedIds.length > 0) {
    requiresHumanReview = true;
    // Unreviewed edges permit provisional preview/calculation, but block local commit until reviewed!
    canCommitLocally = false;
    canPublishSynced = false;
    warnings.push(
      `Plan contains ${unreviewedIds.length} unreviewed dependency edge(s): [${unreviewedIds.join(", ")}]. Provisional preview is permitted, but commitment is blocked.`
    );

    // Collect affected tasks incident to unreviewed edges
    input.graph.edges
      .filter((e) => unreviewedIds.includes(e.id))
      .forEach((e) => {
        affectedTaskIds.add(e.fromTaskId);
        affectedTaskIds.add(e.toTaskId);
      });

    requiredActions.push(
      `An operator must inspect and confirm unreviewed edge(s) [${unreviewedIds.join(", ")}] before committing recovery recommendations.`
    );
  }

  if (provisionalIds.length > 0) {
    warnings.push(
      `Plan contains ${provisionalIds.length} provisional planning assumption(s): [${provisionalIds.join(", ")}]. Recommendations relying on these edges remain provisional.`
    );
  }

  // 6. Evaluate Offline vs. Synced Publication Feasibility
  if (isOffline || syncState === "offline_dirty") {
    canPublishSynced = false;
    if (canCalculate && canCommitLocally) {
      warnings.push(
        "Working in offline mode. Local recovery calculation and commitment are permitted, but remote synchronized publication is disabled until reconnection."
      );
      if (pendingOperationsCount > 0) {
        warnings.push(
          `${pendingOperationsCount} offline operation(s) are queued and pending reconciliation.`
        );
      }
    }
    if (syncState === "conflict") {
      canPublishSynced = false;
    }
  } else {
    // Online mode: enforce clean sync status for remote publication
    if (syncState !== "in_sync" && syncState !== "reconciled") {
      canPublishSynced = false;
      warnings.push(
        `Sync state '${syncState}' prevents remote synchronized publication.`
      );
      requiredActions.push("Complete three-way reconciliation before publishing to remote server.");
    }
    if (publicationStatus !== "published" && publicationStatus !== "ready_to_publish") {
      canPublishSynced = false;
      warnings.push(
        `Publication status '${publicationStatus}' requires staging validation before publication.`
      );
    }
  }

  // If calculation is blocked, commitment is automatically blocked
  if (!canCalculate) {
    canCommitLocally = false;
    canPublishSynced = false;
  }

  return {
    canCalculate,
    canCommitLocally,
    canPublishSynced,
    requiresHumanReview,
    blockingIssues,
    warnings,
    affectedTaskIds: Array.from(affectedTaskIds).sort(),
    requiredActions,
    freshnessStatus: freshness.status,
    syncState,
    publicationStatus,
  };
}

/**
 * Re-checks graph freshness, trust state, and graph validity immediately before committing a patch.
 * S4.1 Requirement 4.
 */
export function verifyBeforeCommit(input: RecoveryGuardInput): {
  allowed: boolean;
  blockingIssues: string[];
  requiredActions: string[];
  requiresHumanReview: boolean;
} {
  const result = guardRecovery(input);
  return {
    allowed: result.canCommitLocally,
    blockingIssues: result.blockingIssues,
    requiredActions: result.requiredActions,
    requiresHumanReview: result.requiresHumanReview,
  };
}

/**
 * Re-checks graph freshness, trust state, and graph validity immediately before synchronized remote publication.
 * S4.1 Requirement 4.
 */
export function verifyBeforePublish(input: RecoveryGuardInput): {
  allowed: boolean;
  blockingIssues: string[];
  requiredActions: string[];
} {
  const result = guardRecovery(input);
  return {
    allowed: result.canPublishSynced,
    blockingIssues: result.blockingIssues,
    requiredActions: result.requiredActions,
  };
}

export interface CommitPlanAndGraphInput {
  currentPlan: Plan;
  currentGraph: ExplainableDependencyGraph;
  baselinePlan: Plan;
  baselineGraph: ExplainableDependencyGraph;
  syncState?: SyncState;
  publicationStatus?: PublicationStatus;
  activeConflicts?: ConflictRecord[];
  isOffline?: boolean;
}

export interface CommitPlanAndGraphResult {
  success: boolean;
  committedPlan: Plan;
  committedGraph: ExplainableDependencyGraph;
  freshnessStatus: GraphFreshnessStatus;
  actionableError?: string;
  blockingIssues: string[];
  requiredActions: string[];
  requiresHumanReview: boolean;
}

/**
 * Commits a recovery patch locally.
 *
 * Enforces S4.1 Commit Path Invariants:
 * 1. Structural staleness and trust-critical staleness block commitment.
 * 2. If display-only metadata is stale, refreshes graph metadata and recomputes metadataFingerprint.
 * 3. Revalidates immediately before commit: committed plan and graph represent matching current data.
 *    Never marks an unrefreshed graph fully fresh.
 * 4. If refresh or validation fails, retains the existing accepted baseline plan & graph and returns an actionable error.
 */
export function commitPlanAndGraph(input: CommitPlanAndGraphInput): CommitPlanAndGraphResult {
  // 1. Initial safety inspection via guardRecovery
  const initialGuard = guardRecovery({
    plan: input.currentPlan,
    graph: input.currentGraph,
    syncState: input.syncState,
    publicationStatus: input.publicationStatus,
    activeConflicts: input.activeConflicts,
    isOffline: input.isOffline,
  });

  // If local commit is blocked (structural staleness, trust-critical staleness, cycles, conflicts, etc.)
  if (!initialGuard.canCommitLocally) {
    return {
      success: false,
      committedPlan: input.baselinePlan,
      committedGraph: input.baselineGraph,
      freshnessStatus: initialGuard.freshnessStatus,
      actionableError: `Commit rejected: ${initialGuard.blockingIssues.join("; ") || "Cannot commit draft baseline."}`,
      blockingIssues: initialGuard.blockingIssues,
      requiredActions: initialGuard.requiredActions,
      requiresHumanReview: initialGuard.requiresHumanReview,
    };
  }

  // 2. S4.1 Requirement 3: Refresh graph's display metadata and recompute its metadata fingerprint
  let targetGraph = input.currentGraph;
  if (initialGuard.freshnessStatus === "metadata_refresh_required") {
    const refreshResult = refreshGraphMetadata(input.currentGraph, input.currentPlan);
    if (!refreshResult.success) {
      // S4.1 Requirement 5: Retain accepted baseline and return actionable error
      return {
        success: false,
        committedPlan: input.baselinePlan,
        committedGraph: input.baselineGraph,
        freshnessStatus: refreshResult.freshness.status,
        actionableError: `Commit rejected: Display metadata refresh failed: ${refreshResult.error}`,
        blockingIssues: [refreshResult.error ?? "Failed to refresh graph metadata before commit."],
        requiredActions: [refreshResult.freshness.remediationAction],
        requiresHumanReview: true,
      };
    }
    targetGraph = refreshResult.graph;
  }

  // 3. S4.1 Requirement 4: Revalidate freshness immediately before commit
  const finalGuard = guardRecovery({
    plan: input.currentPlan,
    graph: targetGraph,
    syncState: input.syncState,
    publicationStatus: input.publicationStatus,
    activeConflicts: input.activeConflicts,
    isOffline: input.isOffline,
  });

  if (!finalGuard.canCommitLocally || finalGuard.freshnessStatus !== "fully_fresh_and_valid") {
    return {
      success: false,
      committedPlan: input.baselinePlan,
      committedGraph: input.baselineGraph,
      freshnessStatus: finalGuard.freshnessStatus,
      actionableError: `Commit rejected: Post-refresh verification failed: ${finalGuard.blockingIssues.join("; ") || "Graph is not fully fresh and valid."}`,
      blockingIssues: finalGuard.blockingIssues,
      requiredActions: finalGuard.requiredActions,
      requiresHumanReview: finalGuard.requiresHumanReview,
    };
  }

  // Commit succeeds: the new baseline is currentPlan and the matching refreshed graph
  return {
    success: true,
    committedPlan: input.currentPlan,
    committedGraph: targetGraph,
    freshnessStatus: finalGuard.freshnessStatus,
    blockingIssues: [],
    requiredActions: [],
    requiresHumanReview: finalGuard.requiresHumanReview,
  };
}

/**
 * Stages and publishes a recovery patch for remote synchronization.
 *
 * Enforces S4.1 Remote Publication Invariants:
 * 1. Offline status, conflicts, or dirty state block remote publication.
 * 2. Refreshes display metadata before publication if needed.
 * 3. Never publishes an unrefreshed, stale, or conflicted draft.
 * 4. Retains baseline on failure.
 */
export function publishPlanAndGraph(input: CommitPlanAndGraphInput): CommitPlanAndGraphResult {
  const initialGuard = guardRecovery({
    plan: input.currentPlan,
    graph: input.currentGraph,
    syncState: input.syncState,
    publicationStatus: input.publicationStatus,
    activeConflicts: input.activeConflicts,
    isOffline: input.isOffline,
  });

  if (!initialGuard.canPublishSynced) {
    return {
      success: false,
      committedPlan: input.baselinePlan,
      committedGraph: input.baselineGraph,
      freshnessStatus: initialGuard.freshnessStatus,
      actionableError: `Publication rejected: ${initialGuard.blockingIssues.join("; ") || initialGuard.warnings.join("; ") || "Plan/graph pair is not eligible for synchronized publication."}`,
      blockingIssues: initialGuard.blockingIssues,
      requiredActions: initialGuard.requiredActions,
      requiresHumanReview: initialGuard.requiresHumanReview,
    };
  }

  let targetGraph = input.currentGraph;
  if (initialGuard.freshnessStatus === "metadata_refresh_required") {
    const refreshResult = refreshGraphMetadata(input.currentGraph, input.currentPlan);
    if (!refreshResult.success) {
      return {
        success: false,
        committedPlan: input.baselinePlan,
        committedGraph: input.baselineGraph,
        freshnessStatus: refreshResult.freshness.status,
        actionableError: `Publication rejected: Display metadata refresh failed: ${refreshResult.error}`,
        blockingIssues: [refreshResult.error ?? "Failed to refresh metadata before publication."],
        requiredActions: [refreshResult.freshness.remediationAction],
        requiresHumanReview: true,
      };
    }
    targetGraph = refreshResult.graph;
  }

  const finalGuard = guardRecovery({
    plan: input.currentPlan,
    graph: targetGraph,
    syncState: input.syncState,
    publicationStatus: input.publicationStatus,
    activeConflicts: input.activeConflicts,
    isOffline: input.isOffline,
  });

  if (!finalGuard.canPublishSynced || finalGuard.freshnessStatus !== "fully_fresh_and_valid") {
    return {
      success: false,
      committedPlan: input.baselinePlan,
      committedGraph: input.baselineGraph,
      freshnessStatus: finalGuard.freshnessStatus,
      actionableError: `Publication rejected: Post-refresh verification failed: ${finalGuard.blockingIssues.join("; ") || "Graph is not fully fresh and valid."}`,
      blockingIssues: finalGuard.blockingIssues,
      requiredActions: finalGuard.requiredActions,
      requiresHumanReview: finalGuard.requiresHumanReview,
    };
  }

  return {
    success: true,
    committedPlan: input.currentPlan,
    committedGraph: targetGraph,
    freshnessStatus: finalGuard.freshnessStatus,
    blockingIssues: [],
    requiredActions: [],
    requiresHumanReview: finalGuard.requiresHumanReview,
  };
}

