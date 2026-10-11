import type { Plan } from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import {
  computeStructuralFingerprint,
  computeExplanationMetadataFingerprint,
} from "../sync/fingerprint";
import {
  checkGraphFreshness,
  type GraphFreshnessCheckResult,
} from "./check-freshness";

export interface RefreshMetadataResult {
  success: boolean;
  graph: ExplainableDependencyGraph;
  freshness: GraphFreshnessCheckResult;
  error?: string;
}

/**
 * Refreshes an ExplainableDependencyGraph's display and explanation metadata from the current Plan.
 *
 * Rules:
 * - Structural inputs MUST match (`graphInputFingerprint === computeStructuralFingerprint(currentPlan)`).
 *   If structural divergence has occurred, metadata refresh is refused and a full rebuild is required.
 * - Trust-critical metadata (dependency confirmationStatus or origin) MUST NOT be stale.
 *   If trust metadata has diverged, metadata refresh is refused to prevent silently relying on outdated trust.
 * - Updates node titles to match plan task titles.
 * - Updates edge reasons to match plan dependency reasons.
 * - Updates graphSourceRevision to currentPlan.planRevision.
 * - Recomputes and sets graph.metadataFingerprint = computeExplanationMetadataFingerprint(currentPlan).
 * - Revalidates freshness; never marks an unrefreshed or invalid graph as fully fresh.
 */
export function refreshGraphMetadata(
  graph: ExplainableDependencyGraph,
  currentPlan: Plan
): RefreshMetadataResult {
  const currentStructural = computeStructuralFingerprint(currentPlan);
  if (graph.graphInputFingerprint !== currentStructural) {
    return {
      success: false,
      graph,
      freshness: checkGraphFreshness(graph, currentPlan),
      error:
        "Cannot refresh metadata on structurally stale graph: plan topology, durations, or field mappings have diverged. A full graph rebuild is required.",
    };
  }

  const initialFreshness = checkGraphFreshness(graph, currentPlan);
  if (initialFreshness.isTrustMetadataStale) {
    return {
      success: false,
      graph,
      freshness: initialFreshness,
      error: `Cannot perform display metadata refresh: trust-critical metadata (dependency confirmationStatus or origin) is stale on edge(s) [${initialFreshness.staleTrustDependencyIds.join(
        ", "
      )}]. Explicit operator review or graph rebuild is required before relying on dependency trust.`,
    };
  }

  if (initialFreshness.hasStructuralErrors) {
    return {
      success: false,
      graph,
      freshness: initialFreshness,
      error:
        "Graph contains structural errors (cycles or broken task references). Metadata refresh cannot produce a valid graph.",
    };
  }

  const tasksById = new Map(currentPlan.tasks.map((t) => [t.id, t]));
  const depsById = new Map(currentPlan.dependencies.map((d) => [d.id, d]));

  // Verify all graph nodes still correspond to plan tasks
  for (const node of graph.nodes) {
    if (!tasksById.has(node.id)) {
      return {
        success: false,
        graph,
        freshness: initialFreshness,
        error: `Graph node '${node.id}' does not exist in current plan tasks.`,
      };
    }
  }

  // Verify all graph edges still correspond to plan dependencies
  for (const edge of graph.edges) {
    if (!depsById.has(edge.id)) {
      return {
        success: false,
        graph,
        freshness: initialFreshness,
        error: `Graph edge '${edge.id}' does not exist in current plan dependencies.`,
      };
    }
  }

  // Update display metadata
  const updatedNodes = graph.nodes.map((node) => {
    const task = tasksById.get(node.id)!;
    return {
      ...node,
      title: task.title,
    };
  });

  const updatedEdges = graph.edges.map((edge) => {
    const dep = depsById.get(edge.id)!;
    return {
      ...edge,
      reason: dep.reason ?? "Required predecessor execution dependency",
    };
  });

  const newMetadataFingerprint = computeExplanationMetadataFingerprint(currentPlan);

  const refreshedGraph: ExplainableDependencyGraph = {
    ...graph,
    graphSourceRevision: currentPlan.planRevision ?? graph.graphSourceRevision,
    metadataFingerprint: newMetadataFingerprint,
    nodes: updatedNodes,
    edges: updatedEdges,
  };

  const finalFreshness = checkGraphFreshness(refreshedGraph, currentPlan);

  return {
    success: true,
    graph: refreshedGraph,
    freshness: finalFreshness,
  };
}
