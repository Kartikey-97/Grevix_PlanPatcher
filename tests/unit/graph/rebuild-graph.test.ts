import { describe, it, expect } from "vitest";
import { rebuildGraph } from "../../../src/lib/graph/rebuild-graph";
import { canonicalPlan } from "../../../src/data/load-demo-fixtures";
import type { Plan } from "../../../src/lib/schemas/plan.schema";

describe("Milestone S2: Graph Derivation (rebuildGraph)", () => {
  it("derives explainable graph from canonical baseline plan deterministically", () => {
    const graph1 = rebuildGraph(canonicalPlan);
    const graph2 = rebuildGraph(canonicalPlan);

    expect(graph1.nodes).toHaveLength(16);
    expect(graph1.edges).toHaveLength(27);
    expect(graph1.consistencyState).toBe("current_valid");
    expect(graph1.graphSourceRevision).toBe(1);
    expect(graph1.validationSummary.isValid).toBe(true);
    expect(graph1.validationSummary.hasCycles).toBe(false);

    // Deterministic equivalence
    expect(graph1.graphInputFingerprint).toBe(graph2.graphInputFingerprint);
    expect(graph1.metadataFingerprint).toBe(graph2.metadataFingerprint);
    expect(JSON.stringify(graph1)).toBe(JSON.stringify(graph2));
  });

  it("preserves task attributes and explainable edge provenance", () => {
    const graph = rebuildGraph(canonicalPlan);

    // Verify first node
    const firstNode = graph.nodes.find((n) => n.id === "T01");
    expect(firstNode).toBeDefined();
    expect(firstNode?.title).toBe("Define event goals");
    expect(firstNode?.durationHours).toBe(2);
    expect(firstNode?.policy).toBe("fixed");

    // Verify first edge
    const firstEdge = graph.edges.find((e) => e.id === "D01");
    expect(firstEdge).toBeDefined();
    expect(firstEdge?.fromTaskId).toBe("T01");
    expect(firstEdge?.toTaskId).toBe("T02");
    expect(firstEdge?.blocksExecution).toBe(true);
    expect(firstEdge?.reason).toBe("The event date is confirmed after its goal is defined.");
    expect(firstEdge?.origin).toBe("system_template");
    expect(firstEdge?.confirmationStatus).toBe("confirmed");
  });

  it("never silently promotes AI-suggested edges to confirmed", () => {
    const planWithAi: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    planWithAi.dependencies.push({
      id: "D-ai-new",
      fromTaskId: "T09",
      toTaskId: "T11",
      blocksExecution: true,
      fieldMappings: [],
      reason: "AI proposed cross-functional synchronization",
      origin: "ai_suggested",
      confirmationStatus: "unreviewed",
      modificationHistory: [],
    });

    const graph = rebuildGraph(planWithAi);
    const aiEdge = graph.edges.find((e) => e.id === "D-ai-new");
    expect(aiEdge).toBeDefined();
    expect(aiEdge?.origin).toBe("ai_suggested");
    expect(aiEdge?.confirmationStatus).toBe("unreviewed"); // Stays unreviewed!

    // Verify summary captures the unreviewed edge
    expect(graph.provenanceSummary.aiSuggestedEdges).toBe(1);
    expect(graph.provenanceSummary.unreviewedEdges).toBe(1);
    expect(graph.validationSummary.hasUnreviewedDependencies).toBe(true);
  });

  it("assigns invalid_cyclic consistency state when cyclic dependencies are present", () => {
    const cyclicPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    cyclicPlan.dependencies.push({
      id: "D-cycle",
      fromTaskId: "T15",
      toTaskId: "T01",
      blocksExecution: true,
      fieldMappings: [],
      reason: "Cycle edge",
      origin: "manual",
      confirmationStatus: "confirmed",
      modificationHistory: [],
    });

    const graph = rebuildGraph(cyclicPlan);
    expect(graph.consistencyState).toBe("invalid_cyclic");
    expect(graph.validationSummary.isValid).toBe(false);
    expect(graph.validationSummary.hasCycles).toBe(true);
  });

  it("assigns invalid_reference consistency state when endpoints are missing", () => {
    const brokenPlan: Plan = JSON.parse(JSON.stringify(canonicalPlan));
    brokenPlan.dependencies.push({
      id: "D-missing",
      fromTaskId: "T01",
      toTaskId: "T_GHOST",
      blocksExecution: true,
      fieldMappings: [],
      reason: "Missing endpoint",
      origin: "manual",
      confirmationStatus: "confirmed",
      modificationHistory: [],
    });

    const graph = rebuildGraph(brokenPlan);
    expect(graph.consistencyState).toBe("invalid_reference");
    expect(graph.validationSummary.isValid).toBe(false);
    expect(graph.validationSummary.missingTaskReferences).toContain("T_GHOST");
  });
});
