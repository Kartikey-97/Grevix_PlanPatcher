import { describe, it, expect } from "vitest";
import {
  sha256Pure,
  computeStructuralFingerprint,
  computeExplanationMetadataFingerprint,
  computeGraphInputFingerprint,
  projectStructuralGraphInputs,
  projectExplanationMetadata,
  evaluateGraphFreshness,
  isGraphInputEqual,
  isExplanationMetadataEqual,
} from "../../../src/lib/sync/fingerprint";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S1.1: Runtime-Agnostic Fingerprinting & Freshness Separation", () => {
  describe("Pure TypeScript SHA-256 Runtime Independence (Refinement 3)", () => {
    it("hashes empty string matching standard RFC 6234 test vector", () => {
      const hash = sha256Pure("");
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("hashes known ASCII and UTF-8 strings deterministically without Node crypto", () => {
      const hash1 = sha256Pure("PlanPatch::GrevixAfterCode::2026");
      const hash2 = sha256Pure("PlanPatch::GrevixAfterCode::2026");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe("Structural vs. Metadata Fingerprint Separation (Refinement 1 & 4)", () => {
    it("produces deterministic structural and metadata fingerprints for baseline plan", () => {
      const structHash1 = computeStructuralFingerprint(canonicalPlan);
      const structHash2 = computeStructuralFingerprint(canonicalPlan);
      const metaHash1 = computeExplanationMetadataFingerprint(canonicalPlan);
      const metaHash2 = computeExplanationMetadataFingerprint(canonicalPlan);

      expect(structHash1).toBe(structHash2);
      expect(metaHash1).toBe(metaHash2);
      expect(structHash1).not.toBe(metaHash1);
    });

    it("verifies changes to dependency reasons require metadata refresh only, NOT structural rebuild", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies[0].reason = "Updated reason: Logistics team updated load requirements";

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.needsStructuralRebuild).toBe(false);
      expect(freshness.needsMetadataRefresh).toBe(true);
      expect(freshness.isFullyFresh).toBe(false);
    });

    it("verifies changes to dependency provenance (origin/history) require metadata refresh only", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies[0].origin = "manual";
      modifiedPlan.dependencies[0].modificationHistory.push({
        timestamp: "2026-10-11T11:20:00Z",
        author: "lead-planner",
        action: "reviewed",
        notes: "Verified constraint manually",
      });

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.needsStructuralRebuild).toBe(false);
      expect(freshness.needsMetadataRefresh).toBe(true);
    });

    it("verifies changes to task display metadata (title/status) require metadata refresh only", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.tasks[0].title = "Define primary campus event goals (Renamed)";
      modifiedPlan.tasks[0].status = "in_progress";

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.needsStructuralRebuild).toBe(false);
      expect(freshness.needsMetadataRefresh).toBe(true);
    });

    it("verifies changes to commercial cost or notes require NEITHER structural rebuild NOR metadata refresh", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.tasks[0].cost = 7500; // Cost affects budget metrics, not graph topology or node metadata
      modifiedPlan.notes = ["Updated illustrative demo note"];

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.needsStructuralRebuild).toBe(false);
      expect(freshness.needsMetadataRefresh).toBe(false);
      expect(freshness.isFullyFresh).toBe(true);
    });

    it("verifies changes to task duration require structural rebuild", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.tasks[0].durationHours = 24;

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.needsStructuralRebuild).toBe(true);
    });

    it("verifies changes to dependency edge connections require structural rebuild", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies[0].toTaskId = "T08"; // Re-routed dependency

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.needsStructuralRebuild).toBe(true);
    });
  });

  describe("Trust & Confirmation Status Impact on Recovery (Refinement 2)", () => {
    it("reports all dependencies confirmed in canonical baseline", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        canonicalPlan
      );

      expect(freshness.trustSummary.hasUnreviewedDependencies).toBe(false);
      expect(freshness.trustSummary.unreviewedDependencyIds).toHaveLength(0);
      expect(freshness.trustSummary.confirmedDependencyIds).toHaveLength(27);
      expect(freshness.trustSummary.reviewedDependencyIds).toHaveLength(0);
      expect(freshness.trustSummary.provisionalDependencyIds).toHaveLength(0);
    });

    it("flags unreviewed dependencies to prevent silent trust in uninspected edges", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      // Mark an AI-introduced or external draft dependency as unreviewed
      modifiedPlan.dependencies[0].confirmationStatus = "unreviewed";

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.trustSummary.hasUnreviewedDependencies).toBe(true);
      expect(freshness.trustSummary.unreviewedDependencyIds).toContain(modifiedPlan.dependencies[0].id);
      expect(freshness.needsMetadataRefresh).toBe(true);
      expect(freshness.needsStructuralRebuild).toBe(false); // Confirmation status change doesn't alter edge topology
    });

    it("identifies reviewed dependencies as awaiting binding verification", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies[1].confirmationStatus = "reviewed";

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.trustSummary.hasUnreviewedDependencies).toBe(false);
      expect(freshness.trustSummary.reviewedDependencyIds).toContain(modifiedPlan.dependencies[1].id);
    });

    it("identifies provisional dependencies as planning assumptions", () => {
      const baseStructHash = computeStructuralFingerprint(canonicalPlan);
      const baseMetaHash = computeExplanationMetadataFingerprint(canonicalPlan);

      const modifiedPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
      modifiedPlan.dependencies[2].confirmationStatus = "provisional";

      const freshness = evaluateGraphFreshness(
        { structuralFingerprint: baseStructHash, metadataFingerprint: baseMetaHash },
        modifiedPlan
      );

      expect(freshness.trustSummary.provisionalDependencyIds).toContain(modifiedPlan.dependencies[2].id);
    });
  });

  describe("Backward Compatibility", () => {
    it("maintains computeGraphInputFingerprint alias for existing callers", () => {
      const aliasHash = computeGraphInputFingerprint(canonicalPlan);
      const structHash = computeStructuralFingerprint(canonicalPlan);
      expect(aliasHash).toBe(structHash);
    });
  });
});
