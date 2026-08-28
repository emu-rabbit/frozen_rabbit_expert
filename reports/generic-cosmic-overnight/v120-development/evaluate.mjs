// Bounded development comparison. At most two workers; never invokes overnight.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {estimateHqChancePercent} from '../../../packages/domain/src/hqChance.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const [label,mode='broad',seedText='31000000',countText='1',binaryArg,seedMethod='shared',candidate='generic-craft-route-portfolio-v1.2.0',baseline='generic-craft-route-portfolio-v1.1.0']=process.argv.slice(2)
assert(label&&/^[a-z0-9-]+$/.test(label))
const seedBase=Number(seedText),seedCount=Number(countText)
assert(seedCount>=1&&seedCount<=8)
assert(['shared','canonical'].includes(seedMethod))
const validIdentity=s=>/^generic-craft-route-portfolio-(?:v1\.\d+\.0|exp-[a-z0-9-]+)$/.test(s)
assert(validIdentity(candidate)&&validIdentity(baseline))
const binary=path.resolve(root,binaryArg??'native/craft-kernel/target/release/craft-kernel-generic-episode.exe')
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const binarySha256=hash(binary)
const out=path.join(root,'evaluation-runs/v120-development',label)
assert(!fs.existsSync(out),'Use a new label; never overwrite experiment evidence')
fs.mkdirSync(out,{recursive:true})
const binarySnapshot=path.join(root,'evaluation-runs/v120-development/artifacts',binarySha256,'craft-kernel-generic-episode.exe')
fs.mkdirSync(path.dirname(binarySnapshot),{recursive:true})
if(!fs.existsSync(binarySnapshot))fs.copyFileSync(binary,binarySnapshot)
assert.equal(hash(binarySnapshot),binarySha256)
const sourceFiles=mode==='focus'?['stable','balanced','aggressive'].map(r=>'evaluation-runs/v110-performance/readiness-'+r+'.json.candidate.tsv'):['evaluation-runs/v110-performance/cost-slice.candidate.tsv']
const lines=sourceFiles.flatMap(p=>fs.readFileSync(path.join(root,p),'utf8').trim().split(/\r?\n/).map(l=>l.split('\t')))
assert(lines.every(l=>l.length===141))
assert.equal(lines.length,mode==='focus'?300:600)
const inputs=[]
for(const row of lines)for(let sample=0;sample<seedCount;sample++){
 const sourceBase=Number(row[1].match(/base-seed:(\d+)/)[1]),sourceSample=Number(row[1].match(/sample:(\d+)/)[1])
 const counter=(Number(row[56])^sourceBase^sourceSample)>>>0
 const c=[...row],seed=(seedBase^sample^(seedMethod==='canonical'?counter:0))>>>0
 assert((seed>>>20)!==(20260824>>>20),'new native seed must be outside the entire historical matrix block')
 c[1]=c[1].replace(/\|base-seed:\d+\|sample:\d+/,'|base-seed:'+seedBase+'|sample:'+sample).replace(/\|case:[^|]+/,'')+'|risk:'+c[4]+'|development:'+label
 c[3]=candidate;c[15]='none';c[56]=String(seed)
 inputs.push(c)
}
const inputDigest=createHash('sha256').update(inputs.map(c=>c.join('\t')).join('\n')).digest('hex')
fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify({label,mode,baseline,candidate,seedBase,seedCount,seedMethod,pairs:inputs.length,binarySha256,binarySnapshot:path.relative(root,binarySnapshot),evaluatorSha256:hash(fileURLToPath(import.meta.url)),inputDigest,sourceFiles,workers:2,armOrder:['baseline-candidate','candidate-baseline'],timeoutPerBatchMs:420000},null,2)+'\n')
const children=new Set()
function cleanup(){for(const child of children)child.kill()}
process.on('SIGINT',()=>{cleanup();process.exit(130)})
process.on('SIGTERM',()=>{cleanup();process.exit(143)})
process.on('exit',cleanup)
function run(cases,arm,slot){
 return new Promise((resolve,reject)=>{
 const version=arm==='baseline'?baseline:candidate
 const input=cases.map(c=>{const row=[...c];row[3]=version;return row.join('\t')}).join('\n')+'\n'
 fs.writeFileSync(path.join(out,slot+'-'+arm+'.input.tsv'),input)
 const started=Date.now(),child=spawn(binarySnapshot,[],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']})
 children.add(child)
 let stdout='',stderr=''
 child.stdout.on('data',d=>{stdout+=d});child.stderr.on('data',d=>{stderr+=d})
 const timer=setTimeout(()=>child.kill(),420000)
 child.on('error',error=>{clearTimeout(timer);children.delete(child);reject(error)})
 child.on('close',code=>{clearTimeout(timer);children.delete(child);try{
 fs.writeFileSync(path.join(out,slot+'-'+arm+'.output.tsv'),stdout)
 fs.writeFileSync(path.join(out,slot+'-'+arm+'.stderr.txt'),stderr)
 assert.equal(code,0,stderr)
 const rows=stdout.trim().split(/\r?\n/).map(l=>l.split('\t'));const summary=rows.pop()
 assert.equal(summary[1],'__batch__');assert.equal(Number(summary[4]),cases.length)
 assert.equal(rows.length,cases.length)
 let digest=0xcbf29ce484222325n
 for(const byte of Buffer.from(rows.map(r=>r.join('\t')).join('\n')+'\n'))digest=BigInt.asUintN(64,(digest^BigInt(byte))*0x100000001b3n)
 assert.equal(digest.toString(16).padStart(16,'0'),summary[8])
 rows.forEach((r,i)=>{assert(!['illegal-action','policy-null'].includes(r[16]),r[16]);assert(Number(r[17])<=Number(cases[i][59]));if(r[15]==='completed'){assert(Number(r[26])>=Number(cases[i][18]));assert(Number(r[27])>=Number(cases[i][20]))}})
 rows.forEach((r,i)=>{assert.equal(r.length,51);assert.equal(r[1],cases[i][1]);assert.equal(r[3],'ok');assert.equal(r[4],version);const ns=r[50].split(',').filter(Boolean).map(Number);assert.equal(ns.length,Number(r[21]));assert.equal(ns.reduce((s,n)=>s+n,0),Number(r[22]));assert.equal(Math.max(0,...ns),Number(r[23]))})
 fs.writeFileSync(path.join(out,slot+'-'+arm+'.output.tsv'),stdout)
 resolve({rows,wallMs:Date.now()-started})
 }catch(e){reject(e)}})
 child.stdin.end(input)
 })
}
function utility(row,input){
 if(row[15]!=='completed')return 0
 const q=Number(row[27]),max=Number(input[5])
 if(q<=0)return 0
 if(input[8]==='hq-chance')return estimateHqChancePercent(q,max)/100
 const n=Number(input[9]);if(n<=1)return Math.min(1,q/max)
 const t=input.slice(10,10+n).map(Number);let j=0
 while(j<n&&q>=t[j])j++
 if(j===n)return 1
 const lower=j===0?0:t[j-1];return (j+(q-lower)/(t[j]-lower))/n
}
const started=Date.now()
const paired=[]
try{await Promise.all([0,1].map(async slot=>{
 const cases=inputs.filter((_,i)=>i%2===slot)
 // Balance arm order across the two slots for the confirmation batches.
 let b,c
 if(slot===0){b=await run(cases,'baseline',slot);c=await run(cases,'candidate',slot)}
 else{c=await run(cases,'candidate',slot);b=await run(cases,'baseline',slot)}
 cases.forEach((input,i)=>paired.push({input,b:b.rows[i],c:c.rows[i]}))
 console.log('Finished slot '+slot+' '+cases.length+' pairs')
}))}catch(error){cleanup();throw error}
const groups={}
const times={baseline:[],candidate:[]}
const rowOut=[]
function group(){return {n:0,b:0,c:0,w:0,l:0,bU:0,cU:0,bFull:0,cFull:0,bActions:0,cActions:0,bNs:0,cNs:0,stopsB:{},stopsC:{}}}
for(const {input,b,c}of paired){
 const recipe=Number(input[16]),risk=input[4],world=input[1].match(/world:([^@|]+)/)[1],equipment=input[1].match(/equipment:([^@|]+)/)[1]
 const kind=input[8],contract=Number(input[20])>0?'hard-quality':'progress-only',bu=utility(b,input),cu=utility(c,input)
 const bd=b[15]==='completed',cd=c[15]==='completed',bf=bd&&Number(b[27])>=Number(input[5]),cf=cd&&Number(c[27])>=Number(input[5])
 const keys=['all',contract,contract+'/'+risk,contract+'/'+world,kind,'recipe/'+recipe,'cell/'+recipe+'/'+equipment+'/'+risk+'/'+world]
 for(const key of keys){const g=groups[key]??=group();g.n++;g.b+=+bd;g.c+=+cd;g.w+=+(!bd&&cd);g.l+=+(bd&&!cd);g.bU+=bu;g.cU+=cu;g.bFull+=+bf;g.cFull+=+cf;g.bActions+=Number(b[17]);g.cActions+=Number(c[17]);g.bNs+=Number(b[22]);g.cNs+=Number(c[22]);g.stopsB[b[16]]=(g.stopsB[b[16]]??0)+1;g.stopsC[c[16]]=(g.stopsC[c[16]]??0)+1}
 times.baseline.push(...b[50].split(',').filter(Boolean).map(Number));times.candidate.push(...c[50].split(',').filter(Boolean).map(Number))
 rowOut.push({recipe,equipment,risk,world,seed:Number(input[56]),kind,bCompleted:bd,cCompleted:cd,bU:bu,cU:cu,bFull:bf,cFull:cf,bStop:b[16],cStop:c[16],bActions:Number(b[17]),cActions:Number(c[17]),bNs:Number(b[22]),cNs:Number(c[22])})
}
for(const g of Object.values(groups)){g.dc=(g.c-g.b)/g.n;g.du=(g.cU-g.bU)/g.n;g.costRatio=g.cNs/g.bNs}
const latency={}
for(const [key,a]of Object.entries(times)){a.sort((a,b)=>a-b);latency[key]={calls:a.length,p50Ms:a[Math.ceil(a.length*.5)-1]/1e6,p95Ms:a[Math.ceil(a.length*.95)-1]/1e6,p99Ms:a[Math.ceil(a.length*.99)-1]/1e6,maxMs:a.at(-1)/1e6}}
const result={label,mode,seedBase,seedCount,binarySha256,inputDigest,pairs:inputs.length,workers:2,wallMs:Date.now()-started,latency,groups}
fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2)+'\n')
fs.writeFileSync(path.join(out,'rows.json'),JSON.stringify(rowOut)+'\n')
console.log(JSON.stringify({...result,groups:Object.fromEntries(Object.entries(groups).filter(([k])=>!k.startsWith('cell/')&&!k.startsWith('recipe/')))},null,2))
