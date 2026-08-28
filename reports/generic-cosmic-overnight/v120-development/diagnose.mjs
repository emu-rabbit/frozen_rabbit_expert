// Replay four prespecified loss categories, both arms. Never invokes overnight.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
const label=process.argv[2]??'condition-confirm-focus'
const dir='evaluation-runs/v120-development/'+label
const pairs=JSON.parse(fs.readFileSync(dir+'/rows.json'))
const hard=pairs.filter(r=>r.kind==='hard-quality-max'&&r.risk==='balanced'&&r.bCompleted&&!r.cCompleted)
const chosen=[hard[0],hard.find(r=>r.recipe!==hard[0]?.recipe),
 pairs.filter(r=>r.kind==='hq-chance'&&r.risk==='balanced').sort((a,b)=>(a.cU-a.bU)-(b.cU-b.bU))[0],
 pairs.find(r=>r.kind==='continuous-collectability'&&r.risk==='balanced'&&r.bCompleted&&!r.cCompleted)].filter(Boolean)
assert(chosen.length>0&&chosen.length<=4)
const input=new Map(),output=new Map()
for(const slot of [0,1])for(const arm of ['baseline','candidate']){
 for(const line of fs.readFileSync(`${dir}/${slot}-${arm}.input.tsv`,'utf8').trim().split(/\r?\n/)){const row=line.split('\t');input.set(arm+'|'+row[1],row)}
 for(const line of fs.readFileSync(`${dir}/${slot}-${arm}.output.tsv`,'utf8').trim().split(/\r?\n/)){const row=line.split('\t');output.set(arm+'|'+row[1],row)}
}
const cases=[]
for(const [i,pair] of chosen.entries())for(const arm of ['baseline','candidate']){
 const found=[...input.entries()].find(([key,row])=>key.startsWith(arm+'|')&&+row[16]===pair.recipe&&+row[56]===pair.seed&&row[4]===pair.risk&&row[1].includes('equipment:'+pair.equipment+'@'))
 assert(found,'input match')
 const [key,row]=found,copy=[...row];copy[1]='diagnostic-'+i+'-'+arm
 cases.push({id:copy[1],input:copy,expected:output.get(key),pair,arm})
}
fs.writeFileSync(dir+'/diagnostic.input.tsv',cases.map(c=>c.input.join('\t')).join('\n')+'\n')
const run=spawnSync('native/craft-kernel/target/release/examples/route_portfolio_diagnostics.exe',[dir+'/diagnostic.input.tsv'],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024})
assert.equal(run.status,0,run.stderr)
fs.writeFileSync(dir+'/diagnostic.tsv',run.stdout)
const lines=run.stdout.trim().split(/\r?\n/).map(l=>l.split('\t'))
const result=[]
for(const c of cases){
 const recs=lines.filter(l=>l[0]==='recommendation'&&l[1]===c.id)
 assert.deepEqual(recs.map(l=>l[3]),c.expected[18].split(','),c.id+' actions')
 const end=lines.find(l=>l[0]==='outcome'&&l[1]===c.id)
 assert.equal(end[2],c.expected[16]);assert.equal(+end[4],+c.expected[27])
 result.push({id:c.id,pair:c.pair,arm:c.arm,recs:recs.map(r=>({step:+r[2],action:r[3],progress:+r[9],quality:+r[10],cp:+r[11],durability:+r[12],condition:r[15],iq:+r[16]}))})
}
fs.writeFileSync(dir+'/diagnostic.json',JSON.stringify(result,null,2)+'\n')
for(let i=0;i<result.length;i+=2){const b=result[i],c=result[i+1],first=b.recs.findIndex((r,j)=>r.action!==c.recs[j]?.action);console.log(JSON.stringify({case:b.pair,firstDivergence:first,baseline:b.recs.slice(Math.max(0,first-1),first+5),candidate:c.recs.slice(Math.max(0,first-1),first+5),candidateTail:c.recs.slice(-5)},null,2))}
