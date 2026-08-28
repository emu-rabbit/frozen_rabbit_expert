import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {estimateHqChancePercent} from '../../packages/domain/src/hqChance.ts'

const [dir='evaluation-runs/normal-reference/raphael-main-500',report='reports/normal-reference/raphael-main-500.md']=process.argv.slice(2)
const read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'))
const manifest=read('manifest.json'),catalog=read('catalog.json')
const inputs=fs.readFileSync(path.join(dir,'input.tsv'),'utf8').trim().split(/\r?\n/)
const hash=s=>createHash('sha256').update(s).digest('hex')
assert.equal(hash(fs.readFileSync(path.join(dir,'input.tsv'))),manifest.inputSha256)
assert.equal(hash(fs.readFileSync(path.join(dir,'reference.exe'))),manifest.binarySha256)
assert.equal(inputs.length,500)
assert.equal(catalog.families.flatMap(f=>f.recipeIds).length,432)
function utility(state,row){
 if(state.terminal!=='completed')return 0
 const q=state.quality,max=Number(row[5])
 if(q<=0)return 0
 if(row[8]==='hq-chance')return estimateHqChancePercent(q,max)/100
 const n=Number(row[9]);if(n<=1)return Math.min(1,q/max)
 const t=row.slice(10,10+n).map(Number);let j=0
 while(j<n&&q>=t[j])j++
 if(j===n)return 1
 const lower=j===0?0:t[j-1];return (j+(q-lower)/(t[j]-lower))/n
}
const rows=[]
for(let i=0;i<inputs.length;i++){
 const input=inputs[i].split('\t'),p=`case-${String(i).padStart(3,'0')}.json`
 if(!fs.existsSync(path.join(dir,p)))continue
 const result=read(p);assert.equal(result.inputSha256,hash(inputs[i]))
 assert.equal(result.caseId,input[1]);assert.equal(result.reference.caseId,input[1]);assert.equal(result.policies.length,16)
 const family=catalog.families.find(f=>f.representativeRecipeId===Number(input[16]))
 const equipment=catalog.equipment.find(e=>input[1].includes(`equipment:${e.id}@`))
 assert(family&&equipment)
 const r=result.reference,referenceValid=!!r.replay?.legal && r.replay.mismatchSteps.length===0 && r.replay.stepCount===r.actions.length
 const groups={}
 for(const p of result.policies){
  assert.equal(p.risk,'balanced');assert(!['policy-null','illegal-action'].includes(p.stop))
  const key=p.solver.endsWith('v1.1.0')?'baseline':'candidate'
  const g=groups[key]??={n:0,completed:0,full:0,u:0,q:0,actions:0,computeNs:0,randomActions:0}
  g.n++;g.completed+=+(p.local.terminal==='completed');g.full+=+(p.local.terminal==='completed'&&p.local.quality>=Number(input[5]));g.u+=utility(p.local,input)
  g.q+=p.local.progress>=Number(input[18])?p.local.quality:0
  g.actions+=p.actions.length;g.computeNs+=p.computeNs
  g.randomActions+=p.actions.filter(a=>['rapidSynthesis','hastyTouch','daringTouch'].includes(a)).length
 }
 for(const g of Object.values(groups)){assert.equal(g.n,8);g.u/=8;g.q/=8;g.actions/=8;g.randomActions/=8}
 rows.push({index:i,family:family.label,equipment:equipment.label,kind:input[8],max:Number(input[5]),required:Number(input[20]),status:r.status,
  referenceValid,referenceQuality:referenceValid?r.replay.local.quality:null,referenceU:referenceValid?utility(r.replay.local,input):null,
  referenceCompleted:referenceValid?r.replay.local.terminal==='completed':null,referenceActions:r.actions?.length??null,
  referenceMs:r.elapsedMs??null,referenceMismatch:r.replay?.mismatchSteps?.length??null,...groups})
}
const counts={};for(const r of rows)counts[r.status]=(counts[r.status]??0)+1
const out=['# Raphael 無球色參考：500 組','','本表由固定 binary／input 及逐組保存結果生成。Balanced、全通常球；自身每版每格 8 次技能成敗抽樣。不是遊戲成功率，也不是正式採用驗證。',
 '',`已保存 **${rows.length}/500** 組；搜尋狀態 ${JSON.stringify(counts)}。未跑和未完成搜尋不能記成無解。`,
 '',`Source revision：\`${manifest.revision}\`；binary SHA256：\`${manifest.binarySha256}\`。`,
 '', 'U 是 0–1 的無單位品質效用，未成功交付為 0；各品質類型使用自己的單調效用。原始品質點數另列，不能直接跨配方相加解讀。',
 '', '參考 Q 為同技能權限下已找到固定路線的品質；只有 `optimal` 且重播相符才可視為 upstream 的已完成搜尋結果。它不包含隨機技能或球色反應，不是全部因果策略的上限。',
 '', '## 分類摘要（只比較已取得可重播參考的格）','',
 '| 類型 | 格數 | 搜尋完成 | 參考交付格 | 參考平均 U | v1.1 交付／試次 | v1.1 平均 U | 實驗交付／試次 | 實驗平均 U |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for(const kind of ['hard-quality-max','collectability-tiers','hq-chance','continuous-collectability']){
 const rr=rows.filter(r=>r.kind===kind&&r.referenceValid);if(!rr.length)continue
 const sum=f=>rr.reduce((s,r)=>s+f(r),0)
 out.push(`| ${kind} | ${rr.length} | ${sum(r=>+(r.status==='optimal'))} | ${sum(r=>+r.referenceCompleted)} | ${(sum(r=>r.referenceU)/rr.length).toFixed(4)} | ${sum(r=>r.baseline.completed)}/${rr.length*8} | ${(sum(r=>r.baseline.u)/rr.length).toFixed(4)} | ${sum(r=>r.candidate.completed)}/${rr.length*8} | ${(sum(r=>r.candidate.u)/rr.length).toFixed(4)} |`)
}
out.push('','## 家族 × 裝備','','自身 Q 為成功推滿進展時的品質平均，未推滿進展為 0；hard-quality 未達必要品質仍不算交付，請同時看交付及 U。','',
 '| 家族 | 裝備 | 狀態 | 參考 Q／上限 | 重播 | v1.1 交付 | v1.1 Q | v1.1 U | 實驗交付 | 實驗 Q | 實驗 U |','| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |')
for(const r of rows)out.push(`| ${r.family} | ${r.equipment} | ${r.status} | ${r.referenceQuality??'—'}/${r.max} | ${r.referenceValid?'一致':r.referenceMismatch===null?'未有解':'需調查'} | ${r.baseline.completed}/8 | ${r.baseline.q.toFixed(0)} | ${r.baseline.u.toFixed(4)} | ${r.candidate.completed}/8 | ${r.candidate.q.toFixed(0)} | ${r.candidate.u.toFixed(4)} |`)
out.push('','## 裝備索引','')
for(const e of catalog.equipment)out.push(`- ${e.label}：\`${e.id}\``)
out.push('','完整 recipeIds、原始每招資源及兩邊 state 保存在 run 目錄。此 report 為可重建摘要；未完成矩陣不得作全體能力結論。','')
fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,out.join('\n'))
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({counts,rows},null,2)+'\n')
console.log(JSON.stringify({records:rows.length,counts,valid:rows.filter(r=>r.referenceValid).length,report}))
