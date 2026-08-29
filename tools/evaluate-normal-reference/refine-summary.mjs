import fs from 'node:fs'
import path from 'node:path'

const [sourceArg='evaluation-runs/normal-reference/raphael-main-500',refineArg='evaluation-runs/normal-reference/raphael-main-500-refine-120s',report='reports/normal-reference/raphael-main-500-refine-120s.md']=process.argv.slice(2)
const source=path.resolve(sourceArg),refine=path.resolve(refineArg)
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const manifest=read(path.join(refine,'manifest.json'))
const sourceManifest=read(path.join(source,'manifest.json'))
const references=Array.from({length:sourceManifest.cases},(_,index)=>read(path.join(source,`case-${String(index).padStart(3,'0')}.json`)).reference)
function applyRefinement(directory){
 const attemptManifest=read(path.join(directory,'manifest.json'))
 if(attemptManifest.prior)applyRefinement(path.resolve(attemptManifest.prior))
 for(const target of attemptManifest.targets){
  const attemptPath=path.join(directory,`case-${String(target.index).padStart(3,'0')}.json`)
  if(fs.existsSync(attemptPath))references[target.index]=read(attemptPath).reference
 }
}
if(manifest.prior)applyRefinement(path.resolve(manifest.prior))
const replayable=r=>r?.replay?.legal===true&&(r.replay.mismatchSteps?.length??0)===0
const initialOptimal=references.filter(r=>r.status==='optimal').length
const initialReplayable=references.filter(replayable).length
const attemptCounts={},originalCounts={},remaining=[],rows=[]
let newlyReplayable=0,improved=0,newlyOptimal=0,qualityGain=0
for(const target of manifest.targets){
 const original=references[target.index]
 originalCounts[original.status]=(originalCounts[original.status]??0)+1
 const attemptPath=path.join(refine,`case-${String(target.index).padStart(3,'0')}.json`)
 if(!fs.existsSync(attemptPath))continue
 const attempt=read(attemptPath)
 attemptCounts[attempt.reference.status]=(attemptCounts[attempt.reference.status]??0)+1
 newlyReplayable+=+attempt.comparison.newlyReplayable
 improved+=+attempt.comparison.improved
 newlyOptimal+=+attempt.comparison.newlyOptimal
 qualityGain+=Math.max(0,attempt.comparison.qualityDelta??0)
 const row={index:target.index,originalStatus:original.status,attemptStatus:attempt.reference.status,
  originalQuality:attempt.comparison.originalQuality,nextQuality:attempt.comparison.nextQuality,
  qualityDelta:attempt.comparison.qualityDelta,nextReplayable:attempt.comparison.nextReplayable}
 rows.push(row)
 if(attempt.reference.status!=='optimal')remaining.push(row)
}
const completed=rows.length
const seconds=manifest.budgetMs/1000
const targetSource=manifest.prior?'上一輪 refinement':'原始 30 秒 corpus'
const out=[`# Raphael 500 組：${seconds} 秒加時重試`,'',
 `本次只重試${targetSource}中狀態不是 \`optimal\` 的 ${manifest.targets.length} 組；既有 case JSON、raw JSONL 與 frozen binary／input 均未覆寫。加時結果保存在獨立目錄，單格預算 ${manifest.budgetMs.toLocaleString()}ms、2 個單執行緒 worker。`, '',
 `已保存 **${completed}/${manifest.targets.length}** 組重試；重試狀態 ${JSON.stringify(attemptCounts)}。原目標狀態 ${JSON.stringify(originalCounts)}。`, '',
 `- 新取得可重播路線：${newlyReplayable} 組。`,
 `- 品質高於原 incumbent 或原本無路線：${improved} 組；正向 Q 合計 ${qualityGain.toLocaleString()}。`,
 `- 新證明 \`optimal\`：${newlyOptimal} 組；與原始 corpus 合併後共有 ${initialOptimal+newlyOptimal}/500 組完成 upstream 搜尋。`,
 `- 合併後至少有可重播路線：${initialReplayable+newlyReplayable}/500 組。`, '',
 '這裡的 `interrupted`／`hard-timeout` 只表示本次時間預算內未完成搜尋，不是無解。`optimal` 才是 upstream 回報完成搜尋；可重播 incumbent 只能作已找到路線。','',
 `## ${seconds} 秒後仍未完成搜尋`,'',
 '| index | 原狀態 | 重試狀態 | 原 Q | 重試 Q | Q 差 | 重播 |','| ---: | --- | --- | ---: | ---: | ---: | --- |']
for(const row of remaining)out.push(`| ${row.index} | ${row.originalStatus} | ${row.attemptStatus} | ${row.originalQuality??'—'} | ${row.nextQuality??'—'} | ${row.qualityDelta??'—'} | ${row.nextReplayable?'有':'無'} |`)
if(!remaining.length)out.push('| — | — | — | — | — | — | — |')
out.push('','後續再加時必須建立新的 attempt 目錄與預算 manifest；不得把本報告剩餘格改寫成 `no-solution`。','')
fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,out.join('\n'))
console.log(JSON.stringify({completed,total:manifest.targets.length,attemptCounts,newlyReplayable,improved,newlyOptimal,remaining:remaining.length,report}))
