import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  NORMAL_HEAVY_POC_CONDITIONS,
  createEpisodeRandomStream,
} from '@frozen-rabbit-expert/simulator'
import {
  createVideoInformedMainlineController,
  planWithRouteOptionRollouts,
  runRouteOptionEpisode,
  type PlannerContext,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

const context: PlannerContext = {
  recipe: COSMIC_TITANIUM_INGOT,
  objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
  crafter,
}

describe('route option episode adapter and rollout planner', () => {
  it('advances the option budget once per simulated observed transition', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const episode = runRouteOptionEpisode({
      context,
      initialState: initial,
      firstAction: 'muscleMemory',
      controllerOptions: { actionBudgets: { 'progress-window': 1 } },
      random: createEpisodeRandomStream(91),
      conditionProfile: NORMAL_HEAVY_POC_CONDITIONS,
      maxActions: 8,
    })

    expect(episode.actions).toEqual(['muscleMemory'])
    expect(episode.stopReason).toBe('policy-null')
    expect(episode.controllerMemory.totalObservedTransitions).toBe(1)
    expect(episode.controllerMemory.activeOption.actionsUsed).toBe(1)
    expect(episode.controllerMemory.terminationReason).toBe('action-budget-exhausted')
  })

  it('scores multiple root actions with isolated copies of one committed option route', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const controller = createVideoInformedMainlineController(context, initial)
    const initialMemory = controller.snapshot()
    initialMemory.activeOption.actionsUsed = initialMemory.activeOption.actionBudget - 1
    const before = JSON.parse(JSON.stringify(initialMemory))

    const plan = planWithRouteOptionRollouts(context, initial, {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      samplesPerProfile: 1,
      maxEpisodeActions: 4,
      seed: 117,
      initialMemory,
    })

    expect(plan).not.toBeNull()
    expect(plan!.optionId).toBe('progress-window')
    expect(plan!.alternatives.length).toBeGreaterThan(0)
    expect(plan!.remainingOptionActions).toBe(1)
    expect(plan!.episodeCountPerCandidate).toBe(1)
    expect(plan!.score.stopReasonRates['policy-null']).toBe(1)
    expect(plan!.alternatives.every((candidate) => (
      candidate.optionId === 'progress-window'
      && candidate.score.stopReasonRates['policy-null'] === 1
    ))).toBe(true)
    expect(initialMemory).toEqual(before)
  })

  it('rejects a condition model that can emit conditions unavailable to the recipe', () => {
    expect(() => runRouteOptionEpisode({
      context,
      initialState: createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter),
      random: createEpisodeRandomStream(91),
      conditionProfile: {
        ...NORMAL_HEAVY_POC_CONDITIONS,
        id: 'invalid-elevating-condition-for-ingot',
        weights: { normal: 1, goodOmen: 1 },
      },
      maxActions: 1,
    })).toThrow(/unavailable condition/)
  })
})
