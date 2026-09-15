import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCandidate } from '../dist/index.js';
import { bounds, H, project } from './helpers.mjs';

test('identity normalization preserves pixel centers and every pixel', () => {
  const image = { width: 50, height: 50, data: Uint8Array.from({ length: 2500 }, (_, i) => i % 256) };
  assert.deepEqual(normalizeCandidate(image, bounds(image)), image);
});
test('projective normalization agrees with analytic grayscale coordinate ramp', () => {
  const image = { width: 160, height: 160,
    data: Uint8Array.from({ length: 160 * 160 }, (_, i) => i % 160) };
  const quad = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => project(H, u, v));
  const actual = normalizeCandidate(image, quad);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const expected = project(H, (x + .5) / 50, (y + .5) / 50).x - .5;
    assert.ok(Math.abs(actual.data[y * 50 + x] - expected) <= .51);
  }
});
test('normalization fails explicitly on invalid geometry', () => {
  assert.throws(() => normalizeCandidate({ width: 1, height: 1, data: new Uint8Array(1) }, []), RangeError);
});
