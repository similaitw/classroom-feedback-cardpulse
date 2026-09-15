import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { scanFrame, TemporalCollector, thresholds, detectorParameters, temporalDefaults } from '../dist/index.js';

const fail = message => { throw new Error(message); };
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const finite = n => Number.isFinite(n) && n >= 0;
const id = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const quantile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length * p)-1)] : null;
const ratio = (a,b) => b ? a/b : null;

/** Strict v1 runtime schema; rejects unknown fields to catch typos/accidental personal data. */
function keys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    required.some(k => !Object.hasOwn(value,k)) || Object.keys(value).some(k => ![...required,...optional].includes(k))) fail(`Invalid fields; expected ${required.join(', ')}`);
}
export function validateManifest(m) {
  keys(m, ['schemaVersion','datasetId','provenance','split','protocolVersion','sequences']);
  if (m.schemaVersion !== 1 || !id(m.datasetId) || !['real-phone','synthetic','pdf-derived'].includes(m.provenance) ||
    !['development','held-out'].includes(m.split) || m.protocolVersion !== '1' || !Array.isArray(m.sequences) || !m.sequences.length) fail('Invalid dataset header');
  const ids = new Set();
  for (const s of m.sequences) {
    keys(s, ['sequenceId','device','conditions','frames']);
    if (!id(s.sequenceId) || ids.has(s.sequenceId)) fail('Invalid/duplicate sequenceId');
    ids.add(s.sequenceId);
    keys(s.device,['model','os','camera','captureWidth','captureHeight']);
    if (!['model','os','camera'].every(k => typeof s.device[k] === 'string' && s.device[k].trim().length > 0 && s.device[k].length <= 100) ||
      !integer(s.device.captureWidth,1,16384) || !integer(s.device.captureHeight,1,16384)) fail('Invalid device');
    keys(s.conditions,['distanceM','lighting','motion','occlusion']);
    if (!finite(s.conditions.distanceM) || s.conditions.distanceM === 0 ||
      !['normal','dim','backlit'].includes(s.conditions.lighting) || !['static','pan','handheld'].includes(s.conditions.motion) ||
      !['none','partial'].includes(s.conditions.occlusion)) fail('Invalid conditions');
    if (!Array.isArray(s.frames) || !s.frames.length) fail('Empty sequence');
    let last = -1;
    const answers = new Map();
    for (const f of s.frames) {
      keys(f,['file','sha256','timestampMs','width','height','cards']);
      if (typeof f.file !== 'string' || !/^[a-zA-Z0-9_./-]+\.pgm$/.test(f.file) || f.file.startsWith('/') || f.file.split('/').some(p => !p || p === '..' || p === '.') ||
        !/^[a-f0-9]{64}$/.test(f.sha256) || !finite(f.timestampMs) || f.timestampMs <= last ||
        !integer(f.width,1,4096) || !integer(f.height,1,4096) || f.width*f.height > 8388608 || !Array.isArray(f.cards)) fail('Invalid frame');
      last = f.timestampMs;
      const seen = new Set();
      for (const c of f.cards) {
        keys(c,['cardId','answer','box']);
        if (!integer(c.cardId,1,63) || !['A','B','C','D'].includes(c.answer) || seen.has(c.cardId) ||
          !Array.isArray(c.box) || c.box.length !== 4 || !c.box.every(finite) ||
          c.box[0] >= c.box[2] || c.box[1] >= c.box[3] || c.box[2] > f.width || c.box[3] > f.height) fail('Invalid card annotation');
        if (answers.has(c.cardId) && answers.get(c.cardId) !== c.answer) fail('Answer changes require a new sequence');
        answers.set(c.cardId,c.answer); seen.add(c.cardId);
      }
    }
  }
  return m;
}

