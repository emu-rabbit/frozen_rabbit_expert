import { describe, expect, it } from 'vitest'
import type { FixedTapeClairvoyantSearchResult } from '../src'
import { assessPathwiseCapabilityHeadroom } from '../src'

function reference(
  overrides: Partial<FixedTapeClairvoyantSearchResult>,
): FixedTapeClairvoyantSearchResult {
  return {
    version: 'fixed-tape-clairvoyant-search-v0.1.0',
    evidence: 'clairvoyant-fixed-tape-feasible-witness-not-causal-policy',
    seed: 1,
    beamWidth: 32,
    maxActions: 4,
    witness: null,
    bestOpenState: null,
    qualityMaximumReachable: false,
    completionReachable: false,
    objectiveScoreSaturated: false,
    frontierTruncated: true,
    exhaustiveWithinFixedTapeHorizon: false,
    stoppedAtQualityMaximum: false,
    expandedNodes: 1,
    candidateTransitions: 1,
    uniqueStatesKept: 1,
    maximumFrontierSize: 1,
    incumbentRouteEvaluated: false,
    ...overrides,
  }
}

describe('capability headroom assessment', () => {
  it('separates sample target saturation from equipment-wide limits', () => {
    const result = assessPathwiseCapabilityHeadroom(
      { terminal: 'completed', quality: 10_000 },
      10_000,
      reference({}),
    )
    expect(result.classification).toBe('sample-quality-maximum-saturated')
    expect(result.equipmentLimitEvidence).toBe('objective-cap-reached-on-this-sample')
  })

  it('labels a clairvoyant target route as existence, not causal evidence', () => {
    const result = assessPathwiseCapabilityHeadroom(
      { terminal: 'none', quality: 5_000 },
      10_000,
      reference({
        witness: {
          actions: ['basicSynthesis'],
          finalState: { terminal: 'completed', quality: 10_000 } as never,
          qualityMaximumReached: true,
          successDrawsConsumed: 1,
          conditionDrawsConsumed: 1,
        },
        qualityMaximumReachable: true,
        completionReachable: true,
        objectiveScoreSaturated: true,
      }),
    )
    expect(result.classification).toBe('clairvoyant-quality-maximum-headroom')
    expect(result.causalPolicyHeadroom).toBe('not-established')
    expect(result.witnessedObjectiveUtilityGap).toBe(1)
  })

  it('uses exact fixed-tape horizon language only when no frontier was truncated', () => {
    const result = assessPathwiseCapabilityHeadroom(
      { terminal: 'none', quality: 0 },
      10_000,
      reference({ frontierTruncated: false, exhaustiveWithinFixedTapeHorizon: true }),
    )
    expect(result.classification).toBe('fixed-tape-horizon-infeasible')
    expect(result.equipmentLimitEvidence).toBe('exact-only-for-fixed-tape-and-horizon')
  })
})
