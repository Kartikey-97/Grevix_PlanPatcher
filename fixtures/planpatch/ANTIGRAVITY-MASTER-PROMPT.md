# PlanPatch — Antigravity Master Project Brief

Copy everything below the divider into a new Antigravity conversation with the PlanPatch workspace open.

---

You are the primary engineering partner helping me build **PlanPatch** for the Grevix AfterCode 24-hour solo hackathon. I will make product decisions and review changes; you should implement carefully, explain important trade-offs, and test the behavior instead of generating lots of code without verification.

## 0. First action: inspect and plan, do not implement yet

For your first response, **do not scaffold the app or modify source files**. Inspect the current workspace and the fixture pack. If the fixture files aren't in the workspace, tell me the exact files that need to be copied into `fixtures/planpatch/`; do not invent or silently recreate their contents.

Read these files first:

- `fixtures/planpatch/README.md`
- `fixtures/planpatch/plan.json`
- `fixtures/planpatch/scenarios.json`
- `fixtures/planpatch/ranking-policy.json`
- `fixtures/planpatch/expected-results.json`
- `fixtures/planpatch/IMPLEMENTATION-CHECKLIST.md`

If they are currently located elsewhere in this workspace, use their actual paths. `verify_fixtures.py` is a Python specification verifier, not the application's implementation; the app should implement the same behavior in TypeScript.

For your first response, produce:

1. A concise explanation of the product and its defining differentiator.
2. Your understanding of the data contract, ranking mathematics, graph/scheduler logic, and three test scenarios.
3. The proposed complete folder/file structure with a one-line responsibility for each important file.
4. A milestone plan, beginning with the deterministic recovery engine and tests before the UI.
5. Any inconsistencies or ambiguities you discover in the fixture pack, plus a proposed resolution. Do not silently change expected results.

Then **wait for my approval before creating or editing implementation files**.

## 1. Product purpose

PlanPatch is a change-aware plan recovery workspace. When a disruption occurs, it identifies which parts of a plan need reassessment, proposes a feasible set of changes, preserves unaffected work where possible, checks the resulting plan against constraints, and explains every proposed change.

Its distinctive promise is: **recalculate globally where necessary, modify locally, and explain what stayed unchanged**. It is not a generic chatbot and not merely an AI plan generator.

The initial demonstration is a fictional Campus Tech Fest plan, but the engine must remain domain-agnostic. Do not hard-code terms such as venue, speaker, catering, or campus into the recovery algorithms. Domain-specific task names, fields, alternatives, and validation constraints belong in fixture/configuration data.

A venue search, AI output, or fictional fixture value is not proof of real-world availability, cost, capacity, accessibility, or approval. Unknown facts must remain visible and provisional.

## 2. Required stack

- Next.js App Router.
- TypeScript with strict type checking.
- React for the UI.
- Tailwind CSS and shadcn/ui for accessible interface primitives.
- `@xyflow/react` for the interactive task/dependency graph.
- `zod` for runtime validation of plan data, disruptions, candidate patches, and model responses.
- `lucide-react` for icons.
- Vitest for deterministic unit tests.
- Browser `localStorage` for demo baseline, accepted versions, and decision history.
- Optional Gemini API integration later, through a server-only route and a server-side environment variable. Do not put API keys in client code.

Do not add a database, authentication, vector DB, fine-tuning, live venue provider, or external services to the initial milestone. The predefined demo must work without a Gemini API key and without external HTTP calls. A future natural-language interpretation endpoint may call Gemini, but the deterministic demo must not depend on it.

## 3. Architecture clarification

Yes, this is a Next.js application. The recovery engine consists of pure TypeScript modules **inside the Next.js project**, ideally under `src/lib/engine/`. “Pure” means these functions do not import React, Next.js request/response APIs, browser storage, or call the AI provider. They accept validated data and return results. The UI can call them directly for offline deterministic demo scenarios. A future Next.js Route Handler can call the same engine where server orchestration is appropriate.

Keep these responsibilities separate:

