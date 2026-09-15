import { performance } from 'node:perf_hooks';
import { TemporalCollector } from '../dist/index.js';

// Collector only: all 63 IDs, pending -> confirmed -> dedup -> new question.
const frame = { detections: Array.from({ length: 63 }, (_, i) => ({
  quad: [], detection: { cardId: i + 1, answer: 'A', confidence: .9 },
})), uncertain: [] };
const collector = new TemporalCollector();
function batch() {
  let count = 0;
  const start = performance.now();
  for (let q = 0; q < 1000; q++) {
    const token = collector.startQuestion('benchmark');
    for (const t of [0,90,210,300]) count += collector.collect(token, t, frame).length;
  }
  const elapsed = performance.now() - start;
  if (count !== 63000) throw new Error('Unexpected event count');
  return elapsed / 4000;
}
for (let i = 0; i < 5; i++) batch();
const times = Array.from({ length: 30 }, batch).sort((a,b) => a-b);
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
  cards: 63, warmupBatches: 5, samples: 30, framesPerBatch: 4000,
  medianBatchMeanMsPerFrame: times[15], p95BatchMeanMsPerFrame: times[28] }, null, 2));
