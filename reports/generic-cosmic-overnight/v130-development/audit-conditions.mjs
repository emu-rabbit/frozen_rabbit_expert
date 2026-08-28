// Mechanics-only replay: observed color/action usage, not causal attribution.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
const [label,reportDir]=process.argv.slice(2)
assert(label&&reportDir)
const dir='evaluation-runs/v120-development/'+label
const plan=JSON.parse(fs.readFileSync(dir+'/plan.json'))
const result={plan,meaning:'Observed decisions on each arm own trajectories; not causal color-specific uplift.',arms:{}}
for(const arm of ['baseline','candidate']){
 const groups=[], totals={cases:0,transitions:0,conditions:{}}
 for(let slot=0;slot<2;slot++){
  const run=spawnSync('native/craft-kernel/target/release/examples/condition_action_audit.exe',[`${dir}/${slot}-${arm}.input.tsv`,`${dir}/${slot}-${arm}.output.tsv`],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:32*1024*1024})
  assert.equal(run.status,0,run.stderr)
  const [header,...rows]=run.stdout.trim().split(/\r?\n/).map(s=>s.split('\t'))
  assert.equal(header[0],'verified');totals.cases+=+header[1];totals.transitions+=+header[2]
  for(const r of rows){assert.equal(r[0],'action');const entry={kind:r[1],mask:+r[2],risk:r[3],condition:r[4],action:r[5],alreadyMaximum:r[6]==='true',count:+r[7]};groups.push(entry);totals.conditions[entry.condition]=(totals.conditions[entry.condition]??0)+entry.count}
 }
 assert.equal(totals.cases,plan.pairs)
 assert.equal(Object.values(totals.conditions).reduce((a,b)=>a+b,0),totals.transitions)
 result.arms[arm]={totals,groups}
}
fs.mkdirSync(reportDir,{recursive:true})
fs.writeFileSync(path.join(reportDir,label+'-condition-usage.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({label,...Object.fromEntries(Object.entries(result.arms).map(([k,v])=>[k,v.totals]))}))
