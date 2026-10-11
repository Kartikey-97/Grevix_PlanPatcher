export interface TimelineTaskItem {
  id: string;
  title: string;
  start: number;
  finish: number;
  duration: number;
  isCritical: boolean;
  status?: "normal" | "disrupted" | "affected" | "modified" | "shifted" | "compressed";
}

export interface HybridShowcaseScenario {
  id: string; // e.g. "S1-venue-cancelled"
  name: string;
  tabLabel: string;
  icon: string;

  // The Disruption
  disruption: {
    title: string;
    description: string;
    targetTaskId: string;
    affectedTasksCount: number;
    violatedConstraintTitle: string;
    violatedConstraintDetail: string;
  };

  // Baseline (Before)
  baseline: {
    totalCost: number;
    budgetLimit: number;
    finishHours: number;
    deadlineHours: number;
    slackHours: number;
    isFeasible: boolean;
    brokenReason: string;
    timelineTasks: TimelineTaskItem[];
  };

  // Proposed Recovery (After)
  recovery: {
    candidateId: string;
    recommendedAction: string;
    reason: string;

    // Separate & accurate claims (Requirement 6)
    feasibilityStatus: "feasible" | "provisionally_feasible" | "infeasible";
    feasibilityLabel: string;
    paretoStatus: "on_frontier" | "dominated";
    paretoLabel: string;
    verificationStatus: "verified" | "provisional";
    verificationLabel: string;
    unverifiedFacts: string[];

    // At most 3 key metrics tailored to this disruption (Requirement 2)
    keyMetrics: {
      label: string;
      value: string;
      deltaText: string;
      deltaType: "positive" | "neutral" | "negative";
      subtext: string;
    }[];

    // Non-redundant data-driven outcomes (Requirement 4)
    distinctOutcomes: string[];

    // Recovery Timeline diff (Requirement 3)
    recoveryTimelineTasks: TimelineTaskItem[];
    newFinishHours: number;
    finishDeltaHours: number;
    newDeadlineSlackHours: number;

    // Detailed Evidence for Progressive Disclosure (Requirement 7)
    detailedEvidence: {
      objectiveScores: {
        profileName: string;
        score: number;
        isWinner: boolean;
      }[];
      changeFootprint: string;
      lostTaskValue: string;
      constraintAudit: {
        budgetPass: boolean;
        deadlinePass: boolean;
        capacityPass: boolean;
        accessibilityPass: boolean;
        fixedTasksPreserved: boolean;
        acyclic: boolean;
      };
      unverifiedFactsDetail: string[];
      taskDiffs: {
        taskId: string;
        title: string;
        action: "relocated" | "shifted" | "compressed" | "trimmed" | "modified";
        description: string;
      }[];
    };
  };
}

