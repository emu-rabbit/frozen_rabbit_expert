import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
  PLAYER_EQUIPMENT_PROFILES,
  cosmicExpertScenarioDataByRecipeId,
} from '@frozen-rabbit-expert/data'
import {
  ACTIONS,
  createInitialCraftState,
  applyObservedOutcome,
  previewAction,
  type CrafterProfile,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import {
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  findGuaranteedProgressFinisherWithRecovery,
  recommendAction,
  isPolicyActionSafe,
  resolveRiskPreferencePreset,
  RISK_PREFERENCES,
  RISK_PREFERENCE_PRESETS,
  SOLVER_POLICY_VERSION,
  type RiskPreference,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5140,
  maxCp: 630,
  cosmicToolGoodBonus: true,
}

function state(patch: Partial<CraftState> = {}): CraftState {
  return { ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter), ...patch }
}

function recommend(current: CraftState, riskPreference?: RiskPreference) {
  return recommendAction(COSMIC_TITANIUM_INGOT, crafter, current, {
    mechanicsVersion: MODEL_VERSIONS.mechanics,
    riskPreference,
  })
}

function runGenericMatrixRegression(
  recipeId: number,
  equipmentIndex: number,
  seed: number,
  normalWeight: number,
  otherWeight: number,
): EpisodeTraceResult {
  const scenario = cosmicExpertScenarioDataByRecipeId(recipeId)!
  const routeCrafter = PLAYER_EQUIPMENT_PROFILES[equipmentIndex]!.crafter
  const weights: Partial<Record<MaterialCondition, number>> = {}
  for (const condition of scenario.recipe.randomConditions ?? ['normal']) {
    weights[condition] = condition === 'normal' ? normalWeight : otherWeight
  }
  const conditionProfile: WeightedConditionProfile = {
    id: `generic-regression-${recipeId}-v1`,
    evidence: 'assumption',
    weights,
  }
  const actualActionHistory: (keyof typeof ACTIONS)[] = []
  const decide = (current: CraftState) => recommendAction(
    scenario.recipe,
    routeCrafter,
    current,
    {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: scenario.objective,
      riskPreference: 'balanced',
      actualActionHistory,
    },
  )?.action ?? null
  const initialState = createInitialCraftState(scenario.recipe, routeCrafter)
  const firstAction = decide(initialState)
  if (firstAction === null) throw new Error(`generic regression ${recipeId} has no opening action`)
  actualActionHistory.push(firstAction)
  return runEpisodeTrace({
    recipe: scenario.recipe,
    crafter: routeCrafter,
    initialState,
    firstAction,
    policy: (_recipe, _crafter, current) => {
      const action = decide(current)
      if (action !== null) actualActionHistory.push(action)
      return action
    },
    random: createEpisodeRandomStream(seed),
    conditionProfile,
    maxSteps: 80,
  })
}

