import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsePlannerReply,
  serializePlannerRequest,
  WEB_PLANNER_ABI,
  WEB_PLANNER_POLICY,
} from '../apps/web/src/runtime/planner/protocol'

interface PlannerWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  frozen_rabbit_web_input_resize(length: number): number
  frozen_rabbit_web_input_ptr(): number
  frozen_rabbit_web_recommend(): number
  frozen_rabbit_web_output_ptr(): number
  frozen_rabbit_web_output_len(): number
  frozen_rabbit_web_reset_session(): void
}

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const wasmPath = path.join(
  repositoryRoot,
  'apps', 'web', 'src', 'runtime', 'wasm', 'frozen_rabbit_craft_kernel_web.wasm',
)
const fixturePath = path.join(
  repositoryRoot,
  'native', 'craft-kernel', 'tests', 'fixtures', 'web-bridge-f36-prefix.tsv',
)

async function loadWasm(): Promise<PlannerWasmExports> {
  const bytes = readFileSync(wasmPath)
  const { instance } = await WebAssembly.instantiate(bytes, {})
  return instance.exports as PlannerWasmExports
}

function recommend(exports: PlannerWasmExports, request: string) {
  const encoded = new TextEncoder().encode(request)
  expect(exports.frozen_rabbit_web_input_resize(encoded.byteLength)).toBe(0)
  const pointer = exports.frozen_rabbit_web_input_ptr()
  new Uint8Array(exports.memory.buffer, pointer, encoded.byteLength).set(encoded)
  exports.frozen_rabbit_web_recommend()
  const outputPointer = exports.frozen_rabbit_web_output_ptr()
  const outputLength = exports.frozen_rabbit_web_output_len()
  return new TextDecoder().decode(
    new Uint8Array(exports.memory.buffer, outputPointer, outputLength).slice(),
  )
}

describe('v1.12 Web planner boundary', () => {
  it('loads the production WASM and returns a version-checked recommendation', async () => {
    const exports = await loadWasm()
    const fixturePrefix = readFileSync(fixturePath, 'utf8').trim()
    const episode = `${fixturePrefix}\t1\t1\t1\t1\t1\t1\t1\t1\t0`
    const row = recommend(exports, serializePlannerRequest({ mode: 'reset' }, episode))
    const reply = parsePlannerReply(row)

    expect(row.startsWith(`${WEB_PLANNER_ABI}\tok\t${WEB_PLANNER_POLICY}\t`)).toBe(true)
    expect(reply.policyVersion).toBe(WEB_PLANNER_POLICY)
    expect(reply.action).not.toBeNull()
    expect(reply.contextFingerprint).not.toBe('')
  })

  it('fails closed when a non-v1.12 episode is sent', () => {
    expect(() => serializePlannerRequest(
      { mode: 'reset' },
      'native-generic-episode-batch-v7\tcase\tepisode\tgeneric-craft-route-portfolio-v1.1.0',
    )).toThrow(`must use ${WEB_PLANNER_POLICY}`)
  })
})
