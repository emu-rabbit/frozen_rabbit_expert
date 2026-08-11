import {
  ACTIONS,
  legalActions,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { guideRolloutAction, recommendAction } from '@frozen-rabbit-expert/solver'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'
import type { PolicyPopulationEntry } from './types'

function premature(recipe: RecipeProfile, crafter: CrafterProfile, state: CraftState, action: CraftActionId): boolean {
  const preview = previewAction(recipe, crafter, state, action)
  return state.quality < recipe.requiredQuality
    && preview.progressGain > 0
    && state.progress + preview.progressGain >= recipe.progressRequired
}

function legalRanked(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  score: (action: CraftActionId) => number,
): CraftActionId | null {
  return legalActions(recipe, crafter, state)
    .filter((action) => !premature(recipe, crafter, state, action))
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
  return baselinePolicy(recipe, crafter, state)
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
  return baselinePolicy(recipe, crafter, state)
}

export const resourceSafePolicy: EpisodePolicy = (recipe, crafter, state) => {
  if (state.durability <= 10) {
    for (const action of ['trainedPerfection', 'immaculateMend', 'mastersMend', 'manipulation'] as const) {
      if (legalActions(recipe, crafter, state).includes(action)) return action
    }
  }
  return baselinePolicy(recipe, crafter, state)
}

export const DEFAULT_POLICY_POPULATION: readonly PolicyPopulationEntry[] = [
  { id: 'lookahead-baseline-v1', policy: baselinePolicy },
  { id: 'guide-greedy-v1', policy: guideRolloutAction },
  { id: 'progress-commit-v1', policy: progressCommitPolicy },
  { id: 'quality-commit-v1', policy: qualityCommitPolicy },
  { id: 'resource-safe-v1', policy: resourceSafePolicy },
] as const
