import { describe, expect, it } from 'vitest'
import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import {
  GUIDE_CONTINUATION_PLANNER_VERSION,
  advanceGuideIntegratedDecisionMemory,
  applyConservativeGuideImprovementGate,
  createGuideIntegratedDecisionMemory,
  selectConservativeGuideImprovement,
  type GuideContinuationCandidateEvaluation,
  type GuideContinuationPlan,
  type RouteScore,
} from '../src'

function score(overrides: Partial<RouteScore> = {}): RouteScore {
  return {
    robustCompletionRate: 0,
    averageCompletionRate: 0,
    failureRate: 0,
    hardStopRate: 0,
    nonCompletionRate: 1,
    stopReasonRates: {
      completed: 0,
      failed: 0,
      'policy-null': 0,
      'no-legal-action': 0,
      'illegal-action': 0,
      'action-limit': 1,
    },
    lowerTailBalance: 0,
    averageBalance: 0,
    averageViableProgressRatio: 0,
    averageViableQualityRatio: 0,
    averageSuccessfulCp: 0,
    averageSuccessfulDurability: 0,
    averageSteps: 1,
    averageSuccessfulSteps: null,
    ...overrides,
  }
}

function candidate(
  action: CraftActionId,
  routeScore: RouteScore,
  episodeCount = 12,
): GuideContinuationCandidateEvaluation {
  const memory = advanceGuideIntegratedDecisionMemory(
    createGuideIntegratedDecisionMemory(),
    action,
  )
  return {
    action,
    score: routeScore,
    episodeCount,
    decisionMemoryAfterAction: memory,
    endingDecisionMemories: [],
    completionOutcomes: Array.from({ length: episodeCount }, (_, index) => ({
      profileId: `profile-${index % 3}`,
      sample: Math.floor(index / 3),
      pairedSeed: index + 1,
      completed: index < Math.round(routeScore.averageCompletionRate * episodeCount),
    })),
  }
}

function plan(
  proposed: GuideContinuationCandidateEvaluation,
  alternatives: readonly GuideContinuationCandidateEvaluation[],
): GuideContinuationPlan {
  return {
    version: GUIDE_CONTINUATION_PLANNER_VERSION,
    action: proposed.action,
    score: proposed.score,
    alternatives,
    startingDecisionMemory: createGuideIntegratedDecisionMemory(),
    decisionMemoryAfterAction: proposed.decisionMemoryAfterAction,
    endingDecisionMemories: proposed.endingDecisionMemories,
    completionOutcomes: proposed.completionOutcomes,
    episodeCountPerCandidate: proposed.episodeCount,
    evidence: proposed.score.averageCompletionRate > 0
      ? 'completion-supported'
      : 'finishability-surrogate',
  }
}

describe('conservative guide improvement gate', () => {
  it('allows a deviation only for strict paired completion improvement without robust loss', () => {
    const proposed = candidate('wasteNot2', score({
      averageCompletionRate: 0.75,
      robustCompletionRate: 0.5,
    }), 20)
    const guide = candidate('manipulation', score({
      averageCompletionRate: 0.5,
      robustCompletionRate: 0.5,
    }), 20)
    const decision = selectConservativeGuideImprovement(plan(proposed, [guide]), guide.action)

    expect(decision).toMatchObject({
      selectedAction: proposed.action,
      deviatedFromGuide: true,
      reason: 'strict-completion-improvement',
      averageCompletionDelta: 0.25,
      robustCompletionDelta: 0,
      pairedCandidateOnlyWins: 5,
      pairedGuideOnlyWins: 0,
    })
  })

  it('retains the guide when average completion evidence is tied', () => {
    const proposed = candidate('wasteNot2', score({
      averageCompletionRate: 0.5,
      robustCompletionRate: 0.5,
      averageBalance: 0.8,
    }))
    const guide = candidate('manipulation', score({
      averageCompletionRate: 0.5,
      robustCompletionRate: 0.5,
      averageBalance: 0.4,
    }))
    const gated = applyConservativeGuideImprovementGate(plan(proposed, [guide]), guide.action)

    expect(gated?.gate.reason).toBe('no-strict-completion-improvement')
    expect(gated?.action).toBe(guide.action)
    expect(gated?.alternatives[0]?.action).toBe(proposed.action)
    expect(gated?.decisionMemoryAfterAction.manipulationUses).toBe(1)
    expect(gated?.decisionMemoryAfterAction.wasteNotUses).toBe(0)
  })

  it('retains the guide when average completion improves but robust completion regresses', () => {
    const proposed = candidate('wasteNot2', score({
      averageCompletionRate: 0.75,
      robustCompletionRate: 0.25,
    }))
    const guide = candidate('manipulation', score({
      averageCompletionRate: 0.5,
      robustCompletionRate: 0.5,
    }))
    const decision = selectConservativeGuideImprovement(plan(proposed, [guide]), guide.action)

    expect(decision).toMatchObject({
      selectedAction: guide.action,
      deviatedFromGuide: false,
      reason: 'robust-completion-regression',
      robustCompletionDelta: -0.25,
    })
  })

  it('rejects mismatched episode counts as unpaired evidence', () => {
    const proposed = candidate('wasteNot2', score({
      averageCompletionRate: 0.75,
      robustCompletionRate: 0.5,
    }), 12)
    const guide = candidate('manipulation', score({
      averageCompletionRate: 0.5,
      robustCompletionRate: 0.5,
    }), 9)
    const decision = selectConservativeGuideImprovement(plan(proposed, [guide]), guide.action)

    expect(decision).toMatchObject({
      selectedAction: guide.action,
      deviatedFromGuide: false,
      reason: 'unpaired-candidate-evidence',
    })
  })

  it('retains the guide when an apparent improvement has too few paired wins', () => {
    const proposed = candidate('wasteNot2', score({
      averageCompletionRate: 0.75,
      robustCompletionRate: 0.5,
    }), 12)
    const guide = candidate('manipulation', score({
      averageCompletionRate: 0.5,
      robustCompletionRate: 0.5,
    }), 12)
    const decision = selectConservativeGuideImprovement(plan(proposed, [guide]), guide.action)

    expect(decision).toMatchObject({
      selectedAction: guide.action,
      deviatedFromGuide: false,
      reason: 'insufficient-paired-completion-evidence',
      pairedCandidateOnlyWins: 3,
      pairedGuideOnlyWins: 0,
    })
  })
})
