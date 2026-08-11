import type { RecipeProfile } from '@frozen-rabbit-expert/domain'
import type { EpisodeResult } from '@frozen-rabbit-expert/simulator'
import type { RouteScore } from './types'

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
): RouteScore {
  const all = [...episodesByProfile.values()].flat()
  const successful = all.filter((episode) => episode.terminal === 'completed')
  const profileCompletion = [...episodesByProfile.values()].map((episodes) => (
    episodes.filter((episode) => episode.terminal === 'completed').length / Math.max(1, episodes.length)
  ))
  const balances = all.map((episode) => Math.min(
    episode.finalState.progress / recipe.progressRequired,
    episode.finalState.quality / recipe.requiredQuality,
  ))
  return {
    robustCompletionRate: profileCompletion.length > 0 ? Math.min(...profileCompletion) : 0,
    averageCompletionRate: mean(profileCompletion),
    failureRate: all.filter((episode) => episode.terminal === 'failed').length / Math.max(1, all.length),
    lowerTailBalance: lowerTail(balances),
    averageSuccessfulCp: mean(successful.map((episode) => episode.finalState.cp)),
    averageSuccessfulDurability: mean(successful.map((episode) => Math.max(0, episode.finalState.durability))),
    averageSteps: mean(all.map((episode) => episode.actions.length)),
  }
}

export function compareRouteScores(left: RouteScore, right: RouteScore): number {
  const comparisons = [
    left.robustCompletionRate - right.robustCompletionRate,
    left.averageCompletionRate - right.averageCompletionRate,
    right.failureRate - left.failureRate,
    left.lowerTailBalance - right.lowerTailBalance,
    left.averageSuccessfulCp - right.averageSuccessfulCp,
    left.averageSuccessfulDurability - right.averageSuccessfulDurability,
    right.averageSteps - left.averageSteps,
  ]
  return comparisons.find((value) => Math.abs(value) > 1e-9) ?? 0
}
