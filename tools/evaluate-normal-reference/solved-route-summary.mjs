import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const [dir='evaluation-runs/normal-reference/raphael-main-500',probePath='.tmp/raphael-reference/probe-final-500.tsv',report='reports/normal-reference/raphael-solved-route-analysis.md']=process.argv.slice(2)
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const catalog=read(path.join(dir,'catalog.json'))
const inputs=fs.readFileSync(path.join(dir,'input.tsv'),'utf8').trim().split(/\r?\n/)
const probe=new Map(fs.readFileSync(probePath,'utf8').trim().split(/\r?\n/).map(line=>{const cells=line.split('\t');return [cells[0],{quality:Number(cells[1]),actions:cells[6].split(',')}] }))
const equipmentFor=caseId=>catalog.equipment.find(e=>caseId.includes(`equipment:${e.id}@`))?.label
const familyFor=row=>catalog.families.find(f=>f.representativeRecipeId===Number(row[16]))?.label
const countActions=routes=>{const out=new Map();for(const route of routes)for(const action of route.actions)out.set(action,(out.get(action)??0)+1);return out}
const quantile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.floor((values.length-1)*p)]
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length
const rows=[]
for(let i=0;i<inputs.length;i++){
 const input=inputs[i].split('\t'),result=read(path.join(dir,`case-${String(i).padStart(3,'0')}.json`)),reference=result.reference
 if(reference.status!=='optimal')continue
 assert(reference.replay?.legal&&reference.replay.mismatchSteps.length===0)
 const p=probe.get(result.caseId);assert(p)
 rows.push({index:i,caseId:result.caseId,family:familyFor(input),equipment:equipmentFor(result.caseId),kind:input[8],max:Number(input[5]),required:Number(input[20]),
  quality:reference.replay.local.quality,actions:reference.actions,probeQuality:p.quality,probeActions:p.actions,
  ratio:reference.replay.local.quality?Math.min(1,p.quality/reference.replay.local.quality):1,
  cp:reference.replay.local.cp,durability:reference.replay.local.durability})
}
assert.equal(rows.length,412)
const actionCounts=countActions(rows),probeActionCounts=countActions(rows.map(r=>({actions:r.probeActions})))
const transitions=new Map()
for(const row of rows)for(let i=1;i<row.actions.length;i++){const key=`${row.actions[i-1]} → ${row.actions[i]}`;transitions.set(key,(transitions.get(key)??0)+1)}
const opener=new Map();for(const row of rows)opener.set(row.actions[0],(opener.get(row.actions[0])??0)+1)
const groups=(key,order)=>order.map(value=>{const subset=rows.filter(r=>r[key]===value),ratios=subset.map(r=>r.ratio);return {value,n:subset.length,
 qRatio:subset.reduce((s,r)=>s+r.probeQuality,0)/subset.reduce((s,r)=>s+r.quality,0),p10:quantile(ratios,.1),median:quantile(ratios,.5),lt80:ratios.filter(v=>v<.8).length,lt90:ratios.filter(v=>v<.9).length}})
const kindOrder=['hard-quality-max','collectability-tiers','hq-chance','continuous-collectability']
const equipmentOrder=catalog.equipment.map(e=>e.label)
const low=rows.filter(r=>r.ratio<.8),high=rows.filter(r=>r.ratio>=.95)
const lowCounts=countActions(low),highCounts=countActions(high)
const perRoute=(counts,action,n)=>(counts.get(action)??0)/n
const gapActions=[...new Set([...actionCounts.keys(),...probeActionCounts.keys()])].map(action=>({action,
 reference:perRoute(actionCounts,action,rows.length),probe:perRoute(probeActionCounts,action,rows.length),
 low:low.length?perRoute(lowCounts,action,low.length):0,high:high.length?perRoute(highCounts,action,high.length):0}))
