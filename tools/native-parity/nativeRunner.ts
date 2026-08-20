import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import {
  executePreparedNativeTransitionCase,
  nativeTransitionComparableResult,
  nativeTransitionOracleHash,
  type NativeTransitionComparableResult,
  type PreparedNativeTransitionCase,
} from './transitionBatch'
import {
  encodeNativeCoreBenchmarkInput,
  encodeNativeTransitionBatch,
  parseNativeCoreBenchmarkOutput,
  parseNativeTransitionBatchOutput,
} from './transitionBatchProtocol'

export interface TypeScriptTransitionBatchBenchmark {
  operations: number
  wallTimeMs: number
  operationsPerSecond: number
  fnv1a32Hex: string
  correctnessSha256: string
  timingScope: string
}

export interface NativeTransitionBatchBenchmark {
  available: true
  binary: string
  operations: number
  processElapsedMs: number
  rustKernelMs: number
  processBoundaryMs: number
  processBoundaryShare: number
  operationsPerSecond: number
  fnv1a64Hex: string
  correctnessSha256: string
  parityColumns: readonly string[]
  timingScope: string
}

export interface NativeTransitionBatchUnavailable {
  available: false
  reason: string
  checkedCandidates: readonly string[]
}

export interface NativeCoreTransitionBenchmark {
  available: true
  binary: string
  repetitions: number
  cases: number
  operations: number
  processElapsedMs: number
  rustKernelMs: number
  processBoundaryMs: number
  processBoundaryShare: number
  operationsPerSecond: number
  fnv1a32Hex: string
  timingScope: string
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

class Fnv1a32Writer {
  private hash = 0x811c_9dc5
  private readonly buffer = new ArrayBuffer(8)
  private readonly view = new DataView(this.buffer)
  private readonly encoder = new TextEncoder()

  byte(value: number): void {
    this.hash = Math.imul((this.hash ^ (value & 0xff)) >>> 0, 0x0100_0193) >>> 0
  }

  boolean(value: boolean): void {
    this.byte(value ? 1 : 0)
  }

  u32(value: number): void {
    this.view.setUint32(0, value >>> 0, true)
    for (let index = 0; index < 4; index += 1) this.byte(this.view.getUint8(index))
  }

  i32(value: number): void {
    this.view.setInt32(0, value, true)
    for (let index = 0; index < 4; index += 1) this.byte(this.view.getUint8(index))
  }

  u64(value: number): void {
    this.view.setBigUint64(0, BigInt(value), true)
    for (let index = 0; index < 8; index += 1) this.byte(this.view.getUint8(index))
  }

  f64(value: number): void {
    this.view.setFloat64(0, value, true)
    for (let index = 0; index < 8; index += 1) this.byte(this.view.getUint8(index))
  }

  text(value: string): void {
    const bytes = this.encoder.encode(value)
    this.u32(bytes.length)
    for (const byte of bytes) this.byte(byte)
  }

  optionalText(value: string | null): void {
    this.boolean(value !== null)
    if (value !== null) this.text(value)
  }

