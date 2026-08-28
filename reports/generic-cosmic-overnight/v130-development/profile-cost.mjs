// Four bounded episodes; compare policy work on exactly the same live states.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const label = process.argv[2]
assert(label)
const root = 'evaluation-runs/v120-development/' + label
const rows = (slot, arm, kind) => fs.readFileSync(`${root}/${slot}-${arm}.${kind}.tsv`, 'utf8')
  .trim().split(/\r?\n/).map(l => l.split('\t')).filter(r => r[1] !== '__batch__')
const input = new Map([0,1].flatMap(s => rows(s,'candidate','input')).map(r => [r[1],r]))
const baseline = new Map([0,1].flatMap(s => rows(s,'baseline','output')).map(r => [r[1],r]))
const candidates = [0,1].flatMap(s => rows(s,'candidate','output'))
  .sort((a,b) => (+b[22]-+baseline.get(b[1])[22])-(+a[22]-+baseline.get(a[1])[22]))
const recipes = new Set(), chosen=[]
for (const r of candidates) {
  const i = input.get(r[1])
  if (recipes.has(i[16])) continue
  recipes.add(i[16]);chosen.push(i)
  if (chosen.length === 4) break
}
const filename = root + '/cost-profile.input.tsv'
fs.writeFileSync(filename, chosen.map(r => r.join('\t')).join('\n')+'\n')
const binary='native/craft-kernel/target/release/examples/route_portfolio_diagnostics.exe'
const run=spawnSync(binary,[filename,'--compare-cost'],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:32*1024*1024})
assert.equal(run.status,0,run.stderr)
fs.writeFileSync(root+'/cost-profile.tsv',run.stdout)
const groups={}
for(const line of run.stdout.split(/\r?\n/)){
  const r=line.split('\t');if(r[0]!=='cost_probe')continue
  const g=groups[r[3]]??={calls:0,ns:0,proposals:0,continuation_calls:0,projected_transitions:0,endgame_transitions:0,forecast_cache_hits:0}
  g.calls++;g.ns+=+r[4]
  for(const key of Object.keys(g).filter(k=>!['calls','ns'].includes(k))){
    const match=r[5].match(new RegExp(key+': (\\d+)'));assert(match,key);g[key]+=+match[1]
  }
}
const result={label,episodes:chosen.length,selection:'four distinct recipes with largest candidate-baseline native time increase',
  binarySha256:createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),
  caveat:'same-state sequential cost probes on selected slow cases, not outcome or population estimates',groups}
fs.writeFileSync(root+'/cost-profile.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
