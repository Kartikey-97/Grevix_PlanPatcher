# Challenge Card 2: Real-World Feedback Log

## Mission Overview
**GREVIX Challenge Card 2 — Real-World Feedback Mission**
> 1. Share your project demo, screenshots, or explanation on LinkedIn/Reddit and tag GREVIX. Alternatively, share it in your college or community groups.
> 2. Collect screenshots of genuine feedback.
> 3. Implement at least one improvement based on the feedback.
> 4. Upload the proof, feedback screenshots, and a brief note explaining the changes to your GitHub repository under a `/feedback` folder or in your README.
>
> *Important: Keep all feedback authentic. Fake reviews or fabricated conversations will not be accepted.*
>
> *Build. Share. Listen. Improve. 🔥 — Team GREVIX*

---

## 1. Authentic Feedback Received
- **Tester / Reviewer:** Kshiraj K (Peer Developer & Community Tester)
- **Proof Screenshot:** [`feedback(grevix).jpeg`](./feedback(grevix).jpeg) (stored locally in `/feedback/`)
- **Channel:** Direct Peer Testing & Community Review (WhatsApp)
- **Direct Feedback Quotes:**
  1. *"Hi, I saw your project PlanPatch and the dark mode still has the light mode components in it."*
  2. *"And I tried using the demo and the timeline wasn't forming properly"*
  3. *"bruh... it never asked me the destination ... it made a plan but for what...?"*

---

## 2. Problem Analysis & Root Causes

### Problem A: Timeline Chart Visualization Faults (`PlanTimeline.tsx`)
1. **Squashed Horizon Scale:** The timeline horizontal axis was locked to the total deadline horizon ($288\text{ hours}$), which squished all active tasks (finishing at $132\text{ hours}$) into less than $45\%$ of the available viewport width, leaving more than half the chart as empty unused space on the right.
2. **Task Title Truncation:** The left task label column had a fixed width of only $180\text{px}$, causing titles like `"T06 Arrange AV equipment and technical support"` to clip aggressively into `"T06 Arrange AV equipm..."`.
3. **Bar Duration Ellipsis Clipping:** Short task bars (e.g. 8-hour tasks) had a narrow $24\text{px}$ minimum width. Combined with `overflow-hidden text-ellipsis`, numbers like `"8h"` were rendering as truncated `"8.."`.
4. **Suboptimal Topological Cascade:** Tasks were rendered purely by array index rather than sorted along their earliest start time and critical path precedence, preventing the visual waterfall from showing dependencies clearly.

### Problem B: Incomplete Dark Mode Theme Propagation
1. **Light Component Leakage:** While the landing page featured a dark editorial aesthetic, several workspace components (`DiffViewer`, `CustomPlanBuilder`, `PlanOverview`, `DisruptionInput`, `RecoveryComparison`, `InterpretationReview`) maintained hardcoded light surfaces (`bg-white`, `border-slate-200`, `text-slate-900`), creating jarring high-contrast white boxes inside dark mode.
2. **Timeline Visual Disconnect:** In dark mode, the timeline grid, axes, headers, and inspector panels remained stark white.

### Problem C: Ungrounded Intent & Missing Entity Guidance in Plan Generation
1. **Ungrounded Travel Prompts:** When a user entered a prompt like *"I want to plan a vacation"* without naming a destination city, standard generative models hallucinate fake destinations (e.g. Paris or Goa).
2. **Missing Discovery Stage:** Without an explicit Travel domain fallback, PlanPatch mapped ungrounded requests to generic software/event steps or drafted tasks without clearly flagging why the destination was unconfirmed.
3. **Provenance Blindspot:** Users were not informed that PlanPatch purposefully does *not* invent real-world locations, leading to confusion (*"it made a plan but for what...?"*).

---

## 3. Technical Improvements Implemented

### Improvement 1: Complete Redesign of Demo Timeline (`src/components/plan/PlanTimeline.tsx`)
- **Dynamic Horizon Modes:** Implemented an interactive view toggle:
  - **Fit Work (`152h`):** Zooms into the active project schedule with a comfortable 15% breathing room, doubling task bar widths and clarity.
  - **Project Deadline (`288h`):** Lets users inspect total project slack relative to the absolute hard deadline.
- **Sidebar Widened to 260px:** Expanded the task identification sidebar from $180\text{px}$ to $260\text{px}$, preventing title truncation and adding clean hover states.
- **Duration Label Visibility:** Increased bar minimum width to $34\text{px}$ and styled duration labels with `font-mono text-[11px] font-bold whitespace-nowrap overflow-visible` so labels like `8h`, `12h`, and `16h` never render with ellipses.
- **Waterfall Topological Ordering:** Enhanced sorting algorithm to cascade by `earliestStart` first, prioritizing critical-path tasks (`isCritical`) to clearly expose dependency sequences.
- **Full Dark Mode Canvas:** Styled timeline headers, gridlines, axis ticks, task bar pills, dependencies lines, and task inspection drawers with deep dark tokens (`bg-[#0d1322]`, `bg-[#131b2e]`, `border-slate-800`, `text-slate-100`).

### Improvement 2: Universal Dark Mode Across the Entire Workspace
- **`PlanOverview.tsx`:** Themed metric cards, KPI counters, and task schedule tables to dark surfaces (`#0d1322` and `#131b2e`).
- **`DisruptionInput.tsx`:** Themed multi-turn conversation bubbles, suggestion chips, and disruption prompt inputs.
- **`RecoveryComparison.tsx`:** Themed trade-off profiles, Pareto frontier candidate cards, and winner spotlight modules.
- **`DiffViewer.tsx`:** Added `useTheme()` hook; styled comparison metric cards, candidate selector tags, schedule diffs, and task modification tables.
- **`CustomPlanBuilder.tsx`:** Added `useTheme()` hook; styled the AI Guided prompt box, Software Template cards, provenance tags, and full manual matrix table editor.
- **`InterpretationReview.tsx`:** Themed parameter extraction cards and confirmation dialogs.

