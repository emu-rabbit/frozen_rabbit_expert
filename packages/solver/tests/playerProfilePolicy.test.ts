import { describe, expect, it } from 'vitest'
import { PLAYER_EQUIPMENT_PROFILES } from '@frozen-rabbit-expert/data'
import {
  resolveGuideScenarioPolicyBinding,
  resolvePlayerProfilePolicyConfig,
} from '../src'

const exactFoodMedicine = PLAYER_EQUIPMENT_PROFILES[1]!.crafter

describe('exact player profile policy routing', () => {
  it.each([99, 101])(
    'does not route level %i stats through the level-100 nails override',
    (level) => {
      const base = resolveGuideScenarioPolicyBinding('cosmotized-ilmenite-nails').config
      expect(resolvePlayerProfilePolicyConfig(
        'cosmotized-ilmenite-nails',
        { ...exactFoodMedicine, level },
      )).toBe(base)
    },
  )

  it.each([99, 101])(
    'does not route level %i stats through the level-100 stairs override',
    (level) => {
      const base = resolveGuideScenarioPolicyBinding('mobile-work-stairs').config
      expect(resolvePlayerProfilePolicyConfig(
        'mobile-work-stairs',
        { ...exactFoodMedicine, level },
      )).toBe(base)
    },
  )

  it('still routes the exact level-100 food-and-medicine profile', () => {
    expect(resolvePlayerProfilePolicyConfig(
      'cosmotized-ilmenite-nails',
      exactFoodMedicine,
    )).toMatchObject({
      progressFloorBeforeQuality: 0.75,
      greatStridesQuality: 0.70,
    })
    expect(resolvePlayerProfilePolicyConfig(
      'mobile-work-stairs',
      exactFoodMedicine,
    )).toMatchObject({
      adaptiveByregotCashoutCpCeiling: 100,
      adaptiveByregotMinimumProjectedQualityRatio: 0.75,
    })
  })
})
