import type { CrafterProfile } from '@frozen-rabbit-expert/domain'
import type { GuideIntegratedPolicyConfig } from './guideIntegratedPolicy'
import {
  resolveGuideScenarioPolicyBinding,
  type GuideScenarioPolicyId,
} from './guideScenarioPolicyRegistry'

export type PlayerScenarioPolicyId = GuideScenarioPolicyId

function matchesExactFoodMedicineProfile(crafter: CrafterProfile): boolean {
  return crafter.level === 100
    && crafter.craftsmanship === 5408
    && crafter.control === 5237
    && crafter.maxCp === 749
    && crafter.cosmicToolGoodBonus === true
    && crafter.specialist !== true
}

export function resolvePlayerProfilePolicyConfig(
  scenarioId: PlayerScenarioPolicyId,
  crafter: CrafterProfile,
): Readonly<GuideIntegratedPolicyConfig> {
  const baseConfig = resolveGuideScenarioPolicyBinding(scenarioId).config
  if (scenarioId === 'cosmotized-ilmenite-nails' && matchesExactFoodMedicineProfile(crafter)) {
    return {
      ...baseConfig,
      progressFloorBeforeQuality: 0.75,
      greatStridesQuality: 0.70,
    }
  }
  if (scenarioId === 'mobile-work-stairs' && matchesExactFoodMedicineProfile(crafter)) {
    return {
      ...baseConfig,
      allowSpecialistActions: false,
      adaptiveByregotCashoutCpCeiling: 100,
      adaptiveByregotMinimumProjectedQualityRatio: 0.75,
      adaptiveGoodQualityExtensionActionBudget: 36,
      adaptiveGoodQualityExtensionActionFloor: 30,
      consumeMalleableBeforeVeneration: true,
    }
  }
  return baseConfig
}
