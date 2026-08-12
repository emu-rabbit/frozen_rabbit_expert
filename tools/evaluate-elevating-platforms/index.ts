import { performance } from 'node:perf_hooks'
import {
  ACTIONS,
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  PLAYER_EQUIPMENT_PROFILES,
  estimateHqChancePercentFromCommunityTable,
  estimateMobileWorkStairsExpectedMissionPoints,
} from '@frozen-rabbit-expert/data'
import {
  ELEVATING_PLATFORMS_DEVELOPMENT_CORPUS,
  ELEVATING_PLATFORMS_FROZEN_VALIDATION_CORPUS,
  ELEVATING_PLATFORMS_FROZEN_VALIDATION_V2_CORPUS,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  ELEVATING_PLATFORMS_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeTraceResult,
} from '@frozen-rabbit-expert/simulator'
import {
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
  resolvePlayerProfilePolicyConfig,
  type GuideIntegratedPolicyConfig,
} from '@frozen-rabbit-expert/solver'
import { CRAFT_SCENARIOS } from '../../apps/web/src/scenarios'
import {
  estimateMissionDeadlines,
  pairMissionCraftAttempts,
  summarizeActionCounts,
  type MissionAttempt,
  type MissionCraftAttempt,
} from './missionTiming'

function positiveIntegerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? fallback : Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function positiveNumberOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? fallback : Number(process.argv[index + 1])
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number`)
  return value
}

function nonNegativeNumberOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? fallback : Number(process.argv[index + 1])
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number`)
  return value
}

const corpusOptionIndex = process.argv.indexOf('--corpus')
const corpusRole = corpusOptionIndex < 0 ? 'development' : process.argv[corpusOptionIndex + 1]
const evaluationCorpus = corpusRole === 'development'
  ? ELEVATING_PLATFORMS_DEVELOPMENT_CORPUS
  : corpusRole === 'frozen-validation'
    ? ELEVATING_PLATFORMS_FROZEN_VALIDATION_CORPUS
    : corpusRole === 'frozen-validation-v2'
      ? ELEVATING_PLATFORMS_FROZEN_VALIDATION_V2_CORPUS
    : null
if (evaluationCorpus === null) {
  throw new RangeError('--corpus must be development, frozen-validation, or frozen-validation-v2')
}
const corpusSeedsAll = corpusSeeds(evaluationCorpus)
const seedCount = positiveIntegerOption('--seed-count', 16)
if (seedCount > corpusSeedsAll.length) throw new RangeError(`--seed-count must be <= ${corpusSeedsAll.length}`)
const seeds = corpusSeedsAll.slice(0, seedCount)
function specialistModeOption(name: string, fallback: boolean): boolean {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const mode = process.argv[index + 1]
  if (mode !== 'allow' && mode !== 'forbid') {
    throw new RangeError(`${name} must be allow or forbid`)
  }
  return mode === 'allow'
}

const cashoutOptionIndex = process.argv.indexOf('--adaptive-cashout-cp')
const requestedCashoutCp = cashoutOptionIndex < 0 ? null : Number(process.argv[cashoutOptionIndex + 1])
if (requestedCashoutCp !== null && (!Number.isInteger(requestedCashoutCp) || requestedCashoutCp < 0)) {
  throw new RangeError('--adaptive-cashout-cp must be a non-negative integer')
}
const cashoutQualityOptionIndex = process.argv.indexOf('--adaptive-cashout-min-quality-ratio')
const requestedCashoutQualityRatio = cashoutQualityOptionIndex < 0
  ? null
  : Number(process.argv[cashoutQualityOptionIndex + 1])