- UI components render plans and interactions.
- State/persistence stores accepted versions and history.
- Engine modules implement graph, scheduling, propagation, patch search, scoring, and validation.
- AI adapter interprets natural-language disruptions and suggests structured alternatives, but does not decide final feasibility.
- Route handlers validate and orchestrate requests; they do not contain the business logic.

## 4. Required initial project tree

Propose this structure and explain any changes before implementing it. Do not create empty abstraction layers merely to match the tree; keep modules small and cohesive.

```text
planpatch/
├── .agents/
│   └── rules/
│       └── planpatch.md              # durable architecture and UX constraints for Antigravity
├── public/
│   └── ...                            # static assets only if needed
├── fixtures/
│   └── planpatch/
│       ├── plan.json                  # canonical baseline plan
│       ├── scenarios.json             # canonical scenario/candidate inputs
│       ├── ranking-policy.json        # formulas, weights, tie-break rules
│       ├── expected-results.json      # numeric acceptance-test expectations
│       ├── EXPECTED-RESULTS.md        # human-readable test summary
│       └── IMPLEMENTATION-CHECKLIST.md
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── ai/
│   │   │       └── interpret/
│   │   │           └── route.ts       # optional later; server-only Gemini call
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                   # app entry / demo launcher
│   ├── components/
│   │   ├── layout/                    # sidebar, header, workspace shell
│   │   ├── plan/                      # task list/timeline, metrics, task inspector
│   │   ├── graph/                     # React Flow graph and custom task nodes
│   │   ├── disruption/                # scenario selector and change input
│   │   ├── recovery/                   # ranked options, patch diff, validation report
│   │   ├── history/                    # version and decision log
│   │   └── ui/                         # shadcn/ui components
│   ├── data/
│   │   └── load-demo-fixtures.ts      # imports canonical fixture files
│   ├── lib/
│   │   ├── schemas/
│   │   │   ├── plan.schema.ts
│   │   │   ├── scenario.schema.ts
│   │   │   ├── patch.schema.ts
│   │   │   └── recovery-result.schema.ts
│   │   ├── engine/
│   │   │   ├── validate-graph.ts
│   │   │   ├── topological-sort.ts
│   │   │   ├── schedule.ts
│   │   │   ├── propagate-impact.ts
│   │   │   ├── validate-constraints.ts
│   │   │   ├── apply-disruption.ts
│   │   │   ├── generate-candidates.ts
│   │   │   ├── calculate-metrics.ts
│   │   │   ├── rank-candidates.ts
│   │   │   ├── diff-plans.ts
│   │   │   └── recover-plan.ts
│   │   ├── state/
│   │   │   ├── plan-store.ts
│   │   │   └── version-history.ts
│   │   ├── ai/
│   │   │   ├── gemini-client.ts        # optional later, server-only
│   │   │   ├── interpret-disruption.ts
│   │   │   └── ai-output.schema.ts
│   │   └── utils/
│   │       └── formatters.ts
│   └── types/
│       └── ...                         # only if types cannot be inferred from Zod
├── tests/
│   ├── unit/
│   │   ├── graph.test.ts
│   │   ├── schedule.test.ts
│   │   ├── impact.test.ts
│   │   ├── ranking.test.ts
│   │   └── recovery-fixtures.test.ts
│   └── integration/
│       └── demo-flow.test.ts
├── .env.example
├── components.json
├── next.config.ts
├── package.json
├── tsconfig.json
├── README.md
└── ... configuration files generated by the selected Next.js setup
```

## 5. Canonical fixture rules

The fixture pack is the source of truth for version one. Copy the supplied fixture files into `fixtures/planpatch/` without changing their contents unless I approve a correction. The application must implement its semantics; it must not hard-code the expected winning candidate separately from the algorithm.

Canonical baseline values from the fixture contract:

- 16 tasks.
- Total baseline task cost: ₹18,000.
- Original budget limit: ₹25,000.
- Original plan-readiness deadline: 288 elapsed hours.
- Earliest finish: 132 elapsed hours.
- Original deadline slack: 156 hours.
- Sum of task priority points: 64.
- Three scenarios: venue cancelled; budget cut to ₹16,000; readiness deadline moved to 120 hours.

