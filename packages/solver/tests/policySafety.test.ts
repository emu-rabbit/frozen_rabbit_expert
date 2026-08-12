import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CrafterProfile, type CraftState } from '@frozen-rabbit-expert/domain'
import { canSpendObserveOnConditionFishing, policySafetyVetoReason } from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 722,
  cosmicToolGoodBonus: true,
}

function state(patch: Partial<CraftState>): CraftState {
  return { ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter), ...patch }
}

describe('policy catastrophic safety', () => {
  it('allows funded repeated condition fishing but rejects an unfunded loop', () => {
    const observed = state({
      step: 31,
      progress: 6447,
      quality: 10032,
      durability: 30,
      cp: 89,
      innerQuiet: 10,
      condition: 'pliant',
      comboFrom: 'observe',
      buffs: {
        ...state({}).buffs,
        greatStrides: 1,
        innovation: 3,
      },
    })
    expect(canSpendObserveOnConditionFishing(COSMIC_TITANIUM_INGOT, crafter, observed)).toBe(true)
    expect(policySafetyVetoReason(COSMIC_TITANIUM_INGOT, crafter, observed, 'observe')).toBeNull()

    const underfunded = { ...observed, cp: 60 }
    expect(canSpendObserveOnConditionFishing(COSMIC_TITANIUM_INGOT, crafter, underfunded)).toBe(false)
    expect(policySafetyVetoReason(COSMIC_TITANIUM_INGOT, crafter, underfunded, 'observe'))
      .toBe('unfunded-condition-fishing')
    expect(policySafetyVetoReason(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...underfunded, comboFrom: null },
      'observe',
    )).toBeNull()
  })

  it('leaves recoverable buff refresh timing to full-route evaluation', () => {
    const lastTurn = state({
      step: 20,
      progress: 6447,
      quality: 5000,
      durability: 25,
      cp: 300,
      buffs: { ...state({}).buffs, innovation: 1 },
    })
    expect(policySafetyVetoReason(COSMIC_TITANIUM_INGOT, crafter, lastTurn, 'innovation')).toBeNull()
    expect(policySafetyVetoReason(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...lastTurn, buffs: { ...lastTurn.buffs, innovation: 2 } },
      'innovation',
    )).toBeNull()
  })

  it('still rejects illegal, premature-completion, and immediate durability failures', () => {
    expect(policySafetyVetoReason(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ cp: 0 }),
      'innovation',
    )).toBe('illegal-action')
    expect(policySafetyVetoReason(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ step: 20, progress: 7000, quality: 18000, durability: 20, cp: 100 }),
      'carefulSynthesis',
    )).toBe('premature-completion')
    expect(policySafetyVetoReason(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ step: 20, progress: 6000, quality: 10000, durability: 10, cp: 100 }),
      'basicTouch',
    )).toBe('durability-failure')
  })

  it('rejects only the active no-step Final Appraisal self-loop', () => {
    const inactive = state({ step: 10, cp: 300 })
    expect(policySafetyVetoReason(COSMIC_TITANIUM_INGOT, crafter, inactive, 'finalAppraisal')).toBeNull()
    expect(policySafetyVetoReason(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...inactive, buffs: { ...inactive.buffs, finalAppraisal: 5 } },
      'finalAppraisal',
    )).toBe('non-advancing-loop')
    expect(policySafetyVetoReason(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...inactive, buffs: { ...inactive.buffs, innovation: 3 } },
      'innovation',
    )).toBeNull()
  })
})
