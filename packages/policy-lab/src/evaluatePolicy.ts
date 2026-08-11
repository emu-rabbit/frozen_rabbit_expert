import type { CrafterProfile, CraftState, RecipeProfile } from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  runEpisode,
  type EpisodePolicy,
  type EpisodeResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { compareRouteScores, scoreEpisodes } from './objective'
import type { RouteScore } from './types'

export interface HeldOutEvaluationOptions {
  profiles: readonly WeightedConditionProfile[]
  seeds: readonly number[]
  maxEpisodeSteps: number
}

export interface HeldOutPolicyResult {
  score: RouteScore
  episodeCount: number
}

export interface PromotionDecision {
  promote: boolean
  reasons: string[]
}

export function evaluatePolicyHeldOut(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialStates: readonly CraftState[],
  policy: EpisodePolicy,
  options: HeldOutEvaluationOptions,
): HeldOutPolicyResult {
  const episodesByProfile = new Map<string, EpisodeResult[]>()
  for (const profile of options.profiles) {
    const episodes: EpisodeResult[] = []
    for (const initialState of initialStates) {
      for (const seed of options.seeds) {
        const firstAction = policy(recipe, crafter, initialState)
        if (firstAction === null) continue
        episodes.push(runEpisode({
          recipe,
          crafter,
          initialState,
          firstAction,
          policy,
          random: createEpisodeRandomStream(seed),
          conditionProfile: profile,
          maxSteps: options.maxEpisodeSteps,
        }))
      }
    }
    episodesByProfile.set(profile.id, episodes)
  }
  return {
    score: scoreEpisodes(recipe, episodesByProfile),
    episodeCount: [...episodesByProfile.values()].reduce((sum, episodes) => sum + episodes.length, 0),
  }
}

export function decidePromotion(
  baseline: HeldOutPolicyResult,
  candidate: HeldOutPolicyResult,
  safetyViolations: number,
  minimumRobustCompletionGain = 0.01,
): PromotionDecision {
  const reasons: string[] = []
  if (safetyViolations > 0) reasons.push(`safety-violations:${safetyViolations}`)
  if (candidate.score.robustCompletionRate < baseline.score.robustCompletionRate + minimumRobustCompletionGain) {
    reasons.push('no-robust-completion-gain')
  }
  if (candidate.score.failureRate > baseline.score.failureRate + 1e-9) reasons.push('failure-rate-regression')
  if (compareRouteScores(candidate.score, baseline.score) <= 0) reasons.push('objective-not-better')
  return { promote: reasons.length === 0, reasons }
}
