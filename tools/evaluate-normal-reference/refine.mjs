// Retry incomplete Raphael cases without mutating the original 30 s corpus.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'

const [mode='status',sourceArg='evaluation-runs/normal-reference/raphael-main-500',outArg='evaluation-runs/normal-reference/raphael-main-500-refine-120s',budgetArg='120000']=process.argv.slice(2)
assert(['run','status','resume'].includes(mode))
const source=path.resolve(sourceArg),out=path.resolve(outArg),budgetMs=Number(budgetArg)
assert(Number.isInteger(budgetMs)&&budgetMs>=1&&budgetMs<=300000)
const hash=data=>createHash('sha256').update(data).digest('hex')
const fileHash=p=>hash(fs.readFileSync(p))
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const atomic=(p,v)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p)}
const sourceManifest=read(path.join(source,'manifest.json'))
const binary=path.join(source,'reference.exe'),inputPath=path.join(source,'input.tsv')
assert.equal(fileHash(binary),sourceManifest.binarySha256)
assert.equal(fileHash(inputPath),sourceManifest.inputSha256)
const inputs=fs.readFileSync(inputPath,'utf8').trim().split(/\r?\n/)
assert.equal(inputs.length,sourceManifest.cases)
const sourceResultPath=i=>path.join(source,`case-${String(i).padStart(3,'0')}.json`)
const targets=[]
for(let i=0;i<inputs.length;i++){
 const original=read(sourceResultPath(i))
 assert.equal(original.inputSha256,hash(inputs[i]))
 assert.equal(original.caseId,inputs[i].split('\t')[1])
 if(original.reference.status!=='optimal')targets.push({index:i,caseId:original.caseId,originalStatus:original.reference.status})
}
const manifestPath=path.join(out,'manifest.json')
let manifest
if(fs.existsSync(manifestPath))manifest=read(manifestPath)
else {
 assert.equal(mode,'run','run creates a new refinement manifest')
 fs.mkdirSync(out,{recursive:true})
 manifest={schema:'normal-reference-refinement-v1',createdAt:new Date().toISOString(),source:path.relative(process.cwd(),source).replaceAll('\\','/'),
  sourceRevision:sourceManifest.revision,sourceBinarySha256:sourceManifest.binarySha256,sourceInputSha256:sourceManifest.inputSha256,
  budgetMs,workers:2,threadsPerWorker:1,targetRule:'original reference status is not optimal',targets}
 atomic(manifestPath,manifest)
}
assert.equal(manifest.sourceBinarySha256,sourceManifest.binarySha256)
assert.equal(manifest.sourceInputSha256,sourceManifest.inputSha256)
assert.equal(manifest.budgetMs,budgetMs)
assert.deepEqual(manifest.targets,targets)
const resultPath=i=>path.join(out,`case-${String(i).padStart(3,'0')}.json`)
const quality=r=>r?.replay?.local?.quality??null
const replayable=r=>r?.replay?.legal===true&&(r.replay.mismatchSteps?.length??0)===0
function comparison(original,next){
 const originalReplay=replayable(original),nextReplay=replayable(next)
 const originalQuality=quality(original),nextQuality=quality(next)
 return {originalReplayable:originalReplay,nextReplayable:nextReplay,originalQuality,nextQuality,
  newlyReplayable:!originalReplay&&nextReplay,
  qualityDelta:nextReplay?nextQuality-(originalReplay?originalQuality:0):null,
  improved:nextReplay&&(!originalReplay||nextQuality>originalQuality),
  newlyOptimal:original.status!=='optimal'&&next.status==='optimal'}
}
function status(){
 const counts={},comparisonCounts={newlyReplayable:0,improved:0,newlyOptimal:0},pending=[]
 for(const target of targets){
  const p=resultPath(target.index)
  if(!fs.existsSync(p)){pending.push(target.index);continue}
  const r=read(p),original=read(sourceResultPath(target.index)).reference
  assert.equal(r.index,target.index);assert.equal(r.caseId,target.caseId);assert.equal(r.inputSha256,hash(inputs[target.index]))
  assert.equal(r.sourceBinarySha256,sourceManifest.binarySha256);assert.equal(r.budgetMs,budgetMs)
  assert.deepEqual(r.comparison,comparison(original,r.reference))
  counts[r.reference.status]=(counts[r.reference.status]??0)+1
  for(const key of Object.keys(comparisonCounts))if(r.comparison[key])comparisonCounts[key]++
 }
 return {completedRecords:targets.length-pending.length,total:targets.length,counts,comparisonCounts,pending}
}
if(mode==='status'){console.log(JSON.stringify(status(),null,2));process.exit(0)}
const children=new Set()
function cleanup(){for(const child of children)child.kill()}
process.on('SIGINT',()=>{cleanup();process.exit(130)});process.on('SIGTERM',()=>{cleanup();process.exit(143)});process.on('exit',cleanup)
async function execute(i){
 const rawPath=path.join(out,`case-${String(i).padStart(3,'0')}-reference-${budgetMs}.jsonl`)
 if(fs.existsSync(rawPath))fs.renameSync(rawPath,rawPath+'.'+Date.now())
 const fd=fs.openSync(rawPath,'wx')
 let stderr='',hardTimeout=false,buffer='',events=[]
 const child=spawn(binary,[String(budgetMs)],{windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(child)
 const timer=setTimeout(()=>{hardTimeout=true;child.kill()},budgetMs+10000)
 child.stdout.on('data',data=>{fs.writeSync(fd,data);buffer+=data;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(line.trim())events.push(JSON.parse(line))}})
 child.stderr.on('data',data=>{stderr+=data})
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);child.stdin.end(inputs[i]+'\n')}).finally(()=>{clearTimeout(timer);children.delete(child);fs.closeSync(fd)})
 fs.writeFileSync(rawPath+'.stderr',stderr)
 assert(exit===0||hardTimeout,stderr)
 const result=events.findLast(event=>event.event==='result')
 if(result)return result
 assert(hardTimeout,'reference process exited without a result')
 return {...events.findLast(event=>event.event==='incumbent'),event:'result',caseId:inputs[i].split('\t')[1],status:'hard-timeout',budgetMs}
}
let cursor=0,finished=0
await Promise.all([0,1].map(async()=>{while(cursor<targets.length){
 const target=targets[cursor++],p=resultPath(target.index)
 if(fs.existsSync(p))continue
 const original=read(sourceResultPath(target.index)).reference,reference=await execute(target.index)
 const record={index:target.index,inputSha256:hash(inputs[target.index]),caseId:target.caseId,sourceBinarySha256:sourceManifest.binarySha256,
  budgetMs,original:{status:original.status,elapsedMs:original.elapsedMs??null,quality:quality(original),replayable:replayable(original)},reference,
  comparison:comparison(original,reference)}
 atomic(p,record);finished++
 console.log(JSON.stringify({index:target.index,finishedThisRun:finished,status:reference.status,quality:quality(reference),...record.comparison}))
}}))
console.log(JSON.stringify(status(),null,2))
