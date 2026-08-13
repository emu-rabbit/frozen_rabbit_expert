import { legalActions, type CrafterProfile, type CraftState, type RecipeProfile } from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  runEpisode,
  type EpisodePolicy,
  type EpisodeResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
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
  safetyViolations: number
}

export interface PromotionDecision {
  promote: boolean
  reasons: string[]
  basis: 'completion-gain' | 'near-perfect-efficiency' | null
}

export interface PromotionCriteria {
  minimumRobustCompletionGain?: number
  nearPerfectCompletionFloor?: number
  minimumAverageSuccessfulStepReduction?: number
}

export type EpisodePolicyFactory = () => EpisodePolicy

export function evaluatePolicyHeldOut(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialStates: readonly CraftState[],
  policyFactory: EpisodePolicyFactory,
  options: HeldOutEvaluationOptions,
): HeldOutPolicyResult {
  const episodesByProfile = new Map<string, EpisodeResult[]>()
  let safetyViolations = 0
  for (const profile of options.profiles) {
    const episodes: EpisodeResult[] = []
    for (const initialState of initialStates) {
      for (const seed of options.seeds) {
        const policy = policyFactory()
        const auditedPolicy: EpisodePolicy = (currentRecipe, currentCrafter, state) => {
          const action = policy(currentRecipe, currentCrafter, state)
          if (action !== null && (
            !legalActions(currentRecipe, currentCrafter, state).includes(action)
            || !isPolicyActionSafe(currentRecipe, currentCrafter, state, action)
          )) safetyViolations += 1
          return action
        }
        const firstAction = auditedPolicy(recipe, crafter, initialState)
        if (firstAction === null) {
          episodes.push({
            terminal: 'none',
            finalState: initialState,
            actions: [],
            stoppedByLimit: false,
            stopReason: legalActions(recipe, crafter, initialState).length === 0
              ? 'no-legal-action'
              : 'policy-null',
          })
          continue
        }
        episodes.push(runEpisode({
          recipe,
          crafter,
          initialState,
          firstAction,
          policy: auditedPolicy,
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
    safetyViolations,
  }
}

export function decidePromotion(
  baseline: HeldOutPolicyResult,
  candidate: HeldOutPolicyResult,
  safetyViolations = candidate.safetyViolations,
  criteria: Readonly<PromotionCriteria> = {},
): PromotionDecision {
  const minimumRobustCompletionGain = criteria.minimumRobustCompletionGain ?? 0.01
  const nearPerfectCompletionFloor = criteria.nearPerfectCompletionFloor ?? 0.995
  const minimumAverageSuccessfulStepReduction = criteria.minimumAverageSuccessfulStepReduction ?? 0.25
  const baselineSuccessfulSteps = baseline.score.averageSuccessfulSteps
  const candidateSuccessfulSteps = candidate.score.averageSuccessfulSteps
  const hasCompletionGain = candidate.score.robustCompletionRate
    >= baseline.score.robustCompletionRate + minimumRobustCompletionGain
  const hasNearPerfectEfficiencyGain = baseline.score.robustCompletionRate >= nearPerfectCompletionFloor
    && candidate.score.robustCompletionRate + 1e-9 >= baseline.score.robustCompletionRate
    && candidate.score.averageCompletionRate + 1e-9 >= baseline.score.averageCompletionRate
    && baselineSuccessfulSteps !== null
    && candidateSuccessfulSteps !== null
    && candidateSuccessfulSteps
      <= baselineSuccessfulSteps - minimumAverageSuccessfulStepReduction
  const basis = hasCompletionGain
    ? 'completion-gain'
    : hasNearPerfectEfficiencyGain
      ? 'near-perfect-efficiency'
      : null
  const reasons: string[] = []
  if (safetyViolations > 0) reasons.push(`safety-violations:${safetyViolations}`)
  if (basis === null) reasons.push('no-completion-or-near-perfect-efficiency-gain')
  if (candidate.score.failureRate > baseline.score.failureRate + 1e-9) reasons.push('failure-rate-regression')
  if (candidate.score.hardStopRate > baseline.score.hardStopRate + 1e-9) reasons.push('hard-stop-rate-regression')
  const baselineStallRate = baseline.score.stopReasonRates['policy-null']
    + baseline.score.stopReasonRates['no-legal-action']
    + baseline.score.stopReasonRates['illegal-action']
    + baseline.score.stopReasonRates['action-limit']
  const candidateStallRate = candidate.score.stopReasonRates['policy-null']
    + candidate.score.stopReasonRates['no-legal-action']
    + candidate.score.stopReasonRates['illegal-action']
    + candidate.score.stopReasonRates['action-limit']
  if (candidateStallRate > baselineStallRate + 1e-9) reasons.push('stall-rate-regression')
  if (compareRouteScores(candidate.score, baseline.score) <= 0) reasons.push('objective-not-better')
  return { promote: reasons.length === 0, reasons, basis }
}
