import {
  assertCraftObjective,
  estimateHqChancePercent,
  minimumQualityForHqChancePercent,
  type CraftObjective,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { RiskPreferencePreset } from './types'

export type QualityUtilityKind =
  | 'hard-quality-max'
  | 'collectability-tiers'
  | 'continuous-collectability'
  | 'hq-chance'

export interface ResolvedObjectivePolicy {
  objectiveId: string | null
  qualityMaximum: number
  mechanicsRequiredQuality: number
  /**
   * Risk-specific fallback checkpoint. Reaching it never satisfies or caps the
   * quality objective; it only permits the policy to preserve an exit route
   * when further quality pursuit is no longer safely funded.
   */
  protectedQualityFloor: number
  qualityMilestones: readonly number[]
  hqChanceMilestones: readonly number[]
  protectedHqChanceFloorPercent: number | null
  qualityUtilityKind: QualityUtilityKind
}

export interface ResolveObjectivePolicyOptions {
  objective?: Readonly<CraftObjective>
  riskPreset: Readonly<RiskPreferencePreset>
}

function heuristicQualityFloor(
  qualityMaximum: number,
  ratio: number,
): number {
  const floatingPointSlack = Number.EPSILON * Math.max(1, qualityMaximum)
  return Math.ceil(qualityMaximum * ratio - floatingPointSlack)
}

function collectabilityThresholds(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
): readonly number[] | null {
  if (
    recipe.qualityOutcome !== 'collectability'
    || objective.mode !== 'maximize-quality-with-safe-completion'
    || objective.qualityTiers.length !== 4
    || objective.qualityTiers.at(-1)?.minimumQuality !== recipe.qualityMax
  ) return null
  return objective.qualityTiers.map((tier) => tier.minimumQuality)
}

function selectedMilestone(
  milestones: readonly number[],
  riskPreset: Readonly<RiskPreferencePreset>,
): number {
  if (riskPreset.id === 'stable') return milestones[0]!
  if (riskPreset.id === 'balanced') return milestones[Math.max(0, milestones.length - 2)]!
  return milestones.at(-1)!
}

export function resolveObjectivePolicy(
  recipe: Readonly<RecipeProfile>,
  options: ResolveObjectivePolicyOptions,
): Readonly<ResolvedObjectivePolicy> {
  const { objective, riskPreset } = options
  if (objective !== undefined) assertCraftObjective(recipe, objective)
  const qualityMaximum = recipe.qualityMax

  if (objective?.mode === 'required-quality' || objective === undefined && recipe.requiredQuality > 0) {
    return Object.freeze({
      objectiveId: objective?.objectiveId ?? null,
      qualityMaximum,
      mechanicsRequiredQuality: recipe.requiredQuality,
      protectedQualityFloor: qualityMaximum,
      qualityMilestones: Object.freeze([qualityMaximum]),
      hqChanceMilestones: Object.freeze([]),
      protectedHqChanceFloorPercent: null,
      qualityUtilityKind: 'hard-quality-max',
    })
  }

  if (recipe.qualityOutcome === 'collectability' && objective !== undefined) {
    const declaredThresholds = collectabilityThresholds(recipe, objective)
    if (declaredThresholds !== null) {
      const qualityMilestones = Object.freeze([...declaredThresholds])
      return Object.freeze({
        objectiveId: objective.objectiveId,
        qualityMaximum,
        mechanicsRequiredQuality: recipe.requiredQuality,
        protectedQualityFloor: selectedMilestone(qualityMilestones, riskPreset),
        qualityMilestones,
        hqChanceMilestones: Object.freeze([]),
        protectedHqChanceFloorPercent: null,
        qualityUtilityKind: 'collectability-tiers',
      })
    }
  }

  if (recipe.qualityOutcome === 'hq-chance') {
    const hqChanceMilestones = Object.freeze([50, 75, 100])
    const qualityMilestones = Object.freeze(hqChanceMilestones.map(
      (hqChancePercent) => minimumQualityForHqChancePercent(hqChancePercent, qualityMaximum),
    ))
    return Object.freeze({
      objectiveId: objective?.objectiveId ?? null,
      qualityMaximum,
      mechanicsRequiredQuality: recipe.requiredQuality,
      protectedQualityFloor: selectedMilestone(qualityMilestones, riskPreset),
      qualityMilestones,
      hqChanceMilestones,
      protectedHqChanceFloorPercent: selectedMilestone(hqChanceMilestones, riskPreset),
      qualityUtilityKind: 'hq-chance',
    })
  }

  return Object.freeze({
    objectiveId: objective?.objectiveId ?? null,
    qualityMaximum,
    mechanicsRequiredQuality: recipe.requiredQuality,
    protectedQualityFloor: Math.max(
      recipe.requiredQuality,
      heuristicQualityFloor(qualityMaximum, riskPreset.continuousCompletionQualityRatio),
    ),
    qualityMilestones: Object.freeze([qualityMaximum]),
    hqChanceMilestones: Object.freeze([]),
    protectedHqChanceFloorPercent: null,
    qualityUtilityKind: 'continuous-collectability',
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
  if (policy.qualityUtilityKind === 'hq-chance') {
    return estimateHqChancePercent(quality, policy.qualityMaximum) / 100
  }
  if (policy.qualityUtilityKind !== 'collectability-tiers') {
    return Math.max(0, Math.min(1, quality / policy.qualityMaximum))
  }

  const thresholds = policy.qualityMilestones
  let reached = 0
  while (reached < thresholds.length && quality >= thresholds[reached]!) reached += 1
  if (reached === thresholds.length) return 1

  const lower = reached === 0 ? 0 : thresholds[reached - 1]!
  const upper = thresholds[reached]!
  const intervalProgress = Math.max(0, Math.min(1, (quality - lower) / (upper - lower)))
  return (reached + intervalProgress) / thresholds.length
}

/** Fixed outcome utility for A/B measurement. It uses the same full quality
 * scale as route shaping; risk changes downside protection, not quality desire. */
export function objectiveOutcomeUtility(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
  quality: number,
): number {
  assertCraftObjective(recipe, objective)
  if (quality <= 0) return 0
  if (recipe.qualityOutcome === 'hq-chance') {
    return estimateHqChancePercent(quality, recipe.qualityMax) / 100
  }
  if (recipe.qualityOutcome !== 'collectability' || objective.qualityTiers.length !== 4) {
    return Math.max(0, Math.min(1, quality / recipe.qualityMax))
  }
  return objectiveQualityUtility({
    objectiveId: objective.objectiveId,
    qualityMaximum: recipe.qualityMax,
    mechanicsRequiredQuality: recipe.requiredQuality,
    protectedQualityFloor: objective.qualityTiers.at(-1)!.minimumQuality,
    qualityMilestones: objective.qualityTiers.map((tier) => tier.minimumQuality),
    hqChanceMilestones: [],
    protectedHqChanceFloorPercent: null,
    qualityUtilityKind: 'collectability-tiers',
  }, quality)
}
