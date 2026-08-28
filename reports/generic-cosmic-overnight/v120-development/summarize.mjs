// Paired descriptive tables and family/seed block bootstrap; never runs solvers.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const label=process.argv[2]
assert(label&&/^[a-z0-9-]+$/.test(label))
const dir='evaluation-runs/v120-development/'+label
const plan=JSON.parse(fs.readFileSync(dir+'/plan.json'))
const metrics=JSON.parse(fs.readFileSync(dir+'/metrics.json'))
const rows=JSON.parse(fs.readFileSync(dir+'/rows.json'))
const axes=JSON.parse(fs.readFileSync('evaluation-runs/generic-cosmic-overnight-native/generic-native-v110-perf-vs-v030-64seed-20260827/config.json')).payload.axes
const families=new Map(axes.families.map((f,i)=>[f.representativeRecipeId,'F'+String(i+1).padStart(2,'0')]))
const maskByRecipe=new Map(fs.readFileSync('evaluation-runs/v110-performance/readiness-balanced.json.candidate.tsv','utf8').trim().split(/\r?\n/).map(l=>{const r=l.split('\t');return [+r[16],+r[14]]}))
for(const r of rows){r.family=families.get(r.recipe);r.equipmentCode='E'+String(axes.equipmentIds.indexOf(r.equipment)+1).padStart(2,'0');r.mask=maskByRecipe.get(r.recipe);r.sample=(r.seed^plan.seedBase)&511;assert(r.sample<plan.seedCount)}
const primary=r=>r.risk==='balanced'&&r.world==='balanced-iid'&&['E02','E09'].includes(r.equipmentCode)
function summarize(rs){const s={n:rs.length,bCompleted:0,cCompleted:0,wins:0,losses:0,bU:0,cU:0,bFull:0,cFull:0,bNs:0,cNs:0};for(const r of rs){s.bCompleted+=+r.bCompleted;s.cCompleted+=+r.cCompleted;s.wins+=+(!r.bCompleted&&r.cCompleted);s.losses+=+(r.bCompleted&&!r.cCompleted);for(const k of ['bU','cU','bFull','cFull','bNs','cNs'])s[k]+=+r[k]}return {...s,completionDeltaPp:100*(s.cCompleted-s.bCompleted)/s.n,utilityDelta:(s.cU-s.bU)/s.n,fullDeltaPp:100*(s.cFull-s.bFull)/s.n,costRatio:s.cNs/s.bNs}}
function interval(rs){
 if(plan.seedMethod!=='canonical'||plan.seedCount<2)return null
 const map=new Map();for(const r of rs){const f=map.get(r.family)??new Map();const b=f.get(r.sample)??[];b.push(r);f.set(r.sample,b);map.set(r.family,f)}
 const blocks=[...map.values()].map(f=>[...f.values()]);let state=1202
 const random=()=>{let t=state+=0x6d2b79f5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}
 const draws={completionDeltaPp:[],utilityDelta:[],fullDeltaPp:[]}
 for(let b=0;b<2000;b++){const sample=[];for(let f=0;f<blocks.length;f++){const chosen=blocks[Math.floor(random()*blocks.length)];for(let s=0;s<chosen.length;s++)sample.push(...chosen[Math.floor(random()*chosen.length)])}const g=summarize(sample);for(const k of Object.keys(draws))draws[k].push(g[k])}
 return Object.fromEntries(Object.entries(draws).map(([k,a])=>{a.sort((x,y)=>x-y);return [k,[a[49],a[1949]]]}))
}
const groups={}
function group(key,rs,ci=false){if(rs.length)groups[key]={...summarize(rs),...(ci?{interval95:interval(rs)}:{})}}
group('all',rows)
for(const kind of ['hard-quality-max','collectability-tiers','hq-chance','continuous-collectability']){group(kind,rows.filter(r=>r.kind===kind));group('primary/'+kind,rows.filter(r=>primary(r)&&r.kind===kind),true)}
group('primary/progress-only',rows.filter(r=>primary(r)&&r.kind!=='hard-quality-max'),true)
for(const mask of new Set(rows.map(r=>r.mask)))group('mask/'+mask,rows.filter(r=>r.mask===mask))
for(const family of new Set(rows.map(r=>r.family)))group('family/'+family,rows.filter(r=>r.family===family))
const output={plan,latency:metrics.latency,groups,changed:rows.filter(r=>r.bCompleted!==r.cCompleted||r.bU!==r.cU)}
fs.writeFileSync(dir+'/summary.json',JSON.stringify(output,null,2)+'\n')
const lines=['# '+label,'','同格 v1.1／v1.2 配對。完成定義按品質類型分開；U 含失敗零分。成本為同批 native 推薦耗時比。','', '| 切片 | n | Candidate 完成 (差) | 平均 U (差) | 滿品質 (差) | 勝／負 | 運算比 |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for(const [key,g]of Object.entries(groups))lines.push(`| ${key} | ${g.n} | ${g.cCompleted} (${g.cCompleted-g.bCompleted}) | ${(g.cU/g.n).toFixed(4)} (${g.utilityDelta.toFixed(4)}) | ${g.cFull} (${g.cFull-g.bFull}) | ${g.wins}/${g.losses} | ${g.costRatio.toFixed(3)} |`)
lines.push('','## 主要切片的不確定性','','family 外層、sample index 內層配對 bootstrap；2,000 次、固定 seed 1202。保留同一 sample 的裝備／risk／world 區塊。開發反覆檢視與多重切片不能解讀成正式採用顯著性。','')
for(const [key,g]of Object.entries(groups))if(g.interval95)lines.push(`- ${key}：${JSON.stringify(g.interval95)}`)
fs.writeFileSync('reports/generic-cosmic-overnight/v120-development/'+label+'-summary.md',lines.join('\n').trimEnd()+'\n')
console.log(JSON.stringify({label,latency:metrics.latency,primary:Object.fromEntries(Object.entries(groups).filter(([key])=>key.startsWith('primary/')))},null,2))