if (
  requestedCashoutQualityRatio !== null
  && (!Number.isFinite(requestedCashoutQualityRatio)
    || requestedCashoutQualityRatio < 0
    || requestedCashoutQualityRatio > 1)
) throw new RangeError('--adaptive-cashout-min-quality-ratio must be between 0 and 1')
const scenarioOptionIndex = process.argv.indexOf('--scenario')
const requestedScenarioId = scenarioOptionIndex < 0 ? null : process.argv[scenarioOptionIndex + 1]
const equipmentOptionIndex = process.argv.indexOf('--equipment-profile')
const requestedEquipmentProfileId = equipmentOptionIndex < 0 ? null : process.argv[equipmentOptionIndex + 1]
const scenarios = CRAFT_SCENARIOS.filter((scenario) => (
  scenario.scenarioId === 'hardened-survey-plank'
  || scenario.scenarioId === 'mobile-work-stairs'
)).filter((scenario) => requestedScenarioId === null || scenario.scenarioId === requestedScenarioId)
const equipmentProfiles = PLAYER_EQUIPMENT_PROFILES.filter((profile) => (
  requestedEquipmentProfileId === null || profile.id === requestedEquipmentProfileId
))
if (scenarios.length === 0) throw new Error(`unknown Elevating Platforms scenario: ${requestedScenarioId}`)
if (equipmentProfiles.length === 0) throw new Error(`unknown player equipment profile: ${requestedEquipmentProfileId}`)
const baselineSpecialistMode = specialistModeOption(
  '--baseline-specialist-actions',
  scenarios.every((scenario) => scenario.planner.config.allowSpecialistActions),
)
const candidateSpecialistMode = specialistModeOption(
  '--candidate-specialist-actions',
  scenarios.every((scenario) => scenario.planner.config.allowSpecialistActions),
)
const maxSteps = 80
const compactOutput = process.argv.includes('--compact')
const missionTimingOnly = process.argv.includes('--mission-timing-only')
const bypassPlayerProfileRouter = process.argv.includes('--bypass-player-profile-router')
const baselinePlayerProfileRouter = process.argv.includes('--baseline-player-profile-router')
const baselineActionBudgetIndex = process.argv.indexOf('--baseline-adaptive-good-quality-extension-action-budget')
const baselineActionBudget = baselineActionBudgetIndex < 0
  ? null
  : Number(process.argv[baselineActionBudgetIndex + 1])
if (baselineActionBudget !== null && (!Number.isInteger(baselineActionBudget) || baselineActionBudget < 0)) {
  throw new RangeError('--baseline-adaptive-good-quality-extension-action-budget must be a non-negative integer')
}
const baselineConsumeMalleableIndex = process.argv.indexOf('--baseline-consume-malleable-before-veneration')
const baselineConsumeMalleableMode = baselineConsumeMalleableIndex < 0
  ? null
  : process.argv[baselineConsumeMalleableIndex + 1]
if (
  baselineConsumeMalleableMode !== null
  && baselineConsumeMalleableMode !== 'allow'
  && baselineConsumeMalleableMode !== 'forbid'
) {
  throw new RangeError('--baseline-consume-malleable-before-veneration must be allow or forbid')
}
const riskyActions = new Set<CraftActionId>(['rapidSynthesis', 'hastyTouch', 'daringTouch'])
const missionDeadlineSeconds = positiveNumberOption('--mission-deadline-seconds', 330)
const missionFixedOverheadSeconds = nonNegativeNumberOption('--mission-overhead-seconds', 0)
const missionSecondsPerAction = [4, 4.5, 5] as const

interface EvaluatedEpisode {
  conditionProfileId: string
  equipmentProfileId: string
  seed: number
  result: EpisodeTraceResult
  safetyViolations: number
  specialistRecommendations: number
  latencies: number[]
}

interface ScenarioEpisodeSet {
  scenarioId: string
  equipmentProfileId: string
  baseline: readonly EvaluatedEpisode[]
  candidate: readonly EvaluatedEpisode[]
}

const scenarioEpisodeSets = new Map<string, ScenarioEpisodeSet>()

function percentile(samples: readonly number[], fraction: number): number {
  return samples[Math.max(0, Math.ceil(samples.length * fraction) - 1)] ?? 0
}

function mean95NormalApproximation(samples: readonly number[]) {
  if (samples.length === 0) return { mean: 0, lower: 0, upper: 0 }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
  if (samples.length === 1) return { mean, lower: mean, upper: mean }
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / (samples.length - 1)
  const margin = 1.96 * Math.sqrt(variance / samples.length)
  return { mean, lower: mean - margin, upper: mean + margin }
}

