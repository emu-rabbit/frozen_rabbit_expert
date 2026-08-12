import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
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
  DEFAULT_CONTINUATION_POPULATION,
  ELEVATING_PLATFORMS_POLICY_EVALUATION_CORPORA,
  NAILS_POLICY_EVALUATION_CORPORA,
  POLICY_EVALUATION_CORPORA,
  planWithContinuationMpc,
  planWithConsistentContinuation,
  DEFAULT_POLICY_POPULATION,
  baselinePolicy,
  decidePromotion,
  evaluatePolicyHeldOut,
  encodePolicyState,
  recommendCompactAction,
  labelPolicyState,
  sampleReachableStates,
  scoreEpisodes,
  trainCompactScorer,
  targetCrafterSafePolicy,
  assertCompactScorerCompatible,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 722,
  cosmicToolGoodBonus: true,
}

const policies = DEFAULT_POLICY_POPULATION.filter((entry) => (
  ['guide-greedy-v1', 'progress-commit-v1', 'quality-commit-v1'].includes(entry.id)
))

describe('offline practical teacher lab', () => {
  it('keeps evaluation corpora deterministic and non-overlapping', () => {
    const corpusFamilies = [
      POLICY_EVALUATION_CORPORA,
      NAILS_POLICY_EVALUATION_CORPORA,
      ELEVATING_PLATFORMS_POLICY_EVALUATION_CORPORA,
    ] as const
    for (const corpora of corpusFamilies) {
      const allSeeds = corpora.flatMap(corpusSeeds)
      expect(new Set(allSeeds).size).toBe(allSeeds.length)
      expect(corpora.filter((corpus) => corpus.role === 'reserved-final')).toHaveLength(1)
    }
    const everySeed = corpusFamilies.flatMap((corpora) => corpora.flatMap(corpusSeeds))
    expect(new Set(everySeed).size).toBe(everySeed.length)
  })

  it('uses a protected Muscle Memory opener for the target crafter', () => {
    let current = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    expect(targetCrafterSafePolicy(COSMIC_TITANIUM_INGOT, crafter, current)).toBe('muscleMemory')
    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'muscleMemory', {
      success: true,
      nextCondition: 'normal',
    }).nextState
    expect(targetCrafterSafePolicy(COSMIC_TITANIUM_INGOT, crafter, current)).toBe('trainedPerfection')
    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'trainedPerfection', {
      success: true,
      nextCondition: 'normal',
    }).nextState
    expect(targetCrafterSafePolicy(COSMIC_TITANIUM_INGOT, crafter, current)).toBe('veneration')
  })

  it('uses each condition to advance the current phase instead of abandoning it', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const progressState = {
      ...initial,
      step: 8,
      progress: 4200,
      quality: 3500,
      durability: 30,
      cp: 500,
    }
    expect(targetCrafterSafePolicy(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...progressState, condition: 'good' },
    )).toBe('intensiveSynthesis')
    expect(targetCrafterSafePolicy(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...progressState, condition: 'centered' },
    )).toBe('rapidSynthesis')

    const qualityState = { ...progressState, progress: 6200 }
    expect(targetCrafterSafePolicy(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...qualityState, condition: 'good' },
    )).toBe('preciseTouch')
    expect(targetCrafterSafePolicy(
      COSMIC_TITANIUM_INGOT,
      crafter,
      { ...qualityState, condition: 'sturdy' },
    )).toBe('preparatoryTouch')
  })

  it('encodes mechanics-derived equipment boundaries in feature schema v2', () => {
    const state = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const lowerProfile: CrafterProfile = {
      ...crafter,
      craftsmanship: 5380,
      control: 5100,
      maxCp: 700,
      cosmicToolGoodBonus: false,
    }
    expect(encodePolicyState(COSMIC_TITANIUM_INGOT, crafter, state)).not.toEqual(
      encodePolicyState(COSMIC_TITANIUM_INGOT, lowerProfile, { ...state, cp: lowerProfile.maxCp }),
    )
  })

  it('samples reproducible reachable states from a policy population', () => {
    const run = () => sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
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
    expect(first.map((sample) => sample.id)).toEqual(second.map((sample) => sample.id))
    expect(first.map((sample) => sample.state)).toEqual(second.map((sample) => sample.state))
  })

  it('keeps distinct remaining buff durations in the sampled corpus', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const samples = sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
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
    const label = labelPolicyState(COSMIC_TITANIUM_INGOT, crafter, current, {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies: [{ id: 'target', policy: targetCrafterSafePolicy }],
      samplesPerProfile: 1,
      maxEpisodeSteps: 16,
      seed: 91,
    })
    expect(label).not.toBeNull()
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
    const label = labelPolicyState(COSMIC_TITANIUM_INGOT, crafter, current, {
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
    )
    const long = scoreEpisodes(
      COSMIC_TITANIUM_INGOT,
      new Map([[NORMAL_HEAVY_POC_CONDITIONS.id, [episode(10)]]]),
    )
    expect(short.stopReasonRates['policy-null']).toBe(1)
    expect(short.averageSuccessfulSteps).toBeNull()
    expect(compareRouteScores(short, long)).toBe(0)
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
    )
    expect(score(failed).lowerTailBalance).toBe(0)
    expect(score(stalled).lowerTailBalance).toBe(0)
    expect(score(stalled).hardStopRate).toBe(1)
    expect(compareRouteScores(score(stalled), score(failed))).toBe(0)
  })

  it('requires a scenario objective when mechanics required quality is zero', () => {
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
    expect(() => scoreEpisodes(adaptiveRecipe, episodes)).toThrow(/CraftObjective/)

    const score = scoreEpisodes(adaptiveRecipe, episodes, {
      objectiveId: 'adaptive-test-v1',
      recipeProfileId: adaptiveRecipe.profileId,
      mode: 'maximize-quality-with-safe-completion',
      qualityTarget: 18_000,
      qualityTiers: [],
      source: adaptiveRecipe.source,
    })
    expect(score.averageViableQualityRatio).toBe(0.5)
  })

  it('keeps one coherent continuation identity in direct rollout planning', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const continuation = { id: 'target-route', policy: targetCrafterSafePolicy }
    const plan = planWithConsistentContinuation(COSMIC_TITANIUM_INGOT, crafter, initial, {
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

  it('labels the rejected live states from full route outcomes instead of greedy continuation alone', () => {
    let current = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'reflect', {
      success: true,
      nextCondition: 'normal',
    }).nextState
    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'veneration', {
      success: true,
      nextCondition: 'normal',
    }).nextState

    const options = {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies: policies.slice(0, 1),
      samplesPerProfile: 1,
      maxEpisodeSteps: 20,
      seed: 1786440942,
    }
    const venerationLabel = labelPolicyState(COSMIC_TITANIUM_INGOT, crafter, current, options)
    expect(venerationLabel).not.toBeNull()
    expect(venerationLabel!.best.action).not.toBe('wasteNot2')

    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'wasteNot2', {
      success: true,
      nextCondition: 'good',
    }).nextState
    const goodLabel = labelPolicyState(COSMIC_TITANIUM_INGOT, crafter, current, options)
    expect(goodLabel).not.toBeNull()
    expect(goodLabel!.best.action).not.toBe('manipulation')
    console.info(`offline labels: veneration=${venerationLabel!.best.action}/${venerationLabel!.best.continuationPolicyId}, good=${goodLabel!.best.action}/${goodLabel!.best.continuationPolicyId}`)

    const artifact = trainCompactScorer(
      COSMIC_TITANIUM_INGOT,
      crafter,
      [venerationLabel!, goodLabel!],
      { epochs: 300, learningRate: 0.1, seed: 7 },
    )
    expect(artifact.training.examples).toBe(2)
    expect(artifact.recipeProfileId).toBe(COSMIC_TITANIUM_INGOT.profileId)
    expect(artifact.crafterProfile).toEqual(crafter)
    expect(() => assertCompactScorerCompatible(
      artifact,
      COSMIC_TITANIUM_INGOT,
      { ...crafter, maxCp: crafter.maxCp + 27 },
    )).toThrow('crafter profile mismatch')
    expect(recommendCompactAction(artifact, COSMIC_TITANIUM_INGOT, crafter, venerationLabel!.state)).toBe(venerationLabel!.best.action)
    expect(recommendCompactAction(artifact, COSMIC_TITANIUM_INGOT, crafter, goodLabel!.state)).toBe(goodLabel!.best.action)

    const initialStates = [createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)]
    const heldOutOptions = {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      seeds: [101, 211],
      maxEpisodeSteps: 32,
    }
    const baselineResult = evaluatePolicyHeldOut(
      COSMIC_TITANIUM_INGOT,
      crafter,
      initialStates,
      () => baselinePolicy,
      heldOutOptions,
    )
    const compactResult = evaluatePolicyHeldOut(
      COSMIC_TITANIUM_INGOT,
      crafter,
      initialStates,
      () => (recipe, profile, state) => recommendCompactAction(artifact, recipe, profile, state),
      heldOutOptions,
    )
    const promotion = decidePromotion(baselineResult, compactResult, 0)
    expect(promotion.promote).toBe(false)
    expect(promotion.reasons).toContain('no-robust-completion-gain')
  }, 15_000)
})
