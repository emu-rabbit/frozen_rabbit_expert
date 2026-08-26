import {
  applyObservedOutcome,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { compareCraftActionSequences } from './types'

export const FINISHER_CERTIFICATE_VERSION = 'normal-worst-case-finisher-certificate-v0.3.0'

/**
 * The runtime policy supplies a smaller fixed limit. Keeping this exported
 * search primitive effectively unbounded by default preserves its use as a
 * deterministic offline proof helper when no explicit budget is requested.
 */
export const UNBOUNDED_FINISHER_NODE_EXPANSION_LIMIT = Number.MAX_SAFE_INTEGER

const NORMAL_CONDITION = 'normal' as const
const DEFAULT_PROGRESS_ACTION_LIMIT = 6
const DEFAULT_QUALITY_ACTION_LIMIT = 5
const MAX_BOUNDED_ACTION_LIMIT = 8

const GUARANTEED_PROGRESS_ACTIONS = [
  'intensiveSynthesis',
  'prudentSynthesis',
  'carefulSynthesis',
  'basicSynthesis',
  'groundwork',
] as const satisfies readonly CraftActionId[]

const GUARANTEED_RECOVERY_PREFIX_ACTIONS = [
  'trainedPerfection',
  'mastersMend',
  'immaculateMend',
  'manipulation',
  'wasteNot',
  'wasteNot2',
  'veneration',
] as const satisfies readonly CraftActionId[]

const QUALITY_BURST_ACTIONS = [
  'preciseTouch',
  'trainedFinesse',
  'innovation',
  'greatStrides',
  'byregotsBlessing',
  'delicateSynthesis',
] as const satisfies readonly CraftActionId[]

export interface FinisherResourceRequirements {
  /** Total CP consumed with the observed condition now and Normal afterward. */
  requiredCp: number
  /** Smallest starting durability that can execute the exact sequence. */
  requiredDurability: number
  /** Sum of adjusted durability costs before Manipulation restoration. */
  durabilityCost: number
  endingCp: number
  endingDurability: number
}

export interface GuaranteedProgressFinisherCertificate extends FinisherResourceRequirements {
  kind: 'guaranteed-progress-finisher'
  version: typeof FINISHER_CERTIFICATE_VERSION
  conditionAssumption: 'observed-current-then-normal'
  successProbability: 1
  actions: readonly CraftActionId[]
  progressGain: number
  /**
   * Progress is simulated with required quality already satisfied so callers
   * may reserve the route before entering a quality burst. The actions must not
   * be executed until this precondition is true.
   */
  requiresQualityFloorBeforeExecution: boolean
  projectedState: CraftState
}

export interface QualityBurstCertificate extends FinisherResourceRequirements {
  kind: 'quality-burst-with-progress-finish'
  version: typeof FINISHER_CERTIFICATE_VERSION
  conditionAssumption: 'observed-current-then-normal'
  successProbability: 1
  qualityActions: readonly CraftActionId[]
  progressActions: readonly CraftActionId[]
  actions: readonly CraftActionId[]
  qualityFloor: number
  qualityGain: number
  progressGain: number
  qualityEndState: CraftState
  projectedState: CraftState
  progressFinisher: GuaranteedProgressFinisherCertificate
}

export interface ProgressFinisherSearchOptions {
  maxActions?: number
  maxNodeExpansions?: number
}

export interface QualityBurstSearchOptions {
  maxQualityActions?: number
  maxProgressActions?: number
  /** Tier or maximum floor this bounded certificate must reach. */
  qualityFloor?: number
  /** Shared across quality, progress, and recovery/setup search. */
  maxNodeExpansions?: number
}

export type FinisherFeasibility = 'guaranteed' | 'contingent-or-risky' | 'infeasible'

export interface ProgressFinisherAssessment {
  feasibility: FinisherFeasibility
  certificate: GuaranteedProgressFinisherCertificate | null
  reason: 'guaranteed-certificate' | 'bounded-proof-not-found' | 'terminal-state'
}

export type DesperationContingency =
  | 'rapid-synthesis-success'
  | 'hasty-touch-success'
  | 'future-sturdy'
  | 'future-pliant-recovery'

export interface QualityBurstAssessmentOptions extends QualityBurstSearchOptions {
  /**
   * Must come from a separate conservative route evaluation. Certificate
   * absence alone is not evidence that the conservative route is infeasible.
   */
  conservativeRouteStatus?: 'viable-or-unknown' | 'infeasible'
}

export interface QualityBurstAssessment {
  feasibility: FinisherFeasibility
  certificate: QualityBurstCertificate | null
  commitMode: 'certified' | 'continue-quality-cycle' | 'desperation' | 'none'
  action: CraftActionId | null
  contingencies: readonly DesperationContingency[]
  reason:
    | 'guaranteed-certificate'
    | 'bounded-proof-not-found'
    | 'desperation-after-conservative-route-infeasible'
    | 'quality-already-satisfied'
    | 'terminal-state'
}

interface GuaranteedReplay {
  state: CraftState
  cpCost: number
  durabilityCost: number
}

interface ActionNode {
  state: CraftState
  actions: CraftActionId[]
}

interface FinisherSearchBudget {
  remainingNodeExpansions: number
  exhausted: boolean
}

function boundedActionLimit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 0 || resolved > MAX_BOUNDED_ACTION_LIMIT) {
    throw new RangeError(`${label} must be an integer between 0 and ${MAX_BOUNDED_ACTION_LIMIT}`)
  }
  return resolved
}

