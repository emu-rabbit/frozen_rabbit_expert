import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const hash=s=>createHash('sha256').update(s).digest('hex')
test('status validates frozen inputs/binary and resume does not rerun persisted cases',()=>{
 const dir=fs.mkdtempSync(path.resolve('.tmp/normal-reference-test-'))
 const input='protocol\tcase-one',binary=Buffer.from('not an executable; must not be launched')
 fs.writeFileSync(path.join(dir,'input.tsv'),input+'\n')
 fs.writeFileSync(path.join(dir,'reference.exe'),binary)
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({binarySha256:hash(binary),inputSha256:hash(input+'\n')}))
 const result={inputSha256:hash(input),caseId:'case-one',reference:{caseId:'case-one',status:'interrupted'},policies:Array(16).fill({})}
 const p=path.join(dir,'case-000.json');fs.writeFileSync(p,JSON.stringify(result))
 const run=mode=>spawnSync(process.execPath,['tools/evaluate-normal-reference/run.mjs',mode,dir,'missing-live-input','1','1'],{encoding:'utf8',windowsHide:true})
 const initial=fs.readFileSync(p,'utf8'),mtime=fs.statSync(p).mtimeMs
 assert.equal(run('status').status,0)
 assert.equal(run('resume').status,0)
 assert.equal(fs.readFileSync(p,'utf8'),initial);assert.equal(fs.statSync(p).mtimeMs,mtime)
 result.reference.caseId='wrong-case';fs.writeFileSync(p,JSON.stringify(result));assert.notEqual(run('status').status,0)
 fs.writeFileSync(p,initial);fs.appendFileSync(path.join(dir,'reference.exe'),'tampered');assert.notEqual(run('status').status,0)
 fs.writeFileSync(path.join(dir,'reference.exe'),binary);fs.appendFileSync(path.join(dir,'input.tsv'),'tampered');assert.notEqual(run('resume').status,0)
 // Leave the tiny diagnostic fixture under ignored .tmp for inspection.
})
