import {
  COSMIC_EXPERT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
  type CosmicExpertScenarioDataEntry,
  type CosmicExpertScenarioId,
  type CraftScenarioDataEntry,
} from '@frozen-rabbit-expert/data'
import {
  type CraftObjective,
  type CrafterProfile,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  SOLVER_POLICY_VERSION,
  type PolicyCoverage,
} from '@frozen-rabbit-expert/solver'

export const WEB_PLANNER_TIMEOUT_MS = 3_000

type EquipmentProfile = Readonly<Pick<
  CrafterProfile,
  'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'
>>

export interface CraftScenarioDefinition {
  scenarioId: string
  recipe: RecipeProfile
  objective: CraftObjective
  missionIds: readonly number[]
  missionNamesEn: readonly string[]
  itemIconFileName: string
  missionLabel: string
  missionIdentityLabel: string
  outputTypeLabel: string
  catalogSupportLevel: 'mechanics-ready'
  recommendationSupportLevel: 'development-preview'
  planner: GenericPlannerDefinition
  pilotCrafter: EquipmentProfile
  developmentEquipmentProfiles: readonly EquipmentProfile[]
}

export interface GenericPlannerDefinition {
  kind: 'generic'
  policyVersion: typeof SOLVER_POLICY_VERSION
}

export type CraftScenarioPresentation = Pick<
  CraftScenarioDefinition,
  'itemIconFileName' | 'missionLabel' | 'pilotCrafter' | 'developmentEquipmentProfiles'
>

type CosmicMissionIdentity = Pick<
  CosmicExpertScenarioDataEntry,
  'missionIds' | 'missionNamesEn'
>

const OUTPUT_TYPE_LABELS = {
  'required-quality': '必要品質',
  collectability: '收藏價值',
  'hq-chance': 'HQ 機率',
} as const satisfies Record<RecipeProfile['qualityOutcome'], string>

export function formatMissionIdentity(
  missionIds: readonly number[],
  missionNamesEn: readonly string[],
): string {
  if (missionIds.length === 0 || missionIds.length !== missionNamesEn.length) {
    throw new Error('Cosmic expert scenario requires aligned mission IDs and English names')
  }
  return missionNamesEn
    .map((name, index) => `${name} · WKS 任務配方 ID ${missionIds[index]}`)
    .join(' / ')
}

export function outputTypeLabel(
  qualityOutcome: RecipeProfile['qualityOutcome'],
): string {
  return OUTPUT_TYPE_LABELS[qualityOutcome]
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

const GENERIC_DEVELOPMENT_EQUIPMENT_PROFILES = [
  ...NON_SPECIALIST_EQUIPMENT_PROFILES,
  ...USER_EQUIPMENT_PROFILES,
] as const

const GENERIC_PLANNER = Object.freeze({
  kind: 'generic',
  policyVersion: SOLVER_POLICY_VERSION,
} as const satisfies GenericPlannerDefinition)

/**
 * Joins data-only recipe/objective data to Web presentation metadata. Adding a
 * catalog scenario does not require a recipe-specific guide policy binding.
 */
export function createGenericCraftScenarioDefinition<
  const Entry extends CraftScenarioDataEntry & CosmicMissionIdentity,
>(
  data: Entry,
  presentation: Partial<CraftScenarioPresentation> = {},
): CraftScenarioDefinition & { scenarioId: Entry['scenarioId'] } {
  return {
    ...data,
    // Only curated local assets are rendered. The full generated catalog uses
    // a code-native fallback instead of issuing hundreds of predictable 404s
    // or silently hotlinking third-party game assets.
    itemIconFileName: presentation.itemIconFileName ?? '',
    missionLabel: presentation.missionLabel
      ?? `【高難】宇宙探索 Expert · Recipe ${data.recipe.canonicalRecipeId}`,
    missionIdentityLabel: formatMissionIdentity(data.missionIds, data.missionNamesEn),
    outputTypeLabel: outputTypeLabel(data.recipe.qualityOutcome),
    catalogSupportLevel: 'mechanics-ready',
    recommendationSupportLevel: 'development-preview',
    planner: GENERIC_PLANNER,
    pilotCrafter: presentation.pilotCrafter ?? FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: presentation.developmentEquipmentProfiles
      ?? GENERIC_DEVELOPMENT_EQUIPMENT_PROFILES,
  }
}

const SCENARIO_PRESENTATION_OVERRIDES: Readonly<
  Partial<Record<CosmicExpertScenarioId, Partial<CraftScenarioPresentation>>>
> = {
  'cosmic-expert-36282': {
    itemIconFileName: 'cosmotized-ilmenite-ingot.png',
    missionLabel: '【高難＋】續・製作特殊裝備所需的材料',
    pilotCrafter: SPECIALIST_PILOT_CRAFTER,
    developmentEquipmentProfiles: USER_EQUIPMENT_PROFILES,
  },
  'cosmic-expert-36283': {
    itemIconFileName: 'cosmotized-ilmenite-nails.png',
    missionLabel: '【高難＋】製作特殊裝備',
    pilotCrafter: SPECIALIST_PILOT_CRAFTER,
    developmentEquipmentProfiles: USER_EQUIPMENT_PROFILES,
  },
  'cosmic-expert-36205': {
    itemIconFileName: 'hardened-survey-plank.png',
    missionLabel: '【高難＋】製作高空作業所需的腳手架',
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      ...NON_SPECIALIST_EQUIPMENT_PROFILES,
      UNBUFFED_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
  },
  'cosmic-expert-36208': {
    itemIconFileName: 'mobile-work-stairs.png',
    missionLabel: '【高難＋】製作高空作業所需的腳手架',
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      ...NON_SPECIALIST_EQUIPMENT_PROFILES,
      UNBUFFED_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
  },
  'cosmic-expert-36582': {
    itemIconFileName: 'survey-craftsmans-command-brew.png',
    missionLabel: '【高難】製作工匠所需的複方藥',
    pilotCrafter: FOOD_MEDICINE_PILOT_CRAFTER,
    developmentEquipmentProfiles: [
      FOOD_MEDICINE_PILOT_CRAFTER,
      SPECIALIST_PILOT_CRAFTER,
    ],
  },
}

export const CRAFT_SCENARIOS: readonly CraftScenarioDefinition[] = COSMIC_EXPERT_SCENARIO_DATA.map((data) => (
  createGenericCraftScenarioDefinition(data, SCENARIO_PRESENTATION_OVERRIDES[data.scenarioId])
))

export type CraftScenarioId = CosmicExpertScenarioId

export const DEFAULT_CRAFT_SCENARIO_ID: CraftScenarioId = 'cosmic-expert-36282'

export function craftScenarioById(id: string): CraftScenarioDefinition | null {
  return CRAFT_SCENARIOS.find((scenario) => scenario.scenarioId === id) ?? null
}

export function craftScenarioByRecipeProfileId(profileId: string): CraftScenarioDefinition | null {
  return CRAFT_SCENARIOS.find((scenario) => scenario.recipe.profileId === profileId) ?? null
}

export function policyCoverageForCrafter(
  _scenario: CraftScenarioDefinition,
  _crafter: CrafterProfile,
): PolicyCoverage {
  // The 432-entry generic runtime has only a single-profile, single-seed
  // family smoke so far. Presentation defaults and historical exact profiles
  // are not an evidence registry and must not raise player-facing confidence.
  return 'out-of-distribution'
}
