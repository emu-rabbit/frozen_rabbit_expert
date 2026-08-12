import type { CraftActionId } from '@frozen-rabbit-expert/domain'

// Blacksmith CraftAction icon IDs verified against XIVAPI game data revision
// c3f948214b90e498 on 2026-08-11. Shared crafting actions use Action-sheet icons.
const actionIconPath = (fileName: string): string => `${import.meta.env.BASE_URL}action-icons/${fileName}`

export const ACTION_ICON_PATHS: Record<CraftActionId, string> = {
  basicSynthesis: actionIconPath('basic-synthesis.png'),
  rapidSynthesis: actionIconPath('rapid-synthesis.png'),
  carefulSynthesis: actionIconPath('careful-synthesis.png'),
  groundwork: actionIconPath('groundwork.png'),
  prudentSynthesis: actionIconPath('prudent-synthesis.png'),
  intensiveSynthesis: actionIconPath('intensive-synthesis.png'),
  muscleMemory: actionIconPath('muscle-memory.png'),
  basicTouch: actionIconPath('basic-touch.png'),
  hastyTouch: actionIconPath('hasty-touch.png'),
  standardTouch: actionIconPath('standard-touch.png'),
  advancedTouch: actionIconPath('advanced-touch.png'),
  prudentTouch: actionIconPath('prudent-touch.png'),
  preparatoryTouch: actionIconPath('preparatory-touch.png'),
  preciseTouch: actionIconPath('precise-touch.png'),
  byregotsBlessing: actionIconPath('byregots-blessing.png'),
  trainedFinesse: actionIconPath('trained-finesse.png'),
  refinedTouch: actionIconPath('refined-touch.png'),
  daringTouch: actionIconPath('daring-touch.png'),
  reflect: actionIconPath('reflect.png'),
  delicateSynthesis: actionIconPath('delicate-synthesis.png'),
  tricksOfTheTrade: actionIconPath('tricks-of-the-trade.png'),
  trainedPerfection: actionIconPath('trained-perfection.png'),
  mastersMend: actionIconPath('masters-mend.png'),
  immaculateMend: actionIconPath('immaculate-mend.png'),
  wasteNot: actionIconPath('waste-not.png'),
  wasteNot2: actionIconPath('waste-not-ii.png'),
  veneration: actionIconPath('veneration.png'),
  innovation: actionIconPath('innovation.png'),
  greatStrides: actionIconPath('great-strides.png'),
  manipulation: actionIconPath('manipulation.png'),
  observe: actionIconPath('observe.png'),
  finalAppraisal: actionIconPath('final-appraisal.png'),
  // Temporary semantic fallbacks until the three specialist icon assets land.
  carefulObservation: actionIconPath('observe.png'),
  heartAndSoul: actionIconPath('tricks-of-the-trade.png'),
  quickInnovation: actionIconPath('innovation.png'),
}
