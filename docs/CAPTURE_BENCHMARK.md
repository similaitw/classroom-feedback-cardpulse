# M0.4 — Real-phone capture benchmark v1

## Status and scope

The PC engineering harness is available. **No real-phone dataset or classroom gate evidence is included.** PDF composites in tests verify the harness only. M0.4 real capture and M0.5 review remain open. This adds no camera UI and changes no scanner/collector policy.

## Capture protocol v1

1. Use existing official printed Plickers Cards 1–63, including their printed A/B/C/D labels. Record rear-camera phone model, OS, capture resolution and camera mode; never record serial numbers, accounts, names or student/card assignments. Prefer an empty classroom with consenting adult card holders; frame hands/cards, avoid faces, mute audio, and keep recordings locally in ignored `data/real-captures/`. Agree local access and deletion dates before capture. Reports contain card answers and remain local too.
2. Start with a development pilot, then freeze decoder/collector settings and these proposed thresholds before collecting a separate held-out evaluation set. Split by entire recording session, not adjacent frames; do not tune on the held-out set. Keep a local acquisition log with recording hashes, session grouping, extraction command/tool version, frame selection, resize/grayscale policy and independent annotation/review. This log must not include participant identity.
3. Suggested minimum held-out coverage: 2 Android phone models (one ordinary midrange), at least 2 independent sessions per device; 2 m, 3.5 m and 5 m; normal/dim/backlit illumination; static and handheld/panning; clear and partly occluded cards. Include 1, 5, 15 and 30 simultaneously held cards. Aim for at least 3 independent 5–10 second clips per primary device × distance × normal-light condition. Include stress clips separately; do not discard failures.
4. Cover every ID 1–63 and every answer A/B/C/D in real captures (prefer each of the 252 pairs at least twice in independent clips). Collect at least 300 negative frames from multiple clips: empty room, text, clothing, non-card patterns. Repeated frames are correlated and do not count as independent evidence. Dataset size is a starting proposal, not statistical proof.
5. One sequence is one question with fixed intended answers. Hold answers unchanged; begin a new sequence when any answer changes. Keep timestamps relative to the source clip in milliseconds. Extract at 10 Hz or faster, preserving actual presentation times and dropped-frame gaps; do not invent evenly spaced timestamps for variable-rate video. Include the start of exposure and enough time (at least 2 s) after each card first appears to measure collection. Use a separate dataset version when extraction changes.
6. Decode video locally with an existing video tool. Convert to 8-bit grayscale with a recorded conversion policy, no mirroring or geometric enhancement; resize only with documented scale and transform annotations to the final pixels. Canonical files have exactly `P5\nWIDTH HEIGHT\n255\n` followed by WIDTH × HEIGHT bytes. JPEG/PNG/video are acquisition inputs, not direct CLI inputs. Re-encode tool-produced PGM headers to this exact format if needed, without stripping raster whitespace bytes. Keep full camera frames; do not crop cards for the benchmark. Recommended initial processing size: 640×480 or 1280×720, with native capture size recorded separately.
7. Annotate every visible official card, including small, blurred and partly occluded cards whose identity is known from the capture plan. Do not label from scanner predictions. `box` encloses the central pattern boundary (not the surrounding paper/text), in processed image pixels. A second person checks card IDs, the printed letter facing up, boxes, negative frames and source timestamps. Fully out-of-frame cards have no annotation; no exclusion/ignore regions in v1. Clips whose identity cannot be established require recapture/review, not selective removal of hard frames.
8. Validate all frames and hashes before running. Preserve a reviewed immutable manifest and report pair. A `real-phone` string is a provenance assertion requiring human review, not proof. Do not commit raw classroom media.

## Dataset schema v1

Machine-readable structural schema: [capture-dataset.schema.json](capture-dataset.schema.json). The authoritative executable validator is `validateManifest()` in `scripts/benchmark-core.mjs`; it additionally enforces bounds, unique sequence/card IDs, ordered timestamps, constant per-card answers and safe relative paths. Unknown fields are rejected. No roster/student data fields exist.

The manifest directory is the dataset root. All `file` paths are relative, forward-slash `.pgm` paths without `.`/`..`, absolute paths or symlinks escaping that root. SHA-256 covers the complete PGM bytes. Sequences and frames must be nonempty; `cards: []` is a negative frame. Frame dimensions are integers 1–4096, at most 8,388,608 pixels. Boxes are `[left, top, right, bottom]` with positive area inside the frame. IDs are integers 1–63, answers A/B/C/D. Timestamps are finite, nonnegative and strictly increasing within a sequence; each sequence resets the collector. Device capture dimensions describe the original camera; frame dimensions describe processed input.

Example shape below is **not measured evidence**; replace the hash and annotation using actual pixels:

```json
{
  "schemaVersion": 1,
  "datasetId": "classroom-pilot-v1",
  "provenance": "real-phone",
  "split": "development",
  "protocolVersion": "1",
  "sequences": [{
    "sequenceId": "session01-clip01",
    "device": {"model": "model-name", "os": "Android-version", "camera": "rear-1x", "captureWidth": 1920, "captureHeight": 1080},
    "conditions": {"distanceM": 3.5, "lighting": "normal", "motion": "handheld", "occlusion": "none"},
    "frames": [{
      "file": "clip01/000001.pgm",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "timestampMs": 0, "width": 640, "height": 360,
      "cards": [{"cardId": 1, "answer": "A", "box": [100, 90, 180, 170]}]
    }]
  }]
}
```

