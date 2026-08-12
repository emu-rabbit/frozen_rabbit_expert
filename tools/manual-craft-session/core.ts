import {
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
  playerEquipmentProfileById,
} from '@frozen-rabbit-expert/data'
import {
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  BALANCED_POC_CONDITIONS,
  BALANCED_COMMAND_BREW_CONDITIONS,
  GOOD_SCARCE_MALLEABLE_STRESS_COMMAND_BREW_CONDITIONS,
  NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
  NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
  RESOURCE_SCARCE_ELEVATING_PLATFORMS_CONDITIONS,
  RESOURCE_SCARCE_POC_CONDITIONS,
  createManualSession,
  type ManualCraftSession,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import type { CraftObjective, RecipeProfile } from '@frozen-rabbit-expert/domain'

const SCENARIOS = {
  'cosmotized-ilmenite-ingot': {
    recipe: COSMIC_TITANIUM_INGOT,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
    conditionFamily: 'six',
  },
  'cosmotized-ilmenite-nails': {
    recipe: COSMIC_TITANIUM_NAILS,
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    conditionFamily: 'six',
  },
  'hardened-survey-plank': {
    recipe: HARDENED_SURVEY_PLANK,
    objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
    conditionFamily: 'seven',
  },
  'mobile-work-stairs': {
    recipe: MOBILE_WORK_STAIRS,
    objective: MOBILE_WORK_STAIRS_OBJECTIVE,
    conditionFamily: 'seven',
  },
  'survey-craftsmans-command-brew': {
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    conditionFamily: 'command-brew',
  },
} as const satisfies Record<string, {
  recipe: RecipeProfile
  objective: CraftObjective
  conditionFamily: 'six' | 'seven' | 'command-brew'
}>

export type ManualScenarioId = keyof typeof SCENARIOS
export type ManualConditionProfileName = 'balanced' | 'normal-heavy' | 'resource-scarce'

const SIX_CONDITION_PROFILES = {
  balanced: BALANCED_POC_CONDITIONS,
  'normal-heavy': NORMAL_HEAVY_POC_CONDITIONS,
  'resource-scarce': RESOURCE_SCARCE_POC_CONDITIONS,
} as const

const SEVEN_CONDITION_PROFILES = {
  balanced: BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  'normal-heavy': NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  'resource-scarce': RESOURCE_SCARCE_ELEVATING_PLATFORMS_CONDITIONS,
} as const

const COMMAND_BREW_CONDITION_PROFILES = {
  balanced: BALANCED_COMMAND_BREW_CONDITIONS,
  'normal-heavy': NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
  'resource-scarce': GOOD_SCARCE_MALLEABLE_STRESS_COMMAND_BREW_CONDITIONS,
} as const

export interface CreateScenarioManualSessionOptions {
  scenarioId: string
  equipmentProfileId: string
  conditionProfile?: ManualConditionProfileName
  seed: number
  maxActions?: number
}

export const MANUAL_SCENARIO_IDS = Object.keys(SCENARIOS) as ManualScenarioId[]
export const MANUAL_CONDITION_PROFILE_NAMES: ManualConditionProfileName[] = [
  'balanced',
  'normal-heavy',
  'resource-scarce',
]

function conditionProfileFor(
  family: 'six' | 'seven' | 'command-brew',
  name: ManualConditionProfileName,
): WeightedConditionProfile {
  if (family === 'seven') return SEVEN_CONDITION_PROFILES[name]
  if (family === 'command-brew') return COMMAND_BREW_CONDITION_PROFILES[name]
  return SIX_CONDITION_PROFILES[name]
}

export function createScenarioManualSession(
  options: CreateScenarioManualSessionOptions,
): ManualCraftSession {
  const scenario = SCENARIOS[options.scenarioId as ManualScenarioId]
  if (scenario === undefined) throw new Error(`Unknown scenario: ${options.scenarioId}`)
  const equipment = playerEquipmentProfileById(options.equipmentProfileId)
  if (equipment === null) throw new Error(`Unknown equipment profile: ${options.equipmentProfileId}`)
  const conditionProfileName = options.conditionProfile ?? 'balanced'
  if (!MANUAL_CONDITION_PROFILE_NAMES.includes(conditionProfileName)) {
    throw new Error(`Unknown condition profile: ${conditionProfileName}`)
  }
  return createManualSession({
    scenarioId: options.scenarioId,
    recipe: scenario.recipe,
    objectiveId: scenario.objective.objectiveId,
    qualityTarget: scenario.objective.qualityTarget,
    crafterProfileId: equipment.id,
    crafter: equipment.crafter,
    conditionProfile: conditionProfileFor(scenario.conditionFamily, conditionProfileName),
    seed: options.seed,
    ...(options.maxActions === undefined ? {} : { maxActions: options.maxActions }),
  })
}
