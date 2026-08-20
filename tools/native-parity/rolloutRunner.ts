import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import type { CraftState } from '@frozen-rabbit-expert/domain'
import {
  executePreparedNativeRolloutCase,
  nativeRolloutComparableResult,
  nativeRolloutOracleHash,
  type NativeRolloutOracleResult,
  type PreparedNativeRolloutCase,
} from './rolloutBatch'
import {
  encodeNativeRolloutBatch,
  encodeNativeRolloutCoreBenchmarkInput,
  parseNativeRolloutBatchOutput,
  parseNativeRolloutCoreBenchmarkOutput,
} from './rolloutBatchProtocol'

export interface TypeScriptRolloutBatchBenchmark {
  operations: number
  transitions: number
  wallTimeMs: number
  operationsPerSecond: number
  transitionsPerSecond: number
  fnv1a32Hex: string
  correctnessSha256: string
  timingScope: string
}

export interface NativeRolloutBatchBenchmark {
  available: true
  binary: string
  operations: number
  transitions: number
  processElapsedMs: number
  rustKernelMs: number
  processBoundaryMs: number
  processBoundaryShare: number
  operationsPerSecond: number
  transitionsPerSecond: number
  fnv1a64Hex: string
  correctnessSha256: string
  parityColumns: readonly string[]
  timingScope: string
}

export interface NativeCoreRolloutBenchmark {
  available: true
  binary: string
  repetitions: number
  cases: number
  operations: number
  transitions: number
  processElapsedMs: number
  rustKernelMs: number
  processBoundaryMs: number
  processBoundaryShare: number
  operationsPerSecond: number
  transitionsPerSecond: number
  fnv1a32Hex: string
  timingScope: string
}

export interface NativeRolloutBatchUnavailable {
  available: false
  reason: string
  checkedCandidates: readonly string[]
}

export class Fnv1a32Writer {
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

function hashState(writer: Fnv1a32Writer, state: Readonly<CraftState>): void {
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
}

export function hashRolloutResult(
  writer: Fnv1a32Writer,
  result: Readonly<NativeRolloutOracleResult>,
): void {
  writer.text(result.terminal)
  writer.text(result.stopReason)
  writer.u32(result.actions.length)
  for (const action of result.actions) writer.text(action)
  writer.u32(result.steps.length)
  writer.u64(result.finalCursor.condition)
  writer.u64(result.finalCursor.success)
  hashState(writer, result.finalState)
  writer.u32(result.steps.length)
  for (const step of result.steps) {
    writer.text(step.action)
    writer.boolean(step.success)
    writer.text(step.nextCondition)
    writer.u64(step.cursorBefore.condition)
    writer.u64(step.cursorBefore.success)
    writer.u64(step.cursorAfter.condition)
    writer.u64(step.cursorAfter.success)
    writer.u32(step.explanationCodes.length)
    for (const explanation of step.explanationCodes) writer.text(explanation)
    hashState(writer, step.before)
    hashState(writer, step.after)
  }
}

export function benchmarkTypeScriptRolloutBatch(
  prepared: readonly PreparedNativeRolloutCase[],
  repetitions: number,
  warmupRepetitions = 1,
): TypeScriptRolloutBatchBenchmark {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  if (!Number.isSafeInteger(warmupRepetitions) || warmupRepetitions < 0) {
    throw new RangeError('warmupRepetitions must be a non-negative safe integer')
  }
  for (let repetition = 0; repetition < warmupRepetitions; repetition += 1) {
    for (const entry of prepared) executePreparedNativeRolloutCase(entry)
  }
  const writer = new Fnv1a32Writer()
  let transitions = 0
  const startedAt = performance.now()
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const entry of prepared) {
      const result = executePreparedNativeRolloutCase(entry)
      transitions += result.steps.length
      hashRolloutResult(writer, result)
    }
  }
  const wallTimeMs = performance.now() - startedAt
  const operations = repetitions * prepared.length
  return {
    operations,
    transitions,
    wallTimeMs,
    operationsPerSecond: wallTimeMs === 0 ? 0 : operations * 1_000 / wallTimeMs,
    transitionsPerSecond: wallTimeMs === 0 ? 0 : transitions * 1_000 / wallTimeMs,
    fnv1a32Hex: writer.hex(),
    correctnessSha256: nativeRolloutOracleHash(prepared),
    timingScope: [
      'one operation is one complete fixed-action rollout, not one transition',
      'includes RNG draws, legality checks, transitions, trace construction, and exposed-field FNV-1a32',
      'excludes process startup, TSV parse/format, and stdout',
    ].join('; '),
  }
}