All venues, prices, addresses, and sample confirmations are fictional. `confirmed_in_demo_fixture` means assumed for deterministic test purposes only, not real-world verification.

Do not use an LLM to calculate the expected test results. Use the formulas and values in the fixture files.

## 6. Core data concepts

Use Zod schemas as runtime contracts and infer TypeScript types from them where practical. Avoid maintaining divergent duplicate interfaces.

A Plan has tasks, dependencies, global constraints, and recovery policy settings. A Task has an ID, title, duration in elapsed hours, cost, priority on a 1–5 scale, policy (`fixed`, `replaceable`, or `optional`), status, typed inputs/outputs, and optional alternatives. A Dependency has a directed source task and target task, an explicit reason, a blocking flag, and field mappings from source output fields to target input fields.

Distinguish:

1. **Task-record edit:** task is added, removed, materially degraded, or one of its substantive fields is changed by a patch.
2. **Field invalidation / review:** a task consumes an upstream field that has changed and must be checked. It might ultimately require no task-record edit.
3. **Schedule-only movement:** task start/finish shifts because a prerequisite's duration/timing changed, but the task's own record is unchanged.
4. **Direct disruption:** the resource/task/constraint explicitly targeted by the change.
5. **Global constraint:** budget/deadline/accessibility/capacity and other plan-wide conditions validated independently of graph edges.

Never count a schedule-only movement as a task-record edit in the change-footprint metric. The UI must show these categories separately.

## 7. Graph and scheduling algorithm

Dependencies are directed from prerequisite (`fromTaskId`) to dependent (`toTaskId`). Validate every referenced task ID, reject self-loops and cycles, and use topological sorting to produce a valid scheduling order.

For the v1 precedence-only elapsed-hours schedule:

- `ES(v) = max(EF(u) for all blocking predecessors u)`; if there are no blocking predecessors, `ES(v) = 0`.
- `EF(v) = ES(v) + durationHours(v)`.
- Project finish is `max(EF(v))` over relevant plan tasks.
- Deadline slack is `deadlineHours - projectFinishHours`.
- A candidate that finishes after the active hard deadline is infeasible.

Use a forward pass for earliest starts/finishes and a backward pass from project finish/deadline for latest start/finish and task slack. Tasks with zero slack are on a critical path. Support multiple critical paths. Explain that v1 does not model working calendars, resource contention, or fixed calendar appointments.

Field-aware impact must be calculated separately from schedule propagation. When an upstream output field changes, traverse only dependency mappings consuming that field. Mark consumers for revalidation. Do not edit all downstream tasks automatically. Global constraints such as budget still get recalculated for each completed candidate, even if they are not graph nodes.

If a task is modified in a candidate and its outputs change, propagate those output changes to relevant downstream consumers. If a field's value is unchanged, stop propagation along that field edge unless another changed field requires it.

## 8. Hard feasibility before ranking

A candidate is never allowed to trade off a hard-constraint violation for a better score. Before score calculation, validate:

- Graph IDs/edges and acyclicity.
- Task policies: `fixed` tasks cannot be silently modified/removed; `replaceable` tasks can be replaced or materially adjusted under the defined policy; `optional` tasks may be removed.
- All mandatory domain constraints in the fixture, including capacity/accessibility/multi-session constraints where applicable.
- Total task cost does not exceed the active budget.
- Project finish does not exceed the active deadline.
- Required fields and prerequisite requirements are satisfied.

Classify passing options as `VerifiedInDemoFixture` or `Provisional`, based on unknown decision-critical facts. This label describes the fictional fixture only; never imply real-world confirmation. The fixture policy ranks candidates within the same verification tier. Never invent missing candidate facts.

If no feasible option exists, return a structured infeasibility result listing which hard constraints fail and which potentially relaxable decisions could make the plan feasible. Do not fabricate a successful recovery.

## 9. Exact ranking mathematics

