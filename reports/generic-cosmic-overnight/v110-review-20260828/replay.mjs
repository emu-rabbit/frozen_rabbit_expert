// Bounded exact-binary replays of selected observed losses and ability gaps.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {sha256File} from '../../../tools/evaluate-generic-cosmic-overnight/lib.mjs'
const output=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(output,'../../..')
const run=path.join(root,'evaluation-runs/generic-cosmic-overnight-native/generic-native-v110-perf-vs-v030-64seed-20260827')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const config=read(path.join(run,'config.json')),manifest=read(path.join(run,'manifest.json'))
const binary=path.join(root,config.payload.evaluator.execution.binarySnapshot)
const bundle=read(path.join(run,'shards',manifest.shards[0].fileName)).evaluatorCommand[1]
assert.equal(sha256File(binary),config.payload.evaluator.execution.binarySha256)
assert.equal(sha256File(bundle),config.payload.evaluator.bundleSha256)
const chosen=[]
function choose(f,e,r,w,predicate,all=false){
 const family=config.payload.axes.families[Number(f.slice(1))-1]
 const equipmentId=config.payload.axes.equipmentIds[Number(e.slice(1))-1]
 const sh=manifest.shards.find(x=>x.familyId===family.familyId&&x.risk===r)
 const rows=read(path.join(run,'shards',sh.fileName)).report.rows
 const baseline=new Map(rows.filter(x=>x.arm==='baseline').map(x=>[x.caseId,x]))
 for(const c of rows.filter(x=>x.arm==='candidate'&&x.equipmentId===equipmentId&&x.worldId===w)){
  const b=baseline.get(c.caseId)
  if(predicate(b,c)){chosen.push({family:f,equipment:e,risk:r,world:w,seedIndex:c.seedIndex,pairedSeed:c.pairedSeed,baseline:b,candidate:c});if(!all)break}
 }
}
const loss=(b,c)=>b.terminal==='completed'&&c.terminal!=='completed'
for(const [f,e] of [['F12','E02'],['F15','E09'],['F17','E02'],['F17','E09'],['F32','E02'],['F42','E09'],['F44','E02']]) choose(f,e,'balanced','balanced-iid',loss,true)
choose('F33','E02','balanced','balanced-iid',loss)
choose('F18','E02','stable','balanced-iid',loss)
choose('F43','E09','aggressive','balanced-iid',loss)
// base seed 20260824 XOR sample 3 equals the readiness seed 20260827.
choose('F19','E02','balanced','balanced-iid',(b,c)=>c.seedIndex===3)
choose('F36','E09','balanced','balanced-iid',(b,c)=>b.terminal!=='completed'&&c.terminal!=='completed')
choose('F46','E09','balanced','balanced-iid',(b,c)=>b.terminal!=='completed'&&c.terminal!=='completed')
choose('F35','E09','balanced','opportunity-scarce-iid',(b,c)=>b.terminal!=='completed'&&c.terminal!=='completed')
choose('F35','E09','balanced','opportunity-scarce-iid',(b,c)=>c.seedIndex===3)
choose('F35','E09','balanced','all-normal',(b,c)=>c.seedIndex===3)
choose('F36','E10','balanced','balanced-iid',(b,c)=>c.stopReason==='action-limit'&&b.terminal==='completed')
choose('F28','E09','balanced','balanced-iid',(b,c)=>b.terminal!=='completed'&&c.terminal==='completed')
assert(chosen.length<=24)
const scratch=path.join(root,'.tmp/v110-review-replays');fs.mkdirSync(scratch,{recursive:true})
const fields=['terminal','stopReason','actions','advancingSteps','progress','quality','durability','cp','recommendationCalls','plannerContext','completedObjectiveUtility']
const results=[]
const diagFamilies=new Set(['F12','F17','F33','F18','F36','F46','F35','F28'])
const observed=new Set()
const observer=path.join(root,'native/craft-kernel/target/release/examples/route_portfolio_diagnostics.exe')
for(const entry of chosen){
 const key=[entry.family,entry.equipment,entry.risk,entry.world,'s'+entry.seedIndex].join('-')
 const file=path.join(scratch,key+'.json')
 const args=[bundle,'--preset=full','--recipe='+entry.candidate.recipeId,'--equipment='+entry.candidate.equipmentId,'--world='+entry.world,
 '--seed-count=1','--base-seed='+((config.payload.axes.baseSeed^entry.seedIndex)>>>0),'--candidate-risk='+entry.risk,
 '--max-steps=80','--max-episodes=1','--trace','--quiet','--output='+file,'--native-binary='+binary,
 '--baseline-solver='+config.payload.evaluator.execution.baselineSolver,'--candidate-solver='+config.payload.evaluator.execution.candidateSolver]
 const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2**20})
 assert.equal(result.status,0,result.stderr||result.stdout)
 const report=read(file)
 assert.equal(report.cases,1)
 assert.deepEqual(report.binary.handshake,config.payload.evaluator.execution.binaryHandshake)
 const saved={family:entry.family,equipment:entry.equipment,risk:entry.risk,world:entry.world,seedIndex:entry.seedIndex,pairedSeed:entry.pairedSeed}
 for(const arm of ['baseline','candidate']){
  const row=report.rows.find(x=>x.arm===arm)
  assert.equal(row.pairedSeed,entry.pairedSeed)
  for(const f of fields)assert.deepEqual(row[f],entry[arm][f],key+' '+arm+' '+f)
  saved[arm]={...Object.fromEntries(fields.map(f=>[f,row[f]])),trace:row.trace}
 }
 if(diagFamilies.has(entry.family)&&!observed.has(entry.family)){
  const d=spawnSync(observer,[file+'.candidate.tsv'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*2**20})
  assert.equal(d.status,0,d.stderr)
  const outcome=d.stdout.split(/\r?\n/).find(l=>l.startsWith('outcome\t')).split('\t')
  assert.equal(outcome[2],entry.candidate.stopReason)
  assert.equal(Number(outcome[3]),entry.candidate.progress)
  assert.equal(Number(outcome[4]),entry.candidate.quality)
  assert.equal(Number(outcome[5]),entry.candidate.actions)
  const rec=d.stdout.split(/\r?\n/).filter(l=>l.startsWith('recommendation\t')).map(l=>l.split('\t')[3])
  const traceActions=report.rows.find(x=>x.arm==='candidate').trace.split(';').filter(Boolean).map(x=>x.split('|')[0])
  assert.deepEqual(rec,traceActions,key+' observer action sequence')
  fs.writeFileSync(path.join(output,key+'.diagnostics.tsv'),d.stdout)
  saved.observer={file:key+'.diagnostics.tsv',outcomeMatches:true,recommendationActions:rec}
  observed.add(entry.family)
 }
 results.push(saved)
 console.log(results.length+'/'+chosen.length+' '+key)
}
fs.writeFileSync(path.join(output,'replays.json'),JSON.stringify({binarySha256:sha256File(binary),observerBinarySha256:sha256File(observer),cases:results,pairedCases:results.length,episodes:results.length*2,observerEpisodes:observed.size,originalNonTimingFieldsMatched:fields},null,2)+'\n')
