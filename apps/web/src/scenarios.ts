import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  HARDENED_SURVEY_PLANK,
  HARDENED_SURVEY_PLANK_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import type { CraftObjective, CrafterProfile, RecipeProfile } from '@frozen-rabbit-expert/domain'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_POLICY_VERSION,
  HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
  MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  resolvePlayerProfilePolicyConfig,
  SOLVER_POLICY_VERSION,
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
  type PolicyCoverage,
} from '@frozen-rabbit-expert/solver'

export const WEB_GUIDE_PLANNER_TIMEOUT_MS = 3_000

type EquipmentProfile = Readonly<Pick<
  CrafterProfile,
  'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'
>>

export interface CraftScenarioDefinition {
  scenarioId: string
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

export const CRAFT_SCENARIOS = [
  {
    scenarioId: 'cosmotized-ilmenite-ingot',
    recipe: COSMIC_TITANIUM_INGOT,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
    itemIconFileName: 'cosmotized-ilmenite-ingot.png',
    missionLabel: '【高難＋】續・製作特殊裝備所需的材料',
    planner: {
      kind: 'guide-integrated',
      policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
      fallbackPolicyVersion: SOLVER_POLICY_VERSION,
      config: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
    },
    pilotCrafter: SPECIALIST_PILOT_CRAFTER,
    developmentEquipmentProfiles: USER_EQUIPMENT_PROFILES,
  },
  {
    scenarioId: 'cosmotized-ilmenite-nails',
    recipe: COSMIC_TITANIUM_NAILS,
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    itemIconFileName: 'cosmotized-ilmenite-nails.png',
    missionLabel: '【高難＋】製作特殊裝備',
    planner: {
      kind: 'guide-integrated',
      policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
      fallbackPolicyVersion: SOLVER_POLICY_VERSION,
      config: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
    },
    pilotCrafter: SPECIALIST_PILOT_CRAFTER,
    developmentEquipmentProfiles: USER_EQUIPMENT_PROFILES,
  },
  {
    scenarioId: 'hardened-survey-plank',
    recipe: HARDENED_SURVEY_PLANK,
    objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
    itemIconFileName: 'hardened-survey-plank.png',
    missionLabel: '【高難＋】製作高空作業所需的腳手架',
    planner: {
      kind: 'guide-integrated',
      policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
      fallbackPolicyVersion: SOLVER_POLICY_VERSION,
      config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
    },
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      ...NON_SPECIALIST_EQUIPMENT_PROFILES,
      UNBUFFED_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
  },
  {
    scenarioId: 'mobile-work-stairs',
    recipe: MOBILE_WORK_STAIRS,
    objective: MOBILE_WORK_STAIRS_OBJECTIVE,
    itemIconFileName: 'mobile-work-stairs.png',
    missionLabel: '【高難＋】製作高空作業所需的腳手架',
    planner: {
      kind: 'guide-integrated',
      policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
      fallbackPolicyVersion: SOLVER_POLICY_VERSION,
      config: DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
    },
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      ...NON_SPECIALIST_EQUIPMENT_PROFILES,
      UNBUFFED_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
  },
  {
    scenarioId: 'survey-craftsmans-command-brew',
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    itemIconFileName: 'survey-craftsmans-command-brew.png',
    missionLabel: '【高難】製作工匠所需的複方藥',
    planner: {
      kind: 'guide-integrated',
      policyVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
      fallbackPolicyVersion: SOLVER_POLICY_VERSION,
      config: DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
    },
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: USER_EQUIPMENT_PROFILES,
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

function matchesEquipmentProfile(profile: EquipmentProfile, crafter: CrafterProfile): boolean {
  return profile.craftsmanship === crafter.craftsmanship
    && profile.control === crafter.control
    && profile.maxCp === crafter.maxCp
    && profile.cosmicToolGoodBonus === crafter.cosmicToolGoodBonus
    && profile.specialist === (crafter.specialist === true)
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
    scenario.scenarioId as CraftScenarioId,
    crafter,
    scenario.planner.config,
  )
}

export function policyCoverageForCrafter(
  scenario: CraftScenarioDefinition,
  crafter: CrafterProfile,
): PolicyCoverage {
  if (scenario.developmentEquipmentProfiles.some((profile) => matchesEquipmentProfile(profile, crafter))) {
    return 'near-boundary'
  }
  const compatible = scenario.developmentEquipmentProfiles.filter((profile) => (
    profile.cosmicToolGoodBonus === crafter.cosmicToolGoodBonus
    && profile.specialist === (crafter.specialist === true)
  ))
  if (compatible.length === 0) return 'out-of-distribution'
  const insideEvaluatedBounds = (
    crafter.craftsmanship >= Math.min(...compatible.map((profile) => profile.craftsmanship))
    && crafter.craftsmanship <= Math.max(...compatible.map((profile) => profile.craftsmanship))
    && crafter.control >= Math.min(...compatible.map((profile) => profile.control))
    && crafter.control <= Math.max(...compatible.map((profile) => profile.control))
    && crafter.maxCp >= Math.min(...compatible.map((profile) => profile.maxCp))
    && crafter.maxCp <= Math.max(...compatible.map((profile) => profile.maxCp))
  )
  return insideEvaluatedBounds ? 'near-boundary' : 'out-of-distribution'
}
