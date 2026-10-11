"use client";

import React, { useState } from "react";
import type { Plan } from "../lib/schemas/plan.schema";
import type { Disruption } from "../lib/schemas/scenario.schema";
import type {
  InterpretationResult,
  ConversationMessage,
} from "../lib/ai/disruption-interpreter";
import type { RunRecoveryResult } from "../lib/engine/run-recovery";
import type { PreferenceProfileKey } from "../lib/schemas/ranking-policy.schema";
import { getCanonicalPlan, getCanonicalScenariosDoc } from "../data/load-demo-fixtures";
import { PlanOverview } from "./PlanOverview";
import { DisruptionInput, CANONICAL_EXAMPLE_PROMPTS } from "./DisruptionInput";
import { InterpretationReview } from "./InterpretationReview";
import { RecoveryComparison } from "./RecoveryComparison";
import { DiffViewer } from "./DiffViewer";
import { CustomPlanBuilder } from "./CustomPlanBuilder";
import { useTheme } from "../lib/theme-context";
import {
  ShieldAlert,
  Sparkles,
  Calendar,
  GitCompare,
  RotateCcw,
  CheckCircle2,
  Info,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  FileCode,
  Sliders,
  Sun,
  Moon,
} from "lucide-react";

type PlanMode = "demo" | "custom_builder" | "custom_active";

