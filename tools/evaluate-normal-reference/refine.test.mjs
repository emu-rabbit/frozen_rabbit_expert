import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const hash=data=>createHash('sha256').update(data).digest('hex')
test('status validates refinement and resume skips persisted targets',()=>{
 const root=fs.mkdtempSync(path.resolve('.tmp/normal-reference-refine-test-')),source=path.join(root,'source'),out=path.join(root,'out')
 fs.mkdirSync(source);fs.mkdirSync(out)
 const input='protocol\tcase-one',binary=Buffer.from('not executable'),binarySha256=hash(binary),inputSha256=hash(input+'\n')
 fs.writeFileSync(path.join(source,'input.tsv'),input+'\n');fs.writeFileSync(path.join(source,'reference.exe'),binary)
 fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({binarySha256,inputSha256,cases:1,revision:'test'}))
 const original={index:0,inputSha256:hash(input),caseId:'case-one',reference:{caseId:'case-one',status:'interrupted',replay:{legal:true,mismatchSteps:[],local:{quality:10}}}}
 fs.writeFileSync(path.join(source,'case-000.json'),JSON.stringify(original))
 const targets=[{index:0,caseId:'case-one',originalStatus:'interrupted'}]
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({sourceBinarySha256:binarySha256,sourceInputSha256:inputSha256,budgetMs:120000,targets}))
 const next={event:'result',caseId:'case-one',status:'optimal',replay:{legal:true,mismatchSteps:[],local:{quality:20}}}
 const record={index:0,inputSha256:hash(input),caseId:'case-one',sourceBinarySha256:binarySha256,budgetMs:120000,
  original:{status:'interrupted',elapsedMs:null,quality:10,replayable:true},reference:next,
  comparison:{originalReplayable:true,nextReplayable:true,originalQuality:10,nextQuality:20,newlyReplayable:false,qualityDelta:10,improved:true,newlyOptimal:true}}
 const p=path.join(out,'case-000.json');fs.writeFileSync(p,JSON.stringify(record))
 const run=mode=>spawnSync(process.execPath,['tools/evaluate-normal-reference/refine.mjs',mode,source,out,'120000'],{encoding:'utf8',windowsHide:true})
 const initial=fs.readFileSync(p,'utf8'),mtime=fs.statSync(p).mtimeMs
 assert.equal(run('status').status,0);assert.equal(run('resume').status,0)
 assert.equal(fs.readFileSync(p,'utf8'),initial);assert.equal(fs.statSync(p).mtimeMs,mtime)
 fs.appendFileSync(path.join(source,'reference.exe'),'tampered');assert.notEqual(run('status').status,0)
})

test('chained refinement targets only prior nonoptimal cases and compares against prior quality',()=>{
 const root=fs.mkdtempSync(path.resolve('.tmp/normal-reference-refine-chain-test-')),source=path.join(root,'source'),prior=path.join(root,'prior'),out=path.join(root,'out')
 fs.mkdirSync(source);fs.mkdirSync(prior)
 const inputs=['protocol\tcase-one','protocol\tcase-two'],inputText=inputs.join('\n')+'\n'
 const binary=Buffer.from('not executable'),binarySha256=hash(binary),inputSha256=hash(inputText)
 fs.writeFileSync(path.join(source,'input.tsv'),inputText);fs.writeFileSync(path.join(source,'reference.exe'),binary)
 fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({binarySha256,inputSha256,cases:2,revision:'test'}))
 for(let index=0;index<2;index++)fs.writeFileSync(path.join(source,`case-00${index}.json`),JSON.stringify({
  index,inputSha256:hash(inputs[index]),caseId:`case-${index===0?'one':'two'}`,
  reference:{caseId:`case-${index===0?'one':'two'}`,status:'interrupted',replay:{legal:true,mismatchSteps:[],local:{quality:10}}}
 }))
 fs.writeFileSync(path.join(prior,'manifest.json'),JSON.stringify({sourceBinarySha256:binarySha256,sourceInputSha256:inputSha256}))
 const priorReference=(caseId,status,quality)=>({caseId,status,replay:{legal:true,mismatchSteps:[],local:{quality}}})
 fs.writeFileSync(path.join(prior,'case-000.json'),JSON.stringify({index:0,caseId:'case-one',reference:priorReference('case-one','interrupted',20)}))
 fs.writeFileSync(path.join(prior,'case-001.json'),JSON.stringify({index:1,caseId:'case-two',reference:priorReference('case-two','optimal',30)}))
 const priorRelative=path.relative(process.cwd(),prior).replaceAll('\\','/')
 fs.mkdirSync(out);fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({
  sourceBinarySha256:binarySha256,sourceInputSha256:inputSha256,budgetMs:300000,prior:priorRelative,
  targets:[{index:0,caseId:'case-one',originalStatus:'interrupted'}]
 }))
 const next=priorReference('case-one','interrupted',25)
 fs.writeFileSync(path.join(out,'case-000.json'),JSON.stringify({
  index:0,inputSha256:hash(inputs[0]),caseId:'case-one',sourceBinarySha256:binarySha256,budgetMs:300000,
  original:{status:'interrupted',elapsedMs:null,quality:20,replayable:true},reference:next,
  comparison:{originalReplayable:true,nextReplayable:true,originalQuality:20,nextQuality:25,newlyReplayable:false,qualityDelta:5,improved:true,newlyOptimal:false}
 }))
 const run=spawnSync(process.execPath,['tools/evaluate-normal-reference/refine.mjs','status',source,out,'300000',prior],{encoding:'utf8',windowsHide:true})
 assert.equal(run.status,0,run.stderr)
 const status=JSON.parse(run.stdout.trim())
 assert.deepEqual(status,{completedRecords:1,total:1,counts:{interrupted:1},comparisonCounts:{newlyReplayable:0,improved:1,newlyOptimal:0},pending:[]})
})