function boundedNodeExpansionLimit(value: number | undefined): number {
  const resolved = value ?? UNBOUNDED_FINISHER_NODE_EXPANSION_LIMIT
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError('maxNodeExpansions must be a positive safe integer')
  }
  return resolved
}

function resolvedQualityFloor(recipe: RecipeProfile, value: number | undefined): number {
  const floor = value ?? recipe.requiredQuality
  if (!Number.isInteger(floor) || floor < recipe.requiredQuality || floor > recipe.qualityMax) {
    throw new RangeError('qualityFloor must be an integer between requiredQuality and qualityMax')
  }
  return floor
}

function createSearchBudget(maxNodeExpansions: number | undefined): FinisherSearchBudget {
  return {
    remainingNodeExpansions: boundedNodeExpansionLimit(maxNodeExpansions),
    exhausted: false,
  }
}

function consumeNodeExpansion(budget: FinisherSearchBudget): boolean {
  if (budget.remainingNodeExpansions <= 0) {
    budget.exhausted = true
    return false
  }
  budget.remainingNodeExpansions -= 1
  return true
}

function progressSimulationState(recipe: RecipeProfile, state: CraftState): CraftState | null {
  if (state.terminal === 'failed') return null
  if (state.progress >= recipe.progressRequired && state.quality < recipe.requiredQuality) return null
  return {
    ...state,
    quality: Math.max(state.quality, recipe.requiredQuality),
    terminal: state.progress >= recipe.progressRequired ? 'completed' : 'none',
    failureReason: null,
  }
}

function replayGuaranteedActions(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialState: CraftState,
  actions: readonly CraftActionId[],
  assumeRequiredQualitySatisfied: boolean,
): GuaranteedReplay | null {
  let state = assumeRequiredQualitySatisfied
    ? progressSimulationState(recipe, initialState)
    : initialState
  if (state === null || state.terminal === 'failed') return null
  if (state.terminal === 'completed') {
    return actions.length === 0 ? { state, cpCost: 0, durabilityCost: 0 } : null
  }

  let cpCost = 0
  let durabilityCost = 0
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!
    const preview = previewAction(recipe, crafter, state, action)
    if (!preview.legal || preview.successRate !== 1) return null
    cpCost += preview.cpCost
    durabilityCost += preview.durabilityCost
    state = applyObservedOutcome(recipe, crafter, state, action, {
      success: true,
      nextCondition: NORMAL_CONDITION,
    }).nextState
    if (state.terminal === 'failed') return null
    if (state.terminal === 'completed' && index !== actions.length - 1) return null
  }
  return { state, cpCost, durabilityCost }
}

