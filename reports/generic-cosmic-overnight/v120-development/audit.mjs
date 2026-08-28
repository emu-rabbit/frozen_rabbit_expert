// Recompute metrics from saved native inputs/outputs, including rejected trials.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {estimateHqChancePercent} from '../../../packages/domain/src/hqChance.ts'
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const tsv=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(l=>l.split('\t'))
const config=read(path.join(root,'evaluation-runs/generic-cosmic-overnight-native/generic-native-v110-perf-vs-v030-64seed-20260827/config.json')).payload
const family=new Map(config.axes.families.map((f,i)=>[f.representativeRecipeId,'F'+String(i+1).padStart(2,'0')]))
const equipment=new Map(config.axes.equipmentIds.map((e,i)=>[e,'E'+String(i+1).padStart(2,'0')]))
const oldSeeds=new Set(Array.from({length:2000},(_,cell)=>Array.from({length:64},(_,i)=>(20260824^(cell*512+i))>>>0)).flat())
function utility(r,i){
 if(r[15]!=='completed'||+r[27]<=0)return 0
 const q=+r[27],max=+i[5]
 if(i[8]==='hq-chance')return estimateHqChancePercent(q,max)/100
 const n=+i[9];if(n<=1)return Math.min(1,q/max)
 const thresholds=i.slice(10,10+n).map(Number);let j=0
 while(j<n&&q>=thresholds[j])j++
 if(j===n)return 1
 const low=j===0?0:thresholds[j-1];return (j+(q-low)/(thresholds[j]-low))/n
}
function empty(){return {n:0,b:0,c:0,wins:0,losses:0,bU:0,cU:0,bFull:0,cFull:0,bActions:0,cActions:0,bNs:0,cNs:0,changedOutcomes:0}}
function add(g,r){g.n++;g.b+=+r.b;g.c+=+r.c;g.wins+=+(!r.b&&r.c);g.losses+=+(r.b&&!r.c);for(const k of ['bU','cU','bFull','cFull','bActions','cActions','bNs','cNs'])g[k]+=+r[k];g.changedOutcomes+=+(r.b!==r.c||r.bU!==r.cU)}
function finish(g){return {...g,completionDeltaPp:100*(g.c-g.b)/g.n,utilityDelta:(g.cU-g.bU)/g.n,costRatio:g.cNs/g.bNs}}
const labels=process.argv.slice(2)
const results={}
for(const label of labels){
 const dir=path.join(root,'evaluation-runs/v120-development',label),plan=read(path.join(dir,'plan.json')),metrics=read(path.join(dir,'metrics.json'))
 assert.equal(plan.binarySha256,metrics.binarySha256)
 if(plan.binarySnapshot)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,plan.binarySnapshot))).digest('hex'),plan.binarySha256)
 const groups={},rows=[],latencies={b:[],c:[]},stops={b:{},c:{}}
 for(let slot=0;slot<2;slot++){
  const input=tsv(path.join(dir,slot+'-candidate.input.tsv'))
  const baselineInput=tsv(path.join(dir,slot+'-baseline.input.tsv'))
  const b=tsv(path.join(dir,slot+'-baseline.output.tsv')),c=tsv(path.join(dir,slot+'-candidate.output.tsv'))
  for(const output of [b,c]){
   const summary=output.pop();assert.equal(summary[1],'__batch__');assert.equal(+summary[4],input.length)
   let hash=0xcbf29ce484222325n
   for(const byte of Buffer.from(output.map(r=>r.join('\t')).join('\n')+'\n'))hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n)
   assert.equal(hash.toString(16).padStart(16,'0'),summary[8])
  }
  for(let k=0;k<input.length;k++){
   const i=input[k];assert.equal(b[k][1],i[1]);assert.equal(c[k][1],i[1]);assert.equal(b[k][4],'generic-craft-route-portfolio-v1.1.0');assert.equal(c[k][4],'generic-craft-route-portfolio-v1.2.0')
   const bi=[...baselineInput[k]];bi[3]=i[3];assert.deepEqual(bi,i)
   assert(!oldSeeds.has(+i[56]));if(label.startsWith('confirm-'))assert(!new Set(Array.from({length:8},(_,s)=>(31000000^s)>>>0)).has(+i[56]))
   for(const [arm,out]of [['b',b[k]],['c',c[k]]]){
    assert.equal(out.length,51);assert.equal(out[3],'ok');assert(!['policy-null','illegal-action'].includes(out[16]))
    const times=out[50].split(',').filter(x=>x!=='-'&&x).map(Number);assert.equal(times.length,+out[21]);assert.equal(times.reduce((s,n)=>s+n,0),+out[22]);assert.equal(Math.max(0,...times),+out[23]);latencies[arm].push(...times)
    stops[arm][out[16]]=(stops[arm][out[16]]??0)+1
    if(out[15]==='completed'){assert(+out[26]>=+i[18]);assert(+out[27]>=+i[20])}
   }
   const r={family:family.get(+i[16]),equipment:equipment.get(i[1].match(/equipment:([^@|]+)/)[1]),risk:i[4],world:i[1].match(/world:([^@|]+)/)[1],seed:+i[56],contract:+i[20]>0?'hard-quality':'progress-only',kind:i[8],b:b[k][15]==='completed',c:c[k][15]==='completed',bU:utility(b[k],i),cU:utility(c[k],i),bFull:b[k][15]==='completed'&&+b[k][27]>=+i[5],cFull:c[k][15]==='completed'&&+c[k][27]>=+i[5],bActions:+b[k][17],cActions:+c[k][17],bNs:+b[k][22],cNs:+c[k][22],bStop:b[k][16],cStop:c[k][16]}
   assert(r.family&&r.equipment)
   rows.push(r)
   const cell=[r.family,r.equipment,r.risk,r.world].join('/')
   const keys=['all',r.contract,r.kind,r.contract+'/'+r.risk,r.contract+'/'+r.world,'family/'+r.family,'cell/'+cell]
   if(['E02','E09'].includes(r.equipment)&&r.risk==='balanced'&&r.world==='balanced-iid')keys.push('primary/'+r.contract)
   for(const key of keys)add(groups[key]??=empty(),r)
  }
 }
 assert.equal(rows.length,plan.pairs)
 const latency={}
 for(const [arm,a]of Object.entries(latencies)){a.sort((a,b)=>a-b);latency[arm]={calls:a.length,p50Ms:a[Math.ceil(a.length*.5)-1]/1e6,p95Ms:a[Math.ceil(a.length*.95)-1]/1e6,p99Ms:a[Math.ceil(a.length*.99)-1]/1e6,maxMs:a.at(-1)/1e6}}
 const result={plan,wallMs:metrics.wallMs,latency,stops,groups:Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,finish(g)])),outcomeChanges:rows.filter(r=>r.b!==r.c||r.bU!==r.cU),actionChanges:rows.filter(r=>r.bActions!==r.cActions)}
 results[label]=result
 if(label.includes('confirm-')){
  fs.writeFileSync(path.join(here,label+'-rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n')
  const lines=['# '+label+'：所有 cell','', '同格包含 4 個配對 seeds；b 為 v1.1，c 為 v1.2。這是 bounded 抽樣，不是完整矩陣。','', '| Family / equipment / risk / world | n | c 交貨 (c−b) | 平均 U (c−b) | c 滿品質 (c−b) | c/b 運算 |','| --- | ---: | ---: | ---: | ---: | ---: |']
  for(const [key,g]of Object.entries(result.groups).filter(([k])=>k.startsWith('cell/')).sort(([a],[b])=>a.localeCompare(b)))lines.push('| '+key.slice(5)+' | '+g.n+' | '+g.c+' ('+(g.c-g.b)+') | '+(g.cU/g.n).toFixed(4)+' ('+g.utilityDelta.toFixed(4)+') | '+g.cFull+' ('+(g.cFull-g.bFull)+') | '+g.costRatio.toFixed(3)+' |')
  fs.writeFileSync(path.join(here,label+'-cells.md'),lines.join('\n')+'\n')
 }
 console.log(label,JSON.stringify({all:result.groups.all,primary:Object.fromEntries(Object.entries(result.groups).filter(([k])=>k.startsWith('primary/'))),latency,stops}))
}
fs.writeFileSync(path.join(here,'audit.json'),JSON.stringify(results,null,2)+'\n')
