// Research runner: bounded processes, immutable input/binary, atomic per-case results.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawn,execFileSync} from 'node:child_process'

const [mode='status',outArg='evaluation-runs/normal-reference/raphael-main-500',inputArg='.tmp/raphael-reference/cases.json.candidate.tsv',budgetArg='30000',limitArg='500']=process.argv.slice(2)
assert(['run','status','resume'].includes(mode))
const out=path.resolve(outArg),budgetMs=Number(budgetArg),limit=Number(limitArg)
assert(Number.isInteger(budgetMs)&&budgetMs>=1&&budgetMs<=300000)
assert(Number.isInteger(limit)&&limit>=1&&limit<=500)
const hash=data=>createHash('sha256').update(data).digest('hex')
const fileHash=p=>hash(fs.readFileSync(p))
const atomic=(p,v)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p)}
const manifestPath=path.join(out,'manifest.json')
let manifest
if(fs.existsSync(manifestPath))manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))
else {
 assert.equal(mode,'run','run creates a new manifest')
 const source=path.resolve('tools/evaluate-normal-reference/native/target/release/normal-craft-reference.exe')
 const upstream=path.resolve('.tmp/raphael-reference/upstream')
 const revision=execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim()
 assert.equal(revision,'411168605989d573d89f2d71c01acac9f099e55a')
 assert.equal(execFileSync('git',['-C',upstream,'status','--porcelain'],{encoding:'utf8',windowsHide:true}).trim(),'')
 const input=fs.readFileSync(inputArg,'utf8').trim().split(/\r?\n/)
 assert.equal(input.length,500)
 assert(input.every(l=>l.split('\t').length===141))
 fs.mkdirSync(out,{recursive:true})
 fs.copyFileSync(source,path.join(out,'reference.exe'))
 fs.writeFileSync(path.join(out,'input.tsv'),input.join('\n')+'\n')
 manifest={schema:'normal-reference-v1',createdAt:new Date().toISOString(),revision,upstream:'https://github.com/KonaeAkira/raphael-rs',license:'Apache-2.0',
  binarySha256:fileHash(source),inputSha256:fileHash(path.join(out,'input.tsv')),wrapperSha256:fileHash('tools/evaluate-normal-reference/native/src/main.rs'),
  cargoLockSha256:fileHash('tools/evaluate-normal-reference/native/Cargo.lock'),cases:500,workers:2,threadsPerWorker:1,
  assumptions:['all-Normal','no Stellar Steady Hand','no Trained Eye','specialist permission follows equipment','maximize quality; finish progress; then steps/time','hard required quality checked by local replay'],
  terminalNormalization:'clamp durability >=0, progress and quality to recipe maximum; terminal-only effects not compared; raw states retained'}
 atomic(manifestPath,manifest)
}
const binary=path.join(out,'reference.exe'),inputPath=path.join(out,'input.tsv')
assert.equal(fileHash(binary),manifest.binarySha256)
assert.equal(fileHash(inputPath),manifest.inputSha256)
const inputs=fs.readFileSync(inputPath,'utf8').trim().split(/\r?\n/)
const resultPath=i=>path.join(out,`case-${String(i).padStart(3,'0')}.json`)
function status(){const counts={};let n=0;for(let i=0;i<inputs.length;i++)if(fs.existsSync(resultPath(i))){const r=JSON.parse(fs.readFileSync(resultPath(i),'utf8'));assert.equal(r.inputSha256,hash(inputs[i]));assert.equal(r.caseId,inputs[i].split('\t')[1]);assert.equal(r.reference.caseId,r.caseId);assert.equal(r.policies.length,16);counts[r.reference.status]=(counts[r.reference.status]??0)+1;n++}return {completedRecords:n,total:inputs.length,counts}}
if(mode==='status'){console.log(JSON.stringify(status(),null,2));process.exit(0)}
const children=new Set()
function cleanup(){for(const c of children)c.kill()}
process.on('SIGINT',()=>{cleanup();process.exit(130)});process.on('SIGTERM',()=>{cleanup();process.exit(143)});process.on('exit',cleanup)
async function execute(i,policy=false){
 const suffix=policy?'policy':'reference',rawPath=path.join(out,`case-${i}-${suffix}-${budgetMs}.jsonl`)
 // Incomplete previous attempts are retained under their timestamp.
 if(fs.existsSync(rawPath))fs.renameSync(rawPath,rawPath+'.'+Date.now())
 const fd=fs.openSync(rawPath,'wx')
 const input=inputs[i].split('\t')
 let rows=[inputs[i]]
 if(policy)rows=['generic-craft-route-portfolio-v1.1.0','generic-craft-route-portfolio-exp-condition-route-risk'].flatMap(solver=>Array.from({length:8},(_,seed)=>{const r=[...input];r[1]+=`|reference-policy:${solver}|success-sample:${seed}`;r[3]=solver;r[56]=String((141000000^Number(input[56])^seed)>>>0);return r.join('\t')}))
 let stderr='',hardTimeout=false,buffer='',events=[]
 const child=spawn(binary,[String(budgetMs),...(policy?['policy']:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(child)
 const timer=setTimeout(()=>{hardTimeout=true;child.kill()},policy?120000:budgetMs+10000)
 child.stdout.on('data',d=>{fs.writeSync(fd,d);buffer+=d;let index;while((index=buffer.indexOf('\n'))>=0){const l=buffer.slice(0,index);buffer=buffer.slice(index+1);if(l.trim())events.push(JSON.parse(l))}})
 child.stderr.on('data',d=>{stderr+=d})
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);child.stdin.end(rows.join('\n')+'\n')}).finally(()=>{clearTimeout(timer);children.delete(child);fs.closeSync(fd)})
 fs.writeFileSync(rawPath+'.stderr',stderr)
 if(policy){assert.equal(exit,0,stderr);assert.equal(events.length,16);assert(events.every(e=>e.event==='policy'&&!['illegal-action','policy-null'].includes(e.stop)));return events}
 assert(exit===0||hardTimeout,stderr)
 const result=events.findLast(e=>e.event==='result')
 if(result)return result
 assert(hardTimeout,'reference process exited without a result')
 return {...events.findLast(e=>e.event==='incumbent'),event:'result',caseId:input[1],status:'hard-timeout',budgetMs}
}
let cursor=0,finished=0
await Promise.all([0,1].map(async()=>{while(cursor<limit){const i=cursor++;const p=resultPath(i)
 if(fs.existsSync(p))continue
 const reference=await execute(i)
 const policies=await execute(i,true)
 atomic(p,{index:i,inputSha256:hash(inputs[i]),caseId:inputs[i].split('\t')[1],reference,policies})
 finished++
 console.log(JSON.stringify({index:i,finishedThisRun:finished,status:reference.status,quality:reference.replay?.local?.quality,ms:reference.elapsedMs,parityMismatches:reference.replay?.mismatchSteps?.length}))
}}))
console.log(JSON.stringify(status(),null,2))
