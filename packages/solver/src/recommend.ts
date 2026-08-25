import {
  ACTIONS,
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type MaterialCondition,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  SOLVER_POLICY_VERSION,
  compareCanonicalSolverStrings,
  compareCraftActionIds,
  type AlternativeTradeoffCode,
  type CraftPhase,
  type Recommendation,
  type RecommendationReasonCode,
  type RiskPreference,
  type RiskPreferencePreset,
  resolveRiskPreferencePreset,
} from './types'
import {
  objectiveQualityUtility,
  resolveObjectivePolicy,
  type ResolvedObjectivePolicy,
} from './objectivePolicy'
import { isPolicyActionSafe, policySafetyVetoReason } from './policySafety'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  recommendGuideIntegratedAction,
  type GuideIntegratedPolicyConfig,
} from './guideIntegratedPolicy'
import {
  findGuaranteedProgressFinisherWithRecovery,
  findQualityBurstCertificate,
} from './finisherCertificate'

const LOOKAHEAD_DEPTH = 2
const BRANCH_ACTIONS = 4
const FINISHER_ACTIONS: CraftActionId[] = [
  'basicSynthesis', 'carefulSynthesis', 'groundwork', 'prudentSynthesis',
  'veneration', 'trainedPerfection', 'mastersMend', 'immaculateMend',
  'wasteNot', 'wasteNot2', 'manipulation',
]
const GUIDE_OPTIONS: CraftActionId[][] = [
  ['innovation', 'basicTouch', 'basicTouch', 'basicTouch', 'basicTouch', 'greatStrides', 'byregotsBlessing'],
  ['innovation', 'basicTouch', 'basicTouch', 'basicTouch', 'greatStrides', 'byregotsBlessing'],
  ['innovation', 'preparatoryTouch', 'basicTouch', 'greatStrides', 'byregotsBlessing'],
  ['innovation', 'trainedFinesse', 'trainedFinesse', 'trainedFinesse', 'trainedFinesse', 'greatStrides', 'byregotsBlessing'],
  ['innovation', 'trainedFinesse', 'trainedFinesse', 'trainedFinesse', 'greatStrides', 'byregotsBlessing'],
  ['innovation', 'trainedFinesse', 'trainedFinesse', 'greatStrides', 'byregotsBlessing'],
  ['innovation', 'observe', 'advancedTouch', 'greatStrides', 'byregotsBlessing'],
  ['innovation', 'greatStrides', 'byregotsBlessing'],
  ['greatStrides', 'byregotsBlessing'],
]

export interface RecommendOptions {
  mechanicsVersion: string
  /** Full recipe-owned policy objective used by live generic planning. */
  objective?: Readonly<CraftObjective>
  /** Transitional quality goal for historical/research callers without an objective. */
  qualityTarget?: number
  /** Player-selected completion versus quality-tail preference. Defaults to balanced. */
  riskPreference?: RiskPreference
  policyCoverage?: Recommendation['confidence']['policyCoverage']
  /** Actual resolved path; route counters are rebuilt and never trust prior recommendations. */
  actualActionHistory?: readonly CraftActionId[]
}

interface SearchContext {
  /** Objective-shaped copy whose requiredQuality is the policy quality goal. */
  recipe: RecipeProfile
  /** Actual game completion rule; a soft quality goal must never replace it. */
  mechanicsRecipe: RecipeProfile
  crafter: CrafterProfile
  baseQuality: number
  baseProgress: number
  riskPreset: Readonly<RiskPreferencePreset>
  objectivePolicy: Readonly<ResolvedObjectivePolicy>
  valueCache: Map<string, number>
  lookaheadCache: Map<string, number>
  safeActionsCache: Map<string, CraftActionId[]>
  deterministicCompletionCache: Map<string, boolean>
  fundedQualityCompletionCache: Map<string, boolean>
  fundedCashoutCache: Map<string, boolean>
  innerQuietCashoutRouteCache: Map<string, boolean>
  hardCashoutContinuationCache: Map<string, boolean>
}

interface RankedAction {
  action: CraftActionId
  score: number
  nextState: CraftState
  progressFinisher: Recommendation['progressFinisher']
}

type ImmediateRouteIntent = 'quality' | 'progress' | 'observe-combo'

const GUIDE_PHASE_PRIORS: Record<CraftPhase, Partial<Record<CraftActionId, number>>> = {
  opener: { muscleMemory: 150_000, reflect: 10_000 },
  'secure-progress': {
    veneration: 70_000, rapidSynthesis: 105_000, intensiveSynthesis: 125_000,
    groundwork: 85_000, carefulSynthesis: 65_000, manipulation: 8_000,
  },
  'build-inner-quiet': {
    preciseTouch: 7_000, prudentTouch: 5_000, manipulation: 3_000,
    mastersMend: 2_000, refinedTouch: 2_000, preparatoryTouch: 1_500,
  },
  'maintain-resources': {
    manipulation: 5_000, mastersMend: 4_000, trainedPerfection: 3_000,
    prudentTouch: 2_000, prudentSynthesis: 2_000,
  },
  'prepare-quality-burst': {
    innovation: 7_000, preciseTouch: 4_000, trainedFinesse: 3_000,
    prudentTouch: 2_000, greatStrides: 2_000,
  },
  'quality-finisher': {
    preciseTouch: 6_000, trainedFinesse: 4_000, greatStrides: 5_000,
    byregotsBlessing: 8_000, innovation: 5_000, advancedTouch: 2_000,
  },
  'complete-synthesis': {
    carefulSynthesis: 5_000, basicSynthesis: 4_000, groundwork: 3_000,
    prudentSynthesis: 2_000,
  },
  recovery: {
    manipulation: 5_000, mastersMend: 5_000, trainedPerfection: 3_500,
    immaculateMend: 2_000, prudentTouch: 1_500, prudentSynthesis: 1_500,
  },
}

const GUIDE_CONDITION_PRIORS: Partial<Record<MaterialCondition, Partial<Record<CraftActionId, number>>>> = {
  good: { preciseTouch: 7_000, tricksOfTheTrade: 3_000, intensiveSynthesis: 3_000 },
  centered: { rapidSynthesis: 2_500, hastyTouch: 1_500, daringTouch: 1_500 },
  sturdy: { preparatoryTouch: 2_000, groundwork: 2_000, basicTouch: 1_000 },
  robust: { preparatoryTouch: 2_500, groundwork: 2_500, basicTouch: 1_000 },
  pliant: { manipulation: 4_000, wasteNot2: 2_000, innovation: 1_500, greatStrides: 1_500 },
  malleable: { rapidSynthesis: 3_000, groundwork: 3_000, carefulSynthesis: 2_000 },
}

const BUFF_REFRESH: Partial<Record<CraftActionId, { buff: keyof CraftState['buffs']; duration: number }>> = {
  veneration: { buff: 'veneration', duration: 4 },
  innovation: { buff: 'innovation', duration: 4 },
  greatStrides: { buff: 'greatStrides', duration: 3 },
  manipulation: { buff: 'manipulation', duration: 8 },
  wasteNot: { buff: 'wasteNot', duration: 4 },
  wasteNot2: { buff: 'wasteNot', duration: 8 },
}

function guidePrior(
  context: SearchContext,
  state: CraftState,
  action: CraftActionId,
): number {
  const recipe = context.recipe
  const phase = derivePhase(context.recipe, state)
  let prior = (GUIDE_PHASE_PRIORS[phase][action] ?? 0)
    + (GUIDE_CONDITION_PRIORS[state.condition]?.[action] ?? 0)
  const refresh = BUFF_REFRESH[action]
  if (refresh) prior *= Math.max(0, 1 - state.buffs[refresh.buff] / refresh.duration)
  if (state.buffs.muscleMemory > 0 && ACTIONS[action].category === 'progress') {
    prior += 140_000 / state.buffs.muscleMemory
  }
  if (state.comboFrom === 'observe' && action === 'advancedTouch') prior += 80_000
  if (state.comboFrom === 'basicTouch' && action === 'standardTouch') prior += 35_000
  if (state.comboFrom === 'standardTouch' && action === 'advancedTouch') prior += 35_000
  if (state.step === 1 && recipe.requiredQuality > 0) {
    if (action === 'reflect') prior += 180_000
    if (action === 'muscleMemory') prior -= 140_000
  }
  if (phase === 'build-inner-quiet' && action === 'innovation') {
    const innovationNeed = Math.max(0, 1 - state.buffs.innovation / 4)
    prior += state.innerQuiet * state.innerQuiet * 900 * innovationNeed
  }
  if (state.innerQuiet === 10) {
    const qualityRatio = state.quality / recipe.requiredQuality
    const finisherReadiness = Math.max(0, Math.min(1, (qualityRatio - 0.45) / 0.35))
    if (action === 'byregotsBlessing') prior -= (1 - finisherReadiness) * 150_000
    if (action === 'greatStrides') prior -= (1 - finisherReadiness) * 45_000
    if (action === 'innovation') {
      const innovationNeed = Math.max(0, 1 - state.buffs.innovation / 4)
      prior += (1 - finisherReadiness) * 35_000 * innovationNeed
    }
    if (action === 'trainedFinesse') {
      const durabilityPressure = Math.max(0, Math.min(1, (20 - effectiveDurability(state)) / 20))
      prior += (1 - finisherReadiness) * (durabilityPressure * 28_000 - (1 - durabilityPressure) * 16_000)
    }
  }
  return prior
}