/** Canonical binary PGM only: no decoder dependencies, no ambiguous raster delimiter. */
export function readPgm(bytes, width, height) {
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`);
  if (!bytes.subarray(0,header.length).equals(header) || bytes.length !== header.length + width*height) fail('Expected canonical 8-bit P5 PGM and exact dimensions');
  return { width,height,data:new Uint8Array(bytes.subarray(header.length)) };
}
export function loadFrame(root, f) {
  const base = realpathSync(root), file = realpathSync(path.resolve(base,f.file));
  const relative = path.relative(base,file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('Frame escapes dataset root');
  const bytes = readFileSync(file);
  if (sha256(bytes) !== f.sha256) fail('Frame checksum mismatch');
  return readPgm(bytes,f.width,f.height);
}
export const quadBox = quad => [Math.min(...quad.map(p=>p.x)),Math.min(...quad.map(p=>p.y)),Math.max(...quad.map(p=>p.x)),Math.max(...quad.map(p=>p.y))];
function iou(a,b) {
  const intersection = Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])) * Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
  return intersection / ((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection);
}
/** Geometry-first, descending box IoU greedy one-to-one matching; never matches using labels. */
export function scoreFrame(cards, result) {
  const pairs = [];
  result.detections.forEach((d,p) => cards.forEach((c,t) => {
    const overlap = iou(quadBox(d.quad),c.box);
    if (overlap >= .5) pairs.push({ p,t,overlap });
  }));
  pairs.sort((a,b)=>b.overlap-a.overlap || a.p-b.p || a.t-b.t);
  const predictions = new Set(), truths = new Set();
  let joint = 0, idCorrect = 0, wrongId = 0, wrongAnswer = 0;
  for (const {p,t} of pairs) {
    if (predictions.has(p) || truths.has(t)) continue;
    predictions.add(p); truths.add(t);
    const d = result.detections[p].detection, c = cards[t];
    if (d.cardId === c.cardId) { idCorrect++; if (d.answer === c.answer) joint++; else wrongAnswer++; }
    else wrongId++;
  }
  return { frames:1, truth:cards.length, predictions:result.detections.length, matched:truths.size,
    joint,idCorrect,wrongId,wrongAnswer,missed:cards.length-truths.size, spurious:result.detections.length-predictions.size,
    uncertain:result.uncertain.length, negativeFrames:cards.length ? 0 : 1,
    negativeFalsePositiveFrames:!cards.length && result.detections.length ? 1 : 0 };
}
function summary(rows) {
  const counts = {};
  for (const row of rows) for (const [k,v] of Object.entries(row)) counts[k] = (counts[k] ?? 0)+v;
  return { ...counts, jointRecall:ratio(counts.joint,counts.truth), jointPrecision:ratio(counts.joint,counts.predictions),
    idAccuracyMatched:ratio(counts.idCorrect,counts.matched), answerAccuracyGivenCorrectId:ratio(counts.joint,counts.idCorrect),
    negativeFalsePositiveRate:ratio(counts.negativeFalsePositiveFrames,counts.negativeFrames) };
}
export const proposedThresholds = Object.freeze({ jointRecall:.95, jointPrecision:.995, negativeFalsePositiveRate:.01,
  collectionRecall:.95, wrongLocks:0, collectionP95Ms:2000, pcScanP95Ms:100 });

export function runBenchmark(manifest, root, { scan = scanFrame, warmup = 3 } = {}) {
  validateManifest(manifest);
  const rows = [], sequences = [], latencies = [], elapsed = [], byCondition = {}, seenIds = new Set(), orientations = new Set(), idAnswers = new Set();
  for (const s of manifest.sequences) {
    const collector = new TemporalCollector(), token = collector.startQuestion(s.sequenceId);
    const truth = new Map(), events = [], frameRows = [];
    // Preflight every byte before measuring this sequence; decoded images are not retained.
    for (const f of s.frames) loadFrame(root,f);
    const first = loadFrame(root,s.frames[0]);
    for (let i=0;i<warmup;i++) scan(first);
    for (const f of s.frames) {
      const frame = loadFrame(root,f);
      for (const c of f.cards) {
        seenIds.add(c.cardId); orientations.add(c.answer); idAnswers.add(`${c.cardId}:${c.answer}`);
        if (!truth.has(c.cardId)) truth.set(c.cardId,{ answer:c.answer, since:f.timestampMs });
      }
      const start = performance.now(), result = scan(frame), scanMs = performance.now()-start;
      elapsed.push(scanMs);
      events.push(...collector.collect(token,f.timestampMs,result));
      const counts = scoreFrame(f.cards,result);
      rows.push(counts);
      const stratum = `${s.device.model}|${s.conditions.distanceM}m|${s.conditions.lighting}|${s.conditions.motion}|${s.conditions.occlusion}`;
      (byCondition[stratum] ??= []).push(counts);
      frameRows.push({ timestampMs:f.timestampMs, counts, scanMs, detections:result.detections, uncertain:result.uncertain });
    }
    let correct = 0, wrongLocks = 0;
    const sequenceLatencies = [];
    for (const event of events) {
      const expected = truth.get(event.cardId);
      if (expected && expected.answer === event.answer && event.confirmedAt >= expected.since) {
        correct++; sequenceLatencies.push(event.confirmedAt-expected.since);
      } else wrongLocks++;
    }
    latencies.push(...sequenceLatencies);
    sequences.push({ sequenceId:s.sequenceId, device:s.device, conditions:s.conditions, expected:truth.size, correct, wrongLocks,
      uncollected:truth.size-correct, latencyMs:sequenceLatencies, events, frames:frameRows });
  }
  const total = summary(rows), expected = sequences.reduce((n,s)=>n+s.expected,0), correct = sequences.reduce((n,s)=>n+s.correct,0);
  const collection = { expected,correct,uncollected:expected-correct,wrongLocks:sequences.reduce((n,s)=>n+s.wrongLocks,0),
    recall:ratio(correct,expected), medianMs:quantile(latencies,.5), p95Ms:quantile(latencies,.95) };
  const timing = { samples:elapsed.length,warmupPerSequence:warmup,medianMs:quantile(elapsed,.5),p95Ms:quantile(elapsed,.95), scope:'PC scanFrame only; excludes I/O, collector, camera and rendering' };
  const checks = {
    jointRecall:total.jointRecall === null ? null : total.jointRecall >= proposedThresholds.jointRecall,
    jointPrecision:total.jointPrecision === null ? null : total.jointPrecision >= proposedThresholds.jointPrecision,
    negativeFalsePositiveRate:total.negativeFalsePositiveRate === null ? null : total.negativeFalsePositiveRate <= proposedThresholds.negativeFalsePositiveRate,
    collectionRecall:collection.recall === null ? null : collection.recall >= proposedThresholds.collectionRecall,
    wrongLocks:collection.wrongLocks === 0,
    collectionP95Ms:collection.p95Ms === null ? null : collection.p95Ms <= proposedThresholds.collectionP95Ms,
    pcScanP95Ms:timing.p95Ms <= proposedThresholds.pcScanP95Ms,
  };
  return { reportVersion:1,datasetId:manifest.datasetId,provenance:manifest.provenance,split:manifest.split,
    phase0Gate:'NOT_EVALUATED: requires reviewed real-phone coverage and on-device measurement',
    environment:{ node:process.version,platform:process.platform,arch:process.arch },
    configuration:{ scanner:thresholds,detector:detectorParameters,collector:temporalDefaults,matching:'descending box IoU >= 0.5, one-to-one',proposedThresholds },
    coverage:{ sequences:sequences.length,frames:rows.length,cardIds:[...seenIds].sort((a,b)=>a-b),answers:[...orientations].sort(),
      idAnswerPairs:[...idAnswers].sort(),maxSimultaneousCards:rows.reduce((n,r)=>Math.max(n,r.truth),0) },
    total,collection,timing,checks,byCondition:Object.fromEntries(Object.entries(byCondition).map(([k,v])=>[k,summary(v)])),sequences };
}

export function markdownReport(r) {
  return `# CardPulse capture benchmark\n\nDataset: ${r.datasetId} (${r.provenance}, ${r.split})\n\nPhase 0: ${r.phase0Gate}\n\n` +
    `## Proposed checks (not gate approval)\n\n| Check | Result |\n|---|---|\n` + Object.entries(r.checks).map(([k,v])=>`| ${k} | ${v === null ? 'NO DATA' : v ? 'PASS' : 'FAIL'} |`).join('\n') +
    `\n\n## Metrics and denominators\n\n\`\`\`json\n${JSON.stringify({coverage:r.coverage,total:r.total,collection:r.collection,timing:r.timing,byCondition:r.byCondition},null,2)}\n\`\`\`\n\nRaw detections, rejection reasons, confirmed events, parameters and input/code hashes are in the companion JSON.\n`;
}
