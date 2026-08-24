import { describe, expect, it } from 'vitest'
import type { MatrixEpisodeRow } from './matrix'
import {
  attachExternalBaselineReport,
  buildMatrixPlan,
  comparePairedRows,
  completionContractForRequiredQuality,
  decidePairedStopping,
  distribution,
  parseMatrixCliOptions,
  selectPolicyEffectiveObjectiveTemplate,
} from './matrix'

describe('generic Cosmic family matrix plan', () => {
  it('keeps the default small preset bounded while crossing family, equipment, and world axes', () => {
    const options = parseMatrixCliOptions([])
    const plan = buildMatrixPlan(options)

    expect(options.preset).toBe('small')
    expect(options.equipmentIds).toHaveLength(3)
    expect(options.worldIds).toEqual(['balanced-iid', 'normal-heavy-iid'])
    expect(plan.mechanicsFamilyCount).toBe(50)
    expect(plan.evaluationScenarioCount).toBe(50)
    expect(plan.cases).toHaveLength(50 * 3 * 2)
    expect(plan.arms.map((arm) => `${arm.id}:${arm.risk}`)).toEqual([
      'candidate:balanced',
    ])
    expect(plan.budget.projectedEpisodes).toBe(300)
    expect(plan.budget.projectedRecommendationCallUpperBound).toBe(24_000)
    expect(plan.budget.projectedEpisodes).toBeLessThanOrEqual(plan.budget.configuredEpisodeCap)
    expect(new Set(plan.cases.map((evaluationCase) => evaluationCase.caseId)).size)
      .toBe(plan.cases.length)
  })

  it('builds deterministic paired seeds and a larger opt-in full preset', () => {
    const options = parseMatrixCliOptions(['--preset=full'])
    const first = buildMatrixPlan(options)
    const second = buildMatrixPlan(options)

    expect(first.matrixId).toBe(second.matrixId)
    expect(first.cases.map((evaluationCase) => evaluationCase.pairedSeed))
      .toEqual(second.cases.map((evaluationCase) => evaluationCase.pairedSeed))
    expect(first.cases).toHaveLength(50 * 3 * 4 * 4)
    expect(first.budget.projectedEpisodes).toBe(2_400)
    expect(first.cases.some((evaluationCase) => evaluationCase.world.role === 'adversarial')).toBe(true)
  })

  it('fails before execution when projected work exceeds the configured budget', () => {
    const options = parseMatrixCliOptions(['--max-episodes=299'])
    expect(() => buildMatrixPlan(options)).toThrow(/projects 300 episodes/)
  })

  it('supports a cheap candidate-only recipe probe and recipe-compatible all-Normal world', () => {
    const options = parseMatrixCliOptions([
      '--recipe=36282',
      '--equipment=buffed',
      '--world=all-normal',
      '--seed-count=2',
      '--no-baseline',
      '--max-episodes=2',
    ])
    const plan = buildMatrixPlan(options)

    expect(plan.arms.map((arm) => arm.id)).toEqual(['candidate'])
    expect(plan.cases).toHaveLength(2)
    for (const evaluationCase of plan.cases) {
      expect(evaluationCase.conditionProfile.weights.normal).toBe(1)
      expect(Object.entries(evaluationCase.conditionProfile.weights)
        .filter(([condition]) => condition !== 'normal')
        .every(([, weight]) => weight === 0)).toBe(true)
    }
  })

  it('prevents unbounded trace materialization', () => {
    const options = parseMatrixCliOptions(['--trace'])
    expect(() => buildMatrixPlan(options)).toThrow(/--trace is limited to 16 episodes/)
  })

  it('uses one policy-effective objective template per mechanics family', () => {
    const plan = buildMatrixPlan(parseMatrixCliOptions([]))
    const scenarioCountByFamily = new Map<string, number>()
    for (const scenario of plan.evaluationScenarios) {
      scenarioCountByFamily.set(
        scenario.family.familyId,
        (scenarioCountByFamily.get(scenario.family.familyId) ?? 0) + 1,
      )
    }

    expect([...scenarioCountByFamily.values()]).toHaveLength(50)
    expect([...scenarioCountByFamily.values()].every((count) => count === 1)).toBe(true)
    expect(plan.evaluationScenarios.every(
      (scenario) => scenario.recipeIds.length === scenario.family.recipeIds.length,
    )).toBe(true)

    const nailsTemplate = plan.evaluationScenarios.find(
      (scenario) => scenario.objectiveUtilityIdentity.qualityTarget === 27_100,
    )
    expect(nailsTemplate).toMatchObject({
      objectiveUtilityIdentity: { tierQualities: [16_440, 19_180, 24_660, 27_100] },
      objectiveTemplateEvidence: {
        sourceConfidence: 'verified',
        sourceKind: 'empirical',
        sourceMetadataVariantCount: 1,
      },
    })
    const commandBrewTemplate = plan.evaluationScenarios.find(
      (scenario) => scenario.objectiveUtilityIdentity.tierQualities.join(',')
        === '6000,7200,10200,12000',
    )
    expect(commandBrewTemplate?.objectiveTemplateEvidence).toMatchObject({
      sourceKind: 'empirical',
      sourceMetadataVariantCount: 1,
    })
    const samePolicyDifferentSource = plan.evaluationScenarios.find(
      (scenario) => scenario.objectiveUtilityIdentity.qualityTarget === 22_500,
    )
    expect(samePolicyDifferentSource?.objectiveTemplateEvidence).toMatchObject({
      sourceKind: 'empirical',
      sourceMetadataVariantCount: 2,
    })
  })

  it('fails closed if one mechanics family contains two policy-effective objectives', () => {
    expect(() => selectPolicyEffectiveObjectiveTemplate('family-fixture', [
      { signature: 'target-a', evidenceScore: 1, stableId: 1, value: 'a' },
      { signature: 'target-b', evidenceScore: 2, stableId: 2, value: 'b' },
    ])).toThrow(/conflicting policy-effective objectives/)
  })
})

