import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  previewAction,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import { NORMAL_HEAVY_POC_CONDITIONS } from '@frozen-rabbit-expert/simulator'
import type { EpisodeResult } from '@frozen-rabbit-expert/simulator'
import {
  compareRouteScores,
  corpusSeeds,
  createContinuationMpcPolicyFactory,
  createSafetyProjectedPolicy,
  COMMAND_BREW_POLICY_EVALUATION_CORPORA,
  ELEVATING_PLATFORMS_POLICY_EVALUATION_CORPORA,
  NAILS_POLICY_EVALUATION_CORPORA,
  POLICY_EVALUATION_CORPORA,
  planWithContinuationMpc,
  planWithConsistentContinuation,
  createDefaultContinuationPopulation,
  createDefaultPolicyPopulation,
  encodePolicyState,
  labelPolicyState,
  sampleReachableStates,
  scoreEpisodes,
  targetCrafterSafePolicy,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 722,
  cosmicToolGoodBonus: true,
}

const DEFAULT_POLICY_POPULATION = createDefaultPolicyPopulation(COSMIC_TITANIUM_INGOT_OBJECTIVE)
const DEFAULT_CONTINUATION_POPULATION = createDefaultContinuationPopulation(
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
)

const policies = DEFAULT_POLICY_POPULATION.filter((entry) => (
  ['guide-greedy-v1', 'progress-commit-v1', 'quality-commit-v1'].includes(entry.id)
))

