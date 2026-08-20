import { isDeepStrictEqual } from 'node:util'
import {
  ACTIONS,
  MATERIAL_CONDITIONS,
  applyObservedOutcome,
  assertCraftState,
  type CraftActionId,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
} from '@frozen-rabbit-expert/data'
import {
  COMMAND_BREW_DEVELOPMENT_CORPUS,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
} from '@frozen-rabbit-expert/simulator'
import type {
  EpisodeStopReason,
  EpisodeTraceResult,
} from '@frozen-rabbit-expert/simulator'

export const COMMAND_BREW_RISK_EVALUATION_VERSION = 'command-brew-development-risk-evaluation-v2'
export const COMMAND_BREW_RISK_COVERAGE_MANIFEST_VERSION = 'command-brew-risk-coverage-manifest-v1'
export const COMMAND_BREW_REQUIRED_CATASTROPHE_SEED_COUNT = 32

export interface CommandBrewConditionFishingEvent {
  /** Zero-based index into result.steps. */
  readonly stepIndex: number
  /** Conditions this particular decision intended to expose. */
  readonly targetConditions: readonly MaterialCondition[]
}

export interface CommandBrewEvaluationEpisode {
  readonly equipmentId: string
  readonly conditionProfileId: string
  readonly seed: number
  readonly result: Readonly<EpisodeTraceResult>
  readonly safetyViolations: number
  /** Observe without an entry here is an ordinary action, not inferred fishing. */
  readonly conditionFishingEvents: readonly CommandBrewConditionFishingEvent[]
}

export interface CommandBrewRiskCoverageManifest {
  readonly version: typeof COMMAND_BREW_RISK_COVERAGE_MANIFEST_VERSION
  readonly corpusId: string
  readonly corpusRole: string
  readonly completeCoverage: boolean
  readonly equipmentIds: readonly string[]
  readonly plausibleConditionProfileIds: readonly string[]
  readonly catastropheConditionProfileIds: readonly string[]
  readonly plausibleSeeds: readonly number[]
  readonly catastropheSeeds: readonly number[]
}

export interface CommandBrewRiskBudget {
  readonly maxStochasticAttemptsPerEpisode: number
  readonly maxConsecutiveStochasticFailures: number
  readonly maxConditionFishingAttemptsPerEpisode: number
  readonly minimumCpAfterStochasticFailure: number
  readonly minimumDurabilityAfterStochasticFailure: number
  /** Applies only to plausible colored worlds, never the catastrophe slice. */
  readonly minimumPlausibleCompletedQualityAfterAdverseEvent?: number
  /** Explicitly bounded plausible-world trade-offs; catastrophe quality never uses these. */
  readonly maximumPlausibleP10QualityRegression: number
  readonly maximumPlausibleAverageQualityRegression: number
  readonly maximumPlausibleWorstEpisodeQualityRegression: number
}

interface CountSummary {
  readonly minimum: number | null
  readonly p10: number | null
  readonly average: number | null
  readonly maximum: number | null
}

interface TierCounts {
  readonly completed: number
  readonly quality7200: number
  readonly quality10200: number
  readonly fullQuality12000: number
}

interface RecoverySummary extends TierCounts {
  readonly episodes: number
  readonly incomplete: number
  readonly finalCompletedQuality: CountSummary
  readonly qualityGainedAfterLastAdverseEvent: CountSummary
  readonly progressGainedAfterLastAdverseEvent: CountSummary
  readonly actionsAfterLastAdverseEvent: CountSummary
}

export interface CommandBrewRiskSummary {
  readonly episodes: number
  readonly outcomes: TierCounts & {
    readonly finalCompletedQuality: CountSummary
  }
  readonly stochasticActions: {
    readonly attempts: number
    readonly successes: number
    readonly failures: number
    readonly episodesWithAttempts: number
    readonly episodesWithFailures: number
    readonly maximumAttemptsInEpisode: number
    readonly maximumConsecutiveFailures: number
    readonly successfulDirectProgressGain: number
    readonly successfulDirectQualityGain: number
    readonly attemptsByAction: Readonly<Record<string, number>>
    readonly failuresByAction: Readonly<Record<string, number>>
    readonly minimumCpAfterFailure: number | null
    readonly minimumDurabilityAfterFailure: number | null
    readonly recovery: RecoverySummary
  }
  readonly conditionFishing: {
    readonly attempts: number
    readonly favorableOutcomes: number
    readonly misses: number
    readonly episodesWithAttempts: number
    readonly episodesWithMisses: number
    readonly maximumAttemptsInEpisode: number
    readonly maximumConsecutiveAttempts: number
    readonly outcomesByCondition: Readonly<Record<string, number>>
    readonly minimumCpAfterMiss: number | null
    readonly minimumDurabilityAfterMiss: number | null
    readonly recoveryAfterMiss: RecoverySummary
  }
  readonly adverseEventRecovery: RecoverySummary
  readonly integrity: {
    readonly safetyViolations: number
    readonly terminalFailures: number
    readonly illegalActionStops: number
    readonly policyNullStops: number
    readonly noLegalActionStops: number
    readonly actionLimitStops: number
    readonly nonCompletedStops: number
    readonly stopReasons: Readonly<Record<EpisodeStopReason, number>>
  }
}

interface PairedOutcome {
  readonly wins: number
  readonly losses: number
  readonly ties: number
}

export interface CommandBrewPairedSummary {
  readonly episodes: number
  readonly completion: PairedOutcome
  readonly quality7200: PairedOutcome
  readonly quality10200: PairedOutcome
  readonly fullQuality12000: PairedOutcome
  readonly rawCompletedQuality: PairedOutcome & {
    readonly averageDelta: number
    readonly worstDelta: number
    readonly worstDeltaKey: string | null
  }
}

export interface CommandBrewRiskAwareSliceReport {
  readonly baseline: CommandBrewRiskSummary
  readonly candidate: CommandBrewRiskSummary
  readonly paired: CommandBrewPairedSummary
  readonly cells: Readonly<Record<string, {
    readonly baseline: CommandBrewRiskSummary
    readonly candidate: CommandBrewRiskSummary
    readonly paired: CommandBrewPairedSummary
  }>>
}

