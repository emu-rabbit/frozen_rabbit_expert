import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CraftState } from '@frozen-rabbit-expert/domain'
import { NORMAL_HEAVY_POC_CONDITIONS } from '@frozen-rabbit-expert/simulator'
import {
  FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION,
  TARGET_CRAFTER_MEDICINE_749,
  replayFixedTapeRoute,
  searchFixedTapeClairvoyantRoute,
} from '../src'

const context = {
  recipe: COSMIC_TITANIUM_INGOT,
  objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
  crafter: TARGET_CRAFTER_MEDICINE_749,
}

describe('fixed-tape clairvoyant search', () => {
  it('returns a mechanically replayable route witness without claiming causal policy evidence', () => {
    const base = createInitialCraftState(context.recipe, context.crafter)
    const initial: CraftState = {
      ...base,
      progress: context.recipe.progressRequired - 1,
      quality: context.recipe.qualityMax,
    }
    const result = searchFixedTapeClairvoyantRoute(context, initial, {
      conditionProfile: NORMAL_HEAVY_POC_CONDITIONS,
      seed: 0xfeed_2026,
      beamWidth: 128,
      maxActions: 2,
    })

    expect(result.version).toBe(FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION)
    expect(result.evidence).toBe('clairvoyant-fixed-tape-feasible-witness-not-causal-policy')
    expect(result.candidateTransitions).toBeGreaterThan(0)
    expect(result.witness).not.toBeNull()
    const replay = replayFixedTapeRoute(
      context,
      initial,
      NORMAL_HEAVY_POC_CONDITIONS,
      result.seed,
      result.witness!.actions,
    )
    expect(replay.finalState).toEqual(result.witness!.finalState)
    expect(replay.successDrawsConsumed).toBe(result.witness!.successDrawsConsumed)
    expect(replay.conditionDrawsConsumed).toBe(result.witness!.conditionDrawsConsumed)
  })

  it('certifies objective saturation when a one-action completion reaches the target', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const state: CraftState = {
      ...initial,
      progress: context.recipe.progressRequired - 1,
      quality: context.recipe.qualityMax,
      durability: context.recipe.durabilityMax,
    }
    const result = searchFixedTapeClairvoyantRoute(context, state, {
      conditionProfile: NORMAL_HEAVY_POC_CONDITIONS,
      seed: 42,
      beamWidth: 128,
      maxActions: 1,
    })

    expect(result.qualityMaximumReachable).toBe(true)
    expect(result.objectiveScoreSaturated).toBe(true)
    expect(result.stoppedAtQualityMaximum).toBe(true)
    expect(result.witness?.finalState.terminal).toBe('completed')
  })

  it('reports whether a negative result was exhaustive within the fixed horizon', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const exhaustive = searchFixedTapeClairvoyantRoute(context, initial, {
      conditionProfile: NORMAL_HEAVY_POC_CONDITIONS,
      seed: 7,
      beamWidth: 1_000,
      maxActions: 1,
    })
    const truncated = searchFixedTapeClairvoyantRoute(context, initial, {
      conditionProfile: NORMAL_HEAVY_POC_CONDITIONS,
      seed: 7,
      beamWidth: 1,
      maxActions: 2,
    })

    expect(exhaustive.frontierTruncated).toBe(false)
    expect(exhaustive.exhaustiveWithinFixedTapeHorizon).toBe(true)
    expect(truncated.frontierTruncated).toBe(true)
    expect(truncated.exhaustiveWithinFixedTapeHorizon).toBe(false)
  })

  it('is deterministic and does not mutate the supplied state', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const before = JSON.parse(JSON.stringify(initial))
    const options = {
      conditionProfile: NORMAL_HEAVY_POC_CONDITIONS,
      seed: 20260824,
      beamWidth: 32,
      maxActions: 4,
    } as const

    expect(searchFixedTapeClairvoyantRoute(context, initial, options)).toEqual(
      searchFixedTapeClairvoyantRoute(context, initial, options),
    )
    expect(initial).toEqual(before)
  })
})
