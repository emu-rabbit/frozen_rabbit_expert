import { describe, expect, it } from 'vitest'
import type { CraftScenarioDataEntry } from '../src'
import {
  CRAFT_SCENARIO_DATA,
  craftScenarioDataById,
  validateCraftScenarioData,
} from '../src'

function replaceFirst(replacement: CraftScenarioDataEntry): readonly CraftScenarioDataEntry[] {
  return [replacement, ...CRAFT_SCENARIO_DATA.slice(1)]
}

describe('craft scenario data', () => {
  it('publicly aggregates the current five recipe and objective bindings', () => {
    expect(CRAFT_SCENARIO_DATA.map((entry) => entry.scenarioId)).toEqual([
      'cosmotized-ilmenite-ingot',
      'cosmotized-ilmenite-nails',
      'hardened-survey-plank',
      'mobile-work-stairs',
      'survey-craftsmans-command-brew',
    ])
    expect(() => validateCraftScenarioData(CRAFT_SCENARIO_DATA)).not.toThrow()

    for (const entry of CRAFT_SCENARIO_DATA) {
      expect(entry.objective.recipeProfileId).toBe(entry.recipe.profileId)
      expect(craftScenarioDataById(entry.scenarioId)).toBe(entry)
    }
  })

  it('returns null for an unknown scenario instead of selecting another objective', () => {
    expect(craftScenarioDataById('unknown-scenario')).toBeNull()
  })

  it('rejects blank or duplicate scenario identities', () => {
    const first = CRAFT_SCENARIO_DATA[0]
    const second = CRAFT_SCENARIO_DATA[1]
    expect(() => validateCraftScenarioData(replaceFirst({ ...first, scenarioId: '  ' })))
      .toThrow(/scenarioId/)
    expect(() => validateCraftScenarioData(replaceFirst({ ...first, scenarioId: second.scenarioId })))
      .toThrow(/duplicate scenarioId/)
  })

  it('rejects mismatched objectives and invalid quality targets', () => {
    const first = CRAFT_SCENARIO_DATA[0]
    expect(() => validateCraftScenarioData(replaceFirst({
      ...first,
      objective: { ...first.objective, recipeProfileId: 'another-recipe' },
    }))).toThrow(/does not belong/)

    for (const qualityTarget of [
      Number.NaN,
      0,
      first.recipe.requiredQuality - 1,
      first.recipe.qualityMax + 1,
      first.recipe.requiredQuality + 0.5,
    ]) {
      expect(() => validateCraftScenarioData(replaceFirst({
        ...first,
        objective: { ...first.objective, qualityTarget },
      }))).toThrow(/qualityTarget/)
    }
  })

  it('allows multiple scenario objectives for one recipe without weakening required-quality semantics', () => {
    const first = CRAFT_SCENARIO_DATA[0]
    const alternate = {
      ...first,
      scenarioId: 'same-recipe-alternate-objective',
      objective: {
        ...first.objective,
        objectiveId: 'same-recipe-required-quality-alternate-v1',
      },
    }
    expect(() => validateCraftScenarioData([...CRAFT_SCENARIO_DATA, alternate])).not.toThrow()
    expect(() => validateCraftScenarioData(replaceFirst({
      ...first,
      recipe: {
        ...first.recipe,
        qualityMax: first.recipe.requiredQuality + 100,
      },
      objective: {
        ...first.objective,
        qualityTarget: first.recipe.requiredQuality + 1,
      },
    }))).toThrow(/must target recipe.requiredQuality/)
  })
})