function minimumStartingDurability(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialState: CraftState,
  actions: readonly CraftActionId[],
  assumeRequiredQualitySatisfied: boolean,
): number | null {
  if (actions.length === 0) return 0
  for (let durability = 1; durability <= recipe.durabilityMax; durability += 1) {
    const replay = replayGuaranteedActions(
      recipe,
      crafter,
      { ...initialState, durability },
      actions,
      assumeRequiredQualitySatisfied,
    )
    if (replay?.state.terminal === 'completed') return durability
  }
  return null
}

function compareProgressCertificates(
  left: GuaranteedProgressFinisherCertificate,
  right: GuaranteedProgressFinisherCertificate,
): number {
  return left.requiredDurability - right.requiredDurability
    || left.requiredCp - right.requiredCp
    || left.actions.length - right.actions.length
    || compareCraftActionSequences(left.actions, right.actions)
}

function progressCertificateFromActions(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  actions: readonly CraftActionId[],
): GuaranteedProgressFinisherCertificate | null {
  const replay = replayGuaranteedActions(recipe, crafter, state, actions, true)
  if (replay?.state.terminal !== 'completed') return null
  const requiredDurability = minimumStartingDurability(recipe, crafter, state, actions, true)
  if (requiredDurability === null) return null
  return {
    kind: 'guaranteed-progress-finisher',
    version: FINISHER_CERTIFICATE_VERSION,
    conditionAssumption: 'observed-current-then-normal',
    successProbability: 1,
    actions: [...actions],
    progressGain: replay.state.progress - state.progress,
    requiredCp: replay.cpCost,
    requiredDurability,
    durabilityCost: replay.durabilityCost,
    endingCp: replay.state.cp,
    endingDurability: replay.state.durability,
    requiresQualityFloorBeforeExecution: state.quality < recipe.requiredQuality,
    projectedState: replay.state,
  }
}

/**
 * Finds a conservative direct progress finish. This bounded search is a proof
 * of one route, not a proof that no longer route (for example one containing a
 * repair action) exists. The already-observed current condition is honored;
 * every future condition is held at Normal. Every action must be legal and
 * 100%-success under the exact mechanics transition.
 */
export function findGuaranteedProgressFinisher(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: ProgressFinisherSearchOptions = {},
): GuaranteedProgressFinisherCertificate | null {
  const maxActions = boundedActionLimit(options.maxActions, DEFAULT_PROGRESS_ACTION_LIMIT, 'maxActions')
  const budget = createSearchBudget(options.maxNodeExpansions)
  return findGuaranteedProgressFinisherWithinBudget(recipe, crafter, state, maxActions, budget)
}

function findGuaranteedProgressFinisherWithinBudget(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  maxActions: number,
  budget: FinisherSearchBudget,
): GuaranteedProgressFinisherCertificate | null {
  const simulationState = progressSimulationState(recipe, state)
  if (simulationState === null) return null
  if (simulationState.terminal === 'completed') {
    return progressCertificateFromActions(recipe, crafter, state, [])
  }

  const certificates: GuaranteedProgressFinisherCertificate[] = []
  let frontier: ActionNode[] = [{ state: simulationState, actions: [] }]
  for (let depth = 0; depth < maxActions; depth += 1) {
    const nextFrontier: ActionNode[] = []
    for (const node of frontier) {
      if (!consumeNodeExpansion(budget)) break
      for (const action of GUARANTEED_PROGRESS_ACTIONS) {
        const preview = previewAction(recipe, crafter, node.state, action)
        if (!preview.legal || preview.successRate !== 1) continue
        const nextState = applyObservedOutcome(recipe, crafter, node.state, action, {
          success: true,
          nextCondition: NORMAL_CONDITION,
        }).nextState
        if (nextState.terminal === 'failed') continue
        const actions = [...node.actions, action]
        if (nextState.terminal === 'completed') {
          const certificate = progressCertificateFromActions(recipe, crafter, state, actions)
          if (certificate !== null) certificates.push(certificate)
        } else {
          nextFrontier.push({ state: nextState, actions })
        }
      }
    }
    frontier = nextFrontier
  }
  certificates.sort(compareProgressCertificates)
  return certificates[0] ?? null
}