function runEpisode(
  scenario: (typeof scenarios)[number],
  equipmentProfile: (typeof PLAYER_EQUIPMENT_PROFILES)[number],
  conditionProfile: (typeof ELEVATING_PLATFORMS_SENSITIVITY_PROFILES)[number],
  seed: number,
  config: Readonly<GuideIntegratedPolicyConfig>,
): EvaluatedEpisode {
  const crafter: CrafterProfile = equipmentProfile.crafter
  const policy = createGuideIntegratedPolicyFactory(config, scenario.objective)()
  let safetyViolations = 0
  let specialistRecommendations = 0
  const latencies: number[] = []
  const audited: EpisodePolicy = (recipe, activeCrafter, state) => {
    const startedAt = performance.now()
    const action = policy(recipe, activeCrafter, state)
    latencies.push(performance.now() - startedAt)
    if (action !== null) {
      if (ACTIONS[action].specialistOnly === true) specialistRecommendations += 1
      if (!legalActions(recipe, activeCrafter, state).includes(action)
        || !isPolicyActionSafe(recipe, activeCrafter, state, action)) {
        safetyViolations += 1
      }
    }
    return action
  }
  const initialState = createInitialCraftState(scenario.recipe, crafter)
  const firstAction = audited(scenario.recipe, crafter, initialState)
  if (firstAction === null) {
    return {
      conditionProfileId: conditionProfile.id,
      equipmentProfileId: equipmentProfile.id,
      seed,
      safetyViolations,
      specialistRecommendations,
      latencies,
      result: {
        terminal: 'none',
        finalState: initialState,
        actions: [],
        stoppedByLimit: false,
        stopReason: 'policy-null',
        steps: [],
      },
    }
  }
  return {
    conditionProfileId: conditionProfile.id,
    equipmentProfileId: equipmentProfile.id,
    seed,
    safetyViolations,
    specialistRecommendations,
    latencies,
    result: runEpisodeTrace({
      recipe: scenario.recipe,
      crafter,
      initialState,
      firstAction,
      policy: audited,
      random: createEpisodeRandomStream(seed),
      conditionProfile,
      maxSteps,
    }),
  }
}

