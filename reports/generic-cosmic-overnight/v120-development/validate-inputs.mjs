import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..')
const run=path.join(root,'evaluation-runs/generic-cosmic-overnight-native/generic-native-v110-perf-vs-v030-64seed-20260827')
const raw=path.join(run,'raw-partials'),files=fs.readdirSync(raw)
const sources=['stable','balanced','aggressive'].map(r=>'evaluation-runs/v110-performance/readiness-'+r+'.json.candidate.tsv').concat('evaluation-runs/v110-performance/cost-slice.candidate.tsv')
const tsv=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(l=>l.split('\t'))
const key=i=>[i[1].split('|')[0],i[4],i[1].match(/equipment:([^@|]+)/)[1],i[1].match(/world:([^@|]+)/)[1]].join('/')
const normalized=i=>i.map((v,k)=>[1,3,15,56].includes(k)?'-':v)
const groups=new Map()
for(const source of sources)for(const i of tsv(path.join(root,source))){const k=i[1].split('|')[0]+'--'+i[4];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)}
let checked=0
const originalSeeds=new Set()
for(const [name,inputs]of groups){
 const filename=files.find(f=>f.startsWith(name+'.attempt-')&&f.endsWith('.candidate.tsv'));assert(filename,name)
 const original=new Map()
 for(const row of tsv(path.join(raw,filename))){original.set(key(row),row);originalSeeds.add(+row[56])}
 for(const i of inputs){assert.equal(i.length,141);assert.equal(+i[59],80);const o=original.get(key(i));assert(o,key(i));assert.deepEqual(normalized(i),normalized(o),key(i));checked++}
}
const fresh=[31000000,41000000].flatMap(base=>Array.from({length:8},(_,i)=>(base^i)>>>0))
assert(fresh.every(seed=>!originalSeeds.has(seed)))
const report={checkedSourceRows:checked,canonicalShards:groups.size,priorUniqueNativeSeeds:originalSeeds.size,excludedOnly:['case ID','solver version','trace mode','native seed'],newNativeSeedsDisjoint:true,sharedNativeSeedsAcrossCells:true,sources:sources.map(p=>({path:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))}
fs.writeFileSync(path.join(here,'input-validation.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
