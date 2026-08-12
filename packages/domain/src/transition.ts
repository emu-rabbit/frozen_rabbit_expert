import { ACTIONS } from './actions'
import { calculateBaseProgress, calculateBaseQuality } from './formulas'
import { applyEmpiricalQualityCorrection } from './qualityCorrections'
import type {
  ActionPreview,
  CraftActionId,
  CrafterProfile,
  CraftState,
  ObservedActionOutcome,
  RecipeProfile,
  TransitionResult,
} from './types'

const HEART_AND_SOUL_ACTIONS = new Set<CraftActionId>([
  'preciseTouch',
  'intensiveSynthesis',
  'tricksOfTheTrade',
])

function heartAndSoulBypassesCondition(
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
): boolean {
  return crafter.specialist === true
    && state.heartAndSoulActive
    && state.condition !== 'good'
    && HEART_AND_SOUL_ACTIONS.has(action)
}

function comboCpCost(state: CraftState, action: CraftActionId, baseCost: number): number {
  if (action === 'standardTouch' && state.comboFrom === 'basicTouch') return 18
  if (action === 'advancedTouch' && (state.comboFrom === 'standardTouch' || state.comboFrom === 'observe')) return 18
  return baseCost
}

function adjustedCpCost(state: CraftState, action: CraftActionId): number {
  const baseCost = comboCpCost(state, action, ACTIONS[action].cpCost)
  return state.condition === 'pliant' ? Math.ceil(baseCost / 2) : baseCost
}

function durabilityCostBeforePerfection(state: CraftState, baseCost: number): number {
  let divider = 1
  if (state.condition === 'sturdy') divider *= 2
  if (state.buffs.wasteNot > 0) divider *= 2
  return Math.ceil(baseCost / divider)
}

function adjustedDurabilityCost(state: CraftState, baseCost: number): number {
  if (baseCost > 0 && state.trainedPerfectionActive) return 0
  return durabilityCostBeforePerfection(state, baseCost)
}

function adjustedSuccessRate(state: CraftState, baseRate: number): number {
  return Math.min(1, baseRate + (state.condition === 'centered' ? 0.25 : 0))
}

function actionProgressPotency(state: CraftState, action: CraftActionId): number | undefined {
  const definition = ACTIONS[action]
  if (definition.progressPotency === undefined) return undefined
  if (
    action === 'groundwork' &&
    !state.trainedPerfectionActive &&
    state.durability < durabilityCostBeforePerfection(state, definition.durabilityCost)
  ) {
    return definition.progressPotency / 2
  }
  return definition.progressPotency
}

function progressGain(recipe: RecipeProfile, crafter: CrafterProfile, state: CraftState, action: CraftActionId): number {
  const potency = actionProgressPotency(state, action)
  if (potency === undefined) return 0
  const baseProgress = Math.floor(calculateBaseProgress(recipe, crafter))
  let buffModifier = 1
  if (state.buffs.muscleMemory > 0 && action !== 'muscleMemory') buffModifier += 1
  if (state.buffs.veneration > 0) buffModifier += 0.5
  const conditionModifier = state.condition === 'malleable' ? 1.5 : 1
  return Math.floor((baseProgress * conditionModifier * potency * buffModifier) / 100)
}

function actionQualityPotency(state: CraftState, action: CraftActionId): number | undefined {
  if (action === 'byregotsBlessing') return Math.min(300, 100 + state.innerQuiet * 20)
  return ACTIONS[action].qualityPotency
}

function qualityGain(recipe: RecipeProfile, crafter: CrafterProfile, state: CraftState, action: CraftActionId): number {
  const potency = actionQualityPotency(state, action)
  if (potency === undefined) return 0
  const baseQuality = Math.floor(calculateBaseQuality(recipe, crafter))
  let buffMultiplier = 1
  if (state.buffs.greatStrides > 0) buffMultiplier += 1
  if (state.buffs.innovation > 0) buffMultiplier += 0.5
  const innerQuietMultiplier = (100 + state.innerQuiet * 10) / 100
  const efficiency = Math.fround(potency * buffMultiplier * innerQuietMultiplier)
  const conditionMultiplier = state.condition === 'good'
    ? (crafter.cosmicToolGoodBonus ? 1.75 : 1.5)
    : 1
  const calculatedGain = Math.floor((baseQuality * conditionMultiplier * efficiency) / 100)
  return applyEmpiricalQualityCorrection({
    recipe,
    crafter,
    state,
    actionId: action,
    calculatedGain,
  })
}