export interface CommandBrewRiskAwareDevelopmentReport {
  readonly version: typeof COMMAND_BREW_RISK_EVALUATION_VERSION
  readonly evidence: 'development-model-comparison-not-real-world-success-rate'
  readonly traceAuthenticityBoundary: 'canonical-command-brew-transition-replay-not-rng-origin-proof'
  readonly corpusRole: 'development'
  readonly coverage: {
    readonly manifestVersion: string
    readonly corpusId: string
    readonly declaredCorpusRole: string
    readonly declaredCompleteCoverage: boolean
    readonly validatedCompleteCoverage: boolean
    readonly plausibleEpisodesPerArm: number
    readonly catastropheEpisodesPerArm: number
  }
  readonly conditionFishingOpportunityConditions: readonly MaterialCondition[]
  readonly plausible: CommandBrewRiskAwareSliceReport
  readonly catastropheRecovery: CommandBrewRiskAwareSliceReport
  readonly developmentDecision: {
    readonly formalPromotionEligible: false
    readonly developmentExpansionEligible: boolean
    readonly reasons: readonly Readonly<Record<string, unknown>>[]
    readonly stressQualityBoundary: 'reported-but-not-a-promotion-veto'
  }
}

const FISHING_ACTIONS = new Set<CraftActionId>(['observe', 'carefulObservation'])
const STOP_REASONS: readonly EpisodeStopReason[] = [
  'completed',
  'failed',
  'policy-null',
  'no-legal-action',
  'illegal-action',
  'action-limit',
]
const EXPECTED_EQUIPMENT_IDS = PLAYER_EQUIPMENT_PROFILES.map(({ id }) => id)
const EXPECTED_PLAUSIBLE_PROFILE_IDS = COMMAND_BREW_SENSITIVITY_PROFILES.map(({ id }) => id)
const EXPECTED_CATASTROPHE_PROFILE_IDS = [
  'command-brew-adversarial-all-normal-v1',
  'command-brew-adversarial-all-malleable-v1',
] as const
const EXPECTED_DEVELOPMENT_SEEDS = corpusSeeds(COMMAND_BREW_DEVELOPMENT_CORPUS)
const EXPECTED_REQUIRED_CATASTROPHE_SEEDS = EXPECTED_DEVELOPMENT_SEEDS.slice(
  0,
  COMMAND_BREW_REQUIRED_CATASTROPHE_SEED_COUNT,
)
const MATERIAL_CONDITION_SET = new Set<MaterialCondition>(MATERIAL_CONDITIONS)

function episodeKey(episode: CommandBrewEvaluationEpisode): string {
  return `${episode.equipmentId}|${episode.conditionProfileId}|${episode.seed}`
}

function cellKey(episode: CommandBrewEvaluationEpisode): string {
  return `${episode.equipmentId}|${episode.conditionProfileId}`
}

function countSummary(values: readonly number[]): CountSummary {
  if (values.length === 0) return { minimum: null, p10: null, average: null, maximum: null }
  const sorted = [...values].sort((left, right) => left - right)
  return {
    minimum: sorted[0]!,
    p10: sorted[Math.max(0, Math.ceil(sorted.length * 0.1) - 1)]!,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    maximum: sorted.at(-1)!,
  }
}

function tierCounts(episodes: readonly CommandBrewEvaluationEpisode[]): TierCounts {
  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  return {
    completed: completed.length,
    quality7200: completed.filter(({ result }) => result.finalState.quality >= 7_200).length,
    quality10200: completed.filter(({ result }) => result.finalState.quality >= 10_200).length,
    fullQuality12000: completed.filter(({ result }) => result.finalState.quality >= 12_000).length,
  }
}

function recoverySummary(
  episodes: readonly CommandBrewEvaluationEpisode[],
  lastAdverseStepIndex: (episode: CommandBrewEvaluationEpisode) => number,
): RecoverySummary {
  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  const qualityGains: number[] = []
  const progressGains: number[] = []
  const actionsAfter: number[] = []
  for (const episode of episodes) {
    const index = lastAdverseStepIndex(episode)
    if (index < 0) throw new Error(`missing adverse event in recovery episode ${episodeKey(episode)}`)
    const adverseAfter = episode.result.steps[index]!.after
    qualityGains.push(episode.result.finalState.quality - adverseAfter.quality)
    progressGains.push(episode.result.finalState.progress - adverseAfter.progress)
    actionsAfter.push(episode.result.steps.length - index - 1)
  }
  return {
    episodes: episodes.length,
    ...tierCounts(episodes),
    incomplete: episodes.length - completed.length,
    finalCompletedQuality: countSummary(completed.map(({ result }) => result.finalState.quality)),
    qualityGainedAfterLastAdverseEvent: countSummary(qualityGains),
    progressGainedAfterLastAdverseEvent: countSummary(progressGains),
    actionsAfterLastAdverseEvent: countSummary(actionsAfter),
  }
}