function summarize(
  scenario: (typeof scenarios)[number],
  equipmentProfile: (typeof PLAYER_EQUIPMENT_PROFILES)[number],
  episodes: readonly EvaluatedEpisode[],
) {
  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  const completedQuality = completed.map(({ result }) => result.finalState.quality)
    .sort((left, right) => left - right)
  const latencies = episodes.flatMap((episode) => episode.latencies).sort((a, b) => a - b)
  const actionCount = (action: CraftActionId) => episodes.reduce(
    (sum, episode) => sum + episode.result.actions.filter((used) => used === action).length,
    0,
  )
  const riskySteps = episodes.flatMap((episode) => episode.result.steps.filter((step) => riskyActions.has(step.action)))
  const specialistActions = (['carefulObservation', 'heartAndSoul', 'quickInnovation'] as const)
    .reduce<Record<string, number>>((counts, action) => {
      counts[action] = actionCount(action)
      return counts
    }, {})
  const hqChanceEstimates = scenario.recipe.qualityOutcome === 'hq-chance'
    ? completed.map(({ result }) => estimateHqChancePercentFromCommunityTable(
        result.finalState.quality,
        scenario.recipe.qualityMax,
      )).sort((left, right) => left - right)
    : []
  const expectedPoints = scenario.recipe.qualityOutcome === 'hq-chance'
    ? completed.map(({ result }) => estimateMobileWorkStairsExpectedMissionPoints(
        result.finalState.quality,
        scenario.recipe.qualityMax,
      ))
    : []
  const completionWeightedExpectedPoints = scenario.recipe.qualityOutcome === 'hq-chance'
    ? episodes.map(({ result }) => result.terminal === 'completed'
        ? estimateMobileWorkStairsExpectedMissionPoints(result.finalState.quality, scenario.recipe.qualityMax)
        : 0)
    : []
  const lowest = [...episodes]
    .sort((left, right) => {
      const leftCompletion = Number(left.result.terminal === 'completed')
      const rightCompletion = Number(right.result.terminal === 'completed')
      return leftCompletion - rightCompletion
        || left.result.finalState.quality - right.result.finalState.quality
    })
    .slice(0, 3)
    .map((episode) => ({
      conditionProfileId: episode.conditionProfileId,
      seed: episode.seed,
      stopReason: episode.result.stopReason,
      finalState: episode.result.finalState,
      riskyActions: episode.result.steps.filter((step) => riskyActions.has(step.action)).map((step) => ({
        action: step.action,
        success: step.success,
      })),
      actions: episode.result.actions,
    }))
  return {
    equipmentProfileId: equipmentProfile.id,
    equipmentLabel: equipmentProfile.label,
    crafter: equipmentProfile.crafter,
    episodes: episodes.length,
    completed: completed.length,
    validCompletionRate: completed.length / episodes.length,
    fullQuality: completed.filter(({ result }) => result.finalState.quality >= scenario.objective.qualityTarget).length,
    quality: {
      minimum: completedQuality[0] ?? 0,
      p10: percentile(completedQuality, 0.1),
      median: percentile(completedQuality, 0.5),
      p90: percentile(completedQuality, 0.9),
      maximum: completedQuality.at(-1) ?? 0,
      average: completedQuality.reduce((sum, value) => sum + value, 0) / Math.max(1, completedQuality.length),
    },
    actionCounts: {
      allAttempts: summarizeActionCounts(episodes.map(({ result }) => result.actions.length)),
      completedOnly: summarizeActionCounts(completed.map(({ result }) => result.actions.length)),
    },
    provisionalHqUtility: scenario.recipe.qualityOutcome === 'hq-chance' ? {
      evidence: 'Patch 7.4 Lodestone player-research curve, cross-checked with Teamcraft; not yet a Recipe 36208 in-game oracle',
      averageHqChancePercent: hqChanceEstimates.reduce((sum, value) => sum + value, 0) / Math.max(1, hqChanceEstimates.length),
      medianHqChancePercent: percentile(hqChanceEstimates, 0.5),
      averageHqChancePercent95NormalApproximation: mean95NormalApproximation(hqChanceEstimates),
      p10HqChancePercent: percentile(hqChanceEstimates, 0.1),
      completedOnlyAverageExpectedMissionPoints: expectedPoints.reduce((sum, value) => sum + value, 0) / Math.max(1, expectedPoints.length),
      completionWeightedAverageMissionPoints: completionWeightedExpectedPoints.reduce((sum, value) => sum + value, 0)
        / Math.max(1, completionWeightedExpectedPoints.length),
    } : null,
    stopReasons: Object.fromEntries([
      'completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit',
    ].map((reason) => [reason, episodes.filter(({ result }) => result.stopReason === reason).length])),
    risk: {
      actions: riskySteps.length,
      failures: riskySteps.filter((step) => !step.success).length,
      rapidSynthesis: actionCount('rapidSynthesis'),
      hastyTouch: actionCount('hastyTouch'),
      daringTouch: actionCount('daringTouch'),
    },
    specialist: {
      enabledByStats: equipmentProfile.crafter.specialist === true,
      invocations: Object.values(specialistActions).reduce((sum, value) => sum + value, 0),
      actions: specialistActions,
      consumableUnits: null,
      note: 'Exact delineation consumption is not modeled; invocations are not consumable units.',
    },
    byConditionProfile: Object.fromEntries(ELEVATING_PLATFORMS_SENSITIVITY_PROFILES.map((profile) => {
      const group = episodes.filter((episode) => episode.conditionProfileId === profile.id)
      const groupCompleted = group.filter(({ result }) => result.terminal === 'completed')
      const quality = groupCompleted.map(({ result }) => result.finalState.quality).sort((a, b) => a - b)
      return [profile.id, {
        evidence: profile.evidence,
        completed: groupCompleted.length,
        episodes: group.length,
        medianQuality: percentile(quality, 0.5),
        fullQuality: groupCompleted.filter(({ result }) => result.finalState.quality >= scenario.objective.qualityTarget).length,
      }]
    })),
    safetyViolations: episodes.reduce((sum, episode) => sum + episode.safetyViolations, 0),
    latency: {
      measuredStates: latencies.length,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      p99Ms: percentile(latencies, 0.99),
      maximumMs: latencies.at(-1) ?? 0,
    },
    lowestOutcomeExamples: lowest,
  }
}