describe('generic craft route objective condition policy v0.5.1', () => {
  it('publishes a versioned, legal recommendation from the opening state', () => {
    const result = recommend(state())
    expect(result).not.toBeNull()
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, state(), result!.action).legal).toBe(true)
    expect(result?.policyVersion).toBe(SOLVER_POLICY_VERSION)
    expect(SOLVER_POLICY_VERSION).toBe('generic-craft-route-objective-condition-v0.5.1')
  })

  it('publishes validated stable, balanced, and aggressive presets with balanced as the default', () => {
    expect(RISK_PREFERENCES).toEqual(['stable', 'balanced', 'aggressive'])
    expect(RISK_PREFERENCE_PRESETS.stable.terminalCompletionReward)
      .toBeGreaterThan(RISK_PREFERENCE_PRESETS.balanced.terminalCompletionReward)
    expect(RISK_PREFERENCE_PRESETS.balanced.terminalCompletionReward)
      .toBeGreaterThan(RISK_PREFERENCE_PRESETS.aggressive.terminalCompletionReward)
    expect(RISK_PREFERENCE_PRESETS.stable.failureDownsideMultiplier)
      .toBeGreaterThan(RISK_PREFERENCE_PRESETS.aggressive.failureDownsideMultiplier)
    expect(RISK_PREFERENCE_PRESETS.aggressive.currentQualityWeight)
      .toBeGreaterThan(RISK_PREFERENCE_PRESETS.stable.currentQualityWeight)
    expect(Object.isFrozen(RISK_PREFERENCE_PRESETS)).toBe(true)
    expect(RISK_PREFERENCES.every((preference) => Object.isFrozen(RISK_PREFERENCE_PRESETS[preference])))
      .toBe(true)
    expect(resolveRiskPreferencePreset(undefined)).toBe(RISK_PREFERENCE_PRESETS.balanced)
    expect(() => resolveRiskPreferencePreset('reckless' as RiskPreference)).toThrow(RangeError)

    const current = state({ step: 8, progress: 4_000, quality: 6_000, durability: 30, cp: 240, innerQuiet: 6 })
    expect(recommend(current)).toEqual(recommend(current, 'balanced'))
  })

  it('makes the stable policy protect completion while aggressive accepts quality variance', () => {
    const current = state({
      step: 8,
      progress: 6_500,
      quality: 2_000,
      durability: 40,
      cp: 100,
      innerQuiet: 3,
      condition: 'normal',
    })
    const stable = recommend(current, 'stable')
    const aggressive = recommend(current, 'aggressive')

    expect(stable?.action).toBe('basicSynthesis')
    expect(aggressive?.action).toBe('hastyTouch')
    expect(ACTIONS[stable!.action].category).toBe('progress')
    expect(ACTIONS[stable!.action].successRate).toBe(1)
    expect(ACTIONS[aggressive!.action].category).toBe('quality')
    expect(ACTIONS[aggressive!.action].successRate).toBeLessThan(1)
  })

  it('treats score quality as a soft risk-weighted goal rather than a fake completion rule', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const finishGain = previewAction(COSMIC_TITANIUM_NAILS, crafter, initial, 'basicSynthesis').progressGain
    const current: CraftState = {
      ...initial,
      step: 12,
      progress: COSMIC_TITANIUM_NAILS.progressRequired - finishGain,
      quality: 4_000,
      durability: 10,
      cp: 0,
      innerQuiet: 5,
    }
    const recommendNails = (riskPreference: RiskPreference) => recommendAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      {
        mechanicsVersion: MODEL_VERSIONS.mechanics,
        qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget,
        riskPreference,
      },
    )
    const stable = recommendNails('stable')
    const aggressive = recommendNails('aggressive')

    expect(stable).not.toBeNull()
    expect(aggressive).not.toBeNull()
    expect(isPolicyActionSafe(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      'basicSynthesis',
    )).toBe(true)
    expect(isPolicyActionSafe(
      { ...COSMIC_TITANIUM_NAILS, requiredQuality: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget },
      crafter,
      current,
      'basicSynthesis',
    )).toBe(false)
    expect(applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      'basicSynthesis',
      { success: true, nextCondition: 'normal' },
    ).nextState.terminal).toBe('completed')
  })

  it('does not voluntarily finish a score recipe at zero quality while quality work is funded', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const finishGain = previewAction(COSMIC_TITANIUM_NAILS, crafter, initial, 'basicSynthesis').progressGain
    const current: CraftState = {
      ...initial,
      step: 5,
      progress: COSMIC_TITANIUM_NAILS.progressRequired - finishGain,
      durability: 30,
      cp: 300,
    }
    const result = recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget,
      riskPreference: 'balanced',
    })
    expect(result).not.toBeNull()
    const after = applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      result!.action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    expect(after.terminal).not.toBe('completed')
  })

  it('treats a soft score target as a quality-bearing opener objective', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const result = recommendAction(COSMIC_TITANIUM_NAILS, crafter, initial, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget,
      riskPreference: 'balanced',
    })

    expect(COSMIC_TITANIUM_NAILS.requiredQuality).toBe(0)
    expect(result?.action).toBe('reflect')
  })

  it('keeps a setup-funded quality option before voluntarily completing a score craft', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const finishGain = previewAction(COSMIC_TITANIUM_NAILS, crafter, initial, 'basicSynthesis').progressGain
    const current: CraftState = {
      ...initial,
      step: 12,
      progress: COSMIC_TITANIUM_NAILS.progressRequired - finishGain,
      quality: 1_000,
      durability: 5,
      cp: 300,
    }
    const result = recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget,
      riskPreference: 'balanced',
    })

    expect(result).not.toBeNull()
    expect(isPolicyActionSafe(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      'basicSynthesis',
    )).toBe(true)
    const after = applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      result!.action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    expect(after.terminal).not.toBe('completed')
  })

  it('routes the full collectability objective into a funded quality continuation', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const current: CraftState = {
      ...initial,
      step: 15,
      progress: 9_638,
      quality: 19_180,
      durability: 10,
      cp: 32,
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
    }
    const tierAware = recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreference: 'balanced',
    })
    const stable = recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreference: 'stable',
    })

    expect(stable?.action).toBe('basicSynthesis')
    expect(applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      stable!.action,
      { success: true, nextCondition: 'normal' },
    ).nextState.terminal).toBe('completed')
    expect(tierAware).not.toBeNull()
    expect(tierAware?.action).not.toBe('basicSynthesis')
    const afterTierAware = applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      tierAware!.action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    expect(afterTierAware.terminal).toBe('none')
    const tierAwareContinuation = afterTierAware.quality > current.quality
      ? tierAware
      : recommendAction(COSMIC_TITANIUM_NAILS, crafter, afterTierAware, {
          mechanicsVersion: MODEL_VERSIONS.mechanics,
          objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
          riskPreference: 'balanced',
        })
    expect(tierAwareContinuation).not.toBeNull()
    const afterContinuation = afterTierAware.quality > current.quality
      ? afterTierAware
      : applyObservedOutcome(
          COSMIC_TITANIUM_NAILS,
          crafter,
          afterTierAware,
          tierAwareContinuation!.action,
          { success: true, nextCondition: 'normal' },
        ).nextState
    expect(afterContinuation.quality).toBeGreaterThan(current.quality)
    expect(() => recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget - 1,
      riskPreference: 'balanced',
    })).toThrow(/conflicts/)
  })

  it('does not mislabel a continuous HQ voluntary floor as the full route target', () => {
    const initial = createInitialCraftState(MOBILE_WORK_STAIRS, crafter)
    const basicGain = previewAction(MOBILE_WORK_STAIRS, crafter, initial, 'basicSynthesis').progressGain
    const current: CraftState = {
      ...initial,
      step: 18,
      progress: MOBILE_WORK_STAIRS.progressRequired - basicGain,
      quality: Math.ceil(MOBILE_WORK_STAIRS_OBJECTIVE.qualityTarget * 0.55),
      durability: 60,
      cp: 500,
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
    }
    const result = recommendAction(MOBILE_WORK_STAIRS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: MOBILE_WORK_STAIRS_OBJECTIVE,
      riskPreference: 'balanced',
    })

    expect(result).not.toBeNull()
    expect(result?.phase).not.toBe('complete-synthesis')
    expect(result?.reasons).not.toContain('complete-craft')
  })

  it('refuses an irreversible Inner Quiet cashout below hard required quality', () => {
    const current = state({
      step: 24,
      progress: 7_000,
      quality: 8_000,
      durability: 15,
      cp: 27,
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
      condition: 'normal',
    })
    const result = recommend(current, 'balanced')

    expect(isPolicyActionSafe(
      COSMIC_TITANIUM_INGOT,
      crafter,
      current,
      'byregotsBlessing',
    )).toBe(true)
    expect(result).toBeNull()
  })

  it('does not irreversibly cash out Inner Quiet nine below a hard quality requirement', () => {
    const plankCrafter: CrafterProfile = { ...crafter, control: 5_237, maxCp: 749 }
    const plank = cosmicExpertScenarioDataByRecipeId(36_205)!.recipe
    const initial = createInitialCraftState(plank, plankCrafter)
    const current: CraftState = {
      ...initial,
      step: 20,
      progress: 4_620,
      quality: 6_469,
      durability: 20,
      cp: 79,
      innerQuiet: 9,
      condition: 'primed',
      buffs: {
        ...initial.buffs,
        wasteNot: 3,
        innovation: 6,
        manipulation: 5,
      },
    }
    const cashout = applyObservedOutcome(
      plank,
      plankCrafter,
      current,
      'byregotsBlessing',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const perfectionState = applyObservedOutcome(
      plank,
      plankCrafter,
      current,
      'trainedPerfection',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const builderState = applyObservedOutcome(
      plank,
      plankCrafter,
      perfectionState,
      'basicTouch',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const preparedState = applyObservedOutcome(
      plank,
      plankCrafter,
      builderState,
      'greatStrides',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const result = recommendAction(plank, plankCrafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      qualityTarget: plank.requiredQuality,
      riskPreference: 'balanced',
    })

    expect(cashout.quality).toBeLessThan(plank.requiredQuality)
    expect(cashout.innerQuiet).toBe(0)
    expect(isPolicyActionSafe(plank, plankCrafter, current, 'trainedPerfection')).toBe(true)
    expect(perfectionState.terminal).toBe('none')
    expect(isPolicyActionSafe(plank, plankCrafter, perfectionState, 'basicTouch')).toBe(true)
    expect(builderState.innerQuiet).toBe(10)
    expect(builderState.terminal).toBe('none')
    expect(isPolicyActionSafe(plank, plankCrafter, builderState, 'greatStrides')).toBe(true)
    expect(isPolicyActionSafe(plank, plankCrafter, preparedState, 'byregotsBlessing')).toBe(true)
    expect(isPolicyActionSafe(plank, plankCrafter, builderState, 'byregotsBlessing')).toBe(true)
    expect(result).not.toBeNull()
    expect(result?.action).not.toBe('byregotsBlessing')
    expect(result?.action).not.toBe('greatStrides')
    const after = applyObservedOutcome(
      plank,
      plankCrafter,
      current,
      result!.action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    expect(after.innerQuiet).toBeGreaterThanOrEqual(9)
  })

  it('uses a last-turn completion gamble only for balanced desperation or aggressive policy', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const basicGain = previewAction(COSMIC_TITANIUM_NAILS, crafter, initial, 'basicSynthesis').progressGain
    const rapidGain = previewAction(COSMIC_TITANIUM_NAILS, crafter, initial, 'rapidSynthesis').progressGain
    const current: CraftState = {
      ...initial,
      step: 12,
      progress: COSMIC_TITANIUM_NAILS.progressRequired - basicGain - 1,
      quality: Math.ceil(COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget * 0.8),
      durability: 10,
      cp: 0,
      trainedPerfectionAvailable: false,
    }
    const recommendNails = (riskPreference: RiskPreference) => recommendAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      {
        mechanicsVersion: MODEL_VERSIONS.mechanics,
        qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget,
        riskPreference,
      },
    )

    expect(rapidGain).toBeGreaterThan(basicGain)
    expect(isPolicyActionSafe(COSMIC_TITANIUM_NAILS, crafter, current, 'rapidSynthesis'))
      .toBe(false)
    expect(recommendNails('stable')).toBeNull()
    expect(recommendNails('balanced')?.action).toBe('rapidSynthesis')
    expect(recommendNails('aggressive')?.action).toBe('rapidSynthesis')
    expect(applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      'rapidSynthesis',
      { success: true, nextCondition: 'normal' },
    ).nextState.terminal).toBe('completed')
    expect(applyObservedOutcome(
      COSMIC_TITANIUM_NAILS,
      crafter,
      current,
      'rapidSynthesis',
      { success: false, nextCondition: 'normal' },
    ).nextState.terminal).toBe('failed')
  })

  it('blocks an ordinary quality action dominated by Precise Touch on Good', () => {
    const current = state({
      step: 8,
      progress: 6_500,
      quality: 2_000,
      durability: 40,
      cp: 300,
      innerQuiet: 3,
      condition: 'good',
    })
    const precise = previewAction(COSMIC_TITANIUM_INGOT, crafter, current, 'preciseTouch')
    const ordinary = previewAction(COSMIC_TITANIUM_INGOT, crafter, current, 'basicTouch')
    expect(precise.cpCost).toBe(ordinary.cpCost)
    expect(precise.durabilityCost).toBe(ordinary.durabilityCost)
    expect(precise.qualityGain).toBeGreaterThan(ordinary.qualityGain)

    const result = recommend(current, 'balanced')
    expect(result?.action).toBe('preciseTouch')
    expect([result!.action, ...result!.alternatives.map((entry) => entry.action)])
      .not.toContain('basicTouch')
  })

  it('uses the Good-only quality action when its full finish route dominates Prudent Touch', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const current: CraftState = {
      ...initial,
      step: 15,
      progress: 9_300,
      quality: 1_000,
      durability: 20,
      cp: 40,
      innerQuiet: 5,
      condition: 'good',
      trainedPerfectionAvailable: false,
    }
    const result = recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreference: 'balanced',
    })

    expect(result?.action).toBe('preciseTouch')
    expect(result?.alternatives.map((entry) => entry.action)).not.toContain('prudentTouch')
  })

  it('keeps hard-quality recipes in the shared route and spends Good on Precise Touch', () => {
    const scenario = cosmicExpertScenarioDataByRecipeId(36_990)!
    const routeCrafter: CrafterProfile = { ...crafter, control: 5_237, maxCp: 749 }
    const initial = createInitialCraftState(scenario.recipe, routeCrafter)
    const current: CraftState = {
      ...initial,
      step: 5,
      progress: 1_510,
      quality: 975,
      durability: 55,
      cp: 597,
      innerQuiet: 2,
      condition: 'good',
      buffs: { ...initial.buffs, wasteNot: 7, manipulation: 6 },
    }
    const result = recommendAction(scenario.recipe, routeCrafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: scenario.objective,
      riskPreference: 'balanced',
      actualActionHistory: ['reflect', 'manipulation', 'wasteNot2', 'rapidSynthesis'],
    })

    expect(result?.action).toBe('preciseTouch')
  })

  it('does not spend CP on Observe when its Advanced Touch continuation is unfunded', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const current: CraftState = {
      ...initial,
      step: 15,
      progress: 9_300,
      quality: 1_000,
      durability: 20,
      cp: 15,
      innerQuiet: 5,
      trainedPerfectionAvailable: false,
    }
    const result = recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreference: 'balanced',
    })

    expect(result).not.toBeNull()
    expect([result!.action, ...result!.alternatives.map((entry) => entry.action)])
      .not.toContain('observe')
  })

  it('honors an actual Observe combo instead of silently abandoning its continuation', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const current: CraftState = {
      ...initial,
      step: 27,
      progress: 7_343,
      quality: 4_203,
      durability: 40,
      cp: 250,
      innerQuiet: 8,
      comboFrom: 'observe',
      trainedPerfectionAvailable: false,
    }
    const result = recommendAction(COSMIC_TITANIUM_NAILS, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreference: 'aggressive',
      actualActionHistory: ['observe'],
    })

    expect(result?.action).toBe('advancedTouch')
  })

  it('does not turn Good into an unconditional Precise Touch rule', () => {
    const current = state({
      step: 8,
      progress: 1_000,
      quality: 2_000,
      durability: 40,
      cp: 300,
      innerQuiet: 3,
      condition: 'good',
    })
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, current, 'preciseTouch').legal).toBe(true)
    expect(recommend(current, 'balanced')?.action).toBe('intensiveSynthesis')
  })

  it('returns ranked alternatives without locking a guide example into a hard rule', () => {
    const current = state({ step: 6, progress: 4300, quality: 4200, durability: 25, cp: 520, innerQuiet: 4, condition: 'good' })
    const result = recommend(current)
    expect(result).not.toBeNull()
    expect([result!.action, ...result!.alternatives.map((entry) => entry.action)]).toHaveLength(3)
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, current, result!.action).legal).toBe(true)
  })

  it('finishes only after mandatory quality has been reached', () => {
    const ready = state({ step: 20, progress: 7000, quality: 18900, durability: 10, cp: 100 })
    const result = recommend(ready)
    expect(result).not.toBeNull()
    expect(result?.phase).toBe('complete-synthesis')
    expect(result?.reasons).toContain('complete-craft')

    const early = state({ step: 20, progress: 7000, quality: 18000, durability: 20, cp: 100 })
    const earlyResult = recommend(early)
    expect(earlyResult).not.toBeNull()
    const preview = previewAction(COSMIC_TITANIUM_INGOT, crafter, early, earlyResult!.action)
    expect(early.progress + preview.progressGain).toBeLessThan(COSMIC_TITANIUM_INGOT.progressRequired)
  })

  it('delivers the normal-heavy progress-only low-resource trace after reaching its quality floor', () => {
    const result = runGenericMatrixRegression(37_002, 0, 2_392_879_289, 6, 1)

    expect(result.stopReason).toBe('completed')
    expect(result.finalState.quality).toBeGreaterThanOrEqual(15_345)
  })

  it('uses the balanced contingent delivery window without weakening stable', () => {
    const scenario = cosmicExpertScenarioDataByRecipeId(37_002)!
    const routeCrafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const initial = createInitialCraftState(scenario.recipe, routeCrafter)
    const current: CraftState = {
      ...initial,
      step: 24,
      progress: 9_060,
      quality: 15_504,
      durability: 10,
      cp: 34,
      condition: 'centered',
      buffs: { ...initial.buffs, wasteNot: 1 },
      trainedPerfectionAvailable: false,
    }
    const options = {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: scenario.objective,
    } as const
    const balanced = recommendAction(scenario.recipe, routeCrafter, current, {
      ...options,
      riskPreference: 'balanced',
    })
    const stable = recommendAction(scenario.recipe, routeCrafter, current, {
      ...options,
      riskPreference: 'stable',
    })

    expect(balanced?.action).toBe('rapidSynthesis')
    expect(balanced?.phase).toBe('complete-synthesis')
    expect(balanced?.reasons).toContain('complete-craft')
    expect(stable?.action).not.toBe('rapidSynthesis')
  })

  it('delivers the balanced progress-only specialist trace instead of looping at ten durability', () => {
    const result = runGenericMatrixRegression(38_200, 2, 2_266_810_804, 1, 1)

    expect(result.stopReason).toBe('completed')
    expect(result.actions.length).toBeLessThan(80)
    expect(result.finalState.quality).toBe(26_300)
  })

  it('consumes a prepared progress-only quality window while retaining a certified delivery route', () => {
    const scenario = cosmicExpertScenarioDataByRecipeId(38_200)!
    const routeCrafter = PLAYER_EQUIPMENT_PROFILES[2]!.crafter
    const initial = createInitialCraftState(scenario.recipe, routeCrafter)
    const current: CraftState = {
      ...initial,
      step: 27,
      progress: 6_068,
      quality: 16_036,
      durability: 10,
      cp: 468,
      condition: 'good',
      innerQuiet: 10,
      buffs: { ...initial.buffs, greatStrides: 3 },
      trainedPerfectionAvailable: false,
    }
    const result = recommendAction(scenario.recipe, routeCrafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: scenario.objective,
      riskPreference: 'balanced',
    })
    const saturated = recommendAction(scenario.recipe, routeCrafter, {
      ...current,
      step: 39,
      quality: scenario.objective.qualityTarget,
      cp: 84,
    }, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: scenario.objective,
      riskPreference: 'balanced',
    })

    expect(result).not.toBeNull()
    expect(result?.action).not.toBe('tricksOfTheTrade')
    expect(result?.phase).toBe('quality-finisher')
    expect(result?.reasons).not.toContain('complete-craft')
    const consumer = previewAction(scenario.recipe, routeCrafter, current, result!.action)
    expect(consumer.successRate).toBe(1)
    expect(consumer.qualityGain).toBeGreaterThan(0)
    const afterConsumer = applyObservedOutcome(
      scenario.recipe,
      routeCrafter,
      current,
      result!.action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    expect(findGuaranteedProgressFinisherWithRecovery(
      scenario.recipe,
      routeCrafter,
      afterConsumer,
      { maxActions: 8, maxNodeExpansions: 256 },
    )).not.toBeNull()
    expect(saturated).not.toBeNull()
    expect(saturated?.reasons).not.toContain('complete-craft')
    expect(saturated?.phase).toBe('secure-progress')
  })

  it('never applies the progress-only delivery floor below mandatory quality', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const rapid = previewAction(COSMIC_TITANIUM_INGOT, crafter, initial, 'rapidSynthesis')
    const current: CraftState = {
      ...initial,
      step: 20,
      progress: COSMIC_TITANIUM_INGOT.progressRequired - rapid.progressGain,
      quality: COSMIC_TITANIUM_INGOT.requiredQuality - 1,
      durability: 10,
      cp: 100,
      condition: 'centered',
      trainedPerfectionAvailable: false,
    }
    const result = recommendAction(COSMIC_TITANIUM_INGOT, crafter, current, {
      mechanicsVersion: MODEL_VERSIONS.mechanics,
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      riskPreference: 'balanced',
    })

    expect(result).not.toBeNull()
    const recommended = previewAction(
      COSMIC_TITANIUM_INGOT,
      crafter,
      current,
      result!.action,
    )
    expect(current.progress + recommended.progressGain)
      .toBeLessThan(COSMIC_TITANIUM_INGOT.progressRequired)
    const afterSuccess = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      crafter,
      current,
      result!.action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    expect(afterSuccess.terminal).not.toBe('completed')
  })

  it('never recommends an illegal or immediately fatal action across boundary states', () => {
    const conditions: MaterialCondition[] = ['normal', 'good', 'centered', 'sturdy', 'pliant', 'malleable', 'robust']
    for (const condition of conditions) {
      for (const durability of [5, 10, 15, 30]) {
        const current = state({ step: 8, progress: 3500, quality: 6000, durability, cp: 240, innerQuiet: 6, condition })
        const result = recommend(current)
        expect(result, `${condition}/${durability}`).not.toBeNull()
        const preview = previewAction(COSMIC_TITANIUM_INGOT, crafter, current, result!.action)
        expect(preview.legal, `${condition}/${durability}/${result!.action}`).toBe(true)
        expect(current.progress + preview.progressGain >= COSMIC_TITANIUM_INGOT.progressRequired).toBe(false)
        const next = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, result!.action, {
          success: true,
          nextCondition: 'normal',
        }).nextState
        expect(next.terminal, `${condition}/${durability}/${result!.action}`).not.toBe('failed')
      }
    }
  })

  it('returns no recommendation after the craft is terminal', () => {
    expect(recommend(state({ terminal: 'failed', failureReason: 'durability', durability: 0 }))).toBeNull()
  })
})
