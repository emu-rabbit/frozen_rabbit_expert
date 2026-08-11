import type { CrafterProfile, RecipeProfile } from './types'

// Formula order adapted from ffxiv-teamcraft/simulator at commit
// 74e167a05ba279526d2ddd457a048e234bedbad9 (MIT).
const LEVEL_TABLE_100 = 690

export function calculateBaseProgress(recipe: RecipeProfile, crafter: CrafterProfile): number {
  const baseValue = (crafter.craftsmanship * 10) / recipe.progressDivider + 2
  if (LEVEL_TABLE_100 <= recipe.recipeLevel) {
    return Math.fround(baseValue * recipe.progressModifier * Math.fround(0.01))
  }
  return Math.floor(baseValue)
}

export function calculateBaseQuality(recipe: RecipeProfile, crafter: CrafterProfile): number {
  const baseValue = (crafter.control * 10) / recipe.qualityDivider + 35
  if (LEVEL_TABLE_100 <= recipe.recipeLevel) {
    return Math.fround(baseValue * recipe.qualityModifier * Math.fround(0.01))
  }
  return Math.floor(baseValue)
}
