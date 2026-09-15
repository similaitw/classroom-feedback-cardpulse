import test from 'node:test';
import assert from 'node:assert/strict';
import { TemporalCollector, scanFrame } from '../dist/index.js';
import { composite } from './frame-fixtures.mjs';

const frame = (...items) => ({ detections: items.map(([cardId, answer = 'A', confidence = .9]) =>
  ({ quad: [], detection: { cardId, answer, confidence } })), uncertain: [] });
function setup(options) {
  const collector = new TemporalCollector(options), token = collector.startQuestion('q1');
  return { collector, token, feed: (t, ...items) => collector.collect(token, t, frame(...items)) };
}

test('requires both elapsed duration and distinct observations; event carries conservative evidence', () => {
  const { feed } = setup();
  for (const t of [0, 1, 2, 199]) assert.deepEqual(feed(t, [1]), []);
  assert.deepEqual(feed(200, [1, 'A', .8]), [{ questionId: 'q1', generation: 1, cardId: 1,
    answer: 'A', firstSeenAt: 0, confirmedAt: 200, observations: 5, confidence: .8 }]);
  const slow = setup();
  assert.deepEqual(slow.feed(0, [1]), []);
  assert.deepEqual(slow.feed(240, [1]), []);
  assert.equal(slow.feed(480, [1]).length, 1);
});
test('short misses tolerated at inclusive gap boundary, only reliable observations count', () => {
  const { feed } = setup();
  feed(0, [1]); feed(70, [1]);
  assert.deepEqual(feed(150), []);
  assert.equal(feed(320, [1]).length, 1);
});
test('long gap resets evidence even without intervening empty frames', () => {
  for (const empty of [false, true]) {
    const { feed } = setup();
    feed(0, [1]); feed(100, [1]);
    if (empty) feed(351);
    assert.deepEqual(feed(400, [1]), []);
    assert.deepEqual(feed(500, [1]), []);
    assert.equal(feed(600, [1])[0].firstSeenAt, 400);
  }
});
test('answer change before confirmation restarts evidence; jitter cannot accumulate across answers', () => {
  const { feed } = setup();
  for (const [t, answer] of [[0,'A'],[100,'A'],[200,'B'],[300,'A'],[400,'B'],[500,'B']]) {
    assert.deepEqual(feed(t, [1, answer]), []);
  }
  const event = feed(600, [1, 'B'])[0];
  assert.equal(event.answer, 'B'); assert.equal(event.firstSeenAt, 400);
});
test('first confirmation locks card across repeated answers, disappearance and stable answer changes', () => {
  const { feed } = setup();
  feed(0, [1]); feed(100, [1]); assert.equal(feed(200, [1]).length, 1);
  feed(1000);
  for (let i = 0; i < 20; i++) assert.deepEqual(feed(1100 + 100*i, [1, i < 10 ? 'B' : 'A']), []);
});
test('uncertain and invalid/low-confidence detections never submit or refresh pending evidence', () => {
  const { collector, token, feed } = setup();
  feed(0, [1]); feed(100, [1]);
  for (const t of [200,300,400]) {
    const input = frame([1,'A',.69], [2,'A',NaN], [3,'B',Infinity], [4,'C',1.1], [0], [64], [1.5], [5,'X']);
    input.uncertain.push({ quad: [], reason: 'ambiguous', confidence: 1 });
    assert.deepEqual(collector.collect(token, t, input), []);
  }
  assert.deepEqual(feed(500, [1]), []);
  feed(600, [1]); assert.equal(feed(700, [1])[0].firstSeenAt, 500);
});
test('duplicate copies count once; reliable conflicts reset only their own ID, independent of order', () => {
  for (const reverse of [false,true]) {
    const { feed } = setup();
    feed(0, [1], [2]); feed(100, [1], [2]);
    const copies = [[1,'A'],[1,'B'],[1,'A'],[2],[2]];
    assert.deepEqual(feed(200, ...(reverse ? copies.reverse() : copies)).map(e => e.cardId), [2]);
    assert.deepEqual(feed(300, [1], [1], [1]), []);
    assert.deepEqual(feed(400, [1]), []);
    assert.equal(feed(500, [1]).length, 1);
  }
});
test('multi-card state is independent and event order is numeric card ID', () => {
  const { feed } = setup();
  feed(0, [63], [2], [1]); feed(90, [1], [63]);
  assert.deepEqual(feed(220, [63], [2], [1]).map(e => e.cardId), [1,63]);
  assert.deepEqual(feed(300, [2]).map(e => e.cardId), [2]);
});
test('non-increasing timestamps cannot count, expire or change evidence; invalid time throws', () => {
  const { feed } = setup();
  feed(100, [1]);
  for (const t of [100,99,0]) assert.deepEqual(feed(t, [1,'B']), []);
  for (const t of [NaN,Infinity,-1]) assert.throws(() => feed(t, [1]), RangeError);
  assert.deepEqual(feed(200, [1]), []);
  assert.equal(feed(300, [1])[0].observations, 3);
});
test('question lifecycle isolates pending, confirmed and delayed frames, even with repeated IDs', () => {
  const { collector, token, feed } = setup();
  feed(0, [1], [2]); feed(100, [1]); feed(200, [1]);
  collector.reset();
  assert.deepEqual(feed(300, [2]), []);
  const next = collector.startQuestion('q1');
  assert.notEqual(next.generation, token.generation);
  assert.deepEqual(feed(99999, [2]), []);
  assert.deepEqual(collector.collect(next, 0, frame([1], [2])), []);
  assert.deepEqual(collector.collect(next, 100, frame([1], [2])), []);
  assert.deepEqual(collector.collect(next, 200, frame([1], [2])).map(e => e.cardId), [1,2]);
  const third = collector.startQuestion('q2');
  assert.deepEqual(collector.collect(next, 300, frame([3])), []);
  assert.deepEqual(collector.collect(third, 0, frame([1])), []);
});
test('policy validation, immutable configuration and custom thresholds', () => {
  for (const options of [{ minObservations: 1 }, { minObservations: 2.5 }, { minStableMs: 0 },
    { maxGapMs: -1 }, { maxGapMs: Infinity }, { minConfidence: .54 }, { minConfidence: NaN }, { minConfidence: 1.1 }]) {
    assert.throws(() => new TemporalCollector(options), RangeError);
  }
  const options = { minObservations: 2, minStableMs: 10, maxGapMs: 10, minConfidence: .8 };
  const { collector, feed } = setup(options);
  options.minObservations = 100;
  assert.ok(Object.isFrozen(collector.policy));
  assert.throws(() => collector.startQuestion(' '), RangeError);
  feed(0, [1,'D',.8]); assert.equal(feed(10, [1,'D',.8])[0].answer, 'D');
});
test('official PDF multi-card scanFrame sequence feeds collector reproducibly', () => {
  const { frame: image, expected } = composite(5, 1, true);
  const run = () => {
    const collector = new TemporalCollector(), token = collector.startQuestion('golden');
    return [0,85,210,330].flatMap(t => collector.collect(token, t, scanFrame(image)));
  };
  const events = run();
  assert.deepEqual(events, run());
  assert.deepEqual(events.map(({ cardId, answer }) => ({ cardId, answer })),
    expected.map(({ cardId, answer }) => ({ cardId, answer })).sort((a,b) => a.cardId-b.cardId));
});
