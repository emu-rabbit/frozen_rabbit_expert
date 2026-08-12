import {
  ACTIONS,
  applyObservedOutcome,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type MaterialCondition,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  SOLVER_POLICY_VERSION,
  type AlternativeTradeoffCode,
  type CraftPhase,
  type Recommendation,
  type RecommendationReasonCode,
} from './types'
import { isPolicyActionSafe } from './policySafety'

const SUPPORTED_PROFILE_ID = 'cosmotized-ilmenite-ingot-36282-v1'
const LOOKAHEAD_DEPTH = 2
const BRANCH_ACTIONS = 4
const CONDITIONS: MaterialCondition[] = ['normal', 'good', 'centered', 'sturdy', 'pliant', 'malleable']
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
  /** Policy quality goal; defaults to mechanics requiredQuality. */
  qualityTarget?: number
}

interface SearchContext {
  recipe: RecipeProfile
  crafter: CrafterProfile
  baseQuality: number
  baseProgress: number
  valueCache: Map<string, number>
  lookaheadCache: Map<string, number>
  safeActionsCache: Map<string, CraftActionId[]>
}

interface RankedAction {
  action: CraftActionId
  score: number
  nextState: CraftState
  progressFinisher: Recommendation['progressFinisher']
}

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

function guidePrior(recipe: RecipeProfile, state: CraftState, action: CraftActionId): number {
  const phase = derivePhase(recipe, state)
  let prior = (GUIDE_PHASE_PRIORS[phase][action] ?? 0)
    + (GUIDE_CONDITION_PRIORS[state.condition]?.[action] ?? 0)
  const refresh = BUFF_REFRESH[action]
  if (refresh) prior *= Math.max(0, 1 - state.buffs[refresh.buff] / refresh.duration)
  if (state.buffs.muscleMemory > 0 && ACTIONS[action].category === 'progress') {
    prior += 140_000 / state.buffs.muscleMemory
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

function safeActions(context: SearchContext, state: CraftState): CraftActionId[] {
  const key = stateKey(state)
  const cached = context.safeActionsCache.get(key)
  if (cached !== undefined) return cached
  const actions = (Object.keys(ACTIONS) as CraftActionId[]).filter((action) => {
    const preview = previewAction(context.recipe, context.crafter, state, action)
    if (!isPolicyActionSafe(context.recipe, context.crafter, state, action, preview)) return false
    if (ACTIONS[action].noStep === true) {
      const next = applyObservedOutcome(context.recipe, context.crafter, state, action, {
        success: true,
        nextCondition: state.condition,
      }).nextState
      return stateValue(context, next) > stateValue(context, state)
    }
    return true
  })
  context.safeActionsCache.set(key, actions)
  return actions
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
    const value = 1_000_000 + state.cp * 12 + Math.max(0, state.durability) * 80 - state.step * 20
    context.valueCache.set(key, value)
    return value
  }
  if (state.terminal === 'failed') {
    const value = -1_000_000 + (state.quality / context.recipe.requiredQuality) * 20_000
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

  const qualityRatio = Math.min(1.25, qualityPotential / context.recipe.requiredQuality)
  const progressRatio = Math.min(1.25, progressPotential / context.recipe.progressRequired)
  const currentQualityRatio = state.quality / context.recipe.requiredQuality
  const currentProgressRatio = state.progress / context.recipe.progressRequired
  const completionPotential = Math.min(qualityRatio, progressRatio)
  const shortfallPenalty = Math.max(0, 1 - qualityRatio) * 180_000
    + Math.max(0, 1 - progressRatio) * 220_000

  const value = completionPotential * 420_000
    + currentQualityRatio * 95_000
    + currentProgressRatio * 48_000
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
  const preview = previewAction(context.recipe, context.crafter, state, action)
  let expected = 0

  for (const nextCondition of CONDITIONS) {
    const successState = applyObservedOutcome(
      context.recipe, context.crafter, state, action,
      { success: true, nextCondition },
    ).nextState
    const successValue = futureValue(context, successState, depth)

    let branchValue = successValue
    if (preview.successRate < 1) {
      const failureState = applyObservedOutcome(
        context.recipe, context.crafter, state, action,
        { success: false, nextCondition },
      ).nextState
      const failureValue = futureValue(context, failureState, depth)
      branchValue = preview.successRate * successValue + (1 - preview.successRate) * failureValue
      branchValue -= (1 - preview.successRate) * Math.max(0, successValue - failureValue) * 0.35
    }
    expected += branchValue
  }

  return expected / CONDITIONS.length + guidePrior(context.recipe, state, action)
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
    .sort((a, b) => b.score - a.score)
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
    const preview = previewAction(context.recipe, context.crafter, current, action)
    if (!preview.legal || preview.successRate < 1) return null
    if (!isPolicyActionSafe(context.recipe, context.crafter, current, action, preview)) return null
    prior += guidePrior(context.recipe, current, action)
    current = applyObservedOutcome(context.recipe, context.crafter, current, action, {
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
      .sort((a, b) => b.progress + b.cp + b.durability - (a.progress + a.cp + a.durability))
      .slice(0, 24)
  }
  return 'uncertain'
}

function reasonFor(state: CraftState, phase: CraftPhase, action: CraftActionId): RecommendationReasonCode {
  if (phase === 'complete-synthesis') return 'complete-craft'
  if (state.step === 1 && action === 'muscleMemory') return 'open-with-muscle-memory'
  if (state.step === 1 && action === 'reflect') return 'open-with-reflect'
  if (state.condition === 'good' && action === 'preciseTouch') return 'condition-good-quality'
  if (state.condition === 'good' && action === 'tricksOfTheTrade') return 'condition-good-cp'
  if (state.condition === 'good' && action === 'intensiveSynthesis') return 'condition-good-progress'
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

export function recommendAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: RecommendOptions,
): Recommendation | null {
  if (state.terminal !== 'none') return null

  const qualityTarget = options.qualityTarget ?? recipe.requiredQuality
  if (!Number.isInteger(qualityTarget) || qualityTarget <= 0 || qualityTarget < recipe.requiredQuality || qualityTarget > recipe.qualityMax) {
    throw new RangeError('qualityTarget must be a positive integer between requiredQuality and qualityMax')
  }
  const policyRecipe = qualityTarget === recipe.requiredQuality
    ? recipe
    : { ...recipe, requiredQuality: qualityTarget }

  const normalized = planningState(state, { condition: 'normal' })
  const baseQuality = Math.max(1, previewAction(policyRecipe, crafter, normalized, 'basicTouch').qualityGain)
  const baseProgress = Math.max(1, previewAction(policyRecipe, crafter, normalized, 'basicSynthesis').progressGain)
  const context: SearchContext = {
    recipe: policyRecipe,
    crafter,
    baseQuality,
    baseProgress,
    valueCache: new Map(),
    lookaheadCache: new Map(),
    safeActionsCache: new Map(),
  }
  const roots = safeActions(context, state)
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
    .sort((a, b) => b.score - a.score || a.action.localeCompare(b.action))

  const best = ranked[0]
  if (!best) return null
  const checked = ranked.slice(0, 3).map((entry) => ({
    ...entry,
    progressFinisher: progressFinisherStatus(recipe, crafter, entry.nextState),
  }))
  const winner = checked[0]!
  const phase = derivePhase(policyRecipe, state)
  const supported = recipe.profileId === SUPPORTED_PROFILE_ID
  const nearStatsBoundary = crafter.craftsmanship < recipe.recommendedCraftsmanship || crafter.maxCp < 500

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
      policyCoverage: supported ? (nearStatsBoundary ? 'near-boundary' : 'in-distribution') : 'out-of-distribution',
    },
    policyVersion: SOLVER_POLICY_VERSION,
  }
}
