import type { Plan, Task, GlobalConstraints } from "../schemas/plan.schema";
import type { ExplainableDependencyGraph } from "../schemas/graph.schema";
import type { Disruption } from "../schemas/scenario.schema";
import {
  CandidatePatchSchema,
  type CandidatePatch,
  type TaskOverride,
} from "../schemas/patch.schema";
import type {
  SyncState,
  PublicationStatus,
  ConflictRecord,
} from "../schemas/sync.schema";
import { guardRecovery } from "./guard-recovery";
import { schedulePlan } from "./schedule";
import { getDomainValidators } from "./validate-constraints";

export const DEFAULT_MAX_CANDIDATES = 10;
export const DEFAULT_MAX_EDITS_PER_PATCH = 5;

export interface TaskAlternativeDefinition {
  id: string;
  name?: string;
  title?: string;
  cost?: number;
  durationHours?: number;
  availability?: string;
  notes?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  unknownFacts?: string[];
  [key: string]: unknown;
}

export interface CandidateGenerationInput {
  baselinePlan: Plan;
  baselineGraph: ExplainableDependencyGraph;
  disruption: Disruption;
  canonicalPatches?: CandidatePatch[];
  constraintOverrides?: Partial<GlobalConstraints>;
  alternativesCatalog?: Record<string, TaskAlternativeDefinition | TaskOverride>;
  maxCandidates?: number;
  maxEditsPerPatch?: number;
  syncState?: SyncState;
  publicationStatus?: PublicationStatus;
  activeConflicts?: ConflictRecord[];
  isOffline?: boolean;
}

export interface CandidateGenerationResult {
  success: boolean;
  error?: string;
  blockingIssues: string[];
  warnings: string[];
  candidates: CandidatePatch[];
  unsupportedReason?: string;
}

/**
 * Extracts a normalized lookup map of all task alternatives defined in plan.demoAlternatives
 * or the explicitly passed alternativesCatalog.
 */
export function extractAlternativesCatalog(
  plan: Plan,
  explicitCatalog?: Record<string, TaskAlternativeDefinition | TaskOverride>
): Map<string, TaskAlternativeDefinition> {
  const catalog = new Map<string, TaskAlternativeDefinition>();

  if (plan.demoAlternatives && typeof plan.demoAlternatives === "object") {
    for (const [key, value] of Object.entries(plan.demoAlternatives)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (
            item &&
            typeof item === "object" &&
            "id" in item &&
            typeof (item as { id: unknown }).id === "string"
          ) {
            catalog.set(
              (item as { id: string }).id,
              item as TaskAlternativeDefinition
            );
          }
        }
      } else if (value && typeof value === "object") {
        if (
          "id" in value &&
          typeof (value as { id: unknown }).id === "string"
        ) {
          catalog.set(
            (value as { id: string }).id,
            value as TaskAlternativeDefinition
          );
        } else {
          catalog.set(key, { id: key, ...(value as Record<string, unknown>) });
        }
      }
    }
  }

  if (explicitCatalog) {
    for (const [id, def] of Object.entries(explicitCatalog)) {
      catalog.set(id, { id, ...(def as Record<string, unknown>) });
    }
  }

  return catalog;
}

/**
 * Propagates modified task outputs to downstream tasks along dependencies with fieldMappings.
 */
function propagateDownstreamFieldMappings(
  plan: Plan,
  fromTaskId: string,
  newOutputs: Record<string, unknown>,
  taskOverrides: Record<string, TaskOverride>,
  changedTaskIds: Set<string>
): void {
  for (const dep of plan.dependencies) {
    if (
      dep.fromTaskId === fromTaskId &&
      dep.fieldMappings &&
      dep.fieldMappings.length > 0
    ) {
      const targetTask = plan.tasks.find((t) => t.id === dep.toTaskId);
      if (!targetTask) continue;

      let targetInputsUpdated = false;
      const targetInputs: Record<string, unknown> = {
        ...targetTask.inputs,
        ...(taskOverrides[dep.toTaskId]?.inputs ?? {}),
      };

      for (const mapping of dep.fieldMappings) {
        if (mapping.sourceField in newOutputs) {
          targetInputs[mapping.targetInput] = newOutputs[mapping.sourceField];
          targetInputsUpdated = true;
        }
      }

      if (targetInputsUpdated) {
        changedTaskIds.add(dep.toTaskId);
        taskOverrides[dep.toTaskId] = {
          ...taskOverrides[dep.toTaskId],
          inputs: targetInputs,
        };
      }
    }
  }
}

