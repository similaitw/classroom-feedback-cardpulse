import { performance } from 'node:perf_hooks';
import { scanFrame } from '../dist/index.js';
import { composite } from './frame-fixtures.mjs';

const { frame } = composite(5, 1, true);
for (let i = 0; i < 5; i++) scanFrame(frame);
const times = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  const result = scanFrame(frame);
  times.push(performance.now() - start);
  if (result.detections.length !== 5) throw new Error('Benchmark fixture did not decode');
}
times.sort((a,b) => a-b);
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
  width: frame.width, height: frame.height, cards: 5, warmup: 5, samples: times.length,
  medianMs: times[15], p95Ms: times[28] }, null, 2));
