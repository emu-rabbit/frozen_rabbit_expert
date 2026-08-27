// Recompute this review from saved evidence only. Never starts solver episodes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { sha256File, sha256Value, validateCompletedShard } from '../../../tools/evaluate-generic-cosmic-overnight/lib.mjs'
import { generateOvernightOverviewReport } from '../../../tools/evaluate-generic-cosmic-overnight/overview-report.mjs'
import { COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT as HQ } from '../../../packages/domain/src/hqChance.ts'

const output = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(output, '../../..')
const runId = 'generic-native-v030-vs-v022-64seed-w3-20260826'
const run = path.join(root, 'evaluation-runs/generic-cosmic-overnight-native', runId)
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const config = read(path.join(run, 'config.json'))
const manifest = read(path.join(run, 'manifest.json'))
const axes = config.payload.axes
const execution = config.payload.evaluator.execution
assert.equal(sha256Value(config.payload), config.configFingerprint)
assert.equal(manifest.configFingerprint, config.configFingerprint)
assert.equal(manifest.outcome, 'completed')
assert.deepEqual(manifest.summary, {totalShards:150, completed:150, running:0, failed:0, pending:0, completedEpisodes:384000})
assert.equal(sha256File(path.join(root, execution.binarySnapshot)), execution.binarySha256)
const first = read(path.join(run, 'shards', manifest.shards[0].fileName))
const bundle = first.evaluatorCommand[1]
assert.equal(sha256File(bundle), config.payload.evaluator.bundleSha256)
const described = spawnSync(process.execPath, [bundle, '--describe'], {cwd:root, encoding:'utf8', windowsHide:true})
assert.equal(described.status, 0, described.stderr)
const description = JSON.parse(described.stdout)
assert.deepEqual(description.equipmentIds, axes.equipmentIds)
assert.deepEqual(description.worldIds, axes.worldIds)
assert.deepEqual(description.families.map(({familyId, representativeRecipeId})=>({familyId,representativeRecipeId})), axes.families)

