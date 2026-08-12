import { describe, expect, it } from 'vitest'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import { MOBILE_WORK_STAIRS, MOBILE_WORK_STAIRS_OBJECTIVE } from '@frozen-rabbit-expert/data'
import { replaySession, type SessionEvent } from '@frozen-rabbit-expert/protocol'
import {
  DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  findGuaranteedProgressFinisher,
  recommendGuideIntegratedAction,
  resolvePlayerProfilePolicyConfig,
} from '@frozen-rabbit-expert/solver'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
  specialist: false,
}

interface LiveSessionStep {
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
}

/**
 * Anonymous Mobile Work Stairs export supplied by the player on 2026-08-12.
 *
 * The prefix stops immediately before the recorded final Good Intensive
 * Synthesis. The exported actions and outcomes are observed session evidence;
 * the replayed numeric state remains derived from the current mechanics model.
 */
const GOOD_FINISH_PREFIX: readonly LiveSessionStep[] = [
  { action: 'reflect', success: true, nextCondition: 'normal' },
  { action: 'manipulation', success: true, nextCondition: 'normal' },
  { action: 'veneration', success: true, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'sturdy' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'primed' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'goodOmen' },
  { action: 'veneration', success: true, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'sturdy' },
  { action: 'rapidSynthesis', success: false, nextCondition: 'good' },
  { action: 'intensiveSynthesis', success: true, nextCondition: 'pliant' },
  { action: 'manipulation', success: true, nextCondition: 'sturdy' },
  { action: 'veneration', success: true, nextCondition: 'normal' },
  { action: 'rapidSynthesis', success: true, nextCondition: 'normal' },
  { action: 'innovation', success: true, nextCondition: 'normal' },
  { action: 'wasteNot2', success: true, nextCondition: 'normal' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'primed' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'malleable' },
  { action: 'trainedFinesse', success: true, nextCondition: 'goodOmen' },
  { action: 'greatStrides', success: true, nextCondition: 'good' },
  { action: 'preciseTouch', success: true, nextCondition: 'pliant' },
  { action: 'manipulation', success: true, nextCondition: 'pliant' },
  { action: 'innovation', success: true, nextCondition: 'sturdy' },
  { action: 'preparatoryTouch', success: true, nextCondition: 'normal' },
  { action: 'trainedFinesse', success: true, nextCondition: 'normal' },
  { action: 'greatStrides', success: true, nextCondition: 'malleable' },
  { action: 'byregotsBlessing', success: true, nextCondition: 'goodOmen' },
  { action: 'prudentSynthesis', success: true, nextCondition: 'good' },
]

