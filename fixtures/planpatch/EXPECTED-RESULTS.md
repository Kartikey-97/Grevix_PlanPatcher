# Expected results — PlanPatch fixture v1

Numbers below are recomputed by `verify_fixtures.py`. Prices and venues are fictional. Score is unitless; lower is better.

## Baseline

| Measure | Expected value |
|---|---:|
| Tasks | 16 |
| Total cost | ₹18,000 |
| Budget limit | ₹25,000 |
| Earliest finish | 132 hours |
| Deadline | 288 hours |
| Deadline slack | 156 hours |
| Sum of task priority points | 64 |

Critical paths:

- `T01 → T02 → T03 → T05 → T07 → T14 → T15`
- `T01 → T02 → T03 → T05 → T13 → T14 → T15`

## Scenario 1 — Venue cancelled

| Candidate | Tasks changed | Total cost | Finish | Unknown facts | E | L | C | M | Q | S | R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Community Hall | 3 | ₹20,000 | 134h | 1 | 0.1875 | 0.0000 | 0.8000 | 0.2500 | 0.0000 | 0.1750 | 0.2000 |
| Campus Auditorium | 6 | ₹17,000 | 132h | 2 | 0.3750 | 0.0156 | 0.6800 | 1.0000 | 0.0000 | 0.7000 | 0.4000 |

| Preference | Rank 1 | Score | Rank 2 | Score |
|---|---|---:|---|---:|
| Preserve the Plan | Community Hall | 0.26250000 | Campus Auditorium | 0.39740625 |
| Minimize Spending | Campus Auditorium | 0.57006250 | Community Hall | 0.59750000 |
| Protect the Deadline | Community Hall | 0.21562500 | Campus Auditorium | 0.51659375 |

Interpretation: the Community Hall preserves the one-session format and makes fewer changes. Campus Auditorium costs less, but needs two sessions, a revised registration plan, updated seating/schedule, and removal of the optional booth.

## Scenario 2 — Budget cut to ₹16,000

| Candidate | Tasks changed | Total cost | Finish | Budget margin | Unknown facts | E | L | C | M | Q | S | R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Lecture Hall — lean | 5 | ₹15,700 | 132h | ₹300 | 1 | 0.3125 | 0.0000 | 0.9813 | 0.0000 | 0.0000 | 0.0000 | 0.2000 |
| Department Hall — lean | 5 | ₹13,500 | 134h | ₹2,500 | 2 | 0.3125 | 0.0000 | 0.8438 | 0.2500 | 0.0000 | 0.1750 | 0.4000 |

| Preference | Rank 1 | Score | Rank 2 | Score |
|---|---|---:|---|---:|
| Preserve the Plan | Lecture Hall — lean | 0.31000000 | Department Hall — lean | 0.32875000 |
| Minimize Spending | Department Hall — lean | 0.65062500 | Lecture Hall — lean | 0.72812500 |
| Protect the Deadline | Lecture Hall — lean | 0.16500000 | Department Hall — lean | 0.25875000 |

Interpretation: both pass the ₹16,000 hard limit. The cheaper Department Hall has a longer lead time and unknown AV compatibility/availability, so the cost preference accepts those trade-offs while the other preferences do not.

## Scenario 3 — Plan-readiness plan-readiness deadline moved from 288h to 120h

The original project still has a 132h earliest finish, so it fails the new deadline by 12 hours.

| Candidate | Tasks changed | Total cost | Finish | Slack | Unknown facts | E | L | C | M | Q | S | R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Early registration close | 1 | ₹18,000 | 116h | 4h | 1 | 0.0625 | 0.0000 | 0.7200 | 1.0000 | 0.8333 | 0.9500 | 0.2000 |
| Fast-track venue + early close | 4 | ₹20,000 | 104h | 16h | 1 | 0.2500 | 0.0000 | 0.8000 | 1.0000 | 0.3333 | 0.8000 | 0.2000 |

| Preference | Rank 1 | Score | Rank 2 | Score |
|---|---|---:|---|---:|
| Preserve the Plan | Early registration close | 0.32525000 | Fast-track venue + early close | 0.37500000 |
| Minimize Spending | Early registration close | 0.56775000 | Fast-track venue + early close | 0.63500000 |
| Protect the Deadline | Fast-track venue + early close | 0.53750000 | Early registration close | 0.57637500 |

Interpretation: the single-task fix is cheaper and preserves more of the plan, but leaves only four hours of slack. The fast-track venue option costs more and modifies more task records, but leaves 16 hours of slack—so it wins under Protect the Deadline.

## Expected winners summary

| Scenario | Preserve the Plan | Minimize Spending | Protect the Deadline |
|---|---|---|---|
| Venue cancelled | Community Hall | Campus Auditorium | Community Hall |
| Budget cut | Lecture Hall — lean | Department Hall — lean | Lecture Hall — lean |
| Deadline moved earlier | Early registration close | Early registration close | Fast-track venue + early close |

## What the acceptance tests prove

- Budget and deadline constraints are filtered before scoring.
- Uncertainty is visible and prevents provisional candidates from being represented as verified real-world options.
- A cheaper solution does not automatically win under every preference.
- The deadline profile values actual deadline buffer via `Q`, rather than only minimizing task-start movement.
- The same candidate fixture receives a reproducible score under each preference profile.
