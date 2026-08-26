import {
  ACTIONS,
  assertCraftObjective,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { guideRolloutAction, isPolicyActionSafe, recommendAction } from '@frozen-rabbit-expert/solver'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'
import type { PolicyPopulationEntry } from './types'
import { targetCrafterSafePolicy } from './targetCrafterPolicy'
import {
  bindEpisodePolicyObjective,
  recipeWithObjectiveQualityMaximum,
} from './objective'

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

export function createBaselinePolicy(objective: Readonly<CraftObjective>): EpisodePolicy {
  return (recipe, crafter, state) => {
    assertCraftObjective(recipe, objective)
    return recommendAction(recipe, crafter, state, {
      mechanicsVersion: 'offline-policy-lab',
      objective,
    })?.action ?? null
  }
}

export function createProgressCommitPolicy(objective: Readonly<CraftObjective>): EpisodePolicy {
  const targetPolicy = bindEpisodePolicyObjective(objective, targetCrafterSafePolicy)
  return (recipe, crafter, state) => {
    const decisionRecipe = recipeWithObjectiveQualityMaximum(recipe, objective)
    if (state.quality >= recipe.qualityMax || state.buffs.veneration > 0 || state.buffs.muscleMemory > 0) {
      return legalRanked(decisionRecipe, crafter, state, (action) => {
        const preview = previewAction(decisionRecipe, crafter, state, action)
        if (ACTIONS[action].category !== 'progress') return -1_000_000
        return preview.progressGain * preview.successRate * 20 - preview.cpCost * 25 - preview.durabilityCost * 80
      })
    }
    return targetPolicy(recipe, crafter, state)
  }
}

export function createQualityCommitPolicy(objective: Readonly<CraftObjective>): EpisodePolicy {
  const targetPolicy = bindEpisodePolicyObjective(objective, targetCrafterSafePolicy)
  return (recipe, crafter, state) => {
    const decisionRecipe = recipeWithObjectiveQualityMaximum(recipe, objective)
    if (state.condition === 'good' && state.innerQuiet < 10 && legalActions(decisionRecipe, crafter, state).includes('preciseTouch')) {
      return 'preciseTouch'
    }
    if (
      (state.comboFrom === 'standardTouch' || state.comboFrom === 'observe')
      && legalActions(decisionRecipe, crafter, state).includes('advancedTouch')
    ) return 'advancedTouch'
    if (state.progress / recipe.progressRequired >= 0.72) {
      return legalRanked(decisionRecipe, crafter, state, (action) => {
        const preview = previewAction(decisionRecipe, crafter, state, action)
        if (ACTIONS[action].category !== 'quality') return -1_000_000
        return preview.qualityGain * preview.successRate * 12 - preview.cpCost * 20 - preview.durabilityCost * 55
      })
    }
    return targetPolicy(recipe, crafter, state)
  }
}

export function createResourceSafePolicy(objective: Readonly<CraftObjective>): EpisodePolicy {
  const targetPolicy = bindEpisodePolicyObjective(objective, targetCrafterSafePolicy)
  return (recipe, crafter, state) => {
    const decisionRecipe = recipeWithObjectiveQualityMaximum(recipe, objective)
    if (state.durability <= 10) {
      for (const action of ['trainedPerfection', 'immaculateMend', 'mastersMend', 'manipulation'] as const) {
        if (legalActions(decisionRecipe, crafter, state).includes(action)) return action
      }
    }
    return targetPolicy(recipe, crafter, state)
  }
}

/** Explore the player's point that a Pliant discount can outweigh discarding
 * several remaining buff turns. Full-episode scoring decides whether it pays. */
export function createPliantRefreshPolicy(objective: Readonly<CraftObjective>): EpisodePolicy {
  const targetPolicy = bindEpisodePolicyObjective(objective, targetCrafterSafePolicy)
  return (recipe, crafter, state) => {
    const decisionRecipe = recipeWithObjectiveQualityMaximum(recipe, objective)
    const can = (action: CraftActionId): boolean => (
      legalActions(decisionRecipe, crafter, state).includes(action)
      && isPolicyActionSafe(decisionRecipe, crafter, state, action)
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
    return targetPolicy(recipe, crafter, state)
  }
}

/** Explore bounded condition fishing while Great Strides is still ticking.
 * Once it expires, the target policy takes over instead of observing forever. */
export function createConditionFishingPolicy(objective: Readonly<CraftObjective>): EpisodePolicy {
  const targetPolicy = bindEpisodePolicyObjective(objective, targetCrafterSafePolicy)
  return (recipe, crafter, state) => {
    const decisionRecipe = recipeWithObjectiveQualityMaximum(recipe, objective)
    if (
      state.innerQuiet === 10
      && state.condition !== 'good'
      && state.buffs.greatStrides > 0
      && state.progress / recipe.progressRequired >= 0.8
      && state.quality / recipe.qualityMax >= 0.5
      && state.cp >= 80
      && state.durability >= 20
      && legalActions(decisionRecipe, crafter, state).includes('observe')
    ) return 'observe'
    return targetPolicy(recipe, crafter, state)
  }
}

export function createQualityMaximumCrafterSafePolicy(
  objective: Readonly<CraftObjective>,
): EpisodePolicy {
  return bindEpisodePolicyObjective(objective, targetCrafterSafePolicy)
}

export function createDefaultPolicyPopulation(
  objective: Readonly<CraftObjective>,
): readonly PolicyPopulationEntry[] {
  const targetPolicy = createQualityMaximumCrafterSafePolicy(objective)
  return [
    { id: 'quality-maximum-video-informed-v3', policy: targetPolicy },
    { id: 'pliant-refresh-opportunity-v1', policy: createPliantRefreshPolicy(objective) },
    { id: 'bounded-condition-fishing-v1', policy: createConditionFishingPolicy(objective) },
    { id: 'lookahead-baseline-v1', policy: createBaselinePolicy(objective) },
    { id: 'guide-greedy-v1', policy: bindEpisodePolicyObjective(objective, guideRolloutAction) },
    { id: 'progress-commit-v1', policy: createProgressCommitPolicy(objective) },
    { id: 'quality-commit-v1', policy: createQualityCommitPolicy(objective) },
    { id: 'resource-safe-v1', policy: createResourceSafePolicy(objective) },
  ]
}

// The lookahead baseline remains a sampling/evaluation reference, but is too
// expensive to invoke after every root candidate during dataset labeling.
export function createDefaultContinuationPopulation(
  objective: Readonly<CraftObjective>,
): readonly PolicyPopulationEntry[] {
  return createDefaultPolicyPopulation(objective).filter(
    (entry) => entry.id !== 'lookahead-baseline-v1',
  )
}

/*
 * Objective-free policy constants intentionally do not exist. Every research
 * population must bind a recipe-owned quality goal before it can be sampled.
 */
