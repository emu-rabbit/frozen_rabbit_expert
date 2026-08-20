import {
  PLAYER_EQUIPMENT_PROFILES,
  craftScenarioDataById,
} from '@frozen-rabbit-expert/data'
import {
  recipeCrafterMechanicsSignatureKey,
  type CraftObjective,
  type CrafterProfile,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  resolveGuideScenarioPolicyBinding,
  resolvePlayerProfilePolicyConfig,
  SOLVER_POLICY_VERSION,
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
  type GuideScenarioPolicyId,
  type PolicyCoverage,
} from '@frozen-rabbit-expert/solver'

export const WEB_GUIDE_PLANNER_TIMEOUT_MS = 3_000

type EquipmentProfile = Readonly<Pick<
  CrafterProfile,
  'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'
>>

export interface CraftScenarioDefinition {
  scenarioId: GuideScenarioPolicyId
  recipe: RecipeProfile
  objective: CraftObjective
  itemIconFileName: string
  missionLabel: string
  planner: {
    kind: 'guide-integrated'
    policyVersion: GuideIntegratedPolicyVersion
    fallbackPolicyVersion: string
    config: Readonly<GuideIntegratedPolicyConfig>
  }
  pilotCrafter: EquipmentProfile
  developmentEquipmentProfiles: readonly EquipmentProfile[]
}

const USER_EQUIPMENT_PROFILES = PLAYER_EQUIPMENT_PROFILES.map(({ crafter }) => crafter)
const UNBUFFED_PILOT_CRAFTER = USER_EQUIPMENT_PROFILES[0]!
const FOOD_MEDICINE_PILOT_CRAFTER = USER_EQUIPMENT_PROFILES[1]!
const SPECIALIST_PILOT_CRAFTER = USER_EQUIPMENT_PROFILES[2]!

const NON_SPECIALIST_EQUIPMENT_PROFILES = [
  { craftsmanship: 5380, control: 5200, maxCp: 720, cosmicToolGoodBonus: false, specialist: false },
  { craftsmanship: 5380, control: 5200, maxCp: 720, cosmicToolGoodBonus: true, specialist: false },
  { craftsmanship: 5408, control: 5237, maxCp: 749, cosmicToolGoodBonus: false, specialist: false },
  { craftsmanship: 5408, control: 5237, maxCp: 749, cosmicToolGoodBonus: true, specialist: false },
  { craftsmanship: 5450, control: 5300, maxCp: 780, cosmicToolGoodBonus: false, specialist: false },
  { craftsmanship: 5450, control: 5300, maxCp: 780, cosmicToolGoodBonus: true, specialist: false },
] as const

function guidePlanner(scenarioId: GuideScenarioPolicyId): CraftScenarioDefinition['planner'] {
  return {
    kind: 'guide-integrated',
    ...resolveGuideScenarioPolicyBinding(scenarioId),
    fallbackPolicyVersion: SOLVER_POLICY_VERSION,
  }
}

export const CRAFT_SCENARIOS = [
  {
    ...craftScenarioDataById('cosmotized-ilmenite-ingot')!,
    itemIconFileName: 'cosmotized-ilmenite-ingot.png',
    missionLabel: '【高難＋】續・製作特殊裝備所需的材料',
    planner: guidePlanner('cosmotized-ilmenite-ingot'),
    pilotCrafter: SPECIALIST_PILOT_CRAFTER,
    developmentEquipmentProfiles: USER_EQUIPMENT_PROFILES,
  },
  {
    ...craftScenarioDataById('cosmotized-ilmenite-nails')!,
    itemIconFileName: 'cosmotized-ilmenite-nails.png',
    missionLabel: '【高難＋】製作特殊裝備',
    planner: guidePlanner('cosmotized-ilmenite-nails'),
    pilotCrafter: SPECIALIST_PILOT_CRAFTER,
    developmentEquipmentProfiles: USER_EQUIPMENT_PROFILES,
  },
  {
    ...craftScenarioDataById('hardened-survey-plank')!,
    itemIconFileName: 'hardened-survey-plank.png',
    missionLabel: '【高難＋】製作高空作業所需的腳手架',
    planner: guidePlanner('hardened-survey-plank'),
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      ...NON_SPECIALIST_EQUIPMENT_PROFILES,
      UNBUFFED_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
  },
  {
    ...craftScenarioDataById('mobile-work-stairs')!,
    itemIconFileName: 'mobile-work-stairs.png',
    missionLabel: '【高難＋】製作高空作業所需的腳手架',
    planner: guidePlanner('mobile-work-stairs'),
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      ...NON_SPECIALIST_EQUIPMENT_PROFILES,
      UNBUFFED_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
  },
  {
    ...craftScenarioDataById('survey-craftsmans-command-brew')!,
    itemIconFileName: 'survey-craftsmans-command-brew.png',
    missionLabel: '【高難】製作工匠所需的複方藥',
    planner: guidePlanner('survey-craftsmans-command-brew'),
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      FOOD_MEDICINE_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
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

/**
 * Exact-profile development router. Recipe defaults remain the conservative
 * fallback for nearby/OOD stats; only a fully matched evaluated profile may
 * receive a profile-owned override.
 */
export function plannerConfigForCrafter(
  scenario: CraftScenarioDefinition,
  crafter: CrafterProfile,
): Readonly<GuideIntegratedPolicyConfig> {
  return resolvePlayerProfilePolicyConfig(
    scenario.scenarioId,
    crafter,
  )
}

export function policyCoverageForCrafter(
  scenario: CraftScenarioDefinition,
  crafter: CrafterProfile,
): PolicyCoverage {
  const signature = recipeCrafterMechanicsSignatureKey(scenario.recipe, crafter)
  const coveredSignature = scenario.developmentEquipmentProfiles.some((profile) => (
    recipeCrafterMechanicsSignatureKey(scenario.recipe, { level: crafter.level, ...profile })
      === signature
  ))
  return coveredSignature ? 'near-boundary' : 'out-of-distribution'
}
