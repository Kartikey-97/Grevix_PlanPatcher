# PlanPatch fixture pack v1

This pack is the first build-ready data and acceptance-test contract for PlanPatch. It contains a deterministic 16-task campus-event fixture, three disruptions, candidate recovery patches, ranking weights, expected numeric results, and a standard-library verifier.

**All venues, addresses, prices, availability statuses, and scenario outcomes are fictional demo data.** `confirmed_in_demo_fixture` means the sample assumes a value for repeatable testing; it is not a real booking or external verification.

## Files

- `plan.json` — baseline plan, task schema, field-aware dependencies, task policies, and alternative catalog.
- `scenarios.json` — three disruptions and their candidate patches, expected changed tasks, and reasons.
- `ranking-policy.json` — exact metrics, weights, filters, tie-breaks, and limitations.
- `expected-results.json` — computed schedules, metrics, validation, candidate scores, rankings, and expected winners.
- `verify_fixtures.py` — simple fixture calculator and assertions using only the Python standard library. This is for specification verification; the actual app should implement the same rules in TypeScript.
- `EXPECTED-RESULTS.md` — short human-readable summary of the computed outcomes.
- `ANTIGRAVITY-BUILD-BRIEF.md` — concise engineering handoff for implementing the product from this fixture pack.

## Baseline contract

The baseline contains 16 tasks. Its task costs sum to **₹18,000**, against a **₹25,000** limit. Its earliest finish is **132 elapsed hours** under the precedence-only scheduler. The deadline is 288 hours, giving 156 hours of initial slack. The sum of task priority scores is 64.

The two critical paths are:

1. `T01 → T02 → T03 → T05 → T07 → T14 → T15`
2. `T01 → T02 → T03 → T05 → T13 → T14 → T15`

The schedule uses elapsed hours and the simple rule `ES(task) = max(EF(predecessors))`; it does not model business calendars, working hours, resource contention, or fixed calendar appointments yet. Those are consciously out of scope for v1.

## The three demo scenarios

### S1 — Venue cancelled

- **Community Hall:** ₹20,000 total, 3 task records changed, 2-hour weighted average start shift, one unresolved fact.
- **Campus Auditorium:** ₹17,000 total, 6 task records changed, sponsor booth removed, two unresolved facts, and two sessions required for 100 attendees.

Expected winning profile: Preserve the Plan → Community Hall; Minimize Spending → Campus Auditorium; Protect the Deadline → Community Hall.

### S2 — Budget cut to ₹16,000

- **Lecture Hall configuration:** ₹15,700 total, no task start-time shifts in the fixture, one unresolved fact.
- **Department Hall configuration:** ₹13,500 total, 2-hour shifts to downstream starts, two unresolved facts.

Expected winning profile: Preserve the Plan → Lecture Hall; Minimize Spending → Department Hall; Protect the Deadline → Lecture Hall.

### S3 — Plan-readiness plan-readiness deadline moved from 288h to 120h

The unpatched baseline finishes at 132h and therefore fails the new deadline.

- **Early registration close:** ₹18,000 total, finishes at 116h, leaving 4h slack, and changes one task record.
- **Fast-track venue + early registration close:** ₹20,000 total, finishes at 104h, leaving 16h slack, and changes four task records.

Expected winning profile: Preserve the Plan → Early registration close; Minimize Spending → Early registration close; Protect the Deadline → Fast-track venue + early registration close.

## Exact ranking math

All hard constraints are checked before a candidate is scored. A candidate that exceeds the active budget or deadline, breaks a fixed task, has an invalid/cyclic graph, fails capacity, or fails a required accessibility constraint is rejected from normal candidate ranking.

All five score metrics are normalized to [0, 1], and lower is better:

- `E = min(changedTaskCount / originalTaskCount, 1)`
- `L = min(priorityPointsRemovedOrMateriallyDegraded / originalPriorityPointSum, 1)`
- `C = projectedTotalCost / activeBudgetLimit`
- `M = min(priority-weighted mean absolute start-time shift / 8 hours, 1)` across retained tasks whose earliest start changed
- `Q = 0` when there is no deadline or slack is at least 24h; otherwise `Q = 1 - max(slackHours, 0) / 24`
- `S = 0.7M + 0.3Q`
- `R = unknownDecisionCriticalFactCount / 5`

Composite score:

`J(P) = wE·E + wL·L + wC·C + wS·S + wR·R`

The weights live in `ranking-policy.json`. The selected preference changes weights; it does **not** override hard constraints.

| Preference | E: changes | L: lost value | C: budget | S: schedule/deadline | R: uncertainty |
|---|---:|---:|---:|---:|---:|
| Preserve the Plan | 0.30 | 0.25 | 0.20 | 0.15 | 0.10 |
| Minimize Spending | 0.10 | 0.10 | 0.70 | 0.05 | 0.05 |
| Protect the Deadline | 0.15 | 0.15 | 0.10 | 0.50 | 0.10 |

## Run the verifier

```bash
python3 verify_fixtures.py
```

The command rewrites `expected-results.json`, verifies the baseline task count, cost, priority sum, and finish time, checks that every candidate in this fixture passes the defined numerical checks, and asserts the expected winner for each preference in each scenario.

## Important boundaries

1. The scoring weights are hand-selected initial policy, not learned weights or scientifically calibrated constants.
2. The bounded recovery search is not proven globally optimal; the ranking only compares generated candidates.
3. In real projects, `unknown` facts must stay provisional. A place-search result does not establish current availability, price, capacity, accessibility, or permission.
4. The fixture's `durationHours` are elapsed time. A production version may need work calendars, fixed dates, resource conflicts, task state/progress, and actual scheduling constraints.
5. Field-aware dependency propagation decides what must be revalidated. Scoring prioritizes feasible options and must never be used to manufacture a dependency or override a fixed requirement.
