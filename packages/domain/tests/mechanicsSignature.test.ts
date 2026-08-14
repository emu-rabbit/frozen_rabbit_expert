import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  MOBILE_WORK_STAIRS,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_MECHANICS_VERSION,
  calculateRecipeCrafterMechanicsSignature,
  calculateBaseQuality,
  recipeCrafterMechanicsSignatureKey,
  type CrafterProfile,
  type RecipeProfile,
} from '../src'

function sameFlooredQualityWithDifferentControl(
  recipe: Readonly<RecipeProfile>,
  crafter: Readonly<CrafterProfile>,
): CrafterProfile {
  const expected = Math.floor(calculateBaseQuality(recipe, crafter))
  for (let offset = 1; offset <= 100; offset += 1) {
    for (const direction of [-1, 1] as const) {
      const control = crafter.control + offset * direction
      if (control <= 0) continue
      const candidate = { ...crafter, control }
      if (Math.floor(calculateBaseQuality(recipe, candidate)) === expected) return candidate
    }
  }
  throw new Error('test recipe did not expose a nearby quality rounding equivalent')
}

describe('recipe crafter mechanics signature', () => {
  it('binds every equivalence key to the canonical mechanics model version', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[1]!.crafter
    const signature = calculateRecipeCrafterMechanicsSignature(MOBILE_WORK_STAIRS, crafter)

    expect(signature.mechanicsModelVersion).toBe(CRAFT_MECHANICS_VERSION)
    expect(recipeCrafterMechanicsSignatureKey(MOBILE_WORK_STAIRS, crafter))
      .toContain(`mechanics=${CRAFT_MECHANICS_VERSION}`)
  })

  it('groups different raw stats only when their discrete mechanics inputs match', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[1]!.crafter
    const equivalent = sameFlooredQualityWithDifferentControl(MOBILE_WORK_STAIRS, crafter)

    expect(equivalent.control).not.toBe(crafter.control)
    expect(recipeCrafterMechanicsSignatureKey(MOBILE_WORK_STAIRS, equivalent))
      .toBe(recipeCrafterMechanicsSignatureKey(MOBILE_WORK_STAIRS, crafter))
  })

  it('keeps a scoped empirical correction out of an otherwise equal base-gain bucket', () => {
    const corrected = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const uncorrected = sameFlooredQualityWithDifferentControl(COSMIC_TITANIUM_INGOT, corrected)

    expect(recipeCrafterMechanicsSignatureKey(COSMIC_TITANIUM_INGOT, uncorrected))
      .not.toBe(recipeCrafterMechanicsSignatureKey(COSMIC_TITANIUM_INGOT, corrected))
  })
})
