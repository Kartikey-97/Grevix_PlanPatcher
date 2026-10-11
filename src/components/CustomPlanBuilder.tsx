"use client";

import React, { useState, useId } from "react";
import type { Plan, Task, Dependency, TaskPolicy } from "../lib/schemas/plan.schema";
import {
  type DraftPlan,
  type DraftTask,
  type DraftTaskAlternative,
  type FieldProvenance,
  convertDraftToPlan,
} from "../lib/schemas/draft-plan.schema";
import type { GeminiErrorCategory } from "../lib/ai/gemini-client";
import { generateSmartFallbackDraftPlan } from "../lib/ai/draft-plan-interpreter";
import {
  validateCustomPlan,
  createDefaultCustomPlan,
  createEmptyCustomPlan,
  exportPlanToJson,
  importPlanFromJson,
  type CustomPlanValidationResult,
} from "../lib/engine/custom-plan";
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Download,
  Upload,
  Clock,
  Coins,
  Layers,
  Info,
  GitBranch,
  ShieldAlert,
  ShieldCheck,
  Edit3,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import "../lib/engine/event-planning-validator";
import { useTheme } from "../lib/theme-context";

interface CustomPlanBuilderProps {
  onLoadPlanToWorkspace: (plan: Plan) => void;
  onCancel: () => void;
  initialMode?: "prompt" | "review_draft" | "manual";
}

