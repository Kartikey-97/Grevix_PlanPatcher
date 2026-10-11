import type { Plan } from "../schemas/plan.schema";
import type { PlanOperation, ConflictRecord } from "../schemas/sync.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import type {
  SyncAdapter,
  SyncPullResult,
  SyncPushResult,
  ReconciliationResult,
} from "./sync-adapter";
import {
  threeWayMerge,
  applyResolvedConflictsToPlan,
  resolveConflict as resolveConflictHelper,
} from "./three-way-merge";
import { rebuildGraph } from "../graph/rebuild-graph";

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

/**
 * Deterministic In-Memory Sync Adapter for local simulation and testing.
 *
 * Simulates:
 * - Online / offline states.
 * - Independent remote changes.
 * - Three-way merge reconciliation.
 * - Atomic publication: publishes plan and graph as a consistent pair ONLY when graph validation succeeds.
 * - Retention of accepted baseline upon conflict or validation failure.
 */
export class LocalDemoSyncAdapter implements SyncAdapter {
  private online: boolean = true;
  private remotePlan: Plan;
  private remoteRevision: number;

  private acceptedBaselinePlan: Plan;
  private acceptedBaselineGraph: ExplainableDependencyGraph;

  private stagedDraftPlan?: Plan;
  private stagedDraftGraph?: ExplainableDependencyGraph;
  private activeConflicts: ConflictRecord[] = [];

  constructor(initialPlan: Plan) {
    this.remotePlan = clone(initialPlan);
    this.remoteRevision = initialPlan.planRevision ?? 1;

    this.acceptedBaselinePlan = clone(initialPlan);
    this.acceptedBaselineGraph = rebuildGraph(this.acceptedBaselinePlan);
  }

  public isOnline(): boolean {
    return this.online;
  }

  public simulateOffline(): void {
    this.online = false;
  }

  public simulateOnline(): void {
    this.online = true;
  }

  public async getRemoteRevision(): Promise<number> {
    if (!this.online) {
      throw new Error("Cannot get remote revision while offline");
    }
    return this.remoteRevision;
  }

  public async pullRemotePlan(sinceRevision?: number): Promise<SyncPullResult> {
    if (!this.online) {
      throw new Error("Cannot pull remote plan while offline");
    }
    const hasChanges = sinceRevision === undefined || sinceRevision < this.remoteRevision;
    return {
      remoteRevision: this.remoteRevision,
      remotePlan: clone(this.remotePlan),
      hasChanges,
    };
  }

  /**
   * Directly sets remote plan to simulate external concurrent changes on server.
   */
  public setRemotePlan(newPlan: Plan): void {
    this.remotePlan = clone(newPlan);
    this.remoteRevision = newPlan.planRevision ?? this.remoteRevision + 1;
    this.remotePlan.planRevision = this.remoteRevision;
  }

  public async pushOperations(operations: PlanOperation[]): Promise<SyncPushResult> {
    if (!this.online) {
      return {
        success: false,
        error: "Network unavailable: cannot push operations while offline",
      };
    }
    if (operations.length === 0) {
      return { success: true, publishedRevision: this.remoteRevision };
    }

    // In demo adapter, pushing operations requires running reconciliation against remote
    return {
      success: true,
      publishedRevision: this.remoteRevision,
    };
  }

