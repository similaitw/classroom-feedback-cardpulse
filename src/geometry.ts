export type Point = Readonly<{ x: number; y: number }>;
/** Image-space clockwise corners: top-left, top-right, bottom-right, bottom-left.
 * Coordinates describe the outer edges of the 5x5 pattern, not the paper.
 */
export type Quad = readonly [Point, Point, Point, Point];
export type GrayImage = Readonly<{ width: number; height: number; data: Uint8Array }>;

export function validImage(image: GrayImage): boolean {
  return image != null && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height)
    && image.width > 0 && image.height > 0 && image.data instanceof Uint8Array
    && image.data.length === image.width * image.height;
}

export function validQuad(quad: Quad, image: GrayImage): boolean {
  if (!Array.isArray(quad) || quad.length !== 4) return false;
  if (Array.from(quad).some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)
    || p.x < 0 || p.y < 0 || p.x > image.width || p.y > image.height)) return false;
  // Strict convexity and clockwise winding in image coordinates (y points down).
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!, b = quad[(i + 1) % 4]!, c = quad[(i + 2) % 4]!;
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 1e-6) return false;
  }
  return true;
}

/** Minimum altitude guards against almost edge-on candidates, not just short edges. */
export function quadResolution(quad: Quad): number {
  let minimum = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!, b = quad[(i + 1) % 4]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    minimum = Math.min(minimum, length);
    for (const offset of [2, 3]) {
      const c = quad[(i + offset) % 4]!;
      minimum = Math.min(minimum, Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / length);
    }
  }
  return minimum;
}

/** Project unit-square coordinates through a homography into the source quad. */
function projector([p0, p1, p2, p3]: Quad): (u: number, v: number) => Point {
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / denominator;
  const h = (dx1 * sy - sx * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
  };
}

function bilinear(image: GrayImage, x: number, y: number): number {
  // Pixel centers are x + .5, y + .5; only clamp the half-pixel outer fringe.
  x = Math.max(0, Math.min(image.width - 1, x - .5));
  y = Math.max(0, Math.min(image.height - 1, y - .5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, image.width - 1), y1 = Math.min(y0 + 1, image.height - 1);
  const fx = x - x0, fy = y - y0;
  const top = image.data[y0 * image.width + x0]! * (1 - fx) + image.data[y0 * image.width + x1]! * fx;
  const bottom = image.data[y1 * image.width + x0]! * (1 - fx) + image.data[y1 * image.width + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Perspective-correct to a 50x50 grayscale raster. Invalid geometry throws. */
export function normalizeCandidate(image: GrayImage, quad: Quad): GrayImage {
  if (!validImage(image) || !validQuad(quad, image)) throw new RangeError('Invalid image or candidate quadrilateral');
  const project = projector(quad);
  const data = new Uint8Array(50 * 50);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const p = project((x + .5) / 50, (y + .5) / 50);
    data[y * 50 + x] = Math.round(bilinear(image, p.x, p.y));
  }
  return { width: 50, height: 50, data };
}
