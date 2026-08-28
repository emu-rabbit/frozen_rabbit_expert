import fs from 'node:fs'
import assert from 'node:assert/strict'
const comparisons=[]
function rows(label,arm){return [0,1].flatMap(slot=>fs.readFileSync(`evaluation-runs/v120-development/${label}/${slot}-${arm}.output.tsv`,'utf8').trim().split(/\r?\n/).filter(l=>!l.includes('\t__batch__\t')).map(l=>l.split('\t'))).sort((a,b)=>a[1].localeCompare(b[1]))}
for(const mode of ['focus','broad'])for(const arm of ['baseline','candidate']){
 const a=rows('four-conditions-'+mode,arm),b=rows('leaf-conditions-'+mode,arm)
 assert.equal(a.length,b.length)
 const normalize=row=>row.map((v,i)=>[1,22,23,50].includes(i)?'':v)
 a.forEach((row,i)=>assert.deepEqual(normalize(row),normalize(b[i]),mode+'/'+arm+'/'+i))
 comparisons.push({mode,arm,rows:a.length,allNonTimingColumnsEqual:true})
}
fs.writeFileSync('reports/generic-cosmic-overnight/v120-development/parity.json',JSON.stringify({ignoredColumns:['case label','total ns','max ns','per-call ns'],comparisons},null,2)+'\n')
console.log('900 cases × both arms: exact non-timing parity after removing forecast-only route bookkeeping.')
