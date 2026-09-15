# CardPulse — Project Specification

## 1. Product vision

CardPulse is a classroom formative-assessment system that preserves the low-friction physical-card workflow of Plickers while adding teacher-owned question banks, durable student response history, and longitudinal analytics.

Primary workflow: teacher projects a question, students rotate their assigned physical card to A/B/C/D, teacher scans the room with a phone, CardPulse records responses in real time, then optionally reveals results.

## 2. Hard requirements

### 2.1 Physical-card compatibility
- Target official Plickers Card IDs 1–63.
- The same printed card should remain usable with official Plickers and CardPulse.
- Scanner output contract: `{ cardId, answer, confidence }`.
- `answer` is one of `A | B | C | D` determined from card orientation.
- Multiple cards in one camera frame must be supported.
- Duplicate detections in nearby frames must be deduplicated.
- Do not substitute ArUco/AprilTag/custom markers when compatibility is required.

### 2.2 Classes and students
- Create/edit/archive classes.
- Import CSV and Excel rosters.
- Minimum import: `座號,姓名`.
- Extended import: `座號,學號,姓名,卡片編號`.
- Auto-assign card by seat number when valid and available.
- Manual card reassignment and temporary replacement are supported.

### 2.3 Question bank
- A/B/C/D single-choice questions.
- Prompt, four choices, correct answer, explanation.
- Image attachment/reference.
- Subject, unit, tags, difficulty.
- Question sets/activities containing ordered questions.
- Later extensions: CSV/Excel bulk import, AI-assisted generation, random selection.

### 2.4 Live Classroom
- Desktop/projector view shows current question.
- Teacher mobile/PWA scanner joins the same session.
- Live received count and missing-student list.
- Teacher can hide individual answers/distribution while collection is active.
- End collection explicitly; then reveal distribution/correct answer if desired.
- Live state should recover gracefully from temporary network interruption where practical.

### 2.5 Historical integrity
Every session is permanently represented with:
- class and timestamps
- subject/activity metadata
- enrolled class size
- actual participants
- absentees/non-participants
- ordered session questions
- immutable snapshot of each question as presented
- raw per-student responses

Question snapshot must include at least prompt, choices, correct answer, explanation, image reference/content metadata, subject/unit/tags needed for historical reporting.

Editing/deleting a source question must not mutate historical snapshots.

### 2.6 Response semantics
These are distinct:
- `absent`: student did not participate in the session
- `unanswered`: participating student did not submit a response to this question
- `answered`: response exists; may be correct or incorrect

Example: 30 enrolled, 2 absent, 28 participating, 27 answered, 18 correct. Effective-response accuracy is `18/27 = 66.7%`. Other denominators may be displayed, but labels must state the denominator and never conflate absence with incorrectness.

### 2.7 Analytics
Single session:
- participation and unanswered rates
- average/effective accuracy
- per-question accuracy
- A/B/C/D distribution
- easiest/hardest questions

Student longitudinal:
- questions answered/correct
- accuracy trend
- participation trend
- subject/unit/tag performance

Class longitudinal:
- session accuracy trend
- subject/unit performance
- student × unit heatmap
- weak-unit identification

Reporting filters: class, date range, subject, unit, student. Export raw/derived data to CSV/Excel. PDF is a later extension.

## 3. Proposed architecture

- Web: Next.js + TypeScript + Tailwind CSS
- Backend/database/auth/realtime: Supabase
- Mobile scanner: responsive PWA using browser camera APIs where feasible
- CV: browser-compatible OpenCV/WASM or another locally evaluated CV path; avoid locking implementation before Phase 0 evidence
- Hosting: Vercel

The scanner should perform as much recognition on-device as practical to reduce latency and avoid uploading classroom video.

## 4. Conceptual data model

- `teachers`
- `classes`
- `students`
- `class_students`
- `card_assignments`
- `questions`
- `question_sets`
- `question_set_items`
- `sessions`
- `session_participants`
- `session_questions`
- `responses`

Key rules:
- `session_questions.question_snapshot` stores immutable JSON/versioned snapshot data.
- `responses` stores raw answer, student, card ID, correctness, timestamp, and scanner confidence where available.
- participation is explicit rather than inferred solely from response presence.

## 5. Phase 0 — Scanner feasibility POC

Goal: prove official Plickers Card 1–63 compatibility before substantial application work.

Research/implementation approach:
1. Obtain/use the official expanded Card 1–63 reference set for development/reference according to applicable terms.
2. Extract/derive reference representations of the central card patterns.
3. Build a reference dictionary/template strategy for the 63 known patterns rather than assuming the proprietary encoding must first be reverse-engineered.
4. Detect candidate card quadrilaterals/regions.
5. Perspective-normalize the candidate.
6. Determine card identity by reference matching/feature strategy.
7. Determine rotation and map orientation to A/B/C/D.
8. Return confidence and reject uncertain detections.
9. Deduplicate the same card across frames.
10. Evaluate single-card and multi-card captures at representative classroom distances/angles/lighting.

### Phase 0 acceptance gate
A normal modern Android phone, under representative classroom lighting and approximately 2–5 m scanning conditions, must demonstrate reliable multi-card detection returning correct `cardId + A/B/C/D`, with useful confidence/rejection behavior. Exact quantitative thresholds should be established from the initial benchmark dataset and documented before declaring the milestone complete.

Synthetic/PDF-only tests can validate algorithms but cannot alone satisfy the final Phase 0 gate.

## 6. Roadmap

- Phase 0: official-card scanner POC and benchmark
- Phase 1: project shell, auth, classes, roster import, card assignments
- Phase 2: question bank and question sets
- Phase 3: live projector/mobile scanning session and realtime sync
- Phase 4: immutable session persistence, results, analytics, CSV/Excel export
- Phase 5: advanced analytics, bulk question import, AI assistance, richer reports

## 7. Privacy and security

- Treat student names/IDs and response histories as personal educational data.
- Avoid unnecessary camera-frame persistence.
- Prefer on-device CV; do not store video by default.
- Apply row-level authorization in the backend.
- Provide export and deletion workflows before production school use.
- Logs must not expose full student datasets unnecessarily.

## 8. Testing strategy

- Unit tests for orientation mapping, matching, deduplication and response-state semantics.
- Golden-image scanner tests covering card IDs/rotations.
- Real-device benchmark captures for Phase 0 gate.
- Import validation tests for CSV/Excel.
- Database tests for immutable historical snapshots and participation semantics.
- Integration/E2E tests for projector + scanner session lifecycle.
- Regression test proving editing a source question does not change historical session output.
