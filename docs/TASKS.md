# CardPulse — Tasks

## Current milestone
**Phase 0 — Plickers-compatible scanner feasibility POC**

Phase 0 is a hard gate. Do not build substantial Phase 1–5 product UI until the scanner POC demonstrates reliable official Plickers Card 1–63 recognition in representative classroom conditions.

## Current task
**M0.1 — Build reference-set extraction + single-card decoder baseline**

### Goal
Create the first executable scanner baseline that can identify official Plickers card ID and orientation from still images/reference captures.

### Required work
- [ ] Create minimal TypeScript/JS project shell suitable for Next.js integration later.
- [ ] Add a scanner module with a stable output contract:
  ```ts
  type ScanDetection = {
    cardId: number;
    answer: 'A' | 'B' | 'C' | 'D';
    confidence: number;
  };
  ```
- [ ] Establish a reproducible reference-data generation path for official Plickers Cards 1–63.
- [ ] Normalize a candidate card image with perspective correction/canonical orientation handling.
- [ ] Implement baseline card-pattern matching for known IDs 1–63.
- [ ] Implement 0°/90°/180°/270° orientation inference and map it to A/B/C/D.
- [ ] Add confidence scoring and a rejection threshold for uncertain matches.
- [ ] Add tests for known card IDs and rotations using generated/golden fixtures where legally/practically usable.
- [ ] Document assumptions and known limitations.

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
- [ ] M0.2 — Multi-card candidate detection + perspective normalization
- [ ] M0.3 — Video-frame deduplication + stable response collection
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