function derivePhase(recipe: RecipeProfile, state: CraftState): CraftPhase {
  if (state.step === 1) return 'opener'
  if (state.quality >= recipe.requiredQuality) return 'complete-synthesis'

  const progressRatio = state.progress / recipe.progressRequired
  const effectiveDurability = state.durability
    + state.buffs.manipulation * 5
    + (state.trainedPerfectionAvailable || state.trainedPerfectionActive ? 10 : 0)

  if (effectiveDurability <= 10) return 'recovery'
  if (progressRatio < 0.84) return 'secure-progress'
  if (state.innerQuiet < 10) return 'build-inner-quiet'
  if (effectiveDurability <= 20) return 'maintain-resources'
  if (state.buffs.innovation > 0 || state.buffs.greatStrides > 0) return 'quality-finisher'
  return 'prepare-quality-burst'
}

function stateKey(state: CraftState): string {
  const buffs = state.buffs
  return [
    state.step, state.progress, state.quality, state.durability, state.cp,
    state.condition, state.innerQuiet, state.comboFrom ?? '-',
    buffs.wasteNot, buffs.veneration, buffs.greatStrides, buffs.innovation,
    buffs.finalAppraisal, buffs.manipulation, buffs.muscleMemory, buffs.expedience,
    state.trainedPerfectionAvailable ? 1 : 0,
    state.trainedPerfectionActive ? 1 : 0,
    state.carefulObservationUsesLeft,
    state.heartAndSoulAvailable ? 1 : 0,
    state.heartAndSoulActive ? 1 : 0,
    state.quickInnovationAvailable ? 1 : 0,
    state.terminal,
  ].join(':')
}

function planningState(state: CraftState, patch: Partial<CraftState>): CraftState {
  return {
    ...state,
    ...patch,
    buffs: patch.buffs ? { ...state.buffs, ...patch.buffs } : { ...state.buffs },
  }
}

/**
 * A freshly paid setup is a one-step route commitment, not a free score bonus.
 * Full-duration buffs identify the state immediately after their setup even in
 * speculative lookahead, while Observe already has an explicit combo marker.
 * Later buff turns remain adaptive so a newly revealed condition may still
 * change the route after at least one intended action consumed the setup.
 */
function immediateRouteIntent(state: CraftState): ImmediateRouteIntent | null {
  if (state.comboFrom === 'observe') return 'observe-combo'
  if (state.buffs.greatStrides >= 3 || state.buffs.innovation >= 4) return 'quality'
  if (state.buffs.muscleMemory >= 5 || state.buffs.veneration >= 4) return 'progress'
  return null
}

function actionConsumesImmediateRouteIntent(
  state: CraftState,
  action: CraftActionId,
  preview: ReturnType<typeof previewAction>,
  intent: ImmediateRouteIntent,
): boolean {
  if (intent === 'observe-combo') {
    return action === 'advancedTouch'
      || (state.condition === 'good' && action === 'preciseTouch')
  }
  if (intent === 'quality') {
    return ACTIONS[action].category === 'quality' && preview.qualityGain > 0
  }
  return ACTIONS[action].category === 'progress' && preview.progressGain > 0
}

function setupHasFundedConsumer(
  context: SearchContext,
  stateAfterSetup: CraftState,
): boolean {
  const intent = immediateRouteIntent(stateAfterSetup)
  if (intent === null) return true

  return (Object.keys(ACTIONS) as CraftActionId[]).some((action) => {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, stateAfterSetup, action)
    if (
      !actionConsumesImmediateRouteIntent(stateAfterSetup, action, preview, intent)
      || !isRecommendationActionAllowed(context, stateAfterSetup, action, preview)
    ) return false
    const next = applyObservedOutcome(
      context.mechanicsRecipe,
      context.crafter,
      stateAfterSetup,
      action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    return preservesQualityCashoutOption(context, stateAfterSetup, action, next)
      && preservesSoftQualityRouteOption(context, stateAfterSetup, action, next)
  })
}

/**
 * Core safety remains fail-closed, but the aggressive objective may price a
 * last-turn gamble whose success completes the craft and whose failure is the
 * already-visible downside.  This exception is deliberately narrower than
 * treating every durability veto as policy-safe.
 */
