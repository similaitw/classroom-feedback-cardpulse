# CardPulse — Tasks

## Current milestone
**Phase 0 — Plickers-compatible scanner feasibility POC**

Phase 0 is a hard gate. Do not build substantial Phase 1–5 product UI until the scanner POC demonstrates reliable official Plickers Card 1–63 recognition in representative classroom conditions.

## Current task
**M0.4 — Real-phone classroom benchmark dataset and quantitative thresholds**

PC/repository engineering completed; real-phone capture and evaluation remain pending. Phase 0 remains open; the real-phone classroom gate has not passed.

### M0.4 PC engineering (2026-09-15)

- [x] Versioned real-capture JSON Schema and strict runtime validation: provenance/split, device/conditions, ordered source timestamps, official card ID/answer/box annotations, file hashes and dimensions.
- [x] Capture/annotation protocol, independent held-out split, official 1–63 and four-answer coverage, negative/stress clips, local media handling.
- [x] Local CLI through `npm run benchmark:captures -- <manifest> <output-directory> [--validate-only]`; canonical grayscale PGM replay through unchanged `scanFrame()` and `TemporalCollector`.
- [x] Geometry-first frame metrics, collection recall/wrong locks/latency, PC scan timing, condition strata, raw detections/rejections/events and reproducibility hashes in JSON/Markdown reports.
- [x] Proposed quantitative targets and explicit distinction between pooled PC checks and reviewed on-device gate evidence. See [CAPTURE_BENCHMARK.md](CAPTURE_BENCHMARK.md).
- [ ] Acquire and independently annotate real-phone official-card classroom captures.
- [ ] Pilot/freeze targets, evaluate held-out coverage and measure sustained active-camera phone performance before M0.5 review.

### M0.4 PC validation evidence

- `npm test`: 119/119 passed (115 existing + 4 harness tests); TypeScript build passed.
- `node --test tests/benchmark-captures.test.mjs`: 4/4 passed after final harness edits; covers malformed schema, metric errors/duplicates/misses, negative and empty denominators, raster integrity, hash rejection, sequence reset, CLI validation/report generation and overwrite refusal.
- `npm run typecheck`, `npm run lint`, `git diff --check`: passed.
- `npm run benchmark:captures -- tmp/m04-pc-smoke/manifest.json benchmark-results/m04-pc-smoke`: passed; local ignored JSON/Markdown artifacts, PDF-derived development data only, 60 repeated frames / 2 sequences, 150 annotated card instances and 30 negative frames. Joint precision/recall 100%; negative false-positive frames 0/30; collection 5/5, wrong locks 0, observation p95 200 ms; PC scan median 13.78 ms / p95 26.85 ms (60 samples including negative frames, 3 warmups per sequence). These correlated fixtures are harness smoke evidence, not classroom accuracy evidence.
- Every report keeps Phase 0 `NOT_EVALUATED`. Current task stays M0.4 until real-phone work is complete; no later UI or M0.5 approval is included.
- No commit, push, PR or GitHub issue modification, per explicit control-issue #13 instructions.

## Completed task — M0.3
**Video-frame deduplication + stable response collection**

- [x] Browser-compatible collector over `scanFrame()` results; independent cardId state.
- [x] Observation count + elapsed-time confirmation, transient miss tolerance, irregular timestamp handling.
- [x] First stable answer locks the card for the question; pre-confirmation answer changes restart evidence.
- [x] Uncertain/low-confidence exclusion, same-frame duplicate/conflict handling, per-question deduplication.
- [x] Explicit question start/reset and token isolation of delayed old-question frames.
- [x] Deterministic sequences and official PDF multi-card integration; all M0.1/M0.2 regressions retained.
- [x] Policy, parameters, transitions, benchmark and limitations in [SCANNER_TEMPORAL.md](SCANNER_TEMPORAL.md).

### Completion evidence (2026-09-15)
- `npm test`: 115 tests passed (103 existing + 12 temporal); build passed.
- `npm run typecheck`, `npm run lint`: passed.
- `npm run benchmark:collector`: Windows x64 / Node v24.18.0, 63 cards; 30 batches of 4000 frames after 5 warmup batches. Batch-mean per-frame median 0.008009 ms / p95 0.008147 ms; excludes scanner/camera.
- Temporal sequence and official PDF-derived evidence only; real-phone classroom acceptance remains unproven.
- No commit, push, PR or GitHub issue modification, per explicit control-issue instructions.

## Completed task — M0.2
**Multi-card candidate detection + perspective normalization**

