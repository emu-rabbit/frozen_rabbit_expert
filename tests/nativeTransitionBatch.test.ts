import { describe, expect, it } from 'vitest'
import { ACTION_IDS, MATERIAL_CONDITIONS } from '@frozen-rabbit-expert/domain'
import {
  CRAFT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import {
  NATIVE_TRANSITION_BATCH_VERSION,
  nativeTransitionOracleHash,
  prepareNativeTransitionBatch,
} from '../tools/native-parity/transitionBatch'
import {
  encodeNativeTransitionBatch,
  encodeNativeTransitionInput,
} from '../tools/native-parity/transitionBatchProtocol'

describe('native transition batch v2 TypeScript oracle', () => {
  const prepared = prepareNativeTransitionBatch()

  it('covers every product recipe, player panel, condition, buff, and terminal class', () => {
    expect(new Set(prepared.map(({ spec }) => spec.scenarioId))).toEqual(
      new Set(CRAFT_SCENARIO_DATA.map(({ scenarioId }) => scenarioId)),
    )
    expect(new Set(prepared.map(({ spec }) => spec.equipmentProfileId))).toEqual(
      new Set(PLAYER_EQUIPMENT_PROFILES.map(({ id }) => id)),
    )
    expect(new Set(prepared.map(({ state }) => state.condition))).toEqual(
      new Set(MATERIAL_CONDITIONS),
    )

    const nonZeroBuffs = new Set(prepared.flatMap(({ state }) => (
      Object.entries(state.buffs)
        .filter(([, duration]) => duration > 0)
        .map(([buff]) => buff)
    )))
    expect(nonZeroBuffs).toEqual(new Set([
      'wasteNot',
      'veneration',
      'greatStrides',
      'innovation',
      'finalAppraisal',
      'manipulation',
      'muscleMemory',
      'expedience',
    ]))

    expect(new Set(prepared.map(({ oracle }) => oracle.nextState?.terminal ?? 'preview')))
      .toEqual(new Set(['none', 'completed', 'failed', 'preview']))
    expect(new Set(prepared.map(({ oracle }) => oracle.nextState?.failureReason).filter(Boolean)))
      .toEqual(new Set(['required-quality', 'durability']))
    expect(prepared.some(({ spec }) => spec.tags.includes('specialist'))).toBe(true)
    expect(prepared.some(({ spec }) => spec.tags.includes('no-step'))).toBe(true)
    expect(prepared.some(({ oracle }) => oracle.observed?.success === false)).toBe(true)
  })

  it('locks no-step and forced-condition RNG cursor consumption', () => {
    const byId = new Map(prepared.map((entry) => [entry.spec.caseId, entry]))
    expect(byId.get('specialist-careful-observation-no-step-reroll')?.oracle).toMatchObject({
      cursorBefore: { condition: 2, success: 3 },
      cursorAfter: { condition: 3, success: 3 },
    })
    expect(byId.get('specialist-heart-and-soul-no-step-no-reroll')?.oracle).toMatchObject({
      cursorBefore: { condition: 1, success: 2 },
      cursorAfter: { condition: 1, success: 2 },
    })
    expect(byId.get('good-omen-forced-next-good')?.oracle).toMatchObject({
      observed: { success: true, nextCondition: 'good' },
      cursorBefore: { condition: 4, success: 5 },
      cursorAfter: { condition: 4, success: 6 },
    })
    expect(byId.get('robust-halves-durability-and-forces-sturdy')?.oracle).toMatchObject({
      preview: { durabilityCost: 5 },
      observed: { success: true, nextCondition: 'sturdy' },
      nextState: { condition: 'sturdy', durability: 25 },
      cursorBefore: { condition: 6, success: 7 },
      cursorAfter: { condition: 6, success: 8 },
    })
    expect(byId.get('normal-simulated-success-and-condition')?.oracle).toMatchObject({
      cursorBefore: { condition: 3, success: 1 },
      cursorAfter: { condition: 4, success: 2 },
    })
  })

  it('directly executes every supported action in an apply or simulate case', () => {
    const directlyExecutedActions = prepared
      .filter(({ spec }) => spec.command !== 'preview')
      .map(({ spec }) => spec.action)

    expect(new Set(directlyExecutedActions)).toEqual(new Set(ACTION_IDS))
  })

  it('encodes one complete, versioned TSV row per case with fixed command arity', () => {
    for (const entry of prepared) {
      const cells = encodeNativeTransitionInput(entry).split('\t')
      expect(cells[0]).toBe(NATIVE_TRANSITION_BATCH_VERSION)
      expect(cells[1]).toBe(entry.spec.caseId)
      expect(cells[2]).toBe(entry.spec.command)
      expect(cells).toHaveLength(
        entry.spec.command === 'preview' ? 44 : entry.spec.command === 'apply' ? 46 : 56,
      )
    }
    const batch = encodeNativeTransitionBatch(prepared)
    expect(batch.endsWith('\n')).toBe(true)
    expect(batch.trimEnd().split('\n')).toHaveLength(prepared.length)
  })

  it('locks the full TS preview, transition, cursor, and terminal oracle payload', () => {
    expect(nativeTransitionOracleHash(prepared)).toBe(
      '36c069007a9c0517e80ecc868f7b8086381270c13bf13f061e5bc20034555c66',
    )
  })
})
