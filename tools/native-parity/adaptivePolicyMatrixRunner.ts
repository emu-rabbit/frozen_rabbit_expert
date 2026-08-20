import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import {
  executePreparedNativeAdaptivePolicyMatrix,
  nativeAdaptivePolicyOutcomeSha256,
  type PreparedNativeAdaptivePolicyMatrix,
} from './adaptivePolicyMatrix'
import {
  encodeNativeAdaptivePolicyMatrixInput,
  nativeAdaptivePolicyComparableOutputRows,
  nativeAdaptivePolicyRowsFnv1a32Hex,
  parseNativeAdaptivePolicyMatrixOutput,
} from './adaptivePolicyMatrixProtocol'

const MAX_BUFFER = 80 * 1024 * 1024

export interface NativeAdaptivePolicyMatrixResult {
  available: true
  binary: string
  cases: number
  transitions: number
  processElapsedMs: number
  rustKernelMs: number
  processBoundaryMs: number
  correctnessSha256: string
  structuredFnv1a32Hex: string
  outputFnv1a64Hex: string
}

export interface NativeAdaptivePolicyMatrixUnavailable {
  available: false
  reason: string
  checkedCandidates: readonly string[]
}

function binaryCandidates(root: string): readonly string[] {
  const executable = process.platform === 'win32'
    ? 'craft-kernel-adaptive-policy-matrix.exe'
    : 'craft-kernel-adaptive-policy-matrix'
  return [
    process.env.FROZEN_RABBIT_CRAFT_KERNEL_ADAPTIVE_POLICY_BIN,
    path.join(root, '.tmp', 'cargo-target', 'release', executable),
    path.join(root, '.tmp', 'cargo-target', 'debug', executable),
    path.join(root, 'native', 'craft-kernel', 'target', 'release', executable),
    path.join(root, 'native', 'craft-kernel', 'target', 'debug', executable),
  ].filter((value): value is string => value !== undefined && value.length > 0)
}

export function runNativeAdaptivePolicyMatrix(
  root: string,
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
): NativeAdaptivePolicyMatrixResult | NativeAdaptivePolicyMatrixUnavailable {
  const candidates = binaryCandidates(root)
  const binary = candidates.find(existsSync)
  if (binary === undefined) {
    return { available: false, reason: 'native adaptive-policy matrix binary not found', checkedCandidates: candidates }
  }
  const expected = executePreparedNativeAdaptivePolicyMatrix(prepared)
  const expectedSha = nativeAdaptivePolicyOutcomeSha256(expected)
  const expectedFnv = nativeAdaptivePolicyRowsFnv1a32Hex(
    nativeAdaptivePolicyComparableOutputRows(prepared.program, expected),
  )
  const startedAt = performance.now()
  const processResult = spawnSync(binary, [], {
    cwd: root,
    input: encodeNativeAdaptivePolicyMatrixInput(prepared),
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  })
  const processElapsedMs = performance.now() - startedAt
  if (processResult.error !== undefined) {
    return { available: false, reason: processResult.error.message, checkedCandidates: candidates }
  }
  if (processResult.status !== 0) {
    return {
      available: false,
      reason: `native adaptive-policy matrix exited ${processResult.status}: ${processResult.stderr || processResult.stdout}`,
      checkedCandidates: candidates,
    }
  }
  try {
    const parsed = parseNativeAdaptivePolicyMatrixOutput(processResult.stdout, prepared)
    if (!isDeepStrictEqual(parsed.outcomes, expected)) {
      throw new Error('native adaptive-policy raw outcomes differ from the TypeScript oracle')
    }
    if (parsed.fullTraceSha256 !== expectedSha) {
      throw new Error(`adaptive-policy full-trace SHA mismatch: ${parsed.fullTraceSha256} != ${expectedSha}`)
    }
    if (parsed.summary.structuredFnv1a32Hex !== expectedFnv) {
      throw new Error(
        `adaptive-policy structured FNV mismatch: ${parsed.summary.structuredFnv1a32Hex} != ${expectedFnv}`,
      )
    }
    const rustKernelMs = parsed.summary.kernelNs / 1_000_000
    return {
      available: true,
      binary,
      cases: parsed.summary.cases,
      transitions: parsed.summary.transitions,
      processElapsedMs,
      rustKernelMs,
      processBoundaryMs: Math.max(0, processElapsedMs - rustKernelMs),
      correctnessSha256: parsed.fullTraceSha256,
      structuredFnv1a32Hex: parsed.summary.structuredFnv1a32Hex,
      outputFnv1a64Hex: parsed.summary.outputFnv1a64Hex,
    }
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      checkedCandidates: candidates,
    }
  }
}
