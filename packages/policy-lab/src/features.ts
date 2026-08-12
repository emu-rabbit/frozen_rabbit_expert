import {
  calculateBaseProgress,
  calculateBaseQuality,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'

export const POLICY_FEATURE_SCHEMA = [
  'bias-feature',
  'progress-ratio', 'quality-ratio', 'durability-ratio', 'cp-ratio', 'inner-quiet', 'step',
  'condition-normal', 'condition-good', 'condition-centered', 'condition-sturdy', 'condition-pliant', 'condition-malleable',
  'buff-waste-not', 'buff-veneration', 'buff-great-strides', 'buff-innovation',
  'buff-final-appraisal', 'buff-manipulation', 'buff-muscle-memory', 'buff-expedience',
  'combo-none', 'combo-basic-touch', 'combo-standard-touch', 'combo-observe', 'combo-other',
  'trained-perfection-available', 'trained-perfection-active',
  'base-progress-recipe-ratio', 'base-quality-required-ratio',
  'current-cp-absolute', 'max-cp-absolute',
  'craftsmanship-recommended-margin', 'cosmic-tool-good-bonus',
  'pliant-x-manipulation', 'pliant-x-waste-not', 'pliant-x-innovation', 'pliant-x-veneration',
  'good-x-great-strides', 'good-x-innovation',
  'centered-x-expedience', 'sturdy-x-waste-not', 'malleable-x-veneration',
  'low-durability-x-manipulation', 'high-iq-x-innovation',
  'quality-finisher-readiness', 'progress-finisher-pressure',
] as const

export function encodePolicyState(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
): number[] {
  const conditions = ['normal', 'good', 'centered', 'sturdy', 'pliant', 'malleable'] as const
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
  const qualityRatio = state.quality / recipe.requiredQuality
  const progressRatio = state.progress / recipe.progressRequired
  const innerQuietRatio = state.innerQuiet / 10
  return [
    1,
    progressRatio,
    qualityRatio,
    durabilityRatio,
    state.cp / Math.max(1, crafter.maxCp),
    state.innerQuiet / 10,
    Math.min(1, state.step / 40),
    ...conditions.map((condition) => Number(state.condition === condition)),
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
    calculateBaseProgress(recipe, crafter) / recipe.progressRequired,
    calculateBaseQuality(recipe, crafter) / recipe.requiredQuality,
    state.cp / 1_000,
    crafter.maxCp / 1_000,
    (crafter.craftsmanship - recipe.recommendedCraftsmanship) / 1_000,
    Number(crafter.cosmicToolGoodBonus),
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
}
