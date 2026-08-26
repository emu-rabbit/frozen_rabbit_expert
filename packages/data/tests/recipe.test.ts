import { describe, expect, it } from 'vitest'
import {
  CRAFT_SCENARIO_DATA,
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  HARDENED_SURVEY_PLANK,
  HARDENED_SURVEY_PLANK_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '../src'

const supported = CRAFT_SCENARIO_DATA.map(({ recipe, objective }) => [recipe, objective] as const)

describe('supported recipe data contracts', () => {
  it('keeps identities unique and every objective attached to its recipe', () => {
    expect(new Set(supported.map(([recipe]) => recipe.profileId)).size).toBe(supported.length)
    expect(new Set(supported.map(([recipe]) => recipe.canonicalRecipeId)).size).toBe(supported.length)
    expect(new Set(supported.map(([recipe]) => recipe.canonicalItemId)).size).toBe(supported.length)

    for (const [recipe, objective] of supported) {
      expect(objective.recipeProfileId).toBe(recipe.profileId)
      expect(objective.qualityTiers.at(-1)?.minimumQuality ?? recipe.qualityMax)
        .toBe(recipe.qualityMax)
      expect(recipe.availableConditions[0]).toBe('normal')
      expect(new Set(recipe.availableConditions).size).toBe(recipe.availableConditions.length)
      expect(recipe.source.sourceRevision).toBeTruthy()
    }
  })

  it('does not turn voluntary score or HQ goals into mechanics failure requirements', () => {
    for (const [recipe, objective] of [
      [COSMIC_TITANIUM_NAILS, COSMIC_TITANIUM_NAILS_OBJECTIVE],
      [MOBILE_WORK_STAIRS, MOBILE_WORK_STAIRS_OBJECTIVE],
      [SURVEY_CRAFTSMANS_COMMAND_BREW, SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE],
    ] as const) {
      expect(recipe.requiredQuality).toBe(0)
      expect(objective.mode).toBe('maximize-quality-with-safe-completion')
      expect(recipe.qualityMax).toBeGreaterThan(0)
    }

    expect(COSMIC_TITANIUM_INGOT_OBJECTIVE.qualityTiers.at(-1)?.minimumQuality)
      .toBe(COSMIC_TITANIUM_INGOT.qualityMax)
    expect(HARDENED_SURVEY_PLANK_OBJECTIVE.qualityTiers.at(-1)?.minimumQuality)
      .toBe(HARDENED_SURVEY_PLANK.qualityMax)
    expect(MOBILE_WORK_STAIRS_OBJECTIVE.qualityTiers).toEqual([])
  })

  it('keeps collectability tiers internally consistent without claiming an unverified point formula', () => {
    for (const objective of [
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    ]) {
      for (const tier of objective.qualityTiers) {
        expect(tier.minimumQuality).toBe(tier.minimumCollectability * 10)
      }
    }
    expect(SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.qualityTiers.map((tier) => tier.minimumQuality))
      .toEqual([6_000, 7_200, 10_200, 12_000])
    expect(SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.source.confidence).toBe('verified')
  })
})