function sessionEvents(): SessionEvent[] {
  const events: SessionEvent[] = [
    { type: 'craftStarted', id: 'start', at: 0 },
    { type: 'conditionSelected', id: 'condition-1', at: 1, condition: 'normal' },
  ]
  let previousCondition: MaterialCondition = 'normal'

  for (const [index, step] of GOOD_FINISH_PREFIX.entries()) {
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

function replayGoodFinishPrefix() {
  return replaySession(
    MOBILE_WORK_STAIRS,
    crafter,
    createInitialCraftState(MOBILE_WORK_STAIRS, crafter),
    sessionEvents(),
  )
}

describe('player Mobile Work Stairs Good finish audit', () => {
  it('replays the export prefix to the exact late Good boundary', () => {
    const replay = replayGoodFinishPrefix()

    expect(GOOD_FINISH_PREFIX).toHaveLength(30)
    expect(replay.pendingAction).toBeNull()
    expect(replay.state).toMatchObject({
      step: 31,
      progress: 8546,
      quality: 18694,
      durability: 25,
      cp: 22,
      condition: 'good',
      innerQuiet: 0,
      buffs: { manipulation: 2 },
      trainedPerfectionAvailable: true,
      terminal: 'none',
    })
  })

  it('proves that Good Precise Touch adds 853 quality and retains a three-Basic finish', () => {
    const state = replayGoodFinishPrefix().state
    const precisePreview = previewAction(MOBILE_WORK_STAIRS, crafter, state, 'preciseTouch')

    expect(precisePreview).toMatchObject({
      legal: true,
      successRate: 1,
      qualityGain: 853,
    })

    const afterPrecise = applyObservedOutcome(
      MOBILE_WORK_STAIRS,
      crafter,
      state,
      'preciseTouch',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const certificate = findGuaranteedProgressFinisher(
      MOBILE_WORK_STAIRS,
      crafter,
      afterPrecise,
      { maxActions: 3 },
    )

    expect(afterPrecise).toMatchObject({
      step: 32,
      progress: 8546,
      quality: 19547,
      durability: 20,
      cp: 4,
      condition: 'normal',
      innerQuiet: 2,
      buffs: { manipulation: 1 },
      terminal: 'none',
    })
    expect(certificate).toMatchObject({
      successProbability: 1,
      actions: ['basicSynthesis', 'basicSynthesis', 'basicSynthesis'],
      projectedState: {
        progress: MOBILE_WORK_STAIRS.progressRequired,
        quality: 19547,
        terminal: 'completed',
      },
    })
  })

  it('keeps immediate Good Intensive Synthesis as the safe boundary when two extra actions are insufficient', () => {
    const state = replayGoodFinishPrefix().state
    const afterPrecise = applyObservedOutcome(
      MOBILE_WORK_STAIRS,
      crafter,
      state,
      'preciseTouch',
      { success: true, nextCondition: 'normal' },
    ).nextState

    expect(findGuaranteedProgressFinisher(
      MOBILE_WORK_STAIRS,
      crafter,
      afterPrecise,
      { maxActions: 2 },
    )).toBeNull()

    const intensivePreview = previewAction(MOBILE_WORK_STAIRS, crafter, state, 'intensiveSynthesis')
    const afterIntensive = applyObservedOutcome(
      MOBILE_WORK_STAIRS,
      crafter,
      state,
      'intensiveSynthesis',
      { success: true, nextCondition: 'normal' },
    ).nextState

    expect(intensivePreview).toMatchObject({ legal: true, successRate: 1 })
    expect(afterIntensive).toMatchObject({
      progress: MOBILE_WORK_STAIRS.progressRequired,
      quality: 18694,
      terminal: 'completed',
    })
  })

  it('uses the certified Good quality route only while it fits the scenario action budget', () => {
    const state = replayGoodFinishPrefix().state
    const config = resolvePlayerProfilePolicyConfig(
      'mobile-work-stairs',
      crafter,
      DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
    )

    const withinBudget = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      state,
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        actualActionHistory: GOOD_FINISH_PREFIX.map(({ action }) => action),
        config,
      },
    )
    const budgetCritical = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      state,
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        actualActionHistory: GOOD_FINISH_PREFIX.map(({ action }) => action),
        config: { ...config, adaptiveGoodQualityExtensionActionBudget: 33 },
      },
    )
    const unsupportedIqOne = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      { ...state, innerQuiet: 1 },
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        actualActionHistory: GOOD_FINISH_PREFIX.map(({ action }) => action),
        config,
      },
    )

    expect(config.adaptiveGoodQualityExtensionActionBudget).toBe(36)
    expect(withinBudget?.action).toBe('preciseTouch')
    expect(budgetCritical?.action).toBe('intensiveSynthesis')
    expect(unsupportedIqOne?.action).toBe('intensiveSynthesis')
  })

  it('commits the recommended extension to a terminal finish within 36 actual actions', () => {
    const config = resolvePlayerProfilePolicyConfig(
      'mobile-work-stairs',
      crafter,
      DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
    )
    const firstFutureConditions: MaterialCondition[] = [
      'normal', 'good', 'goodOmen', 'sturdy', 'pliant', 'malleable', 'primed',
    ]

    for (const firstFutureCondition of firstFutureConditions) {
      let state = replayGoodFinishPrefix().state
      const history = GOOD_FINISH_PREFIX.map(({ action }) => action)
      const extension: CraftActionId[] = []

      for (let index = 0; index < 8 && state.terminal === 'none'; index += 1) {
        const recommendation = recommendGuideIntegratedAction(
          MOBILE_WORK_STAIRS,
          crafter,
          state,
          {
            objective: MOBILE_WORK_STAIRS_OBJECTIVE,
            actualActionHistory: history,
            config,
          },
        )
        if (recommendation === null) throw new Error('missing committed finish recommendation')
        const preview = previewAction(MOBILE_WORK_STAIRS, crafter, state, recommendation.action)
        expect(preview.successRate).toBe(1)
        extension.push(recommendation.action)
        history.push(recommendation.action)
        state = applyObservedOutcome(
          MOBILE_WORK_STAIRS,
          crafter,
          state,
          recommendation.action,
          {
            success: true,
            nextCondition: index === 0 ? firstFutureCondition : 'normal',
          },
        ).nextState
      }

      expect(extension[0]).toBe('preciseTouch')
      expect(extension.slice(1).every((action) => (
        previewAction(MOBILE_WORK_STAIRS, crafter, replayGoodFinishPrefix().state, action).action.category
          === 'progress'
      ))).toBe(true)
      expect(state).toMatchObject({ terminal: 'completed', quality: 19547 })
      expect(history.length).toBeLessThanOrEqual(config.adaptiveGoodQualityExtensionActionBudget)
    }
  })

  it('disables the optional extension when resync leaves action history incomplete', () => {
    const state = replayGoodFinishPrefix().state
    const config = resolvePlayerProfilePolicyConfig(
      'mobile-work-stairs',
      crafter,
      DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
    )
    const missingHistory = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      state,
      { objective: MOBILE_WORK_STAIRS_OBJECTIVE, config },
    )
    const staleHistory = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      state,
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        actualActionHistory: GOOD_FINISH_PREFIX.slice(0, 20).map(({ action }) => action),
        config,
      },
    )

    expect(missingHistory?.action).toBe('intensiveSynthesis')
    expect(staleHistory?.action).toBe('intensiveSynthesis')
  })
})