function pairedRow(
  arm: 'baseline' | 'candidate',
  caseId: string,
  overrides: Partial<MatrixEpisodeRow> = {},
): MatrixEpisodeRow {
  return {
    arm,
    caseId,
    risk: 'balanced',
    evaluationScenarioId: 'evaluation-scenario-a',
    familyId: 'family-a',
    equipmentId: 'equipment-a',
    worldId: 'balanced-iid',
    terminal: 'completed',
    qualityTargetReached: true,
    voluntaryQualityFloorReached: true,
    quality: 10_000,
    completedObjectiveUtility: 1,
    actions: 30,
    ...overrides,
  } as MatrixEpisodeRow
}

describe('generic Cosmic family matrix summaries', () => {
  it('separates deliverable progress completion from hard required-quality completion', () => {
    expect(completionContractForRequiredQuality(0)).toBe('progress-only')
    expect(completionContractForRequiredQuality(1)).toBe('progress-and-required-quality')
    expect(() => completionContractForRequiredQuality(-1)).toThrow(/requiredQuality/)
  })

  it('includes failed episodes in the objective lower tail', () => {
    expect(distribution([1, 0.8, 0]).p10).toBe(0)
    expect(distribution([])).toEqual({
      count: 0,
      minimum: null,
      p10: null,
      median: null,
      p90: null,
      p95: null,
      p99: null,
      maximum: null,
      mean: null,
    })
  })

  it('reports paired completion regressions separately from quality wins', () => {
    const comparison = comparePairedRows('fixture', [
      pairedRow('baseline', 'case-a'),
      pairedRow('candidate', 'case-a', { quality: 10_500, actions: 28 }),
      pairedRow('baseline', 'case-b'),
      pairedRow('candidate', 'case-b', {
        terminal: 'none',
        stopReason: 'policy-null',
        qualityTargetReached: false,
        voluntaryQualityFloorReached: false,
        quality: 9_000,
        completedObjectiveUtility: 0,
      }),
    ])

    expect(comparison.completion).toEqual({ candidateOnly: 0, baselineOnly: 1, both: 1, neither: 0 })
    expect(comparison.completionRegressionCount).toBe(1)
    expect(comparison.completionRegressionCaseIds).toEqual(['case-b'])
    expect(comparison.completedQuality).toMatchObject({
      candidateWins: 1,
      candidateLosses: 0,
      compared: 1,
      meanCandidateDelta: 500,
    })
    expect(comparison.targetReachedActions).toMatchObject({
      candidateShorter: 1,
      compared: 1,
      meanCandidateDelta: -2,
    })
  })

  it('does not compare risk-specific voluntary floors across different risk preferences', () => {
    const comparison = comparePairedRows('different-risk', [
      pairedRow('baseline', 'case-a', { risk: 'stable' }),
      pairedRow('candidate', 'case-a', { risk: 'aggressive' }),
    ])

    expect(comparison.voluntaryFloorComparable).toBe(false)
    expect(comparison.voluntaryFloor).toBeNull()
  })

  it('stops when a bounded fixed look excludes the minimum material effect', () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => [
      pairedRow('baseline', `case-${index}`, { completedObjectiveUtility: 0.8 }),
      pairedRow('candidate', `case-${index}`, { completedObjectiveUtility: 0.8 }),
    ]).flat()

    const decision = decidePairedStopping(rows, {
      minimumMaterialEffect: 0.02,
      lookIndex: 1,
      maxLooks: 1,
    })

    expect(decision.decision).toBe('stop-no-material-signal')
    expect(decision.pairedNormalizedObjectiveUtility.lowerConfidenceBound).toBeGreaterThan(-0.02)
    expect(decision.pairedNormalizedObjectiveUtility.upperConfidenceBound).toBeLessThan(0.02)
  })

  it('keeps a materially positive candidate and vetoes any paired completion regression', () => {
    const positiveRows = Array.from({ length: 1_000 }, (_, index) => [
      pairedRow('baseline', `case-${index}`, { completedObjectiveUtility: 0.7 }),
      pairedRow('candidate', `case-${index}`, { completedObjectiveUtility: 0.8 }),
    ]).flat()
    const positive = decidePairedStopping(positiveRows, {
      minimumMaterialEffect: 0.02,
      lookIndex: 1,
      maxLooks: 1,
    })
    expect(positive.decision).toBe('keep')
    expect(positive.reason).toBe('candidate-lower-bound-clears-material-effect')

    const vetoed = decidePairedStopping([
      pairedRow('baseline', 'case-a'),
      pairedRow('candidate', 'case-a', {
        terminal: 'none',
        stopReason: 'policy-null',
        completedObjectiveUtility: 0,
      }),
    ], {
      minimumMaterialEffect: 0.02,
      lookIndex: 1,
      maxLooks: 8,
    })
    expect(vetoed.decision).toBe('reject')
    expect(vetoed.reason).toBe('completion-regression-veto')
    expect(vetoed.completionRegressionVeto).toMatchObject({ triggered: true, count: 1 })
  })

  it('imports a frozen same-risk report as a solver-version baseline', () => {
    const shared = {
      schemaVersion: 'generic-cosmic-family-development-matrix-v1',
      catalogVersion: 'catalog-v1',
      mechanicsVersion: 'mechanics-v1',
    }
    const baseline = {
      ...shared,
      matrixId: 'matrix-baseline',
      policyVersion: 'policy-v1',
      comparisonRows: [pairedRow('candidate', 'case-a', { completedObjectiveUtility: 0.7 })],
    }
    const current = {
      ...shared,
      matrixId: 'matrix-candidate',
      policyVersion: 'policy-v2',
      comparisonRows: [pairedRow('candidate', 'case-a', { completedObjectiveUtility: 0.8 })],
    }

    const report = attachExternalBaselineReport(current, baseline, {
      minimumMaterialEffect: 0.02,
      lookIndex: 1,
      maxLooks: 8,
    })

    expect(report.comparisonKind).toBe('solver-version-ab')
    expect(report.externalBaseline).toMatchObject({
      policyVersion: 'policy-v1',
      candidatePolicyVersion: 'policy-v2',
      exactCaseIdentityMatch: true,
    })
    expect(report.stoppingDecision).toMatchObject({
      decision: 'continue',
      pairs: 1,
    })
  })
})
