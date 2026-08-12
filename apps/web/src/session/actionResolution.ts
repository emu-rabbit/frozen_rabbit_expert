import {
  ACTIONS,
  applyObservedOutcome,
  previewAction,
  type CraftActionId,
  type CraftState,
  type CrafterProfile,
  type MaterialCondition,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'

export type ResolutionConditionMode =
  | 'await-result'
  | 'terminal'
  | 'select'
  | 'forced-good'
  | 'unchanged'

export interface ActionResolutionInspection {
  successRequired: boolean
  resolvedSuccess: boolean | null
  terminal: Exclude<CraftState['terminal'], 'none'> | null
  conditionMode: ResolutionConditionMode
}

/**
 * Decides which player observation is still required after an action is used.
 * A terminal transition has no next condition in-game, so it must be settled
 * without asking the player to invent one.
 */
export function inspectActionResolution(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  reportedSuccess: boolean | null,
): ActionResolutionInspection {
  const preview = previewAction(recipe, crafter, state, action)
  if (!preview.legal) throw new Error(`Cannot inspect illegal action ${action}: ${preview.reason}`)

  const successRequired = preview.successRate < 1
  const resolvedSuccess = successRequired ? reportedSuccess : true
  if (resolvedSuccess === null) {
    return {
      successRequired,
      resolvedSuccess,
      terminal: null,
      conditionMode: 'await-result',
    }
  }

  const terminal = applyObservedOutcome(recipe, crafter, state, action, {
    success: resolvedSuccess,
    // Terminal detection is independent of the next condition. Reusing the
    // current value avoids fabricating an observation that does not exist.
    nextCondition: state.condition,
  }).nextState.terminal

  if (terminal !== 'none') {
    return {
      successRequired,
      resolvedSuccess,
      terminal,
      conditionMode: 'terminal',
    }
  }

  const definition = ACTIONS[action]
  if (definition.noStep === true && definition.rerollsCondition !== true) {
    return {
      successRequired,
      resolvedSuccess,
      terminal: null,
      conditionMode: 'unchanged',
    }
  }
  if (state.condition === 'goodOmen' && definition.noStep !== true) {
    return {
      successRequired,
      resolvedSuccess,
      terminal: null,
      conditionMode: 'forced-good',
    }
  }
  return {
    successRequired,
    resolvedSuccess,
    terminal: null,
    conditionMode: 'select',
  }
}

export function conditionForResolvedEvent(
  inspection: ActionResolutionInspection,
  currentCondition: MaterialCondition,
  selectedCondition: MaterialCondition,
): MaterialCondition {
  if (inspection.conditionMode === 'forced-good') return 'good'
  if (inspection.conditionMode === 'terminal' || inspection.conditionMode === 'unchanged') {
    return currentCondition
  }
  return selectedCondition
}
