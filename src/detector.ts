import { quadResolution, validImage, validQuad } from './geometry.js';
import type { GrayImage, Point, Quad } from './geometry.js';

/** Fixed, bounded proposal policy. All coordinates remain in source pixels. */
export const detectorParameters = Object.freeze({
  levels: Object.freeze([64, 112, 160, 208]),
  minPixels: 200,
  minResolution: 25,
  minFill: .4,
  maxHullLoss: .08,
  nmsIoU: .65,
  maxCandidates: 256,
});

const cross = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function area(points: readonly Point[]): number {
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p.x * q.y - p.y * q.x;
  }, 0)) / 2;
}
function hull(points: Point[]): Point[] {
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (input: Point[]): Point[] => {
    const result: Point[] = [];
    for (const p of input) {
      while (result.length >= 2 && cross(result[result.length - 2]!, result[result.length - 1]!, p) <= 0) result.pop();
      result.push(p);
    }
    result.pop();
    return result;
  };
  return [...half(points), ...half([...points].reverse())];
}

/** Exact convex polygon overlap, avoiding bounding-box suppression of nearby cards. */
export function quadIoU(a: Quad, b: Quad): number {
  let polygon: Point[] = [...a];
  for (let i = 0; i < 4 && polygon.length; i++) {
    const p = b[i]!, q = b[(i + 1) % 4]!;
    const output: Point[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const s = polygon[j]!, e = polygon[(j + 1) % polygon.length]!;
      const ds = cross(p, q, s), de = cross(p, q, e);
      if (ds >= 0) output.push(s);
      if ((ds >= 0) !== (de >= 0)) {
        const t = ds / (ds - de);
        output.push({ x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) });
      }
    }
    polygon = output;
  }
  const intersection = area(polygon);
  return intersection / (area(a) + area(b) - intersection);
}

export const compareQuads = (a: Quad, b: Quad): number => {
  for (let i = 0; i < 4; i++) {
    const difference = a[i]!.y - b[i]!.y || a[i]!.x - b[i]!.x;
    if (difference) return difference;
  }
  return 0;
};

/** Find pattern bounds (not paper bounds). Invalid images throw RangeError.
 * Proposals are geometry only: callers must decode before treating them as cards.
 */
export function detectCandidates(image: GrayImage): Quad[] {
  if (!validImage(image)) throw new RangeError('Invalid grayscale image');
  const { width, height, data } = image;
  const visited = new Uint8Array(data.length), queue = new Int32Array(data.length);
  const proposals: { quad: Quad; quality: number }[] = [];
  for (const level of detectorParameters.levels) {
    visited.fill(0);
    for (let seed = 0; seed < data.length; seed++) {
      if (visited[seed] || data[seed]! >= level) continue;
      let head = 0, tail = 1;
      queue[0] = seed;
      visited[seed] = 1;
      // Two extremal pixels per row suffice for the convex hull and bound memory.
      const rows = new Map<number, [number, number]>();
      while (head < tail) {
        const index = queue[head++]!, x = index % width, y = Math.floor(index / width);
        const row = rows.get(y);
        if (row) { row[0] = Math.min(row[0], x); row[1] = Math.max(row[1], x); }
        else rows.set(y, [x, x]);
        for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
          y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
          if (next >= 0 && !visited[next] && data[next]! < level) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      if (tail < detectorParameters.minPixels) continue;
      const points: Point[] = [];
      for (const [y, [left, right]] of rows) {
        points.push({ x: left, y }, { x: right + 1, y }, { x: left, y: y + 1 }, { x: right + 1, y: y + 1 });
      }
      const polygon = hull(points), hullArea = area(polygon);
      if (tail / hullArea < detectorParameters.minFill) continue;
      // Remove raster stair-step vertices by least lost triangular area.
      while (polygon.length > 4) {
        let smallest = Infinity, remove = 0;
        for (let i = 0; i < polygon.length; i++) {
          const loss = Math.abs(cross(polygon[(i + polygon.length - 1) % polygon.length]!, polygon[i]!, polygon[(i + 1) % polygon.length]!));
          if (loss < smallest) { smallest = loss; remove = i; }
        }
        polygon.splice(remove, 1);
      }
      const loss = 1 - area(polygon) / hullArea;
      if (polygon.length !== 4 || loss > detectorParameters.maxHullLoss) continue;
      // Uppermost edge defines the image-space top. Tie break toward its left.
      let top = 0;
      for (let i = 1; i < 4; i++) {
        const score = (j: number): number => polygon[j]!.y + polygon[(j + 1) % 4]!.y;
        if (score(i) < score(top) || (score(i) === score(top) && polygon[i]!.x < polygon[top]!.x)) top = i;
      }
      const quad = Array.from({ length: 4 }, (_, i) => polygon[(top + i) % 4]!) as unknown as Quad;
      if (!validQuad(quad, image) || quadResolution(quad) < detectorParameters.minResolution) continue;
      proposals.push({ quad, quality: 1 - loss });
      // Bound decode/NMS work even in heavily cluttered images.
      proposals.sort((a, b) => b.quality - a.quality || compareQuads(a.quad, b.quad));
      if (proposals.length > detectorParameters.maxCandidates * 4) proposals.pop();
    }
  }
  const kept: Quad[] = [];
  for (const { quad } of proposals) {
    if (!kept.some(other => quadIoU(quad, other) >= detectorParameters.nmsIoU)) kept.push(quad);
    if (kept.length === detectorParameters.maxCandidates) break;
  }
  return kept.sort(compareQuads);
}
