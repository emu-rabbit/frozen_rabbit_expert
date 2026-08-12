import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  NORMAL_HEAVY_POC_CONDITIONS,
  type EpisodeRandomStream,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import {
  createGuideIntegratedDecisionMemory,
  planWithGuideContinuation,
  runGuideContinuationEpisode,
  type GuideContinuationCandidateEvaluation,
  type GuideContinuationPlan,
} from '../src'

const recipe = COSMIC_TITANIUM_INGOT
const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

function deterministicRandom(): EpisodeRandomStream {
  return {
    nextCondition: () => 0.5,
    nextSuccess: () => 0,
  }
}

function rankedCandidates(plan: GuideContinuationPlan): GuideContinuationCandidateEvaluation[] {
  return [{
    action: plan.action,
    score: plan.score,
    episodeCount: plan.episodeCountPerCandidate,
    decisionMemoryAfterAction: plan.decisionMemoryAfterAction,
    endingDecisionMemories: plan.endingDecisionMemories,
  }, ...plan.alternatives]
}

function candidateByAction(
  plan: GuideContinuationPlan,
  action: CraftActionId,
): GuideContinuationCandidateEvaluation {
  const candidate = rankedCandidates(plan).find((entry) => entry.action === action)
  if (candidate === undefined) throw new Error(`missing candidate ${action}`)
  return candidate
}

describe('guide continuation planner', () => {
  it('updates first-action memory exactly once before guide continuation', () => {
    const initialState = {
      ...createInitialCraftState(recipe, crafter),
      step: 2,
    }
    const startingDecisionMemory = createGuideIntegratedDecisionMemory()
    const episode = runGuideContinuationEpisode({
      recipe,
      crafter,
      initialState,
      firstAction: 'wasteNot2',
      startingDecisionMemory,
      random: deterministicRandom(),
      conditionProfile: NORMAL_HEAVY_POC_CONDITIONS,
      maxEpisodeSteps: 1,
    })

    expect(episode.actions).toEqual(['wasteNot2'])
    expect(episode.startingDecisionMemory.wasteNotUses).toBe(0)
    expect(episode.decisionMemoryAfterFirstAction.wasteNotUses).toBe(1)
    expect(episode.endingDecisionMemory.wasteNotUses).toBe(1)
    expect(startingDecisionMemory.wasteNotUses).toBe(0)
  })

  it('evaluates every legal safe root with isolated memory per candidate and sample', () => {
    const initialState = {
      ...createInitialCraftState(recipe, crafter),
      step: 2,
    }
    const startingDecisionMemory = createGuideIntegratedDecisionMemory()
    const plan = planWithGuideContinuation(recipe, crafter, initialState, {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      samplesPerProfile: 3,
      maxEpisodeSteps: 1,
      seed: 0x4755_4944,
      startingDecisionMemory,
    })

    expect(plan).not.toBeNull()
    const expectedActions = legalActions(recipe, crafter, initialState).filter((action) => {
      const preview = previewAction(recipe, crafter, initialState, action)
      return isPolicyActionSafe(recipe, crafter, initialState, action, preview)
    })
    expect(rankedCandidates(plan!).map((candidate) => candidate.action).sort()).toEqual(
      [...expectedActions].sort(),
    )
    expect(plan!.startingDecisionMemory).toEqual(startingDecisionMemory)
    expect(startingDecisionMemory).toEqual(createGuideIntegratedDecisionMemory())
    const pairedSeeds = rankedCandidates(plan!).map((candidate) => (
      candidate.endingDecisionMemories.map((ending) => ending.pairedSeed)
    ))
    expect(pairedSeeds.every((seeds) => JSON.stringify(seeds) === JSON.stringify(pairedSeeds[0]))).toBe(true)

    const expectedCounters = [
      ['wasteNot', 'wasteNotUses'],
      ['wasteNot2', 'wasteNotUses'],
      ['manipulation', 'manipulationUses'],
      ['innovation', 'innovationUses'],
      ['greatStrides', 'greatStridesUses'],
    ] as const
    for (const [action, counter] of expectedCounters) {
      const candidate = candidateByAction(plan!, action)
      expect(candidate.decisionMemoryAfterAction[counter], action).toBe(1)
      expect(candidate.endingDecisionMemories, action).toHaveLength(3)
      expect(candidate.endingDecisionMemories.every((ending) => ending.memory[counter] === 1), action).toBe(true)
    }
    const ordinary = candidateByAction(plan!, 'basicSynthesis')
    expect(ordinary.endingDecisionMemories.every((ending) => (
      ending.memory.wasteNotUses === 0
      && ending.memory.manipulationUses === 0
      && ending.memory.innovationUses === 0
      && ending.memory.greatStridesUses === 0
    ))).toBe(true)
  })

  it('is deterministic from its research seed without consuming a live random stream', () => {
    const state = createInitialCraftState(recipe, crafter)
    const options = {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      samplesPerProfile: 2,
      maxEpisodeSteps: 4,
      seed: 917,
    } as const

    const first = planWithGuideContinuation(recipe, crafter, state, options)
    const second = planWithGuideContinuation(recipe, crafter, state, options)
    expect(second).toEqual(first)
    expect(first?.episodeCountPerCandidate).toBe(2)
    expect(first?.alternatives.length).toBeGreaterThan(0)
  })
})
