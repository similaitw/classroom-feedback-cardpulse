import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { validateManifest, readPgm, sha256, scoreFrame, runBenchmark, quantile, quadBox } from '../scripts/benchmark-core.mjs';
import { composite } from './frame-fixtures.mjs';

const box = [0,0,50,50];
const quad = [{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:0,y:50}];
const detection = (cardId=1,answer='A') => ({quad,detection:{cardId,answer,confidence:1}});
const truth = [{cardId:1,answer:'A',box}];
const clone = value => JSON.parse(JSON.stringify(value));
const result = detections => ({detections,uncertain:[]});
function fixture() {
  return {schemaVersion:1,datasetId:'test',provenance:'synthetic',split:'development',protocolVersion:'1',sequences:[{
    sequenceId:'clip-1',device:{model:'test',os:'test',camera:'rear',captureWidth:640,captureHeight:420},
    conditions:{distanceM:3,lighting:'normal',motion:'static',occlusion:'none'},
    frames:[{file:'frame.pgm',sha256:'0'.repeat(64),timestampMs:0,width:640,height:420,cards:clone(truth)}]
  }]};
}
test('geometry-first metrics count wrong IDs, orientations, duplicate and missed predictions',()=>{
  assert.equal(scoreFrame(truth,result([detection()])).joint,1);
  assert.equal(scoreFrame(truth,result([detection(2)])).wrongId,1);
  assert.equal(scoreFrame(truth,result([detection(1,'B')])).wrongAnswer,1);
  const duplicate = scoreFrame(truth,result([detection(),detection()]));
  assert.equal(duplicate.joint,1); assert.equal(duplicate.spurious,1);
  assert.equal(scoreFrame(truth,result([])).missed,1);
  assert.equal(scoreFrame([],result([detection()])).negativeFalsePositiveFrames,1);
  const far = { ...detection(),quad:quad.map(p=>({x:p.x+100,y:p.y})) };
  assert.equal(scoreFrame(truth,result([far])).joint,0);
});
test('schema rejects malformed labels, dimensions, paths, ordering and answer changes',()=>{
  validateManifest(fixture());
  for (const mutate of [
    m=>m.schemaVersion=2, m=>m.provenance='phone-ish',m=>m.studentName='private',
    m=>m.sequences=[], m=>m.sequences.push(clone(m.sequences[0])),
    m=>m.sequences[0].frames[0].file='../frame.pgm',m=>m.sequences[0].frames[0].file='C:/frame.pgm',
    m=>m.sequences[0].frames[0].sha256='bad', m=>m.sequences[0].frames[0].width=0,
    m=>m.sequences[0].frames[0].cards[0].cardId=64,m=>m.sequences[0].frames[0].cards[0].answer='E',
    m=>m.sequences[0].frames[0].cards[0].box=[0,0,999,50],
    m=>m.sequences[0].frames[0].cards.push(clone(truth[0])),
    m=>m.sequences[0].frames.push(clone(m.sequences[0].frames[0])),
    m=>{const f=clone(m.sequences[0].frames[0]); f.timestampMs=100;f.cards[0].answer='B';m.sequences[0].frames.push(f);}
  ]) {const m=fixture(); mutate(m); assert.throws(()=>validateManifest(m));}
});
test('PGM preserves whitespace-valued first pixels and rejects truncated/extra raster',()=>{
  const bytes=Buffer.concat([Buffer.from('P5\n2 1\n255\n'),Buffer.from([10,32])]);
  assert.deepEqual([...readPgm(bytes,2,1).data],[10,32]);
  assert.throws(()=>readPgm(bytes.subarray(0,-1),2,1));
  assert.throws(()=>readPgm(Buffer.concat([bytes,Buffer.from([0])]),2,1));
  assert.equal(quantile([], .95),null); assert.equal(quantile([4,1,3,2],.95),4);
});
test('official PDF composite replay, CLI reports, negative frames and hash rejection',()=>{
  mkdirSync('tmp',{recursive:true});
  const root=mkdtempSync('tmp/capture-test-');
  try {
    const {frame,expected}=composite(2);
    const bytes=Buffer.concat([Buffer.from(`P5\n${frame.width} ${frame.height}\n255\n`),frame.data]);
    writeFileSync(`${root}/frame.pgm`,bytes);
    const m=fixture();m.provenance='pdf-derived';
    const f={...m.sequences[0].frames[0],sha256:sha256(bytes),cards:expected.map(c=>({cardId:c.cardId,answer:c.answer,box:quadBox(c.quad)}))};
    m.sequences[0].frames=[0,100,200].map(timestampMs=>({...f,timestampMs}));
    const report=runBenchmark(m,root,{warmup:0});
    assert.equal(report.total.jointRecall,1);assert.equal(report.collection.correct,2);
    assert.equal(report.collection.p95Ms,200);assert.equal(report.checks.negativeFalsePositiveRate,null);
    assert.match(report.phase0Gate,/NOT_EVALUATED/);
    const wrong=runBenchmark(m,root,{warmup:0,scan:()=>result([detection(63)])});
    assert.equal(wrong.collection.wrongLocks,1);assert.equal(wrong.collection.uncollected,2);
    const empty=clone(m);empty.sequences[0].frames.forEach(f=>f.cards=[]);
    const negative=runBenchmark(empty,root,{warmup:0,scan:()=>result([])});
    assert.equal(negative.total.jointRecall,null);assert.equal(negative.total.negativeFalsePositiveRate,0);
    assert.equal(negative.collection.recall,null);
    const reset=clone(m);reset.sequences.push({...clone(m.sequences[0]),sequenceId:'clip-2'});
    assert.equal(runBenchmark(reset,root,{warmup:0}).collection.correct,4);
    writeFileSync(`${root}/manifest.json`,JSON.stringify(m));mkdirSync(`${root}/out`);
    const validation=spawnSync(process.execPath,['scripts/benchmark-captures.mjs',`${root}/manifest.json`,`${root}/out`,'--validate-only'],{encoding:'utf8'});
    assert.equal(validation.status,0,validation.stderr);
    const cli=spawnSync(process.execPath,['scripts/benchmark-captures.mjs',`${root}/manifest.json`,`${root}/out`],{encoding:'utf8'});
    assert.equal(cli.status,0,cli.stderr);
    const repeat=spawnSync(process.execPath,['scripts/benchmark-captures.mjs',`${root}/manifest.json`,`${root}/out`],{encoding:'utf8'});
    assert.equal(repeat.status,1);assert.match(repeat.stderr,/already exists/);
    m.sequences[0].frames[0].sha256='0'.repeat(64);
    assert.throws(()=>runBenchmark(m,root,{warmup:0}),/checksum/);
  } finally {
    const target=path.resolve(root), parent=path.resolve('tmp');
    assert.equal(path.dirname(target),parent);
    assert.ok(path.basename(target).startsWith('capture-test-'));
    rmSync(target,{recursive:true,force:true});
  }
});
