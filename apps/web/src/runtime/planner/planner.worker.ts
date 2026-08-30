/// <reference lib="webworker" />

import { parsePlannerReply, serializePlannerRequest } from './protocol'
import type { PlannerWorkerRequest, PlannerWorkerResponse } from './workerContract'

interface PlannerWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  frozen_rabbit_web_input_resize(length: number): number
  frozen_rabbit_web_input_ptr(): number
  frozen_rabbit_web_recommend(): number
  frozen_rabbit_web_output_ptr(): number
  frozen_rabbit_web_output_len(): number
  frozen_rabbit_web_reset_session(): void
}

const wasmUrl = new URL('../wasm/frozen_rabbit_craft_kernel_web.wasm', import.meta.url)
const encoder = new TextEncoder()
const decoder = new TextDecoder()
let wasm: PlannerWasmExports | null = null

const requireExport = (exports: WebAssembly.Exports, name: keyof PlannerWasmExports) => {
  if (!(name in exports)) throw new Error(`WASM export is missing: ${name}`)
}

async function initialize(): Promise<PlannerWasmExports> {
  if (wasm) return wasm
  const response = await fetch(wasmUrl)
  if (!response.ok) throw new Error(`Unable to load Rust planner WASM (${response.status})`)
  const bytes = await response.arrayBuffer()
  const { instance } = await WebAssembly.instantiate(bytes, {})
  const exports = instance.exports
  const required = [
    'memory',
    'frozen_rabbit_web_input_resize',
    'frozen_rabbit_web_input_ptr',
    'frozen_rabbit_web_recommend',
    'frozen_rabbit_web_output_ptr',
    'frozen_rabbit_web_output_len',
    'frozen_rabbit_web_reset_session',
  ] as const
  required.forEach((name) => requireExport(exports, name))
  wasm = exports as PlannerWasmExports
  return wasm
}

function recommend(exports: PlannerWasmExports, request: string) {
  const bytes = encoder.encode(request)
  if (exports.frozen_rabbit_web_input_resize(bytes.byteLength) !== 0) {
    throw new Error('Rust planner rejected the bounded input size')
  }
  const inputPointer = exports.frozen_rabbit_web_input_ptr()
  new Uint8Array(exports.memory.buffer, inputPointer, bytes.byteLength).set(bytes)
  const startedAt = performance.now()
  exports.frozen_rabbit_web_recommend()
  const elapsedMs = performance.now() - startedAt
  const outputPointer = exports.frozen_rabbit_web_output_ptr()
  const outputLength = exports.frozen_rabbit_web_output_len()
  const output = decoder.decode(
    new Uint8Array(exports.memory.buffer, outputPointer, outputLength).slice(),
  )
  return { reply: parsePlannerReply(output), elapsedMs }
}

self.onmessage = async (event: MessageEvent<PlannerWorkerRequest>) => {
  const request = event.data
  try {
    const exports = await initialize()
    let response: PlannerWorkerResponse
    if (request.type === 'initialize') {
      response = { id: request.id, ok: true, type: 'initialized' }
    } else if (request.type === 'reset-session') {
      exports.frozen_rabbit_web_reset_session()
      response = { id: request.id, ok: true, type: 'reset' }
    } else {
      const result = recommend(exports, serializePlannerRequest(request.advance, request.episode))
      response = { id: request.id, ok: true, type: 'recommendation', ...result }
    }
    self.postMessage(response)
  } catch (error) {
    const response: PlannerWorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
