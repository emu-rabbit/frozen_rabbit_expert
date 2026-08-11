import type { CrafterProfile, CraftState, RecipeProfile } from '@frozen-rabbit-expert/domain'

export const POLICY_FEATURE_SCHEMA = [
  'bias-feature',
  'progress-ratio', 'quality-ratio', 'durability-ratio', 'cp-ratio', 'inner-quiet', 'step',
  'condition-normal', 'condition-good', 'condition-centered', 'condition-sturdy', 'condition-pliant', 'condition-malleable',
  'buff-waste-not', 'buff-veneration', 'buff-great-strides', 'buff-innovation',
  'buff-final-appraisal', 'buff-manipulation', 'buff-muscle-memory', 'buff-expedience',
  'combo-none', 'combo-basic-touch', 'combo-standard-touch', 'combo-observe', 'combo-other',
  'trained-perfection-available', 'trained-perfection-active',
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
  return [
    1,
    state.progress / recipe.progressRequired,
    state.quality / recipe.requiredQuality,
    state.durability / recipe.durabilityMax,
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
  ]
}
