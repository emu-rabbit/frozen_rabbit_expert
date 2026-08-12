import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  previewAction,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  NORMAL_HEAVY_POC_CONDITIONS,
  RESOURCE_SCARCE_POC_CONDITIONS,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import {
  SCENARIO_BEAM_PLANNER_VERSION,
  TARGET_CRAFTER_MEDICINE_749,
  planWithScenarioBeam,
  scenarioBeamStatePotential,
} from '../src'

const context = {
  recipe: COSMIC_TITANIUM_INGOT,
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
  })
})