function compareEpisodePair(
  scenario: (typeof scenarios)[number],
  baseline: EvaluatedEpisode,
  candidate: EvaluatedEpisode,
): number {
  const completionDelta = Number(candidate.result.terminal === 'completed') - Number(baseline.result.terminal === 'completed')
  if (completionDelta !== 0) return completionDelta
  if (candidate.result.terminal !== 'completed') return 0
  if (scenario.recipe.qualityOutcome === 'required-quality') {
    return baseline.result.actions.length - candidate.result.actions.length
  }
  return candidate.result.finalState.quality - baseline.result.finalState.quality
}

const evaluations = scenarios.map((scenario) => {
  const baselineConfig: GuideIntegratedPolicyConfig = {
    ...scenario.planner.config,
    allowSpecialistActions: baselineSpecialistMode,
    adaptiveByregotCashoutCpCeiling: 0,
    requiredQualityProgressPrefixCertificate: false,
  }
  const candidateConfig: GuideIntegratedPolicyConfig = {
    ...scenario.planner.config,
    allowSpecialistActions: candidateSpecialistMode,
    adaptiveByregotCashoutCpCeiling: requestedCashoutCp
      ?? scenario.planner.config.adaptiveByregotCashoutCpCeiling,
    adaptiveByregotMinimumProjectedQualityRatio: requestedCashoutQualityRatio
      ?? scenario.planner.config.adaptiveByregotMinimumProjectedQualityRatio,
  }
  const equipment = equipmentProfiles.map((equipmentProfile) => {
    const routedBaselineConfig = baselinePlayerProfileRouter
      ? resolvePlayerProfilePolicyConfig(
          scenario.scenarioId,
          equipmentProfile.crafter,
          scenario.planner.config,
        )
      : baselineConfig
    const resolvedBaselineConfig: GuideIntegratedPolicyConfig = {
      ...routedBaselineConfig,
      allowSpecialistActions: baselineSpecialistMode,
      adaptiveGoodQualityExtensionActionBudget: baselineActionBudget
        ?? routedBaselineConfig.adaptiveGoodQualityExtensionActionBudget,
      consumeMalleableBeforeVeneration: baselineConsumeMalleableMode === null
        ? routedBaselineConfig.consumeMalleableBeforeVeneration
        : baselineConsumeMalleableMode === 'allow',
    }
    const routedCandidateConfig = bypassPlayerProfileRouter
      ? candidateConfig
      : resolvePlayerProfilePolicyConfig(
          scenario.scenarioId,
          equipmentProfile.crafter,
          scenario.planner.config,
        )
    // The profile router supplies deployed defaults. Explicit experiment flags
    // are applied last so a requested zero/forbid value is never silently lost.
    const resolvedCandidateConfig: GuideIntegratedPolicyConfig = {
      ...routedCandidateConfig,
      allowSpecialistActions: candidateSpecialistMode,
      adaptiveByregotCashoutCpCeiling: requestedCashoutCp
        ?? routedCandidateConfig.adaptiveByregotCashoutCpCeiling,
      adaptiveByregotMinimumProjectedQualityRatio: requestedCashoutQualityRatio
        ?? routedCandidateConfig.adaptiveByregotMinimumProjectedQualityRatio,
    }
    const candidateReusedBaseline = JSON.stringify(resolvedCandidateConfig)
      === JSON.stringify(resolvedBaselineConfig)
    const baseline = ELEVATING_PLATFORMS_SENSITIVITY_PROFILES.flatMap((profile) => (
      seeds.map((seed) => runEpisode(scenario, equipmentProfile, profile, seed, resolvedBaselineConfig))
    ))
    const candidate = candidateReusedBaseline
      ? baseline
      : ELEVATING_PLATFORMS_SENSITIVITY_PROFILES.flatMap((profile) => (
          seeds.map((seed) => runEpisode(scenario, equipmentProfile, profile, seed, resolvedCandidateConfig))
        ))
    scenarioEpisodeSets.set(`${scenario.scenarioId}:${equipmentProfile.id}`, {
      scenarioId: scenario.scenarioId,
      equipmentProfileId: equipmentProfile.id,
      baseline,
      candidate,
    })
    const comparisons = baseline.map((episode, index) => compareEpisodePair(scenario, episode, candidate[index]!))
    const completionDeltas = baseline.map((episode, index) => (
      Number(candidate[index]!.result.terminal === 'completed')
      - Number(episode.result.terminal === 'completed')
    ))
    const pairedQualityDeltas = baseline.map((episode, index) => (
      candidate[index]!.result.finalState.quality - episode.result.finalState.quality
    ))
    const bothCompletedPairs = scenario.recipe.qualityOutcome === 'hq-chance'
      ? baseline.map((episode, index) => [episode, candidate[index]!] as const)
        .filter(([left, right]) => left.result.terminal === 'completed' && right.result.terminal === 'completed')
      : []
    const pairedHqChanceDeltas = scenario.recipe.qualityOutcome === 'hq-chance'
      ? bothCompletedPairs.map(([episode, candidateEpisode]) => (
          estimateHqChancePercentFromCommunityTable(
            candidateEpisode.result.finalState.quality,
            scenario.recipe.qualityMax,
          ) - estimateHqChancePercentFromCommunityTable(
            episode.result.finalState.quality,
            scenario.recipe.qualityMax,
          )
        ))
      : []
    const pairedCompletionWeightedMissionPointDeltas = scenario.recipe.qualityOutcome === 'hq-chance'
      ? baseline.map((episode, index) => {
          const candidateEpisode = candidate[index]!
          const baselinePoints = episode.result.terminal === 'completed'
            ? estimateMobileWorkStairsExpectedMissionPoints(episode.result.finalState.quality, scenario.recipe.qualityMax)
            : 0
          const candidatePoints = candidateEpisode.result.terminal === 'completed'
            ? estimateMobileWorkStairsExpectedMissionPoints(candidateEpisode.result.finalState.quality, scenario.recipe.qualityMax)
            : 0
          return candidatePoints - baselinePoints
        })
      : []
    const changedExamples = baseline.map((episode, index) => {
      const candidateEpisode = candidate[index]!
      return {
        conditionProfileId: episode.conditionProfileId,
        seed: episode.seed,
        baseline: {
          terminal: episode.result.terminal,
          quality: episode.result.finalState.quality,
          actions: episode.result.actions.length,
        },
        candidate: {
          terminal: candidateEpisode.result.terminal,
          quality: candidateEpisode.result.finalState.quality,
          actions: candidateEpisode.result.actions.length,
        },
      }
    }).filter((example) => (
      example.baseline.terminal !== example.candidate.terminal
      || example.baseline.quality !== example.candidate.quality
      || example.baseline.actions !== example.candidate.actions
    )).slice(0, 12)
    return {
      candidateReusedBaseline,
      resolvedBaselineConfig,
      resolvedCandidateConfig,
      baseline: summarize(scenario, equipmentProfile, baseline),
      candidate: summarize(scenario, equipmentProfile, candidate),
      paired: {
        wins: comparisons.filter((value) => value > 0).length,
        losses: comparisons.filter((value) => value < 0).length,
        ties: comparisons.filter((value) => value === 0).length,
        completionWins: completionDeltas.filter((value) => value > 0).length,
        completionLosses: completionDeltas.filter((value) => value < 0).length,
        qualityDelta95NormalApproximation: mean95NormalApproximation(pairedQualityDeltas),
        bothCompletedPairCount: bothCompletedPairs.length,
        bothCompletedHqChancePercentagePointDelta95NormalApproximation: scenario.recipe.qualityOutcome === 'hq-chance'
          ? mean95NormalApproximation(pairedHqChanceDeltas)
          : null,
        completionWeightedMissionPointDelta95NormalApproximation: scenario.recipe.qualityOutcome === 'hq-chance'
          ? mean95NormalApproximation(pairedCompletionWeightedMissionPointDeltas)
          : null,
        changedExamples,
      },
    }
  })
  return {
    scenarioId: scenario.scenarioId,
    recipeProfileId: scenario.recipe.profileId,
    policyVersion: scenario.planner.policyVersion,
    objectiveId: scenario.objective.objectiveId,
    baselineConfig,
    candidateConfig,
    equipment,
  }
})

