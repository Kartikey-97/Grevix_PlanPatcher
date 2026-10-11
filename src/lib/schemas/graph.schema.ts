import { z } from "zod";
import {
  FieldMappingSchema,
  DependencyOriginSchema,
  type DependencyOrigin,
  EdgeConfirmationStatusSchema,
  type EdgeConfirmationStatus,
  EdgeProvenanceRecordSchema,
  type EdgeProvenanceRecord,
} from "./plan.schema";

export {
  DependencyOriginSchema,
  type DependencyOrigin,
  EdgeConfirmationStatusSchema,
  type EdgeConfirmationStatus,
  EdgeProvenanceRecordSchema,
  type EdgeProvenanceRecord,
};

export const GraphConsistencyStateSchema = z.enum([
  "current_valid",          // Graph matches plan's canonical graph projection and is acyclic & verified
  "stale_pending_rebuild",  // Plan graph-input fingerprint has diverged; structural rebuild required before recovery
  "rebuilding",             // Rebuild currently underway
  "invalid_reference",      // Graph references missing tasks or unmapped output fields
  "invalid_cyclic",         // Graph contains circular dependencies
  "conflict_blocked",       // Unmerged plan conflicts block graph rebuilding
]);
export type GraphConsistencyState = z.infer<typeof GraphConsistencyStateSchema>;


export const ExplainableDependencySchema = z.object({
  id: z.string(),
  fromTaskId: z.string(),
  toTaskId: z.string(),
  blocksExecution: z.boolean(),
  fieldMappings: z.array(FieldMappingSchema).default([]),
  reason: z.string().default("Required predecessor execution dependency"),
  origin: DependencyOriginSchema.default("system_template"),
  confirmationStatus: EdgeConfirmationStatusSchema.default("confirmed"),
  relevantSourceFields: z.array(z.string()).optional(),
  relevantTargetFields: z.array(z.string()).optional(),
  modificationHistory: z.array(EdgeProvenanceRecordSchema).default([]),
  removeEdgeIfSourceRemoved: z.boolean().optional(),
});
export type ExplainableDependency = z.infer<typeof ExplainableDependencySchema>;

export const GraphValidationSummarySchema = z.object({
  isValid: z.boolean(),
  hasCycles: z.boolean(),
  cycleNodes: z.array(z.string()).default([]),
  blockedByCycleNodes: z.array(z.string()).default([]),
  missingTaskReferences: z.array(z.string()).default([]),
  invalidFieldMappings: z.array(z.string()).default([]),
  hasUnreviewedDependencies: z.boolean().default(false),
  unreviewedDependencyIds: z.array(z.string()).default([]),
  reviewedDependencyIds: z.array(z.string()).default([]),
  provisionalDependencyIds: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type GraphValidationSummary = z.infer<typeof GraphValidationSummarySchema>;

export const GraphFreshnessMetadataSchema = z.object({
  graphSourceRevision: z.number().int().nonnegative(),
  graphInputFingerprint: z.string(), // Structural fingerprint
  structuralFingerprint: z.string().optional(),
  metadataFingerprint: z.string().optional(),
  consistencyState: GraphConsistencyStateSchema,
  computedAt: z.string(),
  validationSummary: GraphValidationSummarySchema,
});
export type GraphFreshnessMetadata = z.infer<typeof GraphFreshnessMetadataSchema>;

export const ExplainableDependencyGraphSchema = z.object({
  graphId: z.string(),
  graphSourceRevision: z.number().int().nonnegative(),
  graphInputFingerprint: z.string(), // Structural fingerprint
  metadataFingerprint: z.string().optional(),
  consistencyState: GraphConsistencyStateSchema,
  nodes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      durationHours: z.number().nonnegative(),
      policy: z.string(),
    })
  ),
  edges: z.array(ExplainableDependencySchema),
  criticalPaths: z.array(z.array(z.string())).default([]),
  validationSummary: GraphValidationSummarySchema,
  provenanceSummary: z.object({
    totalEdges: z.number().int().nonnegative(),
    manualEdges: z.number().int().nonnegative(),
    systemEdges: z.number().int().nonnegative(),
    aiSuggestedEdges: z.number().int().nonnegative(),
    confirmedEdges: z.number().int().nonnegative(),
    provisionalEdges: z.number().int().nonnegative(),
    unreviewedEdges: z.number().int().nonnegative(),
  }),
});
export type ExplainableDependencyGraph = z.infer<typeof ExplainableDependencyGraphSchema>;
