import { MATERIAL_CONDITIONS, type MaterialCondition } from '@frozen-rabbit-expert/domain'
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

export const POC_SENSITIVITY_PROFILES = [
  BALANCED_POC_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
  RESOURCE_SCARCE_POC_CONDITIONS,
] as const

export function sampleCondition(
  profile: WeightedConditionProfile,
  random: EpisodeRandomStream,
  previousCondition?: MaterialCondition,
): MaterialCondition {
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
