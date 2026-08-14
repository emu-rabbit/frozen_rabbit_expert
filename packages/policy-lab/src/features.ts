import {
  MATERIAL_CONDITIONS,
  assertCraftObjective,
  calculateBaseProgress,
  calculateBaseQuality,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { normalizeCrafterProfile } from './crafterPopulation'

export const POLICY_FEATURE_SCHEMA_VERSION = 'policy-state-objective-finite-features-v4'

export const POLICY_FEATURE_SCHEMA = [
  'bias-feature',
  'progress-ratio', 'quality-objective-ratio', 'durability-ratio', 'cp-ratio', 'inner-quiet', 'step',
  'condition-normal', 'condition-good', 'condition-good-omen', 'condition-centered',
  'condition-sturdy', 'condition-pliant', 'condition-malleable', 'condition-primed',
  'buff-waste-not', 'buff-veneration', 'buff-great-strides', 'buff-innovation',
  'buff-final-appraisal', 'buff-manipulation', 'buff-muscle-memory', 'buff-expedience',
  'combo-none', 'combo-basic-touch', 'combo-standard-touch', 'combo-observe', 'combo-other',
  'trained-perfection-available', 'trained-perfection-active',
  'careful-observation-uses-left', 'heart-and-soul-available', 'heart-and-soul-active',
  'quick-innovation-available',
  'base-progress-recipe-ratio', 'base-quality-objective-ratio',
  'current-cp-absolute', 'max-cp-absolute',
  'craftsmanship-recommended-margin', 'cosmic-tool-good-bonus', 'crafter-specialist',
  'objective-mode-required-quality', 'objective-mode-maximize-quality-with-safe-completion',
  'objective-quality-target-max-ratio', 'mechanics-required-quality-objective-ratio',
  'objective-quality-target-absolute',
  'pliant-x-manipulation', 'pliant-x-waste-not', 'pliant-x-innovation', 'pliant-x-veneration',
  'good-x-great-strides', 'good-x-innovation',
  'centered-x-expedience', 'sturdy-x-waste-not', 'malleable-x-veneration',
  'low-durability-x-manipulation', 'high-iq-x-innovation',
  'quality-finisher-readiness', 'progress-finisher-pressure',
] as const

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive`)
}

/**
 * Encodes one non-terminal policy state against an explicit recipe-owned
 * objective. Every returned value is finite; invalid inputs fail closed rather
 * than allowing Infinity or NaN into a dataset or artifact.
 */
export function encodePolicyState(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
  crafter: Readonly<CrafterProfile>,
  state: Readonly<CraftState>,
): number[] {
  assertCraftObjective(recipe, objective)
  assertPositiveFinite(recipe.progressRequired, 'recipe progressRequired')
  assertPositiveFinite(recipe.qualityMax, 'recipe qualityMax')
  assertPositiveFinite(recipe.durabilityMax, 'recipe durabilityMax')
  const normalizedCrafter = normalizeCrafterProfile(crafter)
  assertPositiveFinite(normalizedCrafter.maxCp, 'crafter maxCp')

  const combo = state.comboFrom === null
    ? 'none'
    : state.comboFrom === 'basicTouch'
      ? 'basicTouch'
      : state.comboFrom === 'standardTouch'
        ? 'standardTouch'
        : state.comboFrom === 'observe'
          ? 'observe'
          : 'other'
  const pliant = Number(state.condition === 'pliant')
  const good = Number(state.condition === 'good')
  const centered = Number(state.condition === 'centered')
  const sturdy = Number(state.condition === 'sturdy')
  const malleable = Number(state.condition === 'malleable')
  const durabilityRatio = state.durability / recipe.durabilityMax
  const qualityRatio = state.quality / objective.qualityTarget
  const progressRatio = state.progress / recipe.progressRequired
  const innerQuietRatio = state.innerQuiet / 10
  const features = [
    1,
    progressRatio,
    qualityRatio,
    durabilityRatio,
    state.cp / normalizedCrafter.maxCp,
    innerQuietRatio,
    Math.min(1, state.step / 40),
    ...MATERIAL_CONDITIONS.map((condition) => Number(state.condition === condition)),
    state.buffs.wasteNot / 8,
    state.buffs.veneration / 4,
    state.buffs.greatStrides / 3,
    state.buffs.innovation / 4,
    state.buffs.finalAppraisal / 5,
    state.buffs.manipulation / 8,
    state.buffs.muscleMemory / 5,
    state.buffs.expedience,
    Number(combo === 'none'),
    Number(combo === 'basicTouch'),
    Number(combo === 'standardTouch'),
    Number(combo === 'observe'),
    Number(combo === 'other'),
    Number(state.trainedPerfectionAvailable),
    Number(state.trainedPerfectionActive),
    state.carefulObservationUsesLeft / 3,
    Number(state.heartAndSoulAvailable),
    Number(state.heartAndSoulActive),
    Number(state.quickInnovationAvailable),
    calculateBaseProgress(recipe, normalizedCrafter) / recipe.progressRequired,
    calculateBaseQuality(recipe, normalizedCrafter) / objective.qualityTarget,
    state.cp / 1_000,
    normalizedCrafter.maxCp / 1_000,
    (normalizedCrafter.craftsmanship - recipe.recommendedCraftsmanship) / 1_000,
    Number(normalizedCrafter.cosmicToolGoodBonus),
    Number(normalizedCrafter.specialist),
    Number(objective.mode === 'required-quality'),
    Number(objective.mode === 'maximize-quality-with-safe-completion'),
    objective.qualityTarget / recipe.qualityMax,
    recipe.requiredQuality / objective.qualityTarget,
    objective.qualityTarget / 100_000,
    pliant * state.buffs.manipulation / 8,
    pliant * state.buffs.wasteNot / 8,
    pliant * state.buffs.innovation / 4,
    pliant * state.buffs.veneration / 4,
    good * state.buffs.greatStrides / 3,
    good * state.buffs.innovation / 4,
    centered * state.buffs.expedience,
    sturdy * state.buffs.wasteNot / 8,
    malleable * state.buffs.veneration / 4,
    Math.max(0, 0.5 - durabilityRatio) * state.buffs.manipulation / 8,
    innerQuietRatio * state.buffs.innovation / 4,
    qualityRatio * innerQuietRatio * Math.max(state.buffs.greatStrides / 3, state.buffs.innovation / 4),
    Math.max(0, progressRatio - 0.75) * Math.max(0, 1 - qualityRatio),
  ]
  if (features.length !== POLICY_FEATURE_SCHEMA.length) {
    throw new Error(`policy feature length mismatch: ${features.length} !== ${POLICY_FEATURE_SCHEMA.length}`)
  }
  const nonFiniteIndex = features.findIndex((value) => !Number.isFinite(value))
  if (nonFiniteIndex >= 0) {
    throw new RangeError(`policy feature ${POLICY_FEATURE_SCHEMA[nonFiniteIndex]} must be finite`)
  }
  return features
}
