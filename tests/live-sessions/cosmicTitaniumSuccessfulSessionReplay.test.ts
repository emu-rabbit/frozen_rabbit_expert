import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  type CraftActionId,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import { replaySession, type SessionEvent } from '@frozen-rabbit-expert/protocol'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

interface LiveSessionStep {
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
}

/**
 * Player-confirmed successful live session exported on 2026-08-12.
 *
 * This fixture proves that the recorded action/outcome route remains legal,
 * event-paired, replayable, and successful. The export did not contain
 * player-observed post-action values, so it is not an external golden oracle
 * for every mechanics calculation. It also intentionally does not assert that
 * future planner versions must recommend this exact route.
 */
const LIVE_SUCCESS_ROUTE: readonly LiveSessionStep[] = [
  { action: 'reflect', success: true, nextCondition: 'pliant' },
  { action: 'manipulation', success: true, nextCondition: 'normal' },
  { action: 'wasteNot2', success: true, nextCondition: 'centered' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'pliant' },
  { action: 'innovation', success: true, nextCondition: 'pliant' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'normal' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'centered' },
  { action: 'hastyTouch', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'normal' },
  { action: 'innovation', success: true, nextCondition: 'malleable' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'normal' },
  { action: 'manipulation', success: true, nextCondition: 'centered' },
  { action: 'hastyTouch', success: true, nextCondition: 'malleable' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'centered' },
  { action: 'trainedFinesse', success: true, nextCondition: 'malleable' },
  { action: 'innovation', success: true, nextCondition: 'pliant' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'innovation', success: true, nextCondition: 'centered' },
  { action: 'hastyTouch', success: true, nextCondition: 'good' },
  { action: 'trainedFinesse', success: true, nextCondition: 'centered' },
  { action: 'greatStrides', success: true, nextCondition: 'pliant' },
  { action: 'byregotsBlessing', success: true, nextCondition: 'centered' },
  { action: 'trainedPerfection', success: true, nextCondition: 'centered' },
  { action: 'veneration', success: true, nextCondition: 'centered' },
  { action: 'groundwork', success: true, nextCondition: 'normal' },
  { action: 'prudentSynthesis', success: true, nextCondition: 'normal' },
  { action: 'basicSynthesis', success: true, nextCondition: 'normal' },
]

function sessionEvents(): SessionEvent[] {
  const events: SessionEvent[] = [
    { type: 'craftStarted', id: 'start', at: 0 },
    { type: 'conditionSelected', id: 'condition-1', at: 1, condition: 'normal' },
  ]
  let previousCondition: MaterialCondition = 'normal'

  for (const [index, step] of LIVE_SUCCESS_ROUTE.entries()) {
    const stepNumber = index + 1
    const at = index + 2
    events.push(
      {
        type: 'craftActionUsed',
        id: `used-${stepNumber}`,
        at,
        action: step.action,
        previousCondition,
      },
      {
        type: 'craftActionResolved',
        id: `resolved-${stepNumber}`,
        at,
        success: step.success,
        nextCondition: step.nextCondition,
      },
    )
    previousCondition = step.nextCondition
  }

  return events
}

describe('player-confirmed successful live session replay', () => {
  it('replays all 30 paired action outcomes to the confirmed completed state', () => {
    const events = sessionEvents()
    const result = replaySession(
      COSMIC_TITANIUM_INGOT,
      crafter,
      createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter),
      events,
    )

    expect(LIVE_SUCCESS_ROUTE).toHaveLength(30)
    expect(events).toHaveLength(62)
    expect(result.pendingAction).toBeNull()
    expect(result.appliedEvents).toBe(events.length)
    expect(result.state).toMatchObject({
      step: 31,
      progress: 7300,
      quality: 18900,
      cp: 64,
      terminal: 'completed',
      failureReason: null,
    })
  })
})