function validateEpisode(episode: CommandBrewEvaluationEpisode): void {
  if (episode.equipmentId.trim().length === 0) throw new TypeError('equipmentId must not be empty')
  if (episode.conditionProfileId.trim().length === 0) throw new TypeError('conditionProfileId must not be empty')
  if (!Number.isSafeInteger(episode.seed) || episode.seed < 0 || episode.seed > 0xffff_ffff) {
    throw new TypeError('episode seed must be a uint32 integer')
  }
  if (!Number.isSafeInteger(episode.safetyViolations) || episode.safetyViolations < 0) {
    throw new TypeError('safetyViolations must be a non-negative integer')
  }
  if (episode.result.actions.length !== episode.result.steps.length) {
    throw new Error(`trace/action length mismatch for ${episodeKey(episode)}`)
  }
  if (episode.result.terminal !== 'none' && episode.result.steps.length === 0) {
    throw new Error(`terminal episode has no transition for ${episodeKey(episode)}`)
  }
  const equipment = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === episode.equipmentId)
  if (equipment === undefined) throw new Error(`unknown Command Brew equipment ${episode.equipmentId}`)
  const activeCrafter = equipment.crafter
  episode.result.actions.forEach((action, index) => {
    if (episode.result.steps[index]!.action !== action) {
      throw new Error(`trace/action mismatch for ${episodeKey(episode)} at ${index}`)
    }
  })
  if (episode.result.finalState.terminal !== episode.result.terminal) {
    throw new Error(`final-state terminal mismatch for ${episodeKey(episode)}`)
  }
  if (!['none', 'completed', 'failed'].includes(episode.result.terminal)) {
    throw new Error(`unknown terminal value for ${episodeKey(episode)}`)
  }
  if (!STOP_REASONS.includes(episode.result.stopReason)) {
    throw new Error(`unknown stop reason for ${episodeKey(episode)}`)
  }
  if (episode.result.stoppedByLimit !== (episode.result.stopReason === 'action-limit')) {
    throw new Error(`stoppedByLimit mismatch for ${episodeKey(episode)}`)
  }
  if (
    (episode.result.terminal === 'completed' && episode.result.stopReason !== 'completed')
    || (episode.result.terminal === 'failed' && episode.result.stopReason !== 'failed')
    || (
      episode.result.terminal === 'none'
      && (episode.result.stopReason === 'completed' || episode.result.stopReason === 'failed')
    )
  ) {
    throw new Error(`terminal/stopReason mismatch for ${episodeKey(episode)}`)
  }
  episode.result.steps.forEach((current, index) => {
    if (!Object.hasOwn(ACTIONS, current.action)) {
      throw new Error(`unknown action for ${episodeKey(episode)} at ${index}`)
    }
    if (typeof current.success !== 'boolean') {
      throw new Error(`non-boolean action outcome for ${episodeKey(episode)} at ${index}`)
    }
    if (!MATERIAL_CONDITION_SET.has(current.nextCondition)) {
      throw new Error(`unknown next condition for ${episodeKey(episode)} at ${index}`)
    }
    if (current.after.condition !== current.nextCondition) {
      throw new Error(`next-condition/after-state mismatch for ${episodeKey(episode)} at ${index}`)
    }
    if (current.before.terminal !== 'none') {
      throw new Error(`step begins after terminal state for ${episodeKey(episode)} at ${index}`)
    }
    if (index > 0 && !isDeepStrictEqual(episode.result.steps[index - 1]!.after, current.before)) {
      throw new Error(`step state continuity mismatch for ${episodeKey(episode)} at ${index}`)
    }
    if (index < episode.result.steps.length - 1 && current.after.terminal !== 'none') {
      throw new Error(`trace continues after terminal state for ${episodeKey(episode)} at ${index}`)
    }
    assertCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, activeCrafter, current.before)
    assertCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, activeCrafter, current.after)
    const replayed = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      activeCrafter,
      current.before,
      current.action,
      { success: current.success, nextCondition: current.nextCondition },
    ).nextState
    if (!isDeepStrictEqual(replayed, current.after)) {
      throw new Error(`canonical transition replay mismatch for ${episodeKey(episode)} at ${index}`)
    }
  })
  assertCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, activeCrafter, episode.result.finalState)
  const finalStep = episode.result.steps.at(-1)
  if (finalStep !== undefined && !isDeepStrictEqual(finalStep.after, episode.result.finalState)) {
    throw new Error(`final-state/last-step mismatch for ${episodeKey(episode)}`)
  }
  const fishingStepIndexes = new Set<number>()
  for (const event of episode.conditionFishingEvents) {
    if (!Number.isSafeInteger(event.stepIndex) || event.stepIndex < 0 || event.stepIndex >= episode.result.steps.length) {
      throw new RangeError(`condition-fishing step index is out of range for ${episodeKey(episode)}`)
    }
    if (fishingStepIndexes.has(event.stepIndex)) {
      throw new Error(`duplicate condition-fishing event for ${episodeKey(episode)} at ${event.stepIndex}`)
    }
    fishingStepIndexes.add(event.stepIndex)
    const declaredStep = episode.result.steps[event.stepIndex]!
    if (!FISHING_ACTIONS.has(declaredStep.action)) {
      throw new Error(`condition-fishing event does not reference Observe for ${episodeKey(episode)} at ${event.stepIndex}`)
    }
    if (event.targetConditions.length === 0) {
      throw new Error(`condition-fishing event has no target for ${episodeKey(episode)} at ${event.stepIndex}`)
    }
    const targets = new Set<MaterialCondition>()
    for (const target of event.targetConditions) {
      if (!MATERIAL_CONDITION_SET.has(target)) {
        throw new Error(`condition-fishing event has unknown target for ${episodeKey(episode)} at ${event.stepIndex}`)
      }
      if (targets.has(target)) {
        throw new Error(`condition-fishing event has duplicate target for ${episodeKey(episode)} at ${event.stepIndex}`)
      }
      targets.add(target)
    }
  }
}

function maximumConsecutive<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let current = 0
  let maximum = 0
  for (const value of values) {
    if (predicate(value)) {
      current += 1
      maximum = Math.max(maximum, current)
    } else {
      current = 0
    }
  }
  return maximum
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1
}

function findLastStepIndex(
  episode: CommandBrewEvaluationEpisode,
  predicate: (step: EpisodeTraceResult['steps'][number], index: number) => boolean,
): number {
  for (let index = episode.result.steps.length - 1; index >= 0; index -= 1) {
    if (predicate(episode.result.steps[index]!, index)) return index
  }
  return -1
}

interface DeclaredFishingStep {
  readonly stepIndex: number
  readonly step: EpisodeTraceResult['steps'][number]
  readonly targets: ReadonlySet<MaterialCondition>
}

function declaredFishingSteps(episode: CommandBrewEvaluationEpisode): DeclaredFishingStep[] {
  return episode.conditionFishingEvents.map((event) => ({
    stepIndex: event.stepIndex,
    step: episode.result.steps[event.stepIndex]!,
    targets: new Set(event.targetConditions),
  }))
}

