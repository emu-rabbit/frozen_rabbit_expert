import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '../src'

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