function isRecommendationActionAllowed(
  context: SearchContext,
  state: CraftState,
  action: CraftActionId,
  preview: ReturnType<typeof previewAction>,
): boolean {
  if (action === 'greatStrides' && state.innerQuiet < 10 && context.riskPreset.id !== 'aggressive') {
    return false
  }
  if (
    action === 'manipulation'
    && state.durability >= context.mechanicsRecipe.durabilityMax
    && state.buffs.manipulation > 0
  ) return false
  const refresh = BUFF_REFRESH[action]
  if (
    refresh !== undefined
    && state.buffs[refresh.buff] > 0
    && state.condition !== 'primed'
    && state.condition !== 'pliant'
  ) return false
  if (
    (action === 'wasteNot' || action === 'wasteNot2')
    && state.buffs.manipulation > 0
    && state.durability >= context.mechanicsRecipe.durabilityMax - 10
  ) return false
  if (
    (action === 'mastersMend' || action === 'immaculateMend')
    && state.durability >= context.mechanicsRecipe.durabilityMax
  ) return false
  if (
    (action === 'mastersMend' || action === 'immaculateMend')
    && state.durability <= 10
    && state.trainedPerfectionAvailable
  ) return false
  if (action === 'observe' && context.riskPreset.id !== 'aggressive') return false
  if (action === 'observe' && preview.legal) {
    const observed = applyObservedOutcome(
      context.mechanicsRecipe,
      context.crafter,
      state,
      action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    const followUp = previewAction(
      context.mechanicsRecipe,
      context.crafter,
      observed,
      'advancedTouch',
    )
    if (
      followUp.qualityGain <= 0
      || !isPolicyActionSafe(
        context.mechanicsRecipe,
        context.crafter,
        observed,
        'advancedTouch',
        followUp,
      )
    ) return false
  }
  const veto = policySafetyVetoReason(
    context.mechanicsRecipe,
    context.crafter,
    state,
    action,
    preview,
  )
  if (veto === null) return true
  if (
    context.riskPreset.id !== 'aggressive'
    || veto !== 'durability-failure'
    || preview.successRate >= 1
  ) return false

  return isSuccessCompletesFailureDies(context, state, action)
}

function isSuccessCompletesFailureDies(
  context: SearchContext,
  state: CraftState,
  action: CraftActionId,
): boolean {
  const success = applyObservedOutcome(
    context.mechanicsRecipe,
    context.crafter,
    state,
    action,
    { success: true, nextCondition: 'normal' },
  ).nextState
  if (success.terminal !== 'completed') return false
  const failure = applyObservedOutcome(
    context.mechanicsRecipe,
    context.crafter,
    state,
    action,
    { success: false, nextCondition: state.condition },
  ).nextState
  return failure.terminal === 'failed'
}

function desperationCompletionActions(
  context: SearchContext,
  state: CraftState,
): CraftActionId[] {
  return (Object.keys(ACTIONS) as CraftActionId[]).filter((action) => {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    return preview.legal
      && preview.successRate < 1
      && policySafetyVetoReason(
        context.mechanicsRecipe,
        context.crafter,
        state,
        action,
        preview,
      ) === 'durability-failure'
      && isSuccessCompletesFailureDies(context, state, action)
  })
}

/**
 * Once Inner Quiet has reached the cashout phase, keep the already-funded
 * Byregot option alive.  Free quality attempts remain available, as do paid
 * actions that leave enough CP and durability to cash out afterwards.
 */
function preservesQualityCashoutOption(
  context: SearchContext,
  state: CraftState,
  action: CraftActionId,
  successState: CraftState,
): boolean {
  const hasFundedBuilderPreparedCashout = context.mechanicsRecipe.requiredQuality > 0
    && state.innerQuiet < 10
    && state.quality < context.mechanicsRecipe.requiredQuality
    && hasFundedInnerQuietBuildThenCashout(context, state, 'great-strides')
  // Great Strides is consumed by the quality action that builds the last IQ
  // stack.  Preserve an already-funded builder -> GS -> Byregot suffix until
  // the builder is committed; otherwise a cheap setup can silently make the
  // prepared cashout unaffordable just as surely as opening GS too early.
  if (hasFundedBuilderPreparedCashout && successState.quality < context.mechanicsRecipe.requiredQuality) {
    const commitsPreparedBuilder = successState.innerQuiet === 10
      && hasFundedCashout(context, successState, 'great-strides')
    if (
      !commitsPreparedBuilder
      && !hasFundedInnerQuietBuildThenCashout(context, successState, 'great-strides')
    ) return false
  }

  const hasHardQualityBuildOption = context.mechanicsRecipe.requiredQuality > 0
    && state.innerQuiet === 9
    && state.quality < context.mechanicsRecipe.requiredQuality
    && hasFundedInnerQuietBuildThenCashout(context, state)
  if (hasHardQualityBuildOption && successState.quality < context.mechanicsRecipe.requiredQuality) {
    const commitsBuilder = successState.innerQuiet === 10 && hasFundedCashout(context, successState)
    if (!commitsBuilder && !hasFundedInnerQuietBuildThenCashout(context, successState)) return false
  }
  if (action === 'byregotsBlessing') {
    if (successState.terminal === 'completed') return true
    if (successState.terminal !== 'none') return false
    if (
      context.mechanicsRecipe.requiredQuality > 0
      && successState.quality < context.mechanicsRecipe.requiredQuality
    ) {
      return hasHardQualityContinuationAfterCashout(
        context,
        successState,
        context.riskPreset.id === 'aggressive',
      )
    }
    if (hasDeterministicCompletionRoute(context, successState)) return true
    return context.riskPreset.id === 'aggressive'
      && desperationCompletionActions(context, successState).length > 0
  }
  if (state.innerQuiet < 9) return true

  const normalState = planningState(state, { condition: 'normal' })
  const currentCashout = previewAction(
    context.mechanicsRecipe,
    context.crafter,
    normalState,
    'byregotsBlessing',
  )
  if (!currentCashout.legal || successState.quality >= context.recipe.requiredQuality) return true
  const currentCashoutSafe = isPolicyActionSafe(
    context.mechanicsRecipe,
    context.crafter,
    normalState,
    'byregotsBlessing',
    currentCashout,
  )

  const normalSuccessState = planningState(successState, { condition: 'normal' })
  const nextCashout = previewAction(
    context.mechanicsRecipe,
    context.crafter,
    normalSuccessState,
    'byregotsBlessing',
  )
  if (
    currentCashoutSafe
    && state.cp >= currentCashout.cpCost
    && successState.cp < nextCashout.cpCost
  ) return false

  if (
    state.innerQuiet === 10
    && currentCashoutSafe
    && !isPolicyActionSafe(
      context.mechanicsRecipe,
      context.crafter,
      normalSuccessState,
      'byregotsBlessing',
      nextCashout,
    )
  ) return false

  return true
}

function hasFundedCashout(
  context: SearchContext,
  state: CraftState,
  setup: 'direct' | 'great-strides' = 'direct',
): boolean {
  const key = `${setup}|${stateKey(state)}`
  const cached = context.fundedCashoutCache.get(key)
  if (cached !== undefined) return cached

  let funded: boolean
  if (setup === 'great-strides') {
    const preview = previewAction(
      context.mechanicsRecipe,
      context.crafter,
      state,
      'greatStrides',
    )
    if (!isPolicyActionSafe(
      context.mechanicsRecipe,
      context.crafter,
      state,
      'greatStrides',
      preview,
    )) {
      funded = false
    } else {
      const prepared = applyObservedOutcome(
        context.mechanicsRecipe,
        context.crafter,
        state,
        'greatStrides',
        { success: true, nextCondition: 'normal' },
      ).nextState
      funded = prepared.terminal === 'none' && hasFundedCashout(context, prepared)
    }
  } else {
    const normal = planningState(state, { condition: 'normal' })
    const cashout = previewAction(
      context.mechanicsRecipe,
      context.crafter,
      normal,
      'byregotsBlessing',
    )
    funded = isPolicyActionSafe(
      context.mechanicsRecipe,
      context.crafter,
      normal,
      'byregotsBlessing',
      cashout,
    )
  }
  context.fundedCashoutCache.set(key, funded)
  return funded
}

function hasInnerQuietBuilderThenCashout(
  context: SearchContext,
  state: CraftState,
  setup: 'direct' | 'great-strides' = 'direct',
): boolean {
  return (Object.keys(ACTIONS) as CraftActionId[]).some((action) => {
    if (action === 'byregotsBlessing' || ACTIONS[action].category !== 'quality') return false
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    if (
      preview.successRate < 1
      || !isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, action, preview)
    ) return false
    const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    return next.terminal === 'none'
      && next.innerQuiet === 10
      && hasFundedCashout(context, next, setup)
  })
}

function hasFundedInnerQuietBuildThenCashout(
  context: SearchContext,
  state: CraftState,
  setup: 'direct' | 'great-strides' = 'direct',
): boolean {
  const key = `${setup}|${stateKey(state)}`
  const cached = context.innerQuietCashoutRouteCache.get(key)
  if (cached !== undefined) return cached

  if (hasInnerQuietBuilderThenCashout(context, state, setup)) {
    context.innerQuietCashoutRouteCache.set(key, true)
    return true
  }

  for (const durabilitySetup of ['trainedPerfection', 'mastersMend', 'immaculateMend'] as const) {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, durabilitySetup)
    if (!isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, durabilitySetup, preview)) continue
    const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, durabilitySetup, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (next.terminal === 'none' && hasInnerQuietBuilderThenCashout(context, next, setup)) {
      context.innerQuietCashoutRouteCache.set(key, true)
      return true
    }
  }
  context.innerQuietCashoutRouteCache.set(key, false)
  return false
}

/**
 * Soft-score objective hook. Below the selected voluntary quality floor, no
 * action may silently consume the final funded quality-plus-completion suffix.
 * This includes condition fishing: Observe is not useful if its CP cost turns
 * an already-funded Trained Finesse -> synthesis route into a policy null.
 */
function preservesSoftQualityRouteOption(
  context: SearchContext,
  state: CraftState,
  action: CraftActionId,
  successState: CraftState,
): boolean {
  if (
    context.objectivePolicy.voluntaryQualityFloor <= context.mechanicsRecipe.requiredQuality
    || state.quality >= context.objectivePolicy.voluntaryQualityFloor
  ) return true

  // This is a late-route invariant, not a global conservative leash. Before
  // progress is one deterministic action from completion, ordinary planning
  // may still spend and rebuild resources without repeatedly proving an
  // expensive quality-plus-six-step synthesis suffix.
  const completionProbe = planningState(state, {
    quality: Math.max(state.quality, context.mechanicsRecipe.requiredQuality),
  })
  if (!hasImmediateDeterministicCompletionAction(context, completionProbe)) return true

  const currentlyFunded = hasFundedQualityContinuationPreservingCompletion(context, state)
  if (!currentlyFunded) return true
  if (successState.terminal === 'completed') return false

  if (hasFundedQualityContinuationPreservingCompletion(context, successState)) return true
  return ACTIONS[action].category === 'quality'
    && successState.quality > state.quality
    && hasDeterministicCompletionRoute(context, successState)
}

function safeActions(context: SearchContext, state: CraftState): CraftActionId[] {
  const key = stateKey(state)
  const cached = context.safeActionsCache.get(key)
  if (cached !== undefined) return cached
  const allActions = Object.keys(ACTIONS) as CraftActionId[]
  const objectiveSatisfied = objectiveQualityUtility(context.objectivePolicy, state.quality) >= 1
  const deterministicFinishers = objectiveSatisfied
    ? allActions.filter((action) => {
        const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
        if (
          preview.successRate < 1
          || !isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, action, preview)
        ) return false
        return applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, action, {
          success: true,
          nextCondition: state.condition,
        }).nextState.terminal === 'completed'
      })
    : []
  const undominatedFinishers = deterministicFinishers.filter((action) => {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    return !deterministicFinishers.some((other) => {
      if (other === action) return false
      const otherPreview = previewAction(context.mechanicsRecipe, context.crafter, state, other)
      return otherPreview.cpCost <= preview.cpCost
        && otherPreview.durabilityCost <= preview.durabilityCost
        && (
          otherPreview.cpCost < preview.cpCost
          || otherPreview.durabilityCost < preview.durabilityCost
        )
    })
  })
  // Once the selected objective has no remaining utility and a deterministic
  // finish exists, condition fishing or an unconsumable buff is strictly
  // dominated. This is objective saturation, not a recipe-specific route.
  const candidates = undominatedFinishers.length > 0 ? undominatedFinishers : allActions
  let actions = candidates.filter((action) => {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    if (!isRecommendationActionAllowed(context, state, action, preview)) return false
    const successState = applyObservedOutcome(
      context.mechanicsRecipe,
      context.crafter,
      state,
      action,
      { success: true, nextCondition: state.condition },
    ).nextState
    if (!preservesQualityCashoutOption(context, state, action, successState)) return false
    if (!preservesSoftQualityRouteOption(context, state, action, successState)) return false
    if (
      ['innovation', 'veneration', 'greatStrides', 'muscleMemory', 'observe'].includes(action)
      && !setupHasFundedConsumer(context, planningState(successState, { condition: 'normal' }))
    ) return false
    if (ACTIONS[action].noStep === true) {
      const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, action, {
        success: true,
        nextCondition: 'normal',
      }).nextState
      return stateValue(context, next) > stateValue(context, state)
    }
    return true
  })
  const immediateIntent = objectiveSatisfied ? null : immediateRouteIntent(state)
  if (immediateIntent !== null) {
    const committedActions = actions.filter((action) => actionConsumesImmediateRouteIntent(
      state,
      action,
      previewAction(context.mechanicsRecipe, context.crafter, state, action),
      immediateIntent,
    ))
    // Safety and valid completion still outrank a stale or externally resynced
    // setup. A setup recommended by this policy reaches this branch with at
    // least one consumer because the setup itself was funded above.
    if (committedActions.length > 0) actions = committedActions
  }
  context.safeActionsCache.set(key, actions)
  return actions
}