export function previewAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  actionId: CraftActionId,
): ActionPreview {
  const action = ACTIONS[actionId]
  const cpCost = adjustedCpCost(state, actionId)
  const durabilityCost = adjustedDurabilityCost(state, action.durabilityCost)
  let reason: string | undefined

  if (state.terminal !== 'none') reason = 'terminal'
  else if (action.specialistOnly && crafter.specialist !== true) reason = 'specialist'
  else if (actionId === 'carefulObservation' && state.carefulObservationUsesLeft <= 0) reason = 'careful-observation-exhausted'
  else if (actionId === 'heartAndSoul' && state.heartAndSoulActive) reason = 'heart-and-soul-active'
  else if (actionId === 'heartAndSoul' && !state.heartAndSoulAvailable) reason = 'heart-and-soul-unavailable'
  else if (actionId === 'quickInnovation' && state.buffs.innovation > 0) reason = 'innovation-active'
  else if (actionId === 'quickInnovation' && !state.quickInnovationAvailable) reason = 'quick-innovation-unavailable'
  else if (action.availableOnStep !== undefined && state.step !== action.availableOnStep) reason = 'wrong-step'
  else if (
    action.requiresCondition
    && !action.requiresCondition.includes(state.condition)
    && !heartAndSoulBypassesCondition(crafter, state, actionId)
  ) reason = 'condition'
  else if (action.unavailableWithWasteNot && state.buffs.wasteNot > 0) reason = 'waste-not-conflict'
  else if (actionId === 'byregotsBlessing' && state.innerQuiet < 1) reason = 'inner-quiet-required'
  else if (actionId === 'trainedFinesse' && state.innerQuiet !== 10) reason = 'inner-quiet-ten-required'
  else if (actionId === 'daringTouch' && state.buffs.expedience < 1) reason = 'expedience-required'
  else if (actionId === 'trainedPerfection' && !state.trainedPerfectionAvailable) reason = 'already-used'
  else if (state.cp < cpCost) reason = 'cp'

  return {
    action,
    legal: reason === undefined,
    ...(reason === undefined ? {} : { reason }),
    cpCost,
    durabilityCost,
    successRate: adjustedSuccessRate(state, action.successRate),
    progressGain: progressGain(recipe, crafter, state, actionId),
    qualityGain: qualityGain(recipe, crafter, state, actionId),
  }
}

function tickExistingBuffs(state: CraftState): CraftState['buffs'] {
  return {
    wasteNot: Math.max(0, state.buffs.wasteNot - 1),
    veneration: Math.max(0, state.buffs.veneration - 1),
    greatStrides: Math.max(0, state.buffs.greatStrides - 1),
    innovation: Math.max(0, state.buffs.innovation - 1),
    finalAppraisal: Math.max(0, state.buffs.finalAppraisal - 1),
    manipulation: Math.max(0, state.buffs.manipulation - 1),
    muscleMemory: Math.max(0, state.buffs.muscleMemory - 1),
    expedience: Math.max(0, state.buffs.expedience - 1),
  }
}

function comboAfter(state: CraftState, action: CraftActionId, success: boolean): CraftActionId | null {
  if (!success) return null
  if (action === 'basicTouch') return action
  if (action === 'standardTouch' && state.comboFrom === 'basicTouch') return action
  if (action === 'observe') return action
  return null
}

