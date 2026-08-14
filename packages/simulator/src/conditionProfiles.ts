import {
  MATERIAL_CONDITIONS,
  type MaterialCondition,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { EpisodeRandomStream, WeightedConditionProfile } from './types'

export const BALANCED_POC_CONDITIONS: WeightedConditionProfile = {
  id: 'balanced-six-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 1,
    good: 1,
    centered: 1,
    sturdy: 1,
    pliant: 1,
    malleable: 1,
  },
}

export const NORMAL_HEAVY_POC_CONDITIONS: WeightedConditionProfile = {
  id: 'normal-heavy-six-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 7,
    good: 0.6,
    centered: 0.6,
    sturdy: 0.6,
    pliant: 0.6,
    malleable: 0.6,
  },
}

export const RESOURCE_SCARCE_POC_CONDITIONS: WeightedConditionProfile = {
  id: 'resource-scarce-six-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 6,
    good: 0.35,
    centered: 1.1,
    sturdy: 0.35,
    pliant: 0.25,
    malleable: 1.1,
  },
}

export const BALANCED_ELEVATING_PLATFORMS_CONDITIONS: WeightedConditionProfile = {
  id: 'balanced-elevating-platforms-seven-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 1,
    good: 1,
    goodOmen: 1,
    sturdy: 1,
    pliant: 1,
    malleable: 1,
    primed: 1,
  },
}

export const NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS: WeightedConditionProfile = {
  id: 'normal-heavy-elevating-platforms-seven-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 7,
    good: 0.6,
    goodOmen: 0.6,
    sturdy: 0.6,
    pliant: 0.6,
    malleable: 0.6,
    primed: 0.6,
  },
}

export const RESOURCE_SCARCE_ELEVATING_PLATFORMS_CONDITIONS: WeightedConditionProfile = {
  id: 'resource-scarce-elevating-platforms-seven-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 6,
    good: 0.35,
    goodOmen: 0.5,
    sturdy: 0.35,
    pliant: 0.25,
    malleable: 1.1,
    primed: 0.5,
  },
}

export const BALANCED_COMMAND_BREW_CONDITIONS: WeightedConditionProfile = {
  id: 'balanced-command-brew-three-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 1,
    good: 1,
    malleable: 1,
  },
}

export const NORMAL_HEAVY_COMMAND_BREW_CONDITIONS: WeightedConditionProfile = {
  id: 'normal-heavy-command-brew-three-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 7,
    good: 0.6,
    malleable: 0.6,
  },
}

export const GOOD_SCARCE_MALLEABLE_STRESS_COMMAND_BREW_CONDITIONS: WeightedConditionProfile = {
  id: 'good-scarce-malleable-stress-command-brew-three-condition-sensitivity-v1',
  evidence: 'assumption',
  weights: {
    normal: 6,
    good: 0.35,
    malleable: 1.1,
  },
}

export const COMMAND_BREW_SENSITIVITY_PROFILES = [
  BALANCED_COMMAND_BREW_CONDITIONS,
  NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
  GOOD_SCARCE_MALLEABLE_STRESS_COMMAND_BREW_CONDITIONS,
] as const

export const ELEVATING_PLATFORMS_SENSITIVITY_PROFILES = [
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  RESOURCE_SCARCE_ELEVATING_PLATFORMS_CONDITIONS,
] as const

/**
 * One 95-condition player Observe trace from this expert mission pair. At the
 * player's direction this is the primary marginal tuning environment for the
 * current pilot. IID sampling still does not claim exact transition rules or a
 * nails-specific natural-condition sequence.
 */
export const PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS: WeightedConditionProfile = {
  id: 'ingot-observe-95-iid-marginal-v1',
  evidence: 'empirical',
  weights: {
    normal: 36,
    good: 14,
    centered: 13,
    sturdy: 13,
    pliant: 10,
    malleable: 9,
  },
}

export const POC_SENSITIVITY_PROFILES = [
  BALANCED_POC_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
  RESOURCE_SCARCE_POC_CONDITIONS,
] as const

/** Fails closed when an evaluation profile can generate recipe-impossible conditions. */
export function assertConditionProfileCompatible(
  recipe: Readonly<RecipeProfile>,
  profile: Readonly<WeightedConditionProfile>,
): void {
  if (profile.id.trim().length === 0) throw new Error('condition profile id must not be empty')
  const available = new Set(recipe.availableConditions)
  const validateWeights = (
    weights: Readonly<Partial<Record<MaterialCondition, number>>>,
    label: string,
  ): void => {
    let total = 0
    for (const [condition, weight] of Object.entries(weights)) {
      if (!MATERIAL_CONDITIONS.includes(condition as MaterialCondition)) {
        throw new Error(`${label} contains unknown condition: ${condition}`)
      }
      if (!available.has(condition as MaterialCondition)) {
        throw new Error(`${label} contains unavailable condition for ${recipe.profileId}: ${condition}`)
      }
      if (!Number.isFinite(weight) || (weight ?? 0) < 0) {
        throw new RangeError(`${label}.${condition} must be finite and non-negative`)
      }
      total += weight ?? 0
    }
    if (total <= 0) throw new RangeError(`${label} must contain positive total weight`)
  }

  validateWeights(profile.weights, `condition profile ${profile.id} weights`)
  for (const [previousCondition, weights] of Object.entries(profile.transitionWeights ?? {})) {
    if (!available.has(previousCondition as MaterialCondition)) {
      throw new Error(
        `condition profile ${profile.id} has unavailable transition source: ${previousCondition}`,
      )
    }
    validateWeights(
      weights ?? {},
      `condition profile ${profile.id} transitionWeights.${previousCondition}`,
    )
  }
}

export function sampleCondition(
  profile: WeightedConditionProfile,
  random: EpisodeRandomStream,
  previousCondition?: MaterialCondition,
): MaterialCondition {
  if (previousCondition === 'goodOmen') return 'good'
  const weights = previousCondition === undefined
    ? profile.weights
    : profile.transitionWeights?.[previousCondition] ?? profile.weights
  let total = 0
  for (const condition of MATERIAL_CONDITIONS) total += Math.max(0, weights[condition] ?? 0)
  if (total <= 0) return 'normal'

  let cursor = random.nextCondition() * total
  for (const condition of MATERIAL_CONDITIONS) {
    cursor -= Math.max(0, weights[condition] ?? 0)
    if (cursor <= 0) return condition
  }
  return 'normal'
}
