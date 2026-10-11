import type { Plan } from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import {
  computeStructuralFingerprint,
  computeExplanationMetadataFingerprint,
} from "../sync/fingerprint";

export type GraphFreshnessStatus =
  | "fully_fresh_and_valid"
  | "metadata_refresh_required"
  | "structural_rebuild_required"
  | "fresh_but_structurally_invalid"
  | "structurally_valid_but_unresolved_trust";

export interface GraphFreshnessCheckResult {
  status: GraphFreshnessStatus;
  isFullyFreshAndValid: boolean;
  needsStructuralRebuild: boolean;
  needsMetadataRefresh: boolean;
  isTrustMetadataStale: boolean;
  isDisplayMetadataOnlyStale: boolean;
  staleTrustDependencyIds: string[];
  hasStructuralErrors: boolean;
  hasUnresolvedTrust: boolean;
  currentStructuralFingerprint: string;
  storedStructuralFingerprint: string;
  currentMetadataFingerprint: string;
  storedMetadataFingerprint?: string;
  unreviewedDependencyIds: string[];
  provisionalDependencyIds: string[];
  explanation: string;
  remediationAction: string;
}

/**
 * Evaluates whether an ExplainableDependencyGraph is fresh and trustworthy relative to the current Plan.
 *
 * Rules:
 * 1. Structural rebuild required: Plan topology, durations, or edge connections changed.
 * 2. Metadata refresh required: Reasons, provenance, confirmation status, or display titles changed.
 *    - Trust-critical metadata stale: confirmationStatus or origin diverged on dependency edges.
 *    - Display-only metadata stale: only task titles or explanatory reasons diverged.
 * 3. Fresh but structurally invalid: Fingerprints match, but graph contains cycles or broken references.
 * 4. Structurally valid but unresolved trust: Graph is valid, but contains unreviewed dependencies.
 * 5. Fully fresh and valid: Both structural and metadata fingerprints match, acyclic, and 0 unreviewed edges.
 */
export function checkGraphFreshness(
  graph: ExplainableDependencyGraph,
  currentPlan: Plan
): GraphFreshnessCheckResult {
  const currentStructural = computeStructuralFingerprint(currentPlan);
  const currentMetadata = computeExplanationMetadataFingerprint(currentPlan);

  const storedStructural = graph.graphInputFingerprint;
  const storedMetadata = graph.metadataFingerprint;

  const structuralMismatch = currentStructural !== storedStructural;
  const metadataMismatch = Boolean(storedMetadata) && currentMetadata !== storedMetadata;

  // Differentiate trust-critical metadata staleness from display-only metadata staleness
  const staleTrustDependencyIds: string[] = [];
  const graphEdgesById = new Map(graph.edges.map((e) => [e.id, e]));

  for (const dep of currentPlan.dependencies) {
    const graphEdge = graphEdgesById.get(dep.id);
    if (graphEdge) {
      const depOrigin = dep.origin ?? "system_template";
      const edgeOrigin = graphEdge.origin ?? "system_template";
      const depStatus = dep.confirmationStatus ?? "confirmed";
      const edgeStatus = graphEdge.confirmationStatus ?? "confirmed";

      if (depOrigin !== edgeOrigin || depStatus !== edgeStatus) {
        staleTrustDependencyIds.push(dep.id);
      }
    }
  }

  const isTrustMetadataStale = staleTrustDependencyIds.length > 0;
  const isDisplayMetadataOnlyStale = metadataMismatch && !isTrustMetadataStale;

  const unreviewedDependencyIds = graph.validationSummary.unreviewedDependencyIds ?? [];
  const provisionalDependencyIds = graph.validationSummary.provisionalDependencyIds ?? [];
  const hasStructuralErrors = !graph.validationSummary.isValid;
  const hasUnresolvedTrust = unreviewedDependencyIds.length > 0;

  let status: GraphFreshnessStatus;
  let explanation: string;
  let remediationAction: string;

  if (structuralMismatch) {
    status = "structural_rebuild_required";
    explanation =
      "Plan topology, task durations, or field mappings have changed. The graph is structurally stale.";
    remediationAction = "Rebuild and validate the graph from the current plan before running recovery.";
  } else if (metadataMismatch) {
    status = "metadata_refresh_required";
    if (isTrustMetadataStale) {
      explanation = `Dependency trust-critical confirmation status or origin changed on edge(s) [${staleTrustDependencyIds.join(", ")}].`;
      remediationAction = "Refresh graph trust metadata and re-evaluate before relying on dependency trust.";
    } else {
      explanation =
        "Display-only task titles or explanatory reasons have changed. Safe structural preview is permitted.";
      remediationAction = "Refresh graph metadata to reflect current display and explanation text.";
    }
  } else if (hasStructuralErrors) {
    status = "fresh_but_structurally_invalid";
    explanation =
      "Graph reflects current plan inputs, but contains structural errors (cycles, broken references, or invalid mappings).";
    remediationAction = "Correct the underlying plan dependencies to resolve graph errors.";
  } else if (hasUnresolvedTrust) {
    status = "structurally_valid_but_unresolved_trust";
    explanation = `Graph is structurally valid, but contains ${unreviewedDependencyIds.length} unreviewed dependency edge(s).`;
    remediationAction =
      "An operator must review unreviewed dependencies before recovery recommendations can be committed.";
  } else {
    status = "fully_fresh_and_valid";
    explanation = "Graph is current, structurally valid, and all dependency relationships have confirmed trust.";
    remediationAction = "Graph is ready for scheduling and recovery operations.";
  }

  const isFullyFreshAndValid = status === "fully_fresh_and_valid";

  return {
    status,
    isFullyFreshAndValid,
    needsStructuralRebuild: structuralMismatch,
    needsMetadataRefresh: metadataMismatch,
    isTrustMetadataStale,
    isDisplayMetadataOnlyStale,
    staleTrustDependencyIds,
    hasStructuralErrors,
    hasUnresolvedTrust,
    currentStructuralFingerprint: currentStructural,
    storedStructuralFingerprint: storedStructural,
    currentMetadataFingerprint: currentMetadata,
    storedMetadataFingerprint: storedMetadata,
    unreviewedDependencyIds,
    provisionalDependencyIds,
    explanation,
    remediationAction,
  };
}