const out=['# Raphael 已完成路線研究','','本報告只研究 412 組 `optimal` 且本地逐招重播一致的全通常球固定路線。9 組 interrupted incumbent 與 79 組未取得可重播路線不混入主樣本。Raphael 不使用隨機技能或球色反應，因此這是穩定基本功參考，不是有球色世界的策略上限。','',
 '## 可直接判讀的結果','',
 `- 路線長度平均 ${mean(rows.map(r=>r.actions.length)).toFixed(1)} 招，p10／中位／p90 為 ${quantile(rows.map(r=>r.actions.length),.1)}／${quantile(rows.map(r=>r.actions.length),.5)}／${quantile(rows.map(r=>r.actions.length),.9)} 招。`,
 `- 結束時 CP 平均 ${mean(rows.map(r=>r.cp)).toFixed(1)}，耐久中位 ${quantile(rows.map(r=>r.durability),.5)}；這表示好路線不是單純把每項資源耗到零，而是讓剩餘資源無法再換成更高品質。`,
 `- 本地通用完整路線探針相對 Raphael 的加總 Q 為 ${(rows.reduce((s,r)=>s+r.probeQuality,0)/rows.reduce((s,r)=>s+r.quality,0)*100).toFixed(1)}%；逐格中位 ${(quantile(rows.map(r=>r.ratio),.5)*100).toFixed(1)}%，低於 80% 有 ${rows.filter(r=>r.ratio<.8).length} 格、低於 90% 有 ${rows.filter(r=>r.ratio<.9).length} 格。`,
 '', '這個差距可用來找基本功缺口，但不能直接變成 runtime 策略：探針知道整段未來都是通常球，而且一次搜尋完整路線；產品求解器每一步都要接受玩家回報的新球色與實際技能成敗。','',
 '## 目標類型差距','','| 目標 | 格數 | 加總 Q 比 | 逐格 p10 | 逐格中位 | <80% | <90% |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for(const g of groups('kind',kindOrder))out.push(`| ${g.value} | ${g.n} | ${(g.qRatio*100).toFixed(1)}% | ${(g.p10*100).toFixed(1)}% | ${(g.median*100).toFixed(1)}% | ${g.lt80} | ${g.lt90} |`)
out.push('','## 裝備壓力差距','','| 裝備 | 格數 | 加總 Q 比 | 逐格 p10 | 逐格中位 | <80% | <90% |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
for(const g of groups('equipment',equipmentOrder))out.push(`| ${g.value} | ${g.n} | ${(g.qRatio*100).toFixed(1)}% | ${(g.p10*100).toFixed(1)}% | ${(g.median*100).toFixed(1)}% | ${g.lt80} | ${g.lt90} |`)
out.push('','## Raphael 路線結構','','最常見開場：','')
for(const [action,n] of [...opener].sort((a,b)=>b[1]-a[1]).slice(0,8))out.push('- `'+action+'`：'+n+'/'+rows.length)
out.push('','最常見相鄰結構：','')
for(const [pair,n] of [...transitions].sort((a,b)=>b[1]-a[1]).slice(0,15))out.push('- `'+pair+'`：'+n+' 次')
out.push('','## 技能配置差距','','每格平均使用次數；「低比格」是本地探針低於 Raphael 80%，「高比格」是至少 95%。後兩欄只描述 Raphael 的路線，協助辨認真正困難案例依賴什麼。','',
 '| 技能 | Raphael | 本地探針 | 低比格 Raphael | 高比格 Raphael |','| --- | ---: | ---: | ---: | ---: |')
for(const g of gapActions.toSorted((a,b)=>Math.abs(b.reference-b.probe)-Math.abs(a.reference-a.probe)).slice(0,20))out.push('| `'+g.action+'` | '+g.reference.toFixed(2)+' | '+g.probe.toFixed(2)+' | '+g.low.toFixed(2)+' | '+g.high.toFixed(2)+' |')
out.push('','## 可泛化的開發判定','',
 '- 先補「完整通常球路線」的產品級表示：路線需保存剩餘 action queue、每步驗證合法性，遇到球色或技能成敗後可以局部修補或放棄，而不是每步重跑整套 beam。',
 '- 球色決策應比較「利用球色的即時收益」與「破壞既有路線的機會成本」。例如 Pliant 的長期儉約／掌握不是固定優先，而是只有節省的 CP 能在剩餘路線轉成更多品質、且不錯過更高價值窗口時才插入。',
 '- 低尾案例比平均值更重要。下一個候選要在相同 family × equipment × objective 上證明低於 80% 的格數下降，並在有球色 paired seeds 中不輸現有策略；只提高加總 Q 不足以採用。',
 '- 這份分析不支持把 Raphael 路線硬編成配方或裝備 ID 規則。可採用的訊號是剩餘 CP／耐久／進展、buff window、IQ、品質目標與當前球色。','')
fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,out.join('\n'))
console.log(JSON.stringify({optimal:rows.length,low80:low.length,high95:high.length,report}))
