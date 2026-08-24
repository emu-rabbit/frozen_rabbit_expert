import type { CraftState } from '@frozen-rabbit-expert/domain'
import type { FixedTapeClairvoyantSearchResult } from './fixedTapeClairvoyantSearch'

export const CAPABILITY_HEADROOM_ASSESSMENT_VERSION = 'capability-headroom-assessment-v0.1.0'

export type PathwiseHeadroomClassification =
  | 'sample-target-saturated'
  | 'clairvoyant-target-headroom'
  | 'clairvoyant-completion-headroom'
  | 'clairvoyant-quality-headroom'
  | 'fixed-tape-horizon-saturated'
  | 'fixed-tape-horizon-infeasible'
  | 'search-inconclusive'

export interface PathwiseBaselineOutcome {
  terminal: CraftState['terminal']
  quality: number
}

export interface PathwiseHeadroomAssessment {
  version: typeof CAPABILITY_HEADROOM_ASSESSMENT_VERSION
  classification: PathwiseHeadroomClassification
  baselineObjectiveUtility: number
  optimisticObjectiveUtility: number | null
  witnessedObjectiveUtilityGap: number | null
  causalPolicyHeadroom: 'none-for-raw-objective-on-this-sample' | 'not-established'
  equipmentLimitEvidence:
    | 'objective-cap-reached-on-this-sample'
    | 'exact-only-for-fixed-tape-and-horizon'
    | 'not-established'
  explanation: string
}

function objectiveUtility(outcome: Readonly<PathwiseBaselineOutcome>, qualityTarget: number): number {
  return outcome.terminal === 'completed'
    ? Math.max(0, Math.min(1, outcome.quality / qualityTarget))
    : 0
}

/**
 * Interprets a causal baseline beside a future-aware fixed-tape search. The
 * optimistic route is a feasible mechanics witness, but cannot by itself show
 * that a live policy can choose the same branches without seeing the future.
 */
export function assessPathwiseCapabilityHeadroom(
  baseline: Readonly<PathwiseBaselineOutcome>,
  qualityTarget: number,
  reference: Readonly<FixedTapeClairvoyantSearchResult>,
): PathwiseHeadroomAssessment {
  if (!Number.isSafeInteger(qualityTarget) || qualityTarget <= 0) {
    throw new RangeError('qualityTarget must be a positive safe integer')
  }
  const baselineObjectiveUtility = objectiveUtility(baseline, qualityTarget)
  const optimisticObjectiveUtility = reference.witness === null
    ? null
    : objectiveUtility(reference.witness.finalState, qualityTarget)
  const witnessedObjectiveUtilityGap = optimisticObjectiveUtility === null
    ? null
    : Math.max(0, optimisticObjectiveUtility - baselineObjectiveUtility)

  if (baselineObjectiveUtility >= 1) {
    return {
      version: CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
      classification: 'sample-target-saturated',
      baselineObjectiveUtility,
      optimisticObjectiveUtility,
      witnessedObjectiveUtilityGap: 0,
      causalPolicyHeadroom: 'none-for-raw-objective-on-this-sample',
      equipmentLimitEvidence: 'objective-cap-reached-on-this-sample',
      explanation: 'The causal policy already reached the declared quality target; raw score headroom is zero on this sample.',
    }
  }
  if (reference.objectiveTargetReachable) {
    return {
      version: CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
      classification: 'clairvoyant-target-headroom',
      baselineObjectiveUtility,
      optimisticObjectiveUtility,
      witnessedObjectiveUtilityGap,
      causalPolicyHeadroom: 'not-established',
      equipmentLimitEvidence: 'not-established',
      explanation: 'A future-aware route reaches the target on this tape, proving route existence but not causal policy attainability.',
    }
  }
  if (baseline.terminal !== 'completed' && reference.completionReachable) {
    return {
      version: CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
      classification: 'clairvoyant-completion-headroom',
      baselineObjectiveUtility,
      optimisticObjectiveUtility,
      witnessedObjectiveUtilityGap,
      causalPolicyHeadroom: 'not-established',
      equipmentLimitEvidence: 'not-established',
      explanation: 'A future-aware route completes where the causal baseline does not; the current route leaves pathwise completion headroom.',
    }
  }
  if ((witnessedObjectiveUtilityGap ?? 0) > 0) {
    return {
      version: CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
      classification: 'clairvoyant-quality-headroom',
      baselineObjectiveUtility,
      optimisticObjectiveUtility,
      witnessedObjectiveUtilityGap,
      causalPolicyHeadroom: 'not-established',
      equipmentLimitEvidence: 'not-established',
      explanation: 'A future-aware route completes at higher quality on this tape; converting that gap into a live policy remains unproven.',
    }
  }
  if (reference.exhaustiveWithinFixedTapeHorizon) {
    return {
      version: CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
      classification: baseline.terminal === 'completed'
        ? 'fixed-tape-horizon-saturated'
        : 'fixed-tape-horizon-infeasible',
      baselineObjectiveUtility,
      optimisticObjectiveUtility,
      witnessedObjectiveUtilityGap,
      causalPolicyHeadroom: baseline.terminal === 'completed'
        ? 'none-for-raw-objective-on-this-sample'
        : 'not-established',
      equipmentLimitEvidence: 'exact-only-for-fixed-tape-and-horizon',
      explanation: baseline.terminal === 'completed'
        ? 'Exhaustive search found no better route within this fixed tape and action horizon; this is not an equipment-wide proof.'
        : 'Exhaustive search found no completing route within this fixed tape and action horizon; other futures or a longer horizon remain outside the claim.',
    }
  }
  return {
    version: CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
    classification: 'search-inconclusive',
    baselineObjectiveUtility,
    optimisticObjectiveUtility,
    witnessedObjectiveUtilityGap,
    causalPolicyHeadroom: 'not-established',
    equipmentLimitEvidence: 'not-established',
    explanation: 'The bounded optimistic frontier was truncated before it could establish a target route or a fixed-horizon limit.',
  }
}
