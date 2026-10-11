# Implementation and judge-test checklist

Use this list to implement and manually verify the user-facing product.

## Baseline
- [ ] `Try Campus Tech Fest demo` loads without sign-in or an API call.
- [ ] Task cost total is ₹18,000 and the budget limit is ₹25,000.
- [ ] Earliest project finish is 132 elapsed hours.
- [ ] Both critical paths match `expected-results.json`.
- [ ] Dependency graph has no missing IDs or cycles.

## Disruption controls
- [ ] Venue cancelled.
- [ ] Budget reduced to ₹16,000.
- [ ] Plan-readiness deadline moved to 120 elapsed hours.
- [ ] Preference selector exposes Preserve the Plan, Minimize Spending, Protect the Deadline.

## Recovery preview
- [ ] Candidate scores show E, L, C, M, Q, S, R separately.
- [ ] The UI distinguishes task-record edits from schedule-only movement.
- [ ] Affected/invalidated tasks and preserved tasks are visibly different.
- [ ] Unknown facts are visible and candidates with any unknowns are marked Provisional.
- [ ] Failed hard constraints prevent a candidate from being ranked as a valid recovery.
- [ ] Accept creates a new version; reject leaves the baseline untouched; reset restores the fixture.

## Expected winners
- [ ] Venue cancelled + Preserve the Plan → Community Hall.
- [ ] Venue cancelled + Minimize Spending → Campus Auditorium.
- [ ] Venue cancelled + Protect the Deadline → Community Hall.
- [ ] Budget cut + Preserve the Plan → Lecture Hall — lean.
- [ ] Budget cut + Minimize Spending → Department Hall — lean.
- [ ] Budget cut + Protect the Deadline → Lecture Hall — lean.
- [ ] Deadline moved earlier + Preserve the Plan → Early registration close.
- [ ] Deadline moved earlier + Minimize Spending → Early registration close.
- [ ] Deadline moved earlier + Protect the Deadline → Fast-track venue + early registration.

## Before submission
- [ ] Run `python3 verify_fixtures.py` and confirm `status: PASS`.
- [ ] Run the TypeScript unit tests against every expected result.
- [ ] Run the full demo without `GEMINI_API_KEY` set.
- [ ] Clearly label all venues/prices as fictional demo data.