function hasImmediateQualityAction(context: SearchContext, state: CraftState): boolean {
  return (Object.keys(ACTIONS) as CraftActionId[]).some((action) => {
    if (ACTIONS[action].category !== 'quality') return false
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    return preview.qualityGain > 0
      && isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, action, preview)
  })
}

function hasFundedQualityContinuation(context: SearchContext, state: CraftState): boolean {
  if (hasImmediateQualityAction(context, state)) return true

  for (const setup of ['trainedPerfection', 'mastersMend', 'immaculateMend'] as const) {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, setup)
    if (!isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, setup, preview)) continue
    const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, setup, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (next.terminal === 'none' && hasImmediateQualityAction(context, next)) return true
  }
  return false
}

function hasDeterministicCompletionRoute(context: SearchContext, state: CraftState): boolean {
  const key = stateKey(state)
  const cached = context.deterministicCompletionCache.get(key)
  if (cached !== undefined) return cached
  const found = progressFinisherStatus(
    context.mechanicsRecipe,
    context.crafter,
    state,
  ) !== 'uncertain'
  context.deterministicCompletionCache.set(key, found)
  return found
}

function hasImmediateQualityPreservingCompletion(
  context: SearchContext,
  state: CraftState,
): boolean {
  return (Object.keys(ACTIONS) as CraftActionId[]).some((action) => {
    if (ACTIONS[action].category !== 'quality') return false
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    if (
      preview.successRate < 1
      || preview.qualityGain <= 0
      || !isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, action, preview)
    ) return false
    const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    return next.terminal === 'completed'
      || (next.terminal === 'none' && hasDeterministicCompletionRoute(context, next))
  })
}

function hasFundedQualityContinuationPreservingCompletion(
  context: SearchContext,
  state: CraftState,
): boolean {
  const key = stateKey(state)
  const cached = context.fundedQualityCompletionCache.get(key)
  if (cached !== undefined) return cached
  if (hasImmediateQualityPreservingCompletion(context, state)) {
    context.fundedQualityCompletionCache.set(key, true)
    return true
  }

  for (const setup of ['trainedPerfection', 'mastersMend', 'immaculateMend'] as const) {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, setup)
    if (!isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, setup, preview)) continue
    const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, setup, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (next.terminal === 'none' && hasImmediateQualityPreservingCompletion(context, next)) {
      context.fundedQualityCompletionCache.set(key, true)
      return true
    }
  }
  context.fundedQualityCompletionCache.set(key, false)
  return false
}

function hasImmediateDeterministicCompletionAction(
  context: SearchContext,
  state: CraftState,
): boolean {
  return FINISHER_ACTIONS.some((action) => {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    if (
      preview.progressGain <= 0
      || preview.successRate < 1
      || !isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, action, preview)
    ) return false
    return applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState.terminal === 'completed'
  })
}

function hasImmediateQualityThenCompletion(
  context: SearchContext,
  state: CraftState,
  allowStochastic: boolean,
): boolean {
  return (Object.keys(ACTIONS) as CraftActionId[]).some((action) => {
    if (ACTIONS[action].category !== 'quality') return false
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
    if (
      preview.qualityGain <= 0
      || (!allowStochastic && preview.successRate < 1)
      || !(allowStochastic
        ? isRecommendationActionAllowed(context, state, action, preview)
        : isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, action, preview))
    ) return false
    const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (next.terminal === 'completed') return true
    return next.terminal === 'none'
      && next.quality >= context.mechanicsRecipe.requiredQuality
      && hasImmediateDeterministicCompletionAction(context, next)
  })
}

/**
 * A hard-quality Byregot cashout is irreversible because it clears Inner
 * Quiet. Keep this certificate intentionally small and cheap: after cashout,
 * prove one quality action (optionally after one repair) plus an immediate
 * deterministic synthesis. Aggressive may price success-reachable quality;
 * stable and balanced require that quality action itself to be deterministic.
 */
function hasHardQualityContinuationAfterCashout(
  context: SearchContext,
  state: CraftState,
  allowStochastic: boolean,
): boolean {
  const key = `${allowStochastic ? 'risk' : 'safe'}|${stateKey(state)}`
  const cached = context.hardCashoutContinuationCache.get(key)
  if (cached !== undefined) return cached

  if (hasImmediateQualityThenCompletion(context, state, allowStochastic)) {
    context.hardCashoutContinuationCache.set(key, true)
    return true
  }
  for (const setup of ['trainedPerfection', 'mastersMend', 'immaculateMend'] as const) {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, state, setup)
    if (!isPolicyActionSafe(context.mechanicsRecipe, context.crafter, state, setup, preview)) continue
    const next = applyObservedOutcome(context.mechanicsRecipe, context.crafter, state, setup, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (
      next.terminal === 'none'
      && hasImmediateQualityThenCompletion(context, next, allowStochastic)
    ) {
      context.hardCashoutContinuationCache.set(key, true)
      return true
    }
  }
  context.hardCashoutContinuationCache.set(key, false)
  return false
}

function effectiveDurability(state: CraftState): number {
  const manipulationRecovery = state.buffs.manipulation * 5
  const perfectionReserve = state.trainedPerfectionActive || state.trainedPerfectionAvailable ? 10 : 0
  const wasteNotReserve = state.buffs.wasteNot * 2.5
  return state.durability + manipulationRecovery + perfectionReserve + wasteNotReserve
}

/**
 * Converts a state into an estimate of eventual craft outcome.  The estimate is
 * action-agnostic: actions are compared by the states and future routes they
 * create, rather than by per-action bonuses.
 */
function stateValue(context: SearchContext, state: CraftState): number {
  const key = stateKey(state)
  const cached = context.valueCache.get(key)
  if (cached !== undefined) return cached

  if (state.terminal === 'completed') {
    const qualityRatio = objectiveQualityUtility(context.objectivePolicy, state.quality)
    const value = context.riskPreset.terminalCompletionReward
      + qualityRatio * context.riskPreset.currentQualityWeight
      - (1 - qualityRatio) * context.riskPreset.terminalQualityShortfallPenalty
      + state.cp * 12
      + Math.max(0, state.durability) * 80
      - state.step * 20
    context.valueCache.set(key, value)
    return value
  }
  if (state.terminal === 'failed') {
    const value = -context.riskPreset.terminalFailurePenalty
      + objectiveQualityUtility(context.objectivePolicy, state.quality) * 20_000
    context.valueCache.set(key, value)
    return value
  }

  const durabilityReserve = effectiveDurability(state)
  const cpForActions = Math.max(0, state.cp - 70)
  const qualityActionBudget = Math.min(12, Math.max(1, durabilityReserve / 7.5 + cpForActions / 55))
  const innerQuietUnit = context.baseQuality * (0.1 * qualityActionBudget + 0.24)
  const bankedInnerQuietQuality = state.innerQuiet * innerQuietUnit

  const innovationPotential = state.buffs.innovation
    * context.baseQuality * 0.5 * Math.min(1.5, qualityActionBudget / 4)
  const greatStridesPotential = state.buffs.greatStrides > 0
    ? context.baseQuality * (1 + state.innerQuiet * 0.1) * 1.5
    : 0
  const qualityPotential = state.quality
    + bankedInnerQuietQuality
    + innovationPotential
    + greatStridesPotential
    + durabilityReserve * context.baseQuality / 9
    + cpForActions * context.baseQuality / 150

  const progressBuff = 1
    + (state.buffs.veneration > 0 ? 0.5 : 0)
    + (state.buffs.muscleMemory > 0 ? 0.7 : 0)
  const synthesisBudget = Math.max(1, durabilityReserve / 10 + Math.max(0, state.cp - 50) / 110)
  const progressPotential = state.progress + synthesisBudget * context.baseProgress * 1.8 * progressBuff

  const qualityRatio = objectiveQualityUtility(context.objectivePolicy, qualityPotential)
  const progressRatio = Math.min(1.25, progressPotential / context.recipe.progressRequired)
  const currentQualityRatio = objectiveQualityUtility(context.objectivePolicy, state.quality)
  const currentProgressRatio = state.progress / context.recipe.progressRequired
  const completionPotential = Math.min(qualityRatio, progressRatio)
  const shortfallPenalty = Math.max(0, 1 - qualityRatio) * context.riskPreset.qualityShortfallPenalty
    + Math.max(0, 1 - progressRatio) * context.riskPreset.progressShortfallPenalty

  const value = completionPotential * context.riskPreset.completionPotentialWeight
    + currentQualityRatio * context.riskPreset.currentQualityWeight
    + currentProgressRatio * context.riskPreset.currentProgressWeight
    + state.cp * 28
    + durabilityReserve * 110
    - shortfallPenalty
    - state.step * 18

  context.valueCache.set(key, value)
  return value
}

