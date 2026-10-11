import { z } from "zod";

export const SyncStateSchema = z.enum([
  "in_sync",        // Local plan revision matches remote revision; operation queue empty
  "offline_dirty",  // Local offline operations queued; waiting to reconcile
  "syncing",        // Active three-way reconciliation in progress
  "conflict",       // Same-field or delete/modify collisions detected; operator resolution required
  "reconciled",     // Three-way merge completed; staged for graph validation and publication
]);
export type SyncState = z.infer<typeof SyncStateSchema>;

export const OperationTypeSchema = z.enum([
  "task_add",
  "task_update_field",
  "task_remove",
  "dependency_add",
  "dependency_update",
  "dependency_remove",
  "constraint_update",
]);
export type OperationType = z.infer<typeof OperationTypeSchema>;

export const PlanOperationSchema = z.object({
  id: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  timestamp: z.string(),
  author: z.string(),
  type: OperationTypeSchema,
  targetId: z.string(),
  fieldPath: z.string().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  payload: z.unknown().optional(),
});
export type PlanOperation = z.infer<typeof PlanOperationSchema>;

export const ConflictTypeSchema = z.enum([
  "same_field_edit",           // Both local and remote altered the same field to conflicting values
  "task_delete_modify",        // Local deleted the task, but remote substantively modified it
  "task_modify_delete",        // Local substantively modified the task, but remote deleted it
  "dependency_delete_modify",  // Local deleted the dependency, but remote updated it
  "dependency_modify_delete",  // Local updated the dependency, but remote deleted it
]);
export type ConflictType = z.infer<typeof ConflictTypeSchema>;

export const ConflictResolutionStatusSchema = z.enum([
  "unresolved",
  "resolved_local",
  "resolved_remote",
  "resolved_custom",
]);
export type ConflictResolutionStatus = z.infer<typeof ConflictResolutionStatusSchema>;

export const ConflictRecordSchema = z.object({
  id: z.string(),
  conflictType: ConflictTypeSchema,
  entityType: z.enum(["task", "dependency", "constraint"]),
  entityId: z.string(),
  fieldPath: z.string().optional(),
  baseValue: z.unknown(),
  localValue: z.unknown(),
  remoteValue: z.unknown(),
  resolvedValue: z.unknown().optional(),
  resolutionStatus: ConflictResolutionStatusSchema.default("unresolved"),
});
export type ConflictRecord = z.infer<typeof ConflictRecordSchema>;

export const BasePlanSnapshotSchema = z.object({
  planRevision: z.number().int().nonnegative(),
  fingerprint: z.string(),
  planSnapshot: z.record(z.unknown()),
  capturedAt: z.string(),
});
export type BasePlanSnapshot = z.infer<typeof BasePlanSnapshotSchema>;

export const PublicationStatusSchema = z.enum([
  "draft_unvalidated",   // Reconciled draft created; graph has not passed validation
  "validation_failed",   // Graph rebuild discovered cycles, broken references, or invalid mappings
  "ready_to_publish",    // Graph rebuilt and passed 100% validation; ready for atomic commit
  "published",           // Formally published as active baseline
]);
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;

export const StagedDraftPlanStateSchema = z.object({
  draftId: z.string(),
  baseRevision: z.number().int().nonnegative(),
  targetRevision: z.number().int().nonnegative(),
  stagedPlan: z.record(z.unknown()),
  stagedGraphFingerprint: z.string(),
  stagedAt: z.string(),
  publicationStatus: PublicationStatusSchema,
  validationReport: z.object({
    isValid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
});
export type StagedDraftPlanState = z.infer<typeof StagedDraftPlanStateSchema>;
