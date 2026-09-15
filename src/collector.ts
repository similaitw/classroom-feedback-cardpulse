import type { Answer, FrameScanResult } from './index.js';

export type TemporalPolicy = {
  minObservations: number;
  minStableMs: number;
  maxGapMs: number;
  minConfidence: number;
};
export const temporalDefaults: Readonly<TemporalPolicy> = Object.freeze({
  minObservations: 3, minStableMs: 200, maxGapMs: 250, minConfidence: .7,
});
export type QuestionToken = Readonly<{ questionId: string; generation: number }>;
export type CollectedResponse = {
  questionId: string; generation: number; cardId: number; answer: Answer;
  firstSeenAt: number; confirmedAt: number; observations: number; confidence: number;
};
type Pending = { answer: Answer; firstSeenAt: number; lastSeenAt: number; count: number; confidence: number };

/** Pure synchronous browser/worker collector. First stable answer wins per card/question. */
export class TemporalCollector {
  readonly policy: Readonly<TemporalPolicy>;
  private active: QuestionToken | undefined;
  private generation = 0;
  private lastTimestamp = -Infinity;
  private pending = new Map<number, Pending>();
  private confirmed = new Set<number>();

  constructor(options: Partial<TemporalPolicy> = {}) {
    const policy = { ...temporalDefaults, ...options };
    if (!Number.isSafeInteger(policy.minObservations) || policy.minObservations < 2 ||
      !Number.isFinite(policy.minStableMs) || policy.minStableMs <= 0 ||
      !Number.isFinite(policy.maxGapMs) || policy.maxGapMs <= 0 ||
      !Number.isFinite(policy.minConfidence) || policy.minConfidence < .55 || policy.minConfidence > 1) {
      throw new RangeError('Invalid temporal policy');
    }
    this.policy = Object.freeze(policy);
  }

  /** Always starts a fresh collection, even when reusing the same question ID. */
  startQuestion(questionId: string): QuestionToken {
    if (typeof questionId !== 'string' || !questionId.trim()) throw new RangeError('Question ID required');
    this.reset();
    this.active = Object.freeze({ questionId, generation: ++this.generation });
    return this.active;
  }

  /** Close collection and discard all evidence. Previously returned events remain caller-owned. */
  reset(): void {
    this.active = undefined;
    this.lastTimestamp = -Infinity;
    this.pending.clear();
    this.confirmed.clear();
  }

  /** Pass the exact token captured BEFORE starting scanFrame/worker work.
   * Non-increasing timestamps and stale tokens are ignored without changing state.
   */
  collect(token: QuestionToken, timestampMs: number, frame: FrameScanResult): CollectedResponse[] {
    if (!Number.isFinite(timestampMs) || timestampMs < 0) throw new RangeError('Invalid timestamp');
    if (!this.active || token !== this.active || timestampMs <= this.lastTimestamp) return [];
    this.lastTimestamp = timestampMs;
    for (const [id, state] of this.pending) {
      if (timestampMs - state.lastSeenAt > this.policy.maxGapMs) this.pending.delete(id);
    }

    // Count each ID once per frame. Contradictory reliable copies veto that ID.
    const observations = new Map<number, { answer: Answer; confidence: number } | null>();
    for (const { detection: d } of frame.detections) {
      if (!Number.isInteger(d.cardId) || d.cardId < 1 || d.cardId > 63 ||
        !['A', 'B', 'C', 'D'].includes(d.answer) || !Number.isFinite(d.confidence) ||
        d.confidence < this.policy.minConfidence || d.confidence > 1 || this.confirmed.has(d.cardId)) continue;
      const previous = observations.get(d.cardId);
      if (previous === null) continue;
      if (previous && previous.answer !== d.answer) observations.set(d.cardId, null);
      else observations.set(d.cardId, { answer: d.answer, confidence: Math.min(previous?.confidence ?? 1, d.confidence) });
    }

    const events: CollectedResponse[] = [];
    for (const [cardId, observation] of [...observations].sort(([a], [b]) => a - b)) {
      if (!observation) { this.pending.delete(cardId); continue; }
      let state = this.pending.get(cardId);
      if (!state || state.answer !== observation.answer) {
        state = { answer: observation.answer, firstSeenAt: timestampMs, lastSeenAt: timestampMs,
          count: 1, confidence: observation.confidence };
        this.pending.set(cardId, state);
      } else {
        state.lastSeenAt = timestampMs;
        state.count++;
        state.confidence = Math.min(state.confidence, observation.confidence);
      }
      if (state.count >= this.policy.minObservations && timestampMs - state.firstSeenAt >= this.policy.minStableMs) {
        events.push({ questionId: token.questionId, generation: token.generation, cardId,
          answer: state.answer, firstSeenAt: state.firstSeenAt, confirmedAt: timestampMs,
          observations: state.count, confidence: state.confidence });
        this.pending.delete(cardId);
        this.confirmed.add(cardId);
      }
    }
    return events;
  }
}
