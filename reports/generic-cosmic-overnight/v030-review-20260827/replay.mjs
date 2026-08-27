// Explicit, bounded diagnostic replays; no overnight runner or worker pool.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { sha256File } from '../../../tools/evaluate-generic-cosmic-overnight/lib.mjs'
const output=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(output,'../../..')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const run=path.join(root,'evaluation-runs/generic-cosmic-overnight-native/generic-native-v030-vs-v022-64seed-w3-20260826')
const config=read(path.join(run,'config.json'))
const manifest=read(path.join(run,'manifest.json'))
const first=read(path.join(run,'shards',manifest.shards[0].fileName))
const binary=path.join(root,config.payload.evaluator.execution.binarySnapshot)
const bundle=first.evaluatorCommand[1]
assert.equal(sha256File(binary),config.payload.evaluator.execution.binarySha256)
assert.equal(sha256File(bundle),config.payload.evaluator.bundleSha256)
const exceptions=read(path.join(output,'exceptions.json'))
const gains=read(path.join(output,'gain-examples.json'))
const chosen=exceptions.filter(x=>x.completionLoss||x.fullLoss||x.newBad)
for(const family of ['F02','F37','F28','F35','F36']){
 const x=gains.find(x=>x.family===family&&x.risk==='balanced'&&x.world==='balanced-iid'&&(family==='F28'?x.equipment==='E03':x.equipment==='E09'))
 if(x)chosen.push(x)
}
const recoveryWitness=gains.find(x=>x.family==='F11'&&x.baseline.stopReason==='policy-null')
if(recoveryWitness)chosen.push(recoveryWitness)
// Select progress and recovery witnesses from raw rows, not from truncated examples.
for(const [code,equipmentCode] of [['F02','E09'],['F37','E09'],['F19','E10'],['F35','E10']]){
 const family=config.payload.axes.families[Number(code.slice(1))-1]
 const entry=manifest.shards.find(x=>x.familyId===family.familyId&&x.risk==='balanced')
 const rows=read(path.join(run,'shards',entry.fileName)).report.rows
 const equipmentId=config.payload.axes.equipmentIds[Number(equipmentCode.slice(1))-1]
 const candidates=rows.filter(x=>x.arm==='candidate'&&x.equipmentId===equipmentId&&x.worldId==='balanced-iid')
 const c=candidates.find(c=>c.completedObjectiveUtility>rows.find(b=>b.arm==='baseline'&&b.caseId===c.caseId).completedObjectiveUtility)
 if(!c)continue
 const b=rows.find(b=>b.arm==='baseline'&&b.caseId===c.caseId)
 chosen.push({family:code,recipeId:c.recipeId,equipment:equipmentCode,equipmentId,risk:c.risk,world:c.worldId,seedIndex:c.seedIndex,pairedSeed:c.pairedSeed,caseId:c.caseId,delta:c.completedObjectiveUtility-b.completedObjectiveUtility,baseline:b,candidate:c})
}
assert(chosen.length<=40)
const versions=[
 'generic-craft-objective-capability-portfolio-v0.25.0',
 'generic-craft-progress-quality-shield-v0.26.0',
 'generic-craft-specialist-resource-portfolio-v0.27.0',
 'generic-craft-progress-bank-portfolio-v0.28.0',
 'generic-craft-flat-opportunity-portfolio-v0.29.0',
 'generic-craft-specialist-resource-guard-v0.30.0',
]
const baseline='generic-craft-condition-set-portfolio-v0.22.0'
const scratch=path.join(root,'.tmp/v030-review-replays')
fs.mkdirSync(scratch,{recursive:true})
const fields=['terminal','stopReason','actions','advancingSteps','progress','quality','durability','cp','recommendationCalls','plannerContext','completedObjectiveUtility']
const results=[]
let episodes=0
for(const entry of chosen){
 const selected=entry.newBad&&!entry.completionLoss&&!entry.fullLoss?[versions.at(-1)]:versions
 const record={...entry,versions:{}}
 for(const version of selected){
  const key=`${entry.family}-${entry.equipment}-${entry.risk}-${entry.world}-s${entry.seedIndex}-${version.slice(-7)}`
  const file=path.join(scratch,`${key}.json`)
  const args=[bundle,'--preset=full',`--recipe=${entry.recipeId}`,`--equipment=${entry.equipmentId}`,`--world=${entry.world}`,
   '--seed-count=1',`--base-seed=${(config.payload.axes.baseSeed^entry.seedIndex)>>>0}`,`--candidate-risk=${entry.risk}`,
   '--max-steps=80','--max-episodes=1','--trace','--quiet',`--output=${file}`,`--native-binary=${binary}`,`--baseline-solver=${baseline}`,`--candidate-solver=${version}`]
  if(!fs.existsSync(file)){
   const processResult=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2**20})
   assert.equal(processResult.status,0,processResult.stderr||processResult.stdout)
  }
  const report=read(file)
  assert.equal(report.cases,1)
  assert.deepEqual(report.binary.handshake,config.payload.evaluator.execution.binaryHandshake)
  assert.deepEqual(report.solvers,{baseline,candidate:version})
  const b=report.rows.find(x=>x.arm==='baseline'),c=report.rows.find(x=>x.arm==='candidate')
  assert.equal(c.pairedSeed,entry.pairedSeed)
  for(const f of fields)assert.deepEqual(b[f],entry.baseline[f],`baseline ${key} ${f}`)
  if(version===versions.at(-1))for(const f of fields)assert.deepEqual(c[f],entry.candidate[f],`candidate ${key} ${f}`)
  record.versions[version]={...Object.fromEntries(fields.map(f=>[f,c[f]])),trace:c.trace}
  record.baselineTrace=b.trace
  episodes+=2
 }
 results.push(record)
 console.log(`${results.length}/${chosen.length}: ${entry.family}/${entry.equipment}/${entry.risk}/${entry.world}/s${entry.seedIndex}`)
}
fs.writeFileSync(path.join(output,'replays.json'),`${JSON.stringify({episodes,caseCount:chosen.length,binarySha256:sha256File(binary),baseSeedRemapping:'originalBaseSeed XOR originalSeedIndex; sample 0; pairedSeed and saved non-timing outputs asserted',cases:results},null,2)}\n`)
console.log(JSON.stringify({episodes,cases:chosen.length,allOriginalArmsMatched:true}))