/**
 * Extends the direct proof with at most two distinct deterministic
 * recovery/setup actions. This covers compact routes such as "repair +
 * Veneration, then finish" without allowing arbitrary refresh loops.
 */
export function findGuaranteedProgressFinisherWithRecovery(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: ProgressFinisherSearchOptions = {},
): GuaranteedProgressFinisherCertificate | null {
  const maxActions = boundedActionLimit(options.maxActions, DEFAULT_PROGRESS_ACTION_LIMIT, 'maxActions')
  const budget = createSearchBudget(options.maxNodeExpansions)
  return findGuaranteedProgressFinisherWithRecoveryWithinBudget(
    recipe,
    crafter,
    state,
    maxActions,
    budget,
  )
}

function findGuaranteedProgressFinisherWithRecoveryWithinBudget(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  maxActions: number,
  budget: FinisherSearchBudget,
): GuaranteedProgressFinisherCertificate | null {
  const direct = findGuaranteedProgressFinisherWithinBudget(recipe, crafter, state, maxActions, budget)
  if (direct !== null || maxActions < 2 || state.terminal !== 'none') return direct

  const certificates: GuaranteedProgressFinisherCertificate[] = []
  let prefixes: ActionNode[] = [{ state, actions: [] }]
  for (let prefixDepth = 0; prefixDepth < Math.min(2, maxActions - 1); prefixDepth += 1) {
    const nextPrefixes: ActionNode[] = []
    for (const prefix of prefixes) {
      if (!consumeNodeExpansion(budget)) break
      for (const recoveryAction of GUARANTEED_RECOVERY_PREFIX_ACTIONS) {
        if (prefix.actions.includes(recoveryAction)) continue
        const preview = previewAction(recipe, crafter, prefix.state, recoveryAction)
        if (!preview.legal || preview.successRate !== 1) continue
        const recovered = applyObservedOutcome(recipe, crafter, prefix.state, recoveryAction, {
          success: true,
          nextCondition: NORMAL_CONDITION,
        }).nextState
        if (recovered.terminal === 'failed') continue
        const recoveryActions = [...prefix.actions, recoveryAction]
        const tail = findGuaranteedProgressFinisherWithinBudget(
          recipe,
          crafter,
          recovered,
          maxActions - recoveryActions.length,
          budget,
        )
        if (tail !== null) {
          const combined = progressCertificateFromActions(
            recipe,
            crafter,
            state,
            [...recoveryActions, ...tail.actions],
          )
          if (combined !== null) certificates.push(combined)
        }
        nextPrefixes.push({ state: recovered, actions: recoveryActions })
      }
    }
    prefixes = nextPrefixes
  }
  certificates.sort(compareProgressCertificates)
  return certificates[0] ?? null
}

/**
 * Converts the bounded proof result into a tri-state decision contract. A
 * missing certificate remains contingent instead of becoming a hard veto,
 * because repair, favorable future conditions, or risky synthesis may still
 * preserve a completion route outside this deliberately small search.
 */
export function assessProgressFinisher(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: ProgressFinisherSearchOptions = {},
): ProgressFinisherAssessment {
  const certificate = findGuaranteedProgressFinisher(recipe, crafter, state, options)
  if (certificate !== null) {
    return { feasibility: 'guaranteed', certificate, reason: 'guaranteed-certificate' }
  }
  if (state.terminal !== 'none') {
    return { feasibility: 'infeasible', certificate: null, reason: 'terminal-state' }
  }
  return {
    feasibility: 'contingent-or-risky',
    certificate: null,
    reason: 'bounded-proof-not-found',
  }
}

function compareQualityCertificates(left: QualityBurstCertificate, right: QualityBurstCertificate): number {
  return left.requiredDurability - right.requiredDurability
    || left.requiredCp - right.requiredCp
    || left.actions.length - right.actions.length
    || compareCraftActionSequences(left.actions, right.actions)
}

