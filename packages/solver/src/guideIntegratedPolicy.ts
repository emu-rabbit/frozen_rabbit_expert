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

export const GUIDE_INTEGRATED_POLICY_VERSION = 'cosmic-titanium-guide-integrated-v1.0.0'
export const NAILS_GUIDE_INTEGRATED_POLICY_VERSION = 'cosmic-titanium-nails-guide-integrated-v1.1.0'
export type GuideIntegratedPolicyVersion =
  | typeof GUIDE_INTEGRATED_POLICY_VERSION
  | typeof NAILS_GUIDE_INTEGRATED_POLICY_VERSION
export const GUIDE_INTEGRATED_DECISION_MEMORY_VERSION = 'guide-integrated-decision-memory-v0.3.0'
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
  finisherSearchNodeLimit: number
  boundedRiskMaxWallClockMs: number
}

export const DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG: Readonly<GuideIntegratedPolicyConfig> = {
  earlyManipulation: true,
  maxWasteNot: 1,
  maxManipulation: 3,
  maxInnovation: 6,
  maxGreatStrides: 3,
  freeQualityCpFloor: 150,
  balanceTolerance: 0,
  greatStridesQuality: 0.7,
  byregotQuality: 0.95,
  daringMode: 'always',
  delicateMode: 'never',
  secondWasteNot: 'always',
  useVeneration: true,
  progressFloorBeforeQuality: 0,
  preferGoodIntensiveBeforeCashout: false,
  cashOutAtLowestQualityTier: false,
  finisherSearchNodeLimit: DEFAULT_GUIDE_FINISHER_NODE_LIMIT,
  boundedRiskMaxWallClockMs: DEFAULT_GUIDE_BOUNDED_RISK_WALL_CLOCK_MS,
}

export const DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG: Readonly<GuideIntegratedPolicyConfig> = {
  ...DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  freeQualityCpFloor: 100,
  progressFloorBeforeQuality: 0.7,
  preferGoodIntensiveBeforeCashout: true,
  cashOutAtLowestQualityTier: false,
}

export interface GuideIntegratedDecisionMemory {
  version: typeof GUIDE_INTEGRATED_DECISION_MEMORY_VERSION
  wasteNotUses: number
  manipulationUses: number
  innovationUses: number
  greatStridesUses: number
  lastAction: CraftActionId | null
}

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
    wasteNotUses: 0,
    manipulationUses: 0,
    innovationUses: 0,
    greatStridesUses: 0,
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
  return {
    version: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
    wasteNotUses: memory.wasteNotUses,
    manipulationUses: memory.manipulationUses,
    innovationUses: memory.innovationUses,
    greatStridesUses: memory.greatStridesUses,
    lastAction: memory.lastAction,
  }
}

/** Returns a new serializable memory after an action that was actually used. */
export function advanceGuideIntegratedDecisionMemory(
  memory: Readonly<GuideIntegratedDecisionMemory>,
  action: CraftActionId,
): GuideIntegratedDecisionMemory {
  const next = cloneGuideIntegratedDecisionMemory(memory)
  if (action === 'wasteNot' || action === 'wasteNot2') next.wasteNotUses += 1
  if (action === 'manipulation') next.manipulationUses += 1
  if (action === 'innovation') next.innovationUses += 1
  if (action === 'greatStrides') next.greatStridesUses += 1
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

      // Heart and Soul is held until Tricks is a genuine last-resort CP bridge.
      // The observed-state-only gate was the highest zero-paired-loss threshold
      // across all six development slices; broader Precise/Intensive uses and
      // higher CP thresholds changed otherwise successful routes.
      if (
        crafter.specialist === true
        && state.heartAndSoulActive
        && memory.lastAction === 'heartAndSoul'
        && can('tricksOfTheTrade')
      ) return pick('tricksOfTheTrade')
      if (
        crafter.specialist === true
        && state.condition !== 'good'
        && state.cp <= SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING
        && state.cp <= crafter.maxCp - 20
        && state.heartAndSoulAvailable
        && !state.heartAndSoulActive
        && can('heartAndSoul')
      ) return pick('heartAndSoul')

      if (state.step === 1) return first('reflect', 'muscleMemory')

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

      // Score crafts need an explicit progress reserve before the main quality
      // spend. The old ratio-only guide could keep choosing quality while both
      // progressWanted and qualityWanted were true, exhaust every recovery,
      // then stall thousands of progress short. Favor high-value condition
      // interrupts, but do not enter the unrestricted quality cycle before the
      // configured progress floor is secured.
      if (
        resolvedObjective.adaptiveCompletion
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
        const finishAction = progressFinisher()?.actions[0]
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
        && state.buffs.innovation > 0
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
          if (config.useVeneration && state.buffs.veneration === 0 && can('veneration')) return pick('veneration')
          return first('rapidSynthesis', 'groundwork', 'carefulSynthesis')
        }
        if (state.condition === 'centered') return first('rapidSynthesis', 'carefulSynthesis')
        if (config.delicateMode !== 'never' && qualityRatio < 0.88) return first('rapidSynthesis', 'delicateSynthesis', 'carefulSynthesis')
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
  if (ACTIONS[action].category === 'repair') return 'restore-durability'
  if (action === 'trainedPerfection') return 'protect-next-durability'
  if (action === 'manipulation' || action === 'wasteNot' || action === 'wasteNot2') {
    return 'maintain-durability'
  }
  if (action === 'veneration') return 'activate-progress-buff'
  if (action === 'innovation' || action === 'greatStrides') return 'activate-quality-buff'
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
  const config: GuideIntegratedPolicyConfig = {
    ...configured,
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