export const HYBRID_SCENARIOS_DATA: HybridShowcaseScenario[] = [
  {
    id: "S1-venue-cancelled",
    name: "Venue Cancelled",
    tabLabel: "Venue Cancelled",
    icon: "🏛️",
    disruption: {
      title: "Venue Booking Revoked at Hour 14",
      description: "The primary auditorium cancelled reservation. Anchor location lost for all downstream activities.",
      targetTaskId: "T03",
      affectedTasksCount: 9,
      violatedConstraintTitle: "Venue Availability Failed",
      violatedConstraintDetail: "bookingStatus: unavailable · 9 downstream tasks blocked",
    },
    baseline: {
      totalCost: 18000,
      budgetLimit: 25000,
      finishHours: 132.0,
      deadlineHours: 288,
      slackHours: 156.0,
      isFeasible: false,
      brokenReason: "T03 booking status revoked; 9 downstream tasks cannot start without a confirmed venue.",
      timelineTasks: [
        { id: "T01-T02", title: "Goals & Date", start: 0, finish: 6, duration: 6, isCritical: true, status: "normal" },
        { id: "T03", title: "Book Venue", start: 6, finish: 30, duration: 24, isCritical: true, status: "disrupted" },
        { id: "T05", title: "Marketing Blitz", start: 30, finish: 110, duration: 80, isCritical: true, status: "affected" },
        { id: "T07", title: "Catering", start: 110, finish: 118, duration: 8, isCritical: true, status: "affected" },
        { id: "T14-T15", title: "Dry Run & Event", start: 118, finish: 132, duration: 14, isCritical: true, status: "affected" },
      ],
    },
    recovery: {
      candidateId: "S1-A-community-hall",
      recommendedAction: "Relocate to Community Hall",
      reason: "Preserves the single-session event format and all 16 tasks. Trades an additional ₹2,000 venue fee and a 2-hour schedule shift for zero scope loss.",
      feasibilityStatus: "feasible",
      feasibilityLabel: "Hard Constraints Pass",
      paretoStatus: "on_frontier",
      paretoLabel: "Pareto Frontier (Non-Dominated)",
      verificationStatus: "provisional",
      verificationLabel: "Provisional Verification",
      unverifiedFacts: [
        "venue_availability: Community Hall reservation must be confirmed with facilities office before payment.",
      ],
      keyMetrics: [
        {
          label: "Projected Cost",
          value: "₹20,000",
          deltaText: "+₹2,000",
          deltaType: "negative",
          subtext: "₹5,000 margin under ₹25k cap",
        },
        {
          label: "Earliest Finish",
          value: "134.0h",
          deltaText: "+2.0h shift",
          deltaType: "neutral",
          subtext: "154.0h slack before 288h deadline",
        },
        {
          label: "Scope Preserved",
          value: "16 of 16",
          deltaText: "0 tasks lost",
          deltaType: "positive",
          subtext: "3 tasks modified, 0 cancelled",
        },
      ],
      distinctOutcomes: [
        "16 of 16 tasks preserved with zero priority loss",
        "₹5,000 buffer remaining below ₹25,000 budget cap",
        "Single-session format maintained without splitting rooms",
      ],
      recoveryTimelineTasks: [
        { id: "T01-T02", title: "Goals & Date", start: 0, finish: 6, duration: 6, isCritical: true, status: "normal" },
        { id: "T03", title: "Community Hall", start: 6, finish: 32, duration: 26, isCritical: true, status: "modified" },
        { id: "T05", title: "Marketing Blitz", start: 32, finish: 112, duration: 80, isCritical: true, status: "shifted" },
        { id: "T07", title: "Banquet Catering", start: 112, finish: 120, duration: 8, isCritical: true, status: "shifted" },
        { id: "T14-T15", title: "Dry Run & Event", start: 120, finish: 134, duration: 14, isCritical: true, status: "shifted" },
      ],
      newFinishHours: 134.0,
      finishDeltaHours: 2.0,
      newDeadlineSlackHours: 154.0,
      detailedEvidence: {
        objectiveScores: [
          { profileName: "Preserve Plan (Quality-First)", score: 0.2452, isWinner: true },
          { profileName: "Protect Deadline", score: 0.2452, isWinner: true },
          { profileName: "Minimize Spending (Cost-First)", score: 0.3200, isWinner: false },
        ],
        changeFootprint: "0.1875 (3 of 16 tasks modified: T03, T07, T08)",
        lostTaskValue: "0.0 (0 priority lost across all 64 priority points)",
        constraintAudit: {
          budgetPass: true,
          deadlinePass: true,
          capacityPass: true,
          accessibilityPass: true,
          fixedTasksPreserved: true,
          acyclic: true,
        },
        unverifiedFactsDetail: [
          "venue_availability: Demo Community Hall availability is unconfirmed in live booking system. Requires manual facilities desk sign-off.",
        ],
        taskDiffs: [
          { taskId: "T03", title: "Book venue", action: "relocated", description: "Relocated to Community Hall. Cost: ₹7,000 (+$2,000), duration: 26h (+2h setup)." },
          { taskId: "T07", title: "Book catering", action: "modified", description: "Seating updated to banquet-layout-100 to match Community Hall layout." },
          { taskId: "T08", title: "Design posters & swag", action: "modified", description: "Directions and promo banners updated with Community Hall address." },
          { taskId: "T05..T15", title: "Downstream Tasks", action: "shifted", description: "Earliest start shifted +2.0 hours due to T03 extended setup window." },
        ],
      },
    },
  },
  {
    id: "S2-budget-cut",
    name: "Budget Slashed to ₹16,000",
    tabLabel: "Budget Cut to ₹16k",
    icon: "💰",
    disruption: {
      title: "Sponsor Funding Cut by ₹9,000",
      description: "Project budget limit lowered from ₹25,000 to ₹16,000. Current plan cost exceeds the new ceiling.",
      targetTaskId: "T08",
      affectedTasksCount: 5,
      violatedConstraintTitle: "Budget Limit Violated",
      violatedConstraintDetail: "Cost ₹18,000 > ₹16,000 limit (₹2,000 deficit)",
    },
    baseline: {
      totalCost: 18000,
      budgetLimit: 16000,
      finishHours: 132.0,
      deadlineHours: 288,
      slackHours: 156.0,
      isFeasible: false,
      brokenReason: "Baseline cost of ₹18,000 violates the new ₹16,000 budget limit by ₹2,000. Plan is legally unexecutable.",
      timelineTasks: [
        { id: "T01-T02", title: "Goals & Date", start: 0, finish: 6, duration: 6, isCritical: true, status: "normal" },
        { id: "T03", title: "Venue (₹5,000)", start: 6, finish: 30, duration: 24, isCritical: true, status: "normal" },
        { id: "T05", title: "Marketing Blitz", start: 30, finish: 110, duration: 80, isCritical: true, status: "normal" },
        { id: "T06-T08", title: "AV & Swag (₹5,500)", start: 30, finish: 42, duration: 12, isCritical: false, status: "disrupted" },
        { id: "T14-T15", title: "Dry Run & Event", start: 118, finish: 132, duration: 14, isCritical: true, status: "normal" },
      ],
    },
    recovery: {
      candidateId: "S2-A-lecture-hall-lean",
      recommendedAction: "Lecture Hall with Lean Logistics",
      reason: "Recovers budget compliance without shifting the 132h project completion time. Cuts venue fee and trims swag and equipment rentals.",
      feasibilityStatus: "feasible",
      feasibilityLabel: "Hard Constraints Pass",
      paretoStatus: "on_frontier",
      paretoLabel: "Pareto Frontier (Non-Dominated)",
      verificationStatus: "provisional",
      verificationLabel: "Provisional Verification",
      unverifiedFacts: [
        "venue_availability: Lecture hall reservation must be confirmed with department administration.",
      ],
      keyMetrics: [
        {
          label: "Projected Cost",
          value: "₹15,700",
          deltaText: "-₹2,300 saved",
          deltaType: "positive",
          subtext: "₹300 margin under new ₹16k cap",
        },
        {
          label: "Earliest Finish",
          value: "132.0h",
          deltaText: "0.0h (Unchanged)",
          deltaType: "positive",
          subtext: "Baseline timeline 100% preserved",
        },
        {
          label: "Tasks Economized",
          value: "5 of 16",
          deltaText: "0 tasks dropped",
          deltaType: "positive",
          subtext: "All 16 tasks delivered with lean scope",
        },
      ],
      distinctOutcomes: [
        "₹2,300 net savings recovers legal feasibility under ₹16,000 cap",
        "Zero schedule movement: finishes on original 132.0h target",
        "All 16 tasks delivered with lean catering and in-house AV",
      ],
      recoveryTimelineTasks: [
        { id: "T01-T02", title: "Goals & Date", start: 0, finish: 6, duration: 6, isCritical: true, status: "normal" },
        { id: "T03", title: "Lecture Hall (₹3.5k)", start: 6, finish: 30, duration: 24, isCritical: true, status: "modified" },
        { id: "T05", title: "Marketing Blitz", start: 30, finish: 110, duration: 80, isCritical: true, status: "normal" },
        { id: "T06-T08", title: "Lean AV & Swag", start: 30, finish: 42, duration: 12, isCritical: false, status: "modified" },
        { id: "T14-T15", title: "Dry Run & Event", start: 118, finish: 132, duration: 14, isCritical: true, status: "normal" },
      ],
      newFinishHours: 132.0,
      finishDeltaHours: 0.0,
      newDeadlineSlackHours: 156.0,
      detailedEvidence: {
        objectiveScores: [
          { profileName: "Preserve Plan (Default)", score: 0.3100, isWinner: true },
          { profileName: "Protect Deadline", score: 0.1650, isWinner: true },
          { profileName: "Minimize Spending", score: 0.7281, isWinner: false },
        ],
        changeFootprint: "0.3125 (5 of 16 tasks modified: T03, T06, T07, T08, T12)",
        lostTaskValue: "0.0 (All 16 tasks retained with modified specs)",
        constraintAudit: {
          budgetPass: true,
          deadlinePass: true,
          capacityPass: true,
          accessibilityPass: true,
          fixedTasksPreserved: true,
          acyclic: true,
        },
        unverifiedFactsDetail: [
          "venue_availability: Lecture Hall booking availability is unconfirmed in department ledger.",
        ],
        taskDiffs: [
          { taskId: "T03", title: "Book venue", action: "relocated", description: "Substituted with Campus Lecture Hall. Fee: ₹3,500 vs ₹5,000 (-₹1,500)." },
          { taskId: "T06", title: "Rent AV equipment", action: "trimmed", description: "Internal department AV used instead of external vendor. Cost: ₹2,500 vs ₹4,000 (-₹1,500)." },
          { taskId: "T07", title: "Book catering", action: "trimmed", description: "Catering scaled down to refreshments. Cost: ₹2,800 vs ₹3,500 (-₹700)." },
          { taskId: "T08", title: "Design posters & swag", action: "trimmed", description: "Digital badges and essential posters only. Cost: ₹1,000 vs ₹1,500 (-₹500)." },
          { taskId: "T12", title: "Distribute materials", action: "trimmed", description: "Digital-first distribution. Cost: ₹400 vs ₹500 (-₹100)." },
        ],
      },
    },
  },
  {
    id: "S3-deadline-moved-earlier",
    name: "Deadline Tightened to 120h",
    tabLabel: "Deadline Moved to 120h",
    icon: "⏱️",
    disruption: {
      title: "Keynote Speaker Requires Hour 120 Readiness",
      description: "Event preparation must complete 12 hours earlier than the baseline 132-hour finish.",
      targetTaskId: "T05",
      affectedTasksCount: 6,
      violatedConstraintTitle: "Deadline Overrun Violated",
      violatedConstraintDetail: "Finish 132.0h > 120.0h deadline (12-hour overrun)",
    },
    baseline: {
      totalCost: 18000,
      budgetLimit: 25000,
      finishHours: 132.0,
      deadlineHours: 120,
      slackHours: -12.0,
      isFeasible: false,
      brokenReason: "Baseline finish at 132.0h exceeds the tightened 120h deadline by 12 hours. Critical path overrun.",
      timelineTasks: [
        { id: "T01-T02", title: "Goals & Date", start: 0, finish: 6, duration: 6, isCritical: true, status: "normal" },
        { id: "T03", title: "Book Venue", start: 6, finish: 30, duration: 24, isCritical: true, status: "normal" },
        { id: "T05", title: "Marketing (80h)", start: 30, finish: 110, duration: 80, isCritical: true, status: "normal" },
        { id: "T07", title: "Catering", start: 110, finish: 118, duration: 8, isCritical: true, status: "normal" },
        { id: "T14-T15", title: "Dry Run & Event", start: 118, finish: 132, duration: 14, isCritical: true, status: "disrupted" },
      ],
    },
    recovery: {
      candidateId: "S3-A-early-registration-close",
      recommendedAction: "Fast-Track Registration Window",
      reason: "Compresses marketing/registration window (T05) from 80h to 64h. Pulls project finish 16 hours earlier to beat the 120h deadline with zero added expense.",
      feasibilityStatus: "feasible",
      feasibilityLabel: "Hard Constraints Pass",
      paretoStatus: "on_frontier",
      paretoLabel: "Pareto Frontier (Non-Dominated)",
      verificationStatus: "provisional",
      verificationLabel: "Provisional Verification",
      unverifiedFacts: [
        "100_attendees_reachable_with_shorter_registration_window: Requires marketing team sign-off that 64h window reaches 100 students.",
      ],
      keyMetrics: [
        {
          label: "Earliest Finish",
          value: "116.0h",
          deltaText: "-16.0h earlier",
          deltaType: "positive",
          subtext: "4.0h buffer before 120h deadline",
        },
        {
          label: "Projected Cost",
          value: "₹18,000",
          deltaText: "₹0 delta",
          deltaType: "neutral",
          subtext: "₹7,000 budget margin under ₹25k",
        },
        {
          label: "Tasks Modified",
          value: "1 of 16",
          deltaText: "Minimal footprint",
          deltaType: "positive",
          subtext: "Only T05 duration compressed",
        },
      ],
      distinctOutcomes: [
        "Delivers 4 hours ahead of strict 120h deadline",
        "Zero budget increase: costs unchanged at ₹18,000",
        "Only 1 task modified: minimal disruption footprint (E = 0.0625)",
      ],
      recoveryTimelineTasks: [
        { id: "T01-T02", title: "Goals & Date", start: 0, finish: 6, duration: 6, isCritical: true, status: "normal" },
        { id: "T03", title: "Book Venue", start: 6, finish: 30, duration: 24, isCritical: true, status: "normal" },
        { id: "T05", title: "Fast Marketing (64h)", start: 30, finish: 94, duration: 64, isCritical: true, status: "compressed" },
        { id: "T07", title: "Catering", start: 94, finish: 102, duration: 8, isCritical: true, status: "shifted" },
        { id: "T14-T15", title: "Dry Run & Event", start: 102, finish: 116, duration: 14, isCritical: true, status: "shifted" },
      ],
      newFinishHours: 116.0,
      finishDeltaHours: -16.0,
      newDeadlineSlackHours: 4.0,
      detailedEvidence: {
        objectiveScores: [
          { profileName: "Preserve Plan (Default)", score: 0.3253, isWinner: true },
          { profileName: "Minimize Spending", score: 0.5678, isWinner: true },
          { profileName: "Protect Deadline", score: 0.5764, isWinner: false },
        ],
        changeFootprint: "0.0625 (1 of 16 tasks modified: T05)",
        lostTaskValue: "0.0 (All 16 tasks preserved)",
        constraintAudit: {
          budgetPass: true,
          deadlinePass: true,
          capacityPass: true,
          accessibilityPass: true,
          fixedTasksPreserved: true,
          acyclic: true,
        },
        unverifiedFactsDetail: [
          "100_attendees_reachable_with_shorter_registration_window: Promotional outreach must be intensified to secure 100 registrations in 64h instead of 80h.",
        ],
        taskDiffs: [
          { taskId: "T05", title: "Conduct marketing & registrations", action: "compressed", description: "Duration compressed from 80h to 64h (-16h) by doubling parallel campaign posts." },
          { taskId: "T07, T12..T15", title: "Downstream Staging Tasks", action: "shifted", description: "Start times advanced by 16.0 hours, completing the entire event at Hour 116.0." },
        ],
      },
    },
  },
];
