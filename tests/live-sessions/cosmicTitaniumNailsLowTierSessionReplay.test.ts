import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
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

/**
 * Anonymous nails session exported by the player on 2026-08-12. The export
 * stops one synthesis before completion, but preserves the full low-quality
 * route that motivated the v1.0.1 condition/cashout audit.
 */
const LOW_TIER_ROUTE: readonly LiveSessionStep[] = [
  { action: 'reflect', success: true, nextCondition: 'normal' },
  { action: 'manipulation', success: true, nextCondition: 'malleable' },
  { action: 'wasteNot2', success: true, nextCondition: 'sturdy' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'centered' },
  { action: 'innovation', success: true, nextCondition: 'normal' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'pliant' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'malleable' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'malleable' },
  { action: 'veneration', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'centered' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'sturdy' },
  { action: 'manipulation', success: true, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'sturdy' },
  { action: 'trainedFinesse', success: true, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'normal' },
  { action: 'veneration', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'good' },
  { action: 'tricksOfTheTrade', success: true, nextCondition: 'pliant' },
  { action: 'manipulation', success: true, nextCondition: 'normal' },
  { action: 'innovation', success: true, nextCondition: 'normal' },
  { action: 'hastyTouch', success: false, nextCondition: 'good' },
  { action: 'prudentSynthesis', success: true, nextCondition: 'malleable' },
  { action: 'hastyTouch', success: true, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'trainedPerfection', success: true, nextCondition: 'centered' },
  { action: 'innovation', success: true, nextCondition: 'sturdy' },
  { action: 'veneration', success: true, nextCondition: 'centered' },
  { action: 'groundwork', success: true, nextCondition: 'normal' },
  { action: 'hastyTouch', success: true, nextCondition: 'normal' },
  { action: 'basicSynthesis', success: true, nextCondition: 'pliant' },
  { action: 'prudentSynthesis', success: true, nextCondition: 'normal' },
]

function sessionEvents(steps = LOW_TIER_ROUTE): SessionEvent[] {
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

describe('player nails low-tier session audit', () => {
  it('replays the anonymous export and preserves its observed low-quality boundary', () => {
    const result = replaySession(
      COSMIC_TITANIUM_NAILS,
      crafter,
      createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
      sessionEvents(),
    )

    expect(LOW_TIER_ROUTE).toHaveLength(35)
    expect(LOW_TIER_ROUTE.filter((step) => step.action === 'rapidSynthesis' && !step.success)).toHaveLength(3)
    expect(result.state).toMatchObject({
      step: 36,
      progress: 9571,
      quality: 14242,
      durability: 5,
      cp: 22,
      innerQuiet: 10,
      terminal: 'none',
    })
    expect(result.state.quality).toBeLessThan(
      COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers[0]!.minimumQuality,
    )
  })

  it('uses Good Intensive Synthesis at the exact inefficient cashout state', () => {
    const first25 = LOW_TIER_ROUTE.slice(0, 25)
    const replay = replaySession(
      COSMIC_TITANIUM_NAILS,
      crafter,
      createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
      sessionEvents(first25),
    )
    const state = { ...replay.state, condition: 'good' as const }
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      state,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        actualActionHistory: first25.map((step) => step.action),
      },
    )
    const intensive = previewAction(COSMIC_TITANIUM_NAILS, crafter, state, 'intensiveSynthesis')
    const prudent = previewAction(COSMIC_TITANIUM_NAILS, crafter, state, 'prudentSynthesis')

    expect(result).toMatchObject({
      action: 'intensiveSynthesis',
      policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    })
    expect(intensive.progressGain - prudent.progressGain).toBe(665)
    expect(prudent.cpCost - intensive.cpCost).toBe(12)
  })
})
