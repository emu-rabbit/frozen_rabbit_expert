import { describe, expect, it } from 'vitest'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  createGuideIntegratedPolicyFactory,
} from '@frozen-rabbit-expert/solver'

/**
 * Candidate extracted from four anonymous player exports supplied on
 * 2026-08-13. The exports provide actual actions, outcomes, and conditions but
 * no per-step in-game state snapshots, so this is macro/policy evidence rather
 * than a numeric mechanics oracle.
 */
const MACRO_ACTIONS: readonly CraftActionId[] = [
  'reflect',
  'manipulation',
  'basicTouch',
  'refinedTouch',
  'innovation',
  'delicateSynthesis',
  'basicTouch',
  'standardTouch',
  'advancedTouch',
  'trainedPerfection',
  'greatStrides',
  'innovation',
  'preparatoryTouch',
  'greatStrides',
  'byregotsBlessing',
  'veneration',
  'wasteNot2',
  'groundwork',
  'immaculateMend',
  'groundwork',
  'veneration',
  'groundwork',
  'groundwork',
  'groundwork',
  'groundwork',
  // The three clean live routes completed on action 25 after Malleable gains;
  // all-Normal needs this zero-CP deterministic completion fallback.
  'basicSynthesis',
] as const

const OBSERVED_CONDITION_STREAMS: ReadonlyArray<{
  sourceExport: string
  nextConditions: readonly MaterialCondition[]
}> = [
  {
    sourceExport: 'frozen-rabbit-expert-1786582689615.json',
    nextConditions: [
      'malleable', 'normal', 'good', 'normal', 'good', 'malleable', 'normal',
      'good', 'normal', 'normal', 'normal', 'normal', 'normal', 'good',
      'malleable', 'normal', 'normal', 'normal', 'malleable', 'normal',
      'malleable', 'normal', 'normal', 'normal', 'good', 'malleable',
    ],
  },
  {
    sourceExport: 'frozen-rabbit-expert-1786583007211.json',
    nextConditions: [
      'malleable', 'good', 'malleable', 'normal', 'malleable', 'malleable',
      'normal', 'malleable', 'malleable', 'malleable', 'normal', 'malleable',
      'normal', 'malleable', 'normal', 'good', 'normal', 'malleable', 'normal',
      'normal', 'malleable', 'malleable', 'normal', 'good', 'good',
    ],
  },
  {
    sourceExport: 'frozen-rabbit-expert-1786583660875.json',
    nextConditions: [
      'normal', 'malleable', 'malleable', 'normal', 'normal', 'malleable',
      'normal', 'malleable', 'good', 'normal', 'malleable', 'normal', 'normal',
      'malleable', 'malleable', 'malleable', 'normal', 'normal', 'malleable',
      'malleable', 'good', 'normal', 'normal', 'malleable', 'malleable',
    ],
  },
  {
    sourceExport: 'frozen-rabbit-expert-1786584724313.json',
    nextConditions: [
      'malleable', 'normal', 'normal', 'normal', 'malleable', 'normal',
      'malleable', 'malleable', 'malleable', 'malleable', 'malleable', 'normal',
      'normal', 'normal', 'malleable', 'malleable', 'malleable', 'normal',
      'normal', 'normal', 'good', 'malleable', 'normal', 'malleable', 'malleable',
    ],
  },
]

const crafter = {
  level: 100,
  craftsmanship: 5_408,
  control: 5_237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
  specialist: false,
}

function runMacro(nextConditions: readonly MaterialCondition[]) {
  let state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  let actionsUsed = 0
  for (const [index, action] of MACRO_ACTIONS.entries()) {
    if (state.terminal !== 'none') break
    state = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      state,
      action,
      { success: true, nextCondition: nextConditions[index] ?? 'normal' },
    ).nextState
    actionsUsed += 1
  }
  return { state, actionsUsed }
}

function runPolicy(
  nextConditions: readonly MaterialCondition[],
  conditionShortcuts: boolean,
) {
  const policy = createGuideIntegratedPolicyFactory(
    {
      ...DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
      adaptiveReliableQualityFirstConditionShortcuts: conditionShortcuts,
    },
    SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
  )()
  let state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const steps: Array<{
    action: CraftActionId
    condition: MaterialCondition
    progressGain: number
    qualityGain: number
    cpCost: number
  }> = []
  for (let index = 0; index < 80 && state.terminal === 'none'; index += 1) {
    const action = policy(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state)
    if (action === null) break
    const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action)
    steps.push({
      action,
      condition: state.condition,
      progressGain: preview.progressGain,
      qualityGain: preview.qualityGain,
      cpCost: preview.cpCost,
    })
    state = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      state,
      action,
      { success: true, nextCondition: nextConditions[index] ?? 'normal' },
    ).nextState
  }
  return { state, steps }
}

describe('command brew fixed-macro candidate', () => {
  it('completes at full quality even when every condition is Normal', () => {
    const result = runMacro([])

    expect(result.actionsUsed).toBe(26)
    expect(result.state).toMatchObject({
      progress: 10_000,
      quality: 12_000,
      cp: 1,
      terminal: 'completed',
    })
  })

  it('cannot complete before the quality finisher under continuous Malleable', () => {
    const result = runMacro(Array.from({ length: MACRO_ACTIONS.length }, () => 'malleable'))

    expect(result.actionsUsed).toBeGreaterThan(15)
    expect(result.state).toMatchObject({
      progress: 10_000,
      quality: 12_000,
      terminal: 'completed',
    })
  })

  it.each(OBSERVED_CONDITION_STREAMS)(
    'completes at full quality on $sourceExport conditions',
    ({ nextConditions }) => {
      const result = runMacro(nextConditions)

      expect(result.actionsUsed).toBeLessThanOrEqual(26)
      expect(result.state).toMatchObject({
        progress: 10_000,
        quality: 12_000,
        terminal: 'completed',
      })
    },
  )

  it.each(OBSERVED_CONDITION_STREAMS)(
    'uses $sourceExport conditions without taking more actions than the fixed route',
    ({ nextConditions }) => {
      const adaptive = runPolicy(nextConditions, true)
      const fixed = runPolicy(nextConditions, false)

      expect(adaptive.state).toMatchObject({
        progress: 10_000,
        quality: 12_000,
        terminal: 'completed',
      })
      expect(adaptive.steps.length).toBeLessThanOrEqual(fixed.steps.length)
      expect(adaptive.steps).not.toEqual(fixed.steps)
      expect(adaptive.steps.some(({ action, condition }) => (
        condition === 'good'
          ? action === 'preciseTouch' || action === 'intensiveSynthesis'
          : condition === 'malleable' && [
              'groundwork',
              'carefulSynthesis',
              'prudentSynthesis',
              'basicSynthesis',
            ].includes(action)
      ))).toBe(true)

      const firstDifference = adaptive.steps.findIndex((step, index) => (
        step.action !== fixed.steps[index]?.action
      ))
      expect(firstDifference).toBeGreaterThanOrEqual(0)
      const adaptiveChoice = adaptive.steps[firstDifference]!
      const fixedChoice = fixed.steps[firstDifference]!
      expect(adaptiveChoice.condition).toBe(fixedChoice.condition)
      expect(adaptiveChoice.cpCost).toBeLessThanOrEqual(fixedChoice.cpCost)
      expect(
        adaptiveChoice.qualityGain > fixedChoice.qualityGain
        || adaptiveChoice.progressGain > fixedChoice.progressGain
        || adaptive.steps.length < fixed.steps.length,
      ).toBe(true)
    },
  )
})
