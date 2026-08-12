import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT, COSMIC_TITANIUM_NAILS, HARDENED_SURVEY_PLANK } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  assertCraftState,
  createInitialCraftState,
  previewAction,
  type CrafterProfile,
  type CraftState,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5380,
  control: 5000,
  maxCp: 620,
  cosmicToolGoodBonus: false,
}

function state(patch: Partial<CraftState> = {}): CraftState {
  return { ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter), ...patch }
}

describe('action preview', () => {
  it('uses ceil for Pliant CP cost', () => {
    const preview = previewAction(COSMIC_TITANIUM_INGOT, crafter, state({ condition: 'pliant' }), 'carefulSynthesis')
    expect(preview.cpCost).toBe(4)
  })

  it('stacks Sturdy and Waste Not before rounding durability', () => {
    const current = state({ condition: 'sturdy' })
    current.buffs.wasteNot = 2
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, current, 'basicTouch').durabilityCost).toBe(3)
  })

  it('adds Centered success rate and clamps at 100%', () => {
    const current = state({ condition: 'centered' })
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, current, 'rapidSynthesis').successRate).toBe(0.75)
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, current, 'basicSynthesis').successRate).toBe(1)
  })

  it('applies Malleable to progress gain', () => {
    const normal = previewAction(COSMIC_TITANIUM_INGOT, crafter, state(), 'basicSynthesis')
    const malleable = previewAction(COSMIC_TITANIUM_INGOT, crafter, state({ condition: 'malleable' }), 'basicSynthesis')
    expect(normal.progressGain).toBe(360)
    expect(malleable.progressGain).toBe(540)
  })
})

describe('observed transition', () => {
  it('forces Good on the next advancing step after Good Omen', () => {
    const current = { ...createInitialCraftState(HARDENED_SURVEY_PLANK, crafter), condition: 'goodOmen' as const }
    const result = applyObservedOutcome(
      HARDENED_SURVEY_PLANK,
      crafter,
      current,
      'basicTouch',
      { success: true, nextCondition: 'primed' },
    )
    expect(result.nextState.condition).toBe('good')
  })

  it('extends action buffs by two steps on Primed', () => {
    const current = { ...createInitialCraftState(HARDENED_SURVEY_PLANK, crafter), condition: 'primed' as const }
    const result = applyObservedOutcome(
      HARDENED_SURVEY_PLANK,
      crafter,
      current,
      'innovation',
      { success: true, nextCondition: 'normal' },
    )
    expect(result.nextState.buffs.innovation).toBe(6)
  })

  it('does not add progress when a probabilistic action fails', () => {
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state(),
      'rapidSynthesis',
      { success: false, nextCondition: 'centered' },
    )
    expect(result.nextState.progress).toBe(0)
    expect(result.nextState.durability).toBe(20)
    expect(result.nextState.condition).toBe('centered')
  })

  it('applies Good quality and builds Inner Quiet', () => {
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ condition: 'good' }),
      'basicTouch',
      { success: true, nextCondition: 'normal' },
    )
    expect(result.nextState.quality).toBe(468)
    expect(result.nextState.innerQuiet).toBe(1)
    expect(result.nextState.cp).toBe(602)
  })

  it('uses the Cosmic tool 1.75x Good-condition quality bonus', () => {
    const cosmicCrafter = { ...crafter, cosmicToolGoodBonus: true }
    const preview = previewAction(COSMIC_TITANIUM_INGOT, cosmicCrafter, state({ condition: 'good' }), 'basicTouch')
    expect(preview.qualityGain).toBe(546)
  })

  it('fails the craft when durability reaches zero before completion', () => {
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ durability: 10 }),
      'basicTouch',
      { success: true, nextCondition: 'normal' },
    )
    expect(result.nextState.terminal).toBe('failed')
    expect(() => assertCraftState(COSMIC_TITANIUM_INGOT, crafter, result.nextState)).not.toThrow()
  })

  it('lets completion win when progress and durability hit their boundaries together', () => {
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ progress: 7000, quality: 18900, durability: 10 }),
      'basicSynthesis',
      { success: true, nextCondition: 'normal' },
    )
    expect(result.nextState.progress).toBe(7300)
    expect(result.nextState.terminal).toBe('completed')
  })

  it('fails when progress completes before the mandatory quality target', () => {
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ progress: 7000, quality: 18899, durability: 10 }),
      'basicSynthesis',
      { success: true, nextCondition: 'normal' },
    )
    expect(result.nextState.terminal).toBe('failed')
    expect(result.nextState.failureReason).toBe('required-quality')
  })

  it('completes the nails when progress finishes even below the policy quality target', () => {
    const nailsState = {
      ...createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
      progress: 9900,
      quality: 12000,
      durability: 10,
    }
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      nailsState,
      'basicSynthesis',
      { success: true, nextCondition: 'normal' },
    )
    expect(result.nextState).toMatchObject({
      progress: 10000,
      quality: 12000,
      terminal: 'completed',
      failureReason: null,
    })
  })

  it('rejects an incoherent resynced terminal state', () => {
    expect(() => assertCraftState(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state({ durability: 0, terminal: 'none' }),
    )).toThrow(/Non-terminal/)
  })

  it('leaves one progress point and consumes Final Appraisal', () => {
    const current = state({ progress: 7000 })
    current.buffs.finalAppraisal = 2
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      current,
      'basicSynthesis',
      { success: true, nextCondition: 'normal' },
    )
    expect(result.nextState.progress).toBe(7299)
    expect(result.nextState.buffs.finalAppraisal).toBe(0)
    expect(result.nextState.terminal).toBe('none')
  })

  it('keeps Final Appraisal on the same step and condition', () => {
    const current = state({ step: 9, condition: 'centered', comboFrom: 'observe' })
    current.buffs.innovation = 2
    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      current,
      'finalAppraisal',
      { success: true, nextCondition: 'good' },
    )

    expect(result.nextState).toMatchObject({
      step: 9,
      condition: 'centered',
      comboFrom: 'observe',
    })
    expect(result.nextState.buffs).toMatchObject({ innovation: 2, finalAppraisal: 5 })
  })
})

