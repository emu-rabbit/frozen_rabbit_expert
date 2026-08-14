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
  SURVEY_CRAFTSMANS_COMMAND_BREW_PROVISIONAL_800_POINT_QUALITY,
} from '../src'

const supported = CRAFT_SCENARIO_DATA.map(({ recipe, objective }) => [recipe, objective] as const)

describe('supported recipe data contracts', () => {
  it('keeps identities unique and every objective attached to its recipe', () => {
    expect(new Set(supported.map(([recipe]) => recipe.profileId)).size).toBe(supported.length)
    expect(new Set(supported.map(([recipe]) => recipe.canonicalRecipeId)).size).toBe(supported.length)
    expect(new Set(supported.map(([recipe]) => recipe.canonicalItemId)).size).toBe(supported.length)

    for (const [recipe, objective] of supported) {
      expect(objective.recipeProfileId).toBe(recipe.profileId)
      expect(objective.qualityTarget).toBeGreaterThanOrEqual(recipe.requiredQuality)
      expect(objective.qualityTarget).toBeLessThanOrEqual(recipe.qualityMax)
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
      expect(objective.qualityTarget).toBeGreaterThan(0)
    }

    expect(COSMIC_TITANIUM_INGOT_OBJECTIVE.qualityTarget).toBe(COSMIC_TITANIUM_INGOT.requiredQuality)
    expect(HARDENED_SURVEY_PLANK_OBJECTIVE.qualityTarget).toBe(HARDENED_SURVEY_PLANK.requiredQuality)
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
    expect(SURVEY_CRAFTSMANS_COMMAND_BREW_PROVISIONAL_800_POINT_QUALITY).toBeGreaterThan(10_200)
    expect(SURVEY_CRAFTSMANS_COMMAND_BREW_PROVISIONAL_800_POINT_QUALITY)
      .toBeLessThan(SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.qualityTarget)
    expect(SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.source.confidence).toBe('provisional')
  })
})