function missionCraftAttempts(
  episodes: readonly EvaluatedEpisode[],
  rotateSeedsWithinProfile = false,
): MissionCraftAttempt[] {
  const byProfile = new Map<string, EvaluatedEpisode[]>()
  for (const episode of episodes) {
    const group = byProfile.get(episode.conditionProfileId) ?? []
    group.push(episode)
    byProfile.set(episode.conditionProfileId, group)
  }
  return [...byProfile.entries()].flatMap(([conditionProfileId, unsorted]) => {
    const group = [...unsorted].sort((left, right) => left.seed - right.seed)
    const offset = rotateSeedsWithinProfile && group.length > 1 ? Math.ceil(group.length / 2) : 0
    return group.map((_, trial) => {
      const episode = group[(trial + offset) % group.length]!
      return {
        key: `${conditionProfileId}:trial-${trial}`,
        completed: episode.result.terminal === 'completed',
        actionCount: episode.result.actions.length,
      }
    })
  })
}

function summarizeMissionPolicy(attempts: readonly MissionAttempt[]) {
  const bothCompleted = attempts.filter((attempt) => attempt.bothCompleted)
  return {
    attempts: attempts.length,
    bothCompleted: bothCompleted.length,
    bothCompletedRate: bothCompleted.length / Math.max(1, attempts.length),
    totalActionsAcrossAllAttempts: summarizeActionCounts(
      attempts.map((attempt) => attempt.totalActionCount),
    ),
    totalActionsWhenBothCompleted: summarizeActionCounts(
      bothCompleted.map((attempt) => attempt.totalActionCount),
    ),
    estimatedDeadlineAttainment: estimateMissionDeadlines(
      attempts,
      missionDeadlineSeconds,
      missionFixedOverheadSeconds,
      missionSecondsPerAction,
    ),
  }
}