describe('Teamcraft formula parity fixture', () => {
  it('matches the Teamcraft basic synthesis fixture at recipe level 740', () => {
    const recipe = {
      ...COSMIC_TITANIUM_INGOT,
      recipeLevel: 740,
      progressDivider: 170,
      progressModifier: 90,
      qualityDivider: 150,
      qualityModifier: 75,
    }
    const fixtureCrafter = { ...crafter, craftsmanship: 5406, control: 4662 }
    expect(previewAction(recipe, fixtureCrafter, state(), 'basicSynthesis').progressGain).toBe(345)
  })
})

describe('TW 7.51 empirical quality trace', () => {
  const twCrafter: CrafterProfile = {
    level: 100,
    craftsmanship: 5408,
    control: 5140,
    maxCp: 630,
    cosmicToolGoodBonus: true,
  }

  function advancedTouchState(): CraftState {
    const current = createInitialCraftState(COSMIC_TITANIUM_INGOT, twCrafter)
    current.step = 5
    current.quality = 1344
    current.durability = 15
    current.cp = 490
    current.innerQuiet = 3
    current.buffs.wasteNot = 7
    current.buffs.innovation = 4
    return current
  }

  it('matches the TW no-Innovation IQ2 and IQ3 forecasts', () => {
    const current = advancedTouchState()
    current.condition = 'pliant'
    current.buffs.innovation = 0
    current.innerQuiet = 2

    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'basicTouch').qualityGain).toBe(384)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'standardTouch').qualityGain).toBe(480)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'advancedTouch').qualityGain).toBe(576)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'preparatoryTouch').qualityGain).toBe(768)

    current.innerQuiet = 3
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'basicTouch').qualityGain).toBe(416)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'standardTouch').qualityGain).toBe(520)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'advancedTouch').qualityGain).toBe(624)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'preparatoryTouch').qualityGain).toBe(832)
  })

  it('matches the TW Cosmic Good IQ3 Innovation forecasts', () => {
    const current = advancedTouchState()
    current.condition = 'good'

    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'basicTouch').qualityGain).toBe(1092)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'standardTouch').qualityGain).toBe(1365)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'advancedTouch').qualityGain).toBe(1638)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'preciseTouch').qualityGain).toBe(1638)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'preparatoryTouch').qualityGain).toBe(2184)
  })

  it('matches the TW forecast and observed Advanced Touch gain of 935', () => {
    const current = advancedTouchState()
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'basicTouch').qualityGain).toBe(624)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'standardTouch').qualityGain).toBe(780)
    const preview = previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'advancedTouch')
    expect(preview.qualityGain).toBe(935)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'preparatoryTouch').qualityGain).toBe(1248)

    const result = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      twCrafter,
      current,
      'advancedTouch',
      { success: true, nextCondition: 'centered' },
    )
    expect(result.nextState.quality).toBe(2279)
    expect(result.nextState.innerQuiet).toBe(4)
  })

  it('matches the TW IQ4 Innovation forecast after Advanced Touch', () => {
    const current = advancedTouchState()
    current.innerQuiet = 4
    current.buffs.innovation = 3

    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'basicTouch').qualityGain).toBe(672)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'standardTouch').qualityGain).toBe(840)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'advancedTouch').qualityGain).toBe(1008)
    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'preparatoryTouch').qualityGain).toBe(1344)
  })

  it('matches the second-recipe forecast at base quality 407', () => {
    // The screenshot exposes base quality 407 through the IQ3 + Innovation
    // forecast values. Divider 138 is only a minimal test profile that yields
    // that observed base; it is not asserted as the unidentified recipe's data.
    const secondRecipe = {
      ...COSMIC_TITANIUM_INGOT,
      canonicalRecipeId: 0,
      profileId: 'tw-7.51-secondary-recipe-observation',
      qualityDivider: 138,
      qualityModifier: 100,
    }
    const current = advancedTouchState()

    expect(previewAction(secondRecipe, twCrafter, current, 'basicTouch').qualityGain).toBe(793)
    expect(previewAction(secondRecipe, twCrafter, current, 'standardTouch').qualityGain).toBe(992)
    expect(previewAction(secondRecipe, twCrafter, current, 'advancedTouch').qualityGain).toBe(1190)
    expect(previewAction(secondRecipe, twCrafter, current, 'preparatoryTouch').qualityGain).toBe(1587)
  })

  it('keeps the Cosmic Good multiplier outside the float32 efficiency ratio', () => {
    const current = advancedTouchState()
    current.condition = 'good'
    current.innerQuiet = 6

    expect(previewAction(COSMIC_TITANIUM_INGOT, twCrafter, current, 'basicTouch').qualityGain).toBe(1344)
  })
})
