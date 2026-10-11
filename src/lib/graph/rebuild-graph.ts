import type { Plan } from "../schemas/plan.schema";
import type {
  ExplainableDependencyGraph,
  ExplainableDependency,
  GraphConsistencyState,
} from "../schemas/graph.schema";
import {
  computeStructuralFingerprint,
  computeExplanationMetadataFingerprint,
} from "../sync/fingerprint";
import { validateExplainableGraph, type GraphValidationResult } from "./validate-explainable";

export interface RebuildGraphOptions {
  graphId?: string;
  enforceValidation?: boolean;
}

export interface RebuildGraphOutput {
  graph: ExplainableDependencyGraph;
  validationResult: GraphValidationResult;
}

/**
 * Derives a versioned ExplainableDependencyGraph from the canonical Plan.
 *
 * Rules:
 * - Plan is the source of truth; Graph is a derived projection.
 * - Preserves all task attributes, dependency field mappings, reasons, and provenance.
 * - Never invents dependencies or promotes unreviewed/AI edges to confirmed.
 * - Computes and attaches both structural and metadata fingerprints.
 * - Derives graph consistency state based on acyclicity and reference validity.
 * - Deterministic: Equivalent plan inputs produce equivalent graph outputs.
 */
export function rebuildGraph(
  plan: Plan,
  options?: RebuildGraphOptions
): ExplainableDependencyGraph {
  const graphId = options?.graphId ?? `graph-${plan.id}-rev${plan.planRevision ?? 1}`;

  // 1. Project nodes from plan tasks
  const nodes = plan.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    durationHours: task.durationHours,
    policy: task.policy,
  }));

  // 2. Project explainable edges from declared dependencies
  const edges: ExplainableDependency[] = plan.dependencies.map((dep) => ({
    id: dep.id,
    fromTaskId: dep.fromTaskId,
    toTaskId: dep.toTaskId,
    blocksExecution: dep.blocksExecution,
    fieldMappings: dep.fieldMappings ? [...dep.fieldMappings] : [],
    reason: dep.reason ?? "Required predecessor execution dependency",
    origin: dep.origin ?? "system_template",
    confirmationStatus: dep.confirmationStatus ?? "confirmed",
    relevantSourceFields: dep.relevantSourceFields ? [...dep.relevantSourceFields] : undefined,
    relevantTargetFields: dep.relevantTargetFields ? [...dep.relevantTargetFields] : undefined,
    modificationHistory: dep.modificationHistory ? [...dep.modificationHistory] : [],
    removeEdgeIfSourceRemoved: dep.removeEdgeIfSourceRemoved ?? false,
  }));

  // 3. Validate structural acyclicity, task references, field mappings, and trust
  const validationResult = validateExplainableGraph({
    tasks: plan.tasks,
    dependencies: edges,
  });

  // 4. Derive consistency state
  let consistencyState: GraphConsistencyState = "current_valid";
  if (!validationResult.isValid) {
    if (validationResult.hasCycles) {
      consistencyState = "invalid_cyclic";
    } else if (validationResult.missingTaskReferences.length > 0) {
      consistencyState = "invalid_reference";
    } else {
      consistencyState = "invalid_reference";
    }
  }

  // 5. Compute structural and explanation-metadata fingerprints
  const structuralFingerprint = computeStructuralFingerprint(plan);
  const metadataFingerprint = computeExplanationMetadataFingerprint(plan);

  // 6. Compute provenance summary
  const provenanceSummary = {
    totalEdges: edges.length,
    manualEdges: edges.filter((e) => e.origin === "manual").length,
    systemEdges: edges.filter((e) => e.origin === "system_template").length,
    aiSuggestedEdges: edges.filter((e) => e.origin === "ai_suggested").length,
    confirmedEdges: edges.filter((e) => e.confirmationStatus === "confirmed").length,
    provisionalEdges: edges.filter((e) => e.confirmationStatus === "provisional").length,
    unreviewedEdges: edges.filter((e) => e.confirmationStatus === "unreviewed").length,
  };

  return {
    graphId,
    graphSourceRevision: plan.planRevision ?? 1,
    graphInputFingerprint: structuralFingerprint,
    metadataFingerprint,
    consistencyState,
    nodes,
    edges,
    criticalPaths: [], // Scheduling will be computed in Milestone S5
    validationSummary: {
      isValid: validationResult.isValid,
      hasCycles: validationResult.hasCycles,
      cycleNodes: validationResult.cycleNodes,
      blockedByCycleNodes: validationResult.blockedByCycleNodes,
      missingTaskReferences: validationResult.missingTaskReferences,
      invalidFieldMappings: validationResult.invalidFieldMappings,
      hasUnreviewedDependencies: validationResult.hasUnreviewedDependencies,
      unreviewedDependencyIds: validationResult.unreviewedDependencyIds,
      reviewedDependencyIds: validationResult.reviewedDependencyIds,
      provisionalDependencyIds: validationResult.provisionalDependencyIds,
      warnings: validationResult.warnings,
    },
    provenanceSummary,
  };
}