function qualityCertificateFromActions(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  qualityActions: readonly CraftActionId[],
  qualityFloor: number,
  progressActionLimit: number,
  budget: FinisherSearchBudget,
): QualityBurstCertificate | null {
  const qualityReplay = replayGuaranteedActions(recipe, crafter, state, qualityActions, false)
  if (qualityReplay === null || qualityReplay.state.quality < qualityFloor) return null
  const progressFinisher = findGuaranteedProgressFinisherWithRecoveryWithinBudget(
    recipe,
    crafter,
    qualityReplay.state,
    progressActionLimit,
    budget,
  )
  if (progressFinisher === null) return null

  const actions = [...qualityActions, ...progressFinisher.actions]
  const fullReplay = replayGuaranteedActions(recipe, crafter, state, actions, false)
  if (fullReplay?.state.terminal !== 'completed') return null
  const requiredDurability = minimumStartingDurability(recipe, crafter, state, actions, false)
  if (requiredDurability === null) return null
  return {
    kind: 'quality-burst-with-progress-finish',
    version: FINISHER_CERTIFICATE_VERSION,
    conditionAssumption: 'observed-current-then-normal',
    successProbability: 1,
    qualityActions: [...qualityActions],
    progressActions: [...progressFinisher.actions],
    actions,
    qualityFloor,
    qualityGain: qualityReplay.state.quality - state.quality,
    progressGain: fullReplay.state.progress - state.progress,
    requiredCp: fullReplay.cpCost,
    requiredDurability,
    durabilityCost: fullReplay.durabilityCost,
    endingCp: fullReplay.state.cp,
    endingDurability: fullReplay.state.durability,
    qualityEndState: qualityReplay.state,
    projectedState: fullReplay.state,
    progressFinisher,
  }
}

/**
 * Finds a bounded quality burst whose exact successful replay honors the
 * already-observed condition, assumes Normal for every future condition,
 * reaches required quality, and retains a guaranteed direct progress finish.
 * A Byregot that does not itself reach required quality is never expanded,
 * preventing an uncertified Inner Quiet reset from being called a burst
 * commitment.
 */
export function findQualityBurstCertificate(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: QualityBurstSearchOptions = {},
): QualityBurstCertificate | null {
  const maxQualityActions = boundedActionLimit(
    options.maxQualityActions,
    DEFAULT_QUALITY_ACTION_LIMIT,
    'maxQualityActions',
  )
  const maxProgressActions = boundedActionLimit(
    options.maxProgressActions,
    DEFAULT_PROGRESS_ACTION_LIMIT,
    'maxProgressActions',
  )
  const qualityFloor = resolvedQualityFloor(recipe, options.qualityFloor)
  const budget = createSearchBudget(options.maxNodeExpansions)
  if (state.terminal !== 'none' || state.quality >= qualityFloor) return null

  const certificates: QualityBurstCertificate[] = []
  let frontier: ActionNode[] = [{ state, actions: [] }]
  for (let depth = 0; depth < maxQualityActions; depth += 1) {
    const nextFrontier: ActionNode[] = []
    for (const node of frontier) {
      if (!consumeNodeExpansion(budget)) break
      for (const action of QUALITY_BURST_ACTIONS) {
        const currentState = node.state
        const preview = previewAction(recipe, crafter, currentState, action)
        if (!preview.legal || preview.successRate !== 1) continue
        const nextState = applyObservedOutcome(recipe, crafter, currentState, action, {
          success: true,
          nextCondition: NORMAL_CONDITION,
        }).nextState
        if (nextState.terminal === 'failed') continue
        const actions = [...node.actions, action]
        if (nextState.quality >= qualityFloor) {
          const certificate = qualityCertificateFromActions(
            recipe,
            crafter,
            state,
            actions,
            qualityFloor,
            maxProgressActions,
            budget,
          )
          if (certificate !== null) certificates.push(certificate)
          continue
        }
        // This certificate does not include a second Inner Quiet build. Once
        // Byregot consumes it, the route is not allowed to claim completion.
        if (action === 'byregotsBlessing' || action === 'delicateSynthesis') continue
        nextFrontier.push({ state: nextState, actions })
      }
    }
    frontier = nextFrontier
  }
  certificates.sort(compareQualityCertificates)
  return certificates[0] ?? null
}

