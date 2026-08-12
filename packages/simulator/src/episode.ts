import { applyObservedOutcome, legalActions, previewAction, type CraftActionId } from '@frozen-rabbit-expert/domain'
import { sampleCondition } from './conditionProfiles'
import type {
  EpisodeOptions,
  EpisodeResult,
  EpisodeStep,
  EpisodeStopReason,
  EpisodeTraceResult,
} from './types'

function run(options: EpisodeOptions, captureTrace: boolean): EpisodeTraceResult {
  let state = options.initialState
  let nextAction = options.firstAction
  const actions: CraftActionId[] = []
  const steps: EpisodeStep[] = []
  let stopReason: EpisodeStopReason | null = null

  while (state.terminal === 'none' && actions.length < options.maxSteps) {
    const preview = previewAction(options.recipe, options.crafter, state, nextAction)
    if (!preview.legal) {
      stopReason = 'illegal-action'
      break
    }

    // Most no-step actions leave both paired streams untouched. Careful
    // Observation is the exception: it deliberately rerolls the condition,
    // but still cannot consume a success draw.
    const isNoStep = preview.action.noStep === true
    const rerollsCondition = preview.action.rerollsCondition === true
    const successDraw = isNoStep ? 0 : options.random.nextSuccess()
    const nextCondition = isNoStep && !rerollsCondition
      ? state.condition
      : sampleCondition(options.conditionProfile, options.random, state.condition)
    const success = successDraw < preview.successRate
    const before = state
    state = applyObservedOutcome(
      options.recipe,
      options.crafter,
      state,
      nextAction,
      { success, nextCondition },
    ).nextState
    actions.push(nextAction)
    if (captureTrace) steps.push({ before, action: nextAction, success, nextCondition, after: state })

    if (state.terminal !== 'none') {
      stopReason = state.terminal
      break
    }
    if (actions.length >= options.maxSteps) {
      stopReason = 'action-limit'
      break
    }
    const policyAction = options.policy(options.recipe, options.crafter, state)
    if (policyAction === null) {
      stopReason = legalActions(options.recipe, options.crafter, state).length === 0
        ? 'no-legal-action'
        : 'policy-null'
      break
    }
    nextAction = policyAction
  }

  stopReason ??= state.terminal === 'completed'
    ? 'completed'
    : state.terminal === 'failed'
      ? 'failed'
      : actions.length >= options.maxSteps
        ? 'action-limit'
        : 'policy-null'

  return {
    terminal: state.terminal,
    finalState: state,
    actions,
    stoppedByLimit: state.terminal === 'none' && actions.length >= options.maxSteps,
    stopReason,
    steps,
  }
}

export function runEpisode(options: EpisodeOptions): EpisodeResult {
  const { steps: _steps, ...result } = run(options, false)
  return result
}

export function runEpisodeTrace(options: EpisodeOptions): EpisodeTraceResult {
  return run(options, true)
}