### Improvement 3: Anti-Hallucination Entity Guard & Missing Destination Provenance
- **Never Hallucinate Locations:** Enforced in `DRAFT_PLAN_SYSTEM_INSTRUCTION` (Rule 13) that PlanPatch must never invent unstated real-world locations or venues.
- **Dedicated Travel Domain Fallback:** Added a structured 5-stage travel pipeline (`Destination & Travel Dates Selection`, `Transit Booking`, `Lodging Booking`, `Daily Activities`, `Packing & Prep`) where transit and lodging depend strictly on confirming the destination first in T01.
- **Honest Provenance Alerts:** Highlighted missing destinations and unstated constraints prominently in an amber alert box on the review screen (`Actionable Missing Information`).
- **Interactive Vacation Chip & Input Tip:** Added a 1-click `Vacation / Travel Trip` prompt chip and input guidance helping users supply specific destination parameters upfront.

---

## 5. Challenge 3: Reliability, Recovery Alternatives & Quota Protection

### Reported Tester Feedback
1. **Raw Gemini Quota Errors:** Clicking "Analyze Change" on built-in example prompts produced raw Gemini quota/high-demand errors instead of friendly notices.
2. **"Retry request" Button Bug:** The retry action sent its own button label (`"Retry request"`) as the disruption prompt instead of resubmitting the original user input.
3. **No Feasible Recovery Winner Found on Custom Cooking Plan:** Generating a cooking plan and testing disruptions resulted in "No Feasible Recovery Winner Found" because draft plans lacked useful declared alternatives.
4. **Misleading Deadline Wording:** The example card stated "Deadline moved 2 days earlier" while changing the deadline from 288h to 120h (which is 168h = 7 days earlier).
5. **Lack of Server-Side Rate Limiting:** The Gemini API endpoints lacked server-side rate limiting and input size bounding.

### Implementations & Improvements
- **Typed Safe Error Handling & Client Rendering (`src/lib/server/rate-limiter.ts`, `src/lib/ai/disruption-interpreter.ts`, `src/components/InterpretationReview.tsx`):**
  - Errors are safely categorized (`RATE_LIMIT_OR_OVERLOAD`, `AUTH_OR_CONFIG_MISSING`, `INVALID_MODEL_OUTPUT`, etc.) with user-friendly remediation messages.
  - Client suppresses raw stack traces, API keys, and model internals in favour of clean, actionable guidance.
- **Fixed Retry Handler & Decoupled Prompt Representation (`src/components/PlanPatchWorkspace.tsx`, `src/components/InterpretationReview.tsx`, `src/components/DisruptionInput.tsx`):**
  - Stored `originalPrompt` independently on interpretation state.
  - Clicking "Retry Request" resubmits the exact original user prompt with bounded retry counts ($\le 3$).
  - Removed "Retry request" label from fallback suggestions catalog.
- **Graceful Offline Fallback for Canonical Example Cards (`src/components/PlanPatchWorkspace.tsx`):**
  - When Gemini encounters high demand or quota exhaustion while analyzing one of the three canonical cards (S1, S2, S3), PlanPatch automatically switches to the matching verified offline fixture and displays a clear notice: *"Gemini is temporarily unavailable. Switched to the offline demo scenario."*
  - Custom free-form prompts preserve the user's input and error state without fabricated mappings.
- **Recovery Alternatives in Plan Drafts (`src/lib/schemas/draft-plan.schema.ts`, `src/lib/ai/draft-plan-interpreter.ts`, `src/components/CustomPlanBuilder.tsx`):**
  - Added `DraftTaskAlternativeSchema` and `alternatives` array to draft tasks, mapped into `task.alternatives` and `plan.demoAlternatives` during conversion.
  - System instructions require the model to declare realistic recovery alternatives with cost, duration, and uncertainty provenance for critical tasks.
  - Provided interactive alternatives management in `CustomPlanBuilder` review mode (adding, removing, and toggling suggested vs confirmed status).
  - Pre-seeded culinary fallback plan with alternatives (`alt-t02-pantry-searing`, `alt-t02-express-saute`, `alt-t03-quick-pan-sauce`, `alt-t04-skillet-roast`), enabling deterministic recovery for task unavailability, budget cuts, and tightened deadlines.
- **Corrected Deadline Wording (`src/components/DisruptionInput.tsx`):**
  - Updated card title, prompt text, and badge description from "Deadline moved 2 days earlier" to `"Deadline Tightened to 120h (7 Days Earlier)"`.
- **Server-Side Sliding-Window Rate Limiting & Bounds Checking (`src/lib/server/rate-limiter.ts`, route handlers):**
  - Implemented sliding-window rate limiters with client identifier extraction (`x-forwarded-for`, `x-real-ip`).
  - Emits HTTP 429 with standard `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
  - Implemented strict payload bounds checking (prompt max 4,000 characters; history max 20 turns, 3,000 chars per turn).

### Verification
- **All 376 tests passing** across 30 test suites (`vitest`).
- **TypeScript `--noEmit`**: 0 errors.
- **Next.js Production Build**: Succeeded (`next build`).
- **Fixture Verification**: `python3 fixtures/planpatch/verify_fixtures.py` passed with 100% fixture immutability.