function successfulActionSurvives(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
): boolean {
  const preview = previewAction(recipe, crafter, state, action)
  if (!preview.legal || preview.successRate <= 0) return false
  const nextState = applyObservedOutcome(recipe, crafter, state, action, {
    success: true,
    nextCondition: NORMAL_CONDITION,
  }).nextState
  return nextState.terminal !== 'failed'
}

function desperationContingencies(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  normalState: CraftState,
  sturdyState: CraftState,
  pliantState: CraftState,
): DesperationContingency[] {
  const contingencies: DesperationContingency[] = []
  if (successfulActionSurvives(recipe, crafter, normalState, 'rapidSynthesis')) {
    contingencies.push('rapid-synthesis-success')
  }
  if (successfulActionSurvives(recipe, crafter, normalState, 'hastyTouch')) {
    contingencies.push('hasty-touch-success')
  }
  if (
    successfulActionSurvives(recipe, crafter, sturdyState, 'rapidSynthesis')
    || successfulActionSurvives(recipe, crafter, sturdyState, 'hastyTouch')
  ) contingencies.push('future-sturdy')
  if (
    (['mastersMend', 'immaculateMend', 'manipulation', 'wasteNot', 'wasteNot2'] as const)
      .some((action) => successfulActionSurvives(recipe, crafter, pliantState, action))
  ) contingencies.push('future-pliant-recovery')
  return contingencies
}

function byregotDesperationContingencies(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
): DesperationContingency[] {
  const preview = previewAction(recipe, crafter, state, 'byregotsBlessing')
  if (!preview.legal || preview.successRate !== 1) return []
  const after = (condition: CraftState['condition']): CraftState => applyObservedOutcome(
    recipe,
    crafter,
    state,
    'byregotsBlessing',
    { success: true, nextCondition: condition },
  ).nextState
  const normalState = after('normal')
  if (normalState.terminal === 'failed') return []
  return desperationContingencies(recipe, crafter, normalState, after('sturdy'), after('pliant'))
}

/**
 * Decision-facing tri-state wrapper. Only a complete certificate is called
 * guaranteed. Proof absence remains contingent. A non-completing Byregot is
 * exposed as a desperation action only when an independent route evaluation
 * has already declared the conservative route infeasible and an explicit
 * risky/favorable-condition continuation remains.
 */
export function assessQualityBurst(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: QualityBurstAssessmentOptions = {},
): QualityBurstAssessment {
  const qualityFloor = resolvedQualityFloor(recipe, options.qualityFloor)
  const certificate = findQualityBurstCertificate(recipe, crafter, state, options)
  if (certificate !== null) {
    return {
      feasibility: 'guaranteed',
      certificate,
      commitMode: 'certified',
      action: certificate.qualityActions[0] ?? null,
      contingencies: [],
      reason: 'guaranteed-certificate',
    }
  }
  if (state.terminal !== 'none') {
    return {
      feasibility: 'infeasible',
      certificate: null,
      commitMode: 'none',
      action: null,
      contingencies: [],
      reason: 'terminal-state',
    }
  }
  if (state.quality >= qualityFloor) {
    return {
      feasibility: 'infeasible',
      certificate: null,
      commitMode: 'none',
      action: null,
      contingencies: [],
      reason: 'quality-already-satisfied',
    }
  }

  if (options.conservativeRouteStatus === 'infeasible') {
    const contingencies = byregotDesperationContingencies(recipe, crafter, state)
    if (contingencies.length > 0) {
      return {
        feasibility: 'contingent-or-risky',
        certificate: null,
        commitMode: 'desperation',
        action: 'byregotsBlessing',
        contingencies,
        reason: 'desperation-after-conservative-route-infeasible',
      }
    }
  }
  return {
    feasibility: 'contingent-or-risky',
    certificate: null,
    commitMode: 'continue-quality-cycle',
    action: null,
    contingencies: [],
    reason: 'bounded-proof-not-found',
  }
}
