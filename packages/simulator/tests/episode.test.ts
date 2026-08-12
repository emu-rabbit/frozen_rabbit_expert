import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CrafterProfile } from '@frozen-rabbit-expert/domain'
import {
  BALANCED_POC_CONDITIONS,
  createEpisodeRandomStream,
  runEpisode,
  runEpisodeTrace,
  sampleCondition,
  type EpisodeRandomStream,
  type WeightedConditionProfile,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5140,
  maxCp: 630,
  cosmicToolGoodBonus: true,
}

const specialistCrafter: CrafterProfile = {
  ...crafter,
  specialist: true,
}

const FORCED_GOOD_CONDITIONS: WeightedConditionProfile = {
  id: 'forced-good-specialist-test',
  evidence: 'verified',
  weights: { good: 1 },
}

function trackedRandom(): {
  random: EpisodeRandomStream
  draws: { condition: number; success: number }
} {
  const draws = { condition: 0, success: 0 }
  return {
    draws,
    random: {
      nextCondition: () => {
        draws.condition += 1
        return 0.5
      },
      nextSuccess: () => {
        draws.success += 1
        return 0
      },
    },
  }
}

describe('episode simulator', () => {
  it('replays the same random stream deterministically', () => {
    const collect = () => {
      const random = createEpisodeRandomStream(42)
      return Array.from({ length: 12 }, () => ({
        condition: sampleCondition(BALANCED_POC_CONDITIONS, random),
        success: random.nextSuccess(),
      }))
    }
    expect(collect()).toEqual(collect())
  })

  it('supports evidence-backed condition transitions without assuming iid draws', () => {
    const random = createEpisodeRandomStream(42)
    expect(sampleCondition({
      id: 'forced-good-to-normal-test',
      evidence: 'verified',
      weights: { good: 1 },
      transitionWeights: { good: { normal: 1 } },
    }, random, 'good')).toBe('normal')
  })

  it('runs a bounded trajectory without reading global randomness', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const result = runEpisode({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialState,
      firstAction: 'observe',
      policy: () => 'observe',
      random: createEpisodeRandomStream(7),
      conditionProfile: BALANCED_POC_CONDITIONS,
      maxSteps: 4,
    })
    expect(result.actions).toHaveLength(4)
    expect(result.stoppedByLimit).toBe(true)
    expect(result.stopReason).toBe('action-limit')
  })

  it('distinguishes a policy stall from an episode limit', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const result = runEpisode({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialState,
      firstAction: 'observe',
      policy: () => null,
      random: createEpisodeRandomStream(7),
      conditionProfile: BALANCED_POC_CONDITIONS,
      maxSteps: 4,
    })
    expect(result.actions).toHaveLength(1)
    expect(result.stoppedByLimit).toBe(false)
    expect(result.stopReason).toBe('policy-null')
  })

  it('does not let a no-step action skip the next condition draw', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const afterFinalAppraisal = runEpisodeTrace({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialState,
      firstAction: 'finalAppraisal',
      policy: () => 'observe',
      random: createEpisodeRandomStream(91),
      conditionProfile: BALANCED_POC_CONDITIONS,
      maxSteps: 2,
    })
    const directObserve = runEpisodeTrace({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialState,
      firstAction: 'observe',
      policy: () => 'observe',
      random: createEpisodeRandomStream(91),
      conditionProfile: BALANCED_POC_CONDITIONS,
      maxSteps: 1,
    })
    expect(afterFinalAppraisal.steps[0]!.nextCondition).toBe('normal')
    expect(afterFinalAppraisal.steps[1]!.nextCondition).toBe(directObserve.steps[0]!.nextCondition)
  })

  it('uses condition RNG but not success RNG for each Careful Observation', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, specialistCrafter)
    const { random, draws } = trackedRandom()
    const result = runEpisodeTrace({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter: specialistCrafter,
      initialState,
      firstAction: 'carefulObservation',
      policy: () => 'carefulObservation',
      random,
      conditionProfile: FORCED_GOOD_CONDITIONS,
      maxSteps: 4,
    })

    expect(result.actions).toEqual([
      'carefulObservation',
      'carefulObservation',
      'carefulObservation',
    ])
    expect(result.stopReason).toBe('illegal-action')
    expect(result.finalState).toMatchObject({
      step: 1,
      condition: 'good',
      carefulObservationUsesLeft: 0,
    })
    expect(draws).toEqual({ condition: 3, success: 0 })
  })

  it('does not draw either stream for other no-step actions', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, specialistCrafter)
    const { random, draws } = trackedRandom()
    const result = runEpisode({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter: specialistCrafter,
      initialState,
      firstAction: 'heartAndSoul',
      policy: () => 'quickInnovation',
      random,
      conditionProfile: FORCED_GOOD_CONDITIONS,
      maxSteps: 2,
    })

    expect(result.actions).toEqual(['heartAndSoul', 'quickInnovation'])
    expect(result.finalState).toMatchObject({
      step: 1,
      condition: 'normal',
      heartAndSoulActive: true,
      quickInnovationAvailable: false,
    })
    expect(result.finalState.buffs.innovation).toBe(1)
    expect(draws).toEqual({ condition: 0, success: 0 })
  })

  it('keeps Final Appraisal condition-stable and RNG-free', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const { random, draws } = trackedRandom()
    const result = runEpisodeTrace({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialState,
      firstAction: 'finalAppraisal',
      policy: () => null,
      random,
      conditionProfile: FORCED_GOOD_CONDITIONS,
      maxSteps: 1,
    })

    expect(result.steps[0]).toMatchObject({ nextCondition: 'normal' })
    expect(result.finalState).toMatchObject({ step: 1, condition: 'normal' })
    expect(draws).toEqual({ condition: 0, success: 0 })
  })

  it('still draws both streams for an advancing action', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const { random, draws } = trackedRandom()
    const result = runEpisode({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialState,
      firstAction: 'observe',
      policy: () => null,
      random,
      conditionProfile: FORCED_GOOD_CONDITIONS,
      maxSteps: 1,
    })

    expect(result.finalState).toMatchObject({ step: 2, condition: 'good' })
    expect(draws).toEqual({ condition: 1, success: 1 })
  })
})
