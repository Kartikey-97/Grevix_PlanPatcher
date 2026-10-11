# Antigravity build brief — PlanPatch

Build PlanPatch as a polished, responsive web application using Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, and `@xyflow/react` for the dependency graph. Use browser localStorage for the demo baseline and accepted plan versions. Keep the Gemini API optional and server-side; all predefined scenarios must work without an API key or network request.

## Required first milestone

Make the fixture pack in this directory the source of truth:

- `plan.json`
- `scenarios.json`
- `ranking-policy.json`
- `expected-results.json`

Implement the smallest end-to-end flow first:

1. A landing screen with a single obvious `Try Campus Tech Fest demo` action.
2. A workspace with budget, deadline, task list/timeline, and a dependencies view.
3. Three selectable scenarios: venue cancelled, budget cut, deadline moved earlier.
4. Three recovery profiles: Preserve the Plan, Minimize Spending, Protect the Deadline.
5. A recovery preview showing candidate rank/score, changed tasks, revalidated/timing-shifted tasks, preserved tasks, projected cost, finish time, slack, unknown facts, and constraint-check outcomes.
6. Accept/reject and reset actions. Accepted changes create a version and an audit-log entry.

## Architecture constraints

- Keep the recovery engine as pure TypeScript modules independent of React and API calls.
- Validate all incoming fixture/candidate data with Zod.
- Validate the dependency DAG, and use topological sorting for earliest-start/finish calculations.
- Apply each patch to a copy; never mutate the accepted baseline during preview.
- Compute field-aware impact separately from schedule movement. A task may need schedule revalidation without its task record being edited.
- Reject known hard-constraint failures before scoring.
- Use exactly the formulas and profile weights in `ranking-policy.json` for the first implementation.
- Sort candidates deterministically. If score ties, use fewer changed tasks, then fewer unknown facts, then candidate ID.
- Use unknown facts to label candidates `Provisional`; do not invent availability, prices, capacity, or approvals.
- Add unit tests that reproduce the values and winners in `expected-results.json`.

## Core UX direction

This is an operations/planning workspace, not an AI chat dashboard. The primary view should emphasize the task timeline, budget, deadline, and dependency graph. Use a calm light palette, clear type hierarchy, subtle borders, and meaningful status labels. Red is for a directly broken task, amber for affected/review-needed tasks, green for validated/preserved tasks, and neutral for untouched work. Do not show unsupported metrics such as arbitrary confidence percentages or imagined impacted-user counts.

## Avoid in the first version

No login, database, vector database, fine-tuning, live venue search, multi-user collaboration, file uploads, or generic autonomous plan generation. Add natural-language interpretation only after all three seeded scenarios pass the deterministic tests.

## Completion criteria

- A judge can open the app, run all three scenarios, switch preference profiles, compare patches, accept a patch, inspect the decision log, and reset the demo.
- The app reproduces the expected winners in `expected-results.json`.
- Every score is inspectable by metric; no score can override a hard constraint.
- The UI distinguishes task content changes from tasks whose start times merely shifted.
- The app builds and deploys without requiring Gemini credentials.