function expectedActionValue(
  context: SearchContext,
  state: CraftState,
  action: CraftActionId,
  depth: number,
): number {
  const preview = previewAction(context.mechanicsRecipe, context.crafter, state, action)
  let expected = 0

  const randomConditions = context.mechanicsRecipe.randomConditions
    ?? context.mechanicsRecipe.availableConditions
  for (const nextCondition of randomConditions) {
    const successState = applyObservedOutcome(
      context.mechanicsRecipe, context.crafter, state, action,
      { success: true, nextCondition },
    ).nextState
    const successValue = futureValue(context, successState, depth)

    let branchValue = successValue
    if (preview.successRate < 1) {
      const failureState = applyObservedOutcome(
        context.mechanicsRecipe, context.crafter, state, action,
        { success: false, nextCondition },
      ).nextState
      const failureValue = futureValue(context, failureState, depth)
      branchValue = preview.successRate * successValue + (1 - preview.successRate) * failureValue
      branchValue -= (1 - preview.successRate)
        * Math.max(0, successValue - failureValue)
        * context.riskPreset.failureDownsideMultiplier
      branchValue -= (1 - preview.successRate) * context.riskPreset.failureProbabilityPenalty
    }
    expected += branchValue
  }

  return expected / randomConditions.length
    + guidePrior(context, state, action)
}

function futureValue(context: SearchContext, state: CraftState, depth: number): number {
  if (state.terminal !== 'none' || depth === 0) return stateValue(context, state)
  const key = `${depth}|${stateKey(state)}`
  const cached = context.lookaheadCache.get(key)
  if (cached !== undefined) return cached

  const currentValue = stateValue(context, state)
  const candidates = safeActions(context, state)
    .map((action) => ({ action, score: expectedActionValue(context, state, action, 0) }))
    .filter((entry) => ACTIONS[entry.action].noStep !== true || entry.score > currentValue)
    .sort((a, b) => b.score - a.score || compareCraftActionIds(a.action, b.action))
    .slice(0, BRANCH_ACTIONS)

  let best = -Infinity
  for (const candidate of candidates) {
    best = Math.max(best, expectedActionValue(context, state, candidate.action, depth - 1))
  }
  best = Math.max(best, bestGuideOptionValue(context, state))
  if (!Number.isFinite(best)) best = currentValue
  context.lookaheadCache.set(key, best)
  return best
}

function guideOptionValue(
  context: SearchContext,
  state: CraftState,
  option: CraftActionId[],
): number | null {
  let current = state
  let prior = 0
  for (const action of option) {
    const preview = previewAction(context.mechanicsRecipe, context.crafter, current, action)
    if (!preview.legal || preview.successRate < 1) return null
    if (!isPolicyActionSafe(context.mechanicsRecipe, context.crafter, current, action, preview)) return null
    prior += guidePrior(context, current, action)
    current = applyObservedOutcome(context.mechanicsRecipe, context.crafter, current, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (current.terminal === 'failed') return null
    if (current.terminal === 'completed') break
  }
  return stateValue(context, current) + prior
}

function bestGuideOptionValue(
  context: SearchContext,
  state: CraftState,
  firstAction?: CraftActionId,
): number {
  let best = -Infinity
  for (const option of GUIDE_OPTIONS) {
    if (firstAction !== undefined && option[0] !== firstAction) continue
    const score = guideOptionValue(context, state, option)
    if (score !== null) best = Math.max(best, score)
  }
  return best
}

function progressFinisherStatus(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  input: CraftState,
): Recommendation['progressFinisher'] {
  if (input.terminal === 'completed') return 'ready'
  if (input.terminal !== 'none') return 'uncertain'

  const start = planningState(input, {
    quality: recipe.requiredQuality,
    condition: 'normal',
    terminal: 'none',
    failureReason: null,
  })
  let frontier = [start]
  for (let depth = 0; depth < 6; depth += 1) {
    const nextByKey = new Map<string, CraftState>()
    for (const state of frontier) {
      for (const action of FINISHER_ACTIONS) {
        const preview = previewAction(recipe, crafter, state, action)
        if (!preview.legal || preview.successRate < 1) continue
        const next = applyObservedOutcome(recipe, crafter, state, action, {
          success: true,
          nextCondition: 'normal',
        }).nextState
        if (next.terminal === 'completed') return depth === 0 ? 'ready' : 'viable'
        if (next.terminal !== 'none') continue
        const key = stateKey(next)
        const previous = nextByKey.get(key)
        if (!previous || next.progress + next.cp + next.durability > previous.progress + previous.cp + previous.durability) {
          nextByKey.set(key, next)
        }
      }
    }
    frontier = [...nextByKey.values()]
      .sort((a, b) => (
        b.progress + b.cp + b.durability - (a.progress + a.cp + a.durability)
        || compareCanonicalSolverStrings(stateKey(a), stateKey(b))
      ))
      .slice(0, 24)
  }
  return 'uncertain'
}

function finishabilityRank(status: Recommendation['progressFinisher']): number {
  if (status === 'ready') return 2
  if (status === 'viable') return 1
  return 0
}

/**
 * Good is a tactical opportunity, not a command to always use Precise Touch.
 * This only removes an ordinary quality action when Precise Touch spends no
 * more CP, gives up at most five durability, yields strictly more quality and
 * Inner Quiet, and retains at least the same deterministic finishing status.
 * The five-durability allowance captures Prudent Touch's sole local advantage
 * without treating zero-durability Trained Finesse as dominated.
 */
function removeGoodQualityActionsDominatedByPreciseTouch(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  ranked: RankedAction[],
): RankedAction[] {
  if (state.condition !== 'good') return ranked
  const precise = ranked.find((entry) => entry.action === 'preciseTouch')
  if (!precise) return ranked

  const precisePreview = previewAction(recipe, crafter, state, precise.action)
  const preciseFinishability = finishabilityRank(progressFinisherStatus(recipe, crafter, precise.nextState))
  return ranked.filter((entry) => {
    if (entry.action === precise.action || ACTIONS[entry.action].category !== 'quality') return true
    const preview = previewAction(recipe, crafter, state, entry.action)
    if (
      precisePreview.cpCost > preview.cpCost
      || precisePreview.durabilityCost > preview.durabilityCost + 5
      || preview.successRate > precisePreview.successRate
      || preview.qualityGain >= precisePreview.qualityGain
      || entry.nextState.cp > precise.nextState.cp
      || entry.nextState.durability > precise.nextState.durability + 5
      || entry.nextState.progress > precise.nextState.progress
      || entry.nextState.innerQuiet > precise.nextState.innerQuiet
    ) return true

    const ordinaryFinishability = finishabilityRank(progressFinisherStatus(recipe, crafter, entry.nextState))
    return preciseFinishability < ordinaryFinishability
  })
}

function reasonFor(state: CraftState, phase: CraftPhase, action: CraftActionId): RecommendationReasonCode {
  if (phase === 'complete-synthesis') return 'complete-craft'
  if (state.step === 1 && action === 'muscleMemory') return 'open-with-muscle-memory'
  if (state.step === 1 && action === 'reflect') return 'open-with-reflect'
  if (state.condition === 'good' && action === 'preciseTouch') return 'condition-good-quality'
  if (state.condition === 'good' && action === 'tricksOfTheTrade') return 'condition-good-cp'
  if (state.condition === 'good' && action === 'intensiveSynthesis') return 'condition-good-progress'
  if (state.condition === 'goodOmen' && ACTIONS[action].category === 'buff') return 'condition-good-omen-setup'
  if (state.condition === 'primed' && ACTIONS[action].category === 'buff') return 'condition-primed-value'
  if (state.condition === 'robust' && ACTIONS[action].durabilityCost > 0) return 'condition-robust-value'
  if (ACTIONS[action].category === 'repair') return 'restore-durability'
  if (action === 'trainedPerfection') return 'protect-next-durability'
  if (action === 'veneration') return 'activate-progress-buff'
  if (action === 'innovation' || action === 'greatStrides') return 'activate-quality-buff'
  if (action === 'byregotsBlessing' || action === 'trainedFinesse') return 'quality-finisher'
  if (ACTIONS[action].category === 'quality') return 'lookahead-quality-route'
  if (ACTIONS[action].category === 'progress') return 'lookahead-progress-route'
  return 'lookahead-resource-route'
}

function tradeoffFor(action: CraftActionId): AlternativeTradeoffCode {
  const definition = ACTIONS[action]
  if (definition.successRate < 1) return 'higher-variance'
  if (action === 'tricksOfTheTrade') return 'recovers-cp'
  if (definition.category === 'progress') return 'more-progress'
  if (definition.category === 'quality') return 'more-quality'
  if (definition.category === 'repair') return 'preserves-durability'
  if (definition.category === 'buff') return 'setup-next-actions'
  return 'lower-resource-cost'
}

function recommendLookaheadAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: RecommendOptions,
): Recommendation | null {
  if (state.terminal !== 'none') return null

  const riskPreset = resolveRiskPreferencePreset(options.riskPreference)
  const objectivePolicy = resolveObjectivePolicy(recipe, {
    riskPreset,
    ...(options.objective === undefined ? {} : { objective: options.objective }),
    ...(options.qualityTarget === undefined ? {} : { qualityTarget: options.qualityTarget }),
  })
  const routeQualityGoal = objectivePolicy.utilityThresholds.at(-1)!
  const policyRecipe = routeQualityGoal === recipe.requiredQuality
    ? recipe
    : { ...recipe, requiredQuality: routeQualityGoal }

  const normalized = planningState(state, { condition: 'normal' })
  const baseQuality = Math.max(1, previewAction(policyRecipe, crafter, normalized, 'basicTouch').qualityGain)
  const baseProgress = Math.max(1, previewAction(policyRecipe, crafter, normalized, 'basicSynthesis').progressGain)
  const context: SearchContext = {
    recipe: policyRecipe,
    mechanicsRecipe: recipe,
    crafter,
    baseQuality,
    baseProgress,
    riskPreset,
    objectivePolicy,
    valueCache: new Map(),
    lookaheadCache: new Map(),
    safeActionsCache: new Map(),
    deterministicCompletionCache: new Map(),
    fundedQualityCompletionCache: new Map(),
    fundedCashoutCache: new Map(),
    innerQuietCashoutRouteCache: new Map(),
    hardCashoutContinuationCache: new Map(),
  }
  let roots = safeActions(context, state)
  if (roots.length === 0 && context.riskPreset.id === 'balanced') {
    roots = desperationCompletionActions(context, state)
  }
  if (roots.length === 0) return null

  const ranked: RankedAction[] = roots
    .flatMap((action): RankedAction[] => {
      const score = Math.max(
        expectedActionValue(context, state, action, LOOKAHEAD_DEPTH - 1),
        bestGuideOptionValue(context, state, action),
      )
      if (ACTIONS[action].noStep === true && score <= stateValue(context, state)) return []
      const nextState = applyObservedOutcome(recipe, crafter, state, action, {
        success: true,
        nextCondition: 'normal',
      }).nextState
      return [{ action, score, nextState, progressFinisher: 'uncertain' }]
    })
    .sort((a, b) => b.score - a.score || compareCraftActionIds(a.action, b.action))

  const dominanceFiltered = removeGoodQualityActionsDominatedByPreciseTouch(
    recipe,
    crafter,
    state,
    ranked,
  )
  const best = dominanceFiltered[0]
  if (!best) return null
  const checked = dominanceFiltered.slice(0, 3).map((entry) => ({
    ...entry,
    progressFinisher: progressFinisherStatus(recipe, crafter, entry.nextState),
  }))
  const winner = checked[0]!
  const phase = derivePhase(policyRecipe, state)
  return {
    action: winner.action,
    alternatives: checked.slice(1, 3).map((entry) => ({
      action: entry.action,
      tradeoff: tradeoffFor(entry.action),
    })),
    phase,
    reasons: [reasonFor(state, phase, winner.action)],
    progressFinisher: winner.progressFinisher,
    confidence: {
      mechanicsVersion: options.mechanicsVersion,
      conditionProfileConfidence: 'assumed',
      policyCoverage: options.policyCoverage ?? 'out-of-distribution',
    },
    policyVersion: SOLVER_POLICY_VERSION,
  }
}

