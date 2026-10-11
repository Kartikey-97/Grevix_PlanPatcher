import type { Plan } from "../schemas/plan.schema";
import type {
  PlanOperation,
  ConflictRecord,
  SyncState,
  BasePlanSnapshot,
  StagedDraftPlanState,
} from "../schemas/sync.schema";
import type { GraphConsistencyState, ExplainableDependencyGraph } from "../schemas/graph.schema";

export type {
  PlanOperation,
  ConflictRecord,
  SyncState,
  BasePlanSnapshot,
  StagedDraftPlanState,
  GraphConsistencyState,
  ExplainableDependencyGraph,
};

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

export interface SyncAdapter {
  getRemoteRevision(): Promise<number>;
  pullRemotePlan(sinceRevision?: number): Promise<SyncPullResult>;
  pushOperations(operations: PlanOperation[]): Promise<SyncPushResult>;
  simulateOffline(): void;
  simulateOnline(): void;
  isOnline(): boolean;
}