function pairedMissionComparison(
  baseline: readonly MissionAttempt[],
  candidate: readonly MissionAttempt[],
) {
  const candidateByKey = new Map(candidate.map((attempt) => [attempt.key, attempt]))
  const actionCountDeltas: number[] = []
  let completionWins = 0
  let completionLosses = 0
  let completionTies = 0
  for (const attempt of baseline) {
    const candidateAttempt = candidateByKey.get(attempt.key)
    if (candidateAttempt === undefined) throw new Error(`candidate mission attempt is missing ${attempt.key}`)
    if (attempt.bothCompleted && candidateAttempt.bothCompleted) {
      actionCountDeltas.push(candidateAttempt.totalActionCount - attempt.totalActionCount)
    }
    if (candidateAttempt.bothCompleted && !attempt.bothCompleted) completionWins += 1
    else if (!candidateAttempt.bothCompleted && attempt.bothCompleted) completionLosses += 1
    else completionTies += 1
  }
  if (candidateByKey.size !== baseline.length) {
    throw new Error('baseline and candidate mission attempt sets do not match')
  }
  return {
    completionOutcomes: {
      wins: completionWins,
      losses: completionLosses,
      ties: completionTies,
    },
    actionCountComparableBothCompletedPairs: actionCountDeltas.length,
    actionCountDeltaCandidateMinusBaseline95NormalApproximation: mean95NormalApproximation(actionCountDeltas),
    deadlineOutcomes: missionSecondsPerAction.map((secondsPerAction) => {
      let wins = 0
      let losses = 0
      let ties = 0
      for (const baselineAttempt of baseline) {
        const candidateAttempt = candidateByKey.get(baselineAttempt.key)!
        const baselineAttained = baselineAttempt.bothCompleted
          && missionFixedOverheadSeconds + baselineAttempt.totalActionCount * secondsPerAction <= missionDeadlineSeconds
        const candidateAttained = candidateAttempt.bothCompleted
          && missionFixedOverheadSeconds + candidateAttempt.totalActionCount * secondsPerAction <= missionDeadlineSeconds
        if (candidateAttained && !baselineAttained) wins += 1
        else if (!candidateAttained && baselineAttained) losses += 1
        else ties += 1
      }
      return { secondsPerAction, wins, losses, ties }
    }),
  }
}

