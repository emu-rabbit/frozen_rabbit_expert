import {
  ACTIONS,
  legalActions,
  previewAction,
  type CraftActionId,
} from '@frozen-rabbit-expert/domain'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'

/**
 * Video-informed offline continuation policy. The historical evidence used
 * 5408 craftsmanship, 5237 control, 722 CP, and the cosmic-tool Good bonus,
 * but the implementation deliberately reads the supplied CrafterProfile so a
 * 749-CP medicine profile can be evaluated as a separate benchmark.
 * It remains research-only until full held-out and real-trace gates pass.
 */
export const targetCrafterSafePolicy: EpisodePolicy = (recipe, crafter, state) => {
  const safe = legalActions(recipe, crafter, state)
    .filter((action) => isPolicyActionSafe(recipe, crafter, state, action))
  const can = (action: CraftActionId): boolean => safe.includes(action)
  const first = (...actions: CraftActionId[]): CraftActionId | null => actions.find(can) ?? null
  const progressRatio = state.progress / recipe.progressRequired

  if (state.step === 1) return first('muscleMemory', 'reflect')
  if (state.quality >= recipe.requiredQuality) {
    return safe
      .filter((action) => ACTIONS[action].category === 'progress')
      .sort((left, right) => {
        const a = previewAction(recipe, crafter, state, left)
        const b = previewAction(recipe, crafter, state, right)
        const aCompletes = Number(state.progress + a.progressGain >= recipe.progressRequired && a.successRate === 1)
        const bCompletes = Number(state.progress + b.progressGain >= recipe.progressRequired && b.successRate === 1)
        return bCompletes - aCompletes || b.progressGain * b.successRate - a.progressGain * a.successRate
      })[0] ?? null
  }

  if (state.buffs.muscleMemory > 0) {
    if (state.trainedPerfectionAvailable && can('trainedPerfection')) return 'trainedPerfection'
    if (state.buffs.veneration === 0 && can('veneration')) return 'veneration'
    if (state.condition === 'good' && can('intensiveSynthesis')) return 'intensiveSynthesis'
    return first('groundwork', 'rapidSynthesis', 'carefulSynthesis')
  }

  if (state.condition === 'pliant' && state.buffs.manipulation === 0 && state.durability <= 20 && can('manipulation')) {
    return 'manipulation'
  }

  if (state.durability <= 10) {
    if (state.condition === 'good' && state.cp <= crafter.maxCp - 20 && can('tricksOfTheTrade')) {
      return 'tricksOfTheTrade'
    }
    if (can('trainedPerfection')) return 'trainedPerfection'
    if (state.condition === 'pliant' && can('immaculateMend')) return 'immaculateMend'
    if (can('mastersMend')) return 'mastersMend'
    if (can('immaculateMend')) return 'immaculateMend'
  }

  if (progressRatio < 0.82) {
    if (state.condition === 'good') {
      return first('intensiveSynthesis', 'tricksOfTheTrade', 'carefulSynthesis')
    }
    if (state.condition === 'pliant') {
      if (state.buffs.manipulation === 0 && state.durability <= 20 && can('manipulation')) return 'manipulation'
      if (state.buffs.veneration === 0 && can('veneration')) return 'veneration'
    }
    if (state.condition === 'malleable' && state.buffs.veneration === 0 && can('veneration')) return 'veneration'
    if (state.condition === 'malleable') return first('groundwork', 'rapidSynthesis', 'carefulSynthesis', 'prudentSynthesis')
    if (state.condition === 'centered') return first('rapidSynthesis', 'carefulSynthesis', 'prudentSynthesis')
    if (state.condition === 'sturdy') return first('rapidSynthesis', 'groundwork', 'carefulSynthesis')
    return first('rapidSynthesis', 'carefulSynthesis', 'prudentSynthesis')
  }

  if (state.condition === 'good') {
    if (state.innerQuiet < 10 && can('preciseTouch')) return 'preciseTouch'
    if (state.innerQuiet === 10 && state.buffs.innovation > 0 && can('preciseTouch')) return 'preciseTouch'
    if (state.cp <= crafter.maxCp - 20 && can('tricksOfTheTrade')) return 'tricksOfTheTrade'
  }
  if (state.condition === 'pliant') {
    if (state.buffs.manipulation === 0 && state.durability <= 20 && can('manipulation')) return 'manipulation'
    if (state.buffs.wasteNot === 0 && state.innerQuiet < 10 && can('wasteNot2')) return 'wasteNot2'
    if (state.innerQuiet === 10 && state.buffs.innovation === 0 && can('innovation')) return 'innovation'
  }

  if (state.buffs.manipulation === 0 && state.durability <= 15 && can('manipulation')) return 'manipulation'
  if (state.innerQuiet < 10) {
    if (state.comboFrom === 'basicTouch') return first('refinedTouch', 'standardTouch')
    if (state.comboFrom === 'standardTouch' || state.comboFrom === 'observe') return first('advancedTouch')
    if (state.condition === 'sturdy') return first('preparatoryTouch', 'hastyTouch', 'basicTouch')
    if (state.condition === 'centered') return first('hastyTouch', 'prudentTouch', 'basicTouch')
    if (state.buffs.wasteNot > 0) return first('preparatoryTouch', 'hastyTouch', 'basicTouch')
    return first('prudentTouch', 'hastyTouch', 'basicTouch')
  }

  if (state.buffs.greatStrides > 0) return first('byregotsBlessing', 'trainedFinesse')
  if (state.buffs.innovation === 0 && state.cp >= 74 && can('innovation')) return 'innovation'
  if (state.buffs.innovation > 0) {
    const blessing = previewAction(
      recipe,
      crafter,
      { ...state, buffs: { ...state.buffs, greatStrides: 2 } },
      'byregotsBlessing',
    )
    if (state.quality + blessing.qualityGain >= recipe.requiredQuality && can('greatStrides')) return 'greatStrides'
    if (state.cp >= 88 && can('trainedFinesse')) return 'trainedFinesse'
    if (state.cp >= 56 && can('greatStrides')) return 'greatStrides'
  }
  if (state.cp >= 88 && can('trainedFinesse')) return 'trainedFinesse'
  if (can('byregotsBlessing')) return 'byregotsBlessing'
  if (state.condition === 'centered') return first('hastyTouch', 'daringTouch')
  return first('observe', 'hastyTouch')
}
