import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { availableParallelism } from 'node:os'
import { afterEach, describe, test } from 'node:test'
import path from 'node:path'
import { restoreActiveTiming, runProgressTiming } from './progress-timing.mjs'
import { parseRecommendationDurations, recommendationLatency } from '../evaluate-native-generic-cosmic/timing.ts'
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_WORLD_IDS,
  OVERNIGHT_SHARD_SCHEMA_VERSION,
  atomicWriteJson,
  buildShardPlan,
  classifyIncompleteAttemptOutcome,
  parseDuration,
  parseOvernightCliOptions,
  readJson,
  semanticConfigPayload,
  sha256Value,
  summarizeComparisonRows,
  validateBaselineShard,
  validateCompletedShard,
  validateEvaluatorDescription,
  validateEvaluatorReport,
  validateNativeEvaluatorReport,
} from './lib.mjs'

const EVALUATOR_BUNDLE_SHA = 'a'.repeat(64)
const OTHER_EVALUATOR_BUNDLE_SHA = 'b'.repeat(64)
const scratchDirectories = []

describe('cumulative overnight progress timing', () => {
  const at = (seconds) => new Date(seconds * 1_000).toISOString()
  const progress = (priorTiming, overrides = {}) => runProgressTiming({
    priorTiming,
    invocationWallClockMs: 20_000,
    statusOnly: false,
    summary: { totalShards: 10, completed: 2 },
    ...overrides,
  })

  test('resume immediately uses saved active time for ETA, without counting downtime', () => {
    const prior = restoreActiveTiming({
      updatedAt: at(1), timing: { activeWallClockMs: 100_000 },
    })
    const resumed = progress(prior)
    assert.equal(resumed.activeWallClockMs, 120_000)
    assert.equal(resumed.priorActiveWallClockMs, 100_000)
    assert.equal(resumed.estimatedRemainingMs, 480_000)
    const next = progress(restoreActiveTiming({ timing: resumed }))
    assert.equal(next.activeWallClockMs, 140_000)
    assert.equal(next.estimatedRemainingMs, 560_000)
  })

  test('repeated status-only calls neither reset nor increase active time', () => {
    const prior = { activeWallClockMs: 120_000, historySource: 'legacy-intervals' }
    const status = progress(prior, { statusOnly: true })
    const again = progress(restoreActiveTiming({ timing: status }), { statusOnly: true })
    assert.equal(again.activeWallClockMs, 120_000)
    assert.equal(again.estimatedRemainingMs, 480_000)
    assert.equal(again.activeWallClockHistorySource, 'legacy-intervals')
  })

  test('legacy parallel attempts, retries and last invocation merge without offline gaps', () => {
    const prior = restoreActiveTiming({
      invocationStartedAt: at(1_000), updatedAt: at(1_050),
      operationalBudget: { statusOnly: false },
      shards: [{ attempts: [
        { startedAt: at(0), finishedAt: at(100), durationMs: 100_000 },
        { startedAt: at(20), durationMs: 100_000 },
        { startedAt: at(130), finishedAt: at(150), outcome: 'failed' },
        { startedAt: at(1_001), outcome: 'running' },
      ] }],
    }, [{ startedAt: at(10), completedAt: at(90) }])
    assert.equal(prior.activeWallClockMs, 190_000)
    assert.equal(prior.historySource, 'legacy-intervals')
  })

  test('legacy status inspection and unfinished old attempts cannot bridge downtime', () => {
    const prior = restoreActiveTiming({
      invocationStartedAt: at(1_000), updatedAt: at(1_050), outcome: 'status-incomplete',
      shards: [{ attempts: [
        { startedAt: at(0), finishedAt: at(100) },
        { startedAt: at(110), outcome: 'running' },
        { startedAt: 'invalid', durationMs: 5_000 },
        { startedAt: at(200), finishedAt: at(199) },
      ] }],
    })
    assert.equal(prior.activeWallClockMs, 100_000)
    assert.equal(progress(prior, { statusOnly: true }).activeWallClockMs, 100_000)
  })

  test('missing/corrupt cumulative clock recovers only observed completed intervals', () => {
    const timings = [
      { startedAt: at(0), completedAt: at(100) },
      { startedAt: at(20), completedAt: at(120) },
      { startedAt: at(1_000), completedAt: at(1_010) },
      { startedAt: at(10), completedAt: at(2_000), source: 'recovered-valid-raw-output' },
    ]
    assert.equal(restoreActiveTiming(null, timings).activeWallClockMs, 130_000)
    assert.equal(restoreActiveTiming({ timing: { activeWallClockMs: -1 } }, timings)
      .activeWallClockMs, 130_000)
    assert.deepEqual(restoreActiveTiming(null), { activeWallClockMs: 0, historySource: 'recorded' })
  })

  test('ETA is unknown without a measured rate; failed shards still count as remaining', () => {
    const prior = { activeWallClockMs: 0, historySource: 'recorded' }
    assert.equal(progress(prior, { summary: { totalShards: 10, completed: 0 } })
      .estimatedRemainingMs, null)
    assert.equal(progress(prior, { statusOnly: true }).estimatedRemainingMs, null)
    assert.equal(progress(prior, { summary: { totalShards: 10, completed: 10 } })
      .estimatedRemainingMs, 0)
    assert.equal(progress(prior, { summary: { totalShards: 10, completed: 2, failed: 8 } })
      .estimatedRemainingMs, 80_000)
  })
})

function matrixFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

const OBJECTIVE_SIGNATURE_A = matrixFingerprint({ objective: 'a' })
const OBJECTIVE_SIGNATURE_B = matrixFingerprint({ objective: 'b' })

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    const resolved = path.resolve(directory)
    const allowedRoot = path.resolve(process.cwd(), '.tmp')
    assert.ok(resolved.startsWith(`${allowedRoot}${path.sep}`))
    rmSync(resolved, { recursive: true, force: true })
  }
})

function description(overrides = {}) {
  return {
    matrixSchemaVersion: 'generic-cosmic-family-development-matrix-v2',
    pairedComparisonContractVersion: 'generic-cosmic-family-paired-comparison-v1',
    catalogVersion: 'catalog-v1',
    mechanicsVersion: 'mechanics-v1',
    policyVersion: 'policy-v1',
    maxSeedsPerCell: 512,
    equipmentIds: ['equipment-a', 'equipment-b', 'equipment-c'],
    worldIds: [...DEFAULT_WORLD_IDS],
    families: [
      {
        familyId: 'family-a',
        representativeRecipeId: 100,
        recipeCount: 8,
        evaluationScenarioId: `family-a|objective:${OBJECTIVE_SIGNATURE_A}`,
      },
      {
        familyId: 'family-b',
        representativeRecipeId: 200,
        recipeCount: 8,
        evaluationScenarioId: `family-b|objective:${OBJECTIVE_SIGNATURE_B}`,
      },
    ],
    ...overrides,
  }
}

function options(args = []) {
  return parseOvernightCliOptions([
    '--risk=stable',
    '--time-budget=5m',
    '--retries=0',
    ...args,
  ])
}

function expectedFixture({ baselineExpected = false, seedCount = 1 } = {}) {
  const evaluatorDescription = description()
  const parsed = options([
    '--family-limit=1',
    `--seed-count=${seedCount}`,
  ])
  const shard = buildShardPlan(evaluatorDescription, parsed)[0]
  const payload = semanticConfigPayload(
    evaluatorDescription,
    parsed,
    [shard],
    [],
    EVALUATOR_BUNDLE_SHA,
  )
  const configFingerprint = sha256Value(payload)
  return {
    parsed,
    shard,
    expected: {
      description: evaluatorDescription,
      shard,
      configFingerprint,
      runId: 'test-run',
      seedCount,
      baseSeed: parsed.baseSeed,
      baselineExpected,
      evaluatorBundleSha256: EVALUATOR_BUNDLE_SHA,
    },
  }
}

function equipmentProfile(equipmentId, index) {
  return {
    id: equipmentId,
    label: `Equipment ${index}`,
    preparation: index === 0 ? 'unbuffed' : 'food-and-medicine',
    specialistConsumableCost: index === 2
      ? 'delineation-if-specialist-actions-used'
      : 'none',
    crafter: {
      level: 100,
      craftsmanship: 5_400 + index,
      control: 5_100 + index,
      maxCp: 630 + index,
      cosmicToolGoodBonus: true,
      specialist: index === 2,
    },
  }
}

function equipmentFingerprint(profile) {
  return matrixFingerprint({
    id: profile.id,
    preparation: profile.preparation,
    specialistConsumableCost: profile.specialistConsumableCost,
    crafter: {
      level: profile.crafter.level,
      craftsmanship: profile.crafter.craftsmanship,
      control: profile.crafter.control,
      maxCp: profile.crafter.maxCp,
      cosmicToolGoodBonus: profile.crafter.cosmicToolGoodBonus,
      specialist: profile.crafter.specialist ?? false,
    },
  })
}

