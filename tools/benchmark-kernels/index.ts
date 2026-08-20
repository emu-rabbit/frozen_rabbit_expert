import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { cpus } from 'node:os'
import {
  CRAFT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import {
  ACTION_IDS,
  applyObservedOutcome,
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  BALANCED_COMMAND_BREW_CONDITIONS,
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  BALANCED_POC_CONDITIONS,
  assertConditionProfileCompatible,
  createEpisodeRandomStream,
  runEpisode,
  type EpisodePolicy,
  type EpisodeStopReason,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  SCENARIO_BEAM_PLANNER_VERSION,
  planWithScenarioBeam,
} from '@frozen-rabbit-expert/policy-lab'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import {
  prepareNativeTransitionBatch,
} from '../native-parity/transitionBatch'
import { prepareNativeRolloutBatch } from '../native-parity/rolloutBatch'
import {
  benchmarkTypeScriptTransitionBatch,
  runNativeCoreTransitionBenchmark,
  runNativeTransitionBatch,
} from '../native-parity/nativeRunner'
import {
  benchmarkTypeScriptRolloutBatch,
  runNativeCoreRolloutBenchmark,
  runNativeRolloutBatch,
} from '../native-parity/rolloutRunner'
import { prepareNativeRootPlanMatrix } from '../native-parity/rootPlanMatrix'
import {
  benchmarkTypeScriptRootPlanMatrix,
  runNativeCoreRootPlanMatrixBenchmark,
  runNativeRootPlanMatrix,
} from '../native-parity/rootPlanMatrixRunner'

function positiveIntegerArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  const value = Number(index < 0 ? fallback : process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive safe integer`)
  }
  return value
}

function quantile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

interface TimedBatch {
  durationsMs: number[]
  operations: number
  checksum: number
}

function timeBatches(
  warmups: number,
  samples: number,
  operations: number,
  run: () => number,
  onWarmupsComplete: () => void = () => {},
): TimedBatch {
  let checksum = 0
  for (let index = 0; index < warmups; index += 1) checksum += run()
  onWarmupsComplete()
  checksum = 0
  const durationsMs: number[] = []
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now()
    checksum += run()
    durationsMs.push(performance.now() - startedAt)
  }
  return { durationsMs, operations, checksum }
}

function summarize(batch: TimedBatch) {
  const sorted = [...batch.durationsMs].sort((left, right) => left - right)
  const totalMs = batch.durationsMs.reduce((sum, value) => sum + value, 0)
  const sampleCount = batch.durationsMs.length
  return {
    samples: sampleCount,
    operationsPerSample: batch.operations,
    totalOperations: batch.operations * sampleCount,
    totalMs,
    operationsPerSecond: totalMs === 0
      ? 0
      : (batch.operations * sampleCount * 1_000) / totalMs,
    batchTimingMs: {
      p50: quantile(sorted, 0.5),
      p95: sampleCount >= 20 ? quantile(sorted, 0.95) : null,
      p99: sampleCount >= 100 ? quantile(sorted, 0.99) : null,
      max: sorted.at(-1) ?? 0,
      note: sampleCount < 20
        ? 'smoke only; too few batches for p95/p99'
        : sampleCount < 100
          ? 'p95 reported; too few batches for p99'
          : 'p50/p95/p99 use nearest-rank batch quantiles',
    },
    checksum: batch.checksum,
  }
}

function conditionProfileForRecipe(recipe: Readonly<RecipeProfile>): WeightedConditionProfile {
  let profile: WeightedConditionProfile
  switch (recipe.missionFamily) {
    case 'sinus-ardorum-explus-equipment-materials-i':
      profile = BALANCED_POC_CONDITIONS
      break
    case 'sinus-ardorum-explus-elevating-platforms':
      profile = BALANCED_ELEVATING_PLATFORMS_CONDITIONS
      break
    case 'sinus-ardorum-ex-artisans-mixtures':
      profile = BALANCED_COMMAND_BREW_CONDITIONS
      break
    default:
      throw new Error(`benchmark has no condition profile for ${recipe.profileId}`)
  }
  assertConditionProfileCompatible(recipe, profile)
  return profile
}

interface PreparedTransition {
  recipe: Readonly<RecipeProfile>
  crafter: Readonly<CrafterProfile>
  state: Readonly<CraftState>
  action: CraftActionId
}

const crafters = PLAYER_EQUIPMENT_PROFILES.map(({ crafter }) => crafter)
const preparedTransitions: PreparedTransition[] = CRAFT_SCENARIO_DATA.flatMap(({ recipe }) => (
  crafters.map((crafter) => ({
    recipe,
    crafter,
    state: createInitialCraftState(recipe, crafter),
    action: 'reflect' as const,
  }))
))

const warmups = positiveIntegerArgument('warmups', 2)
const samples = positiveIntegerArgument('samples', 7)
const transitionIterations = positiveIntegerArgument('transition-iterations', 200_000)
const episodeIterations = positiveIntegerArgument('episode-iterations', 500)
const searchIterations = positiveIntegerArgument('search-iterations', 3)
const nativeParityRepetitions = positiveIntegerArgument('native-parity-repetitions', 100)
const nativeRolloutRepetitions = positiveIntegerArgument('native-rollout-repetitions', 10_000)
const nativeRootPlanRepetitions = positiveIntegerArgument('native-root-plan-repetitions', 8_334)

const rssBefore = process.memoryUsage().rss
const transitionBatch = timeBatches(warmups, samples, transitionIterations, () => {
  let checksum = 0
  for (let index = 0; index < transitionIterations; index += 1) {
    const prepared = preparedTransitions[index % preparedTransitions.length]!
    const result = applyObservedOutcome(
      prepared.recipe,
      prepared.crafter,
      prepared.state,
      prepared.action,
      { success: true, nextCondition: 'normal' },
    )
    checksum += result.nextState.quality + result.nextState.progress + result.nextState.cp
  }
  return checksum
})

const episodeJobs = CRAFT_SCENARIO_DATA.flatMap(({ recipe }) => crafters.map((crafter) => ({
  recipe,
  crafter,
  initialState: createInitialCraftState(recipe, crafter),
  conditionProfile: conditionProfileForRecipe(recipe),
})))
const progressAndRepairPolicy: EpisodePolicy = (recipe, crafter, state) => {
  const legal = legalActions(recipe, crafter, state)
  if (state.durability <= 10) {
    const repair = legal.find((action) => action === 'mastersMend')
      ?? legal.find((action) => action === 'immaculateMend')
    if (repair !== undefined) return repair
  }
  return legal.find((action) => action === 'basicSynthesis')
    ?? legal.find((action) => action === 'carefulSynthesis')
    ?? legal[0]
    ?? null
}
let episodeActions = 0
let episodeStopReasons: Partial<Record<EpisodeStopReason, number>> = {}
const episodeBatch = timeBatches(warmups, samples, episodeIterations, () => {
  let checksum = 0
  for (let index = 0; index < episodeIterations; index += 1) {
    const job = episodeJobs[index % episodeJobs.length]!
    const result = runEpisode({
      recipe: job.recipe,
      crafter: job.crafter,
      initialState: job.initialState,
      firstAction: 'basicSynthesis',
      policy: progressAndRepairPolicy,
      random: createEpisodeRandomStream((0x51a7_0000 + index) >>> 0),
      conditionProfile: job.conditionProfile,
      maxSteps: 60,
    })
    episodeActions += result.actions.length
    episodeStopReasons[result.stopReason] = (episodeStopReasons[result.stopReason] ?? 0) + 1
    checksum += result.actions.length + result.finalState.progress + result.finalState.quality
  }
  return checksum
}, () => {
  episodeActions = 0
  episodeStopReasons = {}
})

let expandedBeamNodes = 0
let candidateAdvanceCalls = 0
let searchSuccessDrawReads = 0
let searchConditionDrawReads = 0
const searchJobs = CRAFT_SCENARIO_DATA.map(({ recipe, objective }) => {
  const crafter = crafters[1]!
  return {
    context: { recipe, objective, crafter },
    state: createInitialCraftState(recipe, crafter),
    conditionProfile: conditionProfileForRecipe(recipe),
  }
})
const searchOperations = searchIterations * searchJobs.length
const searchBatch = timeBatches(warmups, samples, searchOperations, () => {
  let checksum = 0
  for (let iteration = 0; iteration < searchIterations; iteration += 1) {
    for (const [jobIndex, job] of searchJobs.entries()) {
      const plan = planWithScenarioBeam(job.context, job.state, {
        profiles: [job.conditionProfile],
        scenariosPerProfile: 2,
        beamWidth: 8,
        maxActions: 4,
        seed: (0x5ea2_0000 + iteration * searchJobs.length + jobIndex) >>> 0,
      })
      if (plan === null) continue
      expandedBeamNodes += plan.expandedBeamNodes
      candidateAdvanceCalls += plan.candidateAdvanceCalls
      searchSuccessDrawReads += plan.successDrawReads
      searchConditionDrawReads += plan.conditionDrawReads
      checksum += plan.candidateAdvanceCalls + plan.score.averageScenarioPotential
    }
  }
  return checksum
}, () => {
  expandedBeamNodes = 0
  candidateAdvanceCalls = 0
  searchSuccessDrawReads = 0
  searchConditionDrawReads = 0
})

const searchSummary = summarize(searchBatch)
const nativeTransitionCases = prepareNativeTransitionBatch()
const nativeTransitionActionCount = new Set(
  nativeTransitionCases.map(({ spec }) => spec.action),
).size
const nativeTransitionTypeScript = benchmarkTypeScriptTransitionBatch(
  nativeTransitionCases,
  nativeParityRepetitions,
  warmups,
)
const nativeTransitionRust = runNativeTransitionBatch(
  process.cwd(),
  nativeTransitionCases,
  1,
)
const nativeTransitionRustCore = runNativeCoreTransitionBenchmark(
  process.cwd(),
  nativeTransitionCases,
  nativeParityRepetitions,
)
const nativeRolloutCases = prepareNativeRolloutBatch()
const nativeRolloutTypeScript = benchmarkTypeScriptRolloutBatch(
  nativeRolloutCases,
  nativeRolloutRepetitions,
  warmups,
)
const nativeRolloutRust = runNativeRolloutBatch(
  process.cwd(),
  nativeRolloutCases,
  1,
)
const nativeRolloutRustCore = runNativeCoreRolloutBenchmark(
  process.cwd(),
  nativeRolloutCases,
  nativeRolloutRepetitions,
)
const nativeRootPlanMatrices = prepareNativeRootPlanMatrix()
const nativeRootPlanTypeScript = benchmarkTypeScriptRootPlanMatrix(
  nativeRootPlanMatrices,
  nativeRootPlanRepetitions,
  warmups,
)
const nativeRootPlanRust = runNativeRootPlanMatrix(
  process.cwd(),
  nativeRootPlanMatrices,
)
const nativeRootPlanRustCore = runNativeCoreRootPlanMatrixBenchmark(
  process.cwd(),
  nativeRootPlanMatrices,
  nativeRootPlanRepetitions,
)
const rssAfterTimedKernels = process.memoryUsage().rss
const correctnessPayload = {
  schema: 'ts-kernel-benchmark-correctness-v1',
  transition: preparedTransitions.map((prepared, index) => ({
    index,
    result: applyObservedOutcome(
      prepared.recipe,
      prepared.crafter,
      prepared.state,
      prepared.action,
      { success: true, nextCondition: 'normal' },
    ),
  })),
  episode: episodeJobs.map((job, index) => ({
    index,
    result: runEpisode({
      recipe: job.recipe,
      crafter: job.crafter,
      initialState: job.initialState,
      firstAction: 'basicSynthesis',
      policy: progressAndRepairPolicy,
      random: createEpisodeRandomStream((0x0c0f_fe00 + index) >>> 0),
      conditionProfile: job.conditionProfile,
      maxSteps: 60,
    }),
  })),
  search: searchJobs.map((job, index) => ({
    index,
    result: planWithScenarioBeam(job.context, job.state, {
      profiles: [job.conditionProfile],
      scenariosPerProfile: 2,
      beamWidth: 8,
      maxActions: 4,
      seed: (0x0bea_0000 + index) >>> 0,
    }),
  })),
}
const payloadEncodeStartedAt = performance.now()
const encodedCorrectnessPayload = JSON.stringify(correctnessPayload)
const payloadEncodeMs = performance.now() - payloadEncodeStartedAt
const resultHash = createHash('sha256').update(encodedCorrectnessPayload).digest('hex')
const expectedResultHash: string = '38fcc67740c85d3339b2f298b657ae5891db9288e935b31d79854b4904c708b1'
if (expectedResultHash !== 'TO_BE_RECORDED' && resultHash !== expectedResultHash) {
  throw new Error(`benchmark correctness hash mismatch: ${resultHash}`)
}
const totalEpisodeCalls = episodeBatch.operations * episodeBatch.durationsMs.length
const totalPlannerCalls = searchBatch.operations * searchBatch.durationsMs.length
const workload = CRAFT_SCENARIO_DATA.map(({ scenarioId, recipe, objective }) => {
  const conditionProfile = conditionProfileForRecipe(recipe)
  return {
    scenarioId,
    recipeProfileId: recipe.profileId,
    objectiveId: objective.objectiveId,
    transitionAndEpisodeCrafterProfileIds: PLAYER_EQUIPMENT_PROFILES.map((profile) => profile.id),
    searchCrafterProfileIds: [PLAYER_EQUIPMENT_PROFILES[1]!.id],
    conditionProfileId: conditionProfile.id,
    conditionEvidence: conditionProfile.evidence,
  }
})
const report = {
  schema: 'ts-kernel-benchmark-smoke-v4',
  measuredAt: new Date().toISOString(),
  source: {
    gitCommit: process.env.FROZEN_RABBIT_BENCHMARK_GIT_COMMIT ?? 'unknown',
    dirty: process.env.FROZEN_RABBIT_BENCHMARK_GIT_DIRTY ?? 'unknown',
    bundleSha256: process.env.FROZEN_RABBIT_BENCHMARK_BUNDLE_SHA256 ?? 'unknown',
    plannerVersion: SCENARIO_BEAM_PLANNER_VERSION,
    mechanicsVersion: MODEL_VERSIONS.mechanics,
  },
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? 'unknown',
    benchmarkProcessElapsedMs: process.uptime() * 1_000,
  },
  workload: {
    workloadId: 'five-product-recipes-three-regression-seen-crafters-smoke-v1',
    transitionCase: 'successful Reflect from the initial state',
    episodePolicyId: 'progress-and-repair-engine-smoke-v1',
    searchPlannerEvidence: 'optimistic existence negative-control; not causal policy evidence',
    scenarios: workload,
    searchBudget: {
      profiles: 1,
      scenariosPerProfile: 2,
      beamWidth: 8,
      maxActions: 4,
    },
    nativeTransitionParity: {
      fixtureVersion: 'native-transition-batch-v1',
      casesPerRepetition: nativeTransitionCases.length,
      repetitions: nativeParityRepetitions,
      actionsExercised: nativeTransitionActionCount,
      actionsDefined: ACTION_IDS.length,
      coverage: [
        'five product recipes and three regression-seen equipment panels',
        'all conditions and buff fields',
        'success/failure, specialist/no-step, terminal boundaries',
        'preview/state/explanation and independent RNG cursor consumption',
      ],
    },
    nativeFixedActionRolloutParity: {
      fixtureVersion: 'native-rollout-batch-v1',
      casesPerRepetition: nativeRolloutCases.length,
      repetitions: nativeRolloutRepetitions,
      operation: 'one complete fixed-action rollout; transitions are counted separately',
      coverage: [
        'all five product recipes and all three regression-seen equipment panels',
        'multi-step RNG, Good Omen, specialist no-step resources, completion, and failure',
        'illegal action, policy-null, and action-limit stop boundaries',
      ],
      limit: 'fixed action sequences only; this is not adaptive guide, MPC, beam, or search parity',
    },
    nativeFixedContinuationRootPlanMatrix: {
      fixtureVersion: 'native-root-plan-matrix-v1',
      requestsPerRepetition: nativeRootPlanMatrices.length,
      repetitions: nativeRootPlanRepetitions,
      operation: 'one root candidate x paired seed episode using one shared fixed continuation',
      coverage: [
        'all five product scenarios, all three regression-seen panels, and two condition profiles per scenario',
        'three root actions paired on four explicit seeds per request',
        'raw terminal, stop reason, action trace, state, explanation, RNG cursor, and scenario/profile identity',
      ],
      limit: 'fixed continuation only; this is not the adaptive guide continuation, compact scorer, MPC, or generic search',
    },
  },
  sampling: {
    warmupBatches: warmups,
    samples,
    transitionCallsPerBatch: transitionIterations,
    episodeCallsPerBatch: episodeIterations,
    plannerCallsPerBatch: searchOperations,
    nativeParityRepetitions,
    nativeRolloutRepetitions,
    nativeRootPlanRepetitions,
    note: samples < 20
      ? 'deterministic smoke; not a percentile or release baseline'
      : 'local development benchmark; not target-device evidence',
  },
  transition: {
    operation: 'one applyObservedOutcome call',
    ...summarize(transitionBatch),
  },
  episode: {
    operation: 'one complete runEpisode call',
    ...summarize(episodeBatch),
    episodeActions,
    actionsPerSecond: episodeBatch.durationsMs.length === 0
      ? 0
      : (episodeActions * 1_000) / episodeBatch.durationsMs.reduce((sum, value) => sum + value, 0),
    stopReasons: episodeStopReasons,
    episodeCalls: totalEpisodeCalls,
  },
  search: {
    operation: 'one planWithScenarioBeam call',
    ...searchSummary,
    plannerCalls: totalPlannerCalls,
    expandedBeamNodes,
    candidateAdvanceCalls,
    successDrawReads: searchSuccessDrawReads,
    conditionDrawReads: searchConditionDrawReads,
    expandedBeamNodesPerSecond: searchSummary.totalMs === 0
      ? 0
      : (expandedBeamNodes * 1_000) / searchSummary.totalMs,
    candidateAdvanceCallsPerSecond: searchSummary.totalMs === 0
      ? 0
      : (candidateAdvanceCalls * 1_000) / searchSummary.totalMs,
  },
  nativeTransitionParity: {
    operation: 'one versioned preview/apply/simulate fixture case',
    correctnessHashAlgorithm:
      'sha256 over full comparable rows; matched exposed-field fnv1a32 for repeated core timing',
    typescript: nativeTransitionTypeScript,
    rustProtocolBatch: nativeTransitionRust,
    rustCoreBatch: nativeTransitionRustCore,
    comparison: nativeTransitionRust.available
      ? {
          protocolParityCaseCountMatch:
            nativeTransitionRust.operations === nativeTransitionCases.length,
          coreOperationsMatch:
            nativeTransitionRustCore.available
              && nativeTransitionRustCore.operations === nativeTransitionTypeScript.operations,
          coreFnv1a32Match:
            nativeTransitionRustCore.available
              && nativeTransitionRustCore.fnv1a32Hex === nativeTransitionTypeScript.fnv1a32Hex,
          correctnessHashMatch:
            nativeTransitionRust.correctnessSha256
              === nativeTransitionTypeScript.correctnessSha256,
          rustToTypeScriptThroughputRatio:
            nativeTransitionTypeScript.operationsPerSecond === 0
              ? null
              : nativeTransitionRust.operationsPerSecond
                / nativeTransitionTypeScript.operationsPerSecond,
          rustCoreToTypeScriptThroughputRatio:
            nativeTransitionTypeScript.operationsPerSecond === 0
            || !nativeTransitionRustCore.available
              ? null
              : nativeTransitionRustCore.operationsPerSecond
                / nativeTransitionTypeScript.operationsPerSecond,
          rustCoreEndToEndToTypeScriptThroughputRatio:
            !nativeTransitionRustCore.available
            || nativeTransitionRustCore.processElapsedMs === 0
            || nativeTransitionTypeScript.operationsPerSecond === 0
              ? null
              : (nativeTransitionRustCore.operations * 1_000
                  / nativeTransitionRustCore.processElapsedMs)
                / nativeTransitionTypeScript.operationsPerSecond,
          warning: [
            'timing scopes are reported separately',
            'rustProtocolBatch includes TSV parse/format/hash; rustCoreBatch excludes per-op protocol work',
            'both Rust modes expose process boundary time separately',
            'this is a batch mechanics benchmark, not end-to-end planner or runtime latency',
          ].join('; '),
        }
      : null,
  },
  nativeFixedActionRolloutParity: {
    operation: 'one complete versioned fixed-action rollout fixture case',
    correctnessHashAlgorithm: [
      'sha256 over complete comparable result rows for protocol parity',
      'matched binary exposed-field fnv1a32 for repeated core timing',
    ].join('; '),
    typescript: nativeRolloutTypeScript,
    rustProtocolBatch: nativeRolloutRust,
    rustCoreBatch: nativeRolloutRustCore,
    comparison: nativeRolloutRust.available
      ? {
          protocolParityCaseCountMatch:
            nativeRolloutRust.operations === nativeRolloutCases.length,
          protocolTransitionCountMatch:
            nativeRolloutRust.transitions
              === nativeRolloutCases.reduce((sum, entry) => sum + entry.oracle.steps.length, 0),
          coreOperationsMatch:
            nativeRolloutRustCore.available
              && nativeRolloutRustCore.operations === nativeRolloutTypeScript.operations,
          coreTransitionsMatch:
            nativeRolloutRustCore.available
              && nativeRolloutRustCore.transitions === nativeRolloutTypeScript.transitions,
          coreFnv1a32Match:
            nativeRolloutRustCore.available
              && nativeRolloutRustCore.fnv1a32Hex === nativeRolloutTypeScript.fnv1a32Hex,
          correctnessHashMatch:
            nativeRolloutRust.correctnessSha256 === nativeRolloutTypeScript.correctnessSha256,
          rustCoreToTypeScriptRolloutThroughputRatio:
            nativeRolloutTypeScript.operationsPerSecond === 0
            || !nativeRolloutRustCore.available
              ? null
              : nativeRolloutRustCore.operationsPerSecond
                / nativeRolloutTypeScript.operationsPerSecond,
          rustCoreToTypeScriptTransitionThroughputRatio:
            nativeRolloutTypeScript.transitionsPerSecond === 0
            || !nativeRolloutRustCore.available
              ? null
              : nativeRolloutRustCore.transitionsPerSecond
                / nativeRolloutTypeScript.transitionsPerSecond,
          rustCoreEndToEndToTypeScriptRolloutThroughputRatio:
            !nativeRolloutRustCore.available
            || nativeRolloutRustCore.processElapsedMs === 0
            || nativeRolloutTypeScript.operationsPerSecond === 0
              ? null
              : (nativeRolloutRustCore.operations * 1_000
                  / nativeRolloutRustCore.processElapsedMs)
                / nativeRolloutTypeScript.operationsPerSecond,
          warning: [
            'one operation is a full fixed-action rollout, not one transition',
            'protocol and core timing scopes are reported separately',
            'this does not include an adaptive policy, planner, or search kernel',
          ].join('; '),
        }
      : null,
  },
  nativeFixedContinuationRootPlanMatrix: {
    operation: 'one root candidate x paired seed complete fixed-continuation episode',
    correctnessHashAlgorithm: [
      'sha256 over complete raw paired protocol outcomes and identities',
      'matched binary exposed-field fnv1a32 for repeated core timing',
      'plan fnv is a wire diagnostic, not a cryptographic seal',
    ].join('; '),
    typescript: nativeRootPlanTypeScript,
    rustProtocolBatch: nativeRootPlanRust,
    rustCoreBatch: nativeRootPlanRustCore,
    comparison: nativeRootPlanRust.available
      ? {
          protocolOperationsMatch:
            nativeRootPlanRust.operations === nativeRootPlanMatrices.reduce((sum, entry) => (
              sum + entry.spec.candidates.length * entry.spec.samples.length
            ), 0),
          protocolCorrectnessSha256Match:
            nativeRootPlanRust.correctnessSha256 === nativeRootPlanTypeScript.correctnessSha256,
          coreOperationsMatch:
            nativeRootPlanRustCore.available
              && nativeRootPlanRustCore.operations === nativeRootPlanTypeScript.operations,
          coreTransitionsMatch:
            nativeRootPlanRustCore.available
              && nativeRootPlanRustCore.transitions === nativeRootPlanTypeScript.transitions,
          coreFnv1a32Match:
            nativeRootPlanRustCore.available
              && nativeRootPlanRustCore.fnv1a32Hex === nativeRootPlanTypeScript.fnv1a32Hex,
          rustCoreToTypeScriptEpisodeThroughputRatio:
            nativeRootPlanTypeScript.operationsPerSecond === 0
            || !nativeRootPlanRustCore.available
              ? null
              : nativeRootPlanRustCore.operationsPerSecond
                / nativeRootPlanTypeScript.operationsPerSecond,
          rustCoreProcessToTypeScriptEpisodeThroughputRatio:
            nativeRootPlanTypeScript.operationsPerSecond === 0
            || !nativeRootPlanRustCore.available
            || nativeRootPlanRustCore.processElapsedMs === 0
              ? null
              : (nativeRootPlanRustCore.operations * 1_000
                  / nativeRootPlanRustCore.processElapsedMs)
                / nativeRootPlanTypeScript.operationsPerSecond,
          warning: [
            'Rust core excludes process startup and input TSV parse; process-inclusive ratio includes both',
            'protocol batch separately includes full trace formatting/stdout/parsing for one fixture batch',
            'these numbers prove fixed-continuation batch throughput only, not strategy quality or adaptive planner latency',
          ].join('; '),
        }
      : null,
  },
  counterDefinitions: {
    transitionCalls: 'timed applyObservedOutcome invocations',
    episodeCalls: 'timed complete runEpisode invocations',
    episodeActions: 'actions recorded by timed episodes, including firstAction',
    plannerCalls: 'timed planWithScenarioBeam invocations',
    expandedBeamNodes: 'scenario root plus each prior-depth beam node expanded',
    candidateAdvanceCalls: [
      'calls to the scenario beam advance helper',
      'excludes legalActions scans and safety previews',
      'each call includes previewAction plus applyObservedOutcome, which previews again',
    ].join('; '),
    successDrawReads: 'simulated branch-level reads from the pre-generated success tape',
    conditionDrawReads: 'simulated branch-level reads; forced Good Omen does not consume a draw',
  },
  correctness: {
    hashAlgorithm: 'sha256',
    payloadSchema: correctnessPayload.schema,
    resultHash,
    expectedResultHash,
    matchesExpected: expectedResultHash !== 'TO_BE_RECORDED' && resultHash === expectedResultHash,
  },
  memory: {
    scope: 'whole Node process before/after all timed kernels; not peak or per-kernel RSS',
    rssBeforeBytes: rssBefore,
    rssAfterBytes: rssAfterTimedKernels,
  },
  serialization: {
    payloadKind: 'correctness oracle JSON; not a native ABI payload',
    bytes: Buffer.byteLength(encodedCorrectnessPayload),
    encodeMs: payloadEncodeMs,
  },
}
console.log(JSON.stringify(report, null, 2))
