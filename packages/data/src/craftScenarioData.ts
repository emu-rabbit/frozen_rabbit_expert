import {
  assertCraftObjective,
  type CraftObjective,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from './recipes/cosmicTitaniumIngot'
import {
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from './recipes/cosmicTitaniumNails'
import {
  HARDENED_SURVEY_PLANK,
  HARDENED_SURVEY_PLANK_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
} from './recipes/elevatingPlatforms'
import {
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from './recipes/surveyCraftsmansCommandBrew'

/**
 * Data-only recipe/objective aggregation. Policy versions, evidence tiers,
 * mission bindings, and UI metadata belong to their respective higher layers.
 */
export interface CraftScenarioDataEntry {
  scenarioId: string
  recipe: Readonly<RecipeProfile>
  objective: Readonly<CraftObjective>
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

export function validateCraftScenarioData(entries: readonly CraftScenarioDataEntry[]): void {
  const scenarioIds = new Set<string>()
  for (const entry of entries) {
    assertNonEmpty(entry.scenarioId, 'scenarioId')
    if (scenarioIds.has(entry.scenarioId)) {
      throw new Error(`duplicate scenarioId: ${entry.scenarioId}`)
    }
    scenarioIds.add(entry.scenarioId)

    assertCraftObjective(entry.recipe, entry.objective)
  }
}

function defineCraftScenarioData<const T extends readonly CraftScenarioDataEntry[]>(entries: T): T {
  validateCraftScenarioData(entries)
  return entries
}

export const CRAFT_SCENARIO_DATA = defineCraftScenarioData([
  {
    scenarioId: 'cosmotized-ilmenite-ingot',
    recipe: COSMIC_TITANIUM_INGOT,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
  },
  {
    scenarioId: 'cosmotized-ilmenite-nails',
    recipe: COSMIC_TITANIUM_NAILS,
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
  },
  {
    scenarioId: 'hardened-survey-plank',
    recipe: HARDENED_SURVEY_PLANK,
    objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
  },
  {
    scenarioId: 'mobile-work-stairs',
    recipe: MOBILE_WORK_STAIRS,
    objective: MOBILE_WORK_STAIRS_OBJECTIVE,
  },
  {
    scenarioId: 'survey-craftsmans-command-brew',
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
  },
] as const satisfies readonly CraftScenarioDataEntry[])

export type CraftScenarioDataId = (typeof CRAFT_SCENARIO_DATA)[number]['scenarioId']

type CraftScenarioDataUnion = (typeof CRAFT_SCENARIO_DATA)[number]

export function craftScenarioDataById<const Id extends CraftScenarioDataId>(
  id: Id,
): Extract<CraftScenarioDataUnion, { scenarioId: Id }> | null
export function craftScenarioDataById(id: string): CraftScenarioDataEntry | null
export function craftScenarioDataById(id: string): CraftScenarioDataEntry | null {
  return CRAFT_SCENARIO_DATA.find((entry) => entry.scenarioId === id) ?? null
}