function genericProgressFloor(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
): number {
  const initial = createInitialCraftState(recipe, crafter)
  const rapid = previewAction(recipe, crafter, initial, 'rapidSynthesis')
  if (!rapid.legal || rapid.progressGain <= 0) return 0
  // Bank enough progress that roughly two ordinary Rapid successes remain.
  // The ratio is derived from the exact crafter/recipe gain instead of being
  // copied from a historical recipe. Risk preference changes the quality goal
  // and allowed variance, not this minimum completion reserve.
  const reserveInRapidSuccesses = 2
  return Math.max(
    0,
    Math.min(0.9, 1 - rapid.progressGain * reserveInRapidSuccesses / recipe.progressRequired),
  )
}

function genericRouteConfig(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  objectivePolicy: Readonly<ResolvedObjectivePolicy>,
  riskPreference: RiskPreference,
): Readonly<GuideIntegratedPolicyConfig> {
  const qualityIsOptional = objectivePolicy.mechanicsRequiredQuality < objectivePolicy.qualityTarget
  const base = qualityIsOptional
    ? DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG
    : DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG
  return {
    ...base,
    daringMode: riskPreference === 'stable'
      ? 'never'
      : riskPreference === 'balanced' ? 'centered' : 'always',
    progressFloorBeforeQuality: qualityIsOptional
      ? genericProgressFloor(recipe, crafter)
      : 0,
    preferGoodIntensiveBeforeCashout: qualityIsOptional,
    cashOutAtLowestQualityTier: false,
    // Observe becomes a bounded condition option only after the generic
    // planner has an explicit cross-step continuation token. Until then the
    // shared core does not silently abandon a paid roll.
    maxFinisherObserves: 0,
    freeQualityCpFloor: Math.max(60, Math.min(140, Math.round(crafter.maxCp * 0.14))),
  }
}

function routeObjective(
  objective: Readonly<CraftObjective> | undefined,
  objectivePolicy: Readonly<ResolvedObjectivePolicy>,
): Readonly<CraftObjective> | undefined {
  if (objective === undefined || objective.qualityTarget === objectivePolicy.voluntaryQualityFloor) {
    return objective
  }
  if (objectivePolicy.evidence !== 'verified-collectability-tiers') return objective
  return {
    ...objective,
    objectiveId: `${objective.objectiveId}:${objectivePolicy.voluntaryQualityFloor}`,
    qualityTarget: objectivePolicy.voluntaryQualityFloor,
    qualityTiers: objective.qualityTiers.filter(
      (tier) => tier.minimumQuality <= objectivePolicy.voluntaryQualityFloor,
    ),
  }
}

function nearCompletionQualityExtension(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  objectivePolicy: Readonly<ResolvedObjectivePolicy>,
): CraftActionId | null {
  // Hard-quality recipes already prevent synthesis from completing before the
  // mechanics requirement. Let the shared route core plan their full quality
  // cycle; an immediate-gain extension here would greedily bypass Innovation,
  // Great Strides, and condition tactics for the rest of the craft.
  if (recipe.requiredQuality > 0) return null
  const deterministicCompletionIsOneActionAway = (Object.keys(ACTIONS) as CraftActionId[])
    .some((action) => {
      if (ACTIONS[action].category !== 'progress') return false
      const preview = previewAction(recipe, crafter, state, action)
      return preview.legal
        && preview.successRate === 1
        && state.progress + preview.progressGain >= recipe.progressRequired
    })
  if (
    state.quality >= objectivePolicy.voluntaryQualityFloor
    || !deterministicCompletionIsOneActionAway
  ) return null

  const ranked = (Object.keys(ACTIONS) as CraftActionId[])
    .flatMap((action) => {
      if (ACTIONS[action].category !== 'quality') return []
      const preview = previewAction(recipe, crafter, state, action)
      if (
        preview.successRate !== 1
        || preview.qualityGain <= 0
        || !isPolicyActionSafe(recipe, crafter, state, action, preview)
      ) return []
      const next = applyObservedOutcome(recipe, crafter, state, action, {
        success: true,
        nextCondition: 'normal',
      }).nextState
      if (next.terminal === 'failed') return []
      if (
        next.terminal === 'completed'
        && next.quality < objectivePolicy.voluntaryQualityFloor
      ) return []
      if (
        action === 'byregotsBlessing'
        && next.quality < objectivePolicy.voluntaryQualityFloor
      ) return []
      const finisher = progressFinisherStatus(recipe, crafter, next)
      if (next.terminal !== 'completed' && finisher === 'uncertain') return []
      return [{ action, preview, next, finisher }]
    })
    .sort((left, right) => (
      objectiveQualityUtility(objectivePolicy, right.next.quality)
        - objectiveQualityUtility(objectivePolicy, left.next.quality)
      || right.preview.qualityGain - left.preview.qualityGain
      || left.preview.cpCost - right.preview.cpCost
      || compareCraftActionIds(left.action, right.action)
    ))
  return ranked[0]?.action ?? null
}

