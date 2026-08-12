import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  createInitialCraftState,
  type CraftActionId,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import { replaySession, type SessionEvent } from '@frozen-rabbit-expert/protocol'
import {
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  recommendGuideIntegratedAction,
} from '@frozen-rabbit-expert/solver'

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

/** Anonymous completed nails export supplied by the player on 2026-08-12. */
const COMPLETED_LOW_QUALITY_ROUTE: readonly LiveSessionStep[] = [
  { action: 'reflect', success: true, nextCondition: 'pliant' },
  { action: 'manipulation', success: true, nextCondition: 'normal' },
  { action: 'wasteNot2', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'normal' },
  { action: 'innovation', success: true, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'normal' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'normal' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'pliant' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'normal' },
  { action: 'innovation', success: true, nextCondition: 'malleable' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'pliant' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'sturdy' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'manipulation', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'pliant' },
  { action: 'veneration', success: true, nextCondition: 'sturdy' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'normal' },
  { action: 'innovation', success: true, nextCondition: 'centered' },
  { action: 'prudentSynthesis', success: true, nextCondition: 'good' },
  { action: 'intensiveSynthesis', success: true, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'normal' },
  { action: 'manipulation', success: true, nextCondition: 'pliant' },
  { action: 'innovation', success: true, nextCondition: 'centered' },
  { action: 'hastyTouch', success: false, nextCondition: 'sturdy' },
  { action: 'hastyTouch', success: true, nextCondition: 'sturdy' },
  { action: 'byregotsBlessing', success: true, nextCondition: 'normal' },
  { action: 'trainedPerfection', success: true, nextCondition: 'centered' },
  { action: 'basicSynthesis', success: true, nextCondition: 'centered' },
  { action: 'basicSynthesis', success: true, nextCondition: 'centered' },
  { action: 'basicSynthesis', success: true, nextCondition: 'malleable' },
  { action: 'basicSynthesis', success: true, nextCondition: 'good' },
  { action: 'tricksOfTheTrade', success: true, nextCondition: 'sturdy' },
  { action: 'innovation', success: true, nextCondition: 'sturdy' },
  { action: 'carefulSynthesis', success: true, nextCondition: 'normal' },
]

function sessionEvents(steps = COMPLETED_LOW_QUALITY_ROUTE): SessionEvent[] {
  const events: SessionEvent[] = [
    { type: 'craftStarted', id: 'start', at: 0 },
    { type: 'conditionSelected', id: 'condition-1', at: 1, condition: 'normal' },
  ]
  let previousCondition: MaterialCondition = 'normal'
  for (const [index, step] of steps.entries()) {
    events.push(
      {
        type: 'craftActionUsed',
        id: `used-${index + 1}`,
        at: index + 2,
        action: step.action,
        previousCondition,
      },
      {
        type: 'craftActionResolved',
        id: `resolved-${index + 1}`,
        at: index + 2,
        success: step.success,
        nextCondition: step.nextCondition,
      },
    )
    previousCondition = step.nextCondition
  }
  return events
}

function replayPrefix(length: number) {
  const steps = COMPLETED_LOW_QUALITY_ROUTE.slice(0, length)
  const replay = replaySession(
    COSMIC_TITANIUM_NAILS,
    crafter,
    createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    sessionEvents(steps),
  )
  return { steps, replay }
}

describe('player completed nails low-quality session audit', () => {
  it('replays the full export as completed and inside the provisional first tier', () => {
    const { replay } = replayPrefix(COMPLETED_LOW_QUALITY_ROUTE.length)

    expect(COMPLETED_LOW_QUALITY_ROUTE).toHaveLength(39)
    expect(COMPLETED_LOW_QUALITY_ROUTE.filter(
      (step) => step.action === 'rapidSynthesis' && !step.success,
    )).toHaveLength(4)
    expect(replay.state).toMatchObject({
      step: 40,
      progress: 10000,
      quality: 17224,
      durability: 0,
      cp: 12,
      innerQuiet: 0,
      terminal: 'completed',
    })
    expect(replay.state.quality).toBeGreaterThanOrEqual(
      COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers[0]!.minimumQuality,
    )
    expect(replay.state.quality).toBeLessThan(
      COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers[1]!.minimumQuality,
    )
  })

  it('uses a Malleable progress opportunity before unrestricted quality spending', () => {
    const { steps, replay } = replayPrefix(10)
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      replay.state,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        actualActionHistory: steps.map((step) => step.action),
      },
    )

    expect(result).toMatchObject({
      action: 'rapidSynthesis',
      reason: 'condition-malleable-progress',
      policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    })
  })

  it('finishes immediately instead of spending the last CP after Inner Quiet is gone', () => {
    const { steps, replay } = replayPrefix(37)
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      replay.state,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        actualActionHistory: steps.map((step) => step.action),
      },
    )

    expect(replay.state).toMatchObject({
      progress: 9541,
      quality: 17224,
      durability: 5,
      cp: 37,
      innerQuiet: 0,
      condition: 'sturdy',
    })
    expect(result).toMatchObject({
      action: 'carefulSynthesis',
      policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    })
    expect(ACTIONS[result!.action].category).toBe('progress')
  })

  it('labels the late Basic Synthesis route as progress work, not Inner Quiet building', () => {
    const { steps, replay } = replayPrefix(32)
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      replay.state,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        actualActionHistory: steps.map((step) => step.action),
      },
    )

    expect(result).toMatchObject({
      action: 'basicSynthesis',
      phase: 'build-inner-quiet',
      reason: 'secure-progress',
    })
  })
})
