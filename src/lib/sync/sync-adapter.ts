import type { Plan } from "../schemas/plan.schema";
import type { PlanOperation, ConflictRecord } from "../schemas/sync.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";

export interface SyncPullResult {
  remoteRevision: number;
  remotePlan: Plan;
  hasChanges: boolean;
}

export interface SyncPushResult {
  success: boolean;
  publishedRevision?: number;
  stagedDraftId?: string;
  conflicts?: ConflictRecord[];
  error?: string;
}

export interface ReconciliationResult {
  success: boolean;
  status: "in_sync" | "conflict" | "validation_failed" | "published";
  publishedRevision?: number;
  publishedPlan?: Plan;
  publishedGraph?: ExplainableDependencyGraph;
  stagedPlan?: Plan;
  conflicts?: ConflictRecord[];
  validationErrors?: string[];
  error?: string;
}

/**
 * Common interface for synchronizing plan revisions and offline operations.
 */
export interface SyncAdapter {
  getRemoteRevision(): Promise<number>;
  pullRemotePlan(sinceRevision?: number): Promise<SyncPullResult>;
  pushOperations(operations: PlanOperation[]): Promise<SyncPushResult>;
  simulateOffline(): void;
  simulateOnline(): void;
  isOnline(): boolean;
}