export function summarizeCommandBrewRiskEpisodes(
  episodes: readonly CommandBrewEvaluationEpisode[],
): CommandBrewRiskSummary {
  episodes.forEach(validateEpisode)
  const stochasticAttemptsByAction: Record<string, number> = {}
  const stochasticFailuresByAction: Record<string, number> = {}
  const fishingOutcomesByCondition: Record<string, number> = {}
  let stochasticAttempts = 0
  let stochasticSuccesses = 0
  let stochasticFailures = 0
  let maximumStochasticAttempts = 0
  let maximumConsecutiveFailures = 0
  let successfulDirectProgressGain = 0
  let successfulDirectQualityGain = 0
  let fishingAttempts = 0
  let fishingFavorableOutcomes = 0
  let maximumFishingAttempts = 0
  let maximumConsecutiveFishingAttempts = 0
  const cpAfterStochasticFailure: number[] = []
  const durabilityAfterStochasticFailure: number[] = []
  const cpAfterFishingMiss: number[] = []
  const durabilityAfterFishingMiss: number[] = []

  const stochasticFailureEpisodes: CommandBrewEvaluationEpisode[] = []
  const fishingMissEpisodes: CommandBrewEvaluationEpisode[] = []
  const adverseEpisodes: CommandBrewEvaluationEpisode[] = []
  let episodesWithStochasticAttempts = 0
  let episodesWithFishingAttempts = 0

  for (const episode of episodes) {
    const riskySteps = episode.result.steps.filter(({ action }) => ACTIONS[action].successRate < 1)
    const fishingSteps = declaredFishingSteps(episode)
    const failedRiskySteps = riskySteps.filter(({ success }) => !success)
    const missedFishingSteps = fishingSteps.filter(({ step, targets }) => !targets.has(step.nextCondition))

    stochasticAttempts += riskySteps.length
    stochasticSuccesses += riskySteps.length - failedRiskySteps.length
    stochasticFailures += failedRiskySteps.length
    fishingAttempts += fishingSteps.length
    fishingFavorableOutcomes += fishingSteps.length - missedFishingSteps.length
    maximumStochasticAttempts = Math.max(maximumStochasticAttempts, riskySteps.length)
    maximumFishingAttempts = Math.max(maximumFishingAttempts, fishingSteps.length)
    maximumConsecutiveFailures = Math.max(
      maximumConsecutiveFailures,
      maximumConsecutive(riskySteps, ({ success }) => !success),
    )
    maximumConsecutiveFishingAttempts = Math.max(
      maximumConsecutiveFishingAttempts,
      maximumConsecutive(
        episode.result.steps.map((_step, index) => index),
        (index) => fishingSteps.some(({ stepIndex }) => stepIndex === index),
      ),
    )

    if (riskySteps.length > 0) episodesWithStochasticAttempts += 1
    if (fishingSteps.length > 0) episodesWithFishingAttempts += 1
    if (failedRiskySteps.length > 0) stochasticFailureEpisodes.push(episode)
    if (missedFishingSteps.length > 0) fishingMissEpisodes.push(episode)
    if (failedRiskySteps.length > 0 || missedFishingSteps.length > 0) adverseEpisodes.push(episode)

    for (const step of riskySteps) {
      increment(stochasticAttemptsByAction, step.action)
      if (step.success) {
        successfulDirectProgressGain += Math.max(0, step.after.progress - step.before.progress)
        successfulDirectQualityGain += Math.max(0, step.after.quality - step.before.quality)
      } else {
        increment(stochasticFailuresByAction, step.action)
        cpAfterStochasticFailure.push(step.after.cp)
        durabilityAfterStochasticFailure.push(step.after.durability)
      }
    }
    for (const { step, targets } of fishingSteps) {
      increment(fishingOutcomesByCondition, step.nextCondition)
      if (!targets.has(step.nextCondition)) {
        cpAfterFishingMiss.push(step.after.cp)
        durabilityAfterFishingMiss.push(step.after.durability)
      }
    }
  }

  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  const stopReasons = Object.fromEntries(STOP_REASONS.map((reason) => [
    reason,
    episodes.filter(({ result }) => result.stopReason === reason).length,
  ])) as Record<EpisodeStopReason, number>
  const lastRiskFailure = (episode: CommandBrewEvaluationEpisode) => findLastStepIndex(
    episode,
    ({ action, success }) => ACTIONS[action].successRate < 1 && !success,
  )
  const lastFishingMiss = (episode: CommandBrewEvaluationEpisode) => findLastStepIndex(
    episode,
    ({ nextCondition }, index) => {
      const event = episode.conditionFishingEvents.find((candidate) => candidate.stepIndex === index)
      return event !== undefined && !event.targetConditions.includes(nextCondition)
    },
  )
  const lastAdverse = (episode: CommandBrewEvaluationEpisode) => Math.max(
    lastRiskFailure(episode),
    lastFishingMiss(episode),
  )

  return {
    episodes: episodes.length,
    outcomes: {
      ...tierCounts(episodes),
      finalCompletedQuality: countSummary(completed.map(({ result }) => result.finalState.quality)),
    },
    stochasticActions: {
      attempts: stochasticAttempts,
      successes: stochasticSuccesses,
      failures: stochasticFailures,
      episodesWithAttempts: episodesWithStochasticAttempts,
      episodesWithFailures: stochasticFailureEpisodes.length,
      maximumAttemptsInEpisode: maximumStochasticAttempts,
      maximumConsecutiveFailures,
      successfulDirectProgressGain,
      successfulDirectQualityGain,
      attemptsByAction: stochasticAttemptsByAction,
      failuresByAction: stochasticFailuresByAction,
      minimumCpAfterFailure: cpAfterStochasticFailure.length === 0 ? null : Math.min(...cpAfterStochasticFailure),
      minimumDurabilityAfterFailure: durabilityAfterStochasticFailure.length === 0
        ? null
        : Math.min(...durabilityAfterStochasticFailure),
      recovery: recoverySummary(stochasticFailureEpisodes, lastRiskFailure),
    },
    conditionFishing: {
      attempts: fishingAttempts,
      favorableOutcomes: fishingFavorableOutcomes,
      misses: fishingAttempts - fishingFavorableOutcomes,
      episodesWithAttempts: episodesWithFishingAttempts,
      episodesWithMisses: fishingMissEpisodes.length,
      maximumAttemptsInEpisode: maximumFishingAttempts,
      maximumConsecutiveAttempts: maximumConsecutiveFishingAttempts,
      outcomesByCondition: fishingOutcomesByCondition,
      minimumCpAfterMiss: cpAfterFishingMiss.length === 0 ? null : Math.min(...cpAfterFishingMiss),
      minimumDurabilityAfterMiss: durabilityAfterFishingMiss.length === 0
        ? null
        : Math.min(...durabilityAfterFishingMiss),
      recoveryAfterMiss: recoverySummary(fishingMissEpisodes, lastFishingMiss),
    },
    adverseEventRecovery: recoverySummary(adverseEpisodes, lastAdverse),
    integrity: {
      safetyViolations: episodes.reduce((sum, episode) => sum + episode.safetyViolations, 0),
      terminalFailures: episodes.filter(({ result }) => result.terminal === 'failed').length,
      illegalActionStops: stopReasons['illegal-action'],
      policyNullStops: stopReasons['policy-null'],
      noLegalActionStops: stopReasons['no-legal-action'],
      actionLimitStops: stopReasons['action-limit'],
      nonCompletedStops: episodes.length - completed.length,
      stopReasons,
    },
  }
}