/**
 * Builds a single task-replacement candidate patch using an alternative definition.
 */
function buildAlternativePatch(
  plan: Plan,
  targetTask: Task,
  alt: TaskAlternativeDefinition,
  candidateIdPrefix: string = "cand"
): CandidatePatch {
  const candidateId = `${candidateIdPrefix}-${targetTask.id}-${alt.id}`;
  const changedTaskIds = new Set<string>([targetTask.id]);
  const taskOverrides: Record<string, TaskOverride> = {};
  const unknownFacts: string[] = [];

  const newOutputs: Record<string, unknown> = { ...targetTask.outputs };
  for (const [k, v] of Object.entries(alt)) {
    if (
      ![
        "id",
        "name",
        "title",
        "cost",
        "durationHours",
        "notes",
        "unknownFacts",
        "inputs",
        "outputs",
        "availability",
      ].includes(k)
    ) {
      newOutputs[k] = v;
    }
  }

  if (alt.availability === "unknown") {
    unknownFacts.push(
      targetTask.outputs.venueId !== undefined
        ? "venue_availability"
        : `${targetTask.id.toLowerCase()}_availability`
    );
    if ("bookingStatus" in newOutputs || "status" in targetTask.outputs) {
      newOutputs["bookingStatus"] = "unknown";
    }
  }

  if (Array.isArray(alt.unknownFacts)) {
    unknownFacts.push(...alt.unknownFacts);
  }

  const override: TaskOverride = {
    status: "proposed",
  };
  if (alt.cost !== undefined) override.cost = alt.cost;
  if (alt.durationHours !== undefined) override.durationHours = alt.durationHours;
  if (Object.keys(newOutputs).length > 0) override.outputs = newOutputs;
  if (alt.inputs) override.inputs = { ...targetTask.inputs, ...alt.inputs };

  taskOverrides[targetTask.id] = override;

  propagateDownstreamFieldMappings(
    plan,
    targetTask.id,
    newOutputs,
    taskOverrides,
    changedTaskIds
  );

  return CandidatePatchSchema.parse({
    id: candidateId,
    label: alt.title || alt.name || `Use ${alt.id} for ${targetTask.title}`,
    changedTaskIds: Array.from(changedTaskIds).sort(),
    removedTaskIds: [],
    lostTaskIds: [],
    unknownFacts: Array.from(new Set(unknownFacts)).sort(),
    taskOverrides,
    reasoning:
      alt.notes ||
      `Replaced ${targetTask.title} (${targetTask.id}) with alternative ${alt.id}.`,
  });
}

/**
 * Deterministically generates recovery candidates for a typed disruption against a valid baseline.
 */
