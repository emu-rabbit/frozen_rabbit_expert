import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CrafterProfile,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '../src'

const nonSpecialist: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

const specialist: CrafterProfile = {
  ...nonSpecialist,
  specialist: true,
}

function state(patch: Partial<CraftState> = {}): CraftState {
  return { ...createInitialCraftState(COSMIC_TITANIUM_INGOT, specialist), ...patch }
}

function use(
  current: CraftState,
  action: CraftActionId,
  nextCondition: MaterialCondition = current.condition,
): CraftState {
  return applyObservedOutcome(
    COSMIC_TITANIUM_INGOT,
    specialist,
    current,
    action,
    { success: true, nextCondition },
  ).nextState
}

describe('specialist action availability', () => {
  it('initializes per-craft caps only for specialists', () => {
    expect(createInitialCraftState(COSMIC_TITANIUM_INGOT, specialist)).toMatchObject({
      carefulObservationUsesLeft: 3,
      heartAndSoulAvailable: true,
      heartAndSoulActive: false,
      quickInnovationAvailable: true,
    })
    expect(createInitialCraftState(COSMIC_TITANIUM_INGOT, nonSpecialist)).toMatchObject({
      carefulObservationUsesLeft: 0,
      heartAndSoulAvailable: false,
      heartAndSoulActive: false,
      quickInnovationAvailable: false,
    })
  })

  it.each(['carefulObservation', 'heartAndSoul', 'quickInnovation'] as const)(
    'rejects %s for non-specialists',
    (action) => {
      const preview = previewAction(
        COSMIC_TITANIUM_INGOT,
        nonSpecialist,
        createInitialCraftState(COSMIC_TITANIUM_INGOT, nonSpecialist),
        action,
      )
      expect(preview.legal).toBe(false)
      expect(preview.reason).toBe('specialist')
    },
  )
})

describe('Careful Observation', () => {
  it('rerolls condition without advancing step, spending resources, or ticking state', () => {
    let current = state({
      step: 8,
      condition: 'normal',
      comboFrom: 'observe',
    })
    current.buffs.innovation = 2
    current.buffs.manipulation = 4
    const startingBuffs = { ...current.buffs }

    current = use(current, 'carefulObservation', 'good')
    expect(current).toMatchObject({
      step: 8,
      condition: 'good',
      cp: specialist.maxCp,
      durability: COSMIC_TITANIUM_INGOT.durabilityMax,
      comboFrom: 'observe',
      carefulObservationUsesLeft: 2,
    })
    expect(current.buffs).toEqual(startingBuffs)

    current = use(current, 'carefulObservation', 'centered')
    current = use(current, 'carefulObservation', 'sturdy')
    expect(current.carefulObservationUsesLeft).toBe(0)
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'carefulObservation')).toMatchObject({
      legal: false,
      reason: 'careful-observation-exhausted',
    })
  })
})

describe('Heart and Soul', () => {
  it('unlocks all three condition actions and is consumed by the first one used off Good', () => {
    let current = state({ step: 6, condition: 'normal', comboFrom: 'observe' })
    for (const action of ['preciseTouch', 'intensiveSynthesis', 'tricksOfTheTrade'] as const) {
      expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, action).reason).toBe('condition')
    }

    current = use(current, 'heartAndSoul', 'malleable')
    expect(current).toMatchObject({
      step: 6,
      condition: 'normal',
      comboFrom: 'observe',
      heartAndSoulAvailable: false,
      heartAndSoulActive: true,
    })
    for (const action of ['preciseTouch', 'intensiveSynthesis', 'tricksOfTheTrade'] as const) {
      expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, action).legal).toBe(true)
    }

    current = use(current, 'basicTouch', 'centered')
    expect(current.heartAndSoulActive).toBe(true)

    current = use(current, 'preciseTouch', 'centered')
    expect(current.heartAndSoulActive).toBe(false)
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'intensiveSynthesis')).toMatchObject({
      legal: false,
      reason: 'condition',
    })
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'heartAndSoul')).toMatchObject({
      legal: false,
      reason: 'heart-and-soul-unavailable',
    })
  })

  it('stays active when a target action is used on Good', () => {
    let current = use(state({ condition: 'good' }), 'heartAndSoul', 'normal')
    expect(current.condition).toBe('good')

    current = use(current, 'tricksOfTheTrade', 'normal')
    expect(current.heartAndSoulActive).toBe(true)
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'preciseTouch').legal).toBe(true)
  })
})

describe('Quick Innovation', () => {
  it('grants one preserved Innovation turn and can only be used once', () => {
    let current = state({ step: 7, condition: 'normal', comboFrom: 'observe' })
    current.buffs.manipulation = 3
    const unbuffedGain = previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'basicTouch').qualityGain

    current = use(current, 'quickInnovation', 'good')
    expect(current).toMatchObject({
      step: 7,
      condition: 'normal',
      comboFrom: 'observe',
      quickInnovationAvailable: false,
    })
    expect(current.buffs).toMatchObject({ innovation: 1, manipulation: 3 })
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'quickInnovation')).toMatchObject({
      legal: false,
      reason: 'innovation-active',
    })
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'basicTouch').qualityGain)
      .toBeGreaterThan(unbuffedGain)

    current = use(current, 'basicTouch', 'normal')
    expect(current.buffs.innovation).toBe(0)
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'quickInnovation')).toMatchObject({
      legal: false,
      reason: 'quick-innovation-unavailable',
    })
  })

  it('is unavailable while an existing Innovation is active', () => {
    const current = state()
    current.buffs.innovation = 2
    expect(previewAction(COSMIC_TITANIUM_INGOT, specialist, current, 'quickInnovation')).toMatchObject({
      legal: false,
      reason: 'innovation-active',
    })
  })
})