const families = new Map(axes.families.map((f,i)=>[f.familyId, {...f, code:`F${String(i+1).padStart(2,'0')}`}]))
const equipment = new Map(axes.equipmentIds.map((id,i)=>[id,`E${String(i+1).padStart(2,'0')}`]))
const groups = new Map()
const cells = new Map()
const exceptions = []
const examples = []
const seenExamples = new Map()
let traceRows = 0
const nativeTotals={pairs:0,completionWins:0,completionLosses:0,qualityMaximumWins:0,qualityMaximumLosses:0}
function arm() {
  return {n:0, completed:0, full:0, utility:0, qualityFraction:0, stops:{}, milestones:[0,0,0,0],
    hq:[0,0,0], hqSum:0, collectabilitySum:0, cpSum:0, durabilitySum:0, calls:0, ns:0, maxNs:0,
    length:{completed:{A:[],S:[]},uncompleted:{A:[],S:[]}}, atLeast70:0}
}
function group() {return {n:0, baseline:arm(), candidate:arm(), completionWin:0,completionLoss:0,fullWin:0,fullLoss:0,utilityWin:0,utilityLoss:0,utilityDelta:0,utilityDeltaSquares:0,stopTransitions:{},changed:0}}
function addArm(g,r) {
  g.n++
  const done=r.terminal==='completed'
  g.completed+=Number(done)
  g.full+=Number(done&&r.quality>=r.qualityMaximum)
  g.utility+=r.completedObjectiveUtility
  g.qualityFraction+=done?r.quality/r.qualityMaximum:0
  g.stops[r.stopReason]=(g.stops[r.stopReason]??0)+1
  r.qualityMilestones.forEach((x,i)=>{g.milestones[i]+=Number(done&&r.quality>=x)})
  const hq=HQ[Math.min(100,Math.floor(r.quality/r.qualityMaximum*100))]
  if(done){g.hqSum+=hq;g.collectabilitySum+=Math.floor(r.quality/10)}
  ;[50,75,100].forEach((x,i)=>{g.hq[i]+=Number(done&&hq>=x)})
  g.cpSum+=r.cp;g.durabilitySum+=r.durability
  g.calls+=r.recommendationCalls;g.ns+=r.recommendationNs;g.maxNs=Math.max(g.maxNs,r.recommendationMaxNs)
  const length=g.length[done?'completed':'uncompleted']
  length.A[r.actions]=(length.A[r.actions]??0)+1
  length.S[r.advancingSteps]=(length.S[r.advancingSteps]??0)+1
  g.atLeast70+=Number(r.actions>=70)
}
const fields=['terminal','stopReason','actions','advancingSteps','progress','quality','durability','cp','recommendationCalls','plannerContext']
function add(g,b,c) {
  g.n++;addArm(g.baseline,b);addArm(g.candidate,c)
  const bd=b.terminal==='completed',cd=c.terminal==='completed'
  const bf=bd&&b.quality>=b.qualityMaximum,cf=cd&&c.quality>=c.qualityMaximum
  g.completionWin+=Number(!bd&&cd);g.completionLoss+=Number(bd&&!cd)
  g.fullWin+=Number(!bf&&cf);g.fullLoss+=Number(bf&&!cf)
  const d=c.completedObjectiveUtility-b.completedObjectiveUtility
  g.utilityWin+=Number(d>1e-12);g.utilityLoss+=Number(d< -1e-12)
  g.utilityDelta+=d;g.utilityDeltaSquares+=d*d
  const transition=`${b.stopReason} -> ${c.stopReason}`
  g.stopTransitions[transition]=(g.stopTransitions[transition]??0)+1
  g.changed+=Number(fields.some(f=>b[f]!==c[f]))
}
function addTo(map,key,b,c) {if(!map.has(key))map.set(key,group());add(map.get(key),b,c)}
function identity(row) {return {family:families.get(row.familyId).code,recipeId:row.recipeId,equipment:equipment.get(row.equipmentId),equipmentId:row.equipmentId,risk:row.risk,world:row.worldId,seedIndex:row.seedIndex,pairedSeed:row.pairedSeed,caseId:row.caseId}}
function slim(row) {return Object.fromEntries([...fields,'completedObjectiveUtility','qualityMaximum','qualityMilestones'].map(f=>[f,row[f]]))}
for (const entry of manifest.shards) {
  assert.equal(entry.status,'completed')
  assert(entry.attempts.some(a=>a.outcome==='completed'&&a.exitCode===0&&!a.timedOut))
  const shard=validateCompletedShard(read(path.join(run,'shards',entry.fileName)),{
    configFingerprint:config.configFingerprint,evaluatorBundleSha256:config.payload.evaluator.bundleSha256,
    runId,shard:entry,seedCount:axes.seedCountPerCell,baseSeed:axes.baseSeed,description,executionIdentity:execution,
  })
  assert.equal(shard.nativeBinarySha256,execution.binarySha256)
  assert.equal(shard.nativeAbiVersion,execution.abiVersion)
  for(const key of Object.keys(nativeTotals))nativeTotals[key]+=shard.report.pairedComparison[key]
  families.get(entry.familyId).kind=shard.report.rows[0].qualityUtilityKind
  const paired=new Map()
  for(const row of shard.report.rows){
    traceRows+=Number(typeof row.trace==='string')
    if(!paired.has(row.caseId))paired.set(row.caseId,{})
    paired.get(row.caseId)[row.arm]=row
  }
  for(const {baseline:b,candidate:c} of paired.values()){
    for(const field of ['caseFingerprint','pairedSeed','qualityMaximum','qualityMilestones','qualityUtilityKind','protectedQualityFloor'])assert.deepEqual(b[field],c[field])
    const kind=c.qualityUtilityKind
    const f=families.get(c.familyId).code,e=equipment.get(c.equipmentId)
    const specialist=e==='E03'||e==='E10'?'specialist':'non-specialist'
    const contract=c.completionContract==='progress-only'?'progress-only':'hard-quality'
    const keys=['all',`contract/${contract}`,`kind/${kind}`,`risk/${c.risk}`,`world/${c.worldId}`,`equipment/${e}`,`family/${f}`,
      `contract-risk/${contract}/${c.risk}`,`contract-world/${contract}/${c.worldId}`,`contract-equipment/${contract}/${e}`,
      `contract-specialist/${contract}/${specialist}`,`contract-specialist-risk/${contract}/${specialist}/${c.risk}`,
      `contract-specialist-world/${contract}/${specialist}/${c.worldId}`,`family-risk/${f}/${c.risk}`,`family-world/${f}/${c.worldId}`,
      `family-equipment/${f}/${e}`]
    if(c.risk==='balanced'&&c.worldId==='balanced-iid'&&(e==='E02'||e==='E09'))keys.push(`focus/${contract}/${e}`,`focus-family/${f}/${e}`)
    for(const key of keys)addTo(groups,key,b,c)
    const cellKey=`${f}/${e}/${c.risk}/${c.worldId}`
    addTo(cells,cellKey,b,c)
    const completionLoss=b.terminal==='completed'&&c.terminal!=='completed'
    const fullLoss=b.terminal==='completed'&&b.quality>=b.qualityMaximum&&!(c.terminal==='completed'&&c.quality>=c.qualityMaximum)
    const newBad=['failed','illegal-action','action-limit'].includes(c.stopReason)&&b.stopReason!==c.stopReason
    const d=c.completedObjectiveUtility-b.completedObjectiveUtility
    if(completionLoss||fullLoss||newBad||d< -1e-12)exceptions.push({...identity(c),completionLoss,fullLoss,newBad,delta:d,baseline:slim(b),candidate:slim(c)})
    if(d>1e-12){
      const key=`${f}/${specialist}/${c.risk}/${c.worldId}/${b.stopReason}`
      if((seenExamples.get(key)??0)<1){examples.push({...identity(c),delta:d,baseline:slim(b),candidate:slim(c)});seenExamples.set(key,1)}
    }
  }
  if((entry.ordinal+1)%30===0)console.log(`Validated ${entry.ordinal+1}/150 shards`)
}
function lengthSummary(hist) {
  const n=hist.reduce((s,x)=>s+(x??0),0)
  if(!n)return {n:0,p50:null,p90:null,p95:null,max:null,mean:null}
  function quantile(p){let count=0;for(let i=0;i<hist.length;i++){count+=hist[i]??0;if(count>Math.floor(n*p))return i}}
  return {n,p50:quantile(.5),p90:quantile(.9),p95:quantile(.95),max:hist.length-1,mean:hist.reduce((s,x,i)=>s+(x??0)*i,0)/n}
}
function finish(g){
  const out={...g}
  for(const a of ['baseline','candidate']){
    const x=g[a]
    out[a]={...x,utilityMean:x.utility/x.n,qualityFractionMean:x.qualityFraction/x.n,latencyMeanMs:x.ns/x.calls/1e6,latencyMaxMs:x.maxNs/1e6,
      length:Object.fromEntries(Object.entries(x.length).map(([status,metrics])=>[status,Object.fromEntries(Object.entries(metrics).map(([k,h])=>[k,lengthSummary(h)]))]))}
  }
  out.utilityDeltaMean=g.utilityDelta/g.n
  // Descriptive paired-case interval only; not family-clustered or a release gate.
  const se=g.n>1?Math.sqrt(Math.max(0,(g.utilityDeltaSquares-g.utilityDelta*g.utilityDelta/g.n)/(g.n-1))/g.n):0
  out.utilityDeltaCaseNormal95=[out.utilityDeltaMean-1.96*se,out.utilityDeltaMean+1.96*se]
  return out
}
assert.equal(groups.get('all').n,384000)
for(const [native,own] of [['pairs','n'],['completionWins','completionWin'],['completionLosses','completionLoss'],['qualityMaximumWins','fullWin'],['qualityMaximumLosses','fullLoss']])assert.equal(nativeTotals[native],groups.get('all')[own])
assert.equal(cells.size,6000)
assert([...cells.values()].every(c=>c.n===64))
const overviewDir=path.join(root,'.tmp/v030-review-overview')
const overview=generateOvernightOverviewReport({runDirectory:run,outputDirectory:overviewDir})
assert.equal(fs.readFileSync(overview.outputPath,'utf8'),fs.readFileSync(path.join(root,'reports/generic-cosmic-overnight',`${runId}.md`),'utf8'))
const result={runId,configFingerprint:config.configFingerprint,binarySha256:execution.binarySha256,evaluatorBundleSha256:sha256File(bundle),
  validation:{shards:150,pairs:384000,armRows:768000,cells:6000,traceRows,overviewExactMatch:true},
  families:[...families.values()],equipment:[...equipment.entries()],manifestTiming:manifest.timing,
  groups:Object.fromEntries([...groups].map(([k,g])=>[k,finish(g)]))}
