# PlanPatch Engineering Rules

- Treat `fixtures/planpatch/` as the source of truth. Never silently change expected values or scoring weights.
- Keep the recovery engine in pure TypeScript modules under `src/lib/engine/`, independent of React, Next.js request handlers, browser storage, and AI providers.
- Enforce graph validity and hard constraints before ranking candidates. Scores must never override fixed requirements or feasibility.
- Never mutate the accepted baseline when calculating a proposed recovery. Apply patches to copies and commit only after explicit user approval.
- Keep predefined scenarios deterministic and fully functional without a Gemini API key or external HTTP calls.
- Never invent real-world availability, prices, capacity, or approval. Surface unknown facts and mark affected options provisional.
- Distinguish task-record edits, field invalidation/review, and schedule-only movement.
- Keep the UI focused on event/project operations, not an AI chat dashboard. Use real calculated metrics, accessible status labels, and clear before/after comparisons.
- Run tests after meaningful changes. Do not modify expected results merely to make tests pass.
