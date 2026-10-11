import { describe, it, expect } from "vitest";
import {
  PlanOperationSchema,
  ConflictRecordSchema,
  ConflictTypeSchema,
  StagedDraftPlanStateSchema,
  PublicationStatusSchema,
  SyncStateSchema,
} from "../../../src/lib/schemas/sync.schema";
import {
  ExplainableDependencySchema,
  GraphConsistencyStateSchema,
  DependencyOriginSchema,
  EdgeConfirmationStatusSchema,
} from "../../../src/lib/schemas/graph.schema";
import { PlanSchema } from "../../../src/lib/schemas/plan.schema";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";

describe("Milestone S1: Sync Contracts & Provenance Data Model", () => {
  describe("PlanOperation Data Contract (Refinement 2)", () => {
    it("validates offline plan operations with baseRevision tracking", () => {
      const op = {
        id: "op-101",
        baseRevision: 1,
        timestamp: "2026-10-11T11:00:00Z",
        author: "team-lead-offline",
        type: "task_update_field" as const,
        targetId: "T03",
        fieldPath: "durationHours",
        oldValue: 24,
        newValue: 28,
      };

      const parsed = PlanOperationSchema.parse(op);
      expect(parsed.id).toBe("op-101");
      expect(parsed.baseRevision).toBe(1);
      expect(parsed.type).toBe("task_update_field");
    });

    it("rejects operations with negative baseRevision", () => {
      const invalidOp = {
        id: "op-102",
        baseRevision: -1,
        timestamp: "2026-10-11T11:00:00Z",
        author: "team-lead",
        type: "task_add" as const,
        targetId: "T99",
      };

      expect(PlanOperationSchema.safeParse(invalidOp).success).toBe(false);
    });
  });

  describe("Symmetric Delete/Modify Conflict Taxonomy (Refinement 2)", () => {
    it("validates all 5 symmetric conflict categories", () => {
      const validConflictTypes = [
        "same_field_edit",
        "task_delete_modify",
        "task_modify_delete",
        "dependency_delete_modify",
        "dependency_modify_delete",
      ];

      for (const cType of validConflictTypes) {
        expect(ConflictTypeSchema.parse(cType)).toBe(cType);
      }
    });

    it("validates conflict record for symmetric task delete vs modify", () => {
      const deleteModifyRecord = {
        id: "conflict-01",
        conflictType: "task_delete_modify" as const,
        entityType: "task" as const,
        entityId: "T06",
        fieldPath: "cost",
        baseValue: 2200,
        localValue: null, // deleted locally
        remoteValue: 1900, // modified on remote
        resolutionStatus: "unresolved" as const,
      };

      const parsed = ConflictRecordSchema.parse(deleteModifyRecord);
      expect(parsed.conflictType).toBe("task_delete_modify");
      expect(parsed.resolutionStatus).toBe("unresolved");
    });
  });

  describe("Explainable Dependency Provenance & Review vs Confirmation (Refinement 3)", () => {
    it("validates edge provenance origin and confirmation status taxonomy", () => {
      expect(DependencyOriginSchema.parse("ai_suggested")).toBe("ai_suggested");
      expect(DependencyOriginSchema.parse("manual")).toBe("manual");
      expect(DependencyOriginSchema.parse("system_template")).toBe("system_template");
      expect(DependencyOriginSchema.parse("reconciled")).toBe("reconciled");

      expect(EdgeConfirmationStatusSchema.parse("unreviewed")).toBe("unreviewed");
      expect(EdgeConfirmationStatusSchema.parse("reviewed")).toBe("reviewed");
      expect(EdgeConfirmationStatusSchema.parse("confirmed")).toBe("confirmed");
      expect(EdgeConfirmationStatusSchema.parse("provisional")).toBe("provisional");
    });

    it("preserves original source origin across subsequent modification history", () => {
      const edge = {
        id: "D99",
        fromTaskId: "T03",
        toTaskId: "T05",
        blocksExecution: true,
        fieldMappings: [{ sourceField: "capacity", targetInput: "venueCapacity" }],
        reason: "Registration capacity must match selected venue",
        origin: "ai_suggested" as const,
        confirmationStatus: "reviewed" as const,
        modificationHistory: [
          {
            timestamp: "2026-10-11T10:00:00Z",
            author: "gemini-adapter",
            action: "created" as const,
            notes: "Proposed alternative venue capacity mapping",
          },
          {
            timestamp: "2026-10-11T10:30:00Z",
            author: "human-operator",
            action: "reviewed" as const,
            notes: "Operator inspected field mappings; pending budget approval",
          },
        ],
      };

      const parsed = ExplainableDependencySchema.parse(edge);
      expect(parsed.origin).toBe("ai_suggested");
      expect(parsed.confirmationStatus).toBe("reviewed");
      expect(parsed.modificationHistory).toHaveLength(2);
      expect(parsed.modificationHistory[1].author).toBe("human-operator");
    });

    it("ensures canonical baseline dependencies default to confirmed system_template", () => {
      const baseEdge = canonicalPlan.dependencies[0];
      expect(baseEdge.origin).toBe("system_template");
      expect(baseEdge.confirmationStatus).toBe("confirmed");
    });
  });

  describe("Consistent Publication Staging (Refinement 4)", () => {
    it("validates staged draft plan state transitions", () => {
      const validStatuses = [
        "draft_unvalidated",
        "validation_failed",
        "ready_to_publish",
        "published",
      ];

      for (const status of validStatuses) {
        expect(PublicationStatusSchema.parse(status)).toBe(status);
      }
    });

    it("validates atomic staging contract bundling plan, graph fingerprint, and validation report", () => {
      const stagedDraft = {
        draftId: "draft-xyz",
        baseRevision: 1,
        targetRevision: 2,
        stagedPlan: JSON.parse(JSON.stringify(canonicalPlan)),
        stagedGraphFingerprint: "abc123hash",
        stagedAt: "2026-10-11T11:10:00Z",
        publicationStatus: "ready_to_publish" as const,
        validationReport: {
          isValid: true,
          errors: [],
          warnings: ["1 edge marked provisional"],
        },
      };

      const parsed = StagedDraftPlanStateSchema.parse(stagedDraft);
      expect(parsed.publicationStatus).toBe("ready_to_publish");
      expect(parsed.validationReport.isValid).toBe(true);
    });
  });

  describe("Backward Compatibility with Canonical Baseline", () => {
    it("parses canonical plan fixture cleanly with revision defaults", () => {
      expect(canonicalPlan.planRevision).toBe(1);
      expect(canonicalPlan.tasks).toHaveLength(16);
      expect(canonicalPlan.dependencies).toHaveLength(27);
    });

    it("verifies all sync states are supported", () => {
      const validSyncStates = [
        "in_sync",
        "offline_dirty",
        "syncing",
        "conflict",
        "reconciled",
      ];
      for (const s of validSyncStates) {
        expect(SyncStateSchema.parse(s)).toBe(s);
      }
    });

    it("verifies all graph consistency states are supported", () => {
      const validGraphStates = [
        "current_valid",
        "stale_pending_rebuild",
        "rebuilding",
        "invalid_reference",
        "invalid_cyclic",
        "conflict_blocked",
      ];
      for (const s of validGraphStates) {
        expect(GraphConsistencyStateSchema.parse(s)).toBe(s);
      }
    });
  });
});
