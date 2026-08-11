import type { CraftState, CrafterProfile, RecipeProfile } from './types'

export function assertCraftState(recipe: RecipeProfile, crafter: CrafterProfile, state: CraftState): void {
  if (crafter.craftsmanship <= 0 || crafter.control <= 0 || crafter.maxCp <= 0) throw new Error('Crafter stats must be positive')
  if (!Number.isInteger(state.step) || state.step < 1) throw new Error('Step must be a positive integer')
  if (state.progress < 0 || state.progress > recipe.progressRequired) throw new Error('Progress out of range')
  if (state.quality < 0 || state.quality > recipe.qualityMax) throw new Error('Quality out of range')
  if (state.durability > recipe.durabilityMax) throw new Error('Durability exceeds recipe maximum')
  if (state.cp < 0 || state.cp > crafter.maxCp) throw new Error('CP out of range')
  if (state.innerQuiet < 0 || state.innerQuiet > 10) throw new Error('Inner Quiet out of range')
  for (const duration of Object.values(state.buffs)) {
    if (!Number.isInteger(duration) || duration < 0) throw new Error('Buff duration out of range')
  }
  if (state.terminal === 'completed' && (state.progress < recipe.progressRequired || state.quality < recipe.requiredQuality)) throw new Error('Completed state has insufficient progress or quality')
  if (state.terminal === 'failed' && state.failureReason === null) throw new Error('Failed state needs a reason')
  if (state.failureReason === 'durability' && (state.durability > 0 || state.progress >= recipe.progressRequired)) throw new Error('Durability failure is inconsistent')
  if (state.failureReason === 'required-quality' && (state.progress < recipe.progressRequired || state.quality >= recipe.requiredQuality)) throw new Error('Required-quality failure is inconsistent')
  if (state.terminal === 'none' && (state.progress >= recipe.progressRequired || state.durability <= 0)) throw new Error('Non-terminal state is inconsistent')
  if (state.terminal !== 'failed' && state.failureReason !== null) throw new Error('Non-failed state has a failure reason')
}
