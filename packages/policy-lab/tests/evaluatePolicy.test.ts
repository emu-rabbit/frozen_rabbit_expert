import { describe, expect, it } from 'vitest'
import {
  decidePromotion,
  type HeldOutPolicyResult,
  type RouteScore,
} from '../src'

function score(overrides: Partial<RouteScore> = {}): RouteScore {
  return {
    robustCompletionRate: 1,
    averageCompletionRate: 1,
    failureRate: 0,
    hardStopRate: 0,
    nonCompletionRate: 0,
    stopReasonRates: {
      completed: 1,
      failed: 0,
      'policy-null': 0,
      'no-legal-action': 0,
      'illegal-action': 0,
      'action-limit': 0,
    },
    lowerTailBalance: 1,
    averageBalance: 1,
    averageViableProgressRatio: 1,
    averageViableQualityRatio: 1,
    averageSuccessfulCp: 0,
    averageSuccessfulDurability: 0,
    averageSteps: 25,
    averageSuccessfulSteps: 25,
    ...overrides,
  }
}

function result(routeScore: RouteScore): HeldOutPolicyResult {
  return { score: routeScore, episodeCount: 1_000, safetyViolations: 0 }
}

describe('held-out policy promotion', () => {
  it('accepts a materially shorter route when near-perfect completion is preserved', () => {
    const baseline = result(score({
      averageSuccessfulCp: 100,
      averageSuccessfulDurability: 20,
    }))
    const candidate = result(score({
      averageSuccessfulSteps: 24,
      averageSteps: 24,
      averageSuccessfulCp: 0,
      averageSuccessfulDurability: 5,
    }))

    expect(decidePromotion(baseline, candidate)).toEqual({
      promote: true,
      reasons: [],
      basis: 'near-perfect-efficiency',
    })
  })

  it('does not trade observed completion away for a shorter route', () => {
    const baseline = result(score())
    const candidate = result(score({
      robustCompletionRate: 0.99,
      averageCompletionRate: 0.99,
      nonCompletionRate: 0.01,
      averageSuccessfulSteps: 20,
      averageSteps: 20,
      stopReasonRates: {
        completed: 0.99,
        failed: 0,
        'policy-null': 0,
        'no-legal-action': 0,
        'illegal-action': 0,
        'action-limit': 0.01,
      },
    }))

    const decision = decidePromotion(baseline, candidate)
    expect(decision.promote).toBe(false)
    expect(decision.basis).toBeNull()
    expect(decision.reasons).toContain('no-completion-or-near-perfect-efficiency-gain')
    expect(decision.reasons).toContain('stall-rate-regression')
  })
})