interface ProgressOnlyDeliveryFloorDecision {
  action: CraftActionId
  phase: CraftPhase
}

function deliveryFloorPhase(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
): CraftPhase {
  const success = applyObservedOutcome(recipe, crafter, state, action, {
    success: true,
    nextCondition: 'normal',
  }).nextState
  if (success.terminal === 'completed') return 'complete-synthesis'
  if (ACTIONS[action].category === 'repair') return 'recovery'
  if (ACTIONS[action].category === 'quality') return 'quality-finisher'
  return 'secure-progress'
}

/**
 * A progress-only craft may keep chasing optional quality while it has route
 * slack. At the last ordinary durability action with Inner Quiet capped, an
 * observed Good must consume an already-paid Great Strides/Innovation window
 * with deterministic quality that preserves a guaranteed completion
 * certificate; it must not abandon that terminal-pressure setup for Tricks or
 * another refresh. Execute the progress certificate only when quality is
 * saturated.
 * Without a certificate, balanced and aggressive may take an immediately
 * completing observed-condition chance instead of spending the last delivery
 * window on more setup. Recipe identity, action count, and ad-hoc quality
 * ratios do not participate.
 */
function progressOnlyDeliveryFloorDecision(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  objectivePolicy: Readonly<ResolvedObjectivePolicy>,
): ProgressOnlyDeliveryFloorDecision | null {
  if (
    recipe.requiredQuality !== 0
    || state.quality < objectivePolicy.voluntaryQualityFloor
  ) return null

  const searchOptions = {
    maxActions: 8,
    maxNodeExpansions: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.finisherSearchNodeLimit,
  } as const
  const certificate = findGuaranteedProgressFinisherWithRecovery(
    recipe,
    crafter,
    state,
    searchOptions,
  )
  const currentUtility = objectiveQualityUtility(objectivePolicy, state.quality)
  const preparedGoodQualityWindow = certificate !== null
    && currentUtility < 1
    && state.condition === 'good'
    && state.innerQuiet === 10
    && state.durability <= 10
    && (state.buffs.greatStrides > 0 || state.buffs.innovation > 0)
  if (preparedGoodQualityWindow) {
    const certifiedBurst = findQualityBurstCertificate(recipe, crafter, state, {
      maxNodeExpansions: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.finisherSearchNodeLimit,
      maxProgressActions: 8,
      qualityTarget: objectivePolicy.qualityTarget,
    })
    const certifiedConsumer = certifiedBurst?.qualityActions[0]
    if (certifiedConsumer !== undefined) {
      const preview = previewAction(recipe, crafter, state, certifiedConsumer)
      if (
        preview.qualityGain > 0
        && preview.successRate === 1
        && (
          certifiedConsumer !== 'byregotsBlessing'
          || state.quality + preview.qualityGain >= objectivePolicy.qualityTarget
        )
        && isPolicyActionSafe(recipe, crafter, state, certifiedConsumer, preview)
      ) {
        return { action: certifiedConsumer, phase: 'quality-finisher' }
      }
    }

    const directQuality = (Object.keys(ACTIONS) as CraftActionId[])
      .flatMap((action) => {
        if (ACTIONS[action].category !== 'quality') return []
        const preview = previewAction(recipe, crafter, state, action)
        if (
          !preview.legal
          || preview.successRate !== 1
          || preview.qualityGain <= 0
          || !isPolicyActionSafe(recipe, crafter, state, action, preview)
        ) return []
        const next = applyObservedOutcome(recipe, crafter, state, action, {
          success: true,
          nextCondition: 'normal',
        }).nextState
        const utility = objectiveQualityUtility(objectivePolicy, next.quality)
        if (
          utility <= currentUtility
          || action === 'byregotsBlessing' && next.quality < objectivePolicy.qualityTarget
          || next.terminal === 'completed' && utility < 1
          || next.terminal === 'failed'
        ) return []
        if (
          next.terminal === 'none'
          && findGuaranteedProgressFinisherWithRecovery(
            recipe,
            crafter,
            next,
            searchOptions,
          ) === null
        ) return []
        return [{ action, utility, qualityGain: preview.qualityGain, cpCost: preview.cpCost }]
      })
      .sort((left, right) => (
        right.utility - left.utility
        || right.qualityGain - left.qualityGain
        || left.cpCost - right.cpCost
        || compareCraftActionIds(left.action, right.action)
      ))
    if (directQuality[0] !== undefined) {
      return {
        action: directQuality[0].action,
        phase: deliveryFloorPhase(recipe, crafter, state, directQuality[0].action),
      }
    }
  }
  if (
    certificate !== null
    && certificate.actions.length > 0
    && currentUtility >= 1
  ) {
    const action = certificate.actions[0]!
    return { action, phase: deliveryFloorPhase(recipe, crafter, state, action) }
  }

  return null
}

/**
 * Last-resort delivery after both the shared route and bounded lookahead have
 * returned no recommendation. Certificate absence stays "unknown", not
 * "infeasible": stable therefore remains fail-closed, while balanced and
 * aggressive may take an observed action whose success immediately delivers.
 */
function progressOnlyFallbackDeliveryDecision(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  objectivePolicy: Readonly<ResolvedObjectivePolicy>,
  riskPreset: Readonly<RiskPreferencePreset>,
  allowGuaranteedCertificate = true,
): ProgressOnlyDeliveryFloorDecision | null {
  if (
    recipe.requiredQuality !== 0
    || state.quality < objectivePolicy.voluntaryQualityFloor
  ) return null

  const certificate = findGuaranteedProgressFinisherWithRecovery(
    recipe,
    crafter,
    state,
    {
      maxActions: 8,
      maxNodeExpansions: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.finisherSearchNodeLimit,
    },
  )
  if (certificate?.actions[0] !== undefined) {
    if (!allowGuaranteedCertificate) return null
    const action = certificate.actions[0]
    return { action, phase: deliveryFloorPhase(recipe, crafter, state, action) }
  }

  // Balanced/aggressive already admit an explicit last-route synthesis gamble.
  // This branch runs only after the normal policy has no route to preserve.
  if (riskPreset.id === 'stable') return null
  const contingentCompletion = (Object.keys(ACTIONS) as CraftActionId[])
    .flatMap((action) => {
      if (ACTIONS[action].category !== 'progress') return []
      const preview = previewAction(recipe, crafter, state, action)
      if (!preview.legal || preview.successRate <= 0 || preview.successRate >= 1) return []
      const success = applyObservedOutcome(recipe, crafter, state, action, {
        success: true,
        nextCondition: 'normal',
      }).nextState
      if (success.terminal !== 'completed') return []
      return [{ action, successRate: preview.successRate, progressGain: preview.progressGain }]
    })
    .sort((left, right) => (
      right.successRate - left.successRate
      || right.progressGain - left.progressGain
      || compareCraftActionIds(left.action, right.action)
    ))
  return contingentCompletion[0] === undefined
    ? null
    : {
        action: contingentCompletion[0].action,
        phase: deliveryFloorPhase(
          recipe,
          crafter,
          state,
          contingentCompletion[0].action,
        ),
      }
}

