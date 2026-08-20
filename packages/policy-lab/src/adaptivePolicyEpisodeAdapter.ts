import {
  applyObservedOutcome,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'
import {
  craftAdaptivePolicyContextContentHashV1,
  craftAdaptivePolicyStateContentHashV1,
  createCraftAdaptivePolicyControllerV1,
  type CraftAdaptivePolicyContextV1,
  type CraftAdaptivePolicyControllerV1,
  type CraftAdaptivePolicyDecisionResultV1,
  type CraftAdaptivePolicyProgramV1,
  type SerializableCraftAdaptivePolicyMemoryV1,
} from '@frozen-rabbit-expert/solver'

export interface AdaptivePolicyEpisodeAdapterV1 {
  readonly controller: CraftAdaptivePolicyControllerV1
  readonly firstDecision: CraftAdaptivePolicyDecisionResultV1
  readonly firstAction: CraftActionId | null
  readonly policy: EpisodePolicy
  readonly hasPendingObservation: () => boolean
  readonly observeFinalState: (
    state: Readonly<CraftState>,
  ) => SerializableCraftAdaptivePolicyMemoryV1
}

function detachedClone<T>(value: Readonly<T>): T {
  return structuredClone(value)
}

function inferObservedSuccess(
  context: Readonly<CraftAdaptivePolicyContextV1>,
  before: Readonly<CraftState>,
  action: CraftActionId,
  after: Readonly<CraftState>,
): boolean {
  const preview = previewAction(context.recipe, context.crafter, before, action)
  if (preview.successRate === 1) return true
  if (preview.successRate === 0) return false
  const afterHash = craftAdaptivePolicyStateContentHashV1(after)
  const candidates = [true, false].filter((success) => craftAdaptivePolicyStateContentHashV1(applyObservedOutcome(
    context.recipe,
    context.crafter,
    before,
    action,
    { success, nextCondition: after.condition },
  ).nextState) === afterHash)
  if (candidates.length !== 1) {
    throw new Error(
      `cannot infer one observed outcome for adaptive episode action ${action}: ${candidates.length} matches`,
    )
  }
  return candidates[0]!
}

/**
 * Bridges the simulator's split firstAction/policy interface to the adaptive
 * controller's decide/advance protocol. It reconstructs the observed success
 * from the exact mechanics transition; it never reads seed or future condition
 * draws and therefore remains suitable for causal closed-loop evaluation.
 */
export function createAdaptivePolicyEpisodeAdapterV1(
  context: Readonly<CraftAdaptivePolicyContextV1>,
  program: Readonly<CraftAdaptivePolicyProgramV1>,
  initialState: Readonly<CraftState>,
): AdaptivePolicyEpisodeAdapterV1 {
  const controller = createCraftAdaptivePolicyControllerV1(context, program)
  const boundContext = controller.context
  const boundContextHash = craftAdaptivePolicyContextContentHashV1(boundContext)
  const detachedInitialState = detachedClone(initialState)
  const firstDecision = controller.decide(detachedInitialState)
  let pendingBefore = detachedInitialState
  let pendingAction = firstDecision.action

  const observePending = (
    state: Readonly<CraftState>,
  ): SerializableCraftAdaptivePolicyMemoryV1 => {
    if (pendingAction === null) {
      throw new Error('adaptive episode adapter has no pending action to observe')
    }
    const observedAfter = detachedClone(state)
    const success = inferObservedSuccess(boundContext, pendingBefore, pendingAction, observedAfter)
    const memory = controller.advance({
      before: pendingBefore,
      action: pendingAction,
      success,
      after: observedAfter,
    })
    pendingBefore = observedAfter
    pendingAction = null
    return memory
  }

  const policy: EpisodePolicy = (recipe, crafter, state) => {
    const callbackContextHash = craftAdaptivePolicyContextContentHashV1({
      scenarioId: boundContext.scenarioId,
      recipe,
      objective: boundContext.objective,
      crafter: { ...crafter, specialist: crafter.specialist === true },
    })
    if (callbackContextHash !== boundContextHash) {
      throw new Error('adaptive episode adapter was called with a different recipe or crafter context')
    }
    observePending(state)
    const next = controller.decide(pendingBefore)
    pendingAction = next.action
    return next.action
  }

  return {
    controller,
    firstDecision,
    firstAction: firstDecision.action,
    policy,
    hasPendingObservation: () => pendingAction !== null,
    observeFinalState: observePending,
  }
}