function assertPairedCoverage(
  baseline: readonly CommandBrewEvaluationEpisode[],
  candidate: readonly CommandBrewEvaluationEpisode[],
): ReadonlyMap<string, CommandBrewEvaluationEpisode> {
  const baselineByKey = new Map<string, CommandBrewEvaluationEpisode>()
  for (const episode of baseline) {
    const key = episodeKey(episode)
    if (baselineByKey.has(key)) throw new Error(`duplicate baseline episode ${key}`)
    baselineByKey.set(key, episode)
  }
  const candidateKeys = new Set<string>()
  for (const episode of candidate) {
    const key = episodeKey(episode)
    if (candidateKeys.has(key)) throw new Error(`duplicate candidate episode ${key}`)
    candidateKeys.add(key)
    if (!baselineByKey.has(key)) throw new Error(`missing paired baseline ${key}`)
  }
  for (const key of baselineByKey.keys()) {
    if (!candidateKeys.has(key)) throw new Error(`missing paired candidate ${key}`)
  }
  return baselineByKey
}

function pairedBoolean(
  outcome: PairedOutcome,
  baseline: boolean,
  candidate: boolean,
): void {
  if (candidate && !baseline) (outcome as { wins: number }).wins += 1
  else if (!candidate && baseline) (outcome as { losses: number }).losses += 1
  else (outcome as { ties: number }).ties += 1
}

function emptyPairedOutcome(): { wins: number; losses: number; ties: number } {
  return { wins: 0, losses: 0, ties: 0 }
}

export function compareCommandBrewRiskEpisodes(
  baseline: readonly CommandBrewEvaluationEpisode[],
  candidate: readonly CommandBrewEvaluationEpisode[],
): CommandBrewPairedSummary {
  const baselineByKey = assertPairedCoverage(baseline, candidate)
  const completion = emptyPairedOutcome()
  const quality7200 = emptyPairedOutcome()
  const quality10200 = emptyPairedOutcome()
  const fullQuality12000 = emptyPairedOutcome()
  const rawCompletedQuality = emptyPairedOutcome()
  let totalQualityDelta = 0
  let worstDelta = Number.POSITIVE_INFINITY
  let worstDeltaKey: string | null = null

  for (const candidateEpisode of candidate) {
    const key = episodeKey(candidateEpisode)
    const baselineEpisode = baselineByKey.get(key)!
    const baselineCompleted = baselineEpisode.result.terminal === 'completed'
    const candidateCompleted = candidateEpisode.result.terminal === 'completed'
    const baselineQuality = baselineCompleted ? baselineEpisode.result.finalState.quality : 0
    const candidateQuality = candidateCompleted ? candidateEpisode.result.finalState.quality : 0
    pairedBoolean(completion, baselineCompleted, candidateCompleted)
    pairedBoolean(quality7200, baselineCompleted && baselineQuality >= 7_200, candidateCompleted && candidateQuality >= 7_200)
    pairedBoolean(quality10200, baselineCompleted && baselineQuality >= 10_200, candidateCompleted && candidateQuality >= 10_200)
    pairedBoolean(fullQuality12000, baselineCompleted && baselineQuality >= 12_000, candidateCompleted && candidateQuality >= 12_000)
    if (candidateQuality > baselineQuality) rawCompletedQuality.wins += 1
    else if (candidateQuality < baselineQuality) rawCompletedQuality.losses += 1
    else rawCompletedQuality.ties += 1
    const delta = candidateQuality - baselineQuality
    totalQualityDelta += delta
    if (delta < worstDelta) {
      worstDelta = delta
      worstDeltaKey = key
    }
  }

  return {
    episodes: candidate.length,
    completion,
    quality7200,
    quality10200,
    fullQuality12000,
    rawCompletedQuality: {
      ...rawCompletedQuality,
      averageDelta: candidate.length === 0 ? 0 : totalQualityDelta / candidate.length,
      worstDelta: candidate.length === 0 ? 0 : worstDelta,
      worstDeltaKey,
    },
  }
}

function sliceReport(
  baseline: readonly CommandBrewEvaluationEpisode[],
  candidate: readonly CommandBrewEvaluationEpisode[],
): CommandBrewRiskAwareSliceReport {
  assertPairedCoverage(baseline, candidate)
  const keys = [...new Set(candidate.map(cellKey))].sort()
  return {
    baseline: summarizeCommandBrewRiskEpisodes(baseline),
    candidate: summarizeCommandBrewRiskEpisodes(candidate),
    paired: compareCommandBrewRiskEpisodes(baseline, candidate),
    cells: Object.fromEntries(keys.map((key) => {
      const baselineCell = baseline.filter((episode) => cellKey(episode) === key)
      const candidateCell = candidate.filter((episode) => cellKey(episode) === key)
      return [key, {
        baseline: summarizeCommandBrewRiskEpisodes(baselineCell),
        candidate: summarizeCommandBrewRiskEpisodes(candidateCell),
        paired: compareCommandBrewRiskEpisodes(baselineCell, candidateCell),
      }]
    })),
  }
}

function sameStringMembers(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false
  const actualSet = new Set(actual)
  return actualSet.size === actual.length && expected.every((value) => actualSet.has(value))
}

function sameNumberMembers(actual: readonly number[], expected: readonly number[]): boolean {
  if (actual.length !== expected.length) return false
  const actualSet = new Set(actual)
  return actualSet.size === actual.length && expected.every((value) => actualSet.has(value))
}

function expectedEpisodeKeys(
  equipmentIds: readonly string[],
  profileIds: readonly string[],
  seeds: readonly number[],
): Set<string> {
  return new Set(equipmentIds.flatMap((equipmentId) => profileIds.flatMap((conditionProfileId) => (
    seeds.map((seed) => `${equipmentId}|${conditionProfileId}|${seed}`)
  ))))
}