Use the exact initial formulas and preference weights in `fixtures/planpatch/ranking-policy.json`. Do not substitute a different formula or invent weights. Lower composite score is better, but score only compares candidates after hard-constraint filtering and within the same verification tier.

Metrics:

1. Change footprint:
   `E = min(changedTaskCount / originalTaskCount, 1)`.
   A task-record edit counts once even if several fields changed. Additions, removals, or material degradation count. Schedule-only movement does not count.

2. Lost task value:
   `L = min(sum(priority_i for removed_or_materially_degraded_tasks) / sum(original_task_priorities), 1)`.
   Only IDs explicitly classified as removed/materially degraded count. A date or cost change alone does not necessarily imply lost task value.

3. Budget usage:
   `C = projectedTotalCost / activeBudgetLimit`.
   If an active budget exists, any candidate with projected cost above it is infeasible before scoring. If no budget limit exists in a future generic plan, the implementation must handle that explicitly rather than divide by zero.

4. Schedule movement:
   `M = min(weightedMeanAbsoluteStartShiftHours / 8, 1)`.
   `weightedMeanAbsoluteStartShiftHours = sum(priority_i * abs(candidateES_i - baselineES_i)) / sum(priority_i)` across retained tasks with non-zero earliest-start movement. If no retained task's start changes, M=0. Use the original baseline schedule, not a baseline that was already mutated by a disruption.

5. Deadline pressure:
   `Q = 0` if no deadline exists or slackHours >= 24; otherwise `Q = 1 - max(slackHours, 0)/24`.
   Candidates that finish past the deadline are already filtered as infeasible.

6. Schedule disruption:
   `S = 0.7*M + 0.3*Q`.

7. Uncertainty:
   `R = unknownDecisionCriticalFactCount / 5`.
   The first fixture treats five decision-critical checks equally. Unknown facts are explicit and visible.

Composite score:
`J(P) = wE*E + wL*L + wC*C + wS*S + wR*R`.

Weights:

- Preserve the Plan: `E=.30, L=.25, C=.20, S=.15, R=.10`.
- Minimize Spending: `E=.10, L=.10, C=.70, S=.05, R=.05`.
- Protect the Deadline: `E=.15, L=.15, C=.10, S=.50, R=.10`.

Decision order:

1. Reject candidates violating hard constraints.
2. Classify remaining candidates by verification tier.
3. Rank within the same tier using the selected profile's weights, lower score first.
4. Ties: fewer changed tasks, then fewer unknown facts, then stable candidate ID order.
5. Never let a score override a fixed task, hard requirement, or an unverified real-world fact.

These are manually selected starting weights, not learned parameters. Ranking only compares generated candidates and does not prove global optimality. Explain every metric in the UI so a judge can inspect the calculation.

## 10. Candidate generation and recovery search

For the initial milestone, implement the deterministic candidate patches already provided by `scenarios.json` and `expected-results.json`. The engine must run those candidates through the same generic validation and scoring pipeline. Do not write code like `if scenario === S1 then return Community Hall` to force expected winners.

After the fixture tests pass, implement a small deterministic candidate-generation layer using:

- known allowed task alternatives;
- permitted changes to replaceable tasks;
- removals only for optional tasks;
- a limited set of task-start/duration alternatives if included in the fixture.

Evaluate each candidate on a cloned plan. Never mutate the accepted baseline during preview. For larger candidate spaces, bounded beam search may be added: expand partial patches, validate cheap structural constraints, keep a bounded set of promising candidates, then run full validation and scoring on complete candidates. Label it a bounded heuristic, not a proof of global optimality. Exhaustively enumerate small candidate spaces instead.

AI may later interpret a free-text request into a typed disruption or suggest an alternative. It cannot commit a patch, change fixed requirements, manufacture verified facts, or bypass the deterministic engine.

## 11. Preferences and interaction

Provide a small, clear selector:

- **Preserve the Plan** — standard default.
- **Minimize Spending** — gives budget usage the highest weight.
- **Protect the Deadline** — gives schedule disruption/deadline pressure the highest weight.

Changing the preference recalculates ranking from the same generated candidate set. Hard constraints remain unchanged.

