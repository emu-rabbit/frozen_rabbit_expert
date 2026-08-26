import { describe, expect, it } from 'vitest'
import {
  CRAFT_SCENARIO_DATA,
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  previewAction,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
  NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
  RESOURCE_SCARCE_POC_CONDITIONS,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import {
  SCENARIO_BEAM_PLANNER_VERSION,
  TARGET_CRAFTER_MEDICINE_749,
  planWithScenarioBeam,
  scenarioBeamStateIdentityKey,
  scenarioBeamStatePotential,
} from '../src'

const context = {
  recipe: COSMIC_TITANIUM_INGOT,
  objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
  crafter: TARGET_CRAFTER_MEDICINE_749,
}

const options = {
  profiles: [NORMAL_HEAVY_POC_CONDITIONS, RESOURCE_SCARCE_POC_CONDITIONS],
  scenariosPerProfile: 1,
  beamWidth: 8,
  maxActions: 4,
  seed: 0x73_63_65_6e,
} as const

describe('scenario beam planner', () => {
  it('returns a legal safe action without mutating the observed state', () => {
    const state = createInitialCraftState(context.recipe, context.crafter)
    const before = JSON.parse(JSON.stringify(state))

    const plan = planWithScenarioBeam(context, state, options)

    expect(plan).not.toBeNull()
    expect(plan!.version).toBe(SCENARIO_BEAM_PLANNER_VERSION)
    expect(plan!.scenarioCount).toBe(2)
    expect(plan!.beamWidth).toBe(8)
    expect(plan!.rootActionCount).toBeGreaterThan(0)
    expect(plan!.expandedBeamNodes).toBeGreaterThan(0)
    expect(plan!.candidateAdvanceCalls).toBeGreaterThan(plan!.expandedBeamNodes)
    expect(plan!.successDrawReads).toBe(plan!.candidateAdvanceCalls)
    expect(plan!.conditionDrawReads).toBe(plan!.candidateAdvanceCalls)
    expect(previewAction(context.recipe, context.crafter, state, plan!.action).legal).toBe(true)
    expect(isPolicyActionSafe(context.recipe, context.crafter, state, plan!.action)).toBe(true)
    expect(state).toEqual(before)
  })

  it('is reproducible for the same observed state and planner seed', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const state: CraftState = {
      ...initial,
      step: 17,
      progress: 5_800,
      quality: 8_400,
      durability: 30,
      cp: 260,
      innerQuiet: 8,
      condition: 'centered',
      trainedPerfectionAvailable: false,
    }

    expect(planWithScenarioBeam(context, state, options)).toEqual(
      planWithScenarioBeam(context, state, options),
    )
    expect(planWithScenarioBeam(context, state, options)).toEqual(
      planWithScenarioBeam(context, state, {
        ...options,
        profiles: [...options.profiles].reverse(),
      }),
    )
  })

  it('ranks completed states above incomplete and failed states', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const incomplete = {
      ...initial,
      progress: context.recipe.progressRequired - 1,
      quality: context.recipe.requiredQuality - 1,
    }
    const completed: CraftState = {
      ...incomplete,
      progress: context.recipe.progressRequired,
      quality: context.recipe.requiredQuality,
      terminal: 'completed',
    }
    const failed: CraftState = {
      ...incomplete,
      terminal: 'failed',
      failureReason: 'durability',
    }

    expect(scenarioBeamStatePotential(context, completed))
      .toBeGreaterThan(scenarioBeamStatePotential(context, incomplete))
    expect(scenarioBeamStatePotential(context, incomplete))
      .toBeGreaterThan(scenarioBeamStatePotential(context, failed))
  })

  it('keeps objective potential finite for every current recipe, including requiredQuality zero', () => {
    for (const { recipe, objective } of CRAFT_SCENARIO_DATA) {
      const recipeContext = { recipe, objective, crafter: TARGET_CRAFTER_MEDICINE_749 }
      const initial = createInitialCraftState(recipe, TARGET_CRAFTER_MEDICINE_749)
      const conditionProfile = recipe.missionFamily === 'sinus-ardorum-explus-elevating-platforms'
        ? NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS
        : recipe.missionFamily === 'sinus-ardorum-ex-artisans-mixtures'
          ? NORMAL_HEAVY_COMMAND_BREW_CONDITIONS
          : NORMAL_HEAVY_POC_CONDITIONS
      expect(Number.isFinite(scenarioBeamStatePotential(recipeContext, initial))).toBe(true)
      const plan = planWithScenarioBeam(recipeContext, initial, {
        ...options,
        profiles: [conditionProfile],
        beamWidth: 4,
        maxActions: 2,
      })
      expect(plan).not.toBeNull()
      expect(Number.isFinite(plan!.score.averageScenarioPotential)).toBe(true)
    }
  })

  it('distinguishes every specialist resource in the action-cache state identity', () => {
    const initial = createInitialCraftState(context.recipe, {
      ...context.crafter,
      specialist: true,
    })
    const variants: CraftState[] = [
      { ...initial, carefulObservationUsesLeft: initial.carefulObservationUsesLeft - 1 },
      { ...initial, heartAndSoulAvailable: false },
      { ...initial, heartAndSoulActive: true },
      { ...initial, quickInnovationAvailable: false },
    ]
    expect(new Set([initial, ...variants].map(scenarioBeamStateIdentityKey)).size)
      .toBe(variants.length + 1)
  })

  it('uses objective quality to rank mechanics-completed score recipes', () => {
    const { recipe, objective } = CRAFT_SCENARIO_DATA.find((entry) => (
      entry.scenarioId === 'cosmotized-ilmenite-nails'
    ))!
    const recipeContext = { recipe, objective, crafter: TARGET_CRAFTER_MEDICINE_749 }
    const initial = createInitialCraftState(recipe, TARGET_CRAFTER_MEDICINE_749)
    const lowQuality: CraftState = {
      ...initial,
      progress: recipe.progressRequired,
      quality: Math.floor(recipe.qualityMax / 2),
      terminal: 'completed',
    }
    const targetQuality: CraftState = {
      ...lowQuality,
      quality: recipe.qualityMax,
    }
    expect(scenarioBeamStatePotential(recipeContext, targetQuality))
      .toBeGreaterThan(scenarioBeamStatePotential(recipeContext, lowQuality))
  })

  it('rejects invalid budgets and returns null for a terminal state', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    expect(() => planWithScenarioBeam(context, initial, {
      ...options,
      beamWidth: 0,
    })).toThrow('beamWidth must be a positive integer')

    expect(planWithScenarioBeam(context, {
      ...initial,
      terminal: 'failed',
      failureReason: 'durability',
    }, options)).toBeNull()

    expect(() => planWithScenarioBeam({
      ...context,
      objective: { ...context.objective, recipeProfileId: 'wrong-recipe' },
    }, initial, options)).toThrow(/does not belong/)
  })

  it('reports search work with exact depth-one and bounded beam counters', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const depthOne = planWithScenarioBeam(context, initial, {
      ...options,
      maxActions: 1,
    })!
    expect(depthOne.expandedBeamNodes).toBe(depthOne.scenarioCount)
    expect(depthOne.candidateAdvanceCalls)
      .toBe(depthOne.rootActionCount * depthOne.scenarioCount)
    expect(depthOne.successDrawReads).toBe(depthOne.candidateAdvanceCalls)
    expect(depthOne.conditionDrawReads).toBe(depthOne.candidateAdvanceCalls)

    const deeper = planWithScenarioBeam(context, initial, options)!
    expect(deeper.expandedBeamNodes).toBeLessThanOrEqual(
      deeper.scenarioCount * (1 + deeper.beamWidth * (options.maxActions - 1)),
    )
  })

  it('does not consume the condition tape for forced Good Omen transitions', () => {
    const { recipe, objective } = CRAFT_SCENARIO_DATA.find((entry) => (
      entry.scenarioId === 'mobile-work-stairs'
    ))!
    const goodOmenContext = { recipe, objective, crafter: TARGET_CRAFTER_MEDICINE_749 }
    const state = {
      ...createInitialCraftState(recipe, TARGET_CRAFTER_MEDICINE_749),
      condition: 'goodOmen' as const,
    }
    const plan = planWithScenarioBeam(goodOmenContext, state, {
      profiles: [NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS],
      scenariosPerProfile: 1,
      beamWidth: 8,
      maxActions: 2,
      seed: 0x600d_0a3e,
    })!

    expect(plan.successDrawReads).toBe(plan.candidateAdvanceCalls)
    expect(plan.conditionDrawReads)
      .toBe(plan.candidateAdvanceCalls - plan.rootActionCount)
  })
})
