import {
  ACTIONS,
  legalActions,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { guideRolloutAction, isPolicyActionSafe, recommendAction } from '@frozen-rabbit-expert/solver'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'
import type { PolicyPopulationEntry } from './types'
import { targetCrafterSafePolicy } from './targetCrafterPolicy'

function legalRanked(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  score: (action: CraftActionId) => number,
): CraftActionId | null {
  return legalActions(recipe, crafter, state)
    .filter((action) => {
      const preview = previewAction(recipe, crafter, state, action)
      return isPolicyActionSafe(recipe, crafter, state, action, preview)
    })
    .map((action) => ({ action, score: score(action) }))
    .sort((left, right) => right.score - left.score || left.action.localeCompare(right.action))[0]?.action ?? null
}

export const baselinePolicy: EpisodePolicy = (recipe, crafter, state) => (
  recommendAction(recipe, crafter, state, { mechanicsVersion: 'offline-policy-lab' })?.action ?? null
)

export const progressCommitPolicy: EpisodePolicy = (recipe, crafter, state) => {
  if (state.quality >= recipe.requiredQuality || state.buffs.veneration > 0 || state.buffs.muscleMemory > 0) {
    return legalRanked(recipe, crafter, state, (action) => {
      const preview = previewAction(recipe, crafter, state, action)
      if (ACTIONS[action].category !== 'progress') return -1_000_000
      return preview.progressGain * preview.successRate * 20 - preview.cpCost * 25 - preview.durabilityCost * 80
    })
  }
  return targetCrafterSafePolicy(recipe, crafter, state)
}

export const qualityCommitPolicy: EpisodePolicy = (recipe, crafter, state) => {
  if (state.condition === 'good' && state.innerQuiet < 10 && legalActions(recipe, crafter, state).includes('preciseTouch')) {
    return 'preciseTouch'
  }
  if (
    (state.comboFrom === 'standardTouch' || state.comboFrom === 'observe')
    && legalActions(recipe, crafter, state).includes('advancedTouch')
  ) return 'advancedTouch'
  if (state.progress / recipe.progressRequired >= 0.72) {
    return legalRanked(recipe, crafter, state, (action) => {
      const preview = previewAction(recipe, crafter, state, action)
      if (ACTIONS[action].category !== 'quality') return -1_000_000
      return preview.qualityGain * preview.successRate * 12 - preview.cpCost * 20 - preview.durabilityCost * 55
    })
  }
  return targetCrafterSafePolicy(recipe, crafter, state)
}

export const resourceSafePolicy: EpisodePolicy = (recipe, crafter, state) => {
  if (state.durability <= 10) {
    for (const action of ['trainedPerfection', 'immaculateMend', 'mastersMend', 'manipulation'] as const) {
      if (legalActions(recipe, crafter, state).includes(action)) return action
    }
  }
  return targetCrafterSafePolicy(recipe, crafter, state)
}

/** Explore the player's point that a Pliant discount can outweigh discarding
 * several remaining buff turns. Full-episode scoring decides whether it pays. */
export const pliantRefreshPolicy: EpisodePolicy = (recipe, crafter, state) => {
  const can = (action: CraftActionId): boolean => (
    legalActions(recipe, crafter, state).includes(action)
    && isPolicyActionSafe(recipe, crafter, state, action)
  )
  if (state.condition === 'pliant') {
    if (state.buffs.manipulation > 0 && state.buffs.manipulation <= 3 && state.durability <= 25 && can('manipulation')) {
      return 'manipulation'
    }
    if (state.buffs.wasteNot > 0 && state.buffs.wasteNot <= 3 && state.innerQuiet < 10 && can('wasteNot2')) {
      return 'wasteNot2'
    }
    if (state.buffs.innovation > 0 && state.buffs.innovation <= 2 && state.innerQuiet >= 8 && can('innovation')) {
      return 'innovation'
    }
    if (state.buffs.veneration > 0 && state.buffs.veneration <= 2 && state.progress / recipe.progressRequired < 0.82 && can('veneration')) {
      return 'veneration'
    }
  }
  return targetCrafterSafePolicy(recipe, crafter, state)
}

/** Explore bounded condition fishing while Great Strides is still ticking.
 * Once it expires, the target policy takes over instead of observing forever. */
export const conditionFishingPolicy: EpisodePolicy = (recipe, crafter, state) => {
  if (
    state.innerQuiet === 10
    && state.condition !== 'good'
    && state.buffs.greatStrides > 0
    && state.progress / recipe.progressRequired >= 0.8
    && state.quality / recipe.requiredQuality >= 0.5
    && state.cp >= 80
    && state.durability >= 20
    && legalActions(recipe, crafter, state).includes('observe')
  ) return 'observe'
  return targetCrafterSafePolicy(recipe, crafter, state)
}

export const DEFAULT_POLICY_POPULATION: readonly PolicyPopulationEntry[] = [
  { id: 'target-video-informed-v2', policy: targetCrafterSafePolicy },
  { id: 'pliant-refresh-opportunity-v1', policy: pliantRefreshPolicy },
  { id: 'bounded-condition-fishing-v1', policy: conditionFishingPolicy },
  { id: 'lookahead-baseline-v1', policy: baselinePolicy },
  { id: 'guide-greedy-v1', policy: guideRolloutAction },
  { id: 'progress-commit-v1', policy: progressCommitPolicy },
  { id: 'quality-commit-v1', policy: qualityCommitPolicy },
  { id: 'resource-safe-v1', policy: resourceSafePolicy },
] as const

// The lookahead baseline remains a sampling/evaluation reference, but is too
// expensive to invoke after every root candidate during dataset labeling.
export const DEFAULT_CONTINUATION_POPULATION: readonly PolicyPopulationEntry[] = (
  DEFAULT_POLICY_POPULATION.filter((entry) => entry.id !== 'lookahead-baseline-v1')
)