- [x] Browser-compatible full-frame detector; clockwise pattern-boundary `Quad` output.
- [x] Rotation, scale, perspective and exposure variation; geometric polygon-IoU NMS.
- [x] Multi-card `scanFrame()` calls existing `scanCandidate()`; deterministic ordering and uncertain isolation.
- [x] 2–5 card official PDF golden composites, four orientations, multiple positions/sizes, perspective, lighting and distractors.
- [x] Negative frames produce zero successful detections; all M0.1 regressions pass.
- [x] Document pipeline, parameters, reproducible benchmark and limitations in [SCANNER_MULTICARD.md](SCANNER_MULTICARD.md).

### Completion evidence (2026-09-15)
- `npm test`: 103 tests passed (including all 81 M0.1 tests); build passed.
- `npm run typecheck`, `npm run lint`: passed.
- `npm run benchmark:frame`: Windows x64 / Node v24.18.0, five cards in 640×420; 30 warmed samples, median 39.61 ms / p95 43.48 ms.
- Official PDF-derived composite evidence only, no real-phone captures. Phase 0 classroom acceptance remains unproven.
- Per the explicit control-issue task instructions, no commit, push, PR or GitHub issue modification was performed.

## Completed task
**M0.1 — Build reference-set extraction + single-card decoder baseline**

### Goal
Create the first executable scanner baseline that can identify official Plickers card ID and orientation from still images/reference captures.

### Required work
- [x] Create minimal TypeScript/JS project shell suitable for Next.js integration later.
- [x] Add a scanner module with a stable output contract:
  ```ts
  type ScanDetection = {
    cardId: number;
    answer: 'A' | 'B' | 'C' | 'D';
    confidence: number;
  };
  ```
- [x] Establish a reproducible reference-data generation path for official Plickers Cards 1–63.
- [x] Normalize a candidate card image with perspective correction/canonical orientation handling.
- [x] Implement baseline card-pattern matching for known IDs 1–63.
- [x] Implement 0°/90°/180°/270° orientation inference and map it to A/B/C/D.
- [x] Add confidence scoring and a rejection threshold for uncertain matches.
- [x] Add tests for known card IDs and rotations using generated/golden fixtures where legally/practically usable.
- [x] Document assumptions and known limitations.

### Completion evidence (2026-09-15)
- `npm test`: 81 tests passed, including all 63 IDs × 4 rotations and 9 independent official PDF golden crops × 4 rotations × 3 conditions (original, perspective, perspective with exposure/noise).
- `npm run build`, `npm run typecheck`, `npm run lint`: passed.
- `npm run references:check`: byte-identical regeneration of all 63 references and 9 golden crops; 252 unique ID/orientation pairs.
- Source PDF is pinned by URL and SHA-256; extraction validates printed IDs and letter placement. See [SCANNER_BASELINE.md](SCANNER_BASELINE.md) for reproduction, thresholds, contract and limitations.
- This completes the M0.1 reference-image baseline only. No real-phone captures were used; Phase 0 classroom acceptance remains unproven.
- Per this task's explicit instructions, evidence is recorded locally; no commit, push, PR or GitHub issue update was performed.

### Acceptance criteria
- Given at least a representative subset of official Card 1–63 reference images, decoder returns the correct `cardId` for all tested fixtures.
- All four rotations are covered and deterministically map to A/B/C/D.
- Scanner can return a low-confidence/rejected result rather than forcing a guess.
- Tests can be run locally with one documented command.
- No custom replacement marker format (ArUco/AprilTag/etc.) is introduced.

### Out of scope for M0.1
- Live camera UI
- Multi-card frame detection
- Cross-frame deduplication
- Supabase/auth
- Classes/rosters/question bank
- Production deployment

## Phase 0 backlog
- [x] M0.2 — Multi-card candidate detection + perspective normalization
- [x] M0.3 — Video-frame deduplication + stable response collection
- [ ] M0.4 — Real-phone classroom benchmark dataset and quantitative thresholds
- [ ] M0.5 — Phase 0 gate review: pass/fail and architecture decision

## Later roadmap
- [ ] Phase 1 — App shell, auth, classes, roster import, card assignments
- [ ] Phase 2 — Question bank, images, tags, question sets
- [ ] Phase 3 — Live projector + teacher phone scanning + realtime sync
- [ ] Phase 4 — Immutable session history, raw responses, analytics, CSV/Excel export
- [ ] Phase 5 — Advanced analytics, bulk import, AI assistance, richer reports

## Completion protocol
When a task is completed:
1. Run relevant tests/lint/type checks.
2. Record test evidence in the GitHub Issue/PR.
3. Update this file: mark completed item(s) and set the next `Current task`.
4. Commit and push.
