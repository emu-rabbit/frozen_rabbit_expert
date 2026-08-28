import fs from 'node:fs'
import assert from 'node:assert/strict'
const [before, after] = process.argv.slice(2)
assert(before && after)
const root='evaluation-runs/v120-development/'
const read=label=>[0,1].flatMap(slot=>fs.readFileSync(`${root}${label}/${slot}-candidate.output.tsv`,'utf8')
  .trim().split(/\r?\n/).filter(l=>!l.includes('\t__batch__\t')).map(l=>l.split('\t')))
const key=row=>row[1].replace(/\|development:[^|]+/,'')
const previous=new Map(read(before).map(r=>[key(r),r]))
const current=read(after)
const normalize=row=>row.map((v,i)=>[1,4,22,23,50].includes(i)?'':v)
for(const row of current){
  const reference=previous.get(key(row));assert(reference,'exact case identity')
  assert.deepEqual(normalize(row),normalize(reference),key(row))
}
const plan=label=>JSON.parse(fs.readFileSync(root+label+'/plan.json'))
const result={before:plan(before),after:plan(after),cases:current.length,
  allNonTimingOutcomeAndContextColumnsEqual:true,
  ignoredColumns:['case label','solver identity','total ns','max ns','per-call ns']}
fs.writeFileSync(root+after+'/candidate-parity.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({before,after,cases:current.length,exactActionOutcomeContextParity:true}))
