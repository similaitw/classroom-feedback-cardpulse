# AGENTS.md — CardPulse

## Source of truth

GitHub repository contents are the source of truth for this project.

Before coding:
1. Read this file.
2. Read `docs/TASKS.md`.
3. Work only on `Current task` unless explicitly instructed otherwise.
4. Read `PROJECT_SPEC.md` when product/architecture context is required.

## Workflow

- Keep tasks small, testable, and independently reviewable.
- Do not silently expand scope.
- Run relevant tests before marking a task complete.
- Update `docs/TASKS.md` after completing a task.
- Commit with a concise conventional-style message.
- Never mark a scanner milestone complete using synthetic-only evidence when the acceptance criteria require real official Plickers cards.

## Product invariants

1. Plickers compatibility means existing official Card 1–63 must remain physically usable; do not replace them with ArUco/AprilTag cards.
2. Historical sessions are immutable records. Editing a source question later must never alter a prior session's question snapshot.
3. `absent`, `unanswered`, and `incorrect` are distinct states and must never be collapsed.
4. Persist raw student responses so aggregates can be recomputed.
5. During collection, answer visibility must be controllable to reduce peer-following effects.
6. Student data is personal data: minimize exposure and avoid logging unnecessary identifying information.

## Phase gate

Phase 0 scanner feasibility is a hard gate. Do not build substantial Phase 1–5 UI until the official Plickers Card 1–63 scanner POC demonstrates acceptable recognition of card ID and A/B/C/D orientation on representative phone-camera classroom captures.
