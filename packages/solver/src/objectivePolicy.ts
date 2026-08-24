import {
  assertCraftObjective,
  type CraftObjective,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { RiskPreferencePreset } from './types'

export type ObjectivePolicyEvidence =
  | 'hard-required-quality'
  | 'verified-collectability-tiers'
  | 'continuous-soft-quality'
  | 'legacy-quality-target'

export interface ResolvedObjectivePolicy {
  objectiveId: string | null
  qualityTarget: number
  mechanicsRequiredQuality: number
  voluntaryQualityFloor: number
  utilityThresholds: readonly number[]
  evidence: ObjectivePolicyEvidence
}

export interface ResolveObjectivePolicyOptions {
  objective?: Readonly<CraftObjective>
  /** Transitional input for research and historical callers without a full objective. */
  qualityTarget?: number
  riskPreset: Readonly<RiskPreferencePreset>
}

function heuristicQualityFloor(
  qualityTarget: number,
  ratio: number,
): number {
  const floatingPointSlack = Number.EPSILON * Math.max(1, qualityTarget)
  return Math.ceil(qualityTarget * ratio - floatingPointSlack)
}

function verifiedCollectabilityThresholds(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
): readonly number[] | null {
  if (
    recipe.qualityOutcome !== 'collectability'
    || objective.mode !== 'maximize-quality-with-safe-completion'
    || objective.source.confidence !== 'verified'
    || objective.qualityTiers.length < 2
    || objective.qualityTiers.at(-1)?.minimumQuality !== objective.qualityTarget
  ) return null
  return objective.qualityTiers.map((tier) => tier.minimumQuality)
}

function selectedTierCount(
  thresholdCount: number,
  riskPreset: Readonly<RiskPreferencePreset>,
): number {
  if (riskPreset.id === 'stable') return 1
  if (riskPreset.id === 'balanced') return Math.max(1, thresholdCount - 1)
  return thresholdCount
}

export function resolveObjectivePolicy(
  recipe: Readonly<RecipeProfile>,
  options: ResolveObjectivePolicyOptions,
): Readonly<ResolvedObjectivePolicy> {
  const { objective, qualityTarget, riskPreset } = options
  if (objective !== undefined) {
    assertCraftObjective(recipe, objective)
    if (qualityTarget !== undefined && qualityTarget !== objective.qualityTarget) {
      throw new Error('objective qualityTarget conflicts with legacy qualityTarget')
    }
  }

  const resolvedTarget = objective?.qualityTarget ?? qualityTarget ?? recipe.requiredQuality
  if (
    !Number.isSafeInteger(resolvedTarget)
    || resolvedTarget <= 0
    || resolvedTarget < recipe.requiredQuality
    || resolvedTarget > recipe.qualityMax
  ) {
    throw new RangeError('qualityTarget must be a positive safe integer between requiredQuality and qualityMax')
  }

  if (objective?.mode === 'required-quality') {
    return Object.freeze({
      objectiveId: objective.objectiveId,
      qualityTarget: resolvedTarget,
      mechanicsRequiredQuality: recipe.requiredQuality,
      voluntaryQualityFloor: recipe.requiredQuality,
      utilityThresholds: Object.freeze([resolvedTarget]),
      evidence: 'hard-required-quality',
    })
  }

  if (objective !== undefined) {
    const verifiedThresholds = verifiedCollectabilityThresholds(recipe, objective)
    if (verifiedThresholds !== null) {
      const thresholds = Object.freeze(
        verifiedThresholds.slice(0, selectedTierCount(verifiedThresholds.length, riskPreset)),
      )
      return Object.freeze({
        objectiveId: objective.objectiveId,
        qualityTarget: resolvedTarget,
        mechanicsRequiredQuality: recipe.requiredQuality,
        voluntaryQualityFloor: thresholds.at(-1)!,
        utilityThresholds: thresholds,
        evidence: 'verified-collectability-tiers',
      })
    }
  }

  return Object.freeze({
    objectiveId: objective?.objectiveId ?? null,
    qualityTarget: resolvedTarget,
    mechanicsRequiredQuality: recipe.requiredQuality,
    voluntaryQualityFloor: Math.max(
      recipe.requiredQuality,
      heuristicQualityFloor(resolvedTarget, riskPreset.minimumVoluntaryCompletionQualityRatio),
    ),
    utilityThresholds: Object.freeze([resolvedTarget]),
    evidence: objective === undefined ? 'legacy-quality-target' : 'continuous-soft-quality',
  })
}

/**
 * Planner shaping only. Tier interpolation represents ordinal progress toward
 * declared thresholds; it is not an interpolation of in-game mission points.
 */
export function objectiveQualityUtility(
  policy: Readonly<ResolvedObjectivePolicy>,
  quality: number,
): number {
  if (quality <= 0) return 0
  if (policy.evidence !== 'verified-collectability-tiers') {
    return Math.max(0, Math.min(1, quality / policy.qualityTarget))
  }

  const thresholds = policy.utilityThresholds
  let reached = 0
  while (reached < thresholds.length && quality >= thresholds[reached]!) reached += 1
  if (reached === thresholds.length) return 1

  const lower = reached === 0 ? 0 : thresholds[reached - 1]!
  const upper = thresholds[reached]!
  const intervalProgress = Math.max(0, Math.min(1, (quality - lower) / (upper - lower)))
  return (reached + intervalProgress) / thresholds.length
}
