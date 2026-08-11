import {
  ACTIONS,
  legalActions,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'

function wouldPrematurelyComplete(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
): boolean {
  const preview = previewAction(recipe, crafter, state, action)
  return preview.progressGain > 0
    && state.progress + preview.progressGain >= recipe.progressRequired
    && state.quality < recipe.requiredQuality
}

function scoreGuideAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
): number {
  const preview = previewAction(recipe, crafter, state, action)
  const progressRatio = state.progress / recipe.progressRequired
  const qualityRatio = state.quality / recipe.requiredQuality
  const effectiveDurability = state.durability + state.buffs.manipulation * 5
  const progressGap = recipe.progressRequired - state.progress
  let score = preview.qualityGain * 5 + preview.progressGain * 2
    - preview.cpCost * 18 - preview.durabilityCost * 45

  if (state.step === 1) {
    if (action === 'muscleMemory') score += 180_000
    if (action === 'reflect') score += 145_000
    return score
  }

  if (state.quality >= recipe.requiredQuality) {
    if (preview.progressGain >= progressGap) score += 400_000 - preview.cpCost * 100
    if (ACTIONS[action].category !== 'progress') score -= 300_000
    return score
  }

  if (wouldPrematurelyComplete(recipe, crafter, state, action)) return -1_000_000

  if (progressRatio < 0.82) {
    if (action === 'veneration' && state.buffs.veneration === 0) score += 32_000
    if (action === 'rapidSynthesis') score += 28_000
    if (action === 'groundwork') score += 18_000
    if (action === 'carefulSynthesis') score += 9_000
    if (state.buffs.muscleMemory > 0 && ACTIONS[action].category === 'progress') score += 75_000
  } else if (ACTIONS[action].category === 'progress') {
    score -= 12_000
  }

  if (effectiveDurability <= 12) {
    if (action === 'trainedPerfection' && state.trainedPerfectionAvailable) score += 55_000
    if (action === 'immaculateMend' && state.durability <= 10) score += 48_000
    if (action === 'mastersMend' && state.durability <= recipe.durabilityMax - 25) score += 38_000
    if (action === 'manipulation' && state.buffs.manipulation === 0) score += 35_000
    if (preview.durabilityCost > 0) score -= 38_000
  } else {
    if (action === 'immaculateMend' || action === 'mastersMend') score -= 35_000
    if (action === 'manipulation' && state.buffs.manipulation > 2) score -= 32_000
  }

  if (state.condition === 'good') {
    if (action === 'preciseTouch' && state.innerQuiet < 10) score += 62_000
    if (action === 'tricksOfTheTrade' && state.cp <= crafter.maxCp - 20) score += state.cp < 140 ? 65_000 : 25_000
    if (action === 'intensiveSynthesis' && progressRatio < 0.82) score += 48_000
  }
  if (state.condition === 'centered') {
    if (action === 'rapidSynthesis' && progressRatio < 0.84) score += 32_000
    if (action === 'hastyTouch' || action === 'daringTouch') score += 20_000
  }
  if (state.condition === 'sturdy') {
    if (action === 'preparatoryTouch' && state.durability >= 20) score += 30_000
    if (action === 'basicTouch') score += 18_000
    if (action === 'groundwork' && progressRatio < 0.82) score += 22_000
  }
  if (state.condition === 'pliant') {
    if (action === 'manipulation' && state.buffs.manipulation <= 1) score += 55_000
    if (action === 'immaculateMend' && state.durability <= 10) score += 48_000
    if (action === 'wasteNot2' && state.buffs.wasteNot === 0) score += 24_000
    if (action === 'innovation' && state.buffs.innovation === 0 && state.innerQuiet >= 6) score += 22_000
    if (action === 'preparatoryTouch' && state.durability >= 20) score += 22_000
  }
  if (state.condition === 'malleable' && progressRatio < 0.84) {
    if (action === 'groundwork') score += 48_000
    if (action === 'rapidSynthesis') score += 42_000
    if (action === 'carefulSynthesis') score += 18_000
  }

  if (state.comboFrom === 'basicTouch') {
    if (action === 'refinedTouch' && state.innerQuiet <= 8) score += 54_000
    if (action === 'standardTouch') score += state.buffs.innovation > 0 ? 58_000 : 38_000
  }
  if ((state.comboFrom === 'standardTouch' || state.comboFrom === 'observe') && action === 'advancedTouch') {
    score += 72_000
  }

  if (state.innerQuiet < 10) {
    if (action === 'prudentTouch' && state.buffs.wasteNot === 0) score += 24_000
    if (action === 'basicTouch' && state.durability >= 20 && state.cp >= 54) score += state.buffs.innovation > 0 ? 35_000 : 18_000
    if (action === 'preparatoryTouch' && state.durability >= 20 && state.innerQuiet <= 8) score += 16_000
    if (action === 'innovation' && state.innerQuiet < 5) score -= 28_000
  } else {
    if (action === 'innovation' && state.buffs.innovation === 0 && state.cp >= 74) score += 60_000
    if (action === 'trainedFinesse' && state.buffs.innovation > 0) score += 55_000
    if (action === 'observe' && state.buffs.innovation >= 2 && state.cp >= 25) score += 34_000
    if (action === 'greatStrides' && state.cp >= 56) score += qualityRatio > 0.68 ? 72_000 : 25_000
    if (action === 'byregotsBlessing') {
      score += state.buffs.greatStrides > 0 ? 135_000 : 25_000
      score += state.buffs.innovation > 0 ? 75_000 : 0
      score += qualityRatio > 0.72 ? 45_000 : -45_000
    }
  }

  if (state.buffs.innovation > 0 && ACTIONS[action].category === 'quality') {
    score += preview.qualityGain * 2.5
  }
  if (action === 'innovation' && state.buffs.innovation > 0) score -= 100_000
  if (action === 'veneration' && state.buffs.veneration > 0) score -= 100_000
  if (action === 'wasteNot' && state.buffs.wasteNot > 0) score -= 100_000
  if (action === 'wasteNot2' && state.buffs.wasteNot > 0) score -= 100_000
  if (action === 'finalAppraisal') score -= 20_000

  return score
}

export function guideRolloutAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
): CraftActionId | null {
  const ranked = legalActions(recipe, crafter, state)
    .filter((action) => !wouldPrematurelyComplete(recipe, crafter, state, action))
    .map((action) => ({ action, score: scoreGuideAction(recipe, crafter, state, action) }))
    .sort((a, b) => b.score - a.score || a.action.localeCompare(b.action))
  return ranked[0]?.action ?? null
}
