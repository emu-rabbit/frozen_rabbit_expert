import { applyObservedOutcome, previewAction, type CraftActionId } from '@frozen-rabbit-expert/domain'
import { sampleCondition } from './conditionProfiles'
import type { EpisodeOptions, EpisodeResult, EpisodeStep, EpisodeTraceResult } from './types'

function run(options: EpisodeOptions, captureTrace: boolean): EpisodeTraceResult {
  let state = options.initialState
  let nextAction = options.firstAction
  const actions: CraftActionId[] = []
  const steps: EpisodeStep[] = []

  while (state.terminal === 'none' && actions.length < options.maxSteps) {
    const preview = previewAction(options.recipe, options.crafter, state, nextAction)
    if (!preview.legal) break

    // Consume both streams on every step so paired candidate comparisons keep
    // the same condition and success shocks even for deterministic actions.
    const successDraw = options.random.nextSuccess()
    const nextCondition = sampleCondition(options.conditionProfile, options.random)
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

    if (state.terminal !== 'none') break
    const policyAction = options.policy(options.recipe, options.crafter, state)
    if (policyAction === null) break
    nextAction = policyAction
  }

  return {
    terminal: state.terminal,
    finalState: state,
    actions,
    stoppedByLimit: state.terminal === 'none' && actions.length >= options.maxSteps,
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
