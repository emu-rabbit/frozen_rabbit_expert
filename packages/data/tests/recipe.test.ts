import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '../src'

describe('Cosmotized Ilmenite Ingot game-data profile', () => {
  it('preserves the canonical identity and recipe values', () => {
    expect(COSMIC_TITANIUM_INGOT).toMatchObject({
      progressRequired: 7300,
      durabilityMax: 30,
      qualityMax: 18900,
      requiredQuality: 18900,
      canonicalRecipeId: 36282,
      canonicalItemId: 48360,
      identityConfidence: 'verified',
      recipeLevel: 746,
      progressDivider: 180,
      qualityDivider: 180,
      progressModifier: 100,
      qualityModifier: 100,
    })
  })

  it('declares manual condition selection instead of a random profile', () => {
    expect(COSMIC_TITANIUM_INGOT.conditionProfileId).toBe('manual-condition-selection-v1')
  })
})

describe('Cosmotized Ilmenite Nails game-data profile', () => {
  it('preserves the canonical identity and independently verified recipe values', () => {
    expect(COSMIC_TITANIUM_NAILS).toMatchObject({
      progressRequired: 10000,
      durabilityMax: 55,
      qualityMax: 27400,
      requiredQuality: 0,
      canonicalRecipeId: 36283,
      canonicalItemId: 48361,
      identityConfidence: 'verified',
      recipeLevel: 746,
      progressDivider: 180,
      qualityDivider: 180,
      progressModifier: 100,
      qualityModifier: 100,
    })
  })

  it('keeps mechanics completion separate from the score-maximizing objective', () => {
    expect(COSMIC_TITANIUM_NAILS.requiredQuality).toBe(0)
    expect(COSMIC_TITANIUM_NAILS_OBJECTIVE).toMatchObject({
      recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
      mode: 'maximize-quality-with-safe-completion',
      qualityTarget: 27100,
    })
    expect(COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers.map((tier) => tier.minimumQuality))
      .toEqual([16440, 19180, 24660, 27100])
  })
})