export function generateCandidates(
  input: CandidateGenerationInput
): CandidateGenerationResult {
  const {
    baselinePlan,
    baselineGraph,
    disruption,
    canonicalPatches,
    constraintOverrides,
    alternativesCatalog,
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    maxEditsPerPatch = DEFAULT_MAX_EDITS_PER_PATCH,
    syncState,
    publicationStatus,
    activeConflicts,
    isOffline,
  } = input;

  // 1. Guard recovery: Ensure baseline is fresh, valid, and not conflicted
  const guard = guardRecovery({
    plan: baselinePlan,
    graph: baselineGraph,
    syncState,
    publicationStatus,
    activeConflicts,
    isOffline,
  });

  if (!guard.canCalculate) {
    return {
      success: false,
      error: `Recovery guard blocked candidate generation: ${guard.blockingIssues.join("; ")}`,
      blockingIssues: guard.blockingIssues,
      warnings: guard.warnings,
      candidates: [],
      unsupportedReason:
        "Baseline plan or graph is stale, conflicted, or structurally invalid.",
    };
  }

  const warnings = [...guard.warnings];
  let domainUnverified = false;
  if (baselinePlan.domain) {
    const domainValidators = getDomainValidators(baselinePlan.domain);
    if (domainValidators.length === 0) {
      warnings.push(
        `No domain validator registered for domain "${baselinePlan.domain}". Candidates will require manual verification.`
      );
      domainUnverified = true;
    }
  }

  const catalog = extractAlternativesCatalog(baselinePlan, alternativesCatalog);
  const candidates: CandidatePatch[] = [];
  const candidateIdSet = new Set<string>();

  const mergedConstraintOverrides: Partial<GlobalConstraints> = {
    ...(constraintOverrides ?? {}),
  };
  if (
    (disruption.type === "budget_reduction" ||
      disruption.type === "budget_changed" ||
      disruption.field === "budgetLimit") &&
    typeof disruption.newValue === "number"
  ) {
    mergedConstraintOverrides.budgetLimit = disruption.newValue;
  }
  if (
    (disruption.type === "deadline_moved" ||
      disruption.type === "deadline_changed" ||
      disruption.type === "deadline_earlier" ||
      disruption.field === "deadlineHours") &&
    typeof disruption.newValue === "number"
  ) {
    mergedConstraintOverrides.deadlineHours = disruption.newValue;
  }

  // 2. Process canonical candidate patches if provided
  if (canonicalPatches && canonicalPatches.length > 0) {
    for (const rawPatch of canonicalPatches) {
      // Validate fixed task preservation: a canonical patch must never remove a fixed task
      const fixedRemoval = rawPatch.removedTaskIds.find((id) => {
        const task = baselinePlan.tasks.find((t) => t.id === id);
        return task?.policy === "fixed";
      });
      if (fixedRemoval) {
        warnings.push(
          `Skipped canonical patch "${rawPatch.id}": attempts to remove fixed task "${fixedRemoval}".`
        );
        continue;
      }

      // Merge global constraint overrides into patch if not already present
      const patchOverrides = {
        ...(mergedConstraintOverrides ?? {}),
        ...(rawPatch.constraintOverrides ?? {}),
      };

      const unknownFacts = [...rawPatch.unknownFacts];
      if (domainUnverified) {
        const domainFact = `unverified_domain_${baselinePlan.domain}`;
        if (!unknownFacts.includes(domainFact)) {
          unknownFacts.push(domainFact);
        }
      }

      const patch = CandidatePatchSchema.parse({
        ...rawPatch,
        unknownFacts: Array.from(new Set(unknownFacts)).sort(),
        constraintOverrides:
          Object.keys(patchOverrides).length > 0 ? patchOverrides : undefined,
      });

      if (!candidateIdSet.has(patch.id)) {
        candidates.push(patch);
        candidateIdSet.add(patch.id);
      }
    }
  }

  // 3. Synthesize candidate patches based on disruption type (when no canonical patches supplied)
  if (!canonicalPatches || canonicalPatches.length === 0) {
    const targetTask = disruption.targetTaskId
      ? baselinePlan.tasks.find((t) => t.id === disruption.targetTaskId)
      : undefined;

    switch (disruption.type) {
    case "task_unavailable":
    case "resource_unavailable": {
      if (!targetTask) {
        if (candidates.length === 0) {
          return {
            success: false,
            error: `Target task "${disruption.targetTaskId}" not found in baseline plan.`,
            blockingIssues: [
              `Target task "${disruption.targetTaskId}" not found in baseline plan`,
            ],
            warnings,
            candidates: [],
            unsupportedReason: `Task "${disruption.targetTaskId}" does not exist in baseline.`,
          };
        }
        break;
      }

      if (targetTask.policy === "fixed") {
        return {
          success: false,
          error: `Task "${targetTask.id}" (${targetTask.title}) has policy "fixed" and cannot be replaced or removed.`,
          blockingIssues: [
            `Task "${targetTask.id}" is a fixed project requirement and cannot be modified or removed`,
          ],
          warnings,
          candidates: [],
          unsupportedReason: `Task "${targetTask.id}" has fixed policy. No recovery candidate can modify or remove it.`,
        };
      }

      // If optional, consider task removal
      if (targetTask.policy === "optional") {
        const removePatch = CandidatePatchSchema.parse({
          id: `cand-remove-${targetTask.id}`,
          label: `Remove optional task ${targetTask.title}`,
          changedTaskIds: [],
          removedTaskIds: [targetTask.id],
          lostTaskIds: [targetTask.id],
          unknownFacts: domainUnverified
            ? [`unverified_domain_${baselinePlan.domain}`]
            : [],
          taskOverrides: {},
          constraintOverrides:
            Object.keys(mergedConstraintOverrides).length > 0
              ? mergedConstraintOverrides
              : undefined,
          reasoning: `Removed optional task ${targetTask.title} (${targetTask.id}) as permitted by policy "optional".`,
        });
        if (!candidateIdSet.has(removePatch.id)) {
          candidates.push(removePatch);
          candidateIdSet.add(removePatch.id);
        }
      }

      // Inspect declared alternatives
      const declaredAlternatives = targetTask.alternatives ?? [];
      let alternativeFound = false;

      for (const altId of declaredAlternatives) {
        const altDef = catalog.get(altId);
        if (!altDef) {
          // Flag nonexistent / unknown alternative specification
          const unknownPatch = CandidatePatchSchema.parse({
            id: `cand-alt-${targetTask.id}-${altId}`,
            label: `Propose unverified alternative ${altId}`,
            changedTaskIds: [targetTask.id],
            removedTaskIds: [],
            lostTaskIds: [],
            unknownFacts: [
              `unresolved_alternative_${altId}`,
              ...(domainUnverified
                ? [`unverified_domain_${baselinePlan.domain}`]
                : []),
            ],
            taskOverrides: {
              [targetTask.id]: {
                status: "proposed",
              },
            },
            constraintOverrides:
              Object.keys(mergedConstraintOverrides).length > 0
                ? mergedConstraintOverrides
                : undefined,
            reasoning: `Alternative ${altId} was declared on ${targetTask.title} (${targetTask.id}) but lacks verified catalog specification.`,
          });
          if (!candidateIdSet.has(unknownPatch.id)) {
            candidates.push(unknownPatch);
            candidateIdSet.add(unknownPatch.id);
            alternativeFound = true;
          }
          continue;
        }

        const altPatch = buildAlternativePatch(
          baselinePlan,
          targetTask,
          altDef,
          "cand-alt"
        );
        if (domainUnverified) {
          const domFact = `unverified_domain_${baselinePlan.domain}`;
          if (!altPatch.unknownFacts.includes(domFact)) {
            altPatch.unknownFacts.push(domFact);
            altPatch.unknownFacts.sort();
          }
        }
        if (Object.keys(mergedConstraintOverrides).length > 0) {
          altPatch.constraintOverrides = mergedConstraintOverrides;
        }

        if (!candidateIdSet.has(altPatch.id)) {
          candidates.push(altPatch);
          candidateIdSet.add(altPatch.id);
          alternativeFound = true;
        }
      }

      if (
        !alternativeFound &&
        targetTask.policy !== "optional" &&
        candidates.length === 0
      ) {
        return {
          success: true,
          error: undefined,
          blockingIssues: [
            `No alternatives declared for unavailable task "${targetTask.id}"`,
          ],
          warnings,
          candidates: [],
          unsupportedReason: `Task "${targetTask.id}" has no declared alternatives and policy "${targetTask.policy}" prohibits removal.`,
        };
      }
      break;
    }

    case "attribute_change":
    case "task_attribute_changed": {
      if (!targetTask) {
        if (candidates.length === 0) {
          return {
            success: false,
            error: `Target task "${disruption.targetTaskId}" not found for attribute change.`,
            blockingIssues: [
              `Target task "${disruption.targetTaskId}" not found in baseline plan`,
            ],
            warnings,
            candidates: [],
            unsupportedReason: `Task "${disruption.targetTaskId}" does not exist.`,
          };
        }
        break;
      }

      if (targetTask.policy === "fixed") {
        return {
          success: false,
          error: `Task "${targetTask.id}" (${targetTask.title}) has policy "fixed" and cannot be modified.`,
          blockingIssues: [
            `Task "${targetTask.id}" has fixed policy and cannot be altered`,
          ],
          warnings,
          candidates: [],
          unsupportedReason: `Task "${targetTask.id}" has fixed policy. Attribute change cannot be applied.`,
        };
      }

      const field = disruption.field;
      if (field) {
        const changedTaskIds = new Set<string>([targetTask.id]);
        const taskOverrides: Record<string, TaskOverride> = {};
        const override: TaskOverride = {};

        if (field === "cost" && typeof disruption.newValue === "number") {
          override.cost = disruption.newValue;
        } else if (
          field === "durationHours" &&
          typeof disruption.newValue === "number"
        ) {
          override.durationHours = disruption.newValue;
        } else if (field in targetTask.inputs) {
          override.inputs = {
            ...targetTask.inputs,
            [field]: disruption.newValue,
          };
        } else if (field in targetTask.outputs) {
          const newOutputs = {
            ...targetTask.outputs,
            [field]: disruption.newValue,
          };
          override.outputs = newOutputs;
          propagateDownstreamFieldMappings(
            baselinePlan,
            targetTask.id,
            newOutputs,
            taskOverrides,
            changedTaskIds
          );
        } else {
          // Generic input or output field
          override.inputs = {
            ...targetTask.inputs,
            [field]: disruption.newValue,
          };
        }

        taskOverrides[targetTask.id] = {
          ...taskOverrides[targetTask.id],
          ...override,
        };

        const attrPatch = CandidatePatchSchema.parse({
          id: `cand-attr-${targetTask.id}-${field}`,
          label: `Update ${field} on ${targetTask.title}`,
          changedTaskIds: Array.from(changedTaskIds).sort(),
          removedTaskIds: [],
          lostTaskIds: [],
          unknownFacts: domainUnverified
            ? [`unverified_domain_${baselinePlan.domain}`]
            : [],
          taskOverrides,
          constraintOverrides:
            Object.keys(mergedConstraintOverrides).length > 0
              ? mergedConstraintOverrides
              : undefined,
          reasoning: `Applied attribute change on ${targetTask.title} (${targetTask.id}): ${field} = ${JSON.stringify(disruption.newValue)}.`,
        });

        if (!candidateIdSet.has(attrPatch.id)) {
          candidates.push(attrPatch);
          candidateIdSet.add(attrPatch.id);
        }
      }

      // Also consider declared alternatives if available
      for (const altId of targetTask.alternatives ?? []) {
        const altDef = catalog.get(altId);
        if (altDef) {
          const altPatch = buildAlternativePatch(
            baselinePlan,
            targetTask,
            altDef,
            "cand-alt"
          );
          if (!candidateIdSet.has(altPatch.id)) {
            candidates.push(altPatch);
            candidateIdSet.add(altPatch.id);
          }
        }
      }
      break;
    }

    case "budget_reduction":
    case "budget_changed":
    case "budget_cut": {
      const newBudget =
        mergedConstraintOverrides.budgetLimit ??
        baselinePlan.constraints.budgetLimit;

      // Identify cheaper alternatives across all non-fixed tasks
      interface CostSavingOption {
        taskId: string;
        taskTitle: string;
        altDef?: TaskAlternativeDefinition;
        saving: number;
        isRemoval?: boolean;
      }

      const options: CostSavingOption[] = [];

      for (const t of baselinePlan.tasks) {
        if (t.policy === "fixed") continue;

        if (t.policy === "optional" && t.cost > 0) {
          options.push({
            taskId: t.id,
            taskTitle: t.title,
            saving: t.cost,
            isRemoval: true,
          });
        }

        for (const altId of t.alternatives ?? []) {
          const altDef = catalog.get(altId);
          if (
            altDef &&
            altDef.cost !== undefined &&
            altDef.cost < t.cost
          ) {
            options.push({
              taskId: t.id,
              taskTitle: t.title,
              altDef,
              saving: t.cost - altDef.cost,
            });
          }
        }
      }

      options.sort((a, b) => b.saving - a.saving);

      // Single option candidates
      for (const opt of options) {
        if (candidates.length >= maxCandidates) break;

        if (opt.isRemoval) {
          const remPatch = CandidatePatchSchema.parse({
            id: `cand-budget-remove-${opt.taskId}`,
            label: `Remove optional task ${opt.taskTitle}`,
            changedTaskIds: [],
            removedTaskIds: [opt.taskId],
            lostTaskIds: [opt.taskId],
            unknownFacts: domainUnverified
              ? [`unverified_domain_${baselinePlan.domain}`]
              : [],
            taskOverrides: {},
            constraintOverrides:
              Object.keys(mergedConstraintOverrides).length > 0
                ? mergedConstraintOverrides
                : undefined,
            reasoning: `Removed optional task ${opt.taskTitle} (${opt.taskId}) saving ${opt.saving} to address budget constraints.`,
          });
          if (!candidateIdSet.has(remPatch.id)) {
            candidates.push(remPatch);
            candidateIdSet.add(remPatch.id);
          }
        } else if (opt.altDef) {
          const task = baselinePlan.tasks.find((t) => t.id === opt.taskId)!;
          const altPatch = buildAlternativePatch(
            baselinePlan,
            task,
            opt.altDef,
            "cand-budget"
          );
          if (Object.keys(mergedConstraintOverrides).length > 0) {
            altPatch.constraintOverrides = mergedConstraintOverrides;
          }
          if (!candidateIdSet.has(altPatch.id)) {
            candidates.push(altPatch);
            candidateIdSet.add(altPatch.id);
          }
        }
      }

      // Multi-task combinations if budget deficit exists
      const currentCost = baselinePlan.tasks.reduce((sum, t) => sum + t.cost, 0);
      if (newBudget !== undefined && currentCost > newBudget && options.length > 1) {
        // Build a lean combination of non-overlapping task savings
        const comboTaskIds = new Set<string>();
        const comboChangedTaskIds = new Set<string>();
        const comboRemovedTaskIds: string[] = [];
        const comboTaskOverrides: Record<string, TaskOverride> = {};
        const comboUnknownFacts: string[] = domainUnverified
          ? [`unverified_domain_${baselinePlan.domain}`]
          : [];
        let combinedSavings = 0;

        for (const opt of options) {
          if (comboTaskIds.has(opt.taskId)) continue;
          if (comboTaskIds.size >= maxEditsPerPatch) break;

          comboTaskIds.add(opt.taskId);
          combinedSavings += opt.saving;

          if (opt.isRemoval) {
            comboRemovedTaskIds.push(opt.taskId);
          } else if (opt.altDef) {
            const task = baselinePlan.tasks.find((t) => t.id === opt.taskId)!;
            const singlePatch = buildAlternativePatch(
              baselinePlan,
              task,
              opt.altDef,
              "temp"
            );
            for (const chId of singlePatch.changedTaskIds) {
              comboChangedTaskIds.add(chId);
            }
            for (const [tId, ov] of Object.entries(singlePatch.taskOverrides)) {
              comboTaskOverrides[tId] = {
                ...(comboTaskOverrides[tId] ?? {}),
                ...ov,
              };
            }
            for (const uf of singlePatch.unknownFacts) {
              if (!comboUnknownFacts.includes(uf)) {
                comboUnknownFacts.push(uf);
              }
            }
          }
        }

        if (comboTaskIds.size > 1 && candidates.length < maxCandidates) {
          const comboPatch = CandidatePatchSchema.parse({
            id: `cand-budget-combo-lean`,
            label: `Lean package — multi-task budget reduction`,
            changedTaskIds: Array.from(comboChangedTaskIds).sort(),
            removedTaskIds: comboRemovedTaskIds.sort(),
            lostTaskIds: comboRemovedTaskIds.sort(),
            unknownFacts: comboUnknownFacts.sort(),
            taskOverrides: comboTaskOverrides,
            constraintOverrides:
              Object.keys(mergedConstraintOverrides).length > 0
                ? mergedConstraintOverrides
                : undefined,
            reasoning: `Combined ${comboTaskIds.size} savings options to reduce cost by ${combinedSavings}.`,
          });
          if (!candidateIdSet.has(comboPatch.id)) {
            candidates.push(comboPatch);
            candidateIdSet.add(comboPatch.id);
          }
        }
      }
      break;
    }

    case "deadline_moved":
    case "deadline_changed":
    case "deadline_earlier": {
      const sched = schedulePlan(baselinePlan);
      const criticalTaskIds = new Set(
        baselinePlan.tasks
          .filter((t) => sched.tasks[t.id]?.criticalPathFloat === 0)
          .map((t) => t.id)
      );

      interface TimeSavingOption {
        taskId: string;
        taskTitle: string;
        altDef: TaskAlternativeDefinition;
        timeSaved: number;
        isCritical: boolean;
      }

      const timeOptions: TimeSavingOption[] = [];

      for (const t of baselinePlan.tasks) {
        if (t.policy === "fixed") continue;

        for (const altId of t.alternatives ?? []) {
          const altDef = catalog.get(altId);
          if (
            altDef &&
            altDef.durationHours !== undefined &&
            altDef.durationHours < t.durationHours
          ) {
            timeOptions.push({
              taskId: t.id,
              taskTitle: t.title,
              altDef,
              timeSaved: t.durationHours - altDef.durationHours,
              isCritical: criticalTaskIds.has(t.id),
            });
          }
        }
      }

      // Prioritize critical path tasks first, then largest time saved
      timeOptions.sort((a, b) => {
        if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
        return b.timeSaved - a.timeSaved;
      });

      for (const opt of timeOptions) {
        if (candidates.length >= maxCandidates) break;

        const task = baselinePlan.tasks.find((t) => t.id === opt.taskId)!;
        const altPatch = buildAlternativePatch(
          baselinePlan,
          task,
          opt.altDef,
          "cand-deadline"
        );
        if (Object.keys(mergedConstraintOverrides).length > 0) {
          altPatch.constraintOverrides = mergedConstraintOverrides;
        }
        if (!candidateIdSet.has(altPatch.id)) {
          candidates.push(altPatch);
          candidateIdSet.add(altPatch.id);
        }
      }

      // Combine critical time saving options if multiple exist
      const criticalTimeOptions = timeOptions.filter((o) => o.isCritical);
      if (criticalTimeOptions.length > 1 && candidates.length < maxCandidates) {
        const comboTaskIds = new Set<string>();
        const comboChangedTaskIds = new Set<string>();
        const comboTaskOverrides: Record<string, TaskOverride> = {};
        const comboUnknownFacts: string[] = domainUnverified
          ? [`unverified_domain_${baselinePlan.domain}`]
          : [];
        let totalTimeSaved = 0;

        for (const opt of criticalTimeOptions) {
          if (comboTaskIds.has(opt.taskId)) continue;
          if (comboTaskIds.size >= maxEditsPerPatch) break;

          comboTaskIds.add(opt.taskId);
          totalTimeSaved += opt.timeSaved;

          const task = baselinePlan.tasks.find((t) => t.id === opt.taskId)!;
          const singlePatch = buildAlternativePatch(
            baselinePlan,
            task,
            opt.altDef,
            "temp"
          );
          for (const chId of singlePatch.changedTaskIds) {
            comboChangedTaskIds.add(chId);
          }
          for (const [tId, ov] of Object.entries(singlePatch.taskOverrides)) {
            comboTaskOverrides[tId] = {
              ...(comboTaskOverrides[tId] ?? {}),
              ...ov,
            };
          }
          for (const uf of singlePatch.unknownFacts) {
            if (!comboUnknownFacts.includes(uf)) {
              comboUnknownFacts.push(uf);
            }
          }
        }

        if (comboTaskIds.size > 1) {
          const comboPatch = CandidatePatchSchema.parse({
            id: `cand-deadline-combo-fast-track`,
            label: `Fast-track package — multi-task critical acceleration`,
            changedTaskIds: Array.from(comboChangedTaskIds).sort(),
            removedTaskIds: [],
            lostTaskIds: [],
            unknownFacts: comboUnknownFacts.sort(),
            taskOverrides: comboTaskOverrides,
            constraintOverrides:
              Object.keys(mergedConstraintOverrides).length > 0
                ? mergedConstraintOverrides
                : undefined,
            reasoning: `Accelerated ${comboTaskIds.size} critical tasks, reducing critical path duration by ${totalTimeSaved} hours.`,
          });
          if (!candidateIdSet.has(comboPatch.id)) {
            candidates.push(comboPatch);
            candidateIdSet.add(comboPatch.id);
          }
        }
      }
      break;
    }

    default: {
      // Disruption type not specifically handled; if canonical patches were supplied, they are already included.
      if (candidates.length === 0) {
        return {
          success: true,
          error: undefined,
          blockingIssues: [
            `No candidate generator strategies applicable for disruption type "${disruption.type}"`,
          ],
          warnings,
          candidates: [],
          unsupportedReason: `Disruption type "${disruption.type}" has no declared recovery strategies or alternatives.`,
        };
      }
      break;
    }
  }
  }

  // 4. Stable deterministic sort by ID and bounded candidate count
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  const finalCandidates = candidates.slice(0, maxCandidates);

  return {
    success: true,
    blockingIssues: [],
    warnings,
    candidates: finalCandidates,
  };
}