  /**
   * Reconciles a local plan with the remote plan using base snapshot.
   *
   * Publication Safety:
   * 1. Merges local and remote against base snapshot.
   * 2. If conflicts exist: stops, retains baseline, stores conflicts and staged draft.
   * 3. Rebuilds explainable dependency graph.
   * 4. Validates graph: if invalid, stops, retains baseline, reports errors.
   * 5. Atomically publishes plan and graph together only when validation succeeds.
   */
  public async reconcile(localPlan: Plan, basePlan: Plan): Promise<ReconciliationResult> {
    if (!this.online) {
      return {
        success: false,
        status: "in_sync",
        error: "Cannot reconcile while offline",
      };
    }

    // 1. Perform 3-way merge
    const mergeResult = threeWayMerge(basePlan, localPlan, this.remotePlan);

    if (mergeResult.hasConflicts) {
      this.activeConflicts = clone(mergeResult.conflicts);
      this.stagedDraftPlan = clone(mergeResult.mergedPlan);

      return {
        success: false,
        status: "conflict",
        stagedPlan: clone(this.stagedDraftPlan),
        conflicts: clone(this.activeConflicts),
        error: "Merge conflicts detected. Operator resolution required before publication.",
      };
    }

    // 2. Conflict-free merge: Rebuild and validate graph
    const reconciledPlan = mergeResult.mergedPlan;
    const rebuiltGraph = rebuildGraph(reconciledPlan);

    // 3. Publication safety gate: validate graph
    if (!rebuiltGraph.validationSummary.isValid) {
      this.stagedDraftPlan = clone(reconciledPlan);
      this.stagedDraftGraph = clone(rebuiltGraph);

      const errors: string[] = [];
      if (rebuiltGraph.validationSummary.hasCycles) {
        errors.push(
          `Cycle detected in merged graph involving tasks: [${rebuiltGraph.validationSummary.cycleNodes.join(", ")}]`
        );
      }
      if (rebuiltGraph.validationSummary.missingTaskReferences.length > 0) {
        errors.push(
          `Missing task references in merged graph: [${rebuiltGraph.validationSummary.missingTaskReferences.join(", ")}]`
        );
      }
      if (rebuiltGraph.validationSummary.invalidFieldMappings.length > 0) {
        errors.push(
          `Invalid field mappings in merged graph: [${rebuiltGraph.validationSummary.invalidFieldMappings.join(", ")}]`
        );
      }

      return {
        success: false,
        status: "validation_failed",
        stagedPlan: clone(this.stagedDraftPlan),
        validationErrors: errors,
        error: "Merged plan failed graph validation; baseline retained.",
      };
    }

    // 4. Atomic publication: publish plan and graph together
    this.remotePlan = clone(reconciledPlan);
    this.remoteRevision = reconciledPlan.planRevision ?? this.remoteRevision + 1;
    this.acceptedBaselinePlan = clone(reconciledPlan);
    this.acceptedBaselineGraph = clone(rebuiltGraph);

    this.stagedDraftPlan = undefined;
    this.stagedDraftGraph = undefined;
    this.activeConflicts = [];

    return {
      success: true,
      status: "published",
      publishedRevision: this.remoteRevision,
      publishedPlan: clone(this.acceptedBaselinePlan),
      publishedGraph: clone(this.acceptedBaselineGraph),
    };
  }

  /**
   * Resolves a specific active conflict by ID.
   */
  public resolveConflict(
    conflictId: string,
    choice: "local" | "remote" | { customValue: unknown }
  ): ConflictRecord | undefined {
    const idx = this.activeConflicts.findIndex((c) => c.id === conflictId);
    if (idx === -1) return undefined;

    const resolved = resolveConflictHelper(this.activeConflicts[idx], choice);
    this.activeConflicts[idx] = resolved;
    return clone(resolved);
  }

  /**
   * Reconciles using the resolved conflict choices.
   */
  public async reconcileWithResolutions(
    customPlan?: Plan
  ): Promise<ReconciliationResult> {
    const unresolved = this.activeConflicts.filter((c) => c.resolutionStatus === "unresolved");
    if (unresolved.length > 0) {
      return {
        success: false,
        status: "conflict",
        conflicts: clone(this.activeConflicts),
        error: `Cannot publish: ${unresolved.length} unresolved conflict(s) remain.`,
      };
    }

    const planToApply = customPlan ?? this.stagedDraftPlan ?? this.acceptedBaselinePlan;
    const finalPlan = applyResolvedConflictsToPlan(planToApply, this.activeConflicts);

    // Rebuild and validate graph
    const rebuiltGraph = rebuildGraph(finalPlan);
    if (!rebuiltGraph.validationSummary.isValid) {
      this.stagedDraftPlan = clone(finalPlan);
      this.stagedDraftGraph = clone(rebuiltGraph);
      return {
        success: false,
        status: "validation_failed",
        stagedPlan: clone(this.stagedDraftPlan),
        error: "Resolved plan failed graph validation; publication blocked.",
      };
    }

    // Publish atomically
    this.remotePlan = clone(finalPlan);
    this.remoteRevision = finalPlan.planRevision ?? this.remoteRevision + 1;
    this.acceptedBaselinePlan = clone(finalPlan);
    this.acceptedBaselineGraph = clone(rebuiltGraph);

    this.activeConflicts = [];
    this.stagedDraftPlan = undefined;
    this.stagedDraftGraph = undefined;

    return {
      success: true,
      status: "published",
      publishedRevision: this.remoteRevision,
      publishedPlan: clone(this.acceptedBaselinePlan),
      publishedGraph: clone(this.acceptedBaselineGraph),
    };
  }

  public getAcceptedBaselinePlan(): Plan {
    return clone(this.acceptedBaselinePlan);
  }

  public getAcceptedBaselineGraph(): ExplainableDependencyGraph {
    return clone(this.acceptedBaselineGraph);
  }

  public getStagedDraftPlan(): Plan | undefined {
    return this.stagedDraftPlan ? clone(this.stagedDraftPlan) : undefined;
  }

  public getStagedDraftGraph(): ExplainableDependencyGraph | undefined {
    return this.stagedDraftGraph ? clone(this.stagedDraftGraph) : undefined;
  }

  public getActiveConflicts(): ConflictRecord[] {
    return clone(this.activeConflicts);
  }
}
