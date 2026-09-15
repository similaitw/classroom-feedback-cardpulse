import test from 'node:test';
import assert from 'node:assert/strict';
import { scanCandidate, thresholds } from '../dist/index.js';
import { referenceData } from '../dist/references.generated.js';
import { bounds, golden, manifest, render, rotate, warp } from './helpers.mjs';

function expectDetection(result, cardId, answer) {
  assert.equal(result.status, 'detected', JSON.stringify(result));
  assert.equal(result.detection.cardId, cardId);
  assert.equal(result.detection.answer, answer);
  assert.ok(result.detection.confidence >= thresholds.minConfidence && result.detection.confidence <= 1);
  assert.deepEqual(Object.keys(result.detection).sort(), ['answer', 'cardId', 'confidence']);
}
function expectReject(result, reason) {
  assert.equal(result.status, 'uncertain', JSON.stringify(result));
  if (reason) assert.equal(result.reason, reason);
  assert.equal('detection' in result, false);
  assert.equal('cardId' in result, false);
  assert.ok(Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 1);
}

test('dictionary contains exactly official IDs 1–63', () => {
  assert.deepEqual(referenceData.references.map(r => r.cardId), Array.from({ length: 63 }, (_, i) => i + 1));
  assert.equal(referenceData.sourceSha256, manifest.sourceSha256);
});
for (const ref of referenceData.references) {
  test(`generated official reference ${ref.cardId}: all four clockwise rotations`, () => {
    let image = render(ref.rows);
    for (const answer of ['A', 'D', 'C', 'B']) {
      expectDetection(scanCandidate(image, bounds(image)), ref.cardId, answer);
      image = rotate(image);
    }
  });
}
for (const fixture of manifest.fixtures) {
  test(`independent PDF golden ${fixture.cardId}: four rotations, perspective and lighting/noise`, () => {
    let image = golden(fixture);
    for (const answer of fixture.answersCW) {
      expectDetection(scanCandidate(image, bounds(image)), fixture.cardId, answer);
      const projected = warp(image);
      expectDetection(scanCandidate(projected.image, projected.quad), fixture.cardId, answer);
      // Deterministic small sensor noise and reduced exposure; no random test outcomes.
      const dim = { ...projected.image, data: projected.image.data.map((v, i) => Math.round(30 + v * .7 + (i * 17 % 5) - 2)) };
      expectDetection(scanCandidate(dim, projected.quad), fixture.cardId, answer);
      image = rotate(image);
    }
  });
}
test('orientation anchors observed on printed PDF, independent of generated metadata', () => {
  for (const [id, answer] of [[1, 'A'], [2, 'D'], [40, 'B'], [41, 'C'], [63, 'D']]) {
    const image = golden(manifest.fixtures.find(f => f.cardId === id));
    expectDetection(scanCandidate(image, bounds(image)), id, answer);
  }
});
test('uniform white/black/gray, low contrast, unrelated texture, gradient and occlusion reject', () => {
  const source = golden(manifest.fixtures[0]);
  for (const value of [0, 128, 255]) {
    expectReject(scanCandidate({ ...source, data: new Uint8Array(10000).fill(value) }, bounds(source)), 'low-contrast');
  }
  const low = { ...source, data: source.data.map(v => 110 + Math.round(v * .1)) };
  expectReject(scanCandidate(low, bounds(low)), 'low-contrast');
  for (const data of [
    Uint8Array.from({ length: 10000 }, (_, i) => (i * 73 + Math.floor(i / 100) * 37) % 256),
    Uint8Array.from({ length: 10000 }, (_, i) => Math.round(i % 100 * 255 / 99)),
    source.data.map((v, i) => Math.floor(i / 100) >= 40 && Math.floor(i / 100) < 60 && i % 100 >= 40 && i % 100 < 60 ? 17 : v),
  ]) expectReject(scanCandidate({ ...source, data }, bounds(source)), 'poor-match');
});
test('blend of two valid references is uncertain, never tie-broken to an ID', () => {
  const a = render(referenceData.references[0].rows), b = render(referenceData.references[1].rows);
  const blend = { ...a, data: a.data.map((v, i) => Math.round((v + b.data[i]) / 2)) };
  expectReject(scanCandidate(blend, bounds(blend)));
});
test('borderline contrast has insufficient confidence despite matching shape', () => {
  const image = render(referenceData.references[0].rows);
  const dim = { ...image, data: image.data.map(v => v < 128 ? 100 : 160) };
  expectReject(scanCandidate(dim, bounds(dim)), 'ambiguous');
});
test('invalid buffers and invalid, outside, concave, reversed or degenerate quads reject', () => {
  const image = render(referenceData.references[0].rows), quad = bounds(image);
  for (const bad of [null, { ...image, width: NaN }, { ...image, width: 1.5 }, { ...image, data: new Uint8Array(1) }]) {
    expectReject(scanCandidate(bad, quad), 'invalid-image');
  }
  for (const bad of [null, [], new Array(4), [...quad].reverse(), [quad[0], quad[2], quad[1], quad[3]],
    [{ x: -1, y: 0 }, ...quad.slice(1)], [{ x: NaN, y: 0 }, ...quad.slice(1)],
    [quad[0], quad[0], quad[2], quad[3]], [quad[0], quad[1], { x: 10, y: 10 }, quad[3]],
    [quad[0], { x: 101, y: 0 }, quad[2], quad[3]]]) {
    expectReject(scanCandidate(image, bad), 'invalid-quad');
  }
  const tiny = render(referenceData.references[0].rows, 20);
  expectReject(scanCandidate(tiny, bounds(tiny)), 'low-resolution');
  expectReject(scanCandidate(image, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 99, y: 1 }, { x: 1, y: 1 }]), 'low-resolution');
});
