// Bounded integration: one family/risk, 40 candidate episodes per run.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const root='evaluation-runs/v120-development/runner'
const source=root+'/v120-history-source-smoke'
const common=['tools/evaluate-generic-cosmic-overnight/run.mjs','--engine=rust-native','--native-preview',
 '--native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe',
 '--native-baseline-solver=generic-craft-route-portfolio-v1.1.0','--native-candidate-solver=generic-craft-route-portfolio-v1.2.0',
 '--baseline-dir='+source,'--family-limit=1','--risk=stable','--seed-count=1','--base-seed=71000000',
 '--workers=1','--shard-timeout=2m','--retries=0','--output='+root]
const evidence=[]
function invoke(id,budget,status=false,expected=0){
 const run=spawnSync(process.execPath,[...common,'--run-id='+id,'--time-budget='+budget,...(status?['--status-only']:[])],{encoding:'utf8',windowsHide:true,timeout:180000})
 assert.equal(run.status,expected,run.stderr+'\n'+run.stdout)
 evidence.push({id,budget,status,exit:run.status,stdout:run.stdout,stderr:run.stderr})
}
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const attempts=id=>read(root+'/'+id+'/manifest.json').shards.map(s=>s.attempts.length)
const reuse='v120-history-reuse-smoke'
const before=attempts(reuse)
invoke(reuse,'3m');invoke(reuse,'3m',true)
assert.deepEqual(attempts(reuse),before,'resume/status must not execute completed shards')
const cutoff='v120-history-cutoff-smoke'
assert(!fs.existsSync(root+'/'+cutoff),'Use a new run id for a fresh cutoff verification')
invoke(cutoff,'3s',false,75)
const interrupted=read(root+'/'+cutoff+'/manifest.json')
assert.equal(interrupted.summary.completed,0)
invoke(cutoff,'3m');invoke(cutoff,'3m',true)
const shardFile=fs.readdirSync(source+'/shards').find(p=>p.endsWith('.json'))
const saved=read(source+'/shards/'+shardFile).report.rows.filter(r=>r.arm==='candidate')
for(const id of [reuse,cutoff]){
 const shard=read(root+'/'+id+'/shards/'+shardFile), report=shard.report
 assert.equal(report.schemaVersion,'native-generic-cosmic-paired-matrix-v5')
 assert.equal(report.executedEpisodes,40);assert.equal(report.reusedEpisodes,40)
 assert.equal(report.rows.length,80)
 assert.deepEqual(report.rows.filter(r=>r.arm==='baseline'),saved.map(r=>({...r,arm:'baseline'})))
 assert.equal(report.timing.baselineWallClockMs,null)
 const raw=fs.readdirSync(root+'/'+id+'/raw-partials')
 assert(!raw.some(p=>p.endsWith('.baseline.tsv')),'historical mode must never create baseline execution input')
 assert(raw.some(p=>p.endsWith('.candidate.tsv')))
}
fs.writeFileSync('reports/generic-cosmic-overnight/v120-development/history-smoke.json',JSON.stringify({source,checks:['candidate-only','exact-source-rows','resume-skip','status-skip','3s-cutoff','cutoff-resume'],evidence},null,2)+'\n')
console.log('Historical native integration passed: 40 executed + 40 reused, resume/status/cutoff verified.')
