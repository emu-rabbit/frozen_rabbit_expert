// Render readable slices from the validated analysis; never runs a solver.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const out=path.dirname(fileURLToPath(import.meta.url))
const m=JSON.parse(fs.readFileSync(path.join(out,'metrics.json'),'utf8'))
const cells=fs.readFileSync(path.join(out,'cells.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
const map=new Map(cells.map(c=>[c.key,c]))
const sign=n=>(n>0?'+':'')+n.toFixed(2)
const completion=g=>(100*g.candidate.completed/g.n).toFixed(2)+'% ('+sign(100*(g.candidate.completed-g.baseline.completed)/g.n)+' pp)'
const utility=g=>g.candidate.utilityMean.toFixed(4)+' ('+sign(100*(g.candidate.utilityMean-g.baseline.utilityMean))+' pp)'
const full=g=>(100*g.candidate.full/g.n).toFixed(2)+'% ('+sign(100*(g.candidate.full-g.baseline.full)/g.n)+' pp)'
const risks=['stable','balanced','aggressive'],worlds=['balanced-iid','normal-heavy-iid','opportunity-scarce-iid','all-normal']
const names=new Map(fs.readFileSync(path.join(out,'../'+m.runId+'.md'),'utf8').split('\n').filter(x=>/^\| F\d\d \|/.test(x)).map(x=>{const a=x.split('|').map(x=>x.trim());return [a[1],a[2]]}))
const lines=['# v1.1 各家族主要裝備完整切片','','由 analyze.mjs 的 validated cells 重排。每格 64 pairs，Candidate 後附 Candidate−Baseline。U 是交付品質效用，未交貨為零；pp 是百分點。不同 world 不互相平均。固定四表仍是第一閱讀入口。','']
for(const f of m.families){
 lines.push('## '+f.code+' '+names.get(f.code),'',f.kind+'；代表配方 '+f.representativeRecipeId+'。','',
 '| Risk | World | E02 完成 | E02 U | E02 滿品質 | E09 完成 | E09 U | E09 滿品質 |',
 '| --- | --- | --- | --- | --- | --- | --- | --- |')
 for(const r of risks)for(const w of worlds){const a=map.get([f.code,'E02',r,w].join('/')),b=map.get([f.code,'E09',r,w].join('/'));lines.push('| '+[r,w,completion(a),utility(a),full(a),completion(b),utility(b),full(b)].join(' | ')+' |')}
 lines.push('')
}
fs.writeFileSync(path.join(out,'family-details.md'),lines.join('\n'))
const cross=['# v1.1 跨風險、裝備與球色切片','','Candidate 後附 Candidate−Baseline；pp 是百分點，U 是交付品質效用。以下為等權 benchmark 分組索引，個別家族以 family-details.md 與 cells.jsonl 為準。','','## 全裝備的 risk × world','','| Risk | World | 必要品質完成 | 一般交貨 | 一般 U |','| --- | --- | --- | --- | --- |']
for(const r of risks)for(const w of worlds){const h=m.groups['contract-risk-world/hard-quality/'+r+'/'+w],p=m.groups['contract-risk-world/progress-only/'+r+'/'+w];cross.push('| '+[r,w,completion(h),completion(p),utility(p)].join(' | ')+' |')}
cross.push('','## 三種 risk 等權的 equipment × world','','| Equipment | World | 必要品質完成 | 一般交貨 | 一般 U |','| --- | --- | --- | --- | --- |')
for(const [id,e]of m.equipment)for(const w of worlds){const h=m.groups['contract-equipment-world/hard-quality/'+e+'/'+w],p=m.groups['contract-equipment-world/progress-only/'+e+'/'+w];cross.push('| '+[e,w,completion(h),completion(p),utility(p)].join(' | ')+' |')}
cross.push('','## 裝備映射','','| Code | Equipment ID |','| --- | --- |',...m.equipment.map(([id,e])=>'| '+e+' | '+id+' |'),'')
fs.writeFileSync(path.join(out,'slices.md'),cross.join('\n'))
console.log('Rendered 50 family sections / 600 rows and 52 cross-axis slices')