## Run locally (PowerShell, repository root)

```powershell
New-Item -ItemType Directory -Force benchmark-results/pilot-v1
npm run benchmark:captures -- data/real-captures/pilot-v1/manifest.json benchmark-results/pilot-v1 --validate-only
npm run benchmark:captures -- data/real-captures/pilot-v1/manifest.json benchmark-results/pilot-v1
```

Node 22+, existing npm dependencies only; no network, camera or image libraries required. Output directory must exist inside the repository. Existing `report.json`/`report.md` are never overwritten. Exit 1 means invalid input/execution failure; exit 0 means completed analysis, **not threshold/gate approval**. Failed proposed checks are report data. `--help` prints usage. Validation-only checks schema, files, hashes and rasters without producing a report.

Reports include input manifest SHA-256, built scanner/harness/package-lock hashes, Node/platform/CPU, exact scanner/detector/collector settings, sample counts, raw frame detections/rejections and confirmed events. Accuracy counts are deterministic for fixed pixels/code; timing is host-dependent. Rebuild is automatic. Reports do not include media, participant identities or absolute input paths.

## Metric definitions

- Match predictions to truth using descending axis-aligned pattern-box IoU ≥ 0.5, deterministic greedy one-to-one assignment, independent of ID/answer. Each prediction/truth is used once. This is a simple reproducible localization rule; overlapping perspective boxes may need manual audit. It is not optimal polygon assignment.
- Joint recall = correct localized ID+answer / annotated cards. Joint precision = correct localized ID+answer / successful predictions. Wrong labels hurt both. Duplicate predictions count against precision. Missing detections remain in the recall denominator.
- Report matched-ID accuracy and answer accuracy conditional on correct ID separately. Wrong IDs, wrong answers with correct ID, unmatched predictions (`spurious`), unmatched truth (`missed`) and uncertain candidate count are distinct. Rejected candidates are not successful predictions; uncertain count is candidate-level and is not a per-card rejection rate.
- Negative false-positive rate = negative frames with ≥1 successful detection / all negative frames. False negatives have no meaning on an empty frame. Zero denominators are JSON `null` / `NO DATA`, never 100% or zero by default.
- Sequence collection truth = union of annotated IDs, with the one fixed answer per ID. Correct = first locked answer equals truth and is confirmed no earlier than its first annotated exposure. Wrong/unknown/premature locks are errors. Collection recall = correct locks / sequence-ID opportunities; uncollected includes wrongly locked target cards. Every sequence resets state, even if IDs recur.
- Collection latency = source `confirmedAt` minus first annotated exposure. Median/p95 use successful locks only; misses/wrong locks are reported alongside them (no hidden timeout success). This is offline observation latency, not wall-clock camera-to-screen latency. Sparse captures and clips ending early penalize recall and must be inspected.
- PC scan timing uses one scan per frame after 3 first-frame warmups per sequence. Image loading/checksums and collector work are excluded. Median/p95 use nearest rank `ceil(p*n)` on all measured frames. No throughput/phone FPS claim follows from this number.
- Reports include totals and device/distance/light/motion/occlusion strata. Compare strata and sample counts before any review; a large easy clip can dominate pooled recall. For uncertainty estimates, bootstrap whole independent clips/sessions in follow-up analysis, never individual correlated video frames.

## Proposed quantitative thresholds (freeze after pilot, before held-out run)

| Measure | Suggested target | Reason |
|---|---:|---|
| Frame joint recall | ≥95% | Most visible cards detected; collection can recover transient misses |
| Frame joint precision | ≥99.5% | False answers are more harmful than waiting |
| Negative frame false-positive rate | ≤1% | Reject classroom distractors |
| Sequence collection recall | ≥95% within the protocol clips | Useful class collection coverage |
| Wrong/unknown/premature locked responses | 0 observed | First-answer locking cannot repair a wrong submission |
| Correct-lock observation latency p95 | ≤2,000 ms | Prompt feedback; inspect misses alongside latency |
| PC scanFrame p95 | ≤100 ms advisory only | Initial 10 Hz processing budget, not a phone gate |
| Actual phone processing + collection p95 | ≤100 ms, sustained ≥10 processed frames/s | Must be measured on target phone with camera active |

Apply accuracy/collection targets to each primary device × distance normal-light group as well as pooled held-out results. Report stress conditions separately and explicitly decide supported conditions in M0.5; do not silently average away failure at 5 m. The CLI checks pooled proposals only and always emits `phase0Gate: NOT_EVALUATED`. On-device timings, sustained thermal behavior (at least 5 minutes), camera acquisition/render latency, full coverage and independent annotation are manual evidence requirements. Zero observed wrong locks is not proof of zero risk. These are project engineering proposals, not empirically calibrated or external standards.

## Remaining work

Acquire and independently label representative real-phone official-card captures; pilot/review and freeze targets; run held-out data; measure active-camera phone performance; audit failures and decide M0.5. No such evidence can be substituted with the synthetic/PDF integration tests.