export function CustomPlanBuilder({
  onLoadPlanToWorkspace,
  onCancel,
  initialMode = "prompt",
}: CustomPlanBuilderProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  // Mode state: guided prompt vs draft review vs full manual editor
  const [mode, setMode] = useState<"prompt" | "review_draft" | "manual">(initialMode);

  // Prompt-first inputs
  const [prompt, setPrompt] = useState("");
  const [promptBudget, setPromptBudget] = useState("");
  const [promptDeadline, setPromptDeadline] = useState("");

  // AI draft state & error handling
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftErrorDetails, setDraftErrorDetails] = useState<{
    category: GeminiErrorCategory;
    userFriendlyMessage: string;
    canRetry: boolean;
  } | null>(null);

  // Active draft object
  const [draftPlan, setDraftPlan] = useState<DraftPlan | null>(null);
  const [isDomainVerified, setIsDomainVerified] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [showMissingValuesModal, setShowMissingValuesModal] = useState(false);

  // Underlying full Plan for validation / manual editing
  const [plan, setPlan] = useState<Plan>(createDefaultCustomPlan());
  const [validationResult, setValidationResult] =
    useState<CustomPlanValidationResult | null>(null);

  // JSON import/export state
  const [importJsonText, setImportJsonText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedExport, setCopiedExport] = useState(false);

  // Canonical sample prompt chips
  const samplePrompts = [
    {
      label: "Full-Stack Web App",
      text: "I want to build and deploy a full-stack web application in 7 days with a backend API, database, frontend, testing, and deployment. My budget is ₹50,000. Testing must finish before deployment.",
      budget: "50000",
      deadline: "168",
    },
    {
      label: "Learn How to Cook",
      text: "I want to learn how to cook from scratch with knife skills, heat control, stocks, essential sauces, and cooking a complete dinner meal.",
      budget: "10000",
      deadline: "60",
    },
    {
      label: "Campus Hackathon",
      text: "Organize a 2-day technical hackathon for 200 students with venue booking, sponsor outreach, catering, registrations, and judging.",
      budget: "75000",
      deadline: "120",
    },
    {
      label: "Cloud Data Pipeline",
      text: "Migrate our analytics data pipeline to the cloud with schema design, ETL scripts, validation tests, and production switchover.",
      budget: "30000",
      deadline: "80",
    },
    {
      label: "Vacation / Travel Trip",
      text: "Plan a 5-day vacation trip with destination selection, flights, hotel booking, daily activities, and packing with ₹40,000 budget.",
      budget: "40000",
      deadline: "120",
    },
  ];

  // 1. Submit prompt to /api/draft-plan
  const handleGenerateDraft = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setDraftError(null);
    setDraftErrorDetails(null);

    const budgetNum = promptBudget.trim() ? parseFloat(promptBudget) : null;
    const deadlineNum = promptDeadline.trim() ? parseFloat(promptDeadline) : null;

    try {
      const response = await fetch("/api/draft-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          budgetLimit: budgetNum !== null && !isNaN(budgetNum) ? budgetNum : null,
          deadlineHours: deadlineNum !== null && !isNaN(deadlineNum) ? deadlineNum : null,
          currency: "INR",
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        setDraftError(data.error || "Failed to generate plan draft.");
        setDraftErrorDetails({
          category: data.category || "UPSTREAM_FAILURE",
          userFriendlyMessage:
            data.userFriendlyMessage ||
            "Unable to generate plan draft. Please retry or start with a template.",
          canRetry: data.canRetry ?? true,
        });
        return;
      }

      if (data.status === "success" && data.draft) {
        setDraftPlan(data.draft);
        setIsDomainVerified(data.isDomainVerified ?? false);
        try {
          const converted = convertDraftToPlan(data.draft);
          setPlan(converted);
          setValidationResult(validateCustomPlan(converted));
        } catch (err: unknown) {
          setValidationResult({
            isValid: false,
            schemaErrors: [err instanceof Error ? err.message : "Draft has unresolved required fields."],
            graphErrors: [],
            warnings: [],
            isDomainVerified: false,
            domainName: data.draft.domain || "generic",
          });
        }
        setMode("review_draft");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error during draft generation.";
      setDraftError(msg);
      setDraftErrorDetails({
        category: "NETWORK_OR_TIMEOUT",
        userFriendlyMessage:
          "Network request timed out or was interrupted. Check your server connection and retry.",
        canRetry: true,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Fallbacks: Load starter templates
  const handleLoadTemplate = () => {
    const templatePlan = createDefaultCustomPlan();
    setPlan(templatePlan);
    setValidationResult(validateCustomPlan(templatePlan));
    setDraftPlan(null);
    setMode("manual");
  };

  const handleLoadBlank = () => {
    const emptyPlan = createEmptyCustomPlan();
    setPlan(emptyPlan);
    setValidationResult(validateCustomPlan(emptyPlan));
    setDraftPlan(null);
    setMode("manual");
  };

  // 3. Draft Review: task manipulation
  const handleUpdateDraftTask = (index: number, updates: Partial<DraftTask>) => {
    if (!draftPlan) return;
    const updatedTasks = [...draftPlan.tasks];
    updatedTasks[index] = { ...updatedTasks[index], ...updates };
    const updatedDraft: DraftPlan = { ...draftPlan, tasks: updatedTasks };
    setDraftPlan(updatedDraft);

    // Re-sync with canonical plan and validation
    try {
      const converted = convertDraftToPlan(updatedDraft);
      setPlan(converted);
      setValidationResult(validateCustomPlan(converted));
    } catch (err: unknown) {
      setValidationResult({
        isValid: false,
        schemaErrors: [err instanceof Error ? err.message : "Draft has unresolved required fields."],
        graphErrors: [],
        warnings: [],
        isDomainVerified: false,
        domainName: updatedDraft.domain || "generic",
      });
    }
  };

  const handleToggleAlternativeStatus = (taskIndex: number, altIndex: number) => {
    if (!draftPlan) return;
    const task = draftPlan.tasks[taskIndex];
    if (!task || !task.alternatives) return;
    const currentAlts = [...task.alternatives];
    const targetAlt = currentAlts[altIndex];
    if (!targetAlt) return;
    const newStatus = targetAlt.status === "confirmed" ? "suggested" : "confirmed";
    currentAlts[altIndex] = { ...targetAlt, status: newStatus };
    handleUpdateDraftTask(taskIndex, { alternatives: currentAlts });
  };

  const handleAddAlternative = (taskIndex: number) => {
    if (!draftPlan) return;
    const task = draftPlan.tasks[taskIndex];
    if (!task) return;
    const currentAlts = task.alternatives ? [...task.alternatives] : [];
    const altNum = currentAlts.length + 1;
    const newAlt: DraftTaskAlternative = {
      id: `alt-${task.id.toLowerCase()}-${altNum}`,
      title: `Alternative for ${task.title}`,
      cost: task.cost !== null && task.cost !== undefined ? Math.round(task.cost * 0.8) : 1000,
      costProvenance: "user_provided",
      durationHours: task.durationHours !== null && task.durationHours !== undefined ? Math.round(task.durationHours * 0.8) : 8,
      durationProvenance: "user_provided",
      unknownFacts: [],
      notes: "User-defined recovery alternative",
      status: "confirmed",
    };
    handleUpdateDraftTask(taskIndex, { alternatives: [...currentAlts, newAlt] });
  };

  const handleRemoveAlternative = (taskIndex: number, altIndex: number) => {
    if (!draftPlan) return;
    const task = draftPlan.tasks[taskIndex];
    if (!task || !task.alternatives) return;
    const updatedAlts = task.alternatives.filter((_, idx) => idx !== altIndex);
    handleUpdateDraftTask(taskIndex, { alternatives: updatedAlts });
  };

  const handleRemoveDraftTask = (taskId: string) => {
    if (!draftPlan) return;
    const remainingTasks = draftPlan.tasks
      .filter((t) => t.id !== taskId)
      .map((t) => ({
        ...t,
        predecessorIds: t.predecessorIds.filter((p) => p !== taskId),
      }));
    const updatedDraft: DraftPlan = { ...draftPlan, tasks: remainingTasks };
    setDraftPlan(updatedDraft);

    try {
      const converted = convertDraftToPlan(updatedDraft);
      setPlan(converted);
      setValidationResult(validateCustomPlan(converted));
    } catch (err: unknown) {
      setValidationResult({
        isValid: false,
        schemaErrors: [err instanceof Error ? err.message : "Draft has unresolved required fields."],
        graphErrors: [],
        warnings: [],
        isDomainVerified: false,
        domainName: updatedDraft.domain || "generic",
      });
    }
  };

  const handleAddDraftTask = () => {
    if (!draftPlan) return;
    const nextNum = draftPlan.tasks.length + 1;
    const newId = `T${nextNum < 10 ? `0${nextNum}` : nextNum}`;
    const newTask: DraftTask = {
      id: newId,
      title: `New Task ${nextNum}`,
      cost: null,
      costProvenance: "missing",
      durationHours: null,
      durationProvenance: "missing",
      priority: 3,
      priorityProvenance: "user_provided",
      policy: "flexible",
      policyProvenance: "user_provided",
      predecessorIds: draftPlan.tasks.length > 0 ? [draftPlan.tasks[draftPlan.tasks.length - 1].id] : [],
      dependenciesProvenance: "user_provided",
    };

    const updatedDraft: DraftPlan = {
      ...draftPlan,
      tasks: [...draftPlan.tasks, newTask],
    };
    setDraftPlan(updatedDraft);
    try {
      const converted = convertDraftToPlan(updatedDraft);
      setPlan(converted);
      setValidationResult(validateCustomPlan(converted));
    } catch (err: unknown) {
      setValidationResult({
        isValid: false,
        schemaErrors: [err instanceof Error ? err.message : "Draft has unresolved required fields."],
        graphErrors: [],
        warnings: [],
        isDomainVerified: false,
        domainName: updatedDraft.domain || "generic",
      });
    }
  };

  // 4. Predecessor toggle in draft review
  const handleToggleDraftPredecessor = (taskId: string, predId: string) => {
    if (!draftPlan) return;
    const taskIndex = draftPlan.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex < 0) return;

    const task = draftPlan.tasks[taskIndex];
    const exists = task.predecessorIds.includes(predId);
    const newPreds = exists
      ? task.predecessorIds.filter((p) => p !== predId)
      : [...task.predecessorIds, predId];

    handleUpdateDraftTask(taskIndex, {
      predecessorIds: newPreds,
      dependenciesProvenance: "user_provided",
    });
  };

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const expandAllTasks = () => {
    if (!draftPlan) return;
    setExpandedTaskIds(new Set(draftPlan.tasks.map((t) => t.id)));
  };

  const collapseAllTasks = () => {
    setExpandedTaskIds(new Set());
  };

  // 5. Final Confirmation & Workspace Loading
  const handleConfirmDraftAndOpen = (skipMissingCheck = false) => {
    if (!draftPlan) return;

    const missingCostTasks = draftPlan.tasks
      .filter((t) => t.cost === null || t.cost === undefined || isNaN(t.cost))
      .map((t) => t.id);
    const missingDurationTasks = draftPlan.tasks
      .filter((t) => t.durationHours === null || t.durationHours === undefined || isNaN(t.durationHours))
      .map((t) => t.id);

    // Tasks with missing cost or duration cannot be opened into workspace; required schema fields must be resolved
    if (missingCostTasks.length > 0 || missingDurationTasks.length > 0) {
      setShowMissingValuesModal(true);
      return;
    }

    if (!skipMissingCheck) {
      const unspecifiedBudget =
        draftPlan.budgetProvenance === "missing" ||
        draftPlan.budgetLimit === null ||
        draftPlan.budgetLimit === undefined;
      const unspecifiedDeadline =
        draftPlan.deadlineProvenance === "missing" ||
        draftPlan.deadlineHours === null ||
        draftPlan.deadlineHours === undefined;

      if (unspecifiedBudget || unspecifiedDeadline) {
        setShowMissingValuesModal(true);
        return;
      }
    }

    try {
      const converted = convertDraftToPlan(draftPlan);
      const val = validateCustomPlan(converted);
      setValidationResult(val);
      if (val.isValid && val.plan) {
        onLoadPlanToWorkspace(val.plan);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Draft plan contains unresolved required fields.";
      setValidationResult({
        isValid: false,
        schemaErrors: [msg],
        graphErrors: [],
        warnings: [],
        isDomainVerified: false,
        domainName: draftPlan.domain || "generic",
      });
    }
  };

  // 6. Manual Mode Task manipulation
  const handleAddManualTask = () => {
    const nextNum = plan.tasks.length + 1;
    const newId = `T${nextNum < 10 ? `0${nextNum}` : nextNum}`;
    const newTask: Task = {
      id: newId,
      title: `New Task ${nextNum}`,
      cost: 5000,
      durationHours: 8,
      priority: 3,
      policy: "flexible" as TaskPolicy,
      status: "pending",
      inputs: {},
      outputs: {},
    };

    const updatedPlan: Plan = {
      ...plan,
      tasks: [...plan.tasks, newTask],
    };
    setPlan(updatedPlan);
    setValidationResult(null);
  };

  const handleUpdateManualTask = (index: number, updates: Partial<Task>) => {
    const updatedTasks = [...plan.tasks];
    updatedTasks[index] = { ...updatedTasks[index], ...updates };

    const oldId = plan.tasks[index].id;
    let updatedDeps = [...plan.dependencies];
    if (updates.id && updates.id !== oldId) {
      updatedDeps = updatedDeps.map((d) => ({
        ...d,
        fromTaskId: d.fromTaskId === oldId ? updates.id! : d.fromTaskId,
        toTaskId: d.toTaskId === oldId ? updates.id! : d.toTaskId,
      }));
    }

    setPlan({
      ...plan,
      tasks: updatedTasks,
      dependencies: updatedDeps,
    });
    setValidationResult(null);
  };

  const handleRemoveManualTask = (taskId: string) => {
    const remainingTasks = plan.tasks.filter((t) => t.id !== taskId);
    const remainingDeps = plan.dependencies.filter(
      (d) => d.fromTaskId !== taskId && d.toTaskId !== taskId
    );

    setPlan({
      ...plan,
      tasks: remainingTasks,
      dependencies: remainingDeps,
    });
    setValidationResult(null);
  };

  const handleToggleManualPredecessor = (targetTaskId: string, predecessorId: string) => {
    const existingIndex = plan.dependencies.findIndex(
      (d) => d.fromTaskId === predecessorId && d.toTaskId === targetTaskId
    );

    let updatedDeps = [...plan.dependencies];
    if (existingIndex >= 0) {
      updatedDeps.splice(existingIndex, 1);
    } else {
      const newDep: Dependency = {
        id: `dep-${predecessorId.toLowerCase()}-${targetTaskId.toLowerCase()}`,
        fromTaskId: predecessorId,
        toTaskId: targetTaskId,
        blocksExecution: true,
        fieldMappings: [],
        origin: "manual",
        confirmationStatus: "confirmed",
        modificationHistory: [],
      };
      updatedDeps.push(newDep);
    }

    setPlan({
      ...plan,
      dependencies: updatedDeps,
    });
    setValidationResult(null);
  };

  const handleValidateManual = () => {
    const res = validateCustomPlan(plan);
    setValidationResult(res);
  };

  // JSON import handler
  const handleExecuteImport = () => {
    setImportError(null);
    try {
      const result = importPlanFromJson(importJsonText);
      if (!result.success || !result.plan) {
        setImportError(result.error || "Failed to parse imported plan JSON.");
        return;
      }
      setPlan(result.plan);
      setValidationResult(validateCustomPlan(result.plan));
      setIsImporting(false);
      setMode("manual");
    } catch (err: unknown) {
      setImportError(
        err instanceof Error ? err.message : "Failed to parse imported plan JSON."
      );
    }
  };

  const handleExportCopy = () => {
    const jsonStr = exportPlanToJson(plan);
    navigator.clipboard?.writeText(jsonStr);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  // Provenance Badge component
  const ProvenanceBadge = ({ provenance }: { provenance?: FieldProvenance }) => {
    switch (provenance) {
      case "user_provided":
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
              isLight
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-emerald-950/70 text-emerald-300 border-emerald-800/80"
            }`}
          >
            User Specified
          </span>
        );
      case "ai_estimate":
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
              isLight
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-teal-950/70 text-teal-300 border-teal-800/80"
            }`}
          >
            AI Estimate
          </span>
        );
      case "derived":
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
              isLight
                ? "bg-purple-50 text-purple-700 border-purple-200"
                : "bg-purple-950/70 text-purple-300 border-purple-800/80"
            }`}
          >
            Derived
          </span>
        );
      case "missing":
      default:
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
              isLight
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-amber-950/70 text-amber-300 border-amber-800/80"
            }`}
          >
            Unspecified
          </span>
        );
    }
  };

  return (
    <div
      className={`rounded-2xl p-6 sm:p-8 mb-8 border transition-colors ${
        isLight
          ? "bg-white border-slate-200 shadow-sm text-slate-900"
          : "bg-[#0d1322] border-slate-800 shadow-2xl text-slate-100"
      }`}
    >
      {/* Header Bar */}
      <div
        className={`flex flex-col md:flex-row md:items-center justify-between pb-5 border-b gap-4 ${
          isLight ? "border-slate-200" : "border-slate-800"
        }`}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              className={`text-2xl sm:text-3xl font-bold tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              Create Your Own Plan
            </h2>
            <span
              className={`px-3 py-1 rounded-full text-xs sm:text-sm font-semibold border ${
                isLight
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-teal-950/80 text-teal-300 border-teal-800/80"
              }`}
            >
              {mode === "prompt"
                ? "AI Guided"
                : mode === "review_draft"
                ? "Draft Review"
                : "Manual Editor"}
            </span>
          </div>
          <p className={`text-xs sm:text-sm mt-1.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Local workspace memory only &bull; Preserves canonical Campus Tech Fest demo plan intact.
          </p>
        </div>

        {/* Mode Switcher Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {mode !== "prompt" && (
            <button
              onClick={() => setMode("prompt")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                isLight
                  ? "text-slate-700 bg-slate-100 hover:bg-slate-200"
                  : "text-slate-200 bg-slate-800 hover:bg-slate-700"
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              Prompt Screen
            </button>
          )}

          {mode !== "manual" && (
            <button
              onClick={() => setMode("manual")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                isLight
                  ? "text-slate-700 bg-slate-100 hover:bg-slate-200"
                  : "text-slate-200 bg-slate-800 hover:bg-slate-700"
              }`}
            >
              <Edit3 className="w-4 h-4" />
              Manual Editor
            </button>
          )}

          <button
            onClick={handleLoadTemplate}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border rounded-lg transition-colors ${
              isLight
                ? "text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200"
                : "text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700 border-slate-700"
            }`}
          >
            Software Template
          </button>

          <button
            onClick={handleLoadBlank}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border rounded-lg transition-colors ${
              isLight
                ? "text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200"
                : "text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700 border-slate-700"
            }`}
          >
            Blank Plan
          </button>

          <button
            onClick={() => setIsImporting(!isImporting)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border rounded-lg transition-colors ${
              isLight
                ? "text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200"
                : "text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700 border-slate-700"
            }`}
          >
            <Upload className="w-4 h-4" />
            Import JSON
          </button>

          <button
            onClick={handleExportCopy}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border rounded-lg transition-colors ${
              isLight
                ? "text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200"
                : "text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700 border-slate-700"
            }`}
          >
            <Download className="w-4 h-4" />
            {copiedExport ? "Copied!" : "Export JSON"}
          </button>

          <button
            onClick={onCancel}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              isLight
                ? "text-slate-500 hover:text-slate-800"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Close
          </button>
        </div>
      </div>

      {/* JSON Import Drawer */}
      {isImporting && (
        <div
          className={`my-4 p-4 rounded-lg border ${
            isLight ? "bg-slate-50 border-slate-200" : "bg-[#131b2e] border-slate-800"
          }`}
        >
          <label
            className={`block text-xs font-medium mb-1 ${
              isLight ? "text-slate-700" : "text-slate-300"
            }`}
          >
            Paste Plan JSON:
          </label>
          <textarea
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            rows={5}
            className={`w-full text-xs font-mono p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isLight
                ? "bg-white border-slate-300 text-slate-900"
                : "bg-[#0a0f1d] border-slate-700 text-slate-100"
            }`}
            placeholder='{"schemaVersion": "1.0.0", "name": "My Custom Project", "tasks": [...]}'
          />
          {importError && (
            <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {importError}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setIsImporting(false)}
              className={`px-3 py-1 text-xs ${
                isLight ? "text-slate-600 hover:text-slate-800" : "text-slate-400 hover:text-white"
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Load Imported Plan
            </button>
          </div>
        </div>
      )}

      {/* VIEW 1: Prompt-First Guided Flow */}
      {mode === "prompt" && (
        <div className="mt-6 space-y-6">
          <div
            className={`rounded-2xl p-6 sm:p-8 shadow-xs border ${
              isLight
                ? "bg-slate-50/80 border-slate-200/90 text-slate-900"
                : "bg-[#131b2e] border-slate-800 text-slate-100"
            }`}
          >
            <label
              className={`block text-lg sm:text-xl font-bold mb-2 tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              }`}
            >
              What are you planning?
            </label>
            <p
              className={`text-sm sm:text-base mb-4 leading-relaxed ${
                isLight ? "text-slate-600" : "text-slate-400"
              }`}
            >
              Describe your project goal in ordinary language. Gemini will propose a phased task breakdown, timeline, dependencies, and explicit provenance tracking.
            </p>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. I want to build and deploy a full-stack web application in 7 days with a backend API, database, frontend, testing, and deployment. My budget is ₹50,000. Testing must finish before deployment."
              rows={4}
              className={`w-full text-base sm:text-lg p-4 sm:p-5 border rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all min-h-[130px] leading-relaxed ${
                isLight
                  ? "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
                  : "bg-[#0a0f1d] border-slate-700 text-slate-100 placeholder:text-slate-500"
              }`}
            />

            <p
              className={`text-xs mt-2.5 flex items-center gap-1.5 ${
                isLight ? "text-slate-600" : "text-slate-400"
              }`}
            >
              <Info className="w-3.5 h-3.5 shrink-0 text-blue-500" />
              <span>
                <strong>Tip:</strong> Specify key details like your destination, venue, or tech stack. If omitted, PlanPatch will explicitly add a discovery step (e.g. &ldquo;Select Destination&rdquo;) instead of inventing a fake one.
              </span>
            </p>

            {/* Quick Example Chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span
                className={`text-xs sm:text-sm font-semibold ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}
              >
                Try an example:
              </span>
              {samplePrompts.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(s.text);
                    setPromptBudget(s.budget);
                    setPromptDeadline(s.deadline);
                  }}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium border rounded-lg transition-colors shadow-2xs ${
                    isLight
                      ? "bg-white hover:bg-slate-100 border-slate-200 text-slate-800 hover:text-blue-700"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-teal-300"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Optional Known Constraints */}
            <div
              className={`mt-6 pt-5 border-t grid grid-cols-1 sm:grid-cols-2 gap-5 ${
                isLight ? "border-slate-200/80" : "border-slate-800"
              }`}
            >
              <div>
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isLight ? "text-slate-800" : "text-slate-200"
                  }`}
                >
                  Budget Limit (₹ INR) <span className={isLight ? "text-slate-500 font-normal" : "text-slate-400 font-normal"}>(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-sm sm:text-base text-slate-400 font-medium">₹</span>
                  <input
                    type="number"
                    value={promptBudget}
                    onChange={(e) => setPromptBudget(e.target.value)}
                    placeholder="e.g. 50000"
                    className={`w-full text-sm sm:text-base pl-8 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${
                      isLight
                        ? "bg-white border-slate-300 text-slate-900"
                        : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isLight ? "text-slate-800" : "text-slate-200"
                  }`}
                >
                  Deadline (Hours) <span className={isLight ? "text-slate-500 font-normal" : "text-slate-400 font-normal"}>(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400">
                    <Clock className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    value={promptDeadline}
                    onChange={(e) => setPromptDeadline(e.target.value)}
                    placeholder="e.g. 168 (7 days)"
                    className={`w-full text-sm sm:text-base pl-9 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${
                      isLight
                        ? "bg-white border-slate-300 text-slate-900"
                        : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
              <div
                className={`text-xs sm:text-sm flex items-center gap-2 ${
                  isLight ? "text-slate-600" : "text-slate-400"
                }`}
              >
                <Info className="w-4 h-4 text-slate-500 shrink-0" />
                Never invents factual constraints; all estimates are explicitly tagged.
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateDraft}
                  disabled={isGenerating || !prompt.trim()}
                  className="inline-flex items-center gap-2.5 px-6 py-3 text-base sm:text-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Analyzing Plan &amp; Generating Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-blue-200" />
                      Generate Plan Draft
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Resilient Error Display */}
          {draftError && (
            <div
              className={`p-5 sm:p-6 rounded-2xl space-y-4 shadow-2xs border ${
                isLight
                  ? "bg-amber-50/95 border-amber-200"
                  : "bg-amber-950/30 border-amber-800/80"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4
                    className={`text-base sm:text-lg font-bold ${
                      isLight ? "text-amber-900" : "text-amber-200"
                    }`}
                  >
                    AI Plan Drafting Unavailable
                  </h4>
                  <p
                    className={`text-sm mt-1 leading-relaxed ${
                      isLight ? "text-amber-800" : "text-amber-300"
                    }`}
                  >
                    {draftErrorDetails?.userFriendlyMessage || draftError}
                  </p>
                  {draftErrorDetails?.category === "AUTH_OR_CONFIG_MISSING" && (
                    <p
                      className={`text-xs sm:text-sm mt-2 p-3 rounded-lg ${
                        isLight
                          ? "text-amber-700 bg-amber-100/70"
                          : "text-amber-300 bg-amber-900/50"
                      }`}
                    >
                      Tip: You can add <code>GEMINI_API_KEY</code> to <code>.env.local</code> on the server, or start immediately using our pre-built software template.
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`flex flex-wrap items-center gap-2.5 pt-3 border-t ${
                  isLight ? "border-amber-200/80" : "border-amber-800/60"
                }`}
              >
                {draftErrorDetails?.canRetry && (
                  <button
                    onClick={handleGenerateDraft}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors shadow-2xs"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Generation
                  </button>
                )}

                <button
                  onClick={() => {
                    const budgetNum = promptBudget.trim() ? parseFloat(promptBudget) : null;
                    const deadlineNum = promptDeadline.trim() ? parseFloat(promptDeadline) : null;
                    const fallback = generateSmartFallbackDraftPlan({
                      prompt: prompt.trim() || "Project Plan",
                      budgetLimit: budgetNum !== null && !isNaN(budgetNum) ? budgetNum : null,
                      deadlineHours: deadlineNum !== null && !isNaN(deadlineNum) ? deadlineNum : null,
                      currency: "INR",
                    });
                    setDraftPlan(fallback);
                    const converted = convertDraftToPlan(fallback);
                    setPlan(converted);
                    setValidationResult(validateCustomPlan(converted));
                    setDraftError(null);
                    setDraftErrorDetails(null);
                    setMode("review_draft");
                  }}
                  className={`px-4 py-2 text-xs sm:text-sm font-semibold border rounded-lg transition-colors ${
                    isLight
                      ? "text-teal-800 bg-teal-100 hover:bg-teal-200 border-teal-300"
                      : "text-teal-200 bg-teal-950/80 hover:bg-teal-900 border-teal-700"
                  }`}
                >
                  Generate Plan with Instant Fallback
                </button>

                <button
                  onClick={handleLoadTemplate}
                  className={`px-4 py-2 text-xs sm:text-sm font-medium border rounded-lg transition-colors ${
                    isLight
                      ? "text-slate-700 bg-white hover:bg-slate-100 border-slate-200"
                      : "text-slate-200 bg-slate-800 hover:bg-slate-700 border-slate-700"
                  }`}
                >
                  Start from Software Template Instead
                </button>

                <button
                  onClick={() => setMode("manual")}
                  className={`px-4 py-2 text-xs sm:text-sm font-medium border rounded-lg transition-colors ${
                    isLight
                      ? "text-slate-700 bg-white hover:bg-slate-100 border-slate-200"
                      : "text-slate-200 bg-slate-800 hover:bg-slate-700 border-slate-700"
                  }`}
                >
                  Build Manually
                </button>
              </div>
            </div>
          )}

          {/* Fallback secondary paths */}
          <div
            className={`border rounded-2xl p-5 sm:p-6 shadow-2xs ${
              isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-[#131b2e]"
            }`}
          >
            <h4
              className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-3 ${
                isLight ? "text-slate-700" : "text-slate-300"
              }`}
            >
              Prefer starting manually?
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleLoadTemplate}
                className={`text-left p-4 sm:p-5 border rounded-xl transition-all group ${
                  isLight
                    ? "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"
                    : "border-slate-700 hover:border-teal-400 hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm sm:text-base font-bold transition-colors ${
                      isLight
                        ? "text-slate-900 group-hover:text-blue-700"
                        : "text-white group-hover:text-teal-300"
                    }`}
                  >
                    Software Engineering Template
                  </span>
                  <ArrowRight
                    className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 ${
                      isLight
                        ? "text-slate-400 group-hover:text-blue-600"
                        : "text-slate-500 group-hover:text-teal-400"
                    }`}
                  />
                </div>
                <p
                  className={`text-xs sm:text-sm mt-2 leading-relaxed ${
                    isLight ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  6 pre-wired tasks (Arch, Backend, Frontend, QA, Security, Deploy) with realistic dependencies and ₹95,000 budget.
                </p>
              </button>

              <button
                onClick={handleLoadBlank}
                className={`text-left p-4 sm:p-5 border rounded-xl transition-all group ${
                  isLight
                    ? "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm sm:text-base font-bold ${
                      isLight ? "text-slate-900" : "text-white"
                    }`}
                  >
                    Blank Custom Plan
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
                <p
                  className={`text-xs sm:text-sm mt-2 leading-relaxed ${
                    isLight ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  Start with a clean slate and build tasks and dependency relationships step-by-step.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: AI Draft Review Screen */}
      {mode === "review_draft" && draftPlan && (
        <div className="mt-6 space-y-6">
          {/* Summary Card */}
          <div
            className={`rounded-xl p-5 border ${
              isLight ? "bg-slate-50 border-slate-200" : "bg-[#131b2e] border-slate-800"
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draftPlan.name}
                    onChange={(e) => {
                      const updated = { ...draftPlan, name: e.target.value };
                      setDraftPlan(updated);
                      setPlan(convertDraftToPlan(updated));
                    }}
                    className={`text-lg font-bold bg-transparent border-b border-dashed hover:border-blue-400 focus:border-blue-600 focus:outline-none ${
                      isLight
                        ? "text-slate-900 border-slate-300"
                        : "text-white border-slate-700"
                    }`}
                  />
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      isLight
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-purple-950/70 text-purple-300 border-purple-800/80"
                    }`}
                  >
                    AI Proposed Draft
                  </span>
                </div>
                <p
                  className={`text-xs italic ${
                    isLight ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  &ldquo;{draftPlan.goal}&rdquo;
                </p>
              </div>

              {/* Domain & Verification Tiering Badge */}
              <div className="flex items-center gap-2">
                <span className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Domain:
                </span>
                <span
                  className={`px-2.5 py-1 rounded text-xs font-medium border ${
                    isLight
                      ? "bg-slate-100 text-slate-800 border-slate-200"
                      : "bg-slate-800 text-slate-200 border-slate-700"
                  }`}
                >
                  {draftPlan.domain}
                </span>
                {isDomainVerified ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
                      isLight
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-emerald-950/70 text-emerald-300 border-emerald-800/80"
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Verified Domain
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
                      isLight
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-amber-950/70 text-amber-300 border-amber-800/80"
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    Unverified Domain
                  </span>
                )}
              </div>
            </div>

            {/* Metrics & Provenance Row */}
            <div
              className={`mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 ${
                isLight ? "border-slate-200" : "border-slate-800"
              }`}
            >
              <div
                className={`p-3 rounded-lg border ${
                  isLight ? "bg-white border-slate-200" : "bg-[#0d1322] border-slate-800"
                }`}
              >
                <span
                  className={`text-[11px] font-medium uppercase ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  Tasks
                </span>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}
                >
                  {draftPlan.tasks.length} Stages
                </div>
                <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {draftPlan.tasks.filter((t) => t.policy === "fixed").length} fixed requirements
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  isLight ? "bg-white border-slate-200" : "bg-[#0d1322] border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-medium uppercase ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    Budget
                  </span>
                  <ProvenanceBadge provenance={draftPlan.budgetProvenance} />
                </div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}
                >
                  {draftPlan.budgetLimit !== null && draftPlan.budgetLimit !== undefined && draftPlan.budgetProvenance !== "missing"
                    ? `₹ ${draftPlan.budgetLimit.toLocaleString()}`
                    : "Unspecified"}
                </div>
                <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {draftPlan.budgetLimit !== null && draftPlan.budgetLimit !== undefined && draftPlan.budgetProvenance !== "missing"
                    ? "Max spending limit"
                    : "No budget cap set"}
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  isLight ? "bg-white border-slate-200" : "bg-[#0d1322] border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-medium uppercase ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    Deadline
                  </span>
                  <ProvenanceBadge provenance={draftPlan.deadlineProvenance} />
                </div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}
                >
                  {draftPlan.deadlineHours !== null && draftPlan.deadlineHours !== undefined && draftPlan.deadlineProvenance !== "missing"
                    ? `${draftPlan.deadlineHours} Hours`
                    : "Unspecified"}
                </div>
                <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {draftPlan.deadlineHours !== null && draftPlan.deadlineHours !== undefined && draftPlan.deadlineProvenance !== "missing"
                    ? "Target project finish"
                    : "No deadline constraint"}
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  isLight ? "bg-white border-slate-200" : "bg-[#0d1322] border-slate-800"
                }`}
              >
                <span
                  className={`text-[11px] font-medium uppercase ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  Topological Slack
                </span>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}
                >
                  {validationResult?.schedule?.projectSlack !== undefined && validationResult?.schedule?.projectSlack !== null
                    ? `${validationResult.schedule.projectSlack}h`
                    : "—"}
                </div>
                <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {validationResult?.schedule?.projectSlack !== null &&
                  validationResult?.schedule?.projectSlack !== undefined ? (
                    <span
                      className={
                        validationResult.schedule.projectSlack >= 0
                          ? isLight
                            ? "text-emerald-700 font-medium"
                            : "text-emerald-400 font-medium"
                          : isLight
                          ? "text-rose-700 font-medium"
                          : "text-rose-400 font-medium"
                      }
                    >
                      {validationResult.schedule.projectSlack >= 0
                        ? `${validationResult.schedule.projectSlack}h slack`
                        : `${Math.abs(validationResult.schedule.projectSlack)}h overdue`}
                    </span>
                  ) : (
                    "No deadline constraint"
                  )}
                </div>
              </div>
            </div>

            {/* Unverified Domain Notice */}
            {!isDomainVerified && (
              <div
                className={`mt-3 p-2.5 rounded-md text-[11px] flex items-start gap-2 border ${
                  isLight
                    ? "bg-amber-50/80 border-amber-200 text-amber-800"
                    : "bg-amber-950/40 border-amber-800/70 text-amber-300"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                <span>
                  <strong>Unverified Domain Notice:</strong> Structural graph cycles and schedule mathematics are strictly checked, but domain-specific business rules for &ldquo;{draftPlan.domain}&rdquo; require manual operator verification.
                </span>
              </div>
            )}
          </div>

          {/* Assumptions & Missing Info Accordion */}
          {(draftPlan.assumptions.length > 0 || draftPlan.missingInformation.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {draftPlan.assumptions.length > 0 && (
                <div
                  className={`p-3 rounded-lg border ${
                    isLight
                      ? "bg-slate-50 border-slate-200 text-slate-600"
                      : "bg-[#131b2e] border-slate-800 text-slate-300"
                  }`}
                >
                  <h4
                    className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${
                      isLight ? "text-slate-800" : "text-slate-100"
                    }`}
                  >
                    <Info className={`w-3.5 h-3.5 ${isLight ? "text-blue-600" : "text-teal-400"}`} />
                    AI Assumptions Made:
                  </h4>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    {draftPlan.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {draftPlan.missingInformation.length > 0 && (
                <div
                  className={`p-3.5 rounded-lg border ${
                    isLight
                      ? "bg-amber-50/80 border-amber-200 text-amber-900"
                      : "bg-amber-950/40 border-amber-800/70 text-amber-200"
                  }`}
                >
                  <h4
                    className={`text-xs font-semibold flex items-center gap-1.5 mb-1.5 ${
                      isLight ? "text-amber-900" : "text-amber-200"
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    Actionable Missing Information (Honest Provenance):
                  </h4>
                  <p className={`text-[11px] mb-2 leading-relaxed ${isLight ? "text-amber-800/90" : "text-amber-300/80"}`}>
                    PlanPatch never invents unprovided real-world entities. The following parameters were left unstated in your prompt:
                  </p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    {draftPlan.missingInformation.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Phased Project Tasks Section */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <h3
                  className={`text-sm font-semibold ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}
                >
                  Phased Project Tasks ({draftPlan.tasks.length})
                </h3>
                <span className={`text-xs ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                  &bull; Click any task to expand details
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={expandedTaskIds.size === draftPlan.tasks.length ? collapseAllTasks : expandAllTasks}
                  className={`px-2.5 py-1 text-xs font-medium border rounded-md transition-colors ${
                    isLight
                      ? "text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200"
                      : "text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700"
                  }`}
                >
                  {expandedTaskIds.size === draftPlan.tasks.length ? "Collapse All" : "Expand All"}
                </button>
                <button
                  onClick={handleAddDraftTask}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-md transition-colors ${
                    isLight
                      ? "text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200"
                      : "text-teal-300 bg-teal-950/70 hover:bg-teal-900 border-teal-800/80"
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  Add Task
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {draftPlan.tasks.map((task, idx) => {
                const isExpanded = expandedTaskIds.has(task.id);
                const predecessors = draftPlan.tasks.filter((other) =>
                  task.predecessorIds.includes(other.id)
                );
                const successors = draftPlan.tasks.filter((other) =>
                  other.predecessorIds.includes(task.id)
                );

                if (!isExpanded) {
                  return (
                    <div
                      key={task.id}
                      onClick={() => toggleTaskExpand(task.id)}
                      className={`p-3 rounded-lg shadow-2xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
                        isLight
                          ? "bg-white border-slate-200 hover:border-slate-300"
                          : "bg-[#131b2e] border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <span
                          className={`px-2 py-0.5 font-mono text-xs font-bold rounded shrink-0 ${
                            isLight
                              ? "bg-slate-100 text-slate-800"
                              : "bg-slate-800 text-teal-300"
                          }`}
                        >
                          {task.id}
                        </span>
                        <span
                          className={`text-xs font-semibold truncate ${
                            isLight ? "text-slate-900" : "text-white"
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>

                      <div
                        className={`flex flex-wrap items-center gap-2 text-xs ${
                          isLight ? "text-slate-600" : "text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>
                            {task.cost !== null && task.cost !== undefined
                              ? `₹${task.cost.toLocaleString()}`
                              : "No Cost"}
                          </span>
                          <ProvenanceBadge provenance={task.costProvenance} />
                        </div>

                        <div className="flex items-center gap-1">
                          <span>
                            {task.durationHours !== null && task.durationHours !== undefined
                              ? `${task.durationHours}h`
                              : "No Duration"}
                          </span>
                          <ProvenanceBadge provenance={task.durationProvenance} />
                        </div>

                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            isLight
                              ? "bg-slate-100 text-slate-700"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {task.policy}
                        </span>

                        <span className={isLight ? "text-slate-400" : "text-slate-500"}>
                          P{task.priority}
                        </span>

                        <span
                          className={`text-[11px] font-mono ${
                            isLight ? "text-slate-500" : "text-slate-400"
                          }`}
                        >
                          {task.predecessorIds.length > 0
                            ? `Deps: ${task.predecessorIds.join(", ")}`
                            : "No deps"}
                        </span>

                        <ChevronDown className={`w-4 h-4 shrink-0 ml-1 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-lg shadow-sm transition-all space-y-4 border-2 ${
                      isLight
                        ? "bg-white border-blue-200"
                        : "bg-[#131b2e] border-teal-500/50"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span
                          className={`px-2 py-0.5 font-mono text-xs font-bold rounded ${
                            isLight
                              ? "bg-blue-100 text-blue-900"
                              : "bg-teal-950 text-teal-300 border border-teal-800"
                          }`}
                        >
                          {task.id}
                        </span>
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) =>
                            handleUpdateDraftTask(idx, { title: e.target.value })
                          }
                          className={`text-sm font-semibold flex-1 border-b focus:outline-none bg-transparent ${
                            isLight
                              ? "text-slate-900 border-slate-300 focus:border-blue-500"
                              : "text-white border-slate-700 focus:border-teal-400"
                          }`}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <select
                            value={task.policy}
                            onChange={(e) =>
                              handleUpdateDraftTask(idx, {
                                policy: e.target.value as TaskPolicy,
                                policyProvenance: "user_provided",
                              })
                            }
                            className={`text-xs py-1 px-2 border rounded ${
                              isLight
                                ? "border-slate-200 bg-white text-slate-700"
                                : "border-slate-700 bg-[#0a0f1d] text-slate-200"
                            }`}
                          >
                            <option value="fixed">Fixed (Core)</option>
                            <option value="flexible">Flexible</option>
                            <option value="optional">Optional</option>
                          </select>
                          <ProvenanceBadge provenance={task.policyProvenance ?? "ai_estimate"} />
                        </div>

                        <button
                          onClick={() => handleRemoveDraftTask(task.id)}
                          disabled={draftPlan.tasks.length <= 1}
                          className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Remove task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => toggleTaskExpand(task.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Collapse task"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Task details: Cost, Duration, Priority */}
                    <div
                      className={`grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t text-xs ${
                        isLight ? "border-slate-100" : "border-slate-800"
                      }`}
                    >
                      <div>
                        <div
                          className={`flex items-center justify-between mb-1 ${
                            isLight ? "text-slate-500" : "text-slate-400"
                          }`}
                        >
                          <span>Cost (₹)</span>
                          <ProvenanceBadge provenance={task.costProvenance} />
                        </div>
                        <input
                          type="number"
                          value={task.cost ?? ""}
                          placeholder="Unspecified"
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value));
                            handleUpdateDraftTask(idx, {
                              cost: val,
                              costProvenance: val !== null ? "user_provided" : "missing",
                            });
                          }}
                          className={`w-full p-1.5 border rounded text-xs font-medium ${
                            isLight
                              ? "border-slate-200 bg-white text-slate-900"
                              : "border-slate-700 bg-[#0a0f1d] text-slate-100"
                          }`}
                        />
                      </div>

                      <div>
                        <div
                          className={`flex items-center justify-between mb-1 ${
                            isLight ? "text-slate-500" : "text-slate-400"
                          }`}
                        >
                          <span>Duration (Hours)</span>
                          <ProvenanceBadge provenance={task.durationProvenance} />
                        </div>
                        <input
                          type="number"
                          value={task.durationHours ?? ""}
                          placeholder="Unspecified"
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value));
                            handleUpdateDraftTask(idx, {
                              durationHours: val,
                              durationProvenance: val !== null ? "user_provided" : "missing",
                            });
                          }}
                          className={`w-full p-1.5 border rounded text-xs font-medium ${
                            isLight
                              ? "border-slate-200 bg-white text-slate-900"
                              : "border-slate-700 bg-[#0a0f1d] text-slate-100"
                          }`}
                        />
                      </div>

                      <div>
                        <div
                          className={`flex items-center justify-between mb-1 ${
                            isLight ? "text-slate-500" : "text-slate-400"
                          }`}
                        >
                          <span>Priority (1-5)</span>
                          <ProvenanceBadge provenance={task.priorityProvenance} />
                        </div>
                        <select
                          value={task.priority}
                          onChange={(e) =>
                            handleUpdateDraftTask(idx, {
                              priority: parseInt(e.target.value, 10),
                              priorityProvenance: "user_provided",
                            })
                          }
                          className={`w-full p-1.5 border rounded text-xs font-medium ${
                            isLight
                              ? "border-slate-200 bg-white text-slate-900"
                              : "border-slate-700 bg-[#0a0f1d] text-slate-100"
                          }`}
                        >
                          <option value={1}>1 (Lowest)</option>
                          <option value={2}>2 (Low)</option>
                          <option value={3}>3 (Normal)</option>
                          <option value={4}>4 (High)</option>
                          <option value={5}>5 (Critical)</option>
                        </select>
                      </div>
                    </div>

                    {/* Predecessors vs Successors Direction View */}
                    <div
                      className={`pt-3 border-t space-y-3 ${
                        isLight ? "border-slate-100" : "border-slate-800"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span
                              className={`text-xs font-semibold ${
                                isLight ? "text-slate-800" : "text-slate-200"
                              }`}
                            >
                              This task depends on (Predecessors):
                            </span>
                            <span
                              className={`text-[11px] block ${
                                isLight ? "text-slate-500" : "text-slate-400"
                              }`}
                            >
                              Must be completed before {task.id} ({task.title}) can start.
                            </span>
                          </div>
                          <ProvenanceBadge provenance={task.dependenciesProvenance ?? "ai_estimate"} />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {draftPlan.tasks
                            .filter((other) => other.id !== task.id)
                            .map((other) => {
                              const isSelected = task.predecessorIds.includes(other.id);
                              return (
                                <button
                                  key={other.id}
                                  onClick={() => handleToggleDraftPredecessor(task.id, other.id)}
                                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                                    isSelected
                                      ? isLight
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-teal-500 text-slate-950 font-bold border-teal-500"
                                      : isLight
                                      ? "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                      : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                                  }`}
                                >
                                  {isSelected ? "✓ " : ""}{other.id}: {other.title}
                                </button>
                              );
                            })}
                          {draftPlan.tasks.length === 1 && (
                            <span className="text-xs text-slate-400 italic">No other tasks in plan</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div>
                          <span
                            className={`text-xs font-semibold ${
                              isLight ? "text-slate-800" : "text-slate-200"
                            }`}
                          >
                            Tasks that depend on this task (Successors):
                          </span>
                          <span
                            className={`text-[11px] block ${
                              isLight ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            Cannot start until {task.id} ({task.title}) is completed.
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {successors.length > 0 ? (
                            successors.map((succ) => (
                              <span
                                key={succ.id}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                                  isLight
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-slate-800 text-slate-300 border-slate-700"
                                }`}
                              >
                                {succ.id}: {succ.title}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              None (Terminal or parallel task)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Recovery Alternatives Section */}
                    <div
                      className={`pt-3 border-t space-y-2.5 ${
                        isLight ? "border-slate-100" : "border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-xs font-semibold ${
                                isLight ? "text-slate-800" : "text-slate-200"
                              }`}
                            >
                              Recovery Alternatives (Disruption Resilience):
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? "bg-slate-100 text-slate-600 border-slate-200"
                                  : "bg-slate-800 text-slate-300 border-slate-700"
                              }`}
                            >
                              {task.alternatives?.length ?? 0} defined
                            </span>
                          </div>
                          <span
                            className={`text-[11px] block ${
                              isLight ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            Evaluated by PlanPatch deterministic solver when tasks cancel, costs spike, or deadlines move.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddAlternative(idx)}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition ${
                            isLight
                              ? "bg-white text-teal-800 border-teal-300 hover:bg-teal-50"
                              : "bg-teal-950/60 text-teal-200 border-teal-700 hover:bg-teal-900/80"
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                          Add Option
                        </button>
                      </div>

                      {task.alternatives && task.alternatives.length > 0 ? (
                        <div className="space-y-2">
                          {task.alternatives.map((alt, altIdx) => (
                            <div
                              key={alt.id}
                              className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition ${
                                alt.status === "confirmed"
                                  ? isLight
                                    ? "bg-emerald-50/60 border-emerald-200"
                                    : "bg-emerald-950/30 border-emerald-800/80"
                                  : isLight
                                  ? "bg-slate-50 border-slate-200"
                                  : "bg-[#0f172a] border-slate-800"
                              }`}
                            >
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-teal-600 font-bold shrink-0">
                                    {alt.id}
                                  </span>
                                  <span className="font-semibold truncate">
                                    {alt.title}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAlternativeStatus(idx, altIdx)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition ${
                                      alt.status === "confirmed"
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                                        : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
                                    }`}
                                    title="Click to toggle between suggested and confirmed"
                                  >
                                    {alt.status === "confirmed" ? "✓ Confirmed Alternative" : "Suggested (Review)"}
                                  </button>
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                                  <span>Cost: ₹{alt.cost.toLocaleString()}</span>
                                  <span>Duration: {alt.durationHours}h</span>
                                  {alt.unknownFacts && alt.unknownFacts.length > 0 && (
                                    <span className="italic text-amber-600">
                                      Unverified facts: {alt.unknownFacts.join(", ")}
                                    </span>
                                  )}
                                  {alt.notes && <span>Note: {alt.notes}</span>}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAlternative(idx, altIdx)}
                                  className="p-1 text-slate-400 hover:text-red-500 transition"
                                  title="Delete alternative"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic p-2 rounded bg-slate-50/50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800">
                          No alternatives declared. If this task is cancelled during project execution, the solver cannot generate replacement candidates unless marked optional.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Validation & Open Actions */}
          <div
            className={`pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isLight ? "border-slate-200" : "border-slate-800"
            }`}
          >
            <div>
              {validationResult?.isValid ? (
                <div
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    isLight ? "text-emerald-700" : "text-emerald-400"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Graph and constraints verified &bull; Ready for recovery workspace
                </div>
              ) : (
                <div className="text-xs text-rose-500">
                  {validationResult?.schemaErrors[0] ||
                    validationResult?.graphErrors[0] ||
                    "Please resolve validation issues."}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setMode("prompt")}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  isLight ? "text-slate-600 hover:text-slate-800" : "text-slate-400 hover:text-white"
                }`}
              >
                Back to Prompt
              </button>

              <button
                onClick={() => setMode("manual")}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isLight
                    ? "text-slate-700 bg-slate-100 hover:bg-slate-200"
                    : "text-slate-200 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                Switch to Full Manual Mode
              </button>

              <button
                onClick={() => handleConfirmDraftAndOpen(false)}
                disabled={!validationResult?.isValid}
                className={`inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all ${
                  isLight
                    ? "text-white bg-blue-600 hover:bg-blue-700"
                    : "text-slate-950 bg-teal-400 hover:bg-teal-300 font-bold"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm &amp; Open in Recovery Workspace
              </button>
            </div>
          </div>

          {/* Missing Values Confirmation Modal */}
          {showMissingValuesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div
                className={`rounded-xl max-w-lg w-full p-6 shadow-2xl border space-y-4 ${
                  isLight
                    ? "bg-white border-slate-200 text-slate-900"
                    : "bg-[#0d1322] border-slate-800 text-slate-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h3
                      className={`text-base font-bold ${
                        isLight ? "text-slate-900" : "text-white"
                      }`}
                    >
                      Confirm Plan Constraints &amp; Unspecified Values
                    </h3>
                    <p className={`text-xs mt-1 ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                      PlanPatch maintains honest provenance. Please confirm how missing values should be handled:
                    </p>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-lg text-xs space-y-2 border ${
                    isLight
                      ? "bg-amber-50/70 border-amber-200/80 text-amber-900"
                      : "bg-amber-950/40 border-amber-800/80 text-amber-200"
                  }`}
                >
                  {(draftPlan.budgetProvenance === "missing" ||
                    draftPlan.budgetLimit === null ||
                    draftPlan.budgetLimit === undefined) && (
                    <div>
                      <strong>&bull; Budget Limit: Unspecified.</strong> The recovery engine will not enforce a budget limit or score budget usage.
                    </div>
                  )}
                  {(draftPlan.deadlineProvenance === "missing" ||
                    draftPlan.deadlineHours === null ||
                    draftPlan.deadlineHours === undefined) && (
                    <div>
                      <strong>&bull; Project Deadline: Unspecified.</strong> The recovery engine will not enforce a deadline limit or compute schedule overdue.
                    </div>
                  )}
                  {draftPlan.tasks.some((t) => t.cost === null || t.cost === undefined || isNaN(t.cost)) && (
                    <div className="text-rose-500 font-medium">
                      <strong>&bull; Unresolved Task Costs:</strong> Tasks ({draftPlan.tasks.filter((t) => t.cost === null || t.cost === undefined || isNaN(t.cost)).map((t) => t.id).join(", ")}) do not have cost estimates. Required schema fields cannot be fabricated; please supply cost estimates in the draft editor before opening.
                    </div>
                  )}
                  {draftPlan.tasks.some(
                    (t) => t.durationHours === null || t.durationHours === undefined || isNaN(t.durationHours)
                  ) && (
                    <div className="text-rose-500 font-medium">
                      <strong>&bull; Unresolved Task Durations:</strong> Tasks ({draftPlan.tasks.filter((t) => t.durationHours === null || t.durationHours === undefined || isNaN(t.durationHours)).map((t) => t.id).join(", ")}) do not have duration estimates. Required schema fields cannot be fabricated; please supply duration estimates in the draft editor before opening.
                    </div>
                  )}
                </div>

                {draftPlan.tasks.some(
                  (t) =>
                    t.cost === null ||
                    t.cost === undefined ||
                    isNaN(t.cost) ||
                    t.durationHours === null ||
                    t.durationHours === undefined ||
                    isNaN(t.durationHours)
                ) ? (
                  <div
                    className={`flex items-center justify-end gap-3 pt-3 border-t ${
                      isLight ? "border-slate-100" : "border-slate-800"
                    }`}
                  >
                    <button
                      onClick={() => setShowMissingValuesModal(false)}
                      className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-colors ${
                        isLight
                          ? "text-white bg-blue-600 hover:bg-blue-700"
                          : "text-slate-950 bg-teal-400 hover:bg-teal-300 font-bold"
                      }`}
                    >
                      Return to Draft Editor &amp; Supply Values
                    </button>
                  </div>
                ) : (
                  <div
                    className={`flex items-center justify-end gap-3 pt-3 border-t ${
                      isLight ? "border-slate-100" : "border-slate-800"
                    }`}
                  >
                    <button
                      onClick={() => setShowMissingValuesModal(false)}
                      className={`px-4 py-2 text-xs font-medium transition-colors ${
                        isLight ? "text-slate-600 hover:text-slate-800" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Cancel &amp; Edit Values
                    </button>
                    <button
                      onClick={() => {
                        setShowMissingValuesModal(false);
                        handleConfirmDraftAndOpen(true);
                      }}
                      className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-colors ${
                        isLight
                          ? "text-white bg-blue-600 hover:bg-blue-700"
                          : "text-slate-950 bg-teal-400 hover:bg-teal-300 font-bold"
                      }`}
                    >
                      Confirm &amp; Open Workspace
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Full Manual Plan Matrix Editor */}
      {mode === "manual" && (
        <div className="mt-6 space-y-6">
          {/* Plan Settings Bar */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl border ${
              isLight ? "bg-slate-50 border-slate-200" : "bg-[#131b2e] border-slate-800"
            }`}
          >
            <div>
              <label
                className={`block text-xs font-medium mb-1 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}
              >
                Plan Name
              </label>
              <input
                type="text"
                value={plan.name}
                onChange={(e) => {
                  setPlan({ ...plan, name: e.target.value });
                  setValidationResult(null);
                }}
                className={`w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isLight
                    ? "bg-white border-slate-300 text-slate-900"
                    : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                }`}
              />
            </div>

            <div>
              <label
                className={`block text-xs font-medium mb-1 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}
              >
                Domain / Category
              </label>
              <input
                type="text"
                value={plan.domain || ""}
                onChange={(e) => {
                  setPlan({ ...plan, domain: e.target.value });
                  setValidationResult(null);
                }}
                className={`w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isLight
                    ? "bg-white border-slate-300 text-slate-900"
                    : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                }`}
              />
            </div>

            <div>
              <label
                className={`block text-xs font-medium mb-1 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}
              >
                Budget Limit (₹ INR)
              </label>
              <input
                type="number"
                value={plan.constraints.budgetLimit ?? ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setPlan({
                    ...plan,
                    constraints: { ...plan.constraints, budgetLimit: val },
                  });
                  setValidationResult(null);
                }}
                className={`w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isLight
                    ? "bg-white border-slate-300 text-slate-900"
                    : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                }`}
              />
            </div>

            <div>
              <label
                className={`block text-xs font-medium mb-1 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}
              >
                Deadline (Hours)
              </label>
              <input
                type="number"
                value={plan.constraints.deadlineHours ?? ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setPlan({
                    ...plan,
                    constraints: { ...plan.constraints, deadlineHours: val },
                  });
                  setValidationResult(null);
                }}
                className={`w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isLight
                    ? "bg-white border-slate-300 text-slate-900"
                    : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                }`}
              />
            </div>
          </div>

          {/* Tasks Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3
                className={`text-sm font-semibold ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                Tasks ({plan.tasks.length})
              </h3>
              <button
                onClick={handleAddManualTask}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                  isLight
                    ? "text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200"
                    : "text-teal-300 bg-teal-950/70 hover:bg-teal-900 border-teal-800/80"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
            </div>

            <div className="space-y-3">
              {plan.tasks.map((task, idx) => {
                const predecessors = plan.dependencies
                  .filter((d) => d.toTaskId === task.id)
                  .map((d) => d.fromTaskId);

                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-lg shadow-2xs space-y-3 border ${
                      isLight
                        ? "bg-white border-slate-200"
                        : "bg-[#131b2e] border-slate-800 text-slate-100"
                    }`}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-2">
                        <label
                          className={`text-[10px] uppercase font-semibold ${
                            isLight ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          ID
                        </label>
                        <input
                          type="text"
                          value={task.id}
                          onChange={(e) =>
                            handleUpdateManualTask(idx, { id: e.target.value })
                          }
                          className={`w-full text-xs p-1.5 border rounded font-mono font-semibold ${
                            isLight
                              ? "bg-white border-slate-300 text-slate-900"
                              : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                          }`}
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label
                          className={`text-[10px] uppercase font-semibold ${
                            isLight ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          Title
                        </label>
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) =>
                            handleUpdateManualTask(idx, { title: e.target.value })
                          }
                          className={`w-full text-xs p-1.5 border rounded font-medium ${
                            isLight
                              ? "bg-white border-slate-300 text-slate-900"
                              : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                          }`}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          className={`text-[10px] uppercase font-semibold ${
                            isLight ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          Cost (₹)
                        </label>
                        <input
                          type="number"
                          value={task.cost}
                          onChange={(e) =>
                            handleUpdateManualTask(idx, {
                              cost: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className={`w-full text-xs p-1.5 border rounded ${
                            isLight
                              ? "bg-white border-slate-300 text-slate-900"
                              : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                          }`}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          className={`text-[10px] uppercase font-semibold ${
                            isLight ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          Hours
                        </label>
                        <input
                          type="number"
                          value={task.durationHours}
                          onChange={(e) =>
                            handleUpdateManualTask(idx, {
                              durationHours: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            })
                          }
                          className={`w-full text-xs p-1.5 border rounded ${
                            isLight
                              ? "bg-white border-slate-300 text-slate-900"
                              : "bg-[#0a0f1d] border-slate-700 text-slate-100"
                          }`}
                        />
                      </div>

                      <div className="sm:col-span-1">
                        <label
                          className={`text-[10px] uppercase font-semibold ${
                            isLight ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          Policy
                        </label>
                        <select
                          value={task.policy}
                          onChange={(e) =>
                            handleUpdateManualTask(idx, {
                              policy: e.target.value as TaskPolicy,
                            })
                          }
                          className={`w-full text-xs p-1.5 border rounded ${
                            isLight
                              ? "border-slate-300 bg-white text-slate-900"
                              : "border-slate-700 bg-[#0a0f1d] text-slate-100"
                          }`}
                        >
                          <option value="fixed">Fixed</option>
                          <option value="flexible">Flexible</option>
                          <option value="optional">Optional</option>
                        </select>
                      </div>

                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          onClick={() => handleRemoveManualTask(task.id)}
                          disabled={plan.tasks.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Delete Task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Predecessors selection */}
                    <div
                      className={`pt-2 border-t flex flex-wrap items-center gap-1.5 ${
                        isLight ? "border-slate-100" : "border-slate-800"
                      }`}
                    >
                      <span
                        className={`text-[11px] font-medium mr-1 ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        Predecessors:
                      </span>
                      {plan.tasks
                        .filter((other) => other.id !== task.id)
                        .map((other) => {
                          const isPred = predecessors.includes(other.id);
                          return (
                            <button
                              key={other.id}
                              onClick={() =>
                                handleToggleManualPredecessor(task.id, other.id)
                              }
                              className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                                isPred
                                  ? isLight
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-teal-500 text-slate-950 font-bold border-teal-500"
                                  : isLight
                                  ? "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                              }`}
                            >
                              {other.id}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Validation Feedback & Final Actions */}
          <div
            className={`p-4 rounded-xl space-y-3 border ${
              isLight ? "bg-slate-50 border-slate-200" : "bg-[#131b2e] border-slate-800"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleValidateManual}
                  className={`px-4 py-2 text-xs font-semibold border rounded-lg shadow-2xs transition-colors ${
                    isLight
                      ? "text-slate-800 bg-white hover:bg-slate-100 border-slate-300"
                      : "text-slate-200 bg-slate-800 hover:bg-slate-700 border-slate-700"
                  }`}
                >
                  Validate &amp; Calculate Baseline
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const res = validateCustomPlan(plan);
                    setValidationResult(res);
                    if (res.isValid && res.plan) {
                      onLoadPlanToWorkspace(res.plan);
                    }
                  }}
                  disabled={!validationResult?.isValid}
                  className={`inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all ${
                    isLight
                      ? "text-white bg-blue-600 hover:bg-blue-700"
                      : "text-slate-950 bg-teal-400 hover:bg-teal-300 font-bold"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Open in Recovery Workspace
                </button>
              </div>
            </div>

            {/* Validation Result Messages */}
            {validationResult && (
              <div
                className={`mt-2 pt-2 border-t text-xs ${
                  isLight ? "border-slate-200" : "border-slate-800"
                }`}
              >
                {validationResult.isValid ? (
                  <div className="space-y-1">
                    <p
                      className={`font-medium flex items-center gap-1 ${
                        isLight ? "text-emerald-700" : "text-emerald-400"
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Plan is structurally valid! Projected duration:{" "}
                      {validationResult.schedule?.projectFinishHours}h, Slack:{" "}
                      {validationResult.schedule?.projectSlack}h
                    </p>
                    {!validationResult.isDomainVerified && (
                      <p
                        className={`flex items-center gap-1 ${
                          isLight ? "text-amber-700" : "text-amber-300"
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Domain &ldquo;{validationResult.domainName}&rdquo; is unverified.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 text-rose-500">
                    {validationResult.schemaErrors.map((e, idx) => (
                      <p key={idx} className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {e}
                      </p>
                    ))}
                    {validationResult.graphErrors.map((e, idx) => (
                      <p key={idx} className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
