import { describe, expect, it } from 'vitest'
import { CRAFT_SCENARIO_DATA } from '@frozen-rabbit-expert/data'
import {
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  craftScenarioModelContentHash,
  type RecipeProfile,
} from '../src'

describe('craft scenario model identity', () => {
  it('is stable across object key order and changes on model content drift', () => {
    const scenario = CRAFT_SCENARIO_DATA[0]!
    const reorderedRecipe = Object.fromEntries(
      Object.entries(scenario.recipe).reverse(),
    ) as unknown as RecipeProfile
    const canonical = craftScenarioModelContentHash(scenario.recipe, scenario.objective)

    expect(CRAFT_SCENARIO_MODEL_IDENTITY_VERSION).toBe('craft-scenario-model-identity-v1')
    expect(canonical).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(craftScenarioModelContentHash(reorderedRecipe, scenario.objective)).toBe(canonical)
    expect(craftScenarioModelContentHash({
      ...scenario.recipe,
      progressRequired: scenario.recipe.progressRequired + 1,
    }, scenario.objective)).not.toBe(canonical)
    expect(craftScenarioModelContentHash(scenario.recipe, {
      ...scenario.objective,
      qualityTarget: scenario.objective.qualityTarget - 1,
    })).not.toBe(canonical)
    expect(craftScenarioModelContentHash({
      ...scenario.recipe,
      source: { ...scenario.recipe.source, verifiedAt: '2099-01-01' },
    }, scenario.objective)).not.toBe(canonical)
  })
})
