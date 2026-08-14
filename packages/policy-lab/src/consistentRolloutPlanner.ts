import type {
  CraftObjective,
  CrafterProfile,
  CraftState,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { EpisodePolicy, WeightedConditionProfile } from '@frozen-rabbit-expert/simulator'
import { labelPolicyState } from './labelStates'
import { bindEpisodePolicyObjective } from './objective'
import type { CandidateRouteLabel, PolicyPopulationEntry } from './types'

export const CONSISTENT_ROLLOUT_PLANNER_VERSION = 'consistent-continuation-rollout-planner-v0.2.0'

export interface ConsistentRolloutPlannerOptions {
  objective: Readonly<CraftObjective>
  profiles: readonly WeightedConditionProfile[]
  continuation: PolicyPopulationEntry
  samplesPerProfile: number
  maxEpisodeSteps: number
  seed: number
}

export interface ConsistentRolloutPlan {
  version: typeof CONSISTENT_ROLLOUT_PLANNER_VERSION
  action: CandidateRouteLabel['action']
  continuationPolicyId: string
  score: CandidateRouteLabel['score']
  alternatives: CandidateRouteLabel[]
  episodeCountPerCandidate: number
  evidence: 'completion-supported' | 'finishability-surrogate'
}

/**
 * Performs an exact one-step rollout improvement over one coherent
 * continuation policy. Unlike the rejected action classifier, the route used
 * to value every candidate is explicit and identical, so labels cannot silently
 * splice together incompatible continuation policies.
 *
 * This is research-only. It is a deterministic, fixed-compute stepping stone
 * toward option-conditioned MPC, not a promoted runtime policy.
 */
export function planWithConsistentContinuation(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: ConsistentRolloutPlannerOptions,
): ConsistentRolloutPlan | null {
  const label = labelPolicyState(recipe, options.objective, crafter, state, {
    profiles: options.profiles,
    policies: [options.continuation],
    samplesPerProfile: options.samplesPerProfile,
    maxEpisodeSteps: options.maxEpisodeSteps,
    seed: options.seed,
  })
  if (label === null) return null
  return {
    version: CONSISTENT_ROLLOUT_PLANNER_VERSION,
    action: label.best.action,
    continuationPolicyId: label.best.continuationPolicyId,
    score: label.best.score,
    alternatives: label.alternatives,
    episodeCountPerCandidate: label.best.episodeCount,
    evidence: label.best.score.averageCompletionRate > 0
      ? 'completion-supported'
      : 'finishability-surrogate',
  }
}

export function createConsistentRolloutPolicy(
  options: ConsistentRolloutPlannerOptions,
): EpisodePolicy {
  const cache = new Map<string, ConsistentRolloutPlan | null>()
  const objectiveContinuation = bindEpisodePolicyObjective(
    options.objective,
    options.continuation.policy,
  )
  return (recipe, crafter, state) => {
    const key = JSON.stringify({ recipe: recipe.profileId, crafter, state })
    let plan = cache.get(key)
    if (plan === undefined) {
      plan = planWithConsistentContinuation(recipe, crafter, state, options)
      cache.set(key, plan)
    }
    return plan?.action ?? objectiveContinuation(recipe, crafter, state)
  }
}
