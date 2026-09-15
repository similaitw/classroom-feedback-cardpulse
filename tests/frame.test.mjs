import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCandidates, scanFrame } from '../dist/index.js';
import { quadIoU } from '../dist/detector.js';
import { validQuad } from '../dist/geometry.js';
import { referenceData } from '../dist/references.generated.js';
import { golden, manifest, render, rotate } from './helpers.mjs';
import { blank, composite, paste } from './frame-fixtures.mjs';

for (const count of [2,3,4,5]) for (let turn = 0; turn < 4; turn++) {
  test(`full frame: ${count} PDF golden cards, rotation ${turn}, perspective/exposure`, () => {
    for (const lighting of [false, true]) {
      const { frame, expected } = composite(count, turn, lighting);
      const result = scanFrame(frame);
      assert.equal(result.detections.length, count, JSON.stringify(result));
      for (const item of expected) {
        const match = result.detections.find(d => d.detection.cardId === item.cardId);
        assert.ok(match, JSON.stringify(item));
        assert.equal(match.detection.answer, item.answer);
        assert.ok(validQuad(match.quad, frame));
        assert.ok(quadIoU(match.quad, item.quad) > .93);
      }
      assert.deepEqual(scanFrame(frame), result);
      const candidates = detectCandidates(frame);
      for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
        assert.ok(quadIoU(candidates[i], candidates[j]) < .65);
      }
    }
  });
}
test('all 63 reference IDs and four orientations locate without caller quads', () => {
  for (const ref of referenceData.references) {
    let source = render(ref.rows);
    for (const answer of ['A','D','C','B']) {
      const frame = blank();
      paste(frame, source, [85,12,51,-8,100,40,.1,-.08,1]);
      const result = scanFrame(frame);
      assert.equal(result.detections.length, 1, `ID ${ref.cardId}: ${JSON.stringify(result)}`);
      assert.equal(result.detections[0].detection.cardId, ref.cardId);
      assert.equal(result.detections[0].detection.answer, answer);
      source = rotate(source);
    }
  }
});
test('negative full frames: uniform, noise, gradient, stripes, checkerboard, disks and rectangles', () => {
  for (const kind of ['white','black','gray','noise','gradient','stripes','checkerboard','disk','rectangle']) {
    const frame = blank();
    frame.data = frame.data.map((_, i) => {
      const x = i % frame.width, y = Math.floor(i / frame.width);
      switch (kind) {
        case 'white': return 255;
        case 'black': return 0;
        case 'gray': return 128;
        case 'noise': return (i * 73 + y * 37) % 256;
        case 'gradient': return Math.round(x * 255 / frame.width);
        case 'stripes': return x % 40 < 20 ? 20 : 240;
        case 'checkerboard': return (Math.floor(x / 30) + Math.floor(y / 30)) % 2 ? 20 : 240;
        case 'disk': return Math.hypot(x - 200, y - 200) < 70 ? 20 : 240;
        default: return x > 100 && x < 210 && y > 100 && y < 210 ? 20 : 240;
      }
    });
    assert.deepEqual(scanFrame(frame).detections, [], kind);
  }
});
test('uncertain candidates never expose guessed detections; invalid frames throw', () => {
  const source = golden(manifest.fixtures[0]);
  for (const data of [source.data.map(v => 110 + Math.round(v * .1)),
    source.data.map((v,i) => i % 100 >= 40 && i % 100 < 60 && Math.floor(i/100) >= 40 && Math.floor(i/100) < 60 ? 0 : v)]) {
    const frame = blank();
    paste(frame, { ...source, data }, [100,0,60,0,100,60,0,0,1]);
    const result = scanFrame(frame);
    assert.equal(result.detections.length, 0);
    assert.ok(result.uncertain.length > 0);
    for (const candidate of result.uncertain) {
      assert.equal('detection' in candidate, false);
      assert.equal('cardId' in candidate, false);
    }
  }
  for (const bad of [null, { width: 10, height: 10, data: new Uint8Array(1) }]) {
    assert.throws(() => scanFrame(bad), RangeError);
    assert.throws(() => detectCandidates(bad), RangeError);
  }
});
test('NMS retains spatially separate copies of the same card', () => {
  const frame = blank(), source = golden(manifest.fixtures[0]);
  for (const x of [40,145]) paste(frame, source, [100,0,x,0,100,50,0,0,1]);
  assert.equal(scanFrame(frame).detections.length, 2);
  assert.equal(detectCandidates(frame).length, 2);
});

test('all nine PDF goldens: four answers with positive/negative in-plane tilt, scale and noise', () => {
  for (const fixture of manifest.fixtures) for (const angle of [-25, 20]) {
    let source = golden(fixture);
    for (const answer of fixture.answersCW) {
      const frame = blank(), radians = angle * Math.PI / 180;
      const size = angle < 0 ? 65 : 150, c = size * Math.cos(radians), s = size * Math.sin(radians);
      paste(frame, source, [c,-s,160,s,c,100,0,0,1]);
      frame.data = frame.data.map((v,i) => Math.round(18 + v * .8 + (i * 17 % 5) - 2));
      const result = scanFrame(frame);
      assert.equal(result.detections.length, 1, JSON.stringify({ fixture, angle, answer, result }));
      assert.equal(result.detections[0].detection.cardId, fixture.cardId);
      assert.equal(result.detections[0].detection.answer, answer);
      source = rotate(source);
    }
  }
});

test('polygon IoU handles identical, disjoint, overlapping and nested quads', () => {
  const rect = (x,y,w,h) => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  const a = rect(0,0,100,100);
  assert.equal(quadIoU(a,a), 1);
  assert.equal(quadIoU(a,rect(101,0,100,100)), 0);
  assert.equal(quadIoU(a,rect(50,0,100,100)), 1/3);
  assert.equal(quadIoU(a,rect(25,25,50,50)), .25);
});
