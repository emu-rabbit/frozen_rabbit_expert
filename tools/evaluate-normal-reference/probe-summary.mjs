import fs from 'node:fs'
import assert from 'node:assert/strict'

const [inputPath,probePath,referenceDir='evaluation-runs/normal-reference/raphael-main-500']=process.argv.slice(2)
const input=fs.readFileSync(inputPath,'utf8').trim().split(/\r?\n/).map(l=>l.split('\t'))
const probe=fs.readFileSync(probePath,'utf8').trim().split(/\r?\n/).map(l=>l.split('\t'))
assert.equal(input.length,probe.length)
const groups={}
for(let i=0;i<input.length;i++){
 const kind=input[i][8],g=groups[kind]??={cases:0,found:0,probeMicros:0,optimalReference:0,referenceQ:0,probeQ:0,within90:0}
 g.cases++;g.found+=+(probe[i][1]!=='-');g.probeMicros+=Number(probe[i][5])
 const p=`${referenceDir}/case-${String(i).padStart(3,'0')}.json`
 if(!fs.existsSync(p))continue
 const r=JSON.parse(fs.readFileSync(p,'utf8')).reference
 if(r.status!=='optimal'||!r.replay)continue
 assert.equal(r.caseId,input[i][1]);g.optimalReference++
 g.referenceQ+=r.replay.local.quality
 const q=probe[i][1]==='-'?0:Number(probe[i][1]);g.probeQ+=q;g.within90+=+(q>=r.replay.local.quality*.9)
}
console.log(JSON.stringify(groups,null,2))