function setupHasFundedQualityConsumer(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  setupAction: CraftActionId,
  objectivePolicy: Readonly<ResolvedObjectivePolicy>,
): boolean {
  const setupPreview = previewAction(recipe, crafter, state, setupAction)
  if (!setupPreview.legal || setupPreview.successRate !== 1) return false
  const prepared = applyObservedOutcome(recipe, crafter, state, setupAction, {
    success: true,
    nextCondition: 'normal',
  }).nextState
  if (prepared.terminal !== 'none') return false

  return (Object.keys(ACTIONS) as CraftActionId[]).some((qualityAction) => {
    if (ACTIONS[qualityAction].category !== 'quality') return false
    const qualityPreview = previewAction(recipe, crafter, prepared, qualityAction)
    if (
      !qualityPreview.legal
      || qualityPreview.successRate <= 0
      || qualityPreview.qualityGain <= 0
      || !isPolicyActionSafe(recipe, crafter, prepared, qualityAction, qualityPreview)
    ) return false
    const afterQuality = applyObservedOutcome(recipe, crafter, prepared, qualityAction, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (
      afterQuality.terminal === 'failed'
      || afterQuality.quality <= prepared.quality
      || qualityAction === 'byregotsBlessing'
        && afterQuality.quality < objectivePolicy.qualityTarget
    ) return false
    if (afterQuality.terminal === 'completed') return true
    if (findGuaranteedProgressFinisherWithRecovery(
      recipe,
      crafter,
      afterQuality,
      {
        maxActions: 8,
        maxNodeExpansions: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.finisherSearchNodeLimit,
      },
    ) !== null) return true
    return (Object.keys(ACTIONS) as CraftActionId[]).some((progressAction) => {
      if (ACTIONS[progressAction].category !== 'progress') return false
      const progressPreview = previewAction(recipe, crafter, afterQuality, progressAction)
      if (!progressPreview.legal || progressPreview.successRate <= 0) return false
      return applyObservedOutcome(recipe, crafter, afterQuality, progressAction, {
        success: true,
        nextCondition: 'normal',
      }).nextState.terminal === 'completed'
    })
  })
}

function observedRouteIntent(
  state: CraftState,
  actualActionHistory: readonly CraftActionId[] | undefined,
): ImmediateRouteIntent | null {
  const lastAction = actualActionHistory?.at(-1)
  if (state.comboFrom === 'observe' && (lastAction === undefined || lastAction === 'observe')) {
    return 'observe-combo'
  }
  return null
}

function committedConsumer(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  objectivePolicy: Readonly<ResolvedObjectivePolicy>,
  riskPreset: Readonly<RiskPreferencePreset>,
  intent: ImmediateRouteIntent,
): CraftActionId | null {
  const candidates = (Object.keys(ACTIONS) as CraftActionId[]).flatMap((action) => {
    const preview = previewAction(recipe, crafter, state, action)
    if (
      !actionConsumesImmediateRouteIntent(state, action, preview, intent)
      || !isPolicyActionSafe(recipe, crafter, state, action, preview)
    ) return []
    const next = applyObservedOutcome(recipe, crafter, state, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (
      next.terminal === 'failed'
      || next.terminal === 'completed'
        && next.quality < objectivePolicy.voluntaryQualityFloor
      || action === 'byregotsBlessing'
        && next.quality < objectivePolicy.voluntaryQualityFloor
    ) return []
    const expectedGain = intent === 'progress'
      ? preview.progressGain * preview.successRate
      : preview.qualityGain * preview.successRate
    const failureCost = (1 - preview.successRate) * riskPreset.failureDownsideMultiplier
    const conditionPriority = state.condition === 'good'
      && (action === 'preciseTouch' || action === 'intensiveSynthesis') ? 1 : 0
    return [{ action, next, expectedGain, failureCost, conditionPriority }]
  })
  candidates.sort((left, right) => (
    right.conditionPriority - left.conditionPriority
    || objectiveQualityUtility(objectivePolicy, right.next.quality)
      - objectiveQualityUtility(objectivePolicy, left.next.quality)
    || right.expectedGain - left.expectedGain
    || left.failureCost - right.failureCost
    || compareCraftActionIds(left.action, right.action)
  ))
  return candidates[0]?.action ?? null
}

/**
 * Live generic entrypoint. The shared route core owns cross-step resource and
 * finisher decisions; objective policy selects the route goal and risk budget.
 * The bounded lookahead remains a same-input fallback, not a second strategy
 * selected by recipe identity.
 */
export function recommendAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: RecommendOptions,
): Recommendation | null {
  if (state.terminal !== 'none') return null
  const riskPreset = resolveRiskPreferencePreset(options.riskPreference)
  const objectivePolicy = resolveObjectivePolicy(recipe, {
    riskPreset,
    ...(options.objective === undefined ? {} : { objective: options.objective }),
    ...(options.qualityTarget === undefined ? {} : { qualityTarget: options.qualityTarget }),
  })
  const selectedObjective = routeObjective(options.objective, objectivePolicy)
  const deliveryFloor = options.objective === undefined
    ? null
    : progressOnlyDeliveryFloorDecision(recipe, crafter, state, objectivePolicy)
  const extension = options.objective === undefined || deliveryFloor !== null
    ? null
    : nearCompletionQualityExtension(recipe, crafter, state, objectivePolicy)
  const route = deliveryFloor !== null || extension !== null || selectedObjective === undefined
    ? null
    : recommendGuideIntegratedAction(recipe, crafter, state, {
        objective: selectedObjective,
        ...(options.actualActionHistory === undefined
          ? {}
          : { actualActionHistory: options.actualActionHistory }),
        config: genericRouteConfig(recipe, crafter, objectivePolicy, riskPreset.id),
      })
  const routeCategory = route === null ? null : ACTIONS[route.action].category
  const unfundedSetupDelivery = route !== null
    && options.objective !== undefined
    && recipe.requiredQuality === 0
    && state.quality >= objectivePolicy.voluntaryQualityFloor
    && (routeCategory === 'buff' || routeCategory === 'repair' || routeCategory === 'utility')
    && !setupHasFundedQualityConsumer(
      recipe,
      crafter,
      state,
      route.action,
      objectivePolicy,
    )
      ? progressOnlyFallbackDeliveryDecision(
        recipe,
        crafter,
        state,
        objectivePolicy,
        riskPreset,
        false,
      )
    : null
  if (unfundedSetupDelivery !== null) {
    const nextState = applyObservedOutcome(recipe, crafter, state, unfundedSetupDelivery.action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    return {
      action: unfundedSetupDelivery.action,
      alternatives: [],
      phase: unfundedSetupDelivery.phase,
      reasons: [reasonFor(state, unfundedSetupDelivery.phase, unfundedSetupDelivery.action)],
      progressFinisher: progressFinisherStatus(recipe, crafter, nextState),
      confidence: {
        mechanicsVersion: options.mechanicsVersion,
        conditionProfileConfidence: 'assumed',
        policyCoverage: options.policyCoverage ?? 'out-of-distribution',
      },
      policyVersion: SOLVER_POLICY_VERSION,
    }
  }
  if (route === null && extension === null) {
    if (deliveryFloor !== null) {
      const nextState = applyObservedOutcome(recipe, crafter, state, deliveryFloor.action, {
        success: true,
        nextCondition: 'normal',
      }).nextState
      return {
        action: deliveryFloor.action,
        alternatives: [],
        phase: deliveryFloor.phase,
        reasons: [reasonFor(state, deliveryFloor.phase, deliveryFloor.action)],
        progressFinisher: progressFinisherStatus(recipe, crafter, nextState),
        confidence: {
          mechanicsVersion: options.mechanicsVersion,
          conditionProfileConfidence: 'assumed',
          policyCoverage: options.policyCoverage ?? 'out-of-distribution',
        },
        policyVersion: SOLVER_POLICY_VERSION,
      }
    }
    const lookahead = recommendLookaheadAction(recipe, crafter, state, options)
    if (lookahead !== null) return lookahead
    const fallbackDelivery = options.objective === undefined
      ? null
      : progressOnlyFallbackDeliveryDecision(
          recipe,
          crafter,
          state,
          objectivePolicy,
          riskPreset,
        )
    if (fallbackDelivery === null) return null
    const nextState = applyObservedOutcome(recipe, crafter, state, fallbackDelivery.action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    return {
      action: fallbackDelivery.action,
      alternatives: [],
      phase: fallbackDelivery.phase,
      reasons: [reasonFor(state, fallbackDelivery.phase, fallbackDelivery.action)],
      progressFinisher: progressFinisherStatus(recipe, crafter, nextState),
      confidence: {
        mechanicsVersion: options.mechanicsVersion,
        conditionProfileConfidence: 'assumed',
        policyCoverage: options.policyCoverage ?? 'out-of-distribution',
      },
      policyVersion: SOLVER_POLICY_VERSION,
    }
  }

  let action = extension ?? route!.action
  const commitment = observedRouteIntent(state, options.actualActionHistory)
  let followedCommitment = false
  if (commitment !== null) {
    const preview = previewAction(recipe, crafter, state, action)
    if (!actionConsumesImmediateRouteIntent(state, action, preview, commitment)) {
      const consumer = committedConsumer(
        recipe,
        crafter,
        state,
        objectivePolicy,
        riskPreset,
        commitment,
      )
      if (consumer !== null) {
        action = consumer
        followedCommitment = true
      }
    }
  }
  const routeRecipe = objectivePolicy.voluntaryQualityFloor === recipe.requiredQuality
    ? recipe
    : { ...recipe, requiredQuality: objectivePolicy.voluntaryQualityFloor }
  const phase = route?.phase ?? derivePhase(routeRecipe, state)
  const nextState = applyObservedOutcome(recipe, crafter, state, action, {
    success: true,
    nextCondition: 'normal',
  }).nextState
  return {
    action,
    alternatives: [],
    phase,
    reasons: [followedCommitment
      ? reasonFor(state, phase, action)
      : route?.reason ?? reasonFor(state, phase, action)],
    progressFinisher: progressFinisherStatus(recipe, crafter, nextState),
    confidence: {
      mechanicsVersion: options.mechanicsVersion,
      conditionProfileConfidence: 'assumed',
      policyCoverage: options.policyCoverage ?? 'out-of-distribution',
    },
    policyVersion: SOLVER_POLICY_VERSION,
  }
}
