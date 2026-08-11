import type { CrafterProfile, CraftState, RecipeProfile } from './types'

export function createInitialCraftState(recipe: RecipeProfile, crafter: CrafterProfile): CraftState {
  return {
    step: 1,
    progress: 0,
    quality: 0,
    durability: recipe.durabilityMax,
    cp: crafter.maxCp,
    condition: 'normal',
    innerQuiet: 0,
    buffs: {
      wasteNot: 0,
      veneration: 0,
      greatStrides: 0,
      innovation: 0,
      finalAppraisal: 0,
      manipulation: 0,
      muscleMemory: 0,
      expedience: 0,
    },
    comboFrom: null,
    trainedPerfectionAvailable: true,
    trainedPerfectionActive: false,
    terminal: 'none',
    failureReason: null,
  }
}
