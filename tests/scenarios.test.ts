import { describe, expect, it } from 'vitest'
import { createInitialCraftState } from '@frozen-rabbit-expert/domain'
import { createSessionExport, MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import { recommendGuideIntegratedAction } from '@frozen-rabbit-expert/solver'
import {
  CRAFT_SCENARIOS,
  craftScenarioById,
  craftScenarioByRecipeProfileId,
} from '../apps/web/src/scenarios'

describe('craft scenario registry', () => {
  it('owns one complete recipe/objective/planner binding per supported scenario', () => {
    expect(CRAFT_SCENARIOS.map((scenario) => scenario.scenarioId))
      .toEqual(['cosmotized-ilmenite-ingot', 'cosmotized-ilmenite-nails'])
    expect(new Set(CRAFT_SCENARIOS.map((scenario) => scenario.scenarioId)).size)
      .toBe(CRAFT_SCENARIOS.length)

    for (const scenario of CRAFT_SCENARIOS) {
      expect(scenario.objective.recipeProfileId).toBe(scenario.recipe.profileId)
      expect(scenario.objective.qualityTarget).toBeGreaterThan(0)
      expect(scenario.objective.qualityTarget).toBeLessThanOrEqual(scenario.recipe.qualityMax)
      expect(craftScenarioById(scenario.scenarioId)).toBe(scenario)
      expect(craftScenarioByRecipeProfileId(scenario.recipe.profileId)).toBe(scenario)
    }
  })

  it('keeps protocol policy versions aligned with registry bindings', () => {
    expect(craftScenarioById('cosmotized-ilmenite-ingot')?.planner.policyVersion)
      .toBe(MODEL_VERSIONS.cosmicTitaniumPolicy)
    expect(craftScenarioById('cosmotized-ilmenite-nails')?.planner.policyVersion)
      .toBe(MODEL_VERSIONS.cosmicTitaniumNailsPolicy)
  })

  it('can invoke each registered planner with its own objective and pilot stats', () => {
    for (const scenario of CRAFT_SCENARIOS) {
      const crafter = { level: 100, ...scenario.pilotCrafter }
      const recommendation = recommendGuideIntegratedAction(
        scenario.recipe,
        crafter,
        createInitialCraftState(scenario.recipe, crafter),
        {
          objective: scenario.objective,
          policyVersion: scenario.planner.policyVersion,
          config: scenario.planner.config,
        },
      )
      expect(recommendation).toMatchObject({
        action: 'reflect',
        policyVersion: scenario.planner.policyVersion,
      })
    }
  })

  it('keeps scenario identity in exported replay data', () => {
    const scenario = CRAFT_SCENARIOS[1]
    const crafter = { level: 100, ...scenario.pilotCrafter }
    const exported = createSessionExport(
      scenario.scenarioId,
      scenario.recipe,
      crafter,
      createInitialCraftState(scenario.recipe, crafter),
      [],
    )

    expect(exported.manifest).toMatchObject({
      schema: MODEL_VERSIONS.sessionCodec,
      scenarioId: scenario.scenarioId,
      scenario: scenario.recipe.missionFamily,
    })
    expect(exported.recipe.profileId).toBe(scenario.recipe.profileId)
  })
})