The demo user flow:

1. Landing screen with `Try Campus Tech Fest demo`.
2. Workspace showing budget, deadline, task list/timeline, and graph view.
3. Select one of three scenarios: venue cancelled, budget cut to ₹16,000, readiness deadline moved to 120 elapsed hours.
4. Select recovery preference.
5. Generate and inspect ranked candidates.
6. Compare baseline and proposed plan, including task edits versus review-only tasks versus schedule-only shifts.
7. Show constraint checks, cost, finish time, slack, unknown facts, reasons for edits, and preserved tasks.
8. Accept, reject, reset, and inspect decision/version history.

The seeded demo must be fully usable without entering data, creating an account, external APIs, or a Gemini key. Make the primary UI an elegant operations/planning workspace, **not an AI chat dashboard**. Use a calm light palette, strong typography, subtle borders, and realistic data-driven metrics. Red indicates the directly broken task, amber indicates affected/review-required tasks, green indicates validated/preserved work, and neutral indicates untouched tasks. Always label statuses with text/icons, not color alone. Do not invent confidence percentages or user impact counts.

## 12. Test strategy and acceptance criteria

Before building a complex UI, implement and test graph validation, topological sorting, scheduling, impact propagation, constraints, scoring, and candidate ranking.

The following must be reproduced from `expected-results.json`:

- Baseline: 16 tasks, ₹18,000 cost, ₹25,000 limit, 132h finish, 288h deadline, 156h slack, priority sum 64.
- S1 Venue cancelled: Preserve the Plan → Community Hall; Minimize Spending → Campus Auditorium; Protect the Deadline → Community Hall.
- S2 Budget cut: Preserve the Plan → Lecture Hall — lean; Minimize Spending → Department Hall — lean; Protect the Deadline → Lecture Hall — lean.
- S3 Deadline earlier: Preserve the Plan → Early registration close; Minimize Spending → Early registration close; Protect the Deadline → Fast-track venue + early registration.

Use unit tests that load the canonical fixtures and compare computed fields/scores/winners with tolerances for floating-point values. Add tests for missing task IDs, cyclic edges, unchanged fields not propagating, independent tasks staying unchanged, invalid AI output, fixed-task protection, budget violations, deadline violations, unknown facts remaining provisional, deterministic tie-breaks, accept/reject/version history, and running without a Gemini API key.

Run the existing Python verifier if available, but remember that TypeScript tests must independently verify the actual application engine. Do not edit `expected-results.json` merely to make failing code pass. If an inconsistency is discovered, stop, explain the mismatch, and propose a correction for my approval.

Completion criteria:

- The app builds and runs locally.
- All three scenarios work offline and repeatably.
- All nine scenario/preference winner combinations match the fixture.
- Every displayed score can be expanded to show E, L, C, M, Q, S, R and the weight used.
- The UI differentiates task-record edits, field invalidation/review, and schedule-only movement.
- The user can inspect before/after plans, accept/reject, see history, and reset.
- All sample venues/prices are labelled fictional.
- A clean README explains setup, architecture, formulas, tests, and limitations.

## 13. Build discipline

After I approve the plan, implement in small verified milestones:

A. Scaffold the Next.js application and copy fixtures exactly.
B. Add schemas and fixture-loading tests.
C. Implement graph validation and scheduling; test baseline values.
D. Implement impact propagation and hard-constraint validation.
E. Implement metrics, preference weights, candidate sorting, and fixture parity tests.
F. Build the workspace shell, task/timeline view, graph, disruption controls, and recovery comparison.
G. Add accept/reject, versions, local persistence, and decision log.
H. Polish responsiveness/accessibility, run build/tests, and write final documentation.
I. Only after the deterministic product works, consider optional Gemini natural-language interpretation.

Use the Antigravity terminal to run commands and tests when appropriate. Before adding a dependency, explain why it is needed. Do not add a library just because it is fashionable. Do not make external API credentials a requirement for the demo.

Now inspect the workspace and fixture files, then return only the Stage 0 planning deliverable and wait for my approval.
