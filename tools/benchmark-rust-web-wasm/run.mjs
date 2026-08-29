import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const EXPECTED_PROTOCOL = 'native-generic-episode-batch-v7'
const EXPECTED_ABI = 'rust-web-planner-abi-v1'
const EXPECTED_POLICY = 'generic-craft-route-portfolio-v1.12.0'
const STATE_START = 32
const STATE_LENGTH = 24

function optionValues(name) {
  const prefix = `--${name}=`
  return process.argv.slice(2).filter(argument => argument.startsWith(prefix))
    .map(argument => argument.slice(prefix.length))
}

function requiredOption(name) {
  const values = optionValues(name)
  if (values.length !== 1 || values[0] === '') {
    throw new Error(`expected exactly one --${name}=... option`)
  }
  return values[0]
}

function percentile(sorted, probability) {
  if (sorted.length === 0) return null
  return sorted[Math.max(0, Math.ceil(sorted.length * probability) - 1)]
}

function latencySummary(durations) {
  const sorted = [...durations].sort((left, right) => left - right)
  const total = durations.reduce((sum, value) => sum + value, 0)
  return {
    count: durations.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? null,
    meanMs: durations.length === 0 ? null : total / durations.length,
  }
}

function inputRows(files) {
  return files.flatMap(file => readFileSync(file, 'utf8').split(/\r?\n/u).filter(Boolean))
}

function nativeEpisodes(binary, rows) {
  const traced = rows.map(row => {
    const cells = row.split('\t')
    if (cells[0] !== EXPECTED_PROTOCOL || cells[2] !== 'episode') {
      throw new Error('input contains a non-generic-episode row')
    }
    if (cells[3] !== EXPECTED_POLICY) {
      throw new Error(`input solver must be ${EXPECTED_POLICY}`)
    }
    cells[15] = 'full'
    return cells.join('\t')
  })
  const stdout = execFileSync(binary, [], {
    input: `${traced.join('\n')}\n`,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
  })
  const lines = stdout.trim().split(/\r?\n/u)
  const summary = lines.pop()?.split('\t') ?? []
  if (summary[0] !== EXPECTED_PROTOCOL || summary[1] !== '__batch__'
    || summary[2] !== 'summary' || summary[3] !== 'ok'
    || Number(summary[4]) !== rows.length) {
    throw new Error('native batch summary is missing or inconsistent')
  }
  return lines.map((line, index) => {
    const cells = line.split('\t')
    if (cells.length !== 51 || cells[3] !== 'ok' || cells[4] !== EXPECTED_POLICY) {
      throw new Error(`native row ${index} has invalid shape or identity`)
    }
    const actions = cells[18] === '-' ? [] : cells[18].split(',')
    const trace = cells[49] === '-' ? [] : cells[49].split(';').map((encoded, stepIndex) => {
      const step = encoded.split('|')
      if (step.length !== 8 + STATE_LENGTH || step[0] !== actions[stepIndex]) {
        throw new Error(`native row ${index} trace ${stepIndex} is inconsistent`)
      }
      return { action: step[0], afterState: step.slice(8) }
    })
    if (trace.length !== actions.length) {
      throw new Error(`native row ${index} action/trace lengths differ`)
    }
    return {
      caseId: cells[1],
      actions,
      trace,
      plannerContext: cells[24],
      stopReason: cells[16],
    }
  })
}

function instantiateWasm(file) {
  const bytes = readFileSync(file)
  const compileStarted = performance.now()
  return WebAssembly.compile(bytes).then(module => {
    const compileMs = performance.now() - compileStarted
    const instantiateStarted = performance.now()
    return WebAssembly.instantiate(module, {}).then(instance => ({
      bytes,
      compileMs,
      instantiateMs: performance.now() - instantiateStarted,
      exports: instance.exports,
    }))
  })
}

function assertExports(exports) {
  const names = [
    'memory',
    'frozen_rabbit_web_input_resize',
    'frozen_rabbit_web_input_ptr',
    'frozen_rabbit_web_recommend',
    'frozen_rabbit_web_output_ptr',
    'frozen_rabbit_web_output_len',
    'frozen_rabbit_web_reset_session',
  ]
  for (const name of names) {
    if (!(name in exports)) throw new Error(`WASM export is missing: ${name}`)
  }
}