function binaryCandidates(root: string): string[] {
  const executable = process.platform === 'win32'
    ? 'craft-kernel-rollout-batch.exe'
    : 'craft-kernel-rollout-batch'
  return [
    process.env.FROZEN_RABBIT_CRAFT_KERNEL_ROLLOUT_BIN,
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
    for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
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

function findBinary(root: string): {
  binary: string | undefined
  candidates: readonly string[]
} {
  const candidates = binaryCandidates(root)
  return { binary: candidates.find(existsSync), candidates }
}

function unavailable(candidates: readonly string[]): NativeRolloutBatchUnavailable {
  return {
    available: false,
    reason: [
      'craft-kernel-rollout-batch binary not found',
      'build it with cargo outside this benchmark, or set FROZEN_RABBIT_CRAFT_KERNEL_ROLLOUT_BIN',
    ].join('; '),
    checkedCandidates: candidates,
  }
}

export function runNativeRolloutBatch(
  root: string,
  prepared: readonly PreparedNativeRolloutCase[],
  repetitions = 1,
): NativeRolloutBatchBenchmark | NativeRolloutBatchUnavailable {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  const { binary, candidates } = findBinary(root)
  if (binary === undefined) return unavailable(candidates)
  const input = encodeNativeRolloutBatch(prepared).repeat(repetitions)
  const startedAt = performance.now()
  const run = spawnSync(binary, [], {
    cwd: root,
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: Math.max(64 * 1024 * 1024, input.length * 16),
  })
  const processElapsedMs = performance.now() - startedAt
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) {
    throw new Error(`craft-kernel-rollout-batch failed with status ${run.status}: ${String(run.stderr).trim()}`)
  }
  const parsed = parseNativeRolloutBatchOutput(String(run.stdout))
  const expected = Array.from({ length: repetitions }, () => (
    prepared.map(({ oracle }) => nativeRolloutComparableResult(oracle))
  )).flat()
  const differences = mismatchPaths(expected, parsed.results)
  if (differences.length > 0) {
    throw new Error(`native rollout parity mismatch:\n${differences.slice(0, 30).join('\n')}`)
  }
  const rustKernelMs = parsed.summary.kernelNs / 1_000_000
  const processBoundaryMs = Math.max(0, processElapsedMs - rustKernelMs)
  const oneBatchResults = parsed.results.slice(0, prepared.length)
  return {
    available: true,
    binary,
    operations: parsed.summary.operations,
    transitions: parsed.summary.transitions,
    processElapsedMs,
    rustKernelMs,
    processBoundaryMs,
    processBoundaryShare: processElapsedMs === 0 ? 0 : processBoundaryMs / processElapsedMs,
    operationsPerSecond: rustKernelMs === 0 ? 0 : parsed.summary.operations * 1_000 / rustKernelMs,
    transitionsPerSecond: rustKernelMs === 0 ? 0 : parsed.summary.transitions * 1_000 / rustKernelMs,
    fnv1a64Hex: parsed.summary.fnv1a64Hex,
    correctnessSha256: createHash('sha256').update(JSON.stringify(oneBatchResults)).digest('hex'),
    parityColumns: [
      'terminal, stop reason, action sequence, and transition count',
      'all 24 final CraftState fields',
      'every step success, condition, state, explanation, and independent RNG cursor',
      'illegal action and action-limit fail-closed boundaries',
    ],
    timingScope: [
      'Rust kernelNs includes TSV parse, complete rollout, trace TSV format, and output-row FNV-1a64',
      'excludes process startup, stdin/stdout delivery, and Node parity comparison',
      'processBoundaryMs reports the measured remainder instead of hiding protocol cost',
    ].join('; '),
  }
}

export function runNativeCoreRolloutBenchmark(
  root: string,
  prepared: readonly PreparedNativeRolloutCase[],
  repetitions: number,
): NativeCoreRolloutBenchmark | NativeRolloutBatchUnavailable {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  const { binary, candidates } = findBinary(root)
  if (binary === undefined) return unavailable(candidates)
  const input = encodeNativeRolloutCoreBenchmarkInput(prepared, repetitions)
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
      `craft-kernel-rollout-batch benchmark failed with status ${run.status}: ${String(run.stderr).trim()}`,
    )
  }
  const summary = parseNativeRolloutCoreBenchmarkOutput(String(run.stdout))
  if (
    summary.repetitions !== repetitions
    || summary.cases !== prepared.length
    || summary.operations !== repetitions * prepared.length
  ) throw new Error(`native rollout benchmark operation identity mismatch: ${JSON.stringify(summary)}`)
  const rustKernelMs = summary.kernelNs / 1_000_000
  const processBoundaryMs = Math.max(0, processElapsedMs - rustKernelMs)
  return {
    available: true,
    binary,
    repetitions,
    cases: summary.cases,
    operations: summary.operations,
    transitions: summary.transitions,
    processElapsedMs,
    rustKernelMs,
    processBoundaryMs,
    processBoundaryShare: processElapsedMs === 0 ? 0 : processBoundaryMs / processElapsedMs,
    operationsPerSecond: rustKernelMs === 0 ? 0 : summary.operations * 1_000 / rustKernelMs,
    transitionsPerSecond: rustKernelMs === 0 ? 0 : summary.transitions * 1_000 / rustKernelMs,
    fnv1a32Hex: summary.hash,
    timingScope: [
      'Rust parses each versioned rollout case once before the timed section',
      'timed loop executes complete fixed-action rollouts and hashes all binary exposed fields',
      'no per-operation TSV formatting or stdout occurs inside the timed section',
      'processBoundaryMs separately reports startup, input, one-time parse, and summary output',
    ].join('; '),
  }
}