  hex(): string {
    return this.hash.toString(16).padStart(8, '0')
  }
}

function hashComparableResult(
  writer: Fnv1a32Writer,
  caseIndex: number,
  result: Readonly<NativeTransitionComparableResult>,
): void {
  writer.u32(caseIndex)
  writer.byte(result.command === 'preview' ? 1 : result.command === 'apply' ? 2 : 3)
  writer.boolean(result.preview.legal)
  writer.optionalText(result.preview.reason)
  writer.i32(result.preview.cpCost)
  writer.i32(result.preview.durabilityCost)
  writer.f64(result.preview.successRate)
  writer.i32(result.preview.progressGain)
  writer.i32(result.preview.qualityGain)
  if (result.command === 'preview') return
  if (result.observed === null || result.nextState === null) {
    throw new Error(`${result.caseId} transition result is missing observed/state fields`)
  }
  writer.boolean(result.observed.success)
  writer.text(result.observed.nextCondition)
  const state = result.nextState
  writer.u32(state.step)
  writer.i32(state.progress)
  writer.i32(state.quality)
  writer.i32(state.durability)
  writer.i32(state.cp)
  writer.text(state.condition)
  writer.i32(state.innerQuiet)
  writer.i32(state.buffs.wasteNot)
  writer.i32(state.buffs.veneration)
  writer.i32(state.buffs.greatStrides)
  writer.i32(state.buffs.innovation)
  writer.i32(state.buffs.finalAppraisal)
  writer.i32(state.buffs.manipulation)
  writer.i32(state.buffs.muscleMemory)
  writer.i32(state.buffs.expedience)
  writer.optionalText(state.comboFrom)
  writer.boolean(state.trainedPerfectionAvailable)
  writer.boolean(state.trainedPerfectionActive)
  writer.i32(state.carefulObservationUsesLeft)
  writer.boolean(state.heartAndSoulAvailable)
  writer.boolean(state.heartAndSoulActive)
  writer.boolean(state.quickInnovationAvailable)
  writer.text(state.terminal)
  writer.optionalText(state.failureReason)
  writer.u32(result.explanationCodes.length)
  for (const code of result.explanationCodes) writer.text(code)
  if (result.command === 'simulate') {
    writer.u64(result.cursorBefore.condition)
    writer.u64(result.cursorBefore.success)
    writer.u64(result.cursorAfter.condition)
    writer.u64(result.cursorAfter.success)
  }
}

export function benchmarkTypeScriptTransitionBatch(
  prepared: readonly PreparedNativeTransitionCase[],
  repetitions: number,
  warmupRepetitions = 1,
): TypeScriptTransitionBatchBenchmark {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  if (!Number.isSafeInteger(warmupRepetitions) || warmupRepetitions < 0) {
    throw new RangeError('warmupRepetitions must be a non-negative safe integer')
  }
  for (let repetition = 0; repetition < warmupRepetitions; repetition += 1) {
    for (const entry of prepared) executePreparedNativeTransitionCase(entry)
  }
  const writer = new Fnv1a32Writer()
  const startedAt = performance.now()
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const [caseIndex, entry] of prepared.entries()) {
      hashComparableResult(
        writer,
        caseIndex,
        nativeTransitionComparableResult(executePreparedNativeTransitionCase(entry)),
      )
    }
  }
  const wallTimeMs = performance.now() - startedAt
  const operations = repetitions * prepared.length
  return {
    operations,
    wallTimeMs,
    operationsPerSecond: wallTimeMs === 0 ? 0 : operations * 1_000 / wallTimeMs,
    fnv1a32Hex: writer.hex(),
    correctnessSha256: nativeTransitionOracleHash(prepared),
    timingScope: [
      'one operation is preview plus optional RNG draw and transition',
      'excludes process startup, TSV parse/format, and stdout',
      'includes conversion to the shared comparable result and the same exposed-field FNV-1a32 hash as Rust',
    ].join('; '),
  }
}

function binaryCandidates(root: string): string[] {
  const executable = process.platform === 'win32' ? 'craft-kernel-batch.exe' : 'craft-kernel-batch'
  return [
    process.env.FROZEN_RABBIT_CRAFT_KERNEL_BATCH_BIN,
    path.join(root, '.tmp', 'cargo-target', 'release', executable),
    path.join(root, 'native', 'craft-kernel', 'target', 'release', executable),
    path.join(root, 'native', 'craft-kernel', 'target', 'debug', executable),
  ].filter((value): value is string => value !== undefined && value.length > 0)
}

function mismatchPaths(expected: unknown, actual: unknown, prefix = '$'): string[] {
  if (Object.is(expected, actual)) return []
  if (
    expected === null
    || actual === null
    || typeof expected !== 'object'
    || typeof actual !== 'object'
  ) return [`${prefix}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`]
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return [`${prefix}: expected/actual container kind differs`]
    }
    const differences: string[] = []
    const length = Math.max(expected.length, actual.length)
    for (let index = 0; index < length; index += 1) {
      differences.push(...mismatchPaths(expected[index], actual[index], `${prefix}[${index}]`))
    }
    return differences
  }
  const expectedRecord = expected as Readonly<Record<string, unknown>>
  const actualRecord = actual as Readonly<Record<string, unknown>>
  const keys = new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])
  return [...keys].flatMap((key) => mismatchPaths(
    expectedRecord[key],
    actualRecord[key],
    `${prefix}.${key}`,
  ))
}

