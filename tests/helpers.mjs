import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import assert from 'node:assert/strict';

export const manifest = JSON.parse(readFileSync(new URL('./fixtures/manifest.json', import.meta.url), 'utf8'));
export function golden(fixture) {
  const bytes = readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
  const header = Buffer.from('P5\n100 100\n255\n');
  assert.deepEqual(bytes.subarray(0, header.length), header);
  assert.equal(bytes.length, header.length + 10000);
  return { width: 100, height: 100, data: new Uint8Array(bytes.subarray(header.length)) };
}
export function bounds(image) {
  return [{ x: 0, y: 0 }, { x: image.width, y: 0 }, { x: image.width, y: image.height }, { x: 0, y: image.height }];
}
export function rotate(image) {
  const data = new Uint8Array(image.data.length);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    data[x * image.height + image.height - 1 - y] = image.data[y * image.width + x];
  }
  return { width: image.height, height: image.width, data };
}
export function render(rows, size = 100) {
  return { width: size, height: size, data: Uint8Array.from({ length: size * size }, (_, i) =>
    rows[Math.floor(Math.floor(i / size) * 5 / size)][Math.floor((i % size) * 5 / size)] === '1' ? 17 : 255) };
}

// Test-only inverse rendering, independent from production's quad-to-square implementation.
export const H = [100, 18, 15, -4, 105, 20, .22, -.12, 1];
export function project(matrix, u, v) {
  const w = matrix[6] * u + matrix[7] * v + matrix[8];
  return { x: (matrix[0] * u + matrix[1] * v + matrix[2]) / w,
    y: (matrix[3] * u + matrix[4] * v + matrix[5]) / w };
}
export function warp(source, matrix = H) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  // Adjugate is sufficient for homogeneous coordinates (determinant cancels).
  const inverse = [e*i-f*h, c*h-b*i, b*f-c*e, f*g-d*i, a*i-c*g, c*d-a*f, d*h-e*g, b*g-a*h, a*e-b*d];
  const width = 160, height = 160, data = new Uint8Array(width * height).fill(220);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const uv = project(inverse, x + .5, y + .5);
    if (uv.x >= 0 && uv.x < 1 && uv.y >= 0 && uv.y < 1) {
      data[y * width + x] = source.data[Math.floor(uv.y * source.height) * source.width + Math.floor(uv.x * source.width)];
    }
  }
  return { image: { width, height, data }, quad: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => project(matrix, u, v)) };
}
