import { performance } from 'node:perf_hooks'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_DEVELOPMENT_CORPUS,
  COMMAND_BREW_FROZEN_VALIDATION_CORPUS,
  corpusSeeds,
  createAdaptivePolicyEpisodeAdapterV1,
  type PolicyEvaluationCorpus,
} from '@frozen-rabbit-expert/policy-lab'
import {
  COMMAND_BREW_CROSS_EQUIPMENT_POLICY_VERSION,
  COMMAND_BREW_CONDITION_AWARE_GUIDE_POLICY_VERSION,
  createCommandBrewConditionAwareGuidePolicy,
  createCommandBrewCrossEquipmentPolicyController,
  type CommandBrewCrossEquipmentMode,
} from '../../packages/policy-lab/src/commandBrewCrossEquipmentPolicy'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM_VERSION,
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'
import {
  COMMAND_BREW_REQUIRED_CATASTROPHE_SEED_COUNT,
  COMMAND_BREW_RISK_COVERAGE_MANIFEST_VERSION,
  buildCommandBrewRiskAwareDevelopmentReport,
  type CommandBrewRiskCoverageManifest,
} from './riskEvaluation'

const ALL_NORMAL: WeightedConditionProfile = {
  id: 'command-brew-adversarial-all-normal-v1',
  evidence: 'assumption',
  weights: { normal: 1 },
}
const ALL_MALLEABLE: WeightedConditionProfile = {
  id: 'command-brew-adversarial-all-malleable-v1',
  evidence: 'assumption',
  weights: { malleable: 1 },
}
const PRIMARY_PROFILES = COMMAND_BREW_SENSITIVITY_PROFILES
const STRESS_PROFILES = [ALL_NORMAL, ALL_MALLEABLE] as const
const MAX_STEPS = 80
const includeExamples = process.argv.includes('--examples')
const includeConditionAwareGuide = process.argv.includes('--include-condition-aware')
  && !process.argv.includes('--route-only')

function positiveIntegerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function nonNegativeIntegerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`)
  return value
}

function selectedCorpus(): PolicyEvaluationCorpus {
  const index = process.argv.indexOf('--corpus')
  const name = index < 0 ? 'development' : process.argv[index + 1]
  if (name === 'development') return COMMAND_BREW_DEVELOPMENT_CORPUS
  if (name === 'frozen') {
    if (!process.argv.includes('--acknowledge-historical-frozen-regression-only')) {
      throw new Error('frozen corpus is already inspected and requires --acknowledge-historical-frozen-regression-only')
    }
    return COMMAND_BREW_FROZEN_VALIDATION_CORPUS
  }
  throw new RangeError('--corpus must be development or frozen')
}

interface EpisodeKey {
  equipmentId: string
  conditionProfileId: string
  seed: number
}

interface EvaluatedEpisode extends EpisodeKey {
  result: EpisodeTraceResult
  mode: CommandBrewCrossEquipmentMode | 'guide-baseline' | 'condition-aware-guide' | 'adaptive-program'
  safetyViolations: number
  latencyMs: number[]
  conditionFishingEvents: readonly []
}

function evaluateEpisode(
  equipment: (typeof PLAYER_EQUIPMENT_PROFILES)[number],
  profile: WeightedConditionProfile,
  seed: number,
  arm: 'baseline' | 'route-candidate' | 'condition-aware-guide' | 'adaptive-program',
): EvaluatedEpisode {
  const crafter = equipment.crafter
  const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const candidate = arm === 'route-candidate'
    ? createCommandBrewCrossEquipmentPolicyController(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      )
    : null
  let safetyViolations = 0
  const latencyMs: number[] = []
  const adaptiveAdapter = arm === 'adaptive-program'
    ? (() => {
        const startedAt = performance.now()
        const adapter = createAdaptivePolicyEpisodeAdapterV1({
          scenarioId: 'survey-craftsmans-command-brew',
          recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
          objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
          crafter,
        }, COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM, initialState)
        latencyMs.push(performance.now() - startedAt)
        return adapter
      })()
    : null
  const policy = adaptiveAdapter?.policy
    ?? candidate?.policy
    ?? (arm === 'condition-aware-guide'
      ? createCommandBrewConditionAwareGuidePolicy(SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE)
      : createGuideIntegratedPolicyFactory(
          DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
          SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
        )())
  const auditAction = (
    recipe: typeof SURVEY_CRAFTSMANS_COMMAND_BREW,
    activeCrafter: typeof crafter,
    state: ReturnType<typeof createInitialCraftState>,
    action: CraftActionId | null,
  ) => {
    if (
      action !== null
      && (
        !legalActions(recipe, activeCrafter, state).includes(action)
        || !isPolicyActionSafe(recipe, activeCrafter, state, action, previewAction(recipe, activeCrafter, state, action))
      )
    ) safetyViolations += 1
    return action
  }
  const audited: EpisodePolicy = (recipe, activeCrafter, state) => {
    const startedAt = performance.now()
    const action = policy(recipe, activeCrafter, state)
    latencyMs.push(performance.now() - startedAt)
    return auditAction(recipe, activeCrafter, state, action)
  }
  const firstAction = adaptiveAdapter === null
    ? audited(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, initialState)
    : auditAction(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        initialState,
        adaptiveAdapter.firstAction,
      )
  const result = firstAction === null
    ? {
        terminal: 'none' as const,
        finalState: initialState,
        actions: [] as CraftActionId[],
        steps: [],
        stoppedByLimit: false,
        stopReason: 'policy-null' as const,
      }
    : runEpisodeTrace({
        recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        initialState,
        firstAction,
        policy: audited,
        random: createEpisodeRandomStream(seed),
        conditionProfile: profile,
        maxSteps: MAX_STEPS,
      })
  if (adaptiveAdapter !== null) {
    if (adaptiveAdapter.hasPendingObservation()) {
      adaptiveAdapter.observeFinalState(result.finalState)
    }
    const memory = adaptiveAdapter.controller.snapshot()
    if (memory.totalActionUses !== result.actions.length) {
      throw new Error(
        `adaptive program observation drift: ${memory.totalActionUses} observed for ${result.actions.length} actions`,
      )
    }
    if (
      result.terminal !== 'none'
      && (!memory.terminated || memory.terminationReason !== `craft-${result.terminal}`)
    ) {
      throw new Error(
        `adaptive program terminal drift: ${String(memory.terminationReason)} for ${result.terminal}`,
      )
    }
  }
  return {
    equipmentId: equipment.id,
    conditionProfileId: profile.id,
    seed,
    result,
    mode: adaptiveAdapter !== null
      ? 'adaptive-program'
      : candidate?.mode ?? (arm === 'condition-aware-guide' ? 'condition-aware-guide' : 'guide-baseline'),
    safetyViolations,
    latencyMs,
    // Current built-in arms do not contain an intentional fishing option.
    // Future Observe candidates must attach their exact step intent rather
    // than asking the analyzer to infer it from the action name.
    conditionFishingEvents: [],
  }
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function summarize(episodes: readonly EvaluatedEpisode[]) {
  const completed = episodes.filter((episode) => episode.result.terminal === 'completed')
  const quality = completed.map((episode) => episode.result.finalState.quality)
  const actions = completed.map((episode) => episode.result.actions.length)
  const latency = episodes.flatMap((episode) => episode.latencyMs)
  const failures = episodes.reduce((sum, episode) => (
    sum + episode.result.steps.filter((step) => !step.success).length
  ), 0)
  return {
    episodes: episodes.length,
    completion: completed.length,
    fullQuality12000: completed.filter((episode) => episode.result.finalState.quality >= 12_000).length,
    highQuality10200: completed.filter((episode) => episode.result.finalState.quality >= 10_200).length,
    midQuality7200: completed.filter((episode) => episode.result.finalState.quality >= 7_200).length,
    quality: {
      minimum: quality.length === 0 ? 0 : Math.min(...quality),
      p10: percentile(quality, 0.1),
      median: percentile(quality, 0.5),
      average: quality.length === 0 ? 0 : quality.reduce((sum, value) => sum + value, 0) / quality.length,
      maximum: Math.max(...quality, 0),
    },
    actions: {
      average: actions.length === 0 ? 0 : actions.reduce((sum, value) => sum + value, 0) / actions.length,
      p90: percentile(actions, 0.9),
    },
    riskyActionFailures: failures,
    safetyViolations: episodes.reduce((sum, episode) => sum + episode.safetyViolations, 0),
    latency: {
      p50Ms: percentile(latency, 0.5),
      p95Ms: percentile(latency, 0.95),
      maxMs: Math.max(...latency, 0),
    },
    ...(includeExamples ? {
      noncompletionExamples: episodes
        .filter((episode) => episode.result.terminal !== 'completed')
        .slice(0, 5)
        .map((episode) => ({
          equipmentId: episode.equipmentId,
          conditionProfileId: episode.conditionProfileId,
          seed: episode.seed,
          terminal: episode.result.terminal,
          stopReason: episode.result.stopReason,
          progress: episode.result.finalState.progress,
          quality: episode.result.finalState.quality,
          durability: episode.result.finalState.durability,
          cp: episode.result.finalState.cp,
          actions: episode.result.actions,
          steps: episode.result.steps.map((step) => ({
            action: step.action,
            condition: step.before.condition,
            progress: `${step.before.progress}->${step.after.progress}`,
            quality: `${step.before.quality}->${step.after.quality}`,
            durability: `${step.before.durability}->${step.after.durability}`,
            cp: `${step.before.cp}->${step.after.cp}`,
          })),
        })),
      riskyFailureExamples: episodes
        .filter((episode) => episode.result.steps.some((step) => !step.success))
        .slice(0, 3)
        .map((episode) => ({
          equipmentId: episode.equipmentId,
          conditionProfileId: episode.conditionProfileId,
          seed: episode.seed,
          quality: episode.result.finalState.quality,
          actions: episode.result.actions,
        })),
    } : {}),
  }
}

function paired(
  baseline: readonly EvaluatedEpisode[],
  candidate: readonly EvaluatedEpisode[],
) {
  const baselineByKey = new Map(baseline.map((episode) => [
    `${episode.equipmentId}|${episode.conditionProfileId}|${episode.seed}`,
    episode,
  ]))
  let completionWins = 0
  let completionLosses = 0
  let qualityWins = 0
  let qualityLosses = 0
  let qualityTies = 0
  let fullQualityWins = 0
  let fullQualityLosses = 0
  let fullQualityTies = 0
  const tier7200 = { wins: 0, losses: 0, ties: 0 }
  const tier10200 = { wins: 0, losses: 0, ties: 0 }
  let bothFullShorter = 0
  let bothFullLonger = 0
  let bothFullSame = 0
  let qualityDelta = 0
  let worstQualityDelta = Number.POSITIVE_INFINITY
  let worstQualityDeltaKey: string | null = null
  for (const candidateEpisode of candidate) {
    const key = `${candidateEpisode.equipmentId}|${candidateEpisode.conditionProfileId}|${candidateEpisode.seed}`
    const baselineEpisode = baselineByKey.get(key)
    if (baselineEpisode === undefined) throw new Error(`missing paired baseline ${key}`)
    const baselineCompleted = baselineEpisode.result.terminal === 'completed'
    const candidateCompleted = candidateEpisode.result.terminal === 'completed'
    if (candidateCompleted && !baselineCompleted) completionWins += 1
    if (!candidateCompleted && baselineCompleted) completionLosses += 1
    const baselineQuality = baselineCompleted ? baselineEpisode.result.finalState.quality : 0
    const candidateQuality = candidateCompleted ? candidateEpisode.result.finalState.quality : 0
    const episodeQualityDelta = candidateQuality - baselineQuality
    qualityDelta += episodeQualityDelta
    if (episodeQualityDelta < worstQualityDelta) {
      worstQualityDelta = episodeQualityDelta
      worstQualityDeltaKey = key
    }
    if (candidateQuality > baselineQuality) qualityWins += 1
    else if (candidateQuality < baselineQuality) qualityLosses += 1
    else qualityTies += 1
    const baselineFull = baselineCompleted && baselineQuality >= 12_000
    const candidateFull = candidateCompleted && candidateQuality >= 12_000
    for (const [threshold, outcome] of [[7_200, tier7200], [10_200, tier10200]] as const) {
      const baselineReached = baselineCompleted && baselineQuality >= threshold
      const candidateReached = candidateCompleted && candidateQuality >= threshold
      if (candidateReached && !baselineReached) outcome.wins += 1
      else if (!candidateReached && baselineReached) outcome.losses += 1
      else outcome.ties += 1
    }
    if (candidateFull && !baselineFull) fullQualityWins += 1
    else if (!candidateFull && baselineFull) fullQualityLosses += 1
    else fullQualityTies += 1
    if (baselineFull && candidateFull) {
      const delta = candidateEpisode.result.actions.length - baselineEpisode.result.actions.length
      if (delta < 0) bothFullShorter += 1
      else if (delta > 0) bothFullLonger += 1
      else bothFullSame += 1
    }
  }
  return {
    episodes: candidate.length,
    completion: { wins: completionWins, losses: completionLosses },
    quality: {
      wins: qualityWins,
      losses: qualityLosses,
      ties: qualityTies,
      averageDelta: candidate.length === 0 ? 0 : qualityDelta / candidate.length,
      worstDelta: candidate.length === 0 ? 0 : worstQualityDelta,
      worstDeltaKey: worstQualityDeltaKey,
    },
    midQuality7200: tier7200,
    highQuality10200: tier10200,
    fullQuality: { wins: fullQualityWins, losses: fullQualityLosses, ties: fullQualityTies },
    bothFullActions: { shorter: bothFullShorter, longer: bothFullLonger, same: bothFullSame },
  }
}

function cellSummary(episodes: readonly EvaluatedEpisode[]) {
  const completed = episodes.filter((episode) => episode.result.terminal === 'completed')
  const quality = completed.map((episode) => episode.result.finalState.quality)
  return {
    episodes: episodes.length,
    completion: completed.length,
    midQuality7200: completed.filter((episode) => episode.result.finalState.quality >= 7_200).length,
    highQuality10200: completed.filter((episode) => episode.result.finalState.quality >= 10_200).length,
    fullQuality12000: completed.filter((episode) => episode.result.finalState.quality >= 12_000).length,
    minimumQuality: quality.length === 0 ? 0 : Math.min(...quality),
    p10Quality: percentile(quality, 0.1),
    averageQuality: quality.length === 0 ? 0 : quality.reduce((sum, value) => sum + value, 0) / quality.length,
  }
}

function pairedCells(
  baseline: readonly EvaluatedEpisode[],
  candidate: readonly EvaluatedEpisode[],
) {
  const keys = new Set(candidate.map((episode) => `${episode.equipmentId}|${episode.conditionProfileId}`))
  return Object.fromEntries([...keys].sort().map((key) => {
    const [equipmentId, conditionProfileId] = key.split('|')
    const baselineCell = baseline.filter((episode) => (
      episode.equipmentId === equipmentId && episode.conditionProfileId === conditionProfileId
    ))
    const candidateCell = candidate.filter((episode) => (
      episode.equipmentId === equipmentId && episode.conditionProfileId === conditionProfileId
    ))
    return [key, {
      baseline: cellSummary(baselineCell),
      candidate: cellSummary(candidateCell),
      paired: paired(baselineCell, candidateCell),
    }]
  }))
}

function byEquipment(episodes: readonly EvaluatedEpisode[]) {
  return Object.fromEntries(PLAYER_EQUIPMENT_PROFILES.map((equipment) => [
    equipment.id,
    {
      mode: episodes.find((episode) => episode.equipmentId === equipment.id)?.mode ?? null,
      ...summarize(episodes.filter((episode) => episode.equipmentId === equipment.id)),
    },
  ]))
}

function defaultPromotionDecision(
  baseline: { primary: readonly EvaluatedEpisode[]; stress: readonly EvaluatedEpisode[] },
  candidate: { primary: readonly EvaluatedEpisode[]; stress: readonly EvaluatedEpisode[] },
  coverage: {
    corpusRole: PolicyEvaluationCorpus['role']
    seedOffset: number
    seedCount: number
    availableSeedCount: number
    stressSeedCount: number
  },
) {
  const reasons: Array<Record<string, unknown>> = []
  if (coverage.corpusRole !== 'development') {
    reasons.push({
      kind: 'historical-inspected-corpus-not-fresh-promotion-evidence',
      corpusRole: coverage.corpusRole,
    })
  }
  if (
    coverage.seedOffset !== 0
    || coverage.seedCount !== coverage.availableSeedCount
    || coverage.stressSeedCount < Math.min(32, coverage.availableSeedCount)
  ) {
    reasons.push({
      kind: 'incomplete-development-coverage',
      seedOffset: coverage.seedOffset,
      seedCount: coverage.seedCount,
      availableSeedCount: coverage.availableSeedCount,
      stressSeedCount: coverage.stressSeedCount,
    })
  }
  for (const [slice, baselineEpisodes, candidateEpisodes] of [
    ['primary', baseline.primary, candidate.primary],
    ['stress', baseline.stress, candidate.stress],
  ] as const) {
    const pairedSummary = paired(baselineEpisodes, candidateEpisodes)
    if (pairedSummary.completion.losses > 0) {
      reasons.push({ kind: 'completion-regression', slice, losses: pairedSummary.completion.losses })
    }
    const safetyViolations = candidateEpisodes.reduce((sum, episode) => sum + episode.safetyViolations, 0)
    if (safetyViolations > 0) reasons.push({ kind: 'safety-violation', slice, count: safetyViolations })

    const invalidStops = candidateEpisodes.filter((episode) => (
      episode.result.stopReason === 'failed'
      || episode.result.stopReason === 'illegal-action'
      || episode.result.stopReason === 'policy-null'
      || episode.result.stopReason === 'no-legal-action'
      || episode.result.stopReason === 'action-limit'
    ))
    if (invalidStops.length > 0) {
      reasons.push({
        kind: 'hard-stop-or-craft-failure',
        slice,
        count: invalidStops.length,
        stopReasons: Object.fromEntries([
          'failed', 'illegal-action', 'policy-null', 'no-legal-action', 'action-limit',
        ].map((reason) => [
          reason,
          invalidStops.filter((episode) => episode.result.stopReason === reason).length,
        ])),
      })
    }

    // The adversarial all-Normal/all-Malleable slice proves catastrophic
    // completion and recovery only. Its quality is still reported below, but
    // may not veto a candidate that creates meaningful value in plausible
    // colored worlds.
    if (slice === 'stress') continue
    for (const [cellKey, comparison] of Object.entries(pairedCells(baselineEpisodes, candidateEpisodes))) {
      for (const field of ['midQuality7200', 'highQuality10200', 'fullQuality12000'] as const) {
        if (comparison.candidate[field] < comparison.baseline[field]) {
          reasons.push({
            kind: 'quality-tier-regression',
            slice,
            cellKey,
            tier: field,
            baseline: comparison.baseline[field],
            candidate: comparison.candidate[field],
          })
        }
      }
      if (comparison.candidate.p10Quality < comparison.baseline.p10Quality) {
        reasons.push({
          kind: 'quality-lower-tail-regression',
          slice,
          cellKey,
          baseline: comparison.baseline.p10Quality,
          candidate: comparison.candidate.p10Quality,
        })
      }
    }
  }
  return {
    evidenceKind: 'development-comparison-not-formal-sealed-promotion',
    formalPromotionEligible: false,
    developmentExpansionEligible: reasons.length === 0,
    recommendation: reasons.length === 0
      ? 'freeze-candidate-before-any-formal-validation'
      : 'reject-default-promotion-keep-as-conservative-floor-research-candidate',
    reasons,
  }
}

const corpus = selectedCorpus()
const availableSeeds = corpusSeeds(corpus)
const seedOffset = nonNegativeIntegerOption('--seed-offset', 0)
const seedCount = positiveIntegerOption('--seed-count', availableSeeds.length)
if (seedOffset + seedCount > availableSeeds.length) throw new RangeError('--seed-offset + --seed-count exceeds selected corpus')
const seeds = availableSeeds.slice(seedOffset, seedOffset + seedCount)
const stressSeedCount = Math.min(seedCount, positiveIntegerOption('--stress-seed-count', Math.min(32, seedCount)))
const stressSeeds = seeds.slice(0, stressSeedCount)
const riskCoverage: CommandBrewRiskCoverageManifest = {
  version: COMMAND_BREW_RISK_COVERAGE_MANIFEST_VERSION,
  corpusId: corpus.id,
  corpusRole: corpus.role,
  completeCoverage: corpus.role === 'development'
    && seedOffset === 0
    && seedCount === availableSeeds.length
    && stressSeedCount >= Math.min(COMMAND_BREW_REQUIRED_CATASTROPHE_SEED_COUNT, availableSeeds.length),
  equipmentIds: PLAYER_EQUIPMENT_PROFILES.map(({ id }) => id),
  plausibleConditionProfileIds: PRIMARY_PROFILES.map(({ id }) => id),
  catastropheConditionProfileIds: STRESS_PROFILES.map(({ id }) => id),
  plausibleSeeds: seeds,
  catastropheSeeds: stressSeeds,
}

function runArm(arm: 'baseline' | 'route-candidate' | 'condition-aware-guide' | 'adaptive-program') {
  const primary = PLAYER_EQUIPMENT_PROFILES.flatMap((equipment) => (
    PRIMARY_PROFILES.flatMap((profile) => seeds.map((seed) => evaluateEpisode(equipment, profile, seed, arm)))
  ))
  const stress = PLAYER_EQUIPMENT_PROFILES.flatMap((equipment) => (
    STRESS_PROFILES.flatMap((profile) => stressSeeds.map((seed) => evaluateEpisode(equipment, profile, seed, arm)))
  ))
  return { primary, stress }
}

const baseline = runArm('baseline')
const routeCandidate = runArm('route-candidate')
const adaptiveProgram = runArm('adaptive-program')
const conditionAwareGuide = includeConditionAwareGuide ? runArm('condition-aware-guide') : null
const routeDevelopmentDecision = defaultPromotionDecision(baseline, routeCandidate, {
  corpusRole: corpus.role,
  seedOffset,
  seedCount,
  availableSeedCount: availableSeeds.length,
  stressSeedCount,
})
const adaptiveProgramDevelopmentDecision = defaultPromotionDecision(baseline, adaptiveProgram, {
  corpusRole: corpus.role,
  seedOffset,
  seedCount,
  availableSeedCount: availableSeeds.length,
  stressSeedCount,
})
const routeRiskAwareDevelopment = corpus.role === 'development'
  ? buildCommandBrewRiskAwareDevelopmentReport({
      coverage: riskCoverage,
      plausible: { baseline: baseline.primary, candidate: routeCandidate.primary },
      catastropheRecovery: { baseline: baseline.stress, candidate: routeCandidate.stress },
      riskBudget: null,
    })
  : null
const adaptiveProgramRiskAwareDevelopment = corpus.role === 'development'
  ? buildCommandBrewRiskAwareDevelopmentReport({
      coverage: riskCoverage,
      plausible: { baseline: baseline.primary, candidate: adaptiveProgram.primary },
      catastropheRecovery: { baseline: baseline.stress, candidate: adaptiveProgram.stress },
      riskBudget: null,
    })
  : null

console.log(JSON.stringify({
  evidence: 'development-or-frozen-paired-model-evaluation-not-real-world-success-rate',
  baselineVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  candidateVersions: {
    route: COMMAND_BREW_CROSS_EQUIPMENT_POLICY_VERSION,
    adaptiveProgram: COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM_VERSION,
    conditionAwareGuide: COMMAND_BREW_CONDITION_AWARE_GUIDE_POLICY_VERSION,
  },
  recipeProfileId: SURVEY_CRAFTSMANS_COMMAND_BREW.profileId,
  objectiveId: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.objectiveId,
  corpus: { id: corpus.id, role: corpus.role },
  seedCount,
  seedOffset,
  stressSeedCount,
  corpusEvidenceBoundary: corpus.role === 'frozen-validation'
    ? 'historical-inspected-regression-only-not-fresh-promotion-evidence'
    : 'development-tuning-only',
  adaptiveProgramEvidenceBoundary: {
    equipment: 'three-regression-seen-player-panels-only-not-unseen-loadout-population',
    conditions: 'versioned-model-worlds-and-adversarial-streams-not-real-transition-probabilities',
    formalPromotionEligible: false,
  },
  routeDevelopmentDecision,
  adaptiveProgramDevelopmentDecision,
  riskAwareDevelopment: {
    note: 'External paired episode arrays remain development diagnostics: the analyzer replays canonical Command Brew transitions and exact coverage, but does not prove that arbitrary external arrays originated from the declared RNG stream. Formal promotion is always false.',
    corpusBoundary: corpus.role === 'development'
      ? 'development-tuning-only'
      : 'not-run-for-non-development-corpus',
    routeCandidate: routeRiskAwareDevelopment,
    adaptiveProgram: adaptiveProgramRiskAwareDevelopment,
  },
  primary: {
    baseline: summarize(baseline.primary),
    baselineByEquipment: byEquipment(baseline.primary),
    routeCandidate: summarize(routeCandidate.primary),
    routePaired: paired(baseline.primary, routeCandidate.primary),
    routeCandidateByEquipment: byEquipment(routeCandidate.primary),
    routePairedCells: pairedCells(baseline.primary, routeCandidate.primary),
    adaptiveProgram: summarize(adaptiveProgram.primary),
    adaptiveProgramPaired: paired(baseline.primary, adaptiveProgram.primary),
    adaptiveProgramByEquipment: byEquipment(adaptiveProgram.primary),
    adaptiveProgramPairedCells: pairedCells(baseline.primary, adaptiveProgram.primary),
    ...(conditionAwareGuide === null ? {} : {
      conditionAwareGuide: summarize(conditionAwareGuide.primary),
      conditionAwareGuidePaired: paired(baseline.primary, conditionAwareGuide.primary),
      conditionAwareGuideByEquipment: byEquipment(conditionAwareGuide.primary),
    }),
  },
  stress: {
    baseline: summarize(baseline.stress),
    baselineByEquipment: byEquipment(baseline.stress),
    routeCandidate: summarize(routeCandidate.stress),
    routePaired: paired(baseline.stress, routeCandidate.stress),
    routeCandidateByEquipment: byEquipment(routeCandidate.stress),
    routePairedCells: pairedCells(baseline.stress, routeCandidate.stress),
    adaptiveProgram: summarize(adaptiveProgram.stress),
    adaptiveProgramPaired: paired(baseline.stress, adaptiveProgram.stress),
    adaptiveProgramByEquipment: byEquipment(adaptiveProgram.stress),
    adaptiveProgramPairedCells: pairedCells(baseline.stress, adaptiveProgram.stress),
    ...(conditionAwareGuide === null ? {} : {
      conditionAwareGuide: summarize(conditionAwareGuide.stress),
      conditionAwareGuidePaired: paired(baseline.stress, conditionAwareGuide.stress),
      conditionAwareGuideByEquipment: byEquipment(conditionAwareGuide.stress),
    }),
  },
}, null, 2))
