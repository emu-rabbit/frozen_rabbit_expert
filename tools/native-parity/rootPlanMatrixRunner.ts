import { existsSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import {
  executePreparedNativeRootPlanMatrix,
  executePreparedNativeRootPlanMatrixOracle,
  nativeRootPlanMatrixOracleSha256,
  type NativeRootPlanMatrixOracleOutcome,
  type PreparedNativeRootPlanMatrix,
} from './rootPlanMatrix'
import {
  NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES,
  assertRootPlanMatrixProtocolIdentity,
  encodeNativeRootPlanMatrixBatch,
  encodeNativeRootPlanMatrixBenchmarkInput,
  parseNativeRootPlanMatrixBatchOutput,
  parseNativeRootPlanMatrixBenchmarkOutput,
  validateNativeRootPlanMatrixBenchmark,
} from './rootPlanMatrixProtocol'
import { Fnv1a32Writer, hashRolloutResult } from './rolloutRunner'

export interface TypeScriptRootPlanMatrixBenchmark {
  operations: number
  transitions: number
  wallTimeMs: number
  operationsPerSecond: number
  transitionsPerSecond: number
  transitionsPerOperation: number
  fnv1a32Hex: string
  correctnessSha256: string
  timingScope: string
}

export interface NativeRootPlanMatrixProtocolResult {
  available: true
  binary: string
  requests: number
  operations: number
  transitions: number
  processElapsedMs: number
  rustKernelMs: number
  processBoundaryMs: number
  operationsPerSecond: number
  transitionsPerSecond: number
  transitionsPerOperation: number
  correctnessSha256: string
  outputFnv1a64Hex: string
  timingScope: string
}

export interface NativeRootPlanMatrixCoreBenchmark {
  available: true
  binary: string
  repetitions: number
  requests: number
  operations: number
  transitions: number
  processElapsedMs: number
  rustKernelMs: number
  processBoundaryMs: number
  operationsPerSecond: number
  transitionsPerSecond: number
  transitionsPerOperation: number
  fnv1a32Hex: string
  timingScope: string
}

export interface NativeRootPlanMatrixUnavailable {
  available: false
  reason: string
  checkedCandidates: readonly string[]
}

function hashOracleOutcome(writer: Fnv1a32Writer, outcome: NativeRootPlanMatrixOracleOutcome): void {
  writer.text(outcome.caseId)
  writer.text(outcome.scenarioId)
  writer.text(outcome.scenarioModelIdentityVersion)
  writer.text(outcome.scenarioModelContentHash)
  writer.text(outcome.continuationPlanId)
  writer.text(outcome.conditionProfileId)
  writer.u32(outcome.candidateOrdinal)
  writer.text(outcome.candidateId)
  writer.text(outcome.rootAction)
  writer.u32(outcome.sampleIndex)
  writer.u32(outcome.pairedSeed)
  hashRolloutResult(writer, outcome.rollout)
}

export function benchmarkTypeScriptRootPlanMatrix(
  prepared: readonly PreparedNativeRootPlanMatrix[],
  repetitions: number,
  warmupRepetitions = 1,
): TypeScriptRootPlanMatrixBenchmark {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('root-plan repetitions must be a positive safe integer')
  }
  if (!Number.isSafeInteger(warmupRepetitions) || warmupRepetitions < 0) {
    throw new RangeError('root-plan warmups must be a non-negative safe integer')
  }
  const totalRepetitions = repetitions + warmupRepetitions
  if (!Number.isSafeInteger(totalRepetitions)) {
    throw new RangeError('root-plan repetitions plus warmups exceed the safe integer range')
  }
  validateNativeRootPlanMatrixBenchmark(prepared, totalRepetitions)
  for (let repetition = 0; repetition < warmupRepetitions; repetition += 1) {
    for (const entry of prepared) executePreparedNativeRootPlanMatrixOracle(entry)
  }
  const writer = new Fnv1a32Writer()
  let transitions = 0
  const startedAt = performance.now()
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const entry of prepared) {
      for (const outcome of executePreparedNativeRootPlanMatrixOracle(entry)) {
        transitions += outcome.rollout.steps.length
        hashOracleOutcome(writer, outcome)
      }
    }
  }
  const wallTimeMs = performance.now() - startedAt
  const operationsPerRepetition = prepared.reduce((sum, entry) => (
    sum + entry.spec.candidates.length * entry.spec.samples.length
  ), 0)
  const operations = operationsPerRepetition * repetitions
  return {
    operations,
    transitions,
    wallTimeMs,
    operationsPerSecond: wallTimeMs === 0 ? 0 : operations * 1_000 / wallTimeMs,
    transitionsPerSecond: wallTimeMs === 0 ? 0 : transitions * 1_000 / wallTimeMs,
    transitionsPerOperation: operations === 0 ? 0 : transitions / operations,
    fnv1a32Hex: writer.hex(),
    correctnessSha256: nativeRootPlanMatrixOracleSha256(prepared),
    timingScope: [
      'one operation is one root-candidate x paired-seed fixed-continuation episode',
      'includes RNG, legality, mechanics transitions, trace construction, and binary exposed-field FNV-1a32',
      'fixed continuation only; excludes adaptive guide decisions, objective scoring, process startup, and TSV',
    ].join('; '),
  }
}

function binaryCandidates(root: string): string[] {
  const executable = process.platform === 'win32'
    ? 'craft-kernel-root-plan-matrix.exe'
    : 'craft-kernel-root-plan-matrix'
  return [
    process.env.FROZEN_RABBIT_CRAFT_KERNEL_ROOT_PLAN_BIN,
    path.join(root, '.tmp', 'cargo-target', 'release', executable),
    path.join(root, 'native', 'craft-kernel', 'target', 'release', executable),
    path.join(root, 'native', 'craft-kernel', 'target', 'debug', executable),
  ].filter((value): value is string => value !== undefined && value.length > 0)
}

