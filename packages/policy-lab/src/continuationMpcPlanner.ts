import {
  previewAction,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  runEpisode,
  type EpisodePolicy,
  type EpisodeResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import { compareRouteScores, scoreEpisodes } from './objective'
import { createSafetyProjectedPolicy } from './safePolicyProjection'
import type { CandidateRouteLabel, PolicyPopulationEntry } from './types'

export const CONTINUATION_MPC_PLANNER_VERSION = 'continuation-mpc-planner-v0.1.0'
export const COMMITTED_CONTINUATION_SELECTOR_VERSION = 'committed-continuation-selector-v0.1.0'

export interface ContinuationMpcPlannerOptions {
  profiles: readonly WeightedConditionProfile[]
  continuations: readonly PolicyPopulationEntry[]
  samplesPerProfile: number
  maxEpisodeSteps: number
  seed: number
  previousContinuationPolicyId?: string
  continuationFallbackPolicy?: EpisodePolicy
}

export interface ContinuationMpcPlan {
  version: typeof CONTINUATION_MPC_PLANNER_VERSION
  action: CandidateRouteLabel['action']
  continuationPolicyId: string
  score: CandidateRouteLabel['score']
  alternatives: CandidateRouteLabel[]
  episodeCountPerCandidate: number
  evidence: 'completion-supported' | 'finishability-surrogate'
}

function stateSeed(state: CraftState): number {
  const serialized = JSON.stringify(state)
  let hash = 0x811c_9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return hash >>> 0
}

/**
 * Compares route-aware `(continuation, proposed action)` pairs with common
 * random numbers. Identical root actions remain separate when their closed-loop
 * continuations differ, avoiding the identity loss in the rejected classifier.
 *
 * Current continuation policies are still weak research baselines. This API is
 * the MPC scaffold on which stateful option contracts will replace them.
 */
export function planWithContinuationMpc(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: ContinuationMpcPlannerOptions,
): ContinuationMpcPlan | null {
  if (state.terminal !== 'none') return null
  const candidates = options.continuations.flatMap((continuation) => {
    const action = continuation.policy(recipe, crafter, state)
    if (action === null) return []
    const preview = previewAction(recipe, crafter, state, action)
    if (!preview.legal || !isPolicyActionSafe(recipe, crafter, state, action, preview)) return []
    return [{ action, continuation }]
  })
  if (candidates.length === 0) return null

  const baseSeed = options.seed ^ stateSeed(state)
  const continuationOrder = new Map(options.continuations.map((entry, index) => [entry.id, index]))
  const labels: CandidateRouteLabel[] = candidates.map(({ action, continuation }) => {
    const continuationPolicy = createSafetyProjectedPolicy(
      continuation.policy,
      options.continuationFallbackPolicy,
    )
    const episodesByProfile = new Map<string, EpisodeResult[]>()
    for (const [profileIndex, profile] of options.profiles.entries()) {
      const episodes: EpisodeResult[] = []
      for (let sample = 0; sample < options.samplesPerProfile; sample += 1) {
        const seed = baseSeed
          ^ Math.imul(profileIndex + 1, 0x85eb_ca6b)
          ^ Math.imul(sample + 1, 0x9e37_79b1)
        episodes.push(runEpisode({
          recipe,
          crafter,
          initialState: state,
          firstAction: action,
          policy: continuationPolicy,
          random: createEpisodeRandomStream(seed),
          conditionProfile: profile,
          maxSteps: options.maxEpisodeSteps,
        }))
      }
      episodesByProfile.set(profile.id, episodes)
    }
    return {
      action,
      continuationPolicyId: continuation.id,
      score: scoreEpisodes(recipe, episodesByProfile),
      episodeCount: options.profiles.length * options.samplesPerProfile,
    }
  })
  labels.sort((left, right) => (
    compareRouteScores(right.score, left.score)
    || Number(right.continuationPolicyId === options.previousContinuationPolicyId)
      - Number(left.continuationPolicyId === options.previousContinuationPolicyId)
    || (continuationOrder.get(left.continuationPolicyId) ?? Number.MAX_SAFE_INTEGER)
      - (continuationOrder.get(right.continuationPolicyId) ?? Number.MAX_SAFE_INTEGER)
    || left.action.localeCompare(right.action)
  ))
  const best = labels[0]
  if (!best) return null
  return {
    version: CONTINUATION_MPC_PLANNER_VERSION,
    action: best.action,
    continuationPolicyId: best.continuationPolicyId,
    score: best.score,
    alternatives: labels.slice(1),
    episodeCountPerCandidate: best.episodeCount,
    evidence: best.score.averageCompletionRate > 0
      ? 'completion-supported'
      : 'finishability-surrogate',
  }
}

export function createContinuationMpcPolicyFactory(
  options: Omit<ContinuationMpcPlannerOptions, 'previousContinuationPolicyId'>,
  fallbackPolicy: EpisodePolicy = () => null,
): () => EpisodePolicy {
  return () => {
    let previousContinuationPolicyId: string | undefined
    return (recipe, crafter, state) => {
      const plan = planWithContinuationMpc(recipe, crafter, state, {
        ...options,
        continuationFallbackPolicy: options.continuationFallbackPolicy ?? fallbackPolicy,
        ...(previousContinuationPolicyId === undefined ? {} : { previousContinuationPolicyId }),
      })
      if (plan === null) return fallbackPolicy(recipe, crafter, state)
      previousContinuationPolicyId = plan.continuationPolicyId
      return plan.action
    }
  }
}

/**
 * Selects a whole-episode controller once, then executes the same controller
 * that was valued. This intentionally simple control is a consistency
 * baseline for future option boundaries; it must not be confused with a
 * stateful option graph.
 */
export function createCommittedContinuationPolicyFactory(
  options: Omit<ContinuationMpcPlannerOptions, 'previousContinuationPolicyId'>,
  fallbackPolicy: EpisodePolicy = () => null,
): () => EpisodePolicy {
  return () => {
    let committed: PolicyPopulationEntry | undefined
    return (recipe, crafter, state) => {
      if (committed !== undefined) {
        return createSafetyProjectedPolicy(committed.policy, fallbackPolicy)(recipe, crafter, state)
      }
      const plan = planWithContinuationMpc(recipe, crafter, state, {
        ...options,
        continuationFallbackPolicy: options.continuationFallbackPolicy ?? fallbackPolicy,
      })
      if (plan === null) return fallbackPolicy(recipe, crafter, state)
      committed = options.continuations.find((entry) => entry.id === plan.continuationPolicyId)
      if (committed === undefined) throw new Error(`missing continuation: ${plan.continuationPolicyId}`)
      return plan.action
    }
  }
}
