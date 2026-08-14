import { describe, expect, it } from 'vitest'
import { CRAFT_SCENARIO_DATA, PLAYER_EQUIPMENT_PROFILES } from '@frozen-rabbit-expert/data'
import { createInitialCraftState } from '@frozen-rabbit-expert/domain'
import { createSessionExport, MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import { recommendGuideIntegratedAction } from '@frozen-rabbit-expert/solver'
import { createCraftStartEvents } from '../apps/web/src/composables/useCraftSession'
import {
  CRAFT_SCENARIOS,
  craftScenarioById,
  craftScenarioByRecipeProfileId,
  plannerConfigForCrafter,
  policyCoverageForCrafter,
} from '../apps/web/src/scenarios'

describe('web craft scenario registry', () => {
  it('owns all five recipe-specific policy bindings', () => {
    expect(CRAFT_SCENARIOS.map((scenario) => scenario.scenarioId))
      .toEqual(CRAFT_SCENARIO_DATA.map((scenario) => scenario.scenarioId))
    for (const data of CRAFT_SCENARIO_DATA) {
      const scenario = craftScenarioById(data.scenarioId)!
      expect(scenario.recipe).toBe(data.recipe)
      expect(scenario.objective).toBe(data.objective)
      expect(scenario.objective.recipeProfileId).toBe(scenario.recipe.profileId)
      expect(scenario.objective.qualityTarget).toBeGreaterThan(0)
      expect(scenario.objective.qualityTarget).toBeLessThanOrEqual(scenario.recipe.qualityMax)
      expect(craftScenarioById(scenario.scenarioId)).toBe(scenario)
      expect(craftScenarioByRecipeProfileId(scenario.recipe.profileId)).toBe(scenario)
      expect(MODEL_VERSIONS.scenarioPolicies[scenario.scenarioId])
        .toBe(scenario.planner.policyVersion)
    }
    expect(Object.keys(MODEL_VERSIONS.scenarioPolicies).sort())
      .toEqual(CRAFT_SCENARIO_DATA.map(({ scenarioId }) => scenarioId).sort())
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
    const scenario = CRAFT_SCENARIOS[3]
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

  it('starts the first step on Normal without asking for a condition', () => {
    expect(createCraftStartEvents(123).map((event) => event.type))
      .toEqual(['craftStarted', 'conditionSelected'])
    expect(createCraftStartEvents(123)[1]).toMatchObject({ condition: 'normal', at: 123 })
  })

  it('covers all three exact player profiles for Elevating Platforms', () => {
    const scenario = craftScenarioById('mobile-work-stairs')!
    for (const { crafter } of PLAYER_EQUIPMENT_PROFILES) {
      expect(policyCoverageForCrafter(scenario, crafter)).toBe('near-boundary')
    }
    expect(policyCoverageForCrafter(scenario, {
      level: 100,
      craftsmanship: 5410,
      control: 5250,
      maxCp: 750,
      cosmicToolGoodBonus: true,
      specialist: false,
    })).toBe('out-of-distribution')
    expect(policyCoverageForCrafter(scenario, {
      level: 100,
      craftsmanship: 5410,
      control: 5250,
      maxCp: 750,
      cosmicToolGoodBonus: false,
      specialist: true,
    })).toBe('out-of-distribution')
  })
})

describe('exact player-profile planner routing', () => {
  const unbuffed = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
  const foodMedicine = PLAYER_EQUIPMENT_PROFILES[1]!.crafter
  const specialist = PLAYER_EQUIPMENT_PROFILES[2]!.crafter

  it('routes only the exact food-and-medicine nails profile to the high-tail config', () => {
    const scenario = craftScenarioById('cosmotized-ilmenite-nails')!

    expect(plannerConfigForCrafter(scenario, foodMedicine)).toMatchObject({
      progressFloorBeforeQuality: 0.75,
      greatStridesQuality: 0.70,
    })
    expect(plannerConfigForCrafter(scenario, unbuffed)).toBe(scenario.planner.config)
    expect(plannerConfigForCrafter(scenario, specialist)).toBe(scenario.planner.config)
  })

  it('routes only the frozen-validated exact food profile to projected-quality stairs cashout', () => {
    const scenario = craftScenarioById('mobile-work-stairs')!

    expect(plannerConfigForCrafter(scenario, unbuffed).adaptiveByregotCashoutCpCeiling).toBe(0)
    expect(plannerConfigForCrafter(scenario, foodMedicine)).toMatchObject({
      adaptiveByregotCashoutCpCeiling: 100,
      adaptiveByregotMinimumProjectedQualityRatio: 0.75,
      allowSpecialistActions: false,
    })
    expect(plannerConfigForCrafter(scenario, specialist).adaptiveByregotCashoutCpCeiling).toBe(0)
  })
})
