import fs from 'node:fs'
import assert from 'node:assert/strict'
import {estimateHqChancePercent} from '../../packages/domain/src/hqChance.ts'

const [inputPath,fixedPath,adaptivePath,existingPath]=process.argv.slice(2)
const input=fs.readFileSync(inputPath,'utf8').trim().split(/\r?\n/).map(l=>l.split('\t'))
const read=p=>fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(l=>l.split('\t'))
const fixed=read(fixedPath),adaptive=read(adaptivePath)
const existing=existingPath?fs.readFileSync(existingPath,'utf8').trim().split(/\r?\n/).map(JSON.parse):null
assert.equal(input.length,fixed.length);assert.equal(input.length,adaptive.length);if(existing)assert.equal(input.length,existing.length)
function utility(terminal,q,row){
 if(terminal!=='completed'||q<=0)return 0
 const max=Number(row[5]);if(row[8]==='hq-chance')return estimateHqChancePercent(q,max)/100
 const n=Number(row[9]);if(n===1)return Math.min(1,q/max)
 const t=row.slice(10,10+n).map(Number);let j=0;while(j<n&&q>=t[j])j++
 if(j===n)return 1;const lo=j===0?0:t[j-1];return (j+(q-lo)/(t[j]-lo))/n
}
function totals(source,format){
 const out={n:source.length,completed:0,hardQuality:0,fullQuality:0,utility:0,actions:0,micros:0,randomActions:0}
 source.forEach((r,i)=>{
  const x=format(r);out.completed+=+(x.terminal==='completed');out.hardQuality+=+(x.terminal==='completed'&&x.quality>=Number(input[i][20]))
  out.fullQuality+=+(x.terminal==='completed'&&x.quality>=Number(input[i][5]));out.utility+=utility(x.terminal,x.quality,input[i]);out.actions+=x.actions
  out.micros+=x.micros;out.randomActions+=x.randomActions
 });out.meanUtility=out.utility/out.n;out.meanActions=out.actions/out.n;out.meanMs=out.micros/out.n/1000;return out
}
const routeFormat=r=>({terminal:r[1],quality:Number(r[2]),micros:Number(r[4]),randomActions:Number(r[7]),actions:r[10]?r[10].split(',').length:0})
const existingFormat=r=>({terminal:r.local.terminal,quality:r.local.quality,micros:r.computeNs/1000,
 randomActions:r.actions.filter(a=>['rapidSynthesis','hastyTouch','daringTouch'].includes(a)).length,actions:r.actions.length})
console.log(JSON.stringify({fixed:totals(fixed,routeFormat),adaptive:totals(adaptive,routeFormat),
 ...(existing?{existing:totals(existing,existingFormat)}:{})},null,2))
