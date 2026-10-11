import { describe, it, expect } from "vitest";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { checkGraphFreshness } from "../../../src/lib/graph/check-freshness";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S2: Graph Freshness & Trust Status Checks", () => {
  it("evaluates unchanged baseline graph as fully_fresh_and_valid", () => {
    const graph = rebuildGraph(canonicalPlan);
    const result = checkGraphFreshness(graph, canonicalPlan);

    expect(result.status).toBe("fully_fresh_and_valid");
    expect(result.isFullyFreshAndValid).toBe(true);
    expect(result.needsStructuralRebuild).toBe(false);
    expect(result.needsMetadataRefresh).toBe(false);
    expect(result.hasStructuralErrors).toBe(false);
    expect(result.hasUnresolvedTrust).toBe(false);
  });

  describe("Commercial & Cosmetic Edits (No Unnecessary Rebuild)", () => {
    it("preserves fully_fresh_and_valid status when task cost or notes change", () => {
      const graph = rebuildGraph(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // Cost and notes do NOT affect graph structure or explanation metadata
      modifiedPlan.tasks[0].cost = 9999;
      modifiedPlan.notes = ["New note"];

      const result = checkGraphFreshness(graph, modifiedPlan);
      expect(result.status).toBe("fully_fresh_and_valid");
      expect(result.needsStructuralRebuild).toBe(false);
      expect(result.needsMetadataRefresh).toBe(false);
    });

    it("preserves fully_fresh_and_valid status when task priority changes", () => {
      const graph = rebuildGraph(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.tasks[0].priority = 1;

      const result = checkGraphFreshness(graph, modifiedPlan);
      expect(result.status).toBe("fully_fresh_and_valid");
      expect(result.needsStructuralRebuild).toBe(false);
      expect(result.needsMetadataRefresh).toBe(false);
    });
  });

  describe("Metadata Refresh Required", () => {
    it("detects when dependency reason changes without requiring structural rebuild", () => {
      const graph = rebuildGraph(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies[0].reason = "Updated rationale note";

      const result = checkGraphFreshness(graph, modifiedPlan);
      expect(result.status).toBe("metadata_refresh_required");
      expect(result.needsStructuralRebuild).toBe(false);
      expect(result.needsMetadataRefresh).toBe(true);
      expect(result.isFullyFreshAndValid).toBe(false);
    });

    it("detects when dependency confirmation status changes without requiring structural rebuild", () => {
      const graph = rebuildGraph(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies[0].confirmationStatus = "reviewed";

      const result = checkGraphFreshness(graph, modifiedPlan);
      expect(result.status).toBe("metadata_refresh_required");
      expect(result.needsStructuralRebuild).toBe(false);
      expect(result.needsMetadataRefresh).toBe(true);
    });

    it("detects when task display title changes without requiring structural rebuild", () => {
      const graph = rebuildGraph(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.tasks[0].title = "Renamed task title";

      const result = checkGraphFreshness(graph, modifiedPlan);
      expect(result.status).toBe("metadata_refresh_required");
      expect(result.needsStructuralRebuild).toBe(false);
      expect(result.needsMetadataRefresh).toBe(true);
    });
  });

  describe("Structural Rebuild Required", () => {
    it("detects when task duration changes", () => {
      const graph = rebuildGraph(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.tasks[0].durationHours = 100;

      const result = checkGraphFreshness(graph, modifiedPlan);
      expect(result.status).toBe("structural_rebuild_required");
      expect(result.needsStructuralRebuild).toBe(true);
    });

    it("detects when a dependency edge is removed", () => {
      const graph = rebuildGraph(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies.pop();

      const result = checkGraphFreshness(graph, modifiedPlan);
      expect(result.status).toBe("structural_rebuild_required");
      expect(result.needsStructuralRebuild).toBe(true);
    });
  });

  describe("Structural Errors vs. Unresolved Trust", () => {
    it("identifies fresh_but_structurally_invalid when graph has cycles matching plan", () => {
      const cyclicPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      cyclicPlan.dependencies.push({
        id: "D-cycle",
        fromTaskId: "T15",
        toTaskId: "T01",
        blocksExecution: true,
        fieldMappings: [],
        reason: "Cycle",
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      });

      // Rebuild graph from cyclic plan (fingerprint matches cyclicPlan)
      const graph = rebuildGraph(cyclicPlan);
      const result = checkGraphFreshness(graph, cyclicPlan);

      expect(result.status).toBe("fresh_but_structurally_invalid");
      expect(result.hasStructuralErrors).toBe(true);
      expect(result.isFullyFreshAndValid).toBe(false);
    });

    it("identifies structurally_valid_but_unresolved_trust when graph has unreviewed dependencies", () => {
      const unreviewedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      unreviewedPlan.dependencies[0].confirmationStatus = "unreviewed";

      // Rebuild graph from plan with unreviewed edge
      const graph = rebuildGraph(unreviewedPlan);
      const result = checkGraphFreshness(graph, unreviewedPlan);

      expect(result.status).toBe("structurally_valid_but_unresolved_trust");
      expect(result.hasStructuralErrors).toBe(false); // Graph is structurally acyclic and valid
      expect(result.hasUnresolvedTrust).toBe(true);
      expect(result.unreviewedDependencyIds).toContain(unreviewedPlan.dependencies[0].id);
      expect(result.isFullyFreshAndValid).toBe(false);
    });
  });
});
