import { normalizeCandidate, quadResolution, validImage, validQuad } from './geometry.js';
import type { GrayImage, Quad } from './geometry.js';
import { referenceData } from './references.generated.js';

export { normalizeCandidate } from './geometry.js';
export type { GrayImage, Point, Quad } from './geometry.js';
export type Answer = 'A' | 'B' | 'C' | 'D';
export type ScanDetection = { cardId: number; answer: Answer; confidence: number };
export type RejectReason = 'invalid-image' | 'invalid-quad' | 'low-resolution' | 'low-contrast' | 'poor-match' | 'ambiguous';
export type ScanResult =
  | { status: 'detected'; detection: ScanDetection }
  | { status: 'uncertain'; reason: RejectReason; confidence: number };

/** Fixed baseline policy; tune only against separately labeled validation data. */
export const thresholds = Object.freeze({
  minResolution: 25,
  minContrast: 60,
  maxError: .018,
  minMargin: .02,
  minConfidence: .55,
});

// A-up rotated clockwise: the previous LEFT label becomes the top answer.
const answersCW: readonly Answer[] = ['A', 'D', 'C', 'B'];
function rotateCW(bits: readonly number[]): number[] {
  return Array.from({ length: 25 }, (_, i) => bits[(4 - i % 5) * 5 + Math.floor(i / 5)]!);
}
const templates = referenceData.references.flatMap(ref => {
  let bits: number[] = [...ref.rows.join('')].map(Number);
  return answersCW.map(answer => {
    const template = { cardId: ref.cardId, answer, bits };
    bits = rotateCW(bits);
    return template;
  });
});

const reject = (reason: RejectReason, confidence = 0): ScanResult => ({ status: 'uncertain', reason, confidence });
const clamp = (v: number): number => Math.max(0, Math.min(1, v));

/** Decode one caller-localized, non-mirrored official card pattern.
 * No DOM, file I/O, network or runtime dependencies; suitable for a browser worker.
 * Rejected results intentionally expose no guessed ID/answer.
 */
export function scanCandidate(image: GrayImage, quad: Quad): ScanResult {
  if (!validImage(image)) return reject('invalid-image');
  if (!validQuad(quad, image)) return reject('invalid-quad');
  if (quadResolution(quad) < thresholds.minResolution) return reject('low-resolution');
  const normalized = normalizeCandidate(image, quad);
  // Use the central 60% of each of the 25 cells, retaining individual samples.
  // Excluding cell borders tolerates rasterization and small corner errors.
  const cells = Array.from({ length: 25 }, (_, cell) => {
    const values: number[] = [];
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) {
      values.push(normalized.data[(Math.floor(cell / 5) * 10 + y) * 50 + cell % 5 * 10 + x]!);
    }
    return values;
  });
  const sorted = cells.flat().sort((a, b) => a - b);
  const dark = sorted[Math.floor(sorted.length * .05)]!;
  const light = sorted[Math.floor(sorted.length * .95)]!;
  const contrast = light - dark;
  if (contrast < thresholds.minContrast) return reject('low-contrast');
  const darkness = cells.map(samples => samples.map(value => clamp((light - value) / contrast)));
  const ranked = templates.map(template => {
    let error = 0;
    for (let i = 0; i < 25; i++) for (const value of darkness[i]!) error += Math.abs(value - template.bits[i]!);
    return { ...template, error: error / 900 };
  }).sort((a, b) => a.error - b.error);
  const best = ranked[0]!, margin = ranked[1]!.error - best.error;
  // Heuristic evidence score, NOT a calibrated probability of correctness.
  const confidence = clamp(1 - best.error / .04) * clamp(margin / .04) * clamp(contrast / 128);
  if (best.error > thresholds.maxError) return reject('poor-match', confidence);
  if (margin < thresholds.minMargin || confidence < thresholds.minConfidence) return reject('ambiguous', confidence);
  return { status: 'detected', detection: { cardId: best.cardId, answer: best.answer, confidence } };
}
