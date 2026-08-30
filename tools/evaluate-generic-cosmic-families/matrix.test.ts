import { describe, expect, it } from 'vitest'
import type { MatrixEpisodeRow } from './matrix'
import {
  attachExternalBaselineReport,
  buildMatrixPlan,
  comparePairedRows,
  completionContractForRequiredQuality,
  decidePairedStopping,
  distribution,
  GENERIC_FAMILY_MATRIX_SCHEMA_VERSION,
  GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION,
  MAX_MATRIX_SEEDS_PER_CELL,
  parseMatrixCliOptions,
  runMigrationOracleEpisode,
  selectPolicyEffectiveObjectiveTemplate,
} from './matrix'

describe('generic Cosmic family matrix plan', () => {
  it('keeps the default small preset bounded while crossing family, equipment, and world axes', () => {
    const options = parseMatrixCliOptions([])
    const plan = buildMatrixPlan(options)

    expect(options.preset).toBe('small')
    expect(options.equipmentIds).toHaveLength(10)
    expect(options.worldIds).toEqual(['balanced-iid', 'normal-heavy-iid'])
    expect(plan.mechanicsFamilyCount).toBe(50)
    expect(plan.evaluationScenarioCount).toBe(50)
    expect(plan.cases).toHaveLength(50 * 10 * 2)
    expect(plan.arms.map((arm) => `${arm.id}:${arm.risk}`)).toEqual([
      'candidate:balanced',
    ])
    expect(plan.budget.projectedEpisodes).toBe(1_000)
    expect(plan.budget.projectedRecommendationCallUpperBound).toBe(80_000)
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
    expect(first.cases).toHaveLength(50 * 10 * 4 * 4)
    expect(first.budget.projectedEpisodes).toBe(8_000)
    expect(first.cases.some((evaluationCase) => evaluationCase.world.role === 'adversarial')).toBe(true)
  })

  it('fails before execution when projected work exceeds the configured budget', () => {
    const options = parseMatrixCliOptions(['--max-episodes=999'])
    expect(() => buildMatrixPlan(options)).toThrow(/projects 1000 episodes/)
  })

  it('fails closed on unknown, space-separated, empty, and duplicate CLI arguments', () => {
    expect(() => parseMatrixCliOptions(['--sead-count=2'])).toThrow(/unknown matrix option/)
    expect(() => parseMatrixCliOptions(['--seed-count', '2'])).toThrow(/--seed-count=<value>/)
    expect(() => parseMatrixCliOptions(['positional'])).toThrow(/unexpected positional argument/)
    expect(() => parseMatrixCliOptions(['--trace=true'])).toThrow(/is a flag/)
    expect(() => parseMatrixCliOptions(['--world='])).toThrow(/must not be empty/)
    expect(() => parseMatrixCliOptions([
      '--seed-count=1',
      '--seed-count=2',
    ])).toThrow(/duplicate matrix option/)
    expect(() => parseMatrixCliOptions([
      '--candidate-risk=balanced',
      '--risk=balanced',
    ])).toThrow(/cannot be used together/)
  })

  it('allows a bounded 512-seed focused family run while preserving the episode cap', () => {
    const options = parseMatrixCliOptions([
      '--preset=full',
      '--recipe=36282',
      '--equipment=unbuffed,buffed,specialist',
      `--seed-count=${MAX_MATRIX_SEEDS_PER_CELL}`,
      '--max-episodes=6144',
    ])
    const plan = buildMatrixPlan(options)

    expect(options.seedCount).toBe(512)
    expect(plan.cases).toHaveLength(1 * 3 * 4 * 512)
    expect(plan.budget.projectedEpisodes).toBe(6_144)
    expect(new Set(plan.cases.map((evaluationCase) => evaluationCase.pairedSeed)).size)
      .toBe(plan.cases.length)
    expect(() => parseMatrixCliOptions([
      `--seed-count=${MAX_MATRIX_SEEDS_PER_CELL + 1}`,
    ])).toThrow(/cannot exceed 512/)
  })

  it('binds base seed, equipment, world, and max steps into the paired case identity', () => {
    const common = [
      '--recipe=36282',
      '--equipment=buffed',
      '--world=balanced-iid',
      '--seed-count=1',
      '--max-episodes=1',
    ]
    const first = buildMatrixPlan(parseMatrixCliOptions([...common, '--base-seed=1']))
    const second = buildMatrixPlan(parseMatrixCliOptions([...common, '--base-seed=2']))
    const firstCase = first.cases[0]!
    const secondCase = second.cases[0]!

    expect(first.comparisonContract).toMatchObject({
      version: GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION,
      baseSeed: 1,
      maxStepsPerEpisode: 80,
      caseCount: 1,
    })
    expect(firstCase.caseId).toContain('base-seed:1')
    expect(firstCase.caseId).toContain(`equipment:${firstCase.equipment.id}@${firstCase.equipmentFingerprint}`)
    expect(firstCase.caseId).toContain(`world:${firstCase.world.id}@${firstCase.conditionWorldFingerprint}`)
    expect(firstCase.caseFingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(firstCase.caseId).not.toBe(secondCase.caseId)
    expect(firstCase.caseFingerprint).not.toBe(secondCase.caseFingerprint)
    expect(firstCase.pairedSeed).not.toBe(secondCase.pairedSeed)
    expect(first.comparisonContract.caseSetFingerprint)
      .not.toBe(second.comparisonContract.caseSetFingerprint)
  })

  it('focuses one canonical seed index for bounded same-tape trace replay', () => {
    const common = [
      '--recipe=36282',
      '--equipment=buffed',
      '--world=balanced-iid',
      '--base-seed=20260824',
    ]
    const focused = buildMatrixPlan(parseMatrixCliOptions([
      ...common,
      '--seed-index=53',
      '--trace',
      '--max-episodes=2',
    ]))
    const prefix = buildMatrixPlan(parseMatrixCliOptions([
      ...common,
      '--seed-count=54',
      '--max-episodes=54',
    ]))

    expect(focused.options.seedCount).toBe(1)
    expect(focused.options.seedIndex).toBe(53)
    expect(focused.cases).toHaveLength(1)
    expect(focused.cases[0]?.seedIndex).toBe(53)
    expect(focused.cases[0]?.pairedSeed).toBe(prefix.cases[53]?.pairedSeed)
    expect(focused.budget.projectedEpisodes).toBe(1)
    expect(() => parseMatrixCliOptions([
      '--seed-count=1',
      '--seed-index=0',
    ])).toThrow(/cannot be used together/)
    expect(() => parseMatrixCliOptions([
      `--seed-index=${MAX_MATRIX_SEEDS_PER_CELL}`,
    ])).toThrow(/must be below 512/)
  })

  it('keeps canonical paired seeds unique and invariant under matrix filtering', () => {
    const full = buildMatrixPlan(parseMatrixCliOptions([
      '--preset=full',
      '--equipment=unbuffed,buffed,specialist',
      '--seed-count=16',
      '--max-episodes=9600',
      '--base-seed=1234',
    ]))
    const focused = buildMatrixPlan(parseMatrixCliOptions([
      '--preset=full',
      '--recipe=36282',
      '--equipment=buffed',
      '--world=normal-heavy-iid',
      '--seed-count=1',
      '--max-episodes=1',
      '--base-seed=1234',
    ]))
    const focusedCase = focused.cases[0]!
    const matchingFullCase = full.cases.find((evaluationCase) => (
      evaluationCase.family.familyId === focusedCase.family.familyId
      && evaluationCase.equipment.id === focusedCase.equipment.id
      && evaluationCase.world.id === focusedCase.world.id
      && evaluationCase.seedIndex === focusedCase.seedIndex
    ))

    expect(new Set(full.cases.map((evaluationCase) => evaluationCase.pairedSeed)).size)
      .toBe(full.cases.length)
    expect(matchingFullCase?.pairedSeed).toBe(focusedCase.pairedSeed)
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

  it('replays the step-level migration oracle with exact semantic identity', () => {
    const plan = buildMatrixPlan(parseMatrixCliOptions([
      '--recipe=36282',
      '--equipment=buffed',
      '--world=balanced-iid',
      '--seed-count=1',
      '--no-baseline',
      '--max-episodes=1',
    ]))
    const first = runMigrationOracleEpisode(plan.cases[0]!, 'balanced')
    const second = runMigrationOracleEpisode(plan.cases[0]!, 'balanced')

    expect(second).toEqual(first)
    expect(first.recommendationCalls).toBe(first.actions.length + Number(
      first.stopReason === 'policy-null' || first.stopReason === 'no-legal-action',
    ))
    expect(first.steps).toHaveLength(first.actions.length)
    expect(first.finalCursor).toEqual(first.steps.at(-1)?.cursorAfter)
    expect(first.finalMemory).toBe(first.steps.at(-1)?.memoryAfter)
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
      (scenario) => scenario.recipeIds.includes(36_283),
    )
    expect(nailsTemplate).toMatchObject({
      objectiveUtilityIdentity: {
        tierQualities: [16_440, 19_180, 24_660, 27_400],
        missionRank: 'EX+',
      },
      objectiveTemplateEvidence: {
        sourceConfidence: 'verified',
        sourceKind: 'empirical',
        sourceMetadataVariantCount: 1,
      },
    })
    const commandBrewTemplate = plan.evaluationScenarios.find(
      (scenario) => scenario.recipeIds.includes(36_582),
    )
    expect(commandBrewTemplate?.objectiveUtilityIdentity.tierQualities)
      .toEqual([6_000, 7_200, 10_200, 12_000])
    expect(commandBrewTemplate?.objectiveTemplateEvidence).toMatchObject({
      sourceKind: 'empirical',
      sourceMetadataVariantCount: 1,
    })
    const samePolicyDifferentSource = plan.evaluationScenarios.find(
      (scenario) => scenario.recipeIds.includes(36_208),
    )
    expect(samePolicyDifferentSource?.objectiveUtilityIdentity).toMatchObject({
      qualityOutcome: 'hq-chance',
      tierQualities: [],
    })
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
    caseFingerprint: '0000000000000000',
    risk: 'balanced',
    evaluationScenarioId: 'evaluation-scenario-a',
    objectiveUtilitySignature: 'objective-a',
    familyId: 'family-a',
    recipeId: 1,
    equipmentId: 'equipment-a',
    equipmentFingerprint: '1111111111111111',
    worldId: 'balanced-iid',
    conditionWorldFingerprint: '2222222222222222',
    baseSeed: 0,
    maxSteps: 80,
    seedIndex: 0,
    pairedSeed: 0,
    terminal: 'completed',
    qualityMaximumReached: true,
    protectedQualityFloorReached: true,
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
        qualityMaximumReached: false,
        protectedQualityFloorReached: false,
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
    expect(comparison.qualityMaximumReachedActions).toMatchObject({
      candidateShorter: 1,
      compared: 1,
      meanCandidateDelta: -2,
    })
  })

  it('does not compare risk-specific protected floors across different risk preferences', () => {
    const comparison = comparePairedRows('different-risk', [
      pairedRow('baseline', 'case-a', { risk: 'stable' }),
      pairedRow('candidate', 'case-a', { risk: 'aggressive' }),
    ])

    expect(comparison.protectedFloorComparable).toBe(false)
    expect(comparison.protectedFloor).toBeNull()
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

  function frozenReportFixture(
    policyVersion: string,
    utility: number,
  ): Record<string, unknown> {
    const plan = buildMatrixPlan(parseMatrixCliOptions([
      '--recipe=36282',
      '--equipment=buffed',
      '--world=balanced-iid',
      '--seed-count=1',
      '--base-seed=42',
      '--max-episodes=1',
    ]))
    const evaluationCase = plan.cases[0]!
    return {
      schemaVersion: GENERIC_FAMILY_MATRIX_SCHEMA_VERSION,
      catalogVersion: 'catalog-v1',
      mechanicsVersion: 'mechanics-v1',
      matrixId: `matrix-${policyVersion}`,
      policyVersion,
      comparisonContract: plan.comparisonContract,
      comparisonRows: [pairedRow('candidate', evaluationCase.caseId, {
        caseFingerprint: evaluationCase.caseFingerprint,
        evaluationScenarioId: evaluationCase.evaluationScenarioId,
        objectiveUtilitySignature: evaluationCase.objectiveUtilitySignature,
        familyId: evaluationCase.family.familyId,
        recipeId: evaluationCase.recipeId,
        equipmentId: evaluationCase.equipment.id,
        equipmentFingerprint: evaluationCase.equipmentFingerprint,
        worldId: evaluationCase.world.id,
        conditionWorldFingerprint: evaluationCase.conditionWorldFingerprint,
        baseSeed: evaluationCase.baseSeed,
        maxSteps: evaluationCase.maxSteps,
        seedIndex: evaluationCase.seedIndex,
        pairedSeed: evaluationCase.pairedSeed,
        completedObjectiveUtility: utility,
      })],
    }
  }

  it('imports a frozen same-risk v2 report as a solver-version baseline', () => {
    const shared = {
      baseline: frozenReportFixture('policy-v1', 0.7),
      current: frozenReportFixture('policy-v2', 0.8),
    }

    const report = attachExternalBaselineReport(shared.current, shared.baseline, {
      minimumMaterialEffect: 0.02,
      lookIndex: 1,
      maxLooks: 8,
    })

    expect(report.comparisonKind).toBe('solver-version-ab')
    expect(report.externalBaseline).toMatchObject({
      policyVersion: 'policy-v1',
      candidatePolicyVersion: 'policy-v2',
      exactCaseIdentityMatch: true,
      comparisonContractVersion: GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION,
      baseSeed: 42,
    })
    expect(report.stoppingDecision).toMatchObject({
      decision: 'continue',
      pairs: 1,
    })
  })

  it('rejects legacy, missing-contract, seed, and fingerprint baseline drift', () => {
    const current = frozenReportFixture('policy-v2', 0.8)
    const options = {
      minimumMaterialEffect: 0.02,
      lookIndex: 1,
      maxLooks: 8,
    } as const
    const legacy = {
      ...frozenReportFixture('policy-v1', 0.7),
      schemaVersion: 'generic-cosmic-family-development-matrix-v1',
    }
    expect(() => attachExternalBaselineReport(current, legacy, options))
      .toThrow(new RegExp(`rerun the baseline with ${GENERIC_FAMILY_MATRIX_SCHEMA_VERSION}`))

    const missingContract = { ...frozenReportFixture('policy-v1', 0.7) }
    delete missingContract.comparisonContract
    expect(() => attachExternalBaselineReport(current, missingContract, options))
      .toThrow(/comparisonContract is missing.*rerun/)

    const wrongBaseSeed = frozenReportFixture('policy-v1', 0.7)
    wrongBaseSeed.comparisonContract = {
      ...(wrongBaseSeed.comparisonContract as Record<string, unknown>),
      baseSeed: 43,
    }
    expect(() => attachExternalBaselineReport(current, wrongBaseSeed, options))
      .toThrow(/comparisonContract\.baseSeed mismatch/)

    const wrongPairedSeed = frozenReportFixture('policy-v1', 0.7)
    wrongPairedSeed.comparisonRows = (wrongPairedSeed.comparisonRows as MatrixEpisodeRow[])
      .map((row) => ({ ...row, pairedSeed: (row.pairedSeed + 1) >>> 0 }))
    expect(() => attachExternalBaselineReport(current, wrongPairedSeed, options))
      .toThrow(/pairedSeed does not match the canonical schedule/)

    const wrongEquipment = frozenReportFixture('policy-v1', 0.7)
    wrongEquipment.comparisonRows = (wrongEquipment.comparisonRows as MatrixEpisodeRow[])
      .map((row) => ({ ...row, equipmentFingerprint: 'ffffffffffffffff' }))
    expect(() => attachExternalBaselineReport(current, wrongEquipment, options))
      .toThrow(/caseFingerprint does not match row identity/)

    const wrongWorld = frozenReportFixture('policy-v1', 0.7)
    wrongWorld.comparisonRows = (wrongWorld.comparisonRows as MatrixEpisodeRow[])
      .map((row) => ({ ...row, conditionWorldFingerprint: 'eeeeeeeeeeeeeeee' }))
    expect(() => attachExternalBaselineReport(current, wrongWorld, options))
      .toThrow(/caseFingerprint does not match row identity/)
  })
})