function addExactSliceCoverageReason(
  reasons: Array<Record<string, unknown>>,
  slice: 'plausible' | 'catastrophe-recovery',
  arm: 'baseline' | 'candidate',
  episodes: readonly CommandBrewEvaluationEpisode[],
  expected: ReadonlySet<string>,
): void {
  const actual = new Set(episodes.map(episodeKey))
  const missing = [...expected].filter((key) => !actual.has(key))
  const extra = [...actual].filter((key) => !expected.has(key))
  if (missing.length > 0 || extra.length > 0 || actual.size !== episodes.length) {
    reasons.push({
      kind: 'incomplete-or-unexpected-episode-coverage',
      slice,
      arm,
      expected: expected.size,
      actualEpisodes: episodes.length,
      actualUnique: actual.size,
      missingCount: missing.length,
      extraCount: extra.length,
      missingExamples: missing.slice(0, 3),
      extraExamples: extra.slice(0, 3),
    })
  }
}

function coverageReasons(
  coverage: Readonly<CommandBrewRiskCoverageManifest>,
  input: Readonly<{
    plausible: Readonly<{
      baseline: readonly CommandBrewEvaluationEpisode[]
      candidate: readonly CommandBrewEvaluationEpisode[]
    }>
    catastropheRecovery: Readonly<{
      baseline: readonly CommandBrewEvaluationEpisode[]
      candidate: readonly CommandBrewEvaluationEpisode[]
    }>
  }>,
): Array<Record<string, unknown>> {
  const reasons: Array<Record<string, unknown>> = []
  if (coverage.version !== COMMAND_BREW_RISK_COVERAGE_MANIFEST_VERSION) {
    reasons.push({ kind: 'coverage-manifest-version-mismatch', observed: coverage.version })
  }
  if (
    coverage.corpusId !== COMMAND_BREW_DEVELOPMENT_CORPUS.id
    || coverage.corpusRole !== COMMAND_BREW_DEVELOPMENT_CORPUS.role
  ) {
    reasons.push({
      kind: 'untrusted-or-non-development-corpus',
      observedCorpusId: coverage.corpusId,
      observedCorpusRole: coverage.corpusRole,
      expectedCorpusId: COMMAND_BREW_DEVELOPMENT_CORPUS.id,
      expectedCorpusRole: COMMAND_BREW_DEVELOPMENT_CORPUS.role,
    })
  }
  if (!coverage.completeCoverage) {
    reasons.push({ kind: 'coverage-not-declared-complete' })
  }
  if (!sameStringMembers(coverage.equipmentIds, EXPECTED_EQUIPMENT_IDS)) {
    reasons.push({
      kind: 'equipment-coverage-mismatch',
      observed: coverage.equipmentIds,
      expected: EXPECTED_EQUIPMENT_IDS,
    })
  }
  if (!sameStringMembers(coverage.plausibleConditionProfileIds, EXPECTED_PLAUSIBLE_PROFILE_IDS)) {
    reasons.push({
      kind: 'plausible-world-coverage-mismatch',
      observed: coverage.plausibleConditionProfileIds,
      expected: EXPECTED_PLAUSIBLE_PROFILE_IDS,
    })
  }
  if (!sameStringMembers(coverage.catastropheConditionProfileIds, EXPECTED_CATASTROPHE_PROFILE_IDS)) {
    reasons.push({
      kind: 'catastrophe-world-coverage-mismatch',
      observed: coverage.catastropheConditionProfileIds,
      expected: EXPECTED_CATASTROPHE_PROFILE_IDS,
    })
  }
  if (!sameNumberMembers(coverage.plausibleSeeds, EXPECTED_DEVELOPMENT_SEEDS)) {
    reasons.push({
      kind: 'development-seed-coverage-mismatch',
      observedCount: coverage.plausibleSeeds.length,
      expectedCount: EXPECTED_DEVELOPMENT_SEEDS.length,
    })
  }
  const catastropheSeedSet = new Set(coverage.catastropheSeeds)
  const catastropheSeedsAreUnique = catastropheSeedSet.size === coverage.catastropheSeeds.length
  const catastropheSeedsBelongToDevelopment = coverage.catastropheSeeds.every((seed) => (
    EXPECTED_DEVELOPMENT_SEEDS.includes(seed)
  ))
  const includesRequiredCatastropheSeeds = EXPECTED_REQUIRED_CATASTROPHE_SEEDS.every((seed) => (
    catastropheSeedSet.has(seed)
  ))
  if (
    !catastropheSeedsAreUnique
    || !catastropheSeedsBelongToDevelopment
    || !includesRequiredCatastropheSeeds
  ) {
    reasons.push({
      kind: 'catastrophe-seed-coverage-mismatch',
      observedCount: coverage.catastropheSeeds.length,
      requiredMinimum: COMMAND_BREW_REQUIRED_CATASTROPHE_SEED_COUNT,
      unique: catastropheSeedsAreUnique,
      allFromDevelopmentCorpus: catastropheSeedsBelongToDevelopment,
      includesRequiredPrefix: includesRequiredCatastropheSeeds,
    })
  }

  const plausibleExpected = expectedEpisodeKeys(
    coverage.equipmentIds,
    coverage.plausibleConditionProfileIds,
    coverage.plausibleSeeds,
  )
  const catastropheExpected = expectedEpisodeKeys(
    coverage.equipmentIds,
    coverage.catastropheConditionProfileIds,
    coverage.catastropheSeeds,
  )
  addExactSliceCoverageReason(reasons, 'plausible', 'baseline', input.plausible.baseline, plausibleExpected)
  addExactSliceCoverageReason(reasons, 'plausible', 'candidate', input.plausible.candidate, plausibleExpected)
  addExactSliceCoverageReason(
    reasons,
    'catastrophe-recovery',
    'baseline',
    input.catastropheRecovery.baseline,
    catastropheExpected,
  )
  addExactSliceCoverageReason(
    reasons,
    'catastrophe-recovery',
    'candidate',
    input.catastropheRecovery.candidate,
    catastropheExpected,
  )
  return reasons
}

function collectFishingTargetConditions(
  episodes: readonly CommandBrewEvaluationEpisode[],
): MaterialCondition[] {
  const targets = new Set(episodes.flatMap((episode) => (
    episode.conditionFishingEvents.flatMap(({ targetConditions }) => targetConditions)
  )))
  return MATERIAL_CONDITIONS.filter((condition) => targets.has(condition))
}

