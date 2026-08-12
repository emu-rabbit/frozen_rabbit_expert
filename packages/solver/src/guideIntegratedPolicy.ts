import {
  ACTIONS,
  applyObservedOutcome,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from './policySafety'
import { compareBoundedRiskFinisherRoots } from './boundedRiskFinisher'
import {
  assessQualityBurst,
  findGuaranteedProgressFinisherWithRecovery,
  findQualityBurstCertificate,
} from './finisherCertificate'
import type { CraftPhase, RecommendationReasonCode } from './types'

export const GUIDE_INTEGRATED_POLICY_VERSION = 'cosmic-titanium-guide-integrated-v1.2.0'
export const NAILS_GUIDE_INTEGRATED_POLICY_VERSION = 'cosmic-titanium-nails-guide-integrated-v1.3.0'
export const HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION = 'hardened-survey-plank-guide-integrated-v1.1.0'
export const MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION = 'mobile-work-stairs-guide-integrated-v1.3.0'
export const SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION = 'survey-craftsmans-command-brew-guide-integrated-v1.0.0'
export type GuideIntegratedPolicyVersion =
  | typeof GUIDE_INTEGRATED_POLICY_VERSION
  | typeof NAILS_GUIDE_INTEGRATED_POLICY_VERSION
  | typeof HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION
  | typeof MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION
  | typeof SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION
export const GUIDE_INTEGRATED_DECISION_MEMORY_VERSION = 'guide-integrated-decision-memory-v0.5.0'
export const SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING = 16
export const DEFAULT_GUIDE_FINISHER_NODE_LIMIT = 256
export const DEFAULT_GUIDE_BOUNDED_RISK_WALL_CLOCK_MS = 800
export const DEFAULT_GUIDE_RECOMMENDATION_DEADLINE_MS = 3_000

export interface GuideIntegratedPolicyConfig {
  earlyManipulation: boolean
  maxWasteNot: number
  maxManipulation: number
  maxInnovation: number
  maxGreatStrides: number
  freeQualityCpFloor: number
  balanceTolerance: number
  greatStridesQuality: number
  byregotQuality: number
  daringMode: 'never' | 'centered' | 'always'
  delicateMode: 'never' | 'balanced' | 'finish'
  secondWasteNot: 'never' | 'pliant' | 'always'
  useVeneration: boolean
  /** Score recipes may secure this progress ratio before the main quality cycle. */
  progressFloorBeforeQuality: number
  preferGoodIntensiveBeforeCashout: boolean
  cashOutAtLowestQualityTier: boolean
  /** Preserve an IQ10 Byregot window for specialist no-step setup and rerolls. */
  useSpecialistFinisher: boolean
  /** Bounded ordinary Observe rolls after specialist/no-step rolls are unavailable. */
  maxFinisherObserves: number
  /** Highest IQ stack where Heart and Soul may be invested in Precise Touch. */
  heartAndSoulPreciseMaxInnerQuiet: number
  /** Explicit consumable gate; specialist stats alone do not authorize delineation actions. */
  allowSpecialistActions: boolean
  /** Adaptive recipes may cash out IQ10 once CP falls below this recipe-owned ceiling. Zero disables it. */
  adaptiveByregotCashoutCpCeiling: number
  /** Minimum target ratio reached by the exact adaptive cashout sequence. Zero disables this gate. */
  adaptiveByregotMinimumProjectedQualityRatio: number
  /**
   * Per-craft action bound for an optional late Good quality extension. Zero
   * disables it. This is not a mission deadline or a general hard step cap.
  */
  adaptiveGoodQualityExtensionActionBudget: number
  /** Minimum prior actual action uses before the late Good quality extension may start. Zero disables it. */
  adaptiveGoodQualityExtensionActionFloor: number
  /** Spend an observed Malleable on progress before opening a new Veneration window. */
  consumeMalleableBeforeVeneration: boolean
  /**
   * Adaptive score recipes delay a below-target finishing synthesis only when
   * a bounded certificate proves this quality floor and a later completion.
   * Zero disables the extra guard. It is never a mechanics failure boundary.
   */
  adaptiveCompletionQualityGuardrail: number
  /** Follow the bounded, all-Normal-proven quality-first route while its exact continuation remains feasible. */
  adaptiveReliableQualityFirstRoute: boolean
  /** Required-quality recipes may take one deterministic progress step only when a full joint route is then certified. */
  requiredQualityProgressPrefixCertificate: boolean
  finisherSearchNodeLimit: number
  boundedRiskMaxWallClockMs: number
}

export const DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG: Readonly<GuideIntegratedPolicyConfig> = {
  earlyManipulation: true,
  maxWasteNot: 1,
  maxManipulation: 3,
  maxInnovation: 6,
  maxGreatStrides: 3,
  freeQualityCpFloor: 100,
  balanceTolerance: 0,
  greatStridesQuality: 0.72,
  byregotQuality: 0.95,
  daringMode: 'always',
  delicateMode: 'never',
  secondWasteNot: 'always',
  useVeneration: true,
  progressFloorBeforeQuality: 0,
  preferGoodIntensiveBeforeCashout: false,
  cashOutAtLowestQualityTier: false,
  useSpecialistFinisher: false,
  maxFinisherObserves: 0,
  heartAndSoulPreciseMaxInnerQuiet: -1,
  allowSpecialistActions: true,
  adaptiveByregotCashoutCpCeiling: 0,
  adaptiveByregotMinimumProjectedQualityRatio: 0,
  adaptiveGoodQualityExtensionActionBudget: 0,
  adaptiveGoodQualityExtensionActionFloor: 0,
  consumeMalleableBeforeVeneration: false,
  adaptiveCompletionQualityGuardrail: 0,
  adaptiveReliableQualityFirstRoute: false,
  requiredQualityProgressPrefixCertificate: true,
  finisherSearchNodeLimit: DEFAULT_GUIDE_FINISHER_NODE_LIMIT,
  boundedRiskMaxWallClockMs: DEFAULT_GUIDE_BOUNDED_RISK_WALL_CLOCK_MS,
}

export const DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG: Readonly<GuideIntegratedPolicyConfig> = {
  ...DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  freeQualityCpFloor: 100,
  greatStridesQuality: 0.65,
  progressFloorBeforeQuality: 0.7,
  preferGoodIntensiveBeforeCashout: true,
  cashOutAtLowestQualityTier: false,
  useSpecialistFinisher: true,
  maxFinisherObserves: 0,
  heartAndSoulPreciseMaxInnerQuiet: 8,
}

export const DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG: Readonly<GuideIntegratedPolicyConfig> = {
  ...DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  maxWasteNot: 2,
  freeQualityCpFloor: 80,
  greatStridesQuality: 0.68,
  secondWasteNot: 'pliant',
  allowSpecialistActions: false,
  adaptiveByregotCashoutCpCeiling: 0,
  requiredQualityProgressPrefixCertificate: true,
}

export const DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG: Readonly<GuideIntegratedPolicyConfig> = {
  ...DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  progressFloorBeforeQuality: 0.65,
  useSpecialistFinisher: false,
  heartAndSoulPreciseMaxInnerQuiet: -1,
  allowSpecialistActions: false,
  adaptiveByregotCashoutCpCeiling: 0,
  adaptiveByregotMinimumProjectedQualityRatio: 0,
  requiredQualityProgressPrefixCertificate: false,
}

export const DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG: Readonly<GuideIntegratedPolicyConfig> = {
  ...DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  progressFloorBeforeQuality: 0.65,
  preferGoodIntensiveBeforeCashout: false,
  cashOutAtLowestQualityTier: false,
  useSpecialistFinisher: true,
  maxFinisherObserves: 0,
  heartAndSoulPreciseMaxInnerQuiet: 8,
  allowSpecialistActions: true,
  adaptiveByregotCashoutCpCeiling: 0,
  adaptiveByregotMinimumProjectedQualityRatio: 0,
  adaptiveGoodQualityExtensionActionBudget: 0,
  adaptiveGoodQualityExtensionActionFloor: 0,
  consumeMalleableBeforeVeneration: true,
  adaptiveCompletionQualityGuardrail: 10_800,
  adaptiveReliableQualityFirstRoute: true,
  requiredQualityProgressPrefixCertificate: false,
}

export interface GuideIntegratedDecisionMemory {
  version: typeof GUIDE_INTEGRATED_DECISION_MEMORY_VERSION
  actionUses: number
  lastQualityActionUse: number
  lastPreciseTouchActionUse: number
  wasteNotUses: number
  manipulationUses: number
  innovationUses: number
  greatStridesUses: number
  reliableQualityFirstRouteIndex: number
  lastAction: CraftActionId | null
}

const RELIABLE_QUALITY_FIRST_ROUTE = [
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
  'basicSynthesis',
] as const satisfies readonly CraftActionId[]

export interface GuideIntegratedPolicyController {
  policy: EpisodePolicy
  snapshot: () => GuideIntegratedDecisionMemory
}

export interface GuideIntegratedRuntimeOptions {
  /** Use when the session layer already owns a validated snapshot. */
  decisionMemory?: Readonly<GuideIntegratedDecisionMemory>
  /** Preferred web input: actions actually used on the current, possibly undone path. */
  actualActionHistory?: readonly CraftActionId[]
  /** Required when mechanics requiredQuality is not the policy quality goal. */
  objective?: Readonly<CraftObjective>
  /** Scenario-owned model identity; new recipe policies must not inherit another recipe's version. */
  policyVersion?: GuideIntegratedPolicyVersion
  config?: Readonly<GuideIntegratedPolicyConfig>
  deadlineMs?: number
  now?: () => number
}

export interface GuideIntegratedRuntimeRecommendation {
  action: CraftActionId
  phase: CraftPhase
  reason: RecommendationReasonCode
  policyVersion: GuideIntegratedPolicyVersion
  decisionMemoryVersion: typeof GUIDE_INTEGRATED_DECISION_MEMORY_VERSION
  elapsedMs: number
  deadlineExceeded: boolean
}

interface ResolvedGuideObjective {
  qualityTarget: number
  adaptiveCompletion: boolean
}

function resolveGuideObjective(
  recipe: RecipeProfile,
  objective?: Readonly<CraftObjective>,
): ResolvedGuideObjective {
  if (objective !== undefined && objective.recipeProfileId !== recipe.profileId) {
    throw new Error(`objective ${objective.objectiveId} does not belong to recipe ${recipe.profileId}`)
  }
  const qualityTarget = objective?.qualityTarget ?? recipe.requiredQuality
  if (!Number.isInteger(qualityTarget) || qualityTarget < recipe.requiredQuality || qualityTarget > recipe.qualityMax) {
    throw new RangeError('objective qualityTarget must be an integer between requiredQuality and qualityMax')
  }
  if (qualityTarget <= 0) {
    throw new Error('a positive policy qualityTarget is required when recipe requiredQuality is zero')
  }
  return {
    qualityTarget,
    adaptiveCompletion: objective?.mode === 'maximize-quality-with-safe-completion',
  }
}

function recipeWithPolicyQualityTarget(
  recipe: RecipeProfile,
  qualityTarget: number,
): RecipeProfile {
  return qualityTarget === recipe.requiredQuality
    ? recipe
    : { ...recipe, requiredQuality: qualityTarget }
}

export function createGuideIntegratedDecisionMemory(): GuideIntegratedDecisionMemory {
  return {
    version: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
    actionUses: 0,
    lastQualityActionUse: 0,
    lastPreciseTouchActionUse: 0,
    wasteNotUses: 0,
    manipulationUses: 0,
    innovationUses: 0,
    greatStridesUses: 0,
    reliableQualityFirstRouteIndex: 0,
    lastAction: null,
  }
}

export function cloneGuideIntegratedDecisionMemory(
  memory: Readonly<GuideIntegratedDecisionMemory>,
): GuideIntegratedDecisionMemory {
  if (memory.version !== GUIDE_INTEGRATED_DECISION_MEMORY_VERSION) {
    throw new Error(`guide decision memory version mismatch: ${memory.version}`)
  }
  const counters = [
    ['actionUses', memory.actionUses],
    ['lastQualityActionUse', memory.lastQualityActionUse],
    ['lastPreciseTouchActionUse', memory.lastPreciseTouchActionUse],
    ['wasteNotUses', memory.wasteNotUses],
    ['manipulationUses', memory.manipulationUses],
    ['innovationUses', memory.innovationUses],
    ['greatStridesUses', memory.greatStridesUses],
  ] as const
  for (const [key, value] of counters) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${key} must be a non-negative integer`)
    }
  }
  if (
    !Number.isInteger(memory.reliableQualityFirstRouteIndex)
    || memory.reliableQualityFirstRouteIndex < -1
    || memory.reliableQualityFirstRouteIndex > RELIABLE_QUALITY_FIRST_ROUTE.length
  ) {
    throw new RangeError('reliableQualityFirstRouteIndex is outside the route boundary')
  }
  if (
    memory.lastQualityActionUse > memory.actionUses
    || memory.lastPreciseTouchActionUse > memory.actionUses
  ) throw new RangeError('last action-use indexes cannot exceed actionUses')
  return {
    version: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
    actionUses: memory.actionUses,
    lastQualityActionUse: memory.lastQualityActionUse,
    lastPreciseTouchActionUse: memory.lastPreciseTouchActionUse,
    wasteNotUses: memory.wasteNotUses,
    manipulationUses: memory.manipulationUses,
    innovationUses: memory.innovationUses,
    greatStridesUses: memory.greatStridesUses,
    reliableQualityFirstRouteIndex: memory.reliableQualityFirstRouteIndex,
    lastAction: memory.lastAction,
  }
}

/** Returns a new serializable memory after an action that was actually used. */
export function advanceGuideIntegratedDecisionMemory(
  memory: Readonly<GuideIntegratedDecisionMemory>,
  action: CraftActionId,
): GuideIntegratedDecisionMemory {
  const next = cloneGuideIntegratedDecisionMemory(memory)
  next.actionUses += 1
  if (ACTIONS[action].category === 'quality') next.lastQualityActionUse = next.actionUses
  if (action === 'preciseTouch') next.lastPreciseTouchActionUse = next.actionUses
  if (action === 'wasteNot' || action === 'wasteNot2') next.wasteNotUses += 1
  if (action === 'manipulation') next.manipulationUses += 1
  if (action === 'innovation') next.innovationUses += 1
  if (action === 'greatStrides') next.greatStridesUses += 1
  next.reliableQualityFirstRouteIndex = memory.reliableQualityFirstRouteIndex >= 0
    && action === RELIABLE_QUALITY_FIRST_ROUTE[memory.reliableQualityFirstRouteIndex]
    ? memory.reliableQualityFirstRouteIndex + 1
    : -1
  next.lastAction = action
  return next
}

/** Replays only actions the player actually used, so undo/reload are deterministic. */
export function rebuildGuideIntegratedDecisionMemory(
  actualActionHistory: readonly CraftActionId[],
): GuideIntegratedDecisionMemory {
  return actualActionHistory.reduce(
    advanceGuideIntegratedDecisionMemory,
    createGuideIntegratedDecisionMemory(),
  )
}

export function createGuideIntegratedPolicyController(
  config: Readonly<GuideIntegratedPolicyConfig> = DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  initialMemory: Readonly<GuideIntegratedDecisionMemory> = createGuideIntegratedDecisionMemory(),
  objective?: Readonly<CraftObjective>,
): GuideIntegratedPolicyController {
  let memory = cloneGuideIntegratedDecisionMemory(initialMemory)

  const policy: EpisodePolicy = (recipe: RecipeProfile, crafter: CrafterProfile, state: CraftState) => {
    const resolvedObjective = resolveGuideObjective(recipe, objective)
    if (
      !Number.isInteger(config.adaptiveCompletionQualityGuardrail)
      || config.adaptiveCompletionQualityGuardrail < 0
      || config.adaptiveCompletionQualityGuardrail > resolvedObjective.qualityTarget
    ) {
      throw new RangeError('adaptiveCompletionQualityGuardrail must be an integer between zero and qualityTarget')
    }
    const policyRecipe = recipeWithPolicyQualityTarget(recipe, resolvedObjective.qualityTarget)
    // Score recipes must never masquerade their policy quality target as a
    // mechanics completion requirement. Doing so lets the ingot-style
    // premature-completion veto reject every ordinary nails finish and can
    // strand the policy in non-advancing Final Appraisal/Observe loops.
    const safetyRecipe = resolvedObjective.adaptiveCompletion ? recipe : policyRecipe
    const safe = legalActions(safetyRecipe, crafter, state)
      .filter((action) => isPolicyActionSafe(safetyRecipe, crafter, state, action))
    const can = (action: CraftActionId): boolean => safe.includes(action)
    const canComplete = (action: CraftActionId): boolean => (
      legalActions(recipe, crafter, state).includes(action)
      && isPolicyActionSafe(recipe, crafter, state, action)
    )
    let cachedProgressFinisher: ReturnType<typeof findGuaranteedProgressFinisherWithRecovery> | undefined
    const progressFinisher = () => {
      if (cachedProgressFinisher === undefined) {
        cachedProgressFinisher = findGuaranteedProgressFinisherWithRecovery(recipe, crafter, state, {
          maxNodeExpansions: config.finisherSearchNodeLimit,
          ...(resolvedObjective.adaptiveCompletion ? { maxActions: 8 } : {}),
        })
      }
      return cachedProgressFinisher
    }
    const contingencyAction = (): CraftActionId | null => {
      const certified = progressFinisher()?.actions[0]
      if (certified !== undefined && canComplete(certified)) return certified

      const ranked = legalActions(recipe, crafter, state)
        .filter((action) => isPolicyActionSafe(recipe, crafter, state, action))
        .map((action) => ({ action, preview: previewAction(recipe, crafter, state, action) }))
        .sort((left, right) => {
          const leftCompletes = Number(
            state.progress + left.preview.progressGain >= recipe.progressRequired,
          )
          const rightCompletes = Number(
            state.progress + right.preview.progressGain >= recipe.progressRequired,
          )
          const leftProgress = Number(ACTIONS[left.action].category === 'progress')
          const rightProgress = Number(ACTIONS[right.action].category === 'progress')
          const leftRecovery = Number(ACTIONS[left.action].category === 'repair')
          const rightRecovery = Number(ACTIONS[right.action].category === 'repair')
          return rightCompletes - leftCompletes
            || rightCompletes * right.preview.successRate - leftCompletes * left.preview.successRate
            || rightRecovery - leftRecovery
            || rightProgress - leftProgress
            || right.preview.progressGain * right.preview.successRate
              - left.preview.progressGain * left.preview.successRate
            || left.preview.cpCost - right.preview.cpCost
        })
      return ranked[0]?.action ?? null
    }
    const branchPreservesProgressFinish = (action: CraftActionId, success: boolean): boolean => {
      const nextState = applyObservedOutcome(recipe, crafter, state, action, {
        success,
        nextCondition: 'normal',
      }).nextState
      if (nextState.terminal === 'completed') return true
      if (nextState.terminal !== 'none') return false
      return findGuaranteedProgressFinisherWithRecovery(recipe, crafter, nextState, {
        maxNodeExpansions: config.finisherSearchNodeLimit,
        ...(resolvedObjective.adaptiveCompletion ? { maxActions: 8 } : {}),
      }) !== null
    }
    const preservesProgressFinish = (action: CraftActionId): boolean => {
      const preview = previewAction(recipe, crafter, state, action)
      if (!preview.legal) return false
      if (!branchPreservesProgressFinish(action, true)) return false
      return preview.successRate === 1 || branchPreservesProgressFinish(action, false)
    }
    const sequencePreservesProgressFinish = (actions: readonly CraftActionId[]): boolean => {
      let nextState = state
      for (const action of actions) {
        const preview = previewAction(recipe, crafter, nextState, action)
        if (!preview.legal || preview.successRate !== 1) return false
        nextState = applyObservedOutcome(recipe, crafter, nextState, action, {
          success: true,
          nextCondition: 'normal',
        }).nextState
        if (nextState.terminal === 'failed') return false
        if (nextState.terminal === 'completed') return true
      }
      return findGuaranteedProgressFinisherWithRecovery(recipe, crafter, nextState, {
        maxNodeExpansions: config.finisherSearchNodeLimit,
        ...(resolvedObjective.adaptiveCompletion ? { maxActions: 8 } : {}),
      }) !== null
    }
    const sequenceProjectedQualityRatio = (actions: readonly CraftActionId[]): number | null => {
      let nextState = state
      for (const action of actions) {
        const preview = previewAction(recipe, crafter, nextState, action)
        if (!preview.legal || preview.successRate !== 1) return null
        nextState = applyObservedOutcome(recipe, crafter, nextState, action, {
          success: true,
          nextCondition: 'normal',
        }).nextState
        if (nextState.terminal === 'failed') return null
      }
      return nextState.quality / resolvedObjective.qualityTarget
    }
    const adaptiveCashoutMeetsQualityGate = (actions: readonly CraftActionId[]): boolean => {
      const minimum = config.adaptiveByregotMinimumProjectedQualityRatio
      if (minimum <= 0) return true
      const projected = sequenceProjectedQualityRatio(actions)
      return projected !== null && projected >= minimum
    }
    const reliableQualityFirstRouteAction = (): CraftActionId | null => {
      const routeIndex = memory.reliableQualityFirstRouteIndex
      const expectedAction = RELIABLE_QUALITY_FIRST_ROUTE[routeIndex]
      if (!config.adaptiveReliableQualityFirstRoute || routeIndex < 0 || expectedAction === undefined) {
        return null
      }

      let projectedState = state
      for (const action of RELIABLE_QUALITY_FIRST_ROUTE.slice(routeIndex)) {
        const preview = previewAction(recipe, crafter, projectedState, action)
        if (!preview.legal || preview.successRate !== 1) return null
        projectedState = applyObservedOutcome(recipe, crafter, projectedState, action, {
          success: true,
          nextCondition: 'normal',
        }).nextState
        if (projectedState.terminal !== 'none') {
          return projectedState.terminal === 'completed'
            && projectedState.quality >= resolvedObjective.qualityTarget
            ? expectedAction
            : null
        }
      }
      return null
    }
    const certifiedQualityBeforeCompletion = (): CraftActionId | null => {
      const targets = [resolvedObjective.qualityTarget]
      if (
        config.adaptiveCompletionQualityGuardrail > state.quality
        && config.adaptiveCompletionQualityGuardrail < resolvedObjective.qualityTarget
      ) {
        targets.push(config.adaptiveCompletionQualityGuardrail)
      }
      for (const qualityTarget of targets) {
        const certificate = findQualityBurstCertificate(recipe, crafter, state, {
          maxNodeExpansions: config.finisherSearchNodeLimit,
          maxProgressActions: 8,
          qualityTarget,
        })
        const qualityAction = certificate?.qualityActions[0]
        if (qualityAction !== undefined && can(qualityAction)) return qualityAction
      }
      return null
    }
    const pick = (proposedAction: CraftActionId): CraftActionId => {
      let action = proposedAction
      if (
        state.buffs.greatStrides > 0
        && state.innerQuiet === 10
        && proposedAction !== 'byregotsBlessing'
        && ACTIONS[proposedAction].category === 'quality'
        && can('byregotsBlessing')
      ) {
        action = compareBoundedRiskFinisherRoots(
          policyRecipe,
          crafter,
          state,
          'byregotsBlessing',
          proposedAction,
          { maxWallClockMs: config.boundedRiskMaxWallClockMs },
        ).action
      }
      if (
        resolvedObjective.adaptiveCompletion
        && state.quality < resolvedObjective.qualityTarget
        && state.innerQuiet === 10
        && action !== 'byregotsBlessing'
        && can('byregotsBlessing')
      ) {
        const proposed = previewAction(recipe, crafter, state, action)
        const blessing = previewAction(recipe, crafter, state, 'byregotsBlessing')
        const spendsBlessingReserve = proposed.cpCost > 0
          && state.cp - proposed.cpCost < blessing.cpCost
        if (spendsBlessingReserve && preservesProgressFinish('byregotsBlessing')) {
          action = 'byregotsBlessing'
        }
      }
      if (
        resolvedObjective.adaptiveCompletion
        && state.quality < resolvedObjective.qualityTarget
        && !preservesProgressFinish(action)
      ) {
        const goodIntensiveRescue = config.preferGoodIntensiveBeforeCashout
          && state.condition === 'good'
          && action !== 'intensiveSynthesis'
          && canComplete('intensiveSynthesis')
          && preservesProgressFinish('intensiveSynthesis')
        if (goodIntensiveRescue) {
          action = 'intensiveSynthesis'
        } else {
          const finishAction = progressFinisher()?.actions[0]
          if (finishAction !== undefined && canComplete(finishAction)) action = finishAction
        }
      }
      if (
        resolvedObjective.adaptiveCompletion
        && state.quality < resolvedObjective.qualityTarget
      ) {
        const proposed = previewAction(recipe, crafter, state, action)
        const completesBelowTarget = proposed.legal
          && proposed.progressGain > 0
          && state.progress + proposed.progressGain >= recipe.progressRequired
          && state.quality + proposed.qualityGain < resolvedObjective.qualityTarget
        if (completesBelowTarget) {
          const qualityAction = certifiedQualityBeforeCompletion()
          if (qualityAction !== null) action = qualityAction
        }
      }
      memory = advanceGuideIntegratedDecisionMemory(memory, action)
      return action
    }
    const first = (...actions: CraftActionId[]): CraftActionId | null => {
      const action = actions.find(can)
      if (action !== undefined) return pick(action)
      if (resolvedObjective.adaptiveCompletion) {
        const finishAction = contingencyAction()
        if (finishAction !== null) return pick(finishAction)
      }
      return null
    }
    const firstProgressReserve = (...actions: CraftActionId[]): CraftActionId | null => {
      const action = actions.find((candidate) => {
        if (!can(candidate)) return false
        const preview = previewAction(recipe, crafter, state, candidate)
        return preview.progressGain > 0
          && state.progress + preview.progressGain < recipe.progressRequired
      })
      return action === undefined ? null : pick(action)
    }
    const progressRatio = state.progress / recipe.progressRequired
    const qualityRatio = state.quality / resolvedObjective.qualityTarget
    const lowestQualityTier = objective?.qualityTiers.reduce<number | null>(
      (minimum, tier) => minimum === null ? tier.minimumQuality : Math.min(minimum, tier.minimumQuality),
      null,
    ) ?? null
    const qualityWanted = progressRatio - qualityRatio > config.balanceTolerance || progressRatio >= 0.9
    const progressWanted = qualityRatio - progressRatio > config.balanceTolerance || progressRatio < 0.55

      if (
        config.adaptiveReliableQualityFirstRoute
        && state.quality >= resolvedObjective.qualityTarget
      ) {
        const directCompletion = (
          ['intensiveSynthesis', 'groundwork', 'carefulSynthesis', 'basicSynthesis', 'prudentSynthesis'] as const
        ).find((action) => {
          const preview = previewAction(recipe, crafter, state, action)
          return canComplete(action)
            && preview.successRate === 1
            && state.progress + preview.progressGain >= recipe.progressRequired
        })
        if (directCompletion !== undefined) return pick(directCompletion)
      }

      // The ingot keeps Heart and Soul as a last-resort Tricks CP bridge. The
      // nails-specific config may instead invest it in one guaranteed Precise
      // Touch after the progress reserve is established. Both routes remain
      // observable-state decisions and preserve a certified progress finish.
      if (
        config.allowSpecialistActions
        && crafter.specialist === true
        && state.heartAndSoulActive
        && memory.lastAction === 'heartAndSoul'
      ) {
        if (
          state.innerQuiet <= config.heartAndSoulPreciseMaxInnerQuiet
          && can('preciseTouch')
        ) return pick('preciseTouch')
        if (can('tricksOfTheTrade')) return pick('tricksOfTheTrade')
      }
      if (
        config.allowSpecialistActions
        && crafter.specialist === true
        && state.condition !== 'good'
        && state.cp <= SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING
        && state.cp <= crafter.maxCp - 20
        && state.heartAndSoulAvailable
        && !state.heartAndSoulActive
        && can('heartAndSoul')
      ) return pick('heartAndSoul')
      if (
        config.allowSpecialistActions
        && crafter.specialist === true
        && config.heartAndSoulPreciseMaxInnerQuiet >= 0
        && state.condition === 'normal'
        && state.innerQuiet <= config.heartAndSoulPreciseMaxInnerQuiet
        && state.innerQuiet < 10
        && progressRatio >= Math.max(0.55, config.progressFloorBeforeQuality)
        && qualityWanted
        && state.cp >= previewAction(recipe, crafter, state, 'preciseTouch').cpCost
        && state.heartAndSoulAvailable
        && !state.heartAndSoulActive
        && can('heartAndSoul')
        && preservesProgressFinish('heartAndSoul')
      ) return pick('heartAndSoul')

      if (state.step === 1) return first('reflect', 'muscleMemory')

      // The three-condition Command Brew can be completed by a short,
      // deterministic quality-first route. Re-prove the entire remaining
      // route on every step, treating the already-observed condition exactly
      // and every future condition as Normal. Good can only improve its
      // quality; Malleable cannot complete the lone pre-quality synthesis.
      // Any deviation, stat boundary, or resource mismatch drops back to the
      // ordinary adaptive policy instead of blindly continuing a macro.
      const reliableRouteAction = reliableQualityFirstRouteAction()
      if (reliableRouteAction !== null && can(reliableRouteAction)) {
        return pick(reliableRouteAction)
      }

      // Hindsight routes consistently establish Manipulation before the first
      // Waste Not window. This is observable route structure, not knowledge of
      // future RNG: together they let ordinary 10-durability work break even
      // for most of the opening cycle. Preserve an immediately observed Good
      // for Precise Touch, but otherwise establish the cycle by step four.
      if (
        config.earlyManipulation
        && memory.manipulationUses === 0
        && state.step <= 4
        && state.condition !== 'good'
        && state.buffs.manipulation === 0
        && can('manipulation')
      ) return pick('manipulation')

      // Scenario configs may require an explicit progress reserve before the main quality
      // spend. The old ratio-only guide could keep choosing quality while both
      // progressWanted and qualityWanted were true, exhaust every recovery,
      // then stall thousands of progress short. Favor high-value condition
      // interrupts, but do not enter the unrestricted quality cycle before the
      // configured progress floor is secured.
      if (
        config.progressFloorBeforeQuality > 0
        && progressRatio < config.progressFloorBeforeQuality
      ) {
        if (state.condition === 'good') {
          if (state.innerQuiet < 10) return first('preciseTouch', 'intensiveSynthesis', 'tricksOfTheTrade')
          return first('intensiveSynthesis', 'preciseTouch', 'tricksOfTheTrade')
        }
        if (state.condition === 'pliant') {
          if (
            memory.manipulationUses < config.maxManipulation
            && state.durability <= 25
            && state.buffs.manipulation <= 2
            && can('manipulation')
          ) return pick('manipulation')
          if (
            memory.wasteNotUses < config.maxWasteNot
            && state.buffs.wasteNot <= 1
            && can('wasteNot2')
          ) return pick('wasteNot2')
          if (config.useVeneration && state.buffs.veneration === 0 && can('veneration')) {
            return pick('veneration')
          }
        }
        // Consume Malleable itself; spending it on Veneration throws away the
        // observed progress multiplier. Other conditions can establish the
        // progress buff before the synthesis window.
        if (
          state.condition !== 'malleable'
          && config.useVeneration
          && state.buffs.veneration === 0
          && can('veneration')
        ) return pick('veneration')
        if (state.condition === 'centered') {
          const action = firstProgressReserve('rapidSynthesis', 'carefulSynthesis', 'prudentSynthesis')
          if (action !== null) return action
        }
        if (state.condition === 'malleable' || state.condition === 'sturdy') {
          const action = firstProgressReserve('rapidSynthesis', 'groundwork', 'carefulSynthesis', 'prudentSynthesis')
          if (action !== null) return action
        } else {
          const action = firstProgressReserve('rapidSynthesis', 'carefulSynthesis', 'prudentSynthesis')
          if (action !== null) return action
        }
      }

      // After the quality burst has consumed Inner Quiet, a low-CP route
      // cannot fund another meaningful burst. Follow the already-proven
      // completion sequence instead of spending the last CP on Innovation or
      // non-advancing condition fishing.
      if (
        resolvedObjective.adaptiveCompletion
        && state.innerQuiet < 2
        && state.cp < 56
      ) {
        // A Good Precise Touch is worth taking before the low-CP finish only
        // when the remaining deterministic synthesis route still fits the
        // scenario-owned action budget. Simulating Normal is conservative for
        // the next unknown condition and avoids leaking the future stream.
        if (
          config.adaptiveGoodQualityExtensionActionBudget > 0
          && config.adaptiveGoodQualityExtensionActionFloor > 0
          && memory.actionUses >= config.adaptiveGoodQualityExtensionActionFloor
          && state.innerQuiet === 0
          && state.quality < resolvedObjective.qualityTarget
          && state.condition === 'good'
          && can('preciseTouch')
        ) {
          const precise = previewAction(recipe, crafter, state, 'preciseTouch')
          const afterPrecise = applyObservedOutcome(recipe, crafter, state, 'preciseTouch', {
            success: true,
            nextCondition: 'normal',
          }).nextState
          const remainingActions = config.adaptiveGoodQualityExtensionActionBudget - memory.actionUses - 1
          const finishAfterPrecise = precise.successRate === 1
            && precise.qualityGain > 0
            && remainingActions >= 0
            ? findGuaranteedProgressFinisherWithRecovery(recipe, crafter, afterPrecise, {
                maxNodeExpansions: config.finisherSearchNodeLimit,
                maxActions: Math.min(8, remainingActions),
              })
            : null
          if (
            finishAfterPrecise !== null
            && memory.actionUses + 1 + finishAfterPrecise.actions.length
              <= config.adaptiveGoodQualityExtensionActionBudget
          ) return pick('preciseTouch')
        }
        const finishAction = progressFinisher()?.actions[0]
        if (finishAction !== undefined && canComplete(finishAction)) return pick(finishAction)
      }

      // A late Precise extension is a route commitment, not permission to
      // start another quality cycle. These action indexes are rebuilt from
      // actual history, so undo/reload preserve the commitment without
      // storing policy intent in CraftState. A player quality deviation ends
      // the commitment and returns to ordinary safe replanning.
      if (
        resolvedObjective.adaptiveCompletion
        && config.adaptiveGoodQualityExtensionActionBudget > 0
        && memory.lastPreciseTouchActionUse > config.adaptiveGoodQualityExtensionActionFloor
        && memory.lastQualityActionUse === memory.lastPreciseTouchActionUse
        && state.innerQuiet === 2
        && state.cp < 56
      ) {
        const remainingActions = config.adaptiveGoodQualityExtensionActionBudget - memory.actionUses
        const committedFinish = remainingActions > 0
          ? findGuaranteedProgressFinisherWithRecovery(recipe, crafter, state, {
              maxNodeExpansions: config.finisherSearchNodeLimit,
              maxActions: Math.min(8, remainingActions),
            })
          : null
        const finishAction = committedFinish?.actions[0]
        if (finishAction !== undefined && canComplete(finishAction)) return pick(finishAction)
      }

      if (state.quality >= resolvedObjective.qualityTarget) {
        const guaranteedFinish = findGuaranteedProgressFinisherWithRecovery(recipe, crafter, state, {
          maxNodeExpansions: config.finisherSearchNodeLimit,
          ...(resolvedObjective.adaptiveCompletion ? { maxActions: 8 } : {}),
        })
        const certifiedAction = guaranteedFinish?.actions[0]
        if (certifiedAction !== undefined && can(certifiedAction)) return pick(certifiedAction)
        const completion = safe
          .filter((action) => ACTIONS[action].category === 'progress')
          .map((action) => ({ action, preview: previewAction(recipe, crafter, state, action) }))
          .sort((left, right) => {
            const leftDone = Number(state.progress + left.preview.progressGain >= recipe.progressRequired && left.preview.successRate === 1)
            const rightDone = Number(state.progress + right.preview.progressGain >= recipe.progressRequired && right.preview.successRate === 1)
            return rightDone - leftDone
              || right.preview.progressGain * right.preview.successRate - left.preview.progressGain * left.preview.successRate
              || left.preview.cpCost - right.preview.cpCost
          })[0]
        return completion === undefined ? first('mastersMend', 'manipulation') : pick(completion.action)
      }

      // A specialist's strongest quality leverage is concentrated at the
      // actual IQ10 cashout. Quick Innovation is a free, no-step Innovation;
      // Careful Observation can then reroll up to three times without ticking
      // Great Strides or Innovation. Only enter this option when Byregot still
      // preserves a proven progress finish. After the bounded rolls are spent,
      // cash out instead of turning condition fishing into a stall loop.
      const byregot = can('byregotsBlessing')
        ? previewAction(recipe, crafter, state, 'byregotsBlessing')
        : null
      const specialistCashoutMature = config.useSpecialistFinisher
        && config.allowSpecialistActions
        && crafter.specialist === true
        && byregot !== null
        && state.innerQuiet === 10
        && state.buffs.greatStrides > 0
        && (state.quality + byregot.qualityGain >= resolvedObjective.qualityTarget
          || qualityRatio >= (resolvedObjective.adaptiveCompletion
            ? config.greatStridesQuality
            : config.byregotQuality))
        && preservesProgressFinish('byregotsBlessing')
      if (specialistCashoutMature) {
        if (
          state.buffs.innovation === 0
          && state.quickInnovationAvailable
          && can('quickInnovation')
        ) return pick('quickInnovation')
        if (
          state.condition !== 'good'
          && state.carefulObservationUsesLeft > 0
          && can('carefulObservation')
        ) return pick('carefulObservation')
        const ordinaryObserveAvailable = config.maxFinisherObserves > 0
          && (state.comboFrom !== 'observe' || config.maxFinisherObserves > 1)
          && state.condition !== 'good'
          && state.buffs.greatStrides > 1
          && state.buffs.innovation > 1
          && can('observe')
          && preservesProgressFinish('observe')
        if (ordinaryObserveAvailable) return pick('observe')
        return pick('byregotsBlessing')
      }

      // Once the accumulated quality is mature enough, prefer an exact burst
      // that also leaves a guaranteed progress finish. Failure to find this
      // short proof is deliberately not a veto; the ordinary quality cycle and
      // desperation gambles below remain available.
      if (state.innerQuiet >= 8 && qualityRatio >= 0.5) {
        const certifiedBurst = findQualityBurstCertificate(recipe, crafter, state, {
          maxNodeExpansions: config.finisherSearchNodeLimit,
          qualityTarget: resolvedObjective.qualityTarget,
          ...(resolvedObjective.adaptiveCompletion ? { maxProgressActions: 8 } : {}),
        })
        const certifiedAction = certifiedBurst?.qualityActions[0]
        if (certifiedAction !== undefined && can(certifiedAction)) return pick(certifiedAction)

        // A fixed progress ratio cannot see discrete gains, CP/durability or
        // the exact quality cashout. If the direct burst is not certified, a
        // required-quality route may take one deterministic progress prefix
        // only when the complete prefix -> quality target -> guaranteed
        // progress finish route becomes provable from the resulting state.
        if (
          config.requiredQualityProgressPrefixCertificate
          && !resolvedObjective.adaptiveCompletion
          && certifiedBurst === null
        ) {
          for (const progressAction of ['carefulSynthesis', 'prudentSynthesis', 'groundwork'] as const) {
            const preview = previewAction(recipe, crafter, state, progressAction)
            if (
              !can(progressAction)
              || !preview.legal
              || preview.successRate !== 1
              || preview.progressGain <= 0
              || state.progress + preview.progressGain >= recipe.progressRequired
            ) continue
            const prefixedState = applyObservedOutcome(recipe, crafter, state, progressAction, {
              success: true,
              nextCondition: 'normal',
            }).nextState
            const prefixedBurst = findQualityBurstCertificate(recipe, crafter, prefixedState, {
              maxNodeExpansions: config.finisherSearchNodeLimit,
              qualityTarget: resolvedObjective.qualityTarget,
            })
            if (prefixedBurst !== null) return pick(progressAction)
          }
        }
      }

      // A max-quality objective still needs to turn accumulated IQ into actual
      // HQ utility before the final synthesis. Low-tail traces repeatedly
      // reached IQ10, spent the last CP on setup/progress, then completed with
      // no Byregot. This bounded cashout only fires when the exact post-burst
      // state retains a deterministic progress finisher.
      const adaptiveCashoutPressure = resolvedObjective.adaptiveCompletion
        && config.adaptiveByregotCashoutCpCeiling > 0
        && state.innerQuiet === 10
        && state.quality < resolvedObjective.qualityTarget
        && (
          state.cp <= config.adaptiveByregotCashoutCpCeiling
          || state.durability <= 20 && state.buffs.manipulation === 0
          || state.step >= 32
        )
      if (adaptiveCashoutPressure && can('byregotsBlessing')) {
        if (
          state.condition === 'good'
          && preservesProgressFinish('byregotsBlessing')
          && adaptiveCashoutMeetsQualityGate(['byregotsBlessing'])
        ) {
          return pick('byregotsBlessing')
        }
        if (
          state.buffs.greatStrides > 0
          && state.buffs.innovation === 0
          && can('innovation')
          && sequencePreservesProgressFinish(['innovation', 'byregotsBlessing'])
          && adaptiveCashoutMeetsQualityGate(['innovation', 'byregotsBlessing'])
        ) return pick('innovation')
        const cashoutSetup: readonly CraftActionId[] = state.buffs.innovation > 0
          ? ['greatStrides', 'byregotsBlessing']
          : ['greatStrides', 'innovation', 'byregotsBlessing']
        if (
          state.buffs.greatStrides === 0
          && can('greatStrides')
          && sequencePreservesProgressFinish(cashoutSetup)
          && adaptiveCashoutMeetsQualityGate(cashoutSetup)
        ) return pick('greatStrides')
        if (
          preservesProgressFinish('byregotsBlessing')
          && adaptiveCashoutMeetsQualityGate(['byregotsBlessing'])
        ) return pick('byregotsBlessing')
      }

      // A score recipe must eventually convert Inner Quiet into an actual
      // tier. Commit Byregot as soon as it crosses the lowest known tier and
      // the exact post-action state still retains a guaranteed progress finish.
      if (
        config.cashOutAtLowestQualityTier
        && lowestQualityTier !== null
        && state.innerQuiet === 10
        && state.quality < lowestQualityTier
        && can('byregotsBlessing')
      ) {
        const byregot = previewAction(recipe, crafter, state, 'byregotsBlessing')
        if (
          state.quality + byregot.qualityGain >= lowestQualityTier
          && preservesProgressFinish('byregotsBlessing')
        ) return pick('byregotsBlessing')
      }

      // When the remaining CP/durability can no longer fund another ordinary
      // quality cycle, a non-certified Byregot can still be the only route
      // with a live finish. This is intentionally a narrow desperation gate:
      // the burst must leave quality close enough and progress must already be
      // within a small number of risky synthesis attempts.
      const conservativeCycleInfeasible = state.cp < 56
        || state.durability <= 15 && state.buffs.manipulation === 0
        || state.step >= 40
      if (
        state.innerQuiet === 10
        && conservativeCycleInfeasible
        && can('byregotsBlessing')
      ) {
        const blessing = previewAction(recipe, crafter, state, 'byregotsBlessing')
        const afterBlessing = applyObservedOutcome(policyRecipe, crafter, state, 'byregotsBlessing', {
          success: true,
          nextCondition: 'normal',
        }).nextState
        const rapid = previewAction(policyRecipe, crafter, afterBlessing, 'rapidSynthesis')
        const oneRiskFinishExists = afterBlessing.quality >= resolvedObjective.qualityTarget
          && rapid.legal
          && afterBlessing.progress + rapid.progressGain >= recipe.progressRequired
        const desperation = oneRiskFinishExists
          ? assessQualityBurst(recipe, crafter, state, {
              conservativeRouteStatus: 'infeasible',
              maxNodeExpansions: config.finisherSearchNodeLimit,
              qualityTarget: resolvedObjective.qualityTarget,
            })
          : null
        if (desperation?.commitMode === 'desperation' && desperation.action !== null) {
          return pick(desperation.action)
        }
      }

      if (state.condition === 'good') {
        if (state.buffs.greatStrides > 0 && can('byregotsBlessing')) {
          const preview = previewAction(recipe, crafter, state, 'byregotsBlessing')
          if (state.quality + preview.qualityGain >= resolvedObjective.qualityTarget || qualityRatio >= config.byregotQuality) {
            return pick('byregotsBlessing')
          }
        }
        if (state.innerQuiet < 10 || qualityWanted) return first('preciseTouch', 'delicateSynthesis', 'tricksOfTheTrade')
        if (progressWanted) return first('intensiveSynthesis', 'preciseTouch', 'tricksOfTheTrade')
        return first('preciseTouch', 'tricksOfTheTrade')
      }

      if (state.condition === 'goodOmen' && qualityWanted) {
        if (
          state.innerQuiet === 10
          && state.buffs.greatStrides === 0
          && state.cp >= previewAction(recipe, crafter, state, 'greatStrides').cpCost + 24
          && can('greatStrides')
        ) return pick('greatStrides')
        if (
          memory.innovationUses < config.maxInnovation
          && state.buffs.innovation <= 1
          && can('innovation')
        ) return pick('innovation')
      }

      if (state.condition === 'primed') {
        if (
          memory.manipulationUses < config.maxManipulation
          && state.buffs.manipulation <= 2
          && state.durability <= 30
          && can('manipulation')
        ) return pick('manipulation')
        if (
          progressWanted
          && config.useVeneration
          && state.buffs.veneration === 0
          && can('veneration')
        ) return pick('veneration')
        if (
          qualityWanted
          && memory.innovationUses < config.maxInnovation
          && state.buffs.innovation <= 1
          && can('innovation')
        ) return pick('innovation')
      }

      if (state.condition === 'pliant') {
        if (
          memory.manipulationUses < config.maxManipulation
          && state.durability <= 25
          && state.buffs.manipulation <= 2
          && can('manipulation')
        ) return pick('manipulation')
        const canUseSecondWasteNot = config.secondWasteNot !== 'never'
        if (
          memory.wasteNotUses < config.maxWasteNot
          && (memory.wasteNotUses === 0 || canUseSecondWasteNot)
          && state.buffs.wasteNot <= 1
          && can('wasteNot2')
        ) return pick('wasteNot2')
        if (qualityWanted && memory.innovationUses < config.maxInnovation && state.buffs.innovation <= 1 && can('innovation')) {
          return pick('innovation')
        }
      }

      // At the narrow second-recovery boundary, one durability-free quality
      // action can turn the otherwise idle setup turn into useful output. The
      // last-action guard makes this a one-step bridge: the following decision
      // returns to Manipulation instead of repeating Finesse on another Normal.
      if (
        memory.manipulationUses === 1
        && memory.lastAction !== 'trainedFinesse'
        && state.condition === 'normal'
        && state.innerQuiet === 10
        && state.buffs.manipulation === 0
        && state.durability <= 20
        && (state.durability > 10 || !can('trainedPerfection'))
        && can('manipulation')
        && can('trainedFinesse')
      ) return pick('trainedFinesse')

      if (state.durability <= 10) {
        if (state.buffs.manipulation > 0) {
          if (qualityWanted && state.innerQuiet === 10 && can('trainedFinesse')) return pick('trainedFinesse')
          if (qualityWanted && memory.innovationUses < config.maxInnovation && state.buffs.innovation <= 1 && can('innovation')) {
            return pick('innovation')
          }
          if (progressWanted && config.useVeneration && state.buffs.veneration === 0 && can('veneration')) return pick('veneration')
        }
        if (state.trainedPerfectionAvailable && can('trainedPerfection')) return pick('trainedPerfection')
        if (memory.manipulationUses < config.maxManipulation && state.buffs.manipulation === 0 && can('manipulation')) {
          return pick('manipulation')
        }
        if (can('mastersMend')) return pick('mastersMend')
      }

      if (
        memory.manipulationUses < config.maxManipulation
        && state.buffs.manipulation === 0
        && state.durability <= 20
        && can('manipulation')
      ) return pick('manipulation')

      const secondWasteAllowed = memory.wasteNotUses === 0
        || config.secondWasteNot === 'always'
        || config.secondWasteNot === 'pliant' && state.condition === 'pliant'
      if (
        memory.wasteNotUses < config.maxWasteNot
        && secondWasteAllowed
        && state.buffs.wasteNot === 0
        && can('wasteNot2')
      ) return pick('wasteNot2')

      if (
        qualityWanted
        && memory.innovationUses < config.maxInnovation
        && state.buffs.innovation <= 1
        && can('innovation')
      ) return pick('innovation')

      if (
        qualityWanted
        && state.innerQuiet >= 8
        && qualityRatio >= config.greatStridesQuality
        && memory.greatStridesUses < config.maxGreatStrides
        && state.buffs.greatStrides === 0
        && (state.buffs.innovation > 0 || (
          config.useSpecialistFinisher
          && config.allowSpecialistActions
          && crafter.specialist === true
          && state.innerQuiet === 10
          && state.quickInnovationAvailable
        ))
        && state.cp >= previewAction(recipe, crafter, state, 'greatStrides').cpCost + 24
        && can('greatStrides')
      ) return pick('greatStrides')

      if (state.buffs.greatStrides > 0 && qualityWanted) {
        if (can('byregotsBlessing')) {
          const preview = previewAction(recipe, crafter, state, 'byregotsBlessing')
          if (state.quality + preview.qualityGain >= resolvedObjective.qualityTarget || qualityRatio >= config.byregotQuality) {
            return pick('byregotsBlessing')
          }
        }
        return first('preparatoryTouch', 'trainedFinesse', 'prudentTouch', 'hastyTouch')
      }

      if (qualityWanted) {
        if (
          state.buffs.expedience > 0
          && config.daringMode !== 'never'
          && (config.daringMode === 'always' || state.condition === 'centered')
        ) return first('daringTouch', 'hastyTouch')
        if (state.condition === 'centered') return first('hastyTouch', 'daringTouch', 'trainedFinesse')
        if (state.condition === 'sturdy' || state.buffs.wasteNot > 0) {
          if (state.cp < config.freeQualityCpFloor) {
            return first('hastyTouch', 'daringTouch', 'preparatoryTouch', 'trainedFinesse')
          }
          return first('preparatoryTouch', 'hastyTouch', 'trainedFinesse')
        }
        if (state.innerQuiet === 10 && state.buffs.innovation > 0) {
          if (state.cp < config.freeQualityCpFloor) return first('hastyTouch', 'trainedFinesse')
          return first('trainedFinesse', 'hastyTouch')
        }
        return first('hastyTouch', 'prudentTouch', 'basicTouch')
      }

      if (progressWanted) {
        if (state.condition === 'malleable') {
          if (
            !config.consumeMalleableBeforeVeneration
            && config.useVeneration
            && state.buffs.veneration === 0
            && can('veneration')
          ) return pick('veneration')
          return first('rapidSynthesis', 'groundwork', 'carefulSynthesis')
        }
        if (state.condition === 'centered') {
          return first('rapidSynthesis', 'carefulSynthesis')
        }
        if (config.delicateMode !== 'never' && qualityRatio < 0.88) {
          return first('rapidSynthesis', 'delicateSynthesis', 'carefulSynthesis')
        }
        return first('rapidSynthesis', 'carefulSynthesis', 'prudentSynthesis')
      }

      if (config.delicateMode !== 'never' && can('delicateSynthesis')) {
        if (config.delicateMode === 'balanced' || progressRatio >= 0.82 && qualityRatio >= 0.82) {
          return pick('delicateSynthesis')
        }
      }
    if (state.innerQuiet < 10) return first('hastyTouch', 'rapidSynthesis', 'prudentTouch')
    if (state.buffs.innovation > 0) return first('trainedFinesse', 'hastyTouch', 'rapidSynthesis')
    return first('rapidSynthesis', 'hastyTouch', 'trainedFinesse')
  }

  return {
    policy,
    snapshot: () => cloneGuideIntegratedDecisionMemory(memory),
  }
}

export function createGuideIntegratedPolicyFactory(
  config: Readonly<GuideIntegratedPolicyConfig> = DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  objective?: Readonly<CraftObjective>,
): () => EpisodePolicy {
  return () => createGuideIntegratedPolicyController(config, undefined, objective).policy
}

export function deriveGuideIntegratedPhase(
  recipe: RecipeProfile,
  state: CraftState,
  objective?: Readonly<CraftObjective>,
): CraftPhase {
  const { qualityTarget } = resolveGuideObjective(recipe, objective)
  if (state.step === 1) return 'opener'
  if (state.quality >= qualityTarget) return 'complete-synthesis'

  const progressRatio = state.progress / recipe.progressRequired
  const effectiveDurability = state.durability
    + state.buffs.manipulation * 5
    + (state.trainedPerfectionAvailable || state.trainedPerfectionActive ? 10 : 0)
  if (effectiveDurability <= 10) return 'recovery'
  if (progressRatio < 0.55) return 'secure-progress'
  if (state.innerQuiet < 10) return 'build-inner-quiet'
  if (effectiveDurability <= 20) return 'maintain-resources'
  if (state.buffs.innovation > 0 || state.buffs.greatStrides > 0) return 'quality-finisher'
  return 'prepare-quality-burst'
}

function guideIntegratedReason(
  state: CraftState,
  phase: CraftPhase,
  action: CraftActionId,
): RecommendationReasonCode {
  if (phase === 'complete-synthesis') return 'complete-craft'
  if (state.step === 1 && action === 'reflect') return 'open-with-reflect'
  if (state.condition === 'good' && action === 'preciseTouch') return 'condition-good-quality'
  if (state.condition === 'good' && action === 'tricksOfTheTrade') return 'condition-good-cp'
  if (state.condition === 'good' && action === 'intensiveSynthesis') return 'condition-good-progress'
  if (state.condition === 'pliant' && ACTIONS[action].cpCost > 0) return 'condition-pliant-value'
  if (state.condition === 'malleable' && ACTIONS[action].category === 'progress') {
    return 'condition-malleable-progress'
  }
  if (state.condition === 'centered' && ACTIONS[action].successRate < 1) {
    return 'condition-centered-risk'
  }
  if (state.condition === 'sturdy' && ACTIONS[action].durabilityCost > 0) return 'condition-sturdy-value'
  if (state.condition === 'goodOmen' && ACTIONS[action].category === 'buff') return 'condition-good-omen-setup'
  if (state.condition === 'primed' && ACTIONS[action].category === 'buff') return 'condition-primed-value'
  if (ACTIONS[action].category === 'repair') return 'restore-durability'
  if (action === 'trainedPerfection') return 'protect-next-durability'
  if (action === 'manipulation' || action === 'wasteNot' || action === 'wasteNot2') {
    return 'maintain-durability'
  }
  if (action === 'veneration') return 'activate-progress-buff'
  if (action === 'innovation' || action === 'greatStrides' || action === 'quickInnovation') {
    return 'activate-quality-buff'
  }
  if (action === 'carefulObservation' || action === 'observe') return 'lookahead-quality-route'
  if (action === 'byregotsBlessing') return 'quality-finisher'
  if (ACTIONS[action].category === 'progress') return 'secure-progress'
  if (ACTIONS[action].category === 'quality') return 'lookahead-quality-route'
  if (phase === 'build-inner-quiet') return 'build-inner-quiet'
  return 'bounded-guide-fallback'
}

/**
 * Pure runtime entrypoint. Memory is supplied by the caller from actual session
 * history; the controller's internal recommendation snapshot is discarded.
 */
export function recommendGuideIntegratedAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: GuideIntegratedRuntimeOptions = {},
): GuideIntegratedRuntimeRecommendation | null {
  if (state.terminal !== 'none') return null
  const now = options.now ?? Date.now
  const deadlineMs = options.deadlineMs ?? DEFAULT_GUIDE_RECOMMENDATION_DEADLINE_MS
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > 3_000) {
    throw new RangeError('deadlineMs must be positive and no greater than 3000')
  }
  const resolvedObjective = resolveGuideObjective(recipe, options.objective)
  const configured = options.config ?? (resolvedObjective.adaptiveCompletion
    ? DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG
    : DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG)
  const actualActionHistoryIsComplete = options.actualActionHistory !== undefined
    && options.actualActionHistory.filter((action) => ACTIONS[action].noStep !== true).length
      === Math.max(0, state.step - 1)
  const config: GuideIntegratedPolicyConfig = {
    ...configured,
    // A resynced state may no longer have a complete action path. In that
    // case actionUses is not a trustworthy time budget, so keep the safe
    // completion policy but disable the optional extra-quality route.
    adaptiveGoodQualityExtensionActionBudget: actualActionHistoryIsComplete
      ? configured.adaptiveGoodQualityExtensionActionBudget
      : 0,
    boundedRiskMaxWallClockMs: Math.min(configured.boundedRiskMaxWallClockMs, deadlineMs),
  }
  if (options.decisionMemory !== undefined && options.actualActionHistory !== undefined) {
    throw new Error('provide decisionMemory or actualActionHistory, not both')
  }
  const memory = options.decisionMemory
    ?? (options.actualActionHistory === undefined
      ? createGuideIntegratedDecisionMemory()
      : rebuildGuideIntegratedDecisionMemory(options.actualActionHistory))
  const startedAt = now()
  const controller = createGuideIntegratedPolicyController(config, memory, options.objective)
  const action = controller.policy(recipe, crafter, state)
  if (action === null) return null
  const elapsedMs = Math.max(0, now() - startedAt)
  const phase = deriveGuideIntegratedPhase(recipe, state, options.objective)
  return {
    action,
    phase,
    reason: guideIntegratedReason(state, phase, action),
    policyVersion: options.policyVersion ?? (resolvedObjective.adaptiveCompletion
      ? NAILS_GUIDE_INTEGRATED_POLICY_VERSION
      : GUIDE_INTEGRATED_POLICY_VERSION),
    decisionMemoryVersion: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
    elapsedMs,
    deadlineExceeded: elapsedMs >= deadlineMs,
  }
}