fs.writeFileSync(path.join(output,'metrics.json'),`${JSON.stringify(result)}\n`)
function compactArm(x){return {completed:x.completed,full:x.full,utilityMean:x.utilityMean,stops:x.stops,milestones:x.milestones,hq:x.hq,hqSum:x.hqSum,collectabilitySum:x.collectabilitySum,length:x.length}}
const cellLines=[...cells].map(([key,g])=>JSON.stringify({key,n:g.n,completionWin:g.completionWin,completionLoss:g.completionLoss,fullWin:g.fullWin,fullLoss:g.fullLoss,
  utilityWin:g.utilityWin,utilityLoss:g.utilityLoss,utilityDeltaMean:g.utilityDelta/g.n,baseline:compactArm(finish(g).baseline),candidate:compactArm(finish(g).candidate)}))
fs.writeFileSync(path.join(output,'cells.jsonl'),`${cellLines.join('\n')}\n`)
fs.writeFileSync(path.join(output,'exceptions.json'),`${JSON.stringify(exceptions,null,2)}\n`)
fs.writeFileSync(path.join(output,'gain-examples.json'),`${JSON.stringify(examples,null,2)}\n`)
const names=new Map(fs.readFileSync(overview.outputPath,'utf8').split('\n').filter(x=>/^\| F\d\d \|/.test(x)).map(x=>{const a=x.split('|').map(x=>x.trim());return [a[1],a[2]]}))
const signed=x=>`${x>0?'+':''}${x}`
const rateCell=(c,b,n)=>`${(c/n*100).toFixed(2)}% (${signed(Number(((c-b)/n*100).toFixed(2)))} pp)`
const kinds={'hard-quality-max':'hard-quality','collectability-tiers':'一般收藏品','hq-chance':'HQ','continuous-collectability':'Master'}
const lines=['# 第六批逐家族索引','', '> 由 analyze.mjs 重算；每列包含 10 equipment × 3 risk × 4 assumed worlds × 64 seeds，共 7,680 pairs。這張表僅用於定位家族，不能代替格內與逐案分析。pp 是百分點。','',
 '| Family | 代表配方 | 類型 | 完成率（差） | 滿品質率（差） | 完成 win/loss | 滿品質 win/loss | 品質 utility 差（pp） | Utility win/loss |',
 '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
for(const f of families.values()){
 const g=groups.get(`family/${f.code}`),b=g.baseline,c=g.candidate
 lines.push(`| ${f.code} | ${names.get(f.code)} | ${kinds[f.kind]} | ${rateCell(c.completed,b.completed,g.n)} | ${rateCell(c.full,b.full,g.n)} | ${g.completionWin}/${g.completionLoss} | ${g.fullWin}/${g.fullLoss} | ${signed(Number((g.utilityDelta/g.n*100).toFixed(3)))} | ${g.utilityWin}/${g.utilityLoss} |`)
}
lines.push('','完整 6,000 個 family × equipment × risk × world cells 保存在 [cells.jsonl](cells.jsonl)；主分析與例外判讀見 [review.md](review.md)。','')
fs.writeFileSync(path.join(output,'family-summary.md'),lines.join('\n'))
console.log(JSON.stringify({validation:result.validation,all:finish(groups.get('all')),exceptionCases:exceptions.length},null,2))
