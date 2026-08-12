import type { CraftObjective, RecipeProfile } from '@frozen-rabbit-expert/domain'
import type { EpisodeResult, EpisodeStopReason } from '@frozen-rabbit-expert/simulator'
import type { RouteScore } from './types'

export const POLICY_OBJECTIVE_VERSION = 'scenario-objective-completion-viability-lexicographic-v6'

const STOP_REASONS: readonly EpisodeStopReason[] = [
  'completed',
  'failed',
  'policy-null',
  'no-legal-action',
  'illegal-action',
  'action-limit',
]

const HARD_STOP_REASONS: readonly EpisodeStopReason[] = [
  'failed',
  'policy-null',
  'no-legal-action',
  'illegal-action',
]

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function lowerTail(values: readonly number[], fraction = 0.1): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

export function scoreEpisodes(
  recipe: RecipeProfile,
  episodesByProfile: ReadonlyMap<string, readonly EpisodeResult[]>,
  objective?: Readonly<CraftObjective>,
): RouteScore {
  if (objective !== undefined && objective.recipeProfileId !== recipe.profileId) {
    throw new Error(`objective ${objective.objectiveId} does not belong to recipe ${recipe.profileId}`)
  }
  const qualityTarget = objective?.qualityTarget ?? recipe.requiredQuality
  if (!Number.isFinite(qualityTarget) || qualityTarget <= 0) {
    throw new Error(`recipe ${recipe.profileId} requires an explicit positive CraftObjective qualityTarget`)
  }
  const all = [...episodesByProfile.values()].flat()
  const successful = all.filter((episode) => episode.terminal === 'completed')
  const profileCompletion = [...episodesByProfile.values()].map((episodes) => (
    episodes.filter((episode) => episode.terminal === 'completed').length / Math.max(1, episodes.length)
  ))
  const isHardStop = (episode: EpisodeResult): boolean => HARD_STOP_REASONS.includes(episode.stopReason)
  const progressRatios = all.map((episode) => (
    isHardStop(episode) ? 0 : episode.finalState.progress / recipe.progressRequired
  ))
  const qualityRatios = all.map((episode) => (
    isHardStop(episode) ? 0 : Math.min(1, episode.finalState.quality / qualityTarget)
  ))
  const balances = progressRatios.map((progressRatio, index) => (
    Math.min(progressRatio, qualityRatios[index] ?? 0)
  ))
  return {
    robustCompletionRate: profileCompletion.length > 0 ? Math.min(...profileCompletion) : 0,
    averageCompletionRate: mean(profileCompletion),
    failureRate: all.filter((episode) => episode.terminal === 'failed').length / Math.max(1, all.length),
    hardStopRate: all.filter(isHardStop).length / Math.max(1, all.length),
    nonCompletionRate: all.filter((episode) => episode.terminal !== 'completed').length / Math.max(1, all.length),
    stopReasonRates: Object.fromEntries(STOP_REASONS.map((reason) => [
      reason,
      all.filter((episode) => episode.stopReason === reason).length / Math.max(1, all.length),
    ])) as Record<EpisodeStopReason, number>,
    lowerTailBalance: lowerTail(balances),
    averageBalance: mean(balances),
    averageViableProgressRatio: mean(progressRatios),
    averageViableQualityRatio: mean(qualityRatios),
    averageSuccessfulCp: mean(successful.map((episode) => episode.finalState.cp)),
    averageSuccessfulDurability: mean(successful.map((episode) => Math.max(0, episode.finalState.durability))),
    averageSteps: mean(all.map((episode) => episode.actions.length)),
    averageSuccessfulSteps: successful.length > 0
      ? mean(successful.map((episode) => episode.actions.length))
      : null,
  }
}

export function compareRouteScores(left: RouteScore, right: RouteScore): number {
  const comparisons = [
    left.robustCompletionRate - right.robustCompletionRate,
    left.averageCompletionRate - right.averageCompletionRate,
    left.lowerTailBalance - right.lowerTailBalance,
    right.hardStopRate - left.hardStopRate,
    left.averageBalance - right.averageBalance,
    left.averageViableProgressRatio - right.averageViableProgressRatio,
    left.averageViableQualityRatio - right.averageViableQualityRatio,
    left.averageSuccessfulCp - right.averageSuccessfulCp,
    left.averageSuccessfulDurability - right.averageSuccessfulDurability,
  ]
  if (left.averageSuccessfulSteps !== null && right.averageSuccessfulSteps !== null) {
    comparisons.push(right.averageSuccessfulSteps - left.averageSuccessfulSteps)
  }
  return comparisons.find((value) => Math.abs(value) > 1e-9) ?? 0
}
