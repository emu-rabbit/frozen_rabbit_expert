import { describe, expect, it } from 'vitest'
import {
  CRAFT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import { MATERIAL_CONDITIONS } from '@frozen-rabbit-expert/domain'
import {
  NATIVE_ROLLOUT_BATCH_VERSION,
  nativeRolloutComparableResult,
  nativeRolloutOracleHash,
  prepareNativeRolloutBatch,
} from '../tools/native-parity/rolloutBatch'
import {
  encodeNativeRolloutBatch,
  encodeNativeRolloutInput,
  parseNativeRolloutBatchOutput,
} from '../tools/native-parity/rolloutBatchProtocol'
import { benchmarkTypeScriptRolloutBatch } from '../tools/native-parity/rolloutRunner'
import {
  encodeNativeStateCells,
  outputFnv1a64,
} from '../tools/native-parity/transitionBatchProtocol'

function encodedOracleResultLine(
  entry: ReturnType<typeof prepareNativeRolloutBatch>[number],
): string {
  const { oracle } = entry
  const trace = oracle.steps.length === 0
    ? '-'
    : oracle.steps.map((step) => [
        step.action,
        step.success ? '1' : '0',
        step.nextCondition,
        step.cursorBefore.condition,
        step.cursorBefore.success,
        step.cursorAfter.condition,
        step.cursorAfter.success,
        step.explanationCodes.length === 0 ? '-' : step.explanationCodes.join(','),
        ...encodeNativeStateCells(step.after),
      ].join('|')).join(';')
  return [
    NATIVE_ROLLOUT_BATCH_VERSION,
    oracle.caseId,
    'rollout',
    'ok',
    oracle.terminal,
    oracle.stopReason,
    oracle.actions.length === 0 ? '-' : oracle.actions.join(','),
    oracle.steps.length,
    oracle.finalCursor.condition,
    oracle.finalCursor.success,
    ...encodeNativeStateCells(oracle.finalState),
    trace,
  ].join('\t')
}

describe('native fixed-action rollout batch v2 TypeScript oracle', () => {
  const prepared = prepareNativeRolloutBatch()

  it('covers all product recipes, all three regression panels, and multi-step boundaries', () => {
    expect(new Set(prepared.map(({ spec }) => spec.scenarioId))).toEqual(
      new Set(CRAFT_SCENARIO_DATA.map(({ scenarioId }) => scenarioId)),
    )
    expect(new Set(prepared.map(({ spec }) => spec.equipmentProfileId))).toEqual(
      new Set(PLAYER_EQUIPMENT_PROFILES.map(({ id }) => id)),
    )
    expect(prepared.every(({ oracle }) => oracle.steps.length <= oracle.actions.length)).toBe(true)
    expect(prepared.some(({ oracle }) => oracle.steps.length >= 3)).toBe(true)
    expect(new Set(prepared.map(({ oracle }) => oracle.stopReason))).toEqual(new Set([
      'completed',
      'failed',
      'policy-null',
      'illegal-action',
      'action-limit',
    ]))
  })

  it('locks independent RNG cursors, Good Omen, no-step resources, and fail-closed actions', () => {
    const byId = new Map(prepared.map((entry) => [entry.spec.caseId, entry]))
    const goodOmen = byId.get('stairs-good-omen-forced-good-route')!.oracle
    expect(goodOmen.steps[0]).toMatchObject({
      nextCondition: 'good',
      cursorBefore: { condition: 3, success: 2 },
      cursorAfter: { condition: 3, success: 3 },
    })
    const specialist = byId.get('brew-specialist-no-step-route')!.oracle
    expect(specialist.steps[0]).toMatchObject({
      action: 'carefulObservation',
      cursorBefore: { condition: 1, success: 4 },
      cursorAfter: { condition: 2, success: 4 },
    })
    expect(specialist.steps[1]).toMatchObject({
      action: 'heartAndSoul',
      cursorBefore: { condition: 2, success: 4 },
      cursorAfter: { condition: 2, success: 4 },
    })
    expect(byId.get('ingot-illegal-sequence-stop')!.oracle).toMatchObject({
      actions: [],
      steps: [],
      terminal: 'none',
      stopReason: 'illegal-action',
    })
    expect(byId.get('ingot-non-iid-condition-row-lock')!.oracle.steps.map((step) => (
      step.nextCondition
    ))).toEqual(['good', 'malleable', 'normal'])
    expect(byId.get('brew-no-step-action-limit')!.oracle).toMatchObject({
      stopReason: 'action-limit',
      finalState: { step: 7 },
      finalCursor: { condition: 3, success: 3 },
    })
    expect(byId.get('brew-no-step-action-limit')!.oracle.steps).toHaveLength(2)
  })

  it('encodes a versioned 129-column request with a complete 9x9 transition model', () => {
    const transitionStart = 47
    const transitionEnd = transitionStart + MATERIAL_CONDITIONS.length ** 2
    for (const entry of prepared) {
      const cells = encodeNativeRolloutInput(entry).split('\t')
      expect(cells).toHaveLength(129)
      expect(cells.slice(0, 3)).toEqual([
        NATIVE_ROLLOUT_BATCH_VERSION,
        entry.spec.caseId,
        'rollout',
      ])
      expect(cells.slice(transitionStart, transitionEnd)).toHaveLength(
        MATERIAL_CONDITIONS.length * MATERIAL_CONDITIONS.length,
      )
      expect(cells[transitionEnd]).toBe(entry.spec.actions.join(','))
    }
    const rowLock = prepared.find(({ spec }) => (
      spec.caseId === 'ingot-non-iid-condition-row-lock'
    ))!
    const rowLockWeights = encodeNativeRolloutInput(rowLock).split('\t')
      .slice(transitionStart, transitionEnd)
    const weightAt = (previous: typeof MATERIAL_CONDITIONS[number], next: typeof MATERIAL_CONDITIONS[number]) => (
      Number(rowLockWeights[
        MATERIAL_CONDITIONS.indexOf(previous) * MATERIAL_CONDITIONS.length
        + MATERIAL_CONDITIONS.indexOf(next)
      ])
    )
    expect(weightAt('normal', 'good')).toBe(1)
    expect(weightAt('normal', 'normal')).toBe(0)
    expect(weightAt('good', 'malleable')).toBe(1)
    expect(weightAt('good', 'normal')).toBe(0)
    expect(weightAt('malleable', 'normal')).toBe(1)
    expect(weightAt('malleable', 'good')).toBe(0)
    const batch = encodeNativeRolloutBatch(prepared)
    expect(batch.endsWith('\n')).toBe(true)
    expect(batch.trimEnd().split('\n')).toHaveLength(prepared.length)
  })

  it('locks the full TypeScript rollout, state, explanation, and cursor oracle payload', () => {
    expect(nativeRolloutOracleHash(prepared)).toBe(
      'a7587b7a981742bbfeaca809a0f2a8d2e6c960126cb07c6ee39a13ebb82f6ccb',
    )
  })

  it('decodes the complete 35-column result and verifies its batch hash', () => {
    const resultLines = prepared.map(encodedOracleResultLine)
    const transitions = prepared.reduce((sum, entry) => sum + entry.oracle.steps.length, 0)
    const stdout = [
      ...resultLines,
      [
        NATIVE_ROLLOUT_BATCH_VERSION,
        '__batch__',
        'summary',
        'ok',
        prepared.length,
        transitions,
        123,
        outputFnv1a64(resultLines),
      ].join('\t'),
      '',
    ].join('\n')
    const parsed = parseNativeRolloutBatchOutput(stdout)
    expect(parsed.results).toEqual(prepared.map(({ oracle }) => nativeRolloutComparableResult(oracle)))
    expect(() => parseNativeRolloutBatchOutput(stdout.replace('\t123\t', '\t123\tdeadbeef')))
      .toThrow()
  })

  it('produces a deterministic binary benchmark hash over complete rollouts', () => {
    const first = benchmarkTypeScriptRolloutBatch(prepared, 3, 0)
    const second = benchmarkTypeScriptRolloutBatch(prepared, 3, 0)
    expect(first).toMatchObject({
      operations: prepared.length * 3,
      transitions: prepared.reduce((sum, entry) => sum + entry.oracle.steps.length, 0) * 3,
      fnv1a32Hex: 'c0e08b04',
    })
    expect(second.fnv1a32Hex).toBe(first.fnv1a32Hex)
    expect(second.transitions).toBe(first.transitions)
  })
})
