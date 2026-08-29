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
