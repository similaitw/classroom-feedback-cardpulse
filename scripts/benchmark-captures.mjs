import { readFileSync, writeFileSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { cpus } from 'node:os';
import { validateManifest, loadFrame, runBenchmark, markdownReport, sha256 } from './benchmark-core.mjs';

const workspace = realpathSync(fileURLToPath(new URL('../',import.meta.url)));
function inside(file) {
  const relative = path.relative(workspace,realpathSync(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Paths must stay inside the repository');
  return realpathSync(file);
}
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: npm run benchmark:captures -- <manifest.json> <existing-output-directory> [--validate-only]\nWrites report.json and report.md; refuses existing outputs. Exit: 0 completed (not gate approval), 1 invalid input.');
  } else {
    if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== '--validate-only')) throw new Error('Expected manifest.json output-directory [--validate-only]; use --help');
    const manifestFile = inside(path.resolve(args[0])), output = inside(path.resolve(args[1]));
    const bytes = readFileSync(manifestFile), manifest = validateManifest(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')));
    const root = path.dirname(manifestFile);
    for (const s of manifest.sequences) for (const f of s.frames) loadFrame(root,f);
    if (args[2]) console.log('Dataset schema, frame paths, hashes and image dimensions validated; no gate evaluated.');
    else {
      if (readdirSync(output).some(f => ['report.json','report.md'].includes(f))) throw new Error('Output report already exists; choose a fresh directory');
      const report = runBenchmark(manifest,root);
      report.manifestSha256 = sha256(bytes);
      report.environment.cpu = cpus()[0]?.model ?? 'unknown';
      report.codeSha256 = Object.fromEntries(['scripts/benchmark-core.mjs','scripts/benchmark-captures.mjs',...readdirSync(path.join(workspace,'dist')).filter(f=>f.endsWith('.js')).map(f=>`dist/${f}`),'package-lock.json'].map(f=>[f,sha256(readFileSync(path.join(workspace,f)))]));
      writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
      writeFileSync(path.join(output,'report.md'),markdownReport(report),{encoding:'utf8',flag:'wx'});
      console.log(JSON.stringify({datasetId:report.datasetId,checks:report.checks,phase0Gate:report.phase0Gate},null,2));
    }
  }
} catch (error) {
  console.error(`Benchmark failed: ${error.message}`);
  process.exitCode = 1;
}
