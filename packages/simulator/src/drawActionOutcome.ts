import type {
  ActionPreview,
  CraftState,
  ObservedActionOutcome,
} from '@frozen-rabbit-expert/domain'
import { sampleCondition } from './conditionProfiles'
import type { EpisodeRandomStream, WeightedConditionProfile } from './types'

/**
 * Draws exactly the streams consumed by one simulated action. Keeping this in
 * the simulator prevents research planners from drifting on no-step actions,
 * Careful Observation rerolls, or forced Good Omen transitions.
 */
export function drawSimulatedActionOutcome(
  preview: Readonly<ActionPreview>,
  state: Readonly<CraftState>,
  conditionProfile: Readonly<WeightedConditionProfile>,
  random: EpisodeRandomStream,
): ObservedActionOutcome {
  if (!preview.legal) throw new Error(`cannot draw outcome for illegal action ${preview.action.id}`)
  const isNoStep = preview.action.noStep === true
  const rerollsCondition = preview.action.rerollsCondition === true
  const successDraw = isNoStep ? 0 : random.nextSuccess()
  const nextCondition = isNoStep && !rerollsCondition
    ? state.condition
    : sampleCondition(conditionProfile, random, state.condition)
  return {
    success: successDraw < preview.successRate,
    nextCondition,
  }
}
