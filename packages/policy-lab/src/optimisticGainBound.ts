import {
  ACTION_IDS,
  EMPIRICAL_QUALITY_CORRECTIONS,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import { assertPlannerContext, type PlannerContext } from './routeOptionController'

export const OPTIMISTIC_GAIN_BOUND_VERSION = 'optimistic-action-gain-relaxation-v0.1.0'

export interface OptimisticActionGain {
  action: CraftActionId
  progressGainUpper: number
  qualityGainUpper: number
}

export interface OptimisticGainBoundResult {
  version: typeof OPTIMISTIC_GAIN_BOUND_VERSION
  horizon: number
  progressRemaining: number
  qualityMaximum: number
  completionPossibleUnderRelaxation: boolean
  maximumQualityUpperBound: number | null
  qualityMaximumStatus: 'provably-unreachable-under-relaxation' | 'not-ruled-out'
  actionGains: readonly OptimisticActionGain[]
  relaxation: readonly [
    'all-actions-succeed',
    'best-supported-condition-per-gain',
    'maximum-quality-and-progress-buffs-preactive',
    'maximum-inner-quiet',
    'ignore-cp-durability-setup-and-one-use-limits',
    'repeat-any-gain-action',
  ]
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer`)
  return value
}

function optimisticState(
  context: Readonly<PlannerContext>,
  initialState: Readonly<CraftState>,
  condition: CraftState['condition'],
): CraftState {
  const base = createInitialCraftState(context.recipe, context.crafter)
  return {
    ...base,
    step: 1,
    progress: initialState.progress,
    quality: initialState.quality,
    durability: context.recipe.durabilityMax,
    cp: context.crafter.maxCp,
    condition,
    innerQuiet: 10,
    buffs: {
      wasteNot: 0,
      veneration: 1,
      greatStrides: 1,
      innovation: 1,
      finalAppraisal: 0,
      manipulation: 1,
      muscleMemory: 1,
      expedience: 1,
    },
    comboFrom: 'basicTouch',
    trainedPerfectionAvailable: true,
    trainedPerfectionActive: true,
    carefulObservationUsesLeft: context.crafter.specialist === true ? 3 : 0,
    heartAndSoulAvailable: context.crafter.specialist === true,
    heartAndSoulActive: context.crafter.specialist === true,
    quickInnovationAvailable: context.crafter.specialist === true,
    terminal: 'none',
    failureReason: null,
  }
}

/**
 * Computes per-action gains in a strict relaxation of live mechanics. Progress
 * and quality maxima may even come from different conditions, which only makes
 * the resulting completion-quality value more optimistic and therefore safe
 * as an upper bound.
 */
export function optimisticActionGains(
  context: Readonly<PlannerContext>,
  initialState: Readonly<CraftState>,
): readonly OptimisticActionGain[] {
  assertPlannerContext(context)
  const conditions = context.recipe.availableConditions
  return ACTION_IDS.flatMap((action) => {
    let progressGainUpper = 0
    let qualityGainUpper = 0
    let gainActionIsLegal = false
    for (const condition of conditions) {
      const state = optimisticState(context, initialState, condition)
      const preview = previewAction(context.recipe, context.crafter, state, action)
      if (!preview.legal) continue
      if (preview.progressGain > 0 || preview.qualityGain > 0) gainActionIsLegal = true
      progressGainUpper = Math.max(progressGainUpper, preview.progressGain)
      qualityGainUpper = Math.max(qualityGainUpper, preview.qualityGain)
    }
    for (const correction of EMPIRICAL_QUALITY_CORRECTIONS) {
      if (
        correction.recipeId === context.recipe.canonicalRecipeId
        && correction.control === context.crafter.control
        && correction.actionId === action
      ) qualityGainUpper = Math.max(qualityGainUpper, correction.observedGain)
    }
    return gainActionIsLegal
      ? [{ action, progressGainUpper, qualityGainUpper }]
      : []
  })
}

/**
 * Integer DP over an intentionally relaxed action set. A target below this
 * bound may still be impossible; a target above it is proven impossible within
 * the declared action horizon under the current mechanics formulas.
 */
export function calculateOptimisticGainBound(
  context: Readonly<PlannerContext>,
  initialState: Readonly<CraftState>,
  horizon: number,
): OptimisticGainBoundResult {
  assertPlannerContext(context)
  positiveInteger(horizon, 'horizon')
  const progressRemaining = Math.max(0, context.recipe.progressRequired - initialState.progress)
  const actionGains = optimisticActionGains(context, initialState)
  const impossible = Number.NEGATIVE_INFINITY
  let qualityByProgress = new Float64Array(progressRemaining + 1)
  qualityByProgress.fill(impossible)
  qualityByProgress[0] = 0

  for (let actionCount = 0; actionCount < horizon; actionCount += 1) {
    const next = qualityByProgress.slice()
    for (let progress = 0; progress <= progressRemaining; progress += 1) {
      const quality = qualityByProgress[progress]!
      if (quality === impossible) continue
      for (const gain of actionGains) {
        const nextProgress = Math.min(progressRemaining, progress + gain.progressGainUpper)
        next[nextProgress] = Math.max(next[nextProgress]!, quality + gain.qualityGainUpper)
      }
    }
    qualityByProgress = next
  }

  const additionalQuality = qualityByProgress[progressRemaining]!
  const completionPossibleUnderRelaxation = additionalQuality !== impossible
  const maximumQualityUpperBound = completionPossibleUnderRelaxation
    ? Math.min(context.recipe.qualityMax, initialState.quality + additionalQuality)
    : null
  const qualityMaximumStatus = maximumQualityUpperBound === null
    || maximumQualityUpperBound < context.recipe.qualityMax
    ? 'provably-unreachable-under-relaxation'
    : 'not-ruled-out'
  return {
    version: OPTIMISTIC_GAIN_BOUND_VERSION,
    horizon,
    progressRemaining,
    qualityMaximum: context.recipe.qualityMax,
    completionPossibleUnderRelaxation,
    maximumQualityUpperBound,
    qualityMaximumStatus,
    actionGains,
    relaxation: [
      'all-actions-succeed',
      'best-supported-condition-per-gain',
      'maximum-quality-and-progress-buffs-preactive',
      'maximum-inner-quiet',
      'ignore-cp-durability-setup-and-one-use-limits',
      'repeat-any-gain-action',
    ],
  }
}