function recommend(exports, encoder, decoder, request) {
  const bytes = encoder.encode(request)
  if (exports.frozen_rabbit_web_input_resize(bytes.length) !== 0) {
    throw new Error('WASM rejected the bounded input size')
  }
  const inputPointer = exports.frozen_rabbit_web_input_ptr()
  new Uint8Array(exports.memory.buffer, inputPointer, bytes.length).set(bytes)
  const startedAt = performance.now()
  const status = exports.frozen_rabbit_web_recommend()
  const elapsedMs = performance.now() - startedAt
  const outputPointer = exports.frozen_rabbit_web_output_ptr()
  const outputLength = exports.frozen_rabbit_web_output_len()
  const output = decoder.decode(
    new Uint8Array(exports.memory.buffer, outputPointer, outputLength),
  ).trim()
  const cells = output.split('\t')
  if (status !== 0 || cells[0] !== EXPECTED_ABI || cells[1] !== 'ok') {
    throw new Error(`WASM planner failed: ${output}`)
  }
  if (cells[2] !== EXPECTED_POLICY || cells.length !== 7) {
    throw new Error(`WASM planner returned an incompatible identity: ${output}`)
  }
  return {
    action: cells[3],
    context: cells[6],
    elapsedMs,
  }
}

function withState(row, state) {
  const cells = row.split('\t')
  if (cells.length !== 141 || state.length !== STATE_LENGTH) {
    throw new Error('generic episode input/state shape changed')
  }
  cells.splice(STATE_START, STATE_LENGTH, ...state)
  return cells.join('\t')
}

async function main() {
  const wasm = path.resolve(requiredOption('wasm'))
  const native = path.resolve(requiredOption('native'))
  const inputs = optionValues('input').map(file => path.resolve(file))
  if (inputs.length === 0) throw new Error('expected at least one --input=... option')
  const output = optionValues('output')
  if (output.length > 1) throw new Error('expected at most one --output=... option')

  const rows = inputRows(inputs)
  const nativeRows = nativeEpisodes(native, rows)
  const loaded = await instantiateWasm(wasm)
  assertExports(loaded.exports)
  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const durations = []
  const mismatches = []
  const stopReasons = {}

  for (let caseIndex = 0; caseIndex < rows.length; caseIndex += 1) {
    const original = rows[caseIndex]
    const expected = nativeRows[caseIndex]
    loaded.exports.frozen_rabbit_web_reset_session()
    let requestRow = original
    let reply = recommend(loaded.exports, encoder, decoder, `reset\t${requestRow}`)
    durations.push(reply.elapsedMs)
    for (let step = 0; step < expected.actions.length; step += 1) {
      const expectedAction = expected.actions[step]
      if (reply.action !== expectedAction) {
        mismatches.push({ caseId: expected.caseId, step, expected: expectedAction, actual: reply.action })
        break
      }
      requestRow = withState(original, expected.trace[step].afterState)
      reply = recommend(
        loaded.exports,
        encoder,
        decoder,
        `continue:${expectedAction}\t${requestRow}`,
      )
      durations.push(reply.elapsedMs)
    }
    if (reply.action !== '-' || reply.context !== expected.plannerContext) {
      mismatches.push({
        caseId: expected.caseId,
        step: expected.actions.length,
        expected: `terminal/-/${expected.plannerContext}`,
        actual: `${reply.action}/${reply.context}`,
      })
    }
    stopReasons[expected.stopReason] = (stopReasons[expected.stopReason] ?? 0) + 1
  }

  const report = {
    schemaVersion: 'rust-web-wasm-benchmark-v1',
    policyVersion: EXPECTED_POLICY,
    abiVersion: EXPECTED_ABI,
    cases: rows.length,
    recommendations: durations.length,
    actionOrFinalContextMismatches: mismatches.length,
    mismatches: mismatches.slice(0, 20),
    stopReasons,
    wasm: {
      fileBytes: statSync(wasm).size,
      coldCompileMs: loaded.compileMs,
      coldInstantiateMs: loaded.instantiateMs,
      memoryBytesAfterRun: loaded.exports.memory.buffer.byteLength,
    },
    warmRecommendation: latencySummary(durations),
    evidenceBoundary: 'Node WebAssembly development evidence; not target-device browser/mobile evidence',
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (output[0]) writeFileSync(path.resolve(output[0]), serialized, 'utf8')
  process.stdout.write(serialized)
  if (mismatches.length > 0) process.exitCode = 1
}

await main()
