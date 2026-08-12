import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import type { CraftObjective, CrafterProfile, RecipeProfile } from '@frozen-rabbit-expert/domain'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_POLICY_VERSION,
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  SOLVER_POLICY_VERSION,
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
} from '@frozen-rabbit-expert/solver'

export interface CraftScenarioDefinition {
  scenarioId: string
  recipe: RecipeProfile
  objective: CraftObjective
  planner: {
    kind: 'guide-integrated'
    policyVersion: GuideIntegratedPolicyVersion
    fallbackPolicyVersion: string
    config: Readonly<GuideIntegratedPolicyConfig>
  }
  pilotCrafter: Readonly<Pick<
    CrafterProfile,
    'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'
  >>
}

const PILOT_CRAFTER = {
  craftsmanship: 5428,
  control: 5257,
  maxCp: 764,
  cosmicToolGoodBonus: true,
  specialist: true,
} as const

export const CRAFT_SCENARIOS = [
  {
    scenarioId: 'cosmotized-ilmenite-ingot',
    recipe: COSMIC_TITANIUM_INGOT,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
    planner: {
      kind: 'guide-integrated',
      policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
      fallbackPolicyVersion: SOLVER_POLICY_VERSION,
      config: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
    },
    pilotCrafter: PILOT_CRAFTER,
  },
  {
    scenarioId: 'cosmotized-ilmenite-nails',
    recipe: COSMIC_TITANIUM_NAILS,
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    planner: {
      kind: 'guide-integrated',
      policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
      fallbackPolicyVersion: SOLVER_POLICY_VERSION,
      config: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
    },
    pilotCrafter: PILOT_CRAFTER,
  },
] as const satisfies readonly CraftScenarioDefinition[]

export type CraftScenarioId = (typeof CRAFT_SCENARIOS)[number]['scenarioId']

export const DEFAULT_CRAFT_SCENARIO_ID: CraftScenarioId = 'cosmotized-ilmenite-ingot'

export function craftScenarioById(id: string): CraftScenarioDefinition | null {
  return CRAFT_SCENARIOS.find((scenario) => scenario.scenarioId === id) ?? null
}

export function craftScenarioByRecipeProfileId(profileId: string): CraftScenarioDefinition | null {
  return CRAFT_SCENARIOS.find((scenario) => scenario.recipe.profileId === profileId) ?? null
}