describe('offline practical teacher lab', () => {
  it('keeps evaluation corpora deterministic and non-overlapping', () => {
    const corpusFamilies = [
      POLICY_EVALUATION_CORPORA,
      NAILS_POLICY_EVALUATION_CORPORA,
      ELEVATING_PLATFORMS_POLICY_EVALUATION_CORPORA,
      COMMAND_BREW_POLICY_EVALUATION_CORPORA,
    ] as const
    for (const corpora of corpusFamilies) {
      const allSeeds = corpora.flatMap(corpusSeeds)
      expect(new Set(allSeeds).size).toBe(allSeeds.length)
      expect(corpora.filter((corpus) => corpus.role === 'reserved-final')).toHaveLength(1)
    }
    const everySeed = corpusFamilies.flatMap((corpora) => corpora.flatMap(corpusSeeds))
    expect(new Set(everySeed).size).toBe(everySeed.length)
  })

  it('encodes mechanics-derived equipment boundaries in feature schema v5', () => {
    const state = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const lowerProfile: CrafterProfile = {
      ...crafter,
      craftsmanship: 5380,
      control: 5100,
      maxCp: 700,
      cosmicToolGoodBonus: false,
    }
    expect(encodePolicyState(COSMIC_TITANIUM_INGOT, COSMIC_TITANIUM_INGOT_OBJECTIVE, crafter, state)).not.toEqual(
      encodePolicyState(
        COSMIC_TITANIUM_INGOT,
        COSMIC_TITANIUM_INGOT_OBJECTIVE,
        lowerProfile,
        { ...state, cp: lowerProfile.maxCp },
      ),
    )
  })

  it('samples reproducible reachable states from a policy population', () => {
    const run = () => sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      initialStates: [createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)],
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies,
      seeds: [11, 29],
      maxEpisodeSteps: 24,
      maxStates: 30,
    })
    const first = run()
    const second = run()
    expect(first.length).toBeGreaterThan(5)
    expect(new Set(first.map((sample) => sample.sourcePolicyId)).size).toBeGreaterThan(1)
    expect(new Set(first.map((sample) => sample.objectiveId))).toEqual(
      new Set([COSMIC_TITANIUM_INGOT_OBJECTIVE.objectiveId]),
    )
    expect(first.map((sample) => sample.id)).toEqual(second.map((sample) => sample.id))
    expect(first.map((sample) => sample.state)).toEqual(second.map((sample) => sample.state))
  })

  it('keeps distinct remaining buff durations in the sampled corpus', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const samples = sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      initialStates: [
        { ...initial, step: 8, buffs: { ...initial.buffs, innovation: 1 } },
        { ...initial, step: 8, buffs: { ...initial.buffs, innovation: 3 } },
      ],
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies: [{ id: 'observe-only', policy: () => 'observe' }],
      seeds: [11],
      maxEpisodeSteps: 1,
      maxStates: 4,
    })
    expect(new Set(samples.map((sample) => sample.state.buffs.innovation))).toEqual(new Set([1, 3]))
  })

  it('binds the declared objective and rejects evidence identities that would merge silently', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    let observedRequiredQuality = -1
    const objectiveProbe = {
      id: 'objective-probe',
      policy: (recipe: typeof COSMIC_TITANIUM_INGOT) => {
        observedRequiredQuality = recipe.requiredQuality
        return 'observe' as const
      },
    }
    sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      initialStates: [initial],
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies: [objectiveProbe],
      seeds: [11],
      maxEpisodeSteps: 1,
      maxStates: 1,
    })
    expect(observedRequiredQuality).toBe(COSMIC_TITANIUM_INGOT_OBJECTIVE.qualityTarget)

    expect(() => sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      initialStates: [initial],
      profiles: [NORMAL_HEAVY_POC_CONDITIONS, NORMAL_HEAVY_POC_CONDITIONS],
      policies: [objectiveProbe],
      seeds: [11],
      maxEpisodeSteps: 1,
      maxStates: 1,
    })).toThrow(/duplicate reachable-state profile id/)

    expect(() => labelPolicyState(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      initial,
      {
        profiles: [NORMAL_HEAVY_POC_CONDITIONS],
        policies: [objectiveProbe, objectiveProbe],
        samplesPerProfile: 1,
        maxEpisodeSteps: 1,
        seed: 11,
      },
    )).toThrow(/duplicate label policy id/)
  })

  it('does not merge reachable states with different one-use action resources', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, {
      ...crafter,
      specialist: true,
    })
    const samples = sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter: { ...crafter, specialist: true },
      initialStates: [
        initial,
        {
          ...initial,
          trainedPerfectionAvailable: false,
          carefulObservationUsesLeft: 1,
          heartAndSoulAvailable: false,
          quickInnovationAvailable: false,
        },
      ],
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies: [{ id: 'observe-only', policy: () => 'observe' }],
      seeds: [11],
      maxEpisodeSteps: 1,
      maxStates: 4,
    })
    expect(samples).toHaveLength(2)
    expect(new Set(samples.map((sample) => sample.state.quickInnovationAvailable)))
      .toEqual(new Set([true, false]))
  })

  it('keeps an active Pliant buff refresh available for route comparison', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const current = {
      ...initial,
      step: 18,
      progress: 6200,
      quality: 7000,
      durability: 20,
      cp: 240,
      innerQuiet: 7,
      condition: 'pliant' as const,
      buffs: { ...initial.buffs, manipulation: 3 },
    }
    const label = labelPolicyState(COSMIC_TITANIUM_INGOT, COSMIC_TITANIUM_INGOT_OBJECTIVE, crafter, current, {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies: [{ id: 'target', policy: targetCrafterSafePolicy }],
      samplesPerProfile: 1,
      maxEpisodeSteps: 16,
      seed: 91,
    })
    expect(label).not.toBeNull()
    expect(label!.objectiveId).toBe(COSMIC_TITANIUM_INGOT_OBJECTIVE.objectiveId)
    expect([label!.best, ...label!.alternatives].map((candidate) => candidate.action)).toContain('manipulation')
  })

  it('keeps a dual-gain action that completes progress and quality together', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const setup = {
      ...initial,
      step: 20,
      progress: 6000,
      quality: 17000,
      durability: 20,
      cp: 300,
      innerQuiet: 10,
    }
    const delicate = previewAction(COSMIC_TITANIUM_INGOT, crafter, setup, 'delicateSynthesis')
    const current = {
      ...setup,
      progress: COSMIC_TITANIUM_INGOT.progressRequired - Math.max(1, Math.floor(delicate.progressGain / 2)),
      quality: COSMIC_TITANIUM_INGOT.requiredQuality - Math.max(1, Math.floor(delicate.qualityGain / 2)),
    }
    const label = labelPolicyState(COSMIC_TITANIUM_INGOT, COSMIC_TITANIUM_INGOT_OBJECTIVE, crafter, current, {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies: [{ id: 'target', policy: targetCrafterSafePolicy }],
      samplesPerProfile: 1,
      maxEpisodeSteps: 4,
      seed: 91,
    })
    expect(label).not.toBeNull()
    expect([label!.best, ...label!.alternatives].map((candidate) => candidate.action)).toContain('delicateSynthesis')
  })

  it('does not reward a zero-completion route merely for stalling sooner', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const episode = (steps: number): EpisodeResult => ({
      terminal: 'none',
      finalState: initial,
      actions: Array.from({ length: steps }, () => 'observe' as const),
      stoppedByLimit: false,
      stopReason: 'policy-null',
    })
    const short = scoreEpisodes(
      COSMIC_TITANIUM_INGOT,
      new Map([[NORMAL_HEAVY_POC_CONDITIONS.id, [episode(1)]]]),
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
    )
    const long = scoreEpisodes(
      COSMIC_TITANIUM_INGOT,
      new Map([[NORMAL_HEAVY_POC_CONDITIONS.id, [episode(10)]]]),
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
    )
    expect(short.stopReasonRates['policy-null']).toBe(1)
    expect(short.averageSuccessfulSteps).toBeNull()
    expect(compareRouteScores(short, long)).toBe(0)
  })

  it('prefers fewer successful actions before leftover CP and durability', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const completed = (steps: number, cp: number, durability: number): EpisodeResult => ({
      terminal: 'completed',
      finalState: {
        ...initial,
        progress: COSMIC_TITANIUM_INGOT.progressRequired,
        quality: COSMIC_TITANIUM_INGOT.requiredQuality,
        cp,
        durability,
        terminal: 'completed',
      },
      actions: Array.from({ length: steps }, () => 'basicSynthesis' as const),
      stoppedByLimit: false,
      stopReason: 'completed',
    })
    const score = (episode: EpisodeResult) => scoreEpisodes(
      COSMIC_TITANIUM_INGOT,
      new Map([[NORMAL_HEAVY_POC_CONDITIONS.id, [episode]]]),
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
    )

    const shorter = score(completed(24, 0, 5))
    const longerWithMoreResources = score(completed(25, 100, 20))

    expect(compareRouteScores(shorter, longerWithMoreResources)).toBeGreaterThan(0)
  })

  it('does not treat terminal failure as healthy finishability', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const stalled: EpisodeResult = {
      terminal: 'none',
      finalState: {
        ...initial,
        progress: COSMIC_TITANIUM_INGOT.progressRequired * 0.5,
        quality: COSMIC_TITANIUM_INGOT.requiredQuality * 0.5,
      },
      actions: ['observe'],
      stoppedByLimit: false,
      stopReason: 'policy-null',
    }
    const failed: EpisodeResult = {
      terminal: 'failed',
      finalState: {
        ...initial,
        terminal: 'failed',
        progress: COSMIC_TITANIUM_INGOT.progressRequired * 0.9,
        quality: COSMIC_TITANIUM_INGOT.requiredQuality * 0.9,
      },
      actions: ['observe'],
      stoppedByLimit: false,
      stopReason: 'failed',
    }
    const score = (episode: EpisodeResult) => scoreEpisodes(
      COSMIC_TITANIUM_INGOT,
      new Map([[NORMAL_HEAVY_POC_CONDITIONS.id, [episode]]]),
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
    )
    expect(score(failed).lowerTailBalance).toBe(0)
    expect(score(stalled).lowerTailBalance).toBe(0)
    expect(score(stalled).hardStopRate).toBe(1)
    expect(compareRouteScores(score(stalled), score(failed))).toBe(0)
  })

  it('scores an explicit objective when mechanics required quality is zero', () => {
    const adaptiveRecipe = { ...COSMIC_TITANIUM_INGOT, requiredQuality: 0 }
    const initial = createInitialCraftState(adaptiveRecipe, crafter)
    const episode: EpisodeResult = {
      terminal: 'none',
      finalState: { ...initial, progress: adaptiveRecipe.progressRequired / 2, quality: 9_000 },
      actions: ['observe'],
      stoppedByLimit: true,
      stopReason: 'action-limit',
    }
    const episodes = new Map([[NORMAL_HEAVY_POC_CONDITIONS.id, [episode]]])
    const score = scoreEpisodes(adaptiveRecipe, episodes, {
      objectiveId: 'adaptive-test-v1',
      recipeProfileId: adaptiveRecipe.profileId,
      mode: 'maximize-quality-with-safe-completion',
      qualityTarget: 18_000,
      qualityTiers: [
        { id: 'maximum', minimumQuality: 18_000, minimumCollectability: 1_800 },
      ],
      source: adaptiveRecipe.source,
    })
    expect(score.averageViableQualityRatio).toBe(0.5)
  })

  it('keeps one coherent continuation identity in direct rollout planning', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const continuation = { id: 'target-route', policy: targetCrafterSafePolicy }
    const plan = planWithConsistentContinuation(COSMIC_TITANIUM_INGOT, crafter, initial, {
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      continuation,
      samplesPerProfile: 1,
      maxEpisodeSteps: 20,
      seed: 91,
    })
    expect(plan).not.toBeNull()
    expect(plan!.continuationPolicyId).toBe(continuation.id)
    expect(plan!.episodeCountPerCandidate).toBe(1)
    expect(['completion-supported', 'finishability-surrogate']).toContain(plan!.evidence)
  })

  it('keeps action and continuation identity together in continuation MPC', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const continuations = DEFAULT_CONTINUATION_POPULATION.slice(0, 3)
    const options = {
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      continuations,
      samplesPerProfile: 1,
      maxEpisodeSteps: 20,
      seed: 91,
    }
    const plan = planWithContinuationMpc(COSMIC_TITANIUM_INGOT, crafter, initial, options)
    expect(plan).not.toBeNull()
    expect(continuations.map((entry) => entry.id)).toContain(plan!.continuationPolicyId)
    expect(plan!.episodeCountPerCandidate).toBe(1)
    expect(plan!.alternatives.every((alternative) => (
      continuations.some((entry) => entry.id === alternative.continuationPolicyId)
    ))).toBe(true)
    expect(createContinuationMpcPolicyFactory(options)()(COSMIC_TITANIUM_INGOT, crafter, initial)).toBe(plan!.action)
  })

  it('projects unsafe rollout tails through the same explicit fallback', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const repeatedObserve = { ...initial, step: 10, comboFrom: 'observe' as const }
    const unsafe = createSafetyProjectedPolicy(() => 'observe')
    const withFallback = createSafetyProjectedPolicy(() => 'observe', () => 'basicTouch')
    expect(unsafe(COSMIC_TITANIUM_INGOT, crafter, repeatedObserve)).toBeNull()
    expect(withFallback(COSMIC_TITANIUM_INGOT, crafter, repeatedObserve)).toBe('basicTouch')
  })

  it('uses declared continuation priority instead of policy-id spelling for exact ties', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const plan = planWithContinuationMpc(COSMIC_TITANIUM_INGOT, crafter, initial, {
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      continuations: [
        { id: 'z-first', policy: targetCrafterSafePolicy },
        { id: 'a-second', policy: targetCrafterSafePolicy },
      ],
      samplesPerProfile: 1,
      maxEpisodeSteps: 20,
      seed: 91,
    })
    expect(plan?.continuationPolicyId).toBe('z-first')
  })

})
