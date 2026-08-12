import { performance } from 'node:perf_hooks'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
  SURVEY_CRAFTSMANS_COMMAND_BREW_PROVISIONAL_800_POINT_QUALITY,
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
  type PolicyEvaluationCorpus,
} from '@frozen-rabbit-expert/policy-lab'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
  rebuildGuideIntegratedDecisionMemory,
  type GuideIntegratedPolicyConfig,
} from '@frozen-rabbit-expert/solver'

const ALL_NORMAL: WeightedConditionProfile = {
  id: 'command-brew-adversarial-all-normal-v1',
  evidence: 'assumption',
  weights: { normal: 1 },
}
const ALL_MALLEABLE_AFTER_OPENING: WeightedConditionProfile = {
  id: 'command-brew-adversarial-all-malleable-v1',
  evidence: 'assumption',
  weights: { malleable: 1 },
}
const PRIMARY_PROFILES: readonly WeightedConditionProfile[] = COMMAND_BREW_SENSITIVITY_PROFILES
const STRESS_PROFILES: readonly WeightedConditionProfile[] = [ALL_NORMAL, ALL_MALLEABLE_AFTER_OPENING]
const MAX_STEPS = 80

function positiveIntegerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function numericOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`)
  return value
}

function selectedCorpus(): PolicyEvaluationCorpus {
  const index = process.argv.indexOf('--corpus')
  const name = index < 0 ? 'development' : process.argv[index + 1]
  if (name === 'development') return COMMAND_BREW_DEVELOPMENT_CORPUS
  if (name === 'frozen') return COMMAND_BREW_FROZEN_VALIDATION_CORPUS
  throw new RangeError('--corpus must be development or frozen')
}

const corpus = selectedCorpus()
const availableSeeds = corpusSeeds(corpus)
const seedCount = positiveIntegerOption('--seed-count', availableSeeds.length)
if (seedCount > availableSeeds.length) {
  throw new RangeError(`--seed-count must be no greater than ${availableSeeds.length}`)
}
const seeds = availableSeeds.slice(0, seedCount)
const stressSeedCount = Math.min(seeds.length, positiveIntegerOption('--stress-seed-count', Math.min(32, seeds.length)))
const compact = process.argv.includes('--compact')

const guardedConfig: Readonly<GuideIntegratedPolicyConfig> = {
  ...DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  progressFloorBeforeQuality: numericOption(
    '--progress-floor',
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG.progressFloorBeforeQuality,
  ),
  balanceTolerance: numericOption(
    '--balance-tolerance',
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG.balanceTolerance,
  ),
  greatStridesQuality: numericOption(
    '--great-strides-quality',
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG.greatStridesQuality,
  ),
  byregotQuality: numericOption(
    '--byregot-quality',
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG.byregotQuality,
  ),
}
const unguardedConfig: Readonly<GuideIntegratedPolicyConfig> = {
  ...guardedConfig,
  adaptiveCompletionQualityGuardrail: 0,
  adaptiveReliableQualityFirstRoute: false,
}
const noSpecialistActionsConfig: Readonly<GuideIntegratedPolicyConfig> = {
  ...guardedConfig,
  allowSpecialistActions: false,
  useSpecialistFinisher: false,
  heartAndSoulPreciseMaxInnerQuiet: -1,
}

interface EpisodeKey {
  equipmentId: string
  conditionProfileId: string
  seed: number
}

interface EvaluatedEpisode extends EpisodeKey {
  result: EpisodeTraceResult
  belowTargetFinishRecommendations: number
  belowGuardrailFinishRecommendations: number
  safetyViolations: number
  decisionLatencies: number[]
}

function evaluateEpisode(
  config: Readonly<GuideIntegratedPolicyConfig>,
  equipment: (typeof PLAYER_EQUIPMENT_PROFILES)[number],
  profile: WeightedConditionProfile,
  seed: number,
): EvaluatedEpisode {
  const crafter = equipment.crafter
  const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const policy = createGuideIntegratedPolicyFactory(
    config,
    SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
  )()
  let belowTargetFinishRecommendations = 0
  let belowGuardrailFinishRecommendations = 0
  let safetyViolations = 0
  const decisionLatencies: number[] = []
  const audited: EpisodePolicy = (recipe, activeCrafter, state) => {
    const startedAt = performance.now()
    const action = policy(recipe, activeCrafter, state)
    decisionLatencies.push(performance.now() - startedAt)
    if (action !== null) {
      if (
        !legalActions(recipe, activeCrafter, state).includes(action)
        || !isPolicyActionSafe(recipe, activeCrafter, state, action)
      ) safetyViolations += 1
      const preview = previewAction(recipe, activeCrafter, state, action)
      if (
        preview.progressGain > 0
        && state.progress + preview.progressGain >= recipe.progressRequired
      ) {
        const projectedQuality = state.quality + preview.qualityGain
        if (projectedQuality < SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.qualityTarget) {
          belowTargetFinishRecommendations += 1
        }
        if (projectedQuality < SURVEY_CRAFTSMANS_COMMAND_BREW_PROVISIONAL_800_POINT_QUALITY) {
          belowGuardrailFinishRecommendations += 1
        }
      }
    }
    return action
  }
  const firstAction = audited(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, initialState)
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
  return {
    equipmentId: equipment.id,
    conditionProfileId: profile.id,
    seed,
    result,
    belowTargetFinishRecommendations,
    belowGuardrailFinishRecommendations,
    safetyViolations,
    decisionLatencies,
  }
}

function runArm(config: Readonly<GuideIntegratedPolicyConfig>) {
  const primary = PLAYER_EQUIPMENT_PROFILES.flatMap((equipment) => (
    PRIMARY_PROFILES.flatMap((profile) => (
      seeds.map((seed) => evaluateEpisode(config, equipment, profile, seed))
    ))
  ))
  const stress = PLAYER_EQUIPMENT_PROFILES.flatMap((equipment) => (
    STRESS_PROFILES.flatMap((profile) => (
      seeds.slice(0, stressSeedCount).map((seed) => evaluateEpisode(config, equipment, profile, seed))
    ))
  ))
  return { primary, stress }
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function summary(episodes: readonly EvaluatedEpisode[]) {
  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  const completedQuality = completed.map(({ result }) => result.finalState.quality).sort((a, b) => a - b)
  const weightedQuality = episodes.map(({ result }) => (
    result.terminal === 'completed' ? result.finalState.quality : 0
  )).sort((a, b) => a - b)
  const latencies = episodes.flatMap((episode) => episode.decisionLatencies).sort((a, b) => a - b)
  const specialistActions = ['carefulObservation', 'heartAndSoul', 'quickInnovation'] as const
  const byCell = Object.fromEntries(PLAYER_EQUIPMENT_PROFILES.flatMap((equipment) => (
    [...PRIMARY_PROFILES, ...STRESS_PROFILES].map((profile) => {
      const cell = episodes.filter((episode) => (
        episode.equipmentId === equipment.id && episode.conditionProfileId === profile.id
      ))
      if (cell.length === 0) return null
      const cellCompleted = cell.filter(({ result }) => result.terminal === 'completed')
      const cellQuality = cellCompleted.map(({ result }) => result.finalState.quality).sort((a, b) => a - b)
      return [`${equipment.id}|${profile.id}`, {
        episodes: cell.length,
        completion: cellCompleted.length,
        verifiedHigh10200: cellCompleted.filter(({ result }) => result.finalState.quality >= 10_200).length,
        provisionalProxy10800: cellCompleted.filter(({ result }) => result.finalState.quality >= 10_800).length,
        fullQuality12000: cellCompleted.filter(({ result }) => result.finalState.quality >= 12_000).length,
        minimumCompletedQuality: cellQuality[0] ?? 0,
        p10CompletedQuality: percentile(cellQuality, 0.1),
      }]
    }).filter((entry): entry is [string, Record<string, number>] => entry !== null)
  )))
  const grouped = (field: 'equipmentId' | 'conditionProfileId') => Object.fromEntries(
    [...new Set(episodes.map((episode) => episode[field]))].map((id) => {
      const group = episodes.filter((episode) => episode[field] === id)
      const groupCompleted = group.filter(({ result }) => result.terminal === 'completed')
      const qualities = groupCompleted.map(({ result }) => result.finalState.quality).sort((a, b) => a - b)
      return [id, {
        episodes: group.length,
        completion: groupCompleted.length,
        high10200: groupCompleted.filter(({ result }) => result.finalState.quality >= 10_200).length,
        proxy10800: groupCompleted.filter(({ result }) => result.finalState.quality >= 10_800).length,
        full12000: groupCompleted.filter(({ result }) => result.finalState.quality >= 12_000).length,
        minimum: qualities[0] ?? 0,
        p10: percentile(qualities, 0.1),
      }]
    }),
  )
  return {
    episodes: episodes.length,
    completion: completed.length,
    failed: episodes.filter(({ result }) => result.terminal === 'failed').length,
    stopReasons: Object.fromEntries(['completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit'].map((reason) => [
      reason,
      episodes.filter(({ result }) => result.stopReason === reason).length,
    ])),
    verifiedAnchors: {
      scored6000: completed.filter(({ result }) => result.finalState.quality >= 6_000).length,
      mid7200: completed.filter(({ result }) => result.finalState.quality >= 7_200).length,
      high10200: completed.filter(({ result }) => result.finalState.quality >= 10_200).length,
      full12000: completed.filter(({ result }) => result.finalState.quality >= 12_000).length,
    },
    provisionalProxy10800: completed.filter(({ result }) => result.finalState.quality >= 10_800).length,
    belowTargetFinishRecommendations: episodes.reduce((sum, episode) => sum + episode.belowTargetFinishRecommendations, 0),
    belowGuardrailFinishRecommendations: episodes.reduce((sum, episode) => sum + episode.belowGuardrailFinishRecommendations, 0),
    safetyViolations: episodes.reduce((sum, episode) => sum + episode.safetyViolations, 0),
    noncompletionExamples: episodes
      .filter(({ result }) => result.terminal !== 'completed')
      .slice(0, 5)
      .map((episode) => ({
        equipmentId: episode.equipmentId,
        conditionProfileId: episode.conditionProfileId,
        seed: episode.seed,
        stopReason: episode.result.stopReason,
        actions: episode.result.actions,
        decisionMemory: rebuildGuideIntegratedDecisionMemory(episode.result.actions),
        steps: episode.result.steps.map((step) => ({
          action: step.action,
          condition: step.before.condition,
          cp: `${step.before.cp}->${step.after.cp}`,
          durability: `${step.before.durability}->${step.after.durability}`,
          progress: `${step.before.progress}->${step.after.progress}`,
          quality: `${step.before.quality}->${step.after.quality}`,
        })),
        finalState: episode.result.finalState,
      })),
    completedQuality: {
      minimum: completedQuality[0] ?? 0,
      p10: percentile(completedQuality, 0.1),
      p25: percentile(completedQuality, 0.25),
      median: percentile(completedQuality, 0.5),
      p90: percentile(completedQuality, 0.9),
      maximum: completedQuality.at(-1) ?? 0,
      average: completed.reduce((sum, { result }) => sum + result.finalState.quality, 0) / Math.max(1, completed.length),
    },
    completionWeightedQuality: {
      p10: percentile(weightedQuality, 0.1),
      average: weightedQuality.reduce((sum, quality) => sum + quality, 0) / Math.max(1, weightedQuality.length),
    },
    specialistActionUses: Object.fromEntries(specialistActions.map((action) => [
      action,
      episodes.reduce((sum, episode) => sum + episode.result.actions.filter((used) => used === action).length, 0),
    ])),
    averageActions: completed.reduce((sum, episode) => sum + episode.result.actions.length, 0) / Math.max(1, completed.length),
    byEquipment: grouped('equipmentId'),
    byCondition: grouped('conditionProfileId'),
    latency: {
      decisions: latencies.length,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      p99Ms: percentile(latencies, 0.99),
      maxMs: latencies.at(-1) ?? 0,
    },
    ...(compact ? {} : { byCell }),
  }
}

function keyOf(episode: EpisodeKey): string {
  return `${episode.equipmentId}|${episode.conditionProfileId}|${episode.seed}`
}

function paired(left: readonly EvaluatedEpisode[], right: readonly EvaluatedEpisode[]) {
  const rightByKey = new Map(right.map((episode) => [keyOf(episode), episode]))
  const metrics = [
    ['completion', (episode: EvaluatedEpisode) => episode.result.terminal === 'completed'],
    ['verifiedHigh10200', (episode: EvaluatedEpisode) => episode.result.terminal === 'completed' && episode.result.finalState.quality >= 10_200],
    ['provisionalProxy10800', (episode: EvaluatedEpisode) => episode.result.terminal === 'completed' && episode.result.finalState.quality >= 10_800],
    ['fullQuality12000', (episode: EvaluatedEpisode) => episode.result.terminal === 'completed' && episode.result.finalState.quality >= 12_000],
  ] as const
  return Object.fromEntries(metrics.map(([name, qualifies]) => {
    let wins = 0
    let losses = 0
    let ties = 0
    for (const episode of left) {
      const peer = rightByKey.get(keyOf(episode))
      if (peer === undefined) throw new Error(`unpaired episode ${keyOf(episode)}`)
      const leftValue = Number(qualifies(episode))
      const rightValue = Number(qualifies(peer))
      if (leftValue > rightValue) wins += 1
      else if (leftValue < rightValue) losses += 1
      else ties += 1
    }
    return [name, { wins, losses, ties }]
  }))
}

const requestedArmIndex = process.argv.indexOf('--arm')
const requestedArm = requestedArmIndex < 0 ? 'all' : process.argv[requestedArmIndex + 1]
if (!['all', 'guarded', 'unguarded', 'no-specialist'].includes(requestedArm ?? '')) {
  throw new RangeError('--arm must be all, guarded, unguarded, or no-specialist')
}
const unguarded = requestedArm === 'all' || requestedArm === 'unguarded'
  ? runArm(unguardedConfig)
  : null
const guarded = requestedArm === 'unguarded' ? null : runArm(guardedConfig)
const noSpecialistActions = requestedArm === 'all' || requestedArm === 'no-specialist'
  ? runArm(noSpecialistActionsConfig)
  : null

const selectedArms = {
  ...(requestedArm === 'all' || requestedArm === 'unguarded'
    ? { unguarded: { config: unguardedConfig, run: unguarded! } }
    : {}),
  ...(guarded === null ? {} : { guarded: { config: guardedConfig, run: guarded } }),
  ...(noSpecialistActions === null ? {} : {
    guardedNoSpecialistActions: { config: noSpecialistActionsConfig, run: noSpecialistActions },
  }),
}

const armSummaries = Object.fromEntries(Object.entries(selectedArms).map(([name, arm]) => [name, {
  ...(compact ? {} : { config: arm.config }),
  primary: summary(arm.run.primary),
  stress: summary(arm.run.stress),
}]))

const pairedSummaries = guarded !== null && noSpecialistActions !== null
  ? {
      ...(requestedArm === 'all' && unguarded !== null ? {
        guardedVersusUnguardedPrimary: paired(guarded.primary, unguarded.primary),
        guardedVersusUnguardedStress: paired(guarded.stress, unguarded.stress),
      } : {}),
      guardedVersusNoSpecialistPrimary: paired(guarded.primary, noSpecialistActions.primary),
      guardedVersusNoSpecialistStress: paired(guarded.stress, noSpecialistActions.stress),
    }
  : {}

console.log(JSON.stringify({
  policyVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  recipeProfileId: SURVEY_CRAFTSMANS_COMMAND_BREW.profileId,
  ...(compact ? {} : { objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE }),
  corpus,
  seedCount,
  stressSeedCount,
  ...(compact ? {} : { equipmentProfiles: PLAYER_EQUIPMENT_PROFILES.map(({ id, preparation, specialistConsumableCost, crafter }) => ({
    id, preparation, specialistConsumableCost, crafter,
  })) }),
  ...(compact ? {} : { conditionProfiles: {
    primary: PRIMARY_PROFILES,
    stress: STRESS_PROFILES,
    interpretation: 'All profiles are assumed sensitivity or deterministic stress models, not measured live transition probabilities.',
  } }),
  scoreInterpretation: {
    verifiedAnchors: 'Raw quality 10200 is collectability 1020 and enters the verified 700-1000 band; 12000 is the verified maximum.',
    provisionalProxy: 'Raw quality 10800 is only a provisional linear proxy for the user requested 800 mission points; no exact client interpolation or rounding formula is claimed.',
  },
  arms: armSummaries,
  paired: pairedSummaries,
}, null, 2))
