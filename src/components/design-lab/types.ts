export type ConceptId = "simplified" | "concept-a" | "concept-b" | "concept-c";

export interface ConceptMetadata {
  id: ConceptId;
  name: string;
  tagline: string;
  badge: string;
  accentColor: string;
  description: string;
  primaryPersona: string;
  coreStrength: string;
}

export interface DAGTaskNode {
  id: string;
  title: string;
  cost: number;
  durationHours: number;
  earliestStart: number;
  earliestFinish: number;
  policy: "fixed" | "flexible" | "optional";
  isCritical: boolean;
  predecessors: string[];
  successors: string[];
  status: "completed" | "active" | "planned" | "disrupted" | "patched";
  category: "operations" | "logistics" | "content" | "marketing";
}

export interface ScenarioImpactData {
  id: string;
  name: string;
  triggerHeadline: string;
  summary: string;
  disruptedTaskId: string;
  baseline: {
    totalCost: number;
    budgetLimit: number;
    finishHours: number;
    deadlineHours: number;
    slackHours: number;
    hardConstraintPass: boolean;
  };
  recoveryCandidates: {
    id: string;
    name: string;
    profile: "balanced" | "cost_first" | "quality_first";
    profileLabel: string;
    isWinner: boolean;
    projectedCost: number;
    costDelta: number;
    finishHours: number;
    finishDelta: number;
    slackHours: number;
    score: number;
    tradeoffSummary: string;
    appliedChanges: {
      taskId: string;
      action: "relocate" | "reschedule" | "descope" | "speedup";
      note: string;
    }[];
  }[];
}

export interface ComparisonCriterion {
  id: string;
  label: string;
  weight: "High" | "Medium" | "Critical";
  conceptAScore: number; // 1-5
  conceptAComment: string;
  conceptBScore: number; // 1-5
  conceptBComment: string;
  conceptCScore: number; // 1-5
  conceptCComment: string;
}