export function runNativeTransitionBatch(
  root: string,
  prepared: readonly PreparedNativeTransitionCase[],
  repetitions: number,
): NativeTransitionBatchBenchmark | NativeTransitionBatchUnavailable {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  const candidates = binaryCandidates(root)
  const binary = candidates.find(existsSync)
  if (binary === undefined) {
    return {
      available: false,
      reason: [
        'craft-kernel-batch binary not found',
        'build it with cargo outside this benchmark, or set FROZEN_RABBIT_CRAFT_KERNEL_BATCH_BIN',
      ].join('; '),
      checkedCandidates: candidates,
    }
  }
  const oneBatch = encodeNativeTransitionBatch(prepared)
  const input = oneBatch.repeat(repetitions)
  const startedAt = performance.now()
  const run = spawnSync(binary, [], {
    cwd: root,
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: Math.max(64 * 1024 * 1024, input.length * 8),
  })
  const processElapsedMs = performance.now() - startedAt
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) {
    throw new Error(
      `craft-kernel-batch failed with status ${run.status}: ${String(run.stderr).trim()}`,
    )
  }
  const parsed = parseNativeTransitionBatchOutput(String(run.stdout))
  const expected = Array.from({ length: repetitions }, () => (
    prepared.map(({ oracle }) => nativeTransitionComparableResult(oracle))
  )).flat()
  const differences = mismatchPaths(expected, parsed.results)
  if (differences.length > 0) {
    throw new Error(`native transition parity mismatch:\n${differences.slice(0, 30).join('\n')}`)
  }
  const rustKernelMs = parsed.summary.kernelNs / 1_000_000
  const processBoundaryMs = Math.max(0, processElapsedMs - rustKernelMs)
  return {
    available: true,
    binary,
    operations: parsed.summary.operations,
    processElapsedMs,
    rustKernelMs,
    processBoundaryMs,
    processBoundaryShare: processElapsedMs === 0 ? 0 : processBoundaryMs / processElapsedMs,
    operationsPerSecond: rustKernelMs === 0
      ? 0
      : parsed.summary.operations * 1_000 / rustKernelMs,
    fnv1a64Hex: parsed.summary.fnv1a64Hex,
    correctnessSha256: sha256(parsed.results.slice(0, prepared.length)),
    parityColumns: [
      'preview legal/reason/cost/success/gains',
      'actual success/next condition',
      'all 24 CraftState fields including buffs and terminal',
      'explanation codes',
      'absolute condition/success RNG cursors before/after',
    ],
    timingScope: [
      'Rust kernelNs includes TSV parse, preview/RNG/transition, response format, and FNV hash',
      'excludes process startup, stdin delivery, stdout delivery, and Node parity comparison',
      'processBoundaryMs reports the measured remainder instead of hiding startup/protocol cost',
    ].join('; '),
  }
}

export function runNativeCoreTransitionBenchmark(
  root: string,
  prepared: readonly PreparedNativeTransitionCase[],
  repetitions: number,
): NativeCoreTransitionBenchmark | NativeTransitionBatchUnavailable {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  const candidates = binaryCandidates(root)
  const binary = candidates.find(existsSync)
  if (binary === undefined) {
    return {
      available: false,
      reason: [
        'craft-kernel-batch binary not found',
        'build it with cargo outside this benchmark, or set FROZEN_RABBIT_CRAFT_KERNEL_BATCH_BIN',
      ].join('; '),
      checkedCandidates: candidates,
    }
  }
  const input = encodeNativeCoreBenchmarkInput(prepared, repetitions)
  const startedAt = performance.now()
  const run = spawnSync(binary, [], {
    cwd: root,
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  })
  const processElapsedMs = performance.now() - startedAt
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) {
    throw new Error(
      `craft-kernel-batch core benchmark failed with status ${run.status}: ${String(run.stderr).trim()}`,
    )
  }
  const summary = parseNativeCoreBenchmarkOutput(String(run.stdout))
  if (
    summary.repetitions !== repetitions
    || summary.cases !== prepared.length
    || summary.operations !== repetitions * prepared.length
  ) {
    throw new Error(
      `native core benchmark operation identity mismatch: ${JSON.stringify(summary)}`,
    )
  }
  const rustKernelMs = summary.kernelNs / 1_000_000
  const processBoundaryMs = Math.max(0, processElapsedMs - rustKernelMs)
  return {
    available: true,
    binary,
    repetitions,
    cases: summary.cases,
    operations: summary.operations,
    processElapsedMs,
    rustKernelMs,
    processBoundaryMs,
    processBoundaryShare: processElapsedMs === 0 ? 0 : processBoundaryMs / processElapsedMs,
    operationsPerSecond: rustKernelMs === 0 ? 0 : summary.operations * 1_000 / rustKernelMs,
    fnv1a32Hex: summary.fnv1a32Hex,
    timingScope: [
      `Rust parses the ${prepared.length} versioned cases once before the timed section`,
      'timed loop repeats preview/RNG/transition and hashes all exposed binary fields',
      'no per-operation TSV formatting or stdout occurs inside the timed section',
      'processBoundaryMs separately reports startup, input, one-time parse, and summary output',
    ].join('; '),
  }
}
