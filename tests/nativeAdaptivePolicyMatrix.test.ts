import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  sealCraftAdaptivePolicyProgramV1,
  type CraftAdaptivePolicyProgramV1,
} from '@frozen-rabbit-expert/solver'
import {
  executePreparedNativeAdaptivePolicyMatrix,
  NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_OUTPUT_BYTES,
  NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROJECTED_EVALUATION_UNITS,
  NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROTOCOL_CELL_BYTES,
  nativeAdaptivePolicyOutcomeSha256,
  prepareNativeAdaptivePolicyMatrix,
  type PreparedNativeAdaptivePolicyMatrix,
} from '../tools/native-parity/adaptivePolicyMatrix'
import {
  adaptivePolicyProgramFlagIds,
  encodeNativeAdaptivePolicyExpectedOutput,
  encodeNativeAdaptivePolicyMatrixInput,
  nativeAdaptivePolicyComparableOutputRows,
  nativeAdaptivePolicyRowsFnv1a32Hex,
  parseNativeAdaptivePolicyMatrixOutput,
} from '../tools/native-parity/adaptivePolicyMatrixProtocol'
import { runNativeAdaptivePolicyMatrix } from '../tools/native-parity/adaptivePolicyMatrixRunner'

describe('native adaptive-policy matrix v1 TypeScript oracle', () => {
  const prepared = prepareNativeAdaptivePolicyMatrix()
  const oracle = executePreparedNativeAdaptivePolicyMatrix(prepared)

  it('covers six equipment/stat panels under three deterministic worlds', () => {
    expect(prepared.cases).toHaveLength(18)
    expect(new Set(prepared.cases.map(({ crafterCaseId }) => crafterCaseId))).toEqual(new Set([
      'player-unbuffed-cosmic-tool-v1',
      'player-food-medicine-cosmic-tool-v1',
      'player-food-medicine-specialist-cosmic-tool-v1',
      'command-brew-exact-min-v1',
      'command-brew-exact-max-v1',
      'command-brew-ood-cp629-v1',
    ]))
    expect(new Set(prepared.cases.map(({ world }) => world.id))).toEqual(new Set([
      'all-normal-v1',
      'all-malleable-v1',
      'non-iid-good-chain-v1',
    ]))
    expect(new Set(oracle.map(({ programContentHash }) => programContentHash)))
      .toEqual(new Set([prepared.program.contentHash]))
    expect(new Set(oracle.map(({ scenarioModelContentHash }) => scenarioModelContentHash)))
      .toEqual(new Set([prepared.program.scenarioModelContentHash]))
    expect(oracle.some(({ steps }) => steps.some(({ decision }) => (
      decision.action === 'preciseTouch' && decision.decisionId === 'use-single-good-precise-touch'
    )))).toBe(true)
    expect(oracle.some(({ steps }) => steps.some(({ decision }) => (
      decision.action === 'preciseTouch' && decision.decisionId === 'use-second-good-precise-touch'
    )))).toBe(true)
  })

  it('fails CP629 closed before the first action while bounded known panels execute', () => {
    const ood = oracle.filter(({ crafterCaseId }) => crafterCaseId === 'command-brew-ood-cp629-v1')
    expect(ood).toHaveLength(3)
    expect(ood.every(({ stopReason, steps, finalState }) => (
      stopReason === 'policy-null' && steps.length === 0 && finalState.step === 1
    ))).toBe(true)

    const inEnvelope = oracle.filter(({ crafterCaseId }) => crafterCaseId !== 'command-brew-ood-cp629-v1')
    expect(inEnvelope.every(({ steps }) => steps.length > 0)).toBe(true)
    expect(inEnvelope.every(({ stopReason }) => stopReason === 'completed')).toBe(true)
  })

  it('preserves the known all-Normal floor and full-quality capable panels', () => {
    const allNormal = new Map(oracle
      .filter(({ worldId }) => worldId === 'all-normal-v1')
      .map((outcome) => [outcome.crafterCaseId, outcome]))
    expect(allNormal.get('player-unbuffed-cosmic-tool-v1')?.finalState.quality).toBe(6_839)
    expect(allNormal.get('player-food-medicine-cosmic-tool-v1')?.finalState.quality).toBe(12_000)
    expect(allNormal.get('player-food-medicine-specialist-cosmic-tool-v1')?.finalState.quality).toBe(12_000)
    expect(allNormal.get('command-brew-exact-min-v1')?.finalState.quality).toBe(12_000)
    expect(allNormal.get('command-brew-exact-max-v1')?.finalState.quality).toBe(12_000)
  })

  it('round-trips every step, state, memory field, identity, and both output hashes', () => {
    const stdout = encodeNativeAdaptivePolicyExpectedOutput(prepared, oracle, 123)
    const parsed = parseNativeAdaptivePolicyMatrixOutput(stdout, prepared)
    expect(parsed.outcomes).toEqual(oracle)
    expect(parsed.fullTraceSha256).toBe(nativeAdaptivePolicyOutcomeSha256(oracle))
    expect(parsed.summary.kernelNs).toBe(123)
    expect(parsed.summary.structuredFnv1a32Hex).toBe(
      nativeAdaptivePolicyRowsFnv1a32Hex(
        nativeAdaptivePolicyComparableOutputRows(prepared.program, oracle),
      ),
    )
  })

  it('encodes the executable program as dependency-free records and no profile-specific route in a case', () => {
    const rows = encodeNativeAdaptivePolicyMatrixInput(prepared).trimEnd().split('\n')
      .map((line) => line.split('\t'))
    expect(rows[0]!.slice(0, 4)).toEqual([
      'native-adaptive-policy-matrix-v1',
      '__program__',
      'program',
      'craft-adaptive-policy-program-v2',
    ])
    expect(rows.filter((row) => row[2] === 'node')).toHaveLength(prepared.program.nodes.length)
    expect(rows.filter((row) => row[2] === 'case')).toHaveLength(prepared.cases.length)
    expect(rows.filter((row) => row[2] === 'decision-action').length).toBeGreaterThan(0)
    expect(adaptivePolicyProgramFlagIds(prepared.program)).toEqual(['consume-protected-malleable'])
  })

  it('recomputes identity and rejects tampered artifact content before encoding', () => {
    const tampered = {
      ...prepared,
      program: {
        ...prepared.program,
        qualityMaximum: prepared.program.qualityMaximum - 1,
      },
    } satisfies PreparedNativeAdaptivePolicyMatrix
    expect(() => encodeNativeAdaptivePolicyMatrixInput(tampered)).toThrow(/content hash mismatch/u)
  })

  it('rejects oversized cells and projected work/output before encoding', () => {
    const firstCase = prepared.cases[0]!
    const oversizedCell = {
      ...prepared,
      cases: [{
        ...firstCase,
        caseId: 'x'.repeat(NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROTOCOL_CELL_BYTES + 1),
      }],
    } satisfies PreparedNativeAdaptivePolicyMatrix
    expect(() => encodeNativeAdaptivePolicyMatrixInput(oversizedCell)).toThrow(/protocol cell cap/u)

    const maximumCases = Array.from({ length: 64 }, (_, index) => ({
      ...firstCase,
      caseId: `cap-case-${index}`,
      maxSteps: 64,
    }))
    const reseal = (
      program: Readonly<CraftAdaptivePolicyProgramV1>,
      maxSettleHops: number,
      expandTransitionGuards: boolean,
    ): CraftAdaptivePolicyProgramV1 => {
      const { contentHash: _contentHash, ...definition } = program
      const targetNodeIndex = definition.nodes.findIndex((node) => node.transitions.length > 0)
      if (targetNodeIndex < 0) throw new Error('fixture program needs one transition')
      const targetNode = definition.nodes[targetNodeIndex]!
      const firstTransition = targetNode.transitions[0]!
      const firstGuard = firstTransition.all[0]!
      return sealCraftAdaptivePolicyProgramV1({
        ...definition,
        limits: { ...definition.limits, maxSettleHops },
        nodes: definition.nodes.map((node, nodeIndex) => nodeIndex === targetNodeIndex
          ? {
              ...node,
              transitions: node.transitions.map((transition, transitionIndex) => (
                expandTransitionGuards && transitionIndex === 0
                  ? { ...transition, all: Array.from({ length: 256 }, () => firstGuard) }
                  : transition
              )),
            }
          : node),
      })
    }

    const excessiveWork = {
      ...prepared,
      program: reseal(prepared.program, 128, true),
      cases: maximumCases,
    } satisfies PreparedNativeAdaptivePolicyMatrix
    expect(() => encodeNativeAdaptivePolicyMatrixInput(excessiveWork))
      .toThrow(/projected evaluation units/u)

    const excessiveOutput = {
      ...prepared,
      program: reseal(prepared.program, 1, false),
      cases: maximumCases,
    } satisfies PreparedNativeAdaptivePolicyMatrix
    expect(() => encodeNativeAdaptivePolicyMatrixInput(excessiveOutput))
      .toThrow(/projected output bytes/u)
    expect(NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROJECTED_EVALUATION_UNITS).toBe(25_000_000)
    expect(NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_OUTPUT_BYTES).toBe(64 * 1024 * 1024)
  })

  it('reports a missing native binary as unavailable so the required gate fails closed', () => {
    const variable = 'FROZEN_RABBIT_CRAFT_KERNEL_ADAPTIVE_POLICY_BIN'
    const previous = process.env[variable]
    process.env[variable] = path.join(process.cwd(), '.tmp', 'missing-adaptive-policy-binary')
    try {
      const result = runNativeAdaptivePolicyMatrix(
        path.join(process.cwd(), '.tmp', 'missing-adaptive-policy-root'),
        prepared,
      )
      expect(result.available).toBe(false)
      if (!result.available) expect(result.reason).toMatch(/binary not found/u)
    } finally {
      if (previous === undefined) delete process.env[variable]
      else process.env[variable] = previous
    }
  })
})
