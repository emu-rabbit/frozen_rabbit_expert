import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { CRAFT_SCENARIO_DATA } from '@frozen-rabbit-expert/data'
import { CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION } from '@frozen-rabbit-expert/policy-lab'
import { resolveGuideScenarioPolicyBinding } from '@frozen-rabbit-expert/solver'
import {
  CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE,
  CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS,
  CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES,
  createPairedEpisodeRandomStreams,
  pairedDevelopmentSeeds,
} from '../tools/evaluate-causal-root-mpc/scenarios'
import {
  CAUSAL_ROOT_MPC_DEVELOPMENT_RUNNER_VERSION,
  MIN_BOTH_COMPLETED_PAIRS_FOR_QUALITY_GATE,
  MIN_PAIRED_EPISODES_FOR_DEVELOPMENT_GATE,
  MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE,
  causalRootMpcDevelopmentStopReasons,
  evaluateCausalRootMpcDevelopment,
} from '../tools/evaluate-causal-root-mpc/index'

describe('causal root MPC development evaluation contract', () => {
  it('binds every data-owned scenario exactly once', () => {
    expect(CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS.map((scenario) => scenario.scenarioId))
      .toEqual(CRAFT_SCENARIO_DATA.map((scenario) => scenario.scenarioId))
    expect(new Set(CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS.map((scenario) => scenario.scenarioId)).size)
      .toBe(CRAFT_SCENARIO_DATA.length)
    expect(Object.keys(CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES).sort()).toEqual(
      CRAFT_SCENARIO_DATA.map(({ scenarioId }) => scenarioId).sort(),
    )
    for (const scenario of CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS) {
      const binding = resolveGuideScenarioPolicyBinding(scenario.scenarioId)
      expect(scenario.baselinePolicyVersion).toBe(binding.policyVersion)
      expect(scenario.baselineConfig).toBe(binding.config)
      expect(scenario.assumedConditionProfiles).toHaveLength(3)
      expect(scenario.assumedConditionProfiles.every((profile) => profile.evidence === 'assumption'))
        .toBe(true)
    }
  })

  it('labels this corpus as regression-seen development evidence only', () => {
    expect(CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE).toEqual({
      equipmentProfiles: 'regression-seen-exact-player-profiles',
      conditions: 'assumed-development-sensitivity-only',
      seeds: 'paired-environment-independent-planner-development-v2',
      releaseUse: 'development-only-not-promotion-not-frozen-not-reserved',
    })
  })

  it('gives both paired arms identical environment streams and a distinct stable planner seed', () => {
    const scenarioId = 'mobile-work-stairs'
    const pair = pairedDevelopmentSeeds(scenarioId, 1)[0]!
    expect(pair.baselineEnvironmentSeed).toBe(pair.environmentSeed)
    expect(pair.causalEnvironmentSeed).toBe(pair.environmentSeed)
    expect(pair.plannerSeed).not.toBe(pair.environmentSeed)
    expect(pairedDevelopmentSeeds(scenarioId, 1)[0]).toEqual(pair)
    const streams = createPairedEpisodeRandomStreams(pair)
    for (let index = 0; index < 8; index += 1) {
      expect(streams.baseline.nextSuccess()).toBe(streams.causal.nextSuccess())
      expect(streams.baseline.nextCondition()).toBe(streams.causal.nextCondition())
    }
  })

  it('keeps scenario seed namespaces stable when the scenario list is reordered', () => {
    const scenarioIds = CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS.map(({ scenarioId }) => scenarioId)
    const seedsIn = (ids: readonly (typeof scenarioIds)[number][]) => Object.fromEntries(
      ids.map((scenarioId) => [scenarioId, pairedDevelopmentSeeds(scenarioId, 3)]),
    )
    expect(seedsIn([...scenarioIds].reverse())).toEqual(seedsIn(scenarioIds))
  })

  it('fails closed on invalid corpus sizes and any tampered seed evidence', () => {
    expect(() => pairedDevelopmentSeeds('not-a-scenario' as never, 1))
      .toThrow(/unknown scenarioId seed namespace/)
    expect(() => pairedDevelopmentSeeds('cosmotized-ilmenite-ingot', 0)).toThrow(/count/)
    const pair = pairedDevelopmentSeeds('cosmotized-ilmenite-ingot', 1)[0]!
    for (const tampered of [
      { ...pair, corpusId: 'tampered-corpus' },
      { ...pair, scenarioId: 'cosmotized-ilmenite-nails' },
      { ...pair, environmentSeed: pair.environmentSeed + 1 },
      { ...pair, baselineEnvironmentSeed: pair.baselineEnvironmentSeed + 1 },
      { ...pair, causalEnvironmentSeed: pair.causalEnvironmentSeed + 1 },
      { ...pair, plannerSeed: pair.plannerSeed + 1 },
      { ...pair, plannerSeed: -1 },
      { ...pair, environmentSeed: 0x1_0000_0000 },
      { ...pair, seedIndex: pair.seedIndex + 1 },
    ]) {
      expect(() => createPairedEpisodeRandomStreams(tampered as never))
        .toThrow(/seed evidence mismatch|unsigned 32-bit integer/)
    }
  })

  it('runs a closed-loop paired development slice with explicit outcome and planner evidence', () => {
    const scenario = CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS[1]!
    const conditionProfile = scenario.assumedConditionProfiles[1]!
    let clock = 0
    const report = evaluateCausalRootMpcDevelopment({
      scenarioIds: [scenario.scenarioId],
      equipmentProfileIds: ['player-food-medicine-cosmic-tool-v1'],
      conditionProfileIds: [conditionProfile.id],
      seedCount: 1,
      maxSteps: 1,
      plannerSamplesPerProfile: 1,
      plannerMaxEpisodeSteps: 1,
      now: () => ++clock,
    })

    expect(report.version).toBe(CAUSAL_ROOT_MPC_DEVELOPMENT_RUNNER_VERSION)
    expect(report.version).toBe('causal-root-mpc-closed-loop-paired-development-evaluator-v0.4.0')
    expect(report.candidatePlannerVersion).toBe(CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION)
    expect(report.timingSource).toBe('injected')
    expect(report.latencyEvidence).toBe('inconclusive-injected-clock')
    expect(report.evidence).toBe(CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE)
    expect(report.dataAccess).toEqual({
      seedSource: 'generated-paired-development-seeds-only',
      plannerSeedSource: 'independent-explicit-scenario-id-namespace',
      reservedFinalAccessed: false,
      frozenValidationAccessed: false,
    })
    expect(report.seedEvidence).toEqual({
      environmentPairing: 'baseline-causal-common-environment-seed',
      plannerIsolation: 'independent-fixed-scenario-id-namespace',
      scenarioNamespaces: [{
        scenarioId: scenario.scenarioId,
        environmentNamespaceId:
          CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES[scenario.scenarioId].environmentNamespaceId,
        plannerNamespaceId:
          CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES[scenario.scenarioId].plannerNamespaceId,
      }],
    })
    expect(report.parameters).toMatchObject({
      scenarioIds: [scenario.scenarioId],
      equipmentProfileIds: ['player-food-medicine-cosmic-tool-v1'],
      conditionProfileIds: [conditionProfile.id],
      seedCountPerConditionProfile: 1,
      maxSteps: 1,
    })
    expect(report.scenarios[0]!.conditionProfiles.map(({ id }) => id)).toEqual([
      conditionProfile.id,
    ])
    expect(report.scenarios[0]!.plannerConditionProfiles.map(({ id }) => id)).toEqual(
      scenario.assumedConditionProfiles.map(({ id }) => id),
    )

    const evaluation = report.scenarios[0]!.equipment[0]!
    expect(evaluation.baselineConfig).toMatchObject({
      progressFloorBeforeQuality: 0.75,
      greatStridesQuality: 0.70,
    })
    expect(evaluation.baseline).toMatchObject({
      episodes: 1,
      completion: { count: 0, total: 1, rate: 0 },
      objectiveHits: { count: 0, total: 1, rate: 0 },
      stopReasons: { 'action-limit': 1 },
      safetyViolations: 0,
      nulls: { policyNullSelections: 0 },
      planner: { calls: 0, candidateSelections: 0 },
    })
    expect(evaluation.causal).toMatchObject({
      episodes: 1,
      completion: { count: 0, total: 1, rate: 0 },
      objectiveHits: { count: 0, total: 1, rate: 0 },
      stopReasons: { 'action-limit': 1 },
      safetyViolations: 0,
      nulls: {
        policyNullSelections: 0,
        plannerNullPlans: 0,
        plannerErrorPlans: 0,
        plannerBudgetFallbackPlans: 0,
      },
      planner: {
        calls: 1,
        baselineSelections: 1,
        candidateSelections: 0,
        deviationFromBaseline: { count: 0, total: 1, rate: 0 },
        selectionReasons: { 'baseline-no-completion-evidence': 1 },
      },
      latency: { count: 1, p95: 1 },
    })
    expect(evaluation.paired).toMatchObject({
      episodes: 1,
      completion: { causalWins: 0, causalLosses: 0, ties: 1 },
      objectiveHits: { causalWins: 0, causalLosses: 0, ties: 1 },
      actionsWhenBothComplete: { causalWins: 0, causalLosses: 0, ties: 0 },
    })
  })

  it('does not expose a frozen or reserved-final corpus input', () => {
    expect(() => evaluateCausalRootMpcDevelopment({
      seedCount: 1,
      corpusRole: 'reserved-final',
    } as never)).toThrow(/development-only.*reserved-final/)
    expect(() => evaluateCausalRootMpcDevelopment({
      scenarioIds: ['not-a-scenario'],
    } as never)).toThrow(/unknown scenarioIds/)
    expect(() => evaluateCausalRootMpcDevelopment({
      seedCount: 65,
    })).toThrow(/seedCount must be an integer between 1 and 64/)
    expect(() => evaluateCausalRootMpcDevelopment({
      seedCount: 64,
    })).toThrow(/projected simulation steps .* exceed limit/)
  })

  it('keeps CLI stdout as one machine-parseable JSON document', () => {
    const scenario = CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS[0]!
    const condition = scenario.assumedConditionProfiles[0]!
    const run = spawnSync(process.execPath, [
      'tools/evaluate-causal-root-mpc/run.mjs',
      '--scenario', scenario.scenarioId,
      '--equipment-profile', 'player-food-medicine-cosmic-tool-v1',
      '--condition-profile', condition.id,
      '--seed-count', '1',
      '--max-steps', '1',
      '--planner-samples-per-profile', '1',
      '--planner-max-episode-steps', '1',
      '--compact',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    })

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout.trim().startsWith('{')).toBe(true)
    expect(JSON.parse(run.stdout)).toMatchObject({
      version: CAUSAL_ROOT_MPC_DEVELOPMENT_RUNNER_VERSION,
      candidatePlannerVersion: CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION,
      timingSource: 'system',
      latencyEvidence: 'measured-system-clock',
      parameters: { scenarioIds: [scenario.scenarioId] },
    })
  })

  it('stops expansion on objective regression even when completion is preserved', () => {
    expect(causalRootMpcDevelopmentStopReasons({
      pairedEpisodes: 20,
      minimumPairedEpisodesPerConditionProfile: 20,
      bothCompletedPairs: 1,
      baselineOnlyCompletions: 0,
      baselineOnlyObjectiveHits: 1,
      baselineHigherCompletedQualityPairs: 0,
      qualityIsPrimaryObjective: true,
      worstConditionProfileCompletionRateDelta: 0,
      worstConditionProfileObjectiveHitRateDelta: -1,
      safetyViolations: 0,
      plannerNullPlans: 0,
      plannerErrorPlans: 0,
      plannerBudgetFallbackPlans: 0,
      timingSource: 'system',
      causalPlannerP95Ms: 900,
    })).toEqual([
      'insufficient-completed-pairs-for-quality-gate',
      'baseline-only-objective-hit-loss',
      'worst-condition-profile-objective-hit-regression',
    ])
  })

  it('blocks low-sample or lower-quality results that completion-only gates miss', () => {
    expect(causalRootMpcDevelopmentStopReasons({
      pairedEpisodes: 1,
      minimumPairedEpisodesPerConditionProfile: 1,
      bothCompletedPairs: 1,
      baselineOnlyCompletions: 0,
      baselineOnlyObjectiveHits: 0,
      baselineHigherCompletedQualityPairs: 1,
      qualityIsPrimaryObjective: true,
      worstConditionProfileCompletionRateDelta: 0,
      worstConditionProfileObjectiveHitRateDelta: 0,
      safetyViolations: 0,
      plannerNullPlans: 0,
      plannerErrorPlans: 0,
      plannerBudgetFallbackPlans: 0,
      timingSource: 'system',
      causalPlannerP95Ms: 900,
    })).toEqual([
      'insufficient-paired-episodes-for-development-gate',
      'insufficient-paired-episodes-per-condition-profile-for-development-gate',
      'insufficient-completed-pairs-for-quality-gate',
      'paired-completed-quality-regression',
    ])
  })

  it('requires enough paired evidence overall, per condition, and among completed quality pairs', () => {
    const clean = {
      pairedEpisodes: MIN_PAIRED_EPISODES_FOR_DEVELOPMENT_GATE,
      minimumPairedEpisodesPerConditionProfile:
        MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE,
      bothCompletedPairs: MIN_BOTH_COMPLETED_PAIRS_FOR_QUALITY_GATE,
      baselineOnlyCompletions: 0,
      baselineOnlyObjectiveHits: 0,
      baselineHigherCompletedQualityPairs: 0,
      qualityIsPrimaryObjective: true,
      worstConditionProfileCompletionRateDelta: 0,
      worstConditionProfileObjectiveHitRateDelta: 0,
      safetyViolations: 0,
      plannerNullPlans: 0,
      plannerErrorPlans: 0,
      plannerBudgetFallbackPlans: 0,
      timingSource: 'system',
      causalPlannerP95Ms: 900,
    } as const

    expect(causalRootMpcDevelopmentStopReasons(clean)).toEqual([])
    expect(causalRootMpcDevelopmentStopReasons({ ...clean, timingSource: 'injected' }))
      .toEqual(['causal-planner-latency-inconclusive-injected-clock'])
    expect(causalRootMpcDevelopmentStopReasons({
      ...clean,
      pairedEpisodes: MIN_PAIRED_EPISODES_FOR_DEVELOPMENT_GATE - 1,
    })).toContain('insufficient-paired-episodes-for-development-gate')
    expect(causalRootMpcDevelopmentStopReasons({
      ...clean,
      minimumPairedEpisodesPerConditionProfile:
        MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE - 1,
    })).toContain('insufficient-paired-episodes-per-condition-profile-for-development-gate')
    expect(causalRootMpcDevelopmentStopReasons({
      ...clean,
      bothCompletedPairs: MIN_BOTH_COMPLETED_PAIRS_FOR_QUALITY_GATE - 1,
    })).toContain('insufficient-completed-pairs-for-quality-gate')
  })

  it('keeps the known command-brew regression slice at the full-quality guide outcome', () => {
    const scenario = CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS.find(({ scenarioId }) => (
      scenarioId === 'survey-craftsmans-command-brew'
    ))!
    const normalHeavy = scenario.assumedConditionProfiles.find(({ id }) => (
      id === 'normal-heavy-command-brew-three-condition-sensitivity-v1'
    ))!
    let clock = 0
    const report = evaluateCausalRootMpcDevelopment({
      scenarioIds: [scenario.scenarioId],
      equipmentProfileIds: ['player-food-medicine-cosmic-tool-v1'],
      conditionProfileIds: [normalHeavy.id],
      seedCount: 1,
      maxSteps: 80,
      plannerSamplesPerProfile: 1,
      plannerMaxEpisodeSteps: 80,
      now: () => ++clock,
    })
    const evaluation = report.scenarios[0]!.equipment[0]!

    expect(evaluation.baseline).toMatchObject({
      objectiveHits: { count: 1, total: 1, rate: 1 },
      quality: { validCompletions: { minimum: 12000, maximum: 12000 } },
      actions: { validCompletions: { minimum: 25, maximum: 25 } },
    })
    expect(evaluation.causal).toMatchObject({
      objectiveHits: { count: 1, total: 1, rate: 1 },
      quality: { validCompletions: { minimum: 12000, maximum: 12000 } },
      actions: { validCompletions: { minimum: 25, maximum: 25 } },
      planner: {
        calls: 25,
        candidateSelections: 0,
        selectionReasons: { 'baseline-objective-saturated': 25 },
      },
    })
    expect(evaluation.paired).toMatchObject({
      objectiveHits: { baselineOnly: 0, causalOnly: 0, both: 1 },
      qualityWhenBothComplete: { averageCausalMinusBaseline: 0 },
      actionsWhenBothComplete: { averageCausalMinusBaseline: 0 },
    })
    expect(evaluation.stopSignals).toEqual({
      shouldStopExpansion: true,
      reasons: [
        'insufficient-paired-episodes-for-development-gate',
        'insufficient-paired-episodes-per-condition-profile-for-development-gate',
        'insufficient-completed-pairs-for-quality-gate',
        'causal-planner-latency-inconclusive-injected-clock',
      ],
      strongPlannerP95TargetMs: 1000,
      minimumEvidence: {
        pairedEpisodes: 20,
        pairedEpisodesPerConditionProfile: 20,
        bothCompletedQualityPairs: 20,
      },
      insufficientConditionProfiles: [{
        conditionProfileId: normalHeavy.id,
        pairedEpisodes: 1,
      }],
    })
  })
})
