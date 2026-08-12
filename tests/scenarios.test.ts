import { describe, expect, it } from 'vitest'
import { createInitialCraftState } from '@frozen-rabbit-expert/domain'
import { createSessionExport, MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import { recommendGuideIntegratedAction } from '@frozen-rabbit-expert/solver'
import { createCraftStartEvents, withInitialNormalCondition } from '../apps/web/src/composables/useCraftSession'
import {
  CRAFT_SCENARIOS,
  WEB_GUIDE_PLANNER_TIMEOUT_MS,
  craftScenarioById,
  craftScenarioByRecipeProfileId,
  policyCoverageForCrafter,
} from '../apps/web/src/scenarios'

describe('web craft scenario registry', () => {
  it('owns all four recipe-specific policy bindings', () => {
    expect(CRAFT_SCENARIOS.map((scenario) => scenario.scenarioId)).toEqual([
      'cosmotized-ilmenite-ingot',
      'cosmotized-ilmenite-nails',
      'hardened-survey-plank',
      'mobile-work-stairs',
    ])
    for (const scenario of CRAFT_SCENARIOS) {
      expect(scenario.objective.recipeProfileId).toBe(scenario.recipe.profileId)
      expect(scenario.objective.qualityTarget).toBeGreaterThan(0)
      expect(scenario.objective.qualityTarget).toBeLessThanOrEqual(scenario.recipe.qualityMax)
      expect(craftScenarioById(scenario.scenarioId)).toBe(scenario)
      expect(craftScenarioByRecipeProfileId(scenario.recipe.profileId)).toBe(scenario)
      expect(MODEL_VERSIONS.scenarioPolicies[scenario.scenarioId])
        .toBe(scenario.planner.policyVersion)
    }
  })

  it('keeps the strong-planner timeout at 3000 ms', () => {
    expect(WEB_GUIDE_PLANNER_TIMEOUT_MS).toBe(3_000)
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
    expect(withInitialNormalCondition([]).at(-1)).toMatchObject({
      type: 'conditionSelected',
      condition: 'normal',
    })
    expect(withInitialNormalCondition([
      { type: 'craftStarted', id: 'legacy-start', at: 99 },
    ]).at(-1)).toMatchObject({ type: 'conditionSelected', condition: 'normal', at: 99 })
  })

  it('marks only non-specialist evaluated equipment as covered for Elevating Platforms', () => {
    const scenario = craftScenarioById('mobile-work-stairs')!
    const evaluated = scenario.developmentEquipmentProfiles[3]
    expect(evaluated.specialist).toBe(false)
    expect(policyCoverageForCrafter(scenario, { level: 100, ...evaluated })).toBe('near-boundary')
    expect(policyCoverageForCrafter(scenario, {
      level: 100,
      craftsmanship: 5410,
      control: 5250,
      maxCp: 750,
      cosmicToolGoodBonus: true,
      specialist: false,
    })).toBe('near-boundary')
    expect(policyCoverageForCrafter(scenario, {
      level: 100,
      ...evaluated,
      specialist: true,
    })).toBe('out-of-distribution')
  })
})