function findBinary(root: string): { binary: string | undefined; candidates: readonly string[] } {
  const candidates = binaryCandidates(root)
  return { binary: candidates.find(existsSync), candidates }
}

function unavailable(
  candidates: readonly string[],
  reason: string,
): NativeRootPlanMatrixUnavailable {
  return { available: false, reason, checkedCandidates: candidates }
}

export function runNativeRootPlanMatrix(
  root: string,
  prepared: readonly PreparedNativeRootPlanMatrix[],
): NativeRootPlanMatrixProtocolResult | NativeRootPlanMatrixUnavailable {
  const { binary, candidates } = findBinary(root)
  if (binary === undefined) return unavailable(candidates, 'native root-plan matrix binary not found')
  const input = encodeNativeRootPlanMatrixBatch(prepared)
  const startedAt = performance.now()
  const process = spawnSync(binary, [], {
    cwd: root,
    input,
    encoding: 'utf8',
    maxBuffer: NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES + 16 * 1024 * 1024,
  })
  const processElapsedMs = performance.now() - startedAt
  if (process.error !== undefined) return unavailable(candidates, process.error.message)
  if (process.status !== 0) {
    return unavailable(candidates, `native root-plan exited ${process.status}: ${process.stderr || process.stdout}`)
  }
  try {
    const parsed = parseNativeRootPlanMatrixBatchOutput(process.stdout)
    assertRootPlanMatrixProtocolIdentity(prepared, parsed.outcomes)
    const expected = prepared.flatMap(executePreparedNativeRootPlanMatrix)
    if (!isDeepStrictEqual(parsed.outcomes, expected)) {
      throw new Error('native root-plan raw paired outcomes differ from the TypeScript oracle')
    }
    const expectedSha256 = nativeRootPlanMatrixOracleSha256(prepared)
    if (parsed.correctnessSha256 !== expectedSha256) {
      throw new Error(`native root-plan SHA-256 mismatch: ${parsed.correctnessSha256} != ${expectedSha256}`)
    }
    const rustKernelMs = parsed.summary.kernelNs / 1_000_000
    const processBoundaryMs = Math.max(0, processElapsedMs - rustKernelMs)
    return {
      available: true,
      binary,
      requests: parsed.summary.requests,
      operations: parsed.summary.operations,
      transitions: parsed.summary.transitions,
      processElapsedMs,
      rustKernelMs,
      processBoundaryMs,
      operationsPerSecond: processElapsedMs === 0 ? 0 : parsed.summary.operations * 1_000 / processElapsedMs,
      transitionsPerSecond: processElapsedMs === 0 ? 0 : parsed.summary.transitions * 1_000 / processElapsedMs,
      transitionsPerOperation: parsed.summary.operations === 0
        ? 0
        : parsed.summary.transitions / parsed.summary.operations,
      correctnessSha256: parsed.correctnessSha256,
      outputFnv1a64Hex: parsed.outputFnv1a64Hex,
      timingScope: [
        'one process carries every compressed request and returns every raw paired full trace',
        'includes process startup, Rust TSV parse/format, and stdout capture; excludes TypeScript output parsing and parity validation',
        'fixed continuation only; objective scoring and adaptive guide decisions are outside this protocol',
      ].join('; '),
    }
  } catch (error) {
    return unavailable(candidates, error instanceof Error ? error.message : String(error))
  }
}

export function runNativeCoreRootPlanMatrixBenchmark(
  root: string,
  prepared: readonly PreparedNativeRootPlanMatrix[],
  repetitions: number,
): NativeRootPlanMatrixCoreBenchmark | NativeRootPlanMatrixUnavailable {
  const { binary, candidates } = findBinary(root)
  if (binary === undefined) return unavailable(candidates, 'native root-plan matrix binary not found')
  const input = encodeNativeRootPlanMatrixBenchmarkInput(prepared, repetitions)
  const startedAt = performance.now()
  const process = spawnSync(binary, [], {
    cwd: root,
    input,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  const processElapsedMs = performance.now() - startedAt
  if (process.error !== undefined) return unavailable(candidates, process.error.message)
  if (process.status !== 0) {
    return unavailable(candidates, `native root-plan benchmark exited ${process.status}: ${process.stderr || process.stdout}`)
  }
  try {
    const parsed = parseNativeRootPlanMatrixBenchmarkOutput(process.stdout)
    const rustKernelMs = parsed.kernelNs / 1_000_000
    const processBoundaryMs = Math.max(0, processElapsedMs - rustKernelMs)
    return {
      available: true,
      binary,
      ...parsed,
      processElapsedMs,
      rustKernelMs,
      processBoundaryMs,
      operationsPerSecond: rustKernelMs === 0 ? 0 : parsed.operations * 1_000 / rustKernelMs,
      transitionsPerSecond: rustKernelMs === 0 ? 0 : parsed.transitions * 1_000 / rustKernelMs,
      transitionsPerOperation: parsed.operations === 0 ? 0 : parsed.transitions / parsed.operations,
      timingScope: [
        'timed Rust core expands candidate x paired-seed matrices and hashes binary exposed fields',
        'excludes process startup, request TSV parse, response formatting, and stdout',
        'fixed continuation only; no adaptive guide or generic search is included',
      ].join('; '),
    }
  } catch (error) {
    return unavailable(candidates, error instanceof Error ? error.message : String(error))
  }
}