export function applyObservedOutcome(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  actionId: CraftActionId,
  observed: ObservedActionOutcome,
): TransitionResult {
  const preview = previewAction(recipe, crafter, state, actionId)
  if (!preview.legal) throw new Error(`Illegal action ${actionId}: ${preview.reason}`)

  const action = ACTIONS[actionId]
  const isNoStep = action.noStep === true
  const previousBuffs = state.buffs
  const explanationCodes: string[] = []
  let progress = state.progress
  let quality = state.quality
  let durability = state.durability - preview.durabilityCost
  let cp = state.cp - preview.cpCost
  let innerQuiet = state.innerQuiet
  let buffs = isNoStep ? { ...previousBuffs } : tickExistingBuffs(state)
  let trainedPerfectionAvailable = state.trainedPerfectionAvailable
  let trainedPerfectionActive = state.trainedPerfectionActive
  let carefulObservationUsesLeft = state.carefulObservationUsesLeft
  let heartAndSoulAvailable = state.heartAndSoulAvailable
  let heartAndSoulActive = state.heartAndSoulActive
  let quickInnovationAvailable = state.quickInnovationAvailable

  if (action.durabilityCost > 0 && state.trainedPerfectionActive) trainedPerfectionActive = false
  if (heartAndSoulBypassesCondition(crafter, state, actionId)) heartAndSoulActive = false

  if (observed.success) {
    if (preview.progressGain > 0) {
      progress += preview.progressGain
      explanationCodes.push('progress-gained')
    }
    if (preview.qualityGain > 0) {
      quality += preview.qualityGain
      innerQuiet = Math.min(10, innerQuiet + 1)
      if (['preciseTouch', 'preparatoryTouch', 'reflect'].includes(actionId)) innerQuiet = Math.min(10, innerQuiet + 1)
      if (actionId === 'refinedTouch' && state.comboFrom === 'basicTouch') innerQuiet = Math.min(10, innerQuiet + 1)
      explanationCodes.push('quality-gained')
    }

    if (action.qualityPotency !== undefined || actionId === 'byregotsBlessing') buffs.greatStrides = 0
    if (action.progressPotency !== undefined && actionId !== 'muscleMemory') buffs.muscleMemory = 0
    if (actionId === 'byregotsBlessing') innerQuiet = 0
    if (actionId === 'hastyTouch') buffs.expedience = 1
    if (actionId === 'mastersMend') durability = Math.min(recipe.durabilityMax, durability + 30)
    if (actionId === 'immaculateMend') durability = recipe.durabilityMax
    if (actionId === 'tricksOfTheTrade') cp = Math.min(crafter.maxCp, cp + 20)
    if (actionId === 'wasteNot') buffs.wasteNot = 4
    if (actionId === 'wasteNot2') buffs.wasteNot = 8
    if (actionId === 'veneration') buffs.veneration = 4
    if (actionId === 'innovation') buffs.innovation = 4
    if (actionId === 'greatStrides') buffs.greatStrides = 3
    if (actionId === 'manipulation') buffs.manipulation = 8
    if (actionId === 'muscleMemory') buffs.muscleMemory = 5
    if (actionId === 'finalAppraisal') buffs.finalAppraisal = 5
    if (actionId === 'trainedPerfection') {
      trainedPerfectionAvailable = false
      trainedPerfectionActive = true
    }
    if (actionId === 'carefulObservation') carefulObservationUsesLeft -= 1
    if (actionId === 'heartAndSoul') {
      heartAndSoulAvailable = false
      heartAndSoulActive = true
    }
    if (actionId === 'quickInnovation') {
      quickInnovationAvailable = false
      buffs.innovation = 1
    }
  } else {
    explanationCodes.push('action-failed')
  }

  if (
    observed.success &&
    progress >= recipe.progressRequired &&
    state.buffs.finalAppraisal > 0 &&
    action.progressPotency !== undefined
  ) {
    progress = recipe.progressRequired - 1
    buffs.finalAppraisal = 0
    explanationCodes.push('final-appraisal-triggered')
  }

  progress = Math.min(recipe.progressRequired, Math.max(0, progress))
  quality = Math.min(recipe.qualityMax, Math.max(0, quality))
  durability = Math.min(recipe.durabilityMax, durability)

  let terminal: CraftState['terminal'] = 'none'
  let failureReason: CraftState['failureReason'] = null
  if (progress >= recipe.progressRequired) {
    if (quality >= recipe.requiredQuality) terminal = 'completed'
    else {
      terminal = 'failed'
      failureReason = 'required-quality'
    }
  } else if (durability <= 0) {
    terminal = 'failed'
    failureReason = 'durability'
  }

  if (
    terminal === 'none' &&
    !isNoStep &&
    previousBuffs.manipulation > 0 &&
    actionId !== 'manipulation'
  ) {
    durability = Math.min(recipe.durabilityMax, durability + 5)
  }

  return {
    nextState: {
      step: isNoStep ? state.step : state.step + 1,
      progress,
      quality,
      durability,
      cp,
      condition: action.rerollsCondition === true
        ? observed.nextCondition
        : isNoStep
          ? state.condition
          : observed.nextCondition,
      innerQuiet,
      buffs,
      comboFrom: isNoStep ? state.comboFrom : comboAfter(state, actionId, observed.success),
      trainedPerfectionAvailable,
      trainedPerfectionActive,
      carefulObservationUsesLeft,
      heartAndSoulAvailable,
      heartAndSoulActive,
      quickInnovationAvailable,
      terminal,
      failureReason,
    },
    explanationCodes,
  }
}

export function legalActions(recipe: RecipeProfile, crafter: CrafterProfile, state: CraftState): CraftActionId[] {
  return (Object.keys(ACTIONS) as CraftActionId[]).filter((action) => previewAction(recipe, crafter, state, action).legal)
}