export function PlanPatchWorkspace() {
  const { theme, toggleTheme, isLight } = useTheme();
  const [demoBaseline] = useState<Plan>(() => getCanonicalPlan());
  const [customPlan, setCustomPlan] = useState<Plan | null>(null);

  // Active plan state
  const [planMode, setPlanMode] = useState<PlanMode>("demo");
  const [baselinePlan, setBaselinePlan] = useState<Plan>(() => getCanonicalPlan());
  const [activePlan, setActivePlan] = useState<Plan>(() => getCanonicalPlan());
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  // Workflow states
  const [activeScenarioId, setActiveScenarioId] = useState<string | undefined>();
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const [interpretationResult, setInterpretationResult] =
    useState<InterpretationResult | null>(null);

  const [isRunningRecovery, setIsRunningRecovery] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<RunRecoveryResult | null>(
    null
  );
  const [selectedProfile, setSelectedProfile] =
    useState<PreferenceProfileKey>("preserve_plan");
  const [selectedCandidateId, setSelectedCandidateId] = useState<
    string | null
  >(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Plan selection handlers
  const handleSelectDemoMode = () => {
    const canonical = getCanonicalPlan();
    setBaselinePlan(canonical);
    setActivePlan(canonical);
    setPlanMode("demo");
    setIsPreviewActive(false);
    setInterpretationResult(null);
    setConversationHistory([]);
    setRecoveryResult(null);
    setSelectedCandidateId(null);
    setActiveScenarioId(undefined);
    setGlobalError(null);
  };

  const handleOpenCustomBuilder = () => {
    setPlanMode("custom_builder");
    setInterpretationResult(null);
    setConversationHistory([]);
    setRecoveryResult(null);
    setGlobalError(null);
  };

  const handleSelectCustomActiveMode = () => {
    if (!customPlan) return;
    setBaselinePlan(customPlan);
    setActivePlan(customPlan);
    setPlanMode("custom_active");
    setIsPreviewActive(false);
    setInterpretationResult(null);
    setConversationHistory([]);
    setRecoveryResult(null);
    setSelectedCandidateId(null);
    setActiveScenarioId(undefined);
    setGlobalError(null);
  };

  const handleLoadCustomPlan = (newPlan: Plan) => {
    setCustomPlan(newPlan);
    setBaselinePlan(newPlan);
    setActivePlan(newPlan);
    setPlanMode("custom_active");
    setIsPreviewActive(false);
    setInterpretationResult(null);
    setConversationHistory([]);
    setRecoveryResult(null);
    setSelectedCandidateId(null);
    setActiveScenarioId(undefined);
    setGlobalError(null);
  };

  const handleCancelCustomBuilder = () => {
    if (customPlan) {
      setPlanMode("custom_active");
    } else {
      handleSelectDemoMode();
    }
  };

  const handleResetConversation = () => {
    setConversationHistory([]);
    setInterpretationResult(null);
    setRecoveryResult(null);
    setSelectedCandidateId(null);
    setActiveScenarioId(undefined);
    setGlobalError(null);
  };

  const [retryCount, setRetryCount] = useState<number>(0);

  // 1. Analyze prompt with Gemini interpreter via /api/interpret-disruption
  const handleAnalyzePrompt = async (
    prompt: string,
    scenarioId?: string,
    history?: ConversationMessage[]
  ) => {
    setIsInterpreting(true);
    setGlobalError(null);
    setRecoveryResult(null);
    setSelectedCandidateId(null);
    setActiveScenarioId(scenarioId);

    const activeHistory = history ?? conversationHistory;

    // Check if this matches an example card on the demo plan or custom plan
    const isDemo = planMode === "demo";
    const customExamples = !isDemo && baselinePlan ? [
      {
        scenarioId: "custom-task-unavailable",
        prompt: `Task ${baselinePlan.tasks.find((t) => t.policy !== "fixed")?.id ?? "T01"} (${baselinePlan.tasks.find((t) => t.policy !== "fixed")?.title ?? "Task"}) is no longer available.`,
        fallbackDisruption: {
          type: "task_unavailable" as const,
          targetTaskId: baselinePlan.tasks.find((t) => t.policy !== "fixed")?.id ?? "T01",
          field: "bookingStatus",
          newValue: "unavailable",
          description: `Task ${baselinePlan.tasks.find((t) => t.policy !== "fixed")?.id ?? "T01"} cancelled.`,
        },
        label: `Task ${baselinePlan.tasks.find((t) => t.policy !== "fixed")?.id ?? "T01"} Unavailable`,
      },
      {
        scenarioId: "custom-budget-cut",
        prompt: `Reduce our overall budget to ₹${Math.max(1000, Math.round((baselinePlan.constraints.budgetLimit ?? 50000) * 0.75))}.`,
        fallbackDisruption: {
          type: "budget_changed" as const,
          field: "budgetLimit",
          oldValue: baselinePlan.constraints.budgetLimit ?? 50000,
          newValue: Math.max(1000, Math.round((baselinePlan.constraints.budgetLimit ?? 50000) * 0.75)),
          description: `Budget reduced to ₹${Math.max(1000, Math.round((baselinePlan.constraints.budgetLimit ?? 50000) * 0.75))}.`,
        },
        label: "Budget Cut",
      },
      {
        scenarioId: "custom-deadline-shift",
        prompt: `The project deadline has moved to ${Math.max(10, Math.round((baselinePlan.constraints.deadlineHours ?? 100) * 0.8))} hours.`,
        fallbackDisruption: {
          type: "deadline_changed" as const,
          field: "deadlineHours",
          oldValue: baselinePlan.constraints.deadlineHours ?? 100,
          newValue: Math.max(10, Math.round((baselinePlan.constraints.deadlineHours ?? 100) * 0.8)),
          description: `Deadline tightened to ${Math.max(10, Math.round((baselinePlan.constraints.deadlineHours ?? 100) * 0.8))} hours.`,
        },
        label: "Deadline Shift",
      },
    ] : [];

    const activeCards = isDemo ? CANONICAL_EXAMPLE_PROMPTS : customExamples;
    const matchedCanonical = activeCards.find(
      (ex) =>
        (scenarioId && ex.scenarioId === scenarioId) ||
        ex.prompt.toLowerCase() === prompt.trim().toLowerCase() ||
        (isDemo &&
          ex.scenarioId === "S3-deadline-moved-earlier" &&
          prompt.trim().toLowerCase().includes("two days earlier")) ||
        (!isDemo &&
          ex.scenarioId === "custom-task-unavailable" &&
          prompt.toLowerCase().includes("no longer available"))
    );

    // Filter out active prompt from conversation history sent to the API
    // so Gemini does not receive the current prompt both as 'User Disruption Report' AND at the end of 'Prior Conversation History'
    const historyForApi =
      activeHistory.length > 0 &&
      activeHistory[activeHistory.length - 1].role === "user" &&
      activeHistory[activeHistory.length - 1].content === prompt
        ? activeHistory.slice(0, -1)
        : activeHistory;

    // Base history with deduplicated user turn (prevent appending user turn twice)
    const baseHistory: ConversationMessage[] =
      activeHistory.length > 0 &&
      activeHistory[activeHistory.length - 1].role === "user" &&
      activeHistory[activeHistory.length - 1].content === prompt
        ? [...activeHistory]
        : [...activeHistory, { role: "user", content: prompt }];

    try {
      const res = await fetch("/api/interpret-disruption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          plan: baselinePlan,
          conversationHistory: historyForApi,
        }),
      });

      const data = (await res.json()) as InterpretationResult;

      // If the API failed (quota, rate limit, timeout, 500, etc.)
      if (!res.ok || data.status === "error") {
        if (matchedCanonical) {
          // Automatic offline fallback ONLY for unambiguous built-in example cards
          setActiveScenarioId(matchedCanonical.scenarioId);
          setInterpretationResult({
            status: "success",
            disruption: matchedCanonical.fallbackDisruption,
            originalPrompt: prompt,
            reasoning: "Loaded from canonical offline scenario because Gemini was unavailable.",
            isOfflineFallback: true,
            offlineNotice: "Gemini is temporarily unavailable. Switched to the offline demo scenario.",
          });
          const newHistory: ConversationMessage[] = [
            ...baseHistory,
            {
              role: "assistant",
              content: `[Offline Demo Scenario]: Gemini was temporarily unavailable. Switched to canonical scenario (${matchedCanonical.label}).`,
            },
          ];
          setConversationHistory(newHistory.slice(-10));
          return;
        }

        // Custom inputs stay in the error state, preserve prompt, offer retry & manual/offline options
        setInterpretationResult(data);
        return;
      }

      setInterpretationResult(data);
      setRetryCount(0); // Reset retry count on success

      // Append turns to conversation history (bounded to 10)
      const newHistory: ConversationMessage[] = [...baseHistory];
      if (data.status === "success") {
        newHistory.push({
          role: "assistant",
          content: `Interpreted disruption: ${data.disruption.description} (${data.disruption.type})`,
        });
      } else if (data.status === "clarification_needed") {
        newHistory.push({
          role: "assistant",
          content: `Clarification needed: ${data.reason}`,
        });
      }
      setConversationHistory(newHistory.slice(-10));
    } catch (err: unknown) {
      if (matchedCanonical) {
        // Automatic offline fallback on network interruption for canonical examples
        setActiveScenarioId(matchedCanonical.scenarioId);
        setInterpretationResult({
          status: "success",
          disruption: matchedCanonical.fallbackDisruption,
          originalPrompt: prompt,
          reasoning: "Loaded from canonical offline scenario because Gemini was unavailable.",
          isOfflineFallback: true,
          offlineNotice: "Gemini is temporarily unavailable. Switched to the offline demo scenario.",
        });
        const newHistory: ConversationMessage[] = [
          ...baseHistory,
          {
            role: "assistant",
            content: `[Offline Demo Scenario]: Network connection interrupted. Switched to canonical scenario (${matchedCanonical.label}).`,
          },
        ];
        setConversationHistory(newHistory.slice(-10));
        return;
      }

      const msg =
        err instanceof Error ? err.message : "Failed to interpret disruption.";
      setInterpretationResult({
        status: "error",
        error: `Network or server failure: ${msg}`,
        userFriendlyMessage:
          "The AI request timed out or experienced a network connection problem. Please check your network and retry.",
        category: "NETWORK_OR_TIMEOUT",
        canRetry: true,
        originalPrompt: prompt,
      });
    } finally {
      setIsInterpreting(false);
    }
  };

  const handleRetryPrompt = async (originalPrompt: string) => {
    if (retryCount >= 3) {
      setGlobalError("Maximum retry attempts reached (3). Please modify your prompt or use pre-configured scenarios.");
      return;
    }
    setRetryCount((prev) => prev + 1);
    await handleAnalyzePrompt(originalPrompt, activeScenarioId, conversationHistory);
  };

  const handleSuggestionSelect = (suggestion: string) => {
    if (suggestion.includes("Venue Cancellation")) {
      const s1 = CANONICAL_EXAMPLE_PROMPTS.find((p) => p.scenarioId === "S1-venue-cancelled");
      if (s1) {
        handleDirectScenarioSelect(s1.scenarioId, s1.fallbackDisruption);
        return;
      }
    }
    if (suggestion.includes("Budget Cut")) {
      const s2 = CANONICAL_EXAMPLE_PROMPTS.find((p) => p.scenarioId === "S2-budget-cut");
      if (s2) {
        handleDirectScenarioSelect(s2.scenarioId, s2.fallbackDisruption);
        return;
      }
    }
    if (suggestion.includes("Deadline")) {
      const s3 = CANONICAL_EXAMPLE_PROMPTS.find((p) => p.scenarioId === "S3-deadline-moved-earlier");
      if (s3) {
        handleDirectScenarioSelect(s3.scenarioId, s3.fallbackDisruption);
        return;
      }
    }
    if (suggestion.includes("Unavailable offline")) {
      const targetTask = baselinePlan.tasks.find((t) => t.policy !== "fixed") || baselinePlan.tasks[0];
      handleDirectScenarioSelect("custom-task-unavailable", {
        type: "task_unavailable",
        targetTaskId: targetTask?.id ?? "T02",
        field: "bookingStatus",
        newValue: "unavailable",
        description: `Task ${targetTask?.id ?? "T02"} cancelled.`,
      });
      return;
    }
    if (suggestion.includes("Reduce Budget offline")) {
      const budgetLimit = baselinePlan.constraints.budgetLimit ?? 50000;
      const reducedBudget = Math.max(1000, Math.round(budgetLimit * 0.75));
      handleDirectScenarioSelect("custom-budget-cut", {
        type: "budget_changed",
        field: "budgetLimit",
        oldValue: budgetLimit,
        newValue: reducedBudget,
        description: `Budget reduced to ₹${reducedBudget}.`,
      });
      return;
    }
    if (suggestion.includes("Tighten Deadline offline")) {
      const deadlineHours = baselinePlan.constraints.deadlineHours ?? 100;
      const reducedDeadline = Math.max(10, Math.round(deadlineHours * 0.8));
      handleDirectScenarioSelect("custom-deadline-shift", {
        type: "deadline_changed",
        field: "deadlineHours",
        oldValue: deadlineHours,
        newValue: reducedDeadline,
        description: `Deadline tightened to ${reducedDeadline} hours.`,
      });
      return;
    }
    handleAnalyzePrompt(suggestion);
  };

  // 2. Direct canonical scenario select (offline quick load)
  const handleDirectScenarioSelect = (
    scenarioId: string,
    fallbackDisruption: Disruption
  ) => {
    setGlobalError(null);
    setRecoveryResult(null);
    setSelectedCandidateId(null);
    setActiveScenarioId(scenarioId);
    setInterpretationResult({
      status: "success",
      disruption: fallbackDisruption,
      originalPrompt: `Direct Scenario: ${scenarioId}`,
      reasoning: "Loaded from structured disruption fixture (offline path).",
    });
  };

  // Pre-load scenario or mode from URL query parameters (e.g. from Landing Page CTAs or Design Lab)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const modeQuery = searchParams.get("mode");
    if (modeQuery === "custom") {
      handleOpenCustomBuilder();
    } else if (modeQuery === "demo") {
      handleSelectDemoMode();
    }

    const scenarioQuery = searchParams.get("scenario");
    if (scenarioQuery) {
      const scenariosDoc = getCanonicalScenariosDoc();
      const matched = scenariosDoc.scenarios.find(
        (s: { id: string; title: string; disruption: Disruption }) =>
          s.id.toLowerCase() === scenarioQuery.toLowerCase() ||
          s.title.toLowerCase().includes(scenarioQuery.toLowerCase())
      );
      if (matched) {
        handleDirectScenarioSelect(matched.id, matched.disruption);
      }
    }
  }, []);

  // 3. Run Deterministic Recovery via /api/run-recovery
  const handleRunRecovery = async () => {
    if (!interpretationResult || interpretationResult.status !== "success") {
      return;
    }

    setIsRunningRecovery(true);
    setGlobalError(null);

    try {
      const res = await fetch("/api/run-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: planMode === "demo" ? activeScenarioId : undefined,
          disruption: interpretationResult.disruption,
          selectedProfile,
          plan: baselinePlan,
        }),
      });

      const data = (await res.json()) as RunRecoveryResult;
      if (!res.ok && !data.noWinnerReason && data.error) {
        setGlobalError(data.error);
      } else {
        setRecoveryResult(data);
        const winnerId =
          data.winners[selectedProfile]?.candidateId ??
          data.rankedCandidates[0]?.candidateId ??
          null;
        setSelectedCandidateId(winnerId);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to orchestrate recovery.";
      setGlobalError(`Recovery request failed: ${msg}`);
    } finally {
      setIsRunningRecovery(false);
    }
  };

  // 4. Change ranking profile
  const handleSelectProfile = (profile: PreferenceProfileKey) => {
    setSelectedProfile(profile);
    if (recoveryResult) {
      const newWinner = recoveryResult.winners[profile];
      if (newWinner) {
        setSelectedCandidateId(newWinner.candidateId);
      }
    }
  };

  // 5. Accept Patch preview into active plan
  const handleAcceptPreview = (candidatePlan: Plan) => {
    setActivePlan(candidatePlan);
    setIsPreviewActive(true);
  };

  // 6. Revert preview back to baseline
  const handleRevertPreview = () => {
    setActivePlan(baselinePlan);
    setIsPreviewActive(false);
  };

  // 7. Reset whole workspace flow
  const handleResetFlow = () => {
    setInterpretationResult(null);
    setRecoveryResult(null);
    setSelectedCandidateId(null);
    setActiveScenarioId(undefined);
    setGlobalError(null);
    setActivePlan(baselinePlan);
    setIsPreviewActive(false);
  };

  // Current candidate evaluation for diff viewing
  const activeCandidateEvaluation =
    recoveryResult && selectedCandidateId
      ? recoveryResult.evaluations.find(
          (e) => e.candidateId === selectedCandidateId
        )
      : undefined;

  const activeCandidatePatch =
    recoveryResult && selectedCandidateId
      ? recoveryResult.candidates.find((c) => c.id === selectedCandidateId)
      : undefined;

  return (
    <div className={`min-h-screen transition-colors duration-200 pb-16 ${isLight ? "bg-slate-50 text-slate-900" : "bg-[#070b12] text-slate-100"}`}>
      {/* Top Application Bar */}
      <header className={`border-b sticky top-0 z-30 transition-colors backdrop-blur-md ${isLight ? "bg-white/90 border-slate-200/90" : "bg-[#0c1120]/90 border-slate-800/90"}`}>
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-950 font-black text-lg tracking-wider shadow-sm transition-opacity group-hover:opacity-80" style={{ background: "linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)" }}>
                P
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className={`text-base font-bold tracking-tight transition-colors ${isLight ? "text-slate-900 group-hover:text-teal-700" : "text-white group-hover:text-teal-300"}`}>
                    PlanPatch
                  </h1>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${isLight ? "text-slate-500 bg-slate-100 border-slate-200" : "text-slate-400 bg-slate-800/80 border-slate-700"}`}>
                    Workspace
                  </span>
                </div>
                <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  Deterministic recovery engine &amp; AI disruption interpreter
                </p>
              </div>
            </a>
          </div>

          <div className="flex items-center gap-3">
            {isPreviewActive && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Preview Mode Active
              </span>
            )}

            {(interpretationResult || recoveryResult) && (
              <button
                type="button"
                onClick={handleResetFlow}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${isLight ? "text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70" : "text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700"}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Workspace
              </button>
            )}

            <a
              href="/design-lab"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition border ${isLight ? "text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-200/80" : "text-teal-300 bg-teal-950/60 hover:bg-teal-900/60 border-teal-800/80"}`}
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              Design Lab
            </a>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all hover:scale-105 active:scale-95 ${
                isLight
                  ? "border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50"
                  : "border-slate-800 bg-slate-900/90 text-slate-300 hover:border-slate-700 hover:text-white"
              }`}
            >
              {isLight ? (
                <Moon className="h-4 w-4 text-slate-700" />
              ) : (
                <Sun className="h-4 w-4 text-teal-400" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Plan-Selection Entry Point Navigation */}
      <div className={`border-b px-4 sm:px-6 lg:px-8 py-2.5 transition-colors ${isLight ? "bg-slate-50/80 border-slate-200/90" : "bg-[#090e18] border-slate-800/80"}`}>
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className={`flex flex-wrap items-center gap-1.5 p-1 rounded-xl border shadow-xs ${isLight ? "bg-white border-slate-200/80" : "bg-[#111827] border-slate-800"}`}>
            <button
              type="button"
              onClick={handleSelectDemoMode}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                planMode === "demo"
                  ? isLight ? "bg-slate-900 text-white shadow-xs" : "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-xs"
                  : isLight ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Calendar
                className={`w-3.5 h-3.5 ${
                  planMode === "demo" ? "text-teal-400" : "text-slate-400"
                }`}
              />
              <span>Open Demo Plan</span>
              {planMode === "demo" && (
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-teal-400/20 text-teal-300 border border-teal-400/30">
                  Active
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenCustomBuilder}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                planMode === "custom_builder"
                  ? isLight ? "bg-slate-900 text-white shadow-xs" : "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-xs"
                  : isLight ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${
                  planMode === "custom_builder" ? "text-teal-400" : "text-slate-400"
                }`}
              />
              <span>Create Your Own Plan</span>
              {planMode === "custom_builder" && (
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-teal-400/20 text-teal-300 border border-teal-400/30">
                  Designer
                </span>
              )}
            </button>

            {customPlan && (
              <button
                type="button"
                onClick={handleSelectCustomActiveMode}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  planMode === "custom_active"
                    ? isLight ? "bg-slate-900 text-white shadow-xs" : "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-xs"
                    : isLight ? "text-teal-700 hover:text-teal-900 hover:bg-teal-50" : "text-teal-400 hover:text-teal-200 hover:bg-teal-950/40"
                }`}
              >
                <Layers
                  className={`w-3.5 h-3.5 ${
                    planMode === "custom_active" ? "text-teal-400" : "text-teal-600"
                  }`}
                />
                <span>Active Custom Plan: {customPlan.name}</span>
                {planMode === "custom_active" && (
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-teal-400/20 text-teal-300 border border-teal-400/30">
                    Active
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {planMode === "demo" ? (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${isLight ? "border-teal-500/30 bg-teal-50 text-teal-800" : "border-teal-500/30 bg-teal-950/50 text-teal-300"}`}>
                <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
                Campus Tech Fest Demo Fixture
              </span>
            ) : planMode === "custom_builder" ? (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${isLight ? "border-teal-500/30 bg-teal-50 text-teal-800" : "border-teal-500/30 bg-teal-950/50 text-teal-300"}`}>
                <Sparkles className="w-3.5 h-3.5 text-teal-500" />
                Plan Designer Mode (AI &amp; Manual)
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${isLight ? "border-teal-500/30 bg-teal-50 text-teal-800" : "border-teal-500/30 bg-teal-950/50 text-teal-300"}`}>
                <Layers className="w-3.5 h-3.5 text-teal-500" />
                Custom Plan Active: {customPlan?.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <main className="w-full max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6 min-w-0">
        {/* Global Error Banner */}
        {globalError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Operational Error:</strong> {globalError}
            </div>
          </div>
        )}

        {/* Custom Plan Designer Mode */}
        {planMode === "custom_builder" ? (
          <CustomPlanBuilder
            onLoadPlanToWorkspace={handleLoadCustomPlan}
            onCancel={handleCancelCustomBuilder}
          />
        ) : (
          <>
            {/* Preview Mode Callout Banner */}
            {isPreviewActive && (
              <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    <strong>Workspace Previewing Candidate Patch:</strong> Baseline metrics above
                    reflect proposed overrides. No persistent database state was modified.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRevertPreview}
                  className="text-xs font-semibold text-emerald-800 hover:underline flex-shrink-0"
                >
                  Revert to Baseline
                </button>
              </div>
            )}

            {/* 1. Baseline Plan Overview */}
            <PlanOverview plan={activePlan} />

            {/* 2. Disruption Input Form / Conversational Recovery Assistant */}
            <DisruptionInput
              onAnalyzePrompt={handleAnalyzePrompt}
              onDirectScenarioSelect={handleDirectScenarioSelect}
              isInterpreting={isInterpreting}
              plan={activePlan}
              isDemoPlan={planMode === "demo"}
              latestInterpretationResult={interpretationResult}
              conversationHistory={conversationHistory}
              onResetConversation={handleResetConversation}
            />

            {/* 3. Disruption Interpretation Review (User Confirmation Gate) */}
            {interpretationResult && (
              <InterpretationReview
                result={interpretationResult}
                plan={baselinePlan}
                onConfirm={handleRunRecovery}
                onCancel={() => setInterpretationResult(null)}
                isRunningRecovery={isRunningRecovery}
                onSelectSuggestion={handleSuggestionSelect}
                onRetry={handleRetryPrompt}
              />
            )}

            {/* 4. Recovery Comparison & Profile Switcher */}
            {recoveryResult && (
              <RecoveryComparison
                recoveryResult={recoveryResult}
                selectedProfile={selectedProfile}
                onSelectProfile={handleSelectProfile}
                selectedCandidateId={selectedCandidateId}
                onSelectCandidate={(id) => setSelectedCandidateId(id)}
              />
            )}

            {/* 5. Diff & Impact Inspector */}
            {recoveryResult && activeCandidateEvaluation && (
              <DiffViewer
                baselinePlan={baselinePlan}
                candidateEvaluation={activeCandidateEvaluation}
                candidatePatch={activeCandidatePatch}
                isPreviewActive={isPreviewActive}
                onAcceptPreview={handleAcceptPreview}
                onRevertPreview={handleRevertPreview}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className={`max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-6 border-t text-xs flex flex-col sm:flex-row items-center justify-between gap-3 ${isLight ? "border-slate-200 text-slate-500" : "border-slate-800 text-slate-400"}`}>
        <div>
          <strong>PlanPatch</strong> &bull; Change-aware planning and deterministic plan recovery
          workspace.
        </div>
        <div className={`flex items-center gap-4 text-[11px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
          <span>AI Interpretation (Gemini Flash)</span>
          <span>&bull;</span>
          <span>Exact Topological Graph Scheduling</span>
          <span>&bull;</span>
          <span>Pareto Multi-Objective Analysis</span>
        </div>
      </footer>
    </div>
  );
}