function worldProfile(worldId) {
  const worlds = {
    'balanced-iid': { role: 'plausible', normal: 1, other: 1 },
    'normal-heavy-iid': { role: 'plausible', normal: 6, other: 1 },
    'opportunity-scarce-iid': { role: 'plausible-stress', normal: 12, other: 0.35 },
    'all-normal': { role: 'adversarial', normal: 1, other: 0 },
  }
  const world = worlds[worldId]
  return {
    id: worldId,
    role: world.role,
    evidence: 'assumption',
    description: `World ${worldId}`,
    weights: { normal: world.normal, other: world.other },
  }
}

function pairedSeed(expected, equipmentId, worldId, seedIndex) {
  const familyIndex = expected.description.families.findIndex(
    (family) => family.familyId === expected.shard.familyId,
  )
  const equipmentIndex = expected.description.equipmentIds.indexOf(equipmentId)
  const worldIndex = expected.description.worldIds.indexOf(worldId)
  const counter = (
    (familyIndex * expected.description.equipmentIds.length + equipmentIndex)
      * expected.description.worldIds.length
      + worldIndex
  ) * expected.description.maxSeedsPerCell + seedIndex
  return (expected.baseSeed ^ counter) >>> 0
}

function reportFixture(expected, {
  baseline = false,
  policyVersion = expected.description.policyVersion,
} = {}) {
  const scenario = expected.description.families.find(
    (family) => family.familyId === expected.shard.familyId,
  )
  const objectiveUtilitySignature = scenario.evaluationScenarioId.slice(
    `${scenario.familyId}|objective:`.length,
  )
  const equipmentProfiles = expected.description.equipmentIds.map(equipmentProfile)
  const equipmentFingerprints = new Map(equipmentProfiles.map((profile) => [
    profile.id,
    equipmentFingerprint(profile),
  ]))
  const conditionWorlds = expected.description.worldIds.map(worldProfile)
  const conditionWorldFingerprints = new Map(conditionWorlds.map((world) => [
    world.id,
    matrixFingerprint({
      worldId: world.id,
      evaluationScenarioId: scenario.evaluationScenarioId,
    }),
  ]))
  const rows = []
  for (const equipmentId of expected.description.equipmentIds) {
    for (const worldId of expected.description.worldIds) {
      for (let seedIndex = 0; seedIndex < expected.seedCount; seedIndex += 1) {
        const resolvedPairedSeed = pairedSeed(expected, equipmentId, worldId, seedIndex)
        const row = {
          arm: 'candidate',
          risk: expected.shard.risk,
          evaluationScenarioId: scenario.evaluationScenarioId,
          objectiveUtilitySignature,
          familyId: expected.shard.familyId,
          recipeId: expected.shard.representativeRecipeId,
          equipmentId,
          worldId,
          worldRole: conditionWorlds.find((world) => world.id === worldId).role,
          equipmentFingerprint: equipmentFingerprints.get(equipmentId),
          conditionWorldFingerprint: conditionWorldFingerprints.get(worldId),
          baseSeed: expected.baseSeed,
          maxSteps: DEFAULT_MAX_STEPS,
          seedIndex,
          pairedSeed: resolvedPairedSeed,
          terminal: 'completed',
          stopReason: 'completed',
          qualityMaximumReached: true,
          completedObjectiveUtility: 1,
          recommendationCalls: 10,
          completionContract: 'progress-only',
        }
        row.caseFingerprint = matrixFingerprint({
          comparisonContractVersion: expected.description.pairedComparisonContractVersion,
          evaluationScenarioId: row.evaluationScenarioId,
          objectiveUtilitySignature: row.objectiveUtilitySignature,
          recipeId: row.recipeId,
          equipmentId: row.equipmentId,
          equipmentFingerprint: row.equipmentFingerprint,
          worldId: row.worldId,
          conditionWorldFingerprint: row.conditionWorldFingerprint,
          baseSeed: row.baseSeed,
          seedIndex: row.seedIndex,
          maxSteps: row.maxSteps,
          pairedSeed: row.pairedSeed,
        })
        row.caseId = [
          row.evaluationScenarioId,
          `recipe:${row.recipeId}`,
          `equipment:${row.equipmentId}@${row.equipmentFingerprint}`,
          `world:${row.worldId}@${row.conditionWorldFingerprint}`,
          `base-seed:${row.baseSeed}`,
          `sample:${row.seedIndex}`,
          `max-steps:${row.maxSteps}`,
          `case:${row.caseFingerprint}`,
        ].join('|')
        rows.push(row)
      }
    }
  }
  const caseSetFingerprint = matrixFingerprint(rows
    .map((row) => ({
      caseId: row.caseId,
      caseFingerprint: row.caseFingerprint,
      pairedSeed: row.pairedSeed,
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId)))
  return {
    schemaVersion: expected.description.matrixSchemaVersion,
    matrixId: 'matrix-test',
    comparisonContract: {
      version: expected.description.pairedComparisonContractVersion,
      baseSeed: expected.baseSeed,
      maxStepsPerEpisode: DEFAULT_MAX_STEPS,
      caseCount: rows.length,
      caseSetFingerprint,
    },
    catalogVersion: expected.description.catalogVersion,
    mechanicsVersion: expected.description.mechanicsVersion,
    policyVersion,
    mechanicsFamilyCount: 1,
    evaluationScenarioCount: 1,
    evaluationScenarios: [{
      evaluationScenarioId: scenario.evaluationScenarioId,
      objectiveUtilitySignature,
      familyId: expected.shard.familyId,
      representativeRecipeId: expected.shard.representativeRecipeId,
    }],
    arms: [{ id: 'candidate', risk: expected.shard.risk, policyVersion }],
    requestedRecipeId: expected.shard.representativeRecipeId,
    equipmentProfiles,
    conditionWorlds,
    seed: { baseSeed: expected.baseSeed, seedCountPerCell: expected.seedCount },
    budget: {
      projectedEpisodes: rows.length,
      completedEpisodes: rows.length,
      bounded: true,
    },
    comparisonKind: baseline ? 'solver-version-ab' : 'candidate-only',
    ...(baseline ? {
      externalBaseline: {
        matrixId: 'baseline-matrix',
        policyVersion: 'policy-v0',
        candidatePolicyVersion: policyVersion,
        exactCaseIdentityMatch: true,
        risk: expected.shard.risk,
        comparisonContractVersion: expected.description.pairedComparisonContractVersion,
        baseSeed: expected.baseSeed,
        caseSetFingerprint,
      },
    } : {}),
    comparisonRows: rows,
  }
}

function completedShardFixture(expected, report) {
  return {
    schemaVersion: OVERNIGHT_SHARD_SCHEMA_VERSION,
    status: 'completed',
    configFingerprint: expected.configFingerprint,
    evaluatorBundleSha256: expected.evaluatorBundleSha256,
    runId: expected.runId,
    familyId: expected.shard.familyId,
    representativeRecipeId: expected.shard.representativeRecipeId,
    risk: expected.shard.risk,
    seedCountPerCell: expected.seedCount,
    baseSeed: expected.baseSeed,
    maxSteps: DEFAULT_MAX_STEPS,
    summary: summarizeComparisonRows(report.comparisonRows),
    reportFingerprint: sha256Value(report),
    report,
  }
}

function scratchDirectory(label) {
  const directory = path.join(
    process.cwd(),
    '.tmp',
    `${label}-${process.pid}-${Date.now()}-${scratchDirectories.length}`,
  )
  scratchDirectories.push(directory)
  mkdirSync(directory, { recursive: true })
  return directory
}

describe('overnight CLI and plan', () => {
  test('parses duration, selected risks, retries, and auto or explicit worker counts strictly', () => {
    assert.equal(parseDuration('8.5h'), 30_600_000)
    assert.equal(parseDuration('510m'), 30_600_000)
    const parsed = parseOvernightCliOptions([
      '--family-limit=2',
      '--risk=stable,aggressive',
      '--seed-count=64',
      '--time-budget=30s',
      '--retries=2',
      '--workers=auto',
      '--status-only',
    ])
    assert.deepEqual(parsed.risks, ['stable', 'aggressive'])
    assert.equal(parsed.seedCount, 64)
    assert.equal(parsed.timeBudgetMs, 30_000)
    assert.equal(parsed.statusOnly, true)
    assert.equal(parsed.workersRequested, 'auto')
    assert.equal(
      parsed.workers,
      Math.min(8, Math.max(1, Math.floor(availableParallelism() / 3))),
    )
    const explicit = parseOvernightCliOptions(['--workers=12'])
    assert.equal(explicit.workers, 12)
    assert.equal(explicit.workersRequested, '12')
    assert.throws(
      () => parseOvernightCliOptions(['--risk=stable', '--risk=balanced']),
      /duplicate overnight option/,
    )
    assert.throws(
      () => parseOvernightCliOptions(['--workers=0']),
      /between 1 and 64/,
    )
    assert.throws(
      () => parseOvernightCliOptions(['--workers=many']),
      /auto or an integer/,
    )
    assert.throws(
      () => parseOvernightCliOptions(['--unknown=value']),
      /unknown overnight option/,
    )
    assert.throws(
      () => parseOvernightCliOptions(['--engine=rust-native', '--native-preview']),
      /explicit calibrated --workers/,
    )
    assert.throws(
      () => parseOvernightCliOptions(['--engine=rust-native', '--workers=4']),
      /requires explicit --native-preview acknowledgement/,
    )
    assert.throws(
      () => parseOvernightCliOptions(['--native-preview']),
      /requires --engine=rust-native/,
    )
    const native = parseOvernightCliOptions([
      '--engine=rust-native',
      '--native-preview',
      '--workers=4',
      '--native-baseline-solver=baseline-v1',
      '--native-candidate-solver=candidate-v2',
    ])
    assert.equal(native.engine, 'rust-native')
    assert.equal(native.nativePreview, true)
    assert.equal(native.workers, 4)
  })

  test('accepts one or more unique non-empty evaluator equipment IDs', () => {
    assert.equal(
      validateEvaluatorDescription(description({ equipmentIds: ['equipment-a'] })).equipmentIds.length,
      1,
    )
    for (const equipmentIds of [[], [''], ['   '], ['equipment-a', 'equipment-a']]) {
      assert.throws(
        () => validateEvaluatorDescription(description({ equipmentIds })),
        /equipment ID|equipmentIds/,
      )
    }
  })

  test('creates shards and fingerprints evaluator artifact drift but not worker scheduling', () => {
    const parsed = parseOvernightCliOptions([
      '--family-limit=2',
      '--risk=stable,balanced',
      '--seed-count=64',
      '--workers=auto',
    ])
    const plan = buildShardPlan(description(), parsed)
    assert.deepEqual(
      plan.map((shard) => `${shard.familyId}:${shard.risk}`),
      ['family-a:stable', 'family-a:balanced', 'family-b:stable', 'family-b:balanced'],
    )
    const payload = semanticConfigPayload(
      description(),
      parsed,
      plan,
      [],
      EVALUATOR_BUNDLE_SHA,
    )
    assert.equal(payload.evaluator.bundleSha256, EVALUATOR_BUNDLE_SHA)
    const changedPolicy = semanticConfigPayload(
      { ...description(), policyVersion: 'policy-v2' },
      parsed,
      plan,
      [],
      EVALUATOR_BUNDLE_SHA,
    )
    const changedBundle = semanticConfigPayload(
      description(),
      parsed,
      plan,
      [],
      OTHER_EVALUATOR_BUNDLE_SHA,
    )
    assert.notEqual(sha256Value(payload), sha256Value(changedPolicy))
    assert.notEqual(sha256Value(payload), sha256Value(changedBundle))

    const twelveWorkers = parseOvernightCliOptions([
      '--family-limit=2',
      '--risk=stable,balanced',
      '--seed-count=64',
      '--workers=12',
    ])
    const workerPayload = semanticConfigPayload(
      description(),
      twelveWorkers,
      buildShardPlan(description(), twelveWorkers),
      [],
      EVALUATOR_BUNDLE_SHA,
    )
    assert.equal(sha256Value(payload), sha256Value(workerPayload))
    assert.throws(
      () => semanticConfigPayload(description(), parsed, plan, []),
      /bundle SHA-256/,
    )
    assert.throws(
      () => semanticConfigPayload(description(), parsed, plan, [], 'not-a-digest'),
      /bundle SHA-256/,
    )
  })

  test('classifies a global-deadline kill separately from ordinary attempt failure', () => {
    assert.equal(classifyIncompleteAttemptOutcome({
      shutdownRequested: false,
      timedOut: true,
      timeoutIsGlobalDeadline: true,
    }), 'budget-exhausted')
    assert.equal(classifyIncompleteAttemptOutcome({
      shutdownRequested: false,
      timedOut: true,
      timeoutIsGlobalDeadline: false,
    }), 'failed')
    assert.equal(classifyIncompleteAttemptOutcome({
      shutdownRequested: false,
      timedOut: false,
      timeoutIsGlobalDeadline: true,
    }), 'failed')
    assert.equal(classifyIncompleteAttemptOutcome({
      shutdownRequested: true,
      timedOut: true,
      timeoutIsGlobalDeadline: true,
    }), 'interrupted')
  })
})

describe('overnight report validation', () => {
  test('accepts a complete paired native Rust report and rejects solver drift', () => {
    const { expected } = expectedFixture()
    const binaryHandshake = [
      'native-generic-episode-batch-v6', '__handshake__', 'handshake', 'ok',
      'abi-v3', 'mechanics-parity-v2', 'release', 'x86_64-pc-windows-msvc', 'rustc-test',
      'baseline-v1', 'candidate-v2',
    ]
    const executionIdentity = {
      engine: 'rust-native-closed-loop',
      baselineSolver: 'baseline-v1',
      candidateSolver: 'candidate-v2',
      binaryHandshake,
    }
    const candidateRows = reportFixture(expected).comparisonRows.map((row) => ({
      ...row,
      arm: 'candidate',
      solverVersion: 'candidate-v2',
      actions: 10,
      advancingSteps: 9,
    }))
    const baselineRows = candidateRows.map((row) => ({
      ...row,
      arm: 'baseline',
      solverVersion: 'baseline-v1',
    }))
    const nativeReport = {
      schemaVersion: 'native-generic-cosmic-paired-matrix-v3',
      executionEngine: 'rust-native-closed-loop',
      binary: { handshake: binaryHandshake },
      solvers: { baseline: 'baseline-v1', candidate: 'candidate-v2' },
      risk: expected.shard.risk,
      cases: candidateRows.length,
      episodes: candidateRows.length * 2,
      rows: [...baselineRows, ...candidateRows],
    }
    const nativeExpected = { ...expected, executionIdentity }
    validateNativeEvaluatorReport(nativeReport, nativeExpected)
    assert.deepEqual(parseRecommendationDurations('-'), [])
    assert.deepEqual(parseRecommendationDurations('0,100'), [0, 100])
    for (const text of ['', '1,', ',1', '1,,2', '-1', '1.5', 'NaN']) {
      assert.throws(() => parseRecommendationDurations(text), /timing sample encoding/)
    }
    const sampled = structuredClone(nativeReport)
    sampled.schemaVersion = 'native-generic-cosmic-paired-matrix-v4'
    sampled.binary.handshake[0] = 'native-generic-episode-batch-v7'
    sampled.binary.handshake[4] = 'native-generic-closed-loop-abi-v7'
    for (const row of sampled.rows) {
      row.recommendationDurationsNs = Array.from({ length: row.recommendationCalls }, (_, i) => (i + 1) * 100)
      row.recommendationNs = row.recommendationDurationsNs.reduce((sum, value) => sum + value, 0)
      row.recommendationMaxNs = row.recommendationDurationsNs.at(-1)
    }
    const sampledExpected = { ...nativeExpected, executionIdentity: {
      ...executionIdentity, binaryHandshake: sampled.binary.handshake,
    } }
    validateNativeEvaluatorReport(sampled, sampledExpected)
    for (const mutate of [
      (row) => { delete row.recommendationDurationsNs },
      (row) => { row.recommendationDurationsNs.pop() },
      (row) => { row.recommendationDurationsNs[0] = -1 },
      (row) => { row.recommendationDurationsNs[0] = '100' },
      (row) => { row.recommendationNs += 1 },
      (row) => { row.recommendationMaxNs += 1 },
    ]) {
      const damaged = structuredClone(sampled)
      mutate(damaged.rows[0])
      assert.throws(() => validateNativeEvaluatorReport(damaged, sampledExpected), /recommendation timing/)
    }
    assert.throws(() => validateNativeEvaluatorReport(nativeReport, sampledExpected), /schema mismatch/)
    assert.equal(recommendationLatency(nativeReport.rows), null)
    assert.deepEqual(recommendationLatency(sampled.rows), {
      unit: 'ns', percentileMethod: 'nearest-rank', count: sampled.rows.length * 10,
      p50: 500, p95: 1000, p99: 1000, maximum: 1000, mean: 550,
    })
    assert.deepEqual(recommendationLatency([]), {
      unit: 'ns', percentileMethod: 'nearest-rank', count: 0,
      p50: null, p95: null, p99: null, maximum: null, mean: null,
    })
    const pooled = recommendationLatency([
      { recommendationDurationsNs: Array(99).fill(1) },
      { recommendationDurationsNs: [1000] },
    ])
    assert.equal(pooled.p50, 1)
    assert.equal(pooled.p95, 1)
    assert.equal(pooled.maximum, 1000)
    assert.throws(
      () => validateNativeEvaluatorReport({
        ...nativeReport,
        solvers: { ...nativeReport.solvers, candidate: 'drifted' },
      }, nativeExpected),
      /solver\/risk identity mismatch/,
    )
    const swappedCandidateRows = candidateRows.map((row, index) => ({
      ...row,
      caseId: index === 0
        ? candidateRows[1].caseId
        : index === 1 ? candidateRows[0].caseId : row.caseId,
    }))
    assert.throws(
      () => validateNativeEvaluatorReport({
        ...nativeReport,
        rows: [...baselineRows, ...swappedCandidateRows],
      }, nativeExpected),
      /paired case axes disagree/,
    )
  })

  test('accepts the exact matrix v2 equipment/world/seed cross-product', () => {
    const { expected } = expectedFixture({ seedCount: 2 })
    const report = reportFixture(expected)
    assert.equal(validateEvaluatorReport(report, expected), report)
  })

  test('rejects damaged row identity and report comparison contracts', () => {
    const { expected } = expectedFixture({ seedCount: 2 })
    const valid = reportFixture(expected)
    const cases = [
      {
        name: 'duplicate cross-product cell',
        mutate(report) { report.comparisonRows[1] = structuredClone(report.comparisonRows[0]) },
        error: /duplicate candidate case IDs|duplicate equipment\/world\/seed/,
      },
      {
        name: 'seed index',
        mutate(report) { report.comparisonRows[0].seedIndex = expected.seedCount },
        error: /seedIndex/,
      },
      {
        name: 'paired seed',
        mutate(report) { report.comparisonRows[0].pairedSeed += 1 },
        error: /pairedSeed mismatch/,
      },
      {
        name: 'max steps',
        mutate(report) { report.comparisonRows[0].maxSteps -= 1 },
        error: /seed\/maxSteps mismatch/,
      },
      {
        name: 'case fingerprint',
        mutate(report) { report.comparisonRows[0].caseFingerprint = '0'.repeat(16) },
        error: /caseFingerprint mismatch/,
      },
      {
        name: 'case ID',
        mutate(report) { report.comparisonRows[0].caseId += '-damaged' },
        error: /caseId mismatch/,
      },
      {
        name: 'equipment fingerprint',
        mutate(report) { report.comparisonRows[0].equipmentFingerprint = '0'.repeat(16) },
        error: /equipmentFingerprint mismatch/,
      },
      {
        name: 'world fingerprint',
        mutate(report) { report.comparisonRows[0].conditionWorldFingerprint = 'not-a-fingerprint' },
        error: /conditionWorldFingerprint is invalid/,
      },
      {
        name: 'case-set fingerprint',
        mutate(report) { report.comparisonContract.caseSetFingerprint = '0'.repeat(16) },
        error: /caseSetFingerprint mismatch/,
      },
      {
        name: 'comparison contract max steps',
        mutate(report) { report.comparisonContract.maxStepsPerEpisode -= 1 },
        error: /comparisonContract mismatch/,
      },
    ]
    for (const testCase of cases) {
      const report = structuredClone(valid)
      testCase.mutate(report)
      assert.throws(
        () => validateEvaluatorReport(report, expected),
        testCase.error,
        testCase.name,
      )
    }
  })

  test('requires complete external-baseline identity when pairing is requested', () => {
    const { expected } = expectedFixture({ baselineExpected: true })
    const report = reportFixture(expected, { baseline: true })
    validateEvaluatorReport(report, expected, { baseline: true })
    for (const mutate of [
      (value) => { value.externalBaseline.baseSeed += 1 },
      (value) => { value.externalBaseline.caseSetFingerprint = '0'.repeat(16) },
      (value) => { delete value.externalBaseline.comparisonContractVersion },
    ]) {
      const damaged = structuredClone(report)
      mutate(damaged)
      assert.throws(
        () => validateEvaluatorReport(damaged, expected, { baseline: true }),
        /external baseline pairing is incomplete/,
      )
    }
  })
})

describe('overnight shard persistence', () => {
  test('accepts only a fingerprinted complete report and survives atomic replacement', () => {
    const { expected } = expectedFixture()
    const report = reportFixture(expected)
    const shard = completedShardFixture(expected, report)
    validateCompletedShard(shard, expected)

    const directory = scratchDirectory('overnight-lib-roundtrip')
    const filePath = path.join(directory, 'shard.json')
    atomicWriteJson(filePath, { generation: 1 })
    atomicWriteJson(filePath, shard)
    assert.equal(existsSync(filePath), true)
    validateCompletedShard(readJson(filePath), expected)

    assert.throws(
      () => validateCompletedShard({ ...shard, status: 'partial' }, expected),
      /not a completed/,
    )
    assert.throws(
      () => validateCompletedShard({
        ...shard,
        evaluatorBundleSha256: '0'.repeat(64),
      }, expected),
      /identity\/config mismatch/,
    )
    assert.throws(
      () => validateCompletedShard({ ...shard, reportFingerprint: undefined }, expected),
      /report fingerprint/,
    )
    assert.throws(
      () => validateCompletedShard({
        ...shard,
        report: { ...report, matrixId: 'tampered-after-fingerprint' },
      }, expected),
      /report fingerprint/,
    )
    const incompleteReport = {
      ...report,
      comparisonRows: report.comparisonRows.slice(1),
    }
    assert.throws(
      () => validateCompletedShard({
        ...shard,
        report: incompleteReport,
        reportFingerprint: sha256Value(incompleteReport),
        summary: summarizeComparisonRows(incompleteReport.comparisonRows),
      }, expected),
      /row count mismatch/,
    )
  })

  test('retries transient rename failures finitely and removes abandoned temp files', () => {
    const directory = scratchDirectory('overnight-lib-rename')
    const filePath = path.join(directory, 'result.json')
    let attempts = 0
    atomicWriteJson(filePath, { ok: true }, {
      rename(source, destination) {
        attempts += 1
        if (attempts < 3) {
          const error = new Error('temporarily busy')
          error.code = 'EPERM'
          throw error
        }
        renameSync(source, destination)
      },
      retryDelaysMs: [0, 0],
      sleep() {},
    })
    assert.equal(attempts, 3)
    assert.deepEqual(readJson(filePath), { ok: true })

    const failedPath = path.join(directory, 'failed.json')
    let failedAttempts = 0
    assert.throws(
      () => atomicWriteJson(failedPath, { ok: false }, {
        rename() {
          failedAttempts += 1
          const error = new Error('still busy')
          error.code = 'EBUSY'
          throw error
        },
        retryDelaysMs: [0],
        sleep() {},
      }),
      /still busy/,
    )
    assert.equal(failedAttempts, 2)
    assert.equal(existsSync(failedPath), false)
    assert.deepEqual(
      readdirSync(directory).filter((entry) => entry.endsWith('.tmp')),
      [],
    )
  })

  test('baseline preflight applies the same report and fingerprint checks while allowing policy drift', () => {
    const { expected } = expectedFixture()
    const report = reportFixture(expected, { policyVersion: 'policy-v0' })
    const baseline = completedShardFixture(expected, report)
    validateBaselineShard(baseline, expected)
    assert.throws(
      () => validateBaselineShard({ ...baseline, baseSeed: expected.baseSeed + 1 }, expected),
      /axes do not match/,
    )
    assert.throws(
      () => validateBaselineShard({ ...baseline, reportFingerprint: '0'.repeat(64) }, expected),
      /report fingerprint/,
    )

    const wrongWorlds = structuredClone(report)
    wrongWorlds.conditionWorlds = wrongWorlds.conditionWorlds.slice(1)
    assert.throws(
      () => validateBaselineShard({
        ...baseline,
        report: wrongWorlds,
        reportFingerprint: sha256Value(wrongWorlds),
      }, expected),
      /condition worlds/,
    )

    const wrongSeed = structuredClone(report)
    wrongSeed.comparisonRows[0].pairedSeed += 1
    assert.throws(
      () => validateBaselineShard({
        ...baseline,
        report: wrongSeed,
        reportFingerprint: sha256Value(wrongSeed),
      }, expected),
      /pairedSeed mismatch/,
    )

    const wrongCaseSet = structuredClone(report)
    wrongCaseSet.comparisonContract.caseSetFingerprint = '0'.repeat(16)
    assert.throws(
      () => validateBaselineShard({
        ...baseline,
        report: wrongCaseSet,
        reportFingerprint: sha256Value(wrongCaseSet),
      }, expected),
      /caseSetFingerprint mismatch/,
    )
  })
})
