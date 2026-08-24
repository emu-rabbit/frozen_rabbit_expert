import { describe, expect, it } from 'vitest'
import {
  COSMIC_EXPERT_MECHANICS_FAMILIES,
  COSMIC_EXPERT_SCENARIO_DATA,
  COSMIC_EXPERT_CATALOG_VERSION,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import { createInitialCraftState, previewAction } from '@frozen-rabbit-expert/domain'
import { createSessionExport, MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import {
  recommendAction,
  SOLVER_POLICY_VERSION,
} from '@frozen-rabbit-expert/solver'
import { createCraftStartEvents } from '../apps/web/src/composables/useCraftSession'
import {
  CRAFT_SCENARIOS,
  craftScenarioById,
  craftScenarioByRecipeProfileId,
  createGenericCraftScenarioDefinition,
  policyCoverageForCrafter,
} from '../apps/web/src/scenarios'

describe('web craft scenario registry', () => {
  it('composes the entire data catalog with one generic planner', () => {
    expect(MODEL_VERSIONS.plannerPolicy).toBe(SOLVER_POLICY_VERSION)
    expect(MODEL_VERSIONS.recipeCatalog).toBe(COSMIC_EXPERT_CATALOG_VERSION)
    expect(CRAFT_SCENARIOS.map((scenario) => scenario.scenarioId))
      .toEqual(COSMIC_EXPERT_SCENARIO_DATA.map((scenario) => scenario.scenarioId))
    for (const data of COSMIC_EXPERT_SCENARIO_DATA) {
      const scenario = craftScenarioById(data.scenarioId)!
      expect(scenario.recipe).toBe(data.recipe)
      expect(scenario.objective).toBe(data.objective)
      expect(scenario.missionIds).toBe(data.missionIds)
      expect(scenario.missionNamesEn).toBe(data.missionNamesEn)
      expect(scenario.missionIdentityLabel).toContain(data.missionNamesEn[0]!)
      expect(scenario.missionIdentityLabel).toContain(String(data.missionIds[0]!))
      expect(scenario.outputTypeLabel).not.toHaveLength(0)
      expect(scenario.objective.recipeProfileId).toBe(scenario.recipe.profileId)
      expect(scenario.objective.qualityTarget).toBeGreaterThan(0)
      expect(scenario.objective.qualityTarget).toBeLessThanOrEqual(scenario.recipe.qualityMax)
      expect(craftScenarioById(scenario.scenarioId)).toBe(scenario)
      expect(craftScenarioByRecipeProfileId(scenario.recipe.profileId)).toBe(scenario)
      expect(scenario.planner).toEqual({
        kind: 'generic',
        policyVersion: SOLVER_POLICY_VERSION,
      })
      expect(scenario.catalogSupportLevel).toBe('mechanics-ready')
      expect(scenario.recommendationSupportLevel).toBe('development-preview')
    }
  })

  it('can invoke the generic planner for every mechanics family and pilot stats', () => {
    for (const family of COSMIC_EXPERT_MECHANICS_FAMILIES) {
      const scenario = craftScenarioById(`cosmic-expert-${family.representativeRecipeId}`)!
      const crafter = { level: 100, ...scenario.pilotCrafter }
      const state = createInitialCraftState(scenario.recipe, crafter)
      const recommendation = recommendAction(
        scenario.recipe,
        crafter,
        state,
        {
          mechanicsVersion: MODEL_VERSIONS.mechanics,
          objective: scenario.objective,
          policyCoverage: policyCoverageForCrafter(scenario, crafter),
        },
      )
      expect(recommendation?.policyVersion).toBe(scenario.planner.policyVersion)
      expect(previewAction(scenario.recipe, crafter, state, recommendation!.action).legal).toBe(true)
    }
  })

  it('accepts a same-mechanics catalog entry without a guide binding or hand-written metadata', () => {
    const source = COSMIC_EXPERT_SCENARIO_DATA[0]
    const scenario = createGenericCraftScenarioDefinition({
      ...source,
      scenarioId: 'generated-same-mechanics-recipe',
    })

    expect(scenario.scenarioId).toBe('generated-same-mechanics-recipe')
    expect(scenario.planner).toEqual({
      kind: 'generic',
      policyVersion: SOLVER_POLICY_VERSION,
    })
    expect(scenario.itemIconFileName).toBe('')
    expect(scenario.missionLabel).toContain(String(source.recipe.canonicalRecipeId))
    expect(scenario.missionIds).toBe(source.missionIds)
    expect(scenario.missionNamesEn).toBe(source.missionNamesEn)
    expect(scenario.missionIdentityLabel).toBe(
      `${source.missionNamesEn[0]} · WKS 任務配方 ID ${source.missionIds[0]}`,
    )
    expect(scenario.developmentEquipmentProfiles.length).toBeGreaterThan(0)
  })

  it('disambiguates same-name recipes with canonical mission identity and output type', () => {
    const captainSuitExPlus = craftScenarioById('cosmic-expert-37291')!
    const captainSuitMaster = craftScenarioById('cosmic-expert-38214')!

    expect(captainSuitExPlus.recipe.displayNameEn)
      .toBe(captainSuitMaster.recipe.displayNameEn)
    expect(captainSuitExPlus.missionIdentityLabel)
      .toBe("EX+: Captain's Suit III · WKS 任務配方 ID 669")
    expect(captainSuitMaster.missionIdentityLabel)
      .toBe("Master: Improved Captain's Suits · WKS 任務配方 ID 1184")
    expect(captainSuitExPlus.missionIdentityLabel)
      .not.toBe(captainSuitMaster.missionIdentityLabel)
    expect(captainSuitExPlus.outputTypeLabel).not.toHaveLength(0)
    expect(captainSuitMaster.outputTypeLabel).not.toHaveLength(0)
  })

  it('keeps scenario identity in exported replay data', () => {
    const scenario = CRAFT_SCENARIOS[3]
    const crafter = { level: 100, ...scenario.pilotCrafter }
    const exported = createSessionExport(
      scenario.scenarioId,
      scenario.recipe,
      scenario.objective,
      crafter,
      'aggressive',
      {
        catalogLevel: scenario.catalogSupportLevel,
        recommendationLevel: scenario.recommendationSupportLevel,
        policyCoverage: 'out-of-distribution',
      },
      createInitialCraftState(scenario.recipe, crafter),
      [],
    )
    expect(exported.manifest).toMatchObject({
      schema: MODEL_VERSIONS.sessionCodec,
      scenarioId: scenario.scenarioId,
      scenario: scenario.recipe.missionFamily,
    })
    expect(exported.recipe.profileId).toBe(scenario.recipe.profileId)
    expect(exported.objective).toEqual(scenario.objective)
    expect(exported.riskPreference).toBe('aggressive')
    expect(exported.support).toEqual({
      catalogLevel: 'mechanics-ready',
      recommendationLevel: 'development-preview',
      policyCoverage: 'out-of-distribution',
    })
  })

  it('rejects an exported objective from a different recipe', () => {
    const scenario = CRAFT_SCENARIOS[0]!
    const otherObjective = CRAFT_SCENARIOS[1]!.objective
    const crafter = { level: 100, ...scenario.pilotCrafter }

    expect(() => createSessionExport(
      scenario.scenarioId,
      scenario.recipe,
      otherObjective,
      crafter,
      'balanced',
      {
        catalogLevel: scenario.catalogSupportLevel,
        recommendationLevel: scenario.recommendationSupportLevel,
        policyCoverage: 'out-of-distribution',
      },
      createInitialCraftState(scenario.recipe, crafter),
      [],
    )).toThrow('session export objective does not belong to recipe')
  })

  it('starts the first step on Normal without asking for a condition', () => {
    expect(createCraftStartEvents(123).map((event) => event.type))
      .toEqual(['craftStarted', 'conditionSelected'])
    expect(createCraftStartEvents(123)[1]).toMatchObject({ condition: 'normal', at: 123 })
  })

  it('keeps every development-preview panel out of distribution until family evidence is registered', () => {
    const scenario = craftScenarioById('cosmic-expert-36208')!
    for (const { crafter } of PLAYER_EQUIPMENT_PROFILES) {
      expect(policyCoverageForCrafter(scenario, crafter)).toBe('out-of-distribution')
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
