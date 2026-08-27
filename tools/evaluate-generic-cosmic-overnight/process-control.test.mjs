import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { evaluatorDetached, terminateEvaluatorTree } from './process-control.mjs'

test('termination stops the evaluator and its native-like grandchild', { timeout: 15_000 }, async () => {
  const source = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { windowsHide: true });
    console.log(child.pid);
    setTimeout(() => {}, 10000);
  `
  const child = spawn(process.execPath, ['-e', source], {
    detached: evaluatorDetached, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    const [data] = await once(child.stdout, 'data')
    const grandchildPid = Number(data.toString().trim())
    assert.ok(Number.isSafeInteger(grandchildPid) && grandchildPid > 0)
    const closed = once(child, 'close')
    await terminateEvaluatorTree(child)
    await closed
    let alive = true
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { process.kill(grandchildPid, 0) } catch (error) {
        if (error.code !== 'ESRCH') throw error
        alive = false
        break
      }
      await delay(20)
    }
    assert.equal(alive, false, 'grandchild must stop with the evaluator')
  } finally {
    if (child.exitCode === null && child.signalCode === null) await terminateEvaluatorTree(child, 'SIGKILL')
  }
})

test('termination rejects an unowned or missing PID', async () => {
  await assert.rejects(terminateEvaluatorTree({ pid: 0 }), /positive spawned PID/)
})
