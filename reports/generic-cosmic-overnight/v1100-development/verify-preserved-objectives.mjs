import fs from 'node:fs'
import assert from 'node:assert/strict'
const labels=process.argv.slice(2)
assert(labels.length>0)
const read=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(l=>l.split('\t'))
const result=[]
for(const label of labels){
  const dir='evaluation-runs/v120-development/'+label
  const plan=JSON.parse(fs.readFileSync(dir+'/plan.json','utf8'))
  assert.equal(plan.candidate,'generic-craft-route-portfolio-v1.10.0')
  const counts={}
  for(const slot of [0,1]){
    const input=read(`${dir}/${slot}-candidate.input.tsv`)
    const baseline=read(`${dir}/${slot}-baseline.output.tsv`)
    const candidate=read(`${dir}/${slot}-candidate.output.tsv`)
    assert.equal(baseline.length,input.length+1)
    assert.equal(candidate.length,input.length+1)
    for(let j=0;j<input.length;j++){
      const i=input[j]
      if(+i[20]<=0&&!['hard-quality-max','hq-chance'].includes(i[8]))continue
      assert.equal(baseline[j][1],i[1]);assert.equal(candidate[j][1],i[1])
      const normalize=r=>r.map((v,k)=>[4,22,23,50].includes(k)?'':v)
      assert.deepEqual(normalize(candidate[j]),normalize(baseline[j]),i[1])
      counts[i[8]]=(counts[i[8]]??0)+1
    }
  }
  result.push({plan,counts,exactNonTimingColumns:true,ignoredColumns:['solver identity','total ns','max ns','per-call ns']})
}
fs.writeFileSync('reports/generic-cosmic-overnight/v1100-development/preserved-objective-parity.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result.map(r=>({label:r.plan.label,counts:r.counts,exactNonTimingColumns:true}))))