function validateRiskBudget(budget: CommandBrewRiskBudget): void {
  const requiredFields = [
    'maxStochasticAttemptsPerEpisode',
    'maxConsecutiveStochasticFailures',
    'maxConditionFishingAttemptsPerEpisode',
    'minimumCpAfterStochasticFailure',
    'minimumDurabilityAfterStochasticFailure',
    'maximumPlausibleP10QualityRegression',
    'maximumPlausibleAverageQualityRegression',
    'maximumPlausibleWorstEpisodeQualityRegression',
  ] as const satisfies readonly (keyof CommandBrewRiskBudget)[]
  for (const key of requiredFields) {
    const value = budget[key]
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${key} must be a non-negative safe integer`)
    }
  }
  const optionalQualityFloor = budget.minimumPlausibleCompletedQualityAfterAdverseEvent
  if (
    optionalQualityFloor !== undefined
    && (!Number.isSafeInteger(optionalQualityFloor) || optionalQualityFloor < 0)
  ) {
    throw new TypeError('minimumPlausibleCompletedQualityAfterAdverseEvent must be a non-negative safe integer')
  }
}

function hardStopCount(summary: CommandBrewRiskSummary): number {
  return summary.integrity.terminalFailures
    + summary.integrity.illegalActionStops
    + summary.integrity.policyNullStops
    + summary.integrity.noLegalActionStops
    + summary.integrity.actionLimitStops
}

function addIntegrityReasons(
  reasons: Array<Record<string, unknown>>,
  slice: 'plausible' | 'catastrophe-recovery',
  baseline: CommandBrewRiskSummary,
  candidate: CommandBrewRiskSummary,
): void {
  if (candidate.integrity.safetyViolations > 0) {
    reasons.push({ kind: 'safety-violation', slice, count: candidate.integrity.safetyViolations })
  }
  const baselineHardStops = hardStopCount(baseline)
  const candidateHardStops = hardStopCount(candidate)
  if (candidateHardStops > 0) {
    reasons.push({
      kind: candidateHardStops > baselineHardStops ? 'hard-stop-regression' : 'candidate-hard-stop',
      slice,
      baseline: baselineHardStops,
      candidate: candidateHardStops,
    })
  }
}

function addRiskBudgetReasons(
  reasons: Array<Record<string, unknown>>,
  slice: 'plausible' | 'catastrophe-recovery',
  summary: CommandBrewRiskSummary,
  budget: CommandBrewRiskBudget | null,
): void {
  const usesRisk = summary.stochasticActions.attempts > 0 || summary.conditionFishing.attempts > 0
  if (!usesRisk) return
  if (budget === null) {
    reasons.push({ kind: 'explicit-risk-budget-missing', slice })
    return
  }
  if (summary.stochasticActions.attempts > 0 && summary.stochasticActions.failures === 0) {
    reasons.push({ kind: 'stochastic-failure-recovery-not-exercised', slice })
  }
  if (summary.conditionFishing.attempts > 0 && summary.conditionFishing.misses === 0) {
    reasons.push({ kind: 'condition-fishing-miss-recovery-not-exercised', slice })
  }
  if (summary.stochasticActions.maximumAttemptsInEpisode > budget.maxStochasticAttemptsPerEpisode) {
    reasons.push({
      kind: 'stochastic-attempt-budget-exceeded',
      slice,
      observed: summary.stochasticActions.maximumAttemptsInEpisode,
      budget: budget.maxStochasticAttemptsPerEpisode,
    })
  }
  if (summary.stochasticActions.maximumConsecutiveFailures > budget.maxConsecutiveStochasticFailures) {
    reasons.push({
      kind: 'consecutive-failure-budget-exceeded',
      slice,
      observed: summary.stochasticActions.maximumConsecutiveFailures,
      budget: budget.maxConsecutiveStochasticFailures,
    })
  }
  if (summary.conditionFishing.maximumAttemptsInEpisode > budget.maxConditionFishingAttemptsPerEpisode) {
    reasons.push({
      kind: 'condition-fishing-budget-exceeded',
      slice,
      observed: summary.conditionFishing.maximumAttemptsInEpisode,
      budget: budget.maxConditionFishingAttemptsPerEpisode,
    })
  }
  if (
    summary.stochasticActions.minimumCpAfterFailure !== null
    && summary.stochasticActions.minimumCpAfterFailure < budget.minimumCpAfterStochasticFailure
  ) {
    reasons.push({
      kind: 'cp-floor-after-failure-breached',
      slice,
      observed: summary.stochasticActions.minimumCpAfterFailure,
      budget: budget.minimumCpAfterStochasticFailure,
    })
  }
  if (
    summary.stochasticActions.minimumDurabilityAfterFailure !== null
    && summary.stochasticActions.minimumDurabilityAfterFailure < budget.minimumDurabilityAfterStochasticFailure
  ) {
    reasons.push({
      kind: 'durability-floor-after-failure-breached',
      slice,
      observed: summary.stochasticActions.minimumDurabilityAfterFailure,
      budget: budget.minimumDurabilityAfterStochasticFailure,
    })
  }
  if (summary.adverseEventRecovery.incomplete > 0) {
    reasons.push({
      kind: 'adverse-event-not-recovered-to-completion',
      slice,
      count: summary.adverseEventRecovery.incomplete,
    })
  }
  if (
    slice === 'plausible'
    && budget.minimumPlausibleCompletedQualityAfterAdverseEvent !== undefined
    && summary.adverseEventRecovery.finalCompletedQuality.minimum !== null
    && summary.adverseEventRecovery.finalCompletedQuality.minimum
      < budget.minimumPlausibleCompletedQualityAfterAdverseEvent
  ) {
    reasons.push({
      kind: 'post-adverse-quality-floor-breached',
      slice,
      observed: summary.adverseEventRecovery.finalCompletedQuality.minimum,
      budget: budget.minimumPlausibleCompletedQualityAfterAdverseEvent,
    })
  }
}

function addPlausibleQualityDownsideReasons(
  reasons: Array<Record<string, unknown>>,
  cells: CommandBrewRiskAwareSliceReport['cells'],
  budget: CommandBrewRiskBudget | null,
): void {
  if (budget === null) {
    reasons.push({ kind: 'plausible-quality-downside-budget-missing', slice: 'plausible' })
    return
  }
  for (const [cell, comparison] of Object.entries(cells)) {
    const baselineQuality = comparison.baseline.outcomes.finalCompletedQuality
    const candidateQuality = comparison.candidate.outcomes.finalCompletedQuality
    if (baselineQuality.p10 !== null && candidateQuality.p10 !== null) {
      const regression = Math.max(0, baselineQuality.p10 - candidateQuality.p10)
      if (regression > budget.maximumPlausibleP10QualityRegression) {
        reasons.push({
          kind: 'plausible-p10-quality-regression-budget-exceeded',
          slice: 'plausible',
          cell,
          baseline: baselineQuality.p10,
          candidate: candidateQuality.p10,
          regression,
          budget: budget.maximumPlausibleP10QualityRegression,
        })
      }
    }
    if (baselineQuality.average !== null && candidateQuality.average !== null) {
      const regression = Math.max(0, baselineQuality.average - candidateQuality.average)
      if (regression > budget.maximumPlausibleAverageQualityRegression) {
        reasons.push({
          kind: 'plausible-average-quality-regression-budget-exceeded',
          slice: 'plausible',
          cell,
          baseline: baselineQuality.average,
          candidate: candidateQuality.average,
          regression,
          budget: budget.maximumPlausibleAverageQualityRegression,
        })
      }
    }
    const worstEpisodeRegression = Math.max(0, -comparison.paired.rawCompletedQuality.worstDelta)
    if (worstEpisodeRegression > budget.maximumPlausibleWorstEpisodeQualityRegression) {
      reasons.push({
        kind: 'plausible-worst-episode-quality-regression-budget-exceeded',
        slice: 'plausible',
        cell,
        worstDelta: comparison.paired.rawCompletedQuality.worstDelta,
        worstDeltaKey: comparison.paired.rawCompletedQuality.worstDeltaKey,
        regression: worstEpisodeRegression,
        budget: budget.maximumPlausibleWorstEpisodeQualityRegression,
      })
    }
  }
}

export function buildCommandBrewRiskAwareDevelopmentReport(
  input: Readonly<{
    coverage: Readonly<CommandBrewRiskCoverageManifest>
    plausible: Readonly<{
      baseline: readonly CommandBrewEvaluationEpisode[]
      candidate: readonly CommandBrewEvaluationEpisode[]
    }>
    catastropheRecovery: Readonly<{
      baseline: readonly CommandBrewEvaluationEpisode[]
      candidate: readonly CommandBrewEvaluationEpisode[]
    }>
    riskBudget: Readonly<CommandBrewRiskBudget> | null
  }>,
): CommandBrewRiskAwareDevelopmentReport {
  if (input.riskBudget !== null) validateRiskBudget(input.riskBudget)
  const plausible = sliceReport(input.plausible.baseline, input.plausible.candidate)
  const catastropheRecovery = sliceReport(
    input.catastropheRecovery.baseline,
    input.catastropheRecovery.candidate,
  )
  const coverageFindings = coverageReasons(input.coverage, input)
  const reasons: Array<Record<string, unknown>> = [...coverageFindings]

  for (const [key, cell] of Object.entries(plausible.cells)) {
    if (cell.paired.completion.losses > 0) {
      reasons.push({
        kind: 'plausible-completion-regression',
        cell: key,
        wins: cell.paired.completion.wins,
        losses: cell.paired.completion.losses,
      })
    }
    for (const [tier, outcome] of [
      ['quality10200', cell.paired.quality10200],
      ['fullQuality12000', cell.paired.fullQuality12000],
    ] as const) {
      if (outcome.losses > outcome.wins) {
        reasons.push({
          kind: 'plausible-meaningful-tier-regression',
          cell: key,
          tier,
          wins: outcome.wins,
          losses: outcome.losses,
        })
      }
    }
  }
  if (
    plausible.paired.quality10200.wins <= plausible.paired.quality10200.losses
    && plausible.paired.fullQuality12000.wins <= plausible.paired.fullQuality12000.losses
  ) {
    reasons.push({
      kind: 'no-paired-meaningful-quality-uplift',
      quality10200: plausible.paired.quality10200,
      fullQuality12000: plausible.paired.fullQuality12000,
    })
  }
  if (catastropheRecovery.paired.completion.losses > 0) {
    reasons.push({
      kind: 'catastrophe-completion-regression',
      wins: catastropheRecovery.paired.completion.wins,
      losses: catastropheRecovery.paired.completion.losses,
    })
  }
  addIntegrityReasons(reasons, 'plausible', plausible.baseline, plausible.candidate)
  addIntegrityReasons(
    reasons,
    'catastrophe-recovery',
    catastropheRecovery.baseline,
    catastropheRecovery.candidate,
  )
  addPlausibleQualityDownsideReasons(reasons, plausible.cells, input.riskBudget)
  addRiskBudgetReasons(reasons, 'plausible', plausible.candidate, input.riskBudget)
  addRiskBudgetReasons(
    reasons,
    'catastrophe-recovery',
    catastropheRecovery.candidate,
    input.riskBudget,
  )

  return {
    version: COMMAND_BREW_RISK_EVALUATION_VERSION,
    evidence: 'development-model-comparison-not-real-world-success-rate',
    traceAuthenticityBoundary: 'canonical-command-brew-transition-replay-not-rng-origin-proof',
    corpusRole: 'development',
    coverage: {
      manifestVersion: input.coverage.version,
      corpusId: input.coverage.corpusId,
      declaredCorpusRole: input.coverage.corpusRole,
      declaredCompleteCoverage: input.coverage.completeCoverage,
      validatedCompleteCoverage: coverageFindings.length === 0,
      plausibleEpisodesPerArm: input.plausible.candidate.length,
      catastropheEpisodesPerArm: input.catastropheRecovery.candidate.length,
    },
    conditionFishingOpportunityConditions: collectFishingTargetConditions([
      ...input.plausible.candidate,
      ...input.catastropheRecovery.candidate,
    ]),
    plausible,
    catastropheRecovery,
    developmentDecision: {
      formalPromotionEligible: false,
      developmentExpansionEligible: reasons.length === 0,
      reasons,
      stressQualityBoundary: 'reported-but-not-a-promotion-veto',
    },
  }
}