const hasBothMissionCrafts = scenarios.some((scenario) => scenario.scenarioId === 'hardened-survey-plank')
  && scenarios.some((scenario) => scenario.scenarioId === 'mobile-work-stairs')
const jointMissionTiming = hasBothMissionCrafts
  ? {
      available: true,
      deadlineSeconds: missionDeadlineSeconds,
      fixedOverheadSeconds: missionFixedOverheadSeconds,
      secondsPerActionSensitivity: missionSecondsPerAction,
      evidence: `Estimated from simulator decision-action counts only. Within each assumed condition profile, plank and stairs are deterministically cross-paired by ${seedCount > 1 ? 'distinct' : 'the same'} corpus seeds; baseline/candidate keep common random numbers. This is not an observed wall-clock mission replay.`,
      equipment: equipmentProfiles.map((equipmentProfile) => {
        const plank = scenarioEpisodeSets.get(`hardened-survey-plank:${equipmentProfile.id}`)!
        const stairs = scenarioEpisodeSets.get(`mobile-work-stairs:${equipmentProfile.id}`)!
        const baseline = pairMissionCraftAttempts(
          missionCraftAttempts(plank.baseline),
          missionCraftAttempts(stairs.baseline, true),
        )
        const candidate = pairMissionCraftAttempts(
          missionCraftAttempts(plank.candidate),
          missionCraftAttempts(stairs.candidate, true),
        )
        return {
          equipmentProfileId: equipmentProfile.id,
          equipmentLabel: equipmentProfile.label,
          baseline: summarizeMissionPolicy(baseline),
          candidate: summarizeMissionPolicy(candidate),
          paired: pairedMissionComparison(baseline, candidate),
        }
      }),
    }
  : {
      available: false,
      reason: 'Joint mission timing requires both hardened-survey-plank and mobile-work-stairs; remove --scenario to include both.',
    }

function compactSummary(summary: ReturnType<typeof summarize>) {
  return {
    equipmentProfileId: summary.equipmentProfileId,
    equipmentLabel: summary.equipmentLabel,
    crafter: summary.crafter,
    episodes: summary.episodes,
    completed: summary.completed,
    validCompletionRate: summary.validCompletionRate,
    fullQuality: summary.fullQuality,
    quality: summary.quality,
    actionCounts: summary.actionCounts,
    provisionalHqUtility: summary.provisionalHqUtility,
    stopReasons: summary.stopReasons,
    risk: summary.risk,
    specialist: summary.specialist,
    byConditionProfile: summary.byConditionProfile,
    safetyViolations: summary.safetyViolations,
    latency: summary.latency,
  }
}

const reportedEvaluations = compactOutput
  ? evaluations.map(({ scenarioId, recipeProfileId, policyVersion, objectiveId, equipment }) => ({
      scenarioId,
      recipeProfileId,
      policyVersion,
      objectiveId,
      equipment: equipment.map(({
        candidateReusedBaseline,
        resolvedBaselineConfig,
        resolvedCandidateConfig,
        baseline,
        candidate,
        paired,
      }) => ({
        candidateReusedBaseline,
        resolvedBaselineConfig,
        resolvedCandidateConfig,
        baseline: compactSummary(baseline),
        candidate: compactSummary(candidate),
        paired,
      })),
    }))
  : evaluations

console.log(JSON.stringify({
  interpretation: 'Paired Elevating Platforms policy sensitivity. Condition weights are assumptions. HQ utility uses a provisional community table and is not a claimed current in-game HQ rate. Mission timing is an action-count sensitivity estimate, not measured wall-clock time.',
  corpus: evaluationCorpus,
  seedCount,
  maxSteps,
  jointMissionTiming,
  ...(missionTimingOnly ? {} : { evaluations: reportedEvaluations }),
}, null, 2))
