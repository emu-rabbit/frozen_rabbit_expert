import { describe, expect, it } from 'vitest'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
} from '@frozen-rabbit-expert/data'
import {
  COMMAND_BREW_DEVELOPMENT_CORPUS,
  COMMAND_BREW_FROZEN_VALIDATION_CORPUS,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import type {
  EpisodeStep,
  EpisodeStopReason,
} from '@frozen-rabbit-expert/simulator'
import { COMMAND_BREW_SENSITIVITY_PROFILES } from '@frozen-rabbit-expert/simulator'
import {
  COMMAND_BREW_REQUIRED_CATASTROPHE_SEED_COUNT,
  COMMAND_BREW_RISK_COVERAGE_MANIFEST_VERSION,
  buildCommandBrewRiskAwareDevelopmentReport,
  compareCommandBrewRiskEpisodes,
  summarizeCommandBrewRiskEpisodes,
  type CommandBrewEvaluationEpisode,
  type CommandBrewRiskBudget,
  type CommandBrewRiskCoverageManifest,
} from '../tools/evaluate-command-brew-cross-equipment/riskEvaluation'

const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
const initial = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
const developmentSeeds = corpusSeeds(COMMAND_BREW_DEVELOPMENT_CORPUS)
const catastropheSeeds = developmentSeeds.slice(0, COMMAND_BREW_REQUIRED_CATASTROPHE_SEED_COUNT)
const plausibleProfileIds = COMMAND_BREW_SENSITIVITY_PROFILES.map(({ id }) => id)
const catastropheProfileIds = [
  'command-brew-adversarial-all-normal-v1',
  'command-brew-adversarial-all-malleable-v1',
] as const

function state(overrides: Partial<CraftState> = {}): CraftState {
  return {
    ...initial,
    buffs: { ...initial.buffs, ...overrides.buffs },
    ...overrides,
  }
}

function step(input: Readonly<{
  before: CraftState
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
  after: CraftState
}>): EpisodeStep {
  return input
}

function completedEpisode(input: Readonly<{
  equipmentId?: string
  seed?: number
  conditionProfileId: string
  quality: number
  steps?: readonly EpisodeStep[]
  safetyViolations?: number
  conditionFishingEvents?: CommandBrewEvaluationEpisode['conditionFishingEvents']
}>): CommandBrewEvaluationEpisode {
  const equipmentId = input.equipmentId ?? PLAYER_EQUIPMENT_PROFILES[0]!.id
  const activeCrafter = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === equipmentId)!.crafter
  const completionSteps = input.steps ?? (() => {
    const fresh = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, activeCrafter)
    const gain = previewAction(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      activeCrafter,
      fresh,
      'basicSynthesis',
    ).progressGain
    const before = {
      ...fresh,
      progress: SURVEY_CRAFTSMANS_COMMAND_BREW.progressRequired - gain,
      quality: input.quality,
    }
    const after = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      activeCrafter,
      before,
      'basicSynthesis',
      { success: true, nextCondition: 'normal' },
    ).nextState
    return [step({ before, action: 'basicSynthesis', success: true, nextCondition: 'normal', after })]
  })()
  const steps = [...completionSteps]
  return {
    equipmentId,
    conditionProfileId: input.conditionProfileId,
    seed: input.seed ?? 1,
    safetyViolations: input.safetyViolations ?? 0,
    conditionFishingEvents: input.conditionFishingEvents ?? [],
    result: {
      terminal: 'completed',
      finalState: structuredClone(steps.at(-1)!.after),
      actions: steps.map(({ action }) => action),
      steps,
      stoppedByLimit: false,
      stopReason: 'completed',
    },
  }
}

function stoppedEpisode(input: Readonly<{
  equipmentId?: string
  seed?: number
  conditionProfileId: string
  stopReason: Exclude<EpisodeStopReason, 'completed'>
}>): CommandBrewEvaluationEpisode {
  return {
    equipmentId: input.equipmentId ?? PLAYER_EQUIPMENT_PROFILES[0]!.id,
    conditionProfileId: input.conditionProfileId,
    seed: input.seed ?? 1,
    safetyViolations: 0,
    conditionFishingEvents: [],
    result: {
      terminal: input.stopReason === 'failed' ? 'failed' : 'none',
      finalState: state({
        terminal: input.stopReason === 'failed' ? 'failed' : 'none',
        failureReason: input.stopReason === 'failed' ? 'durability' : null,
      }),
      actions: [],
      steps: [],
      stoppedByLimit: input.stopReason === 'action-limit',
      stopReason: input.stopReason,
    },
  }
}

function recoveredRiskEpisode(
  conditionProfileId: string,
  quality: number,
  equipmentId = PLAYER_EQUIPMENT_PROFILES[0]!.id,
  seed = 1,
): CommandBrewEvaluationEpisode {
  const activeCrafter = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === equipmentId)!.crafter
  const fresh = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, activeCrafter)
  const runPrefix = (before: CraftState) => {
    const afterObserve = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      activeCrafter,
      before,
      'observe',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const afterFailure = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      activeCrafter,
      afterObserve,
      'hastyTouch',
      { success: false, nextCondition: 'good' },
    ).nextState
    const afterSuccess = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      activeCrafter,
      afterFailure,
      'hastyTouch',
      { success: true, nextCondition: 'normal' },
    ).nextState
    return { afterObserve, afterFailure, afterSuccess }
  }
  const probe = runPrefix(fresh)
  const qualityGain = probe.afterSuccess.quality
  const finishGain = previewAction(
    SURVEY_CRAFTSMANS_COMMAND_BREW,
    activeCrafter,
    probe.afterSuccess,
    'basicSynthesis',
  ).progressGain
  const before = {
    ...fresh,
    progress: SURVEY_CRAFTSMANS_COMMAND_BREW.progressRequired - finishGain,
    quality: quality - qualityGain,
  }
  const { afterObserve, afterFailure, afterSuccess } = runPrefix(before)
  const afterFinish = applyObservedOutcome(
    SURVEY_CRAFTSMANS_COMMAND_BREW,
    activeCrafter,
    afterSuccess,
    'basicSynthesis',
    { success: true, nextCondition: 'normal' },
  ).nextState
  return completedEpisode({
    equipmentId,
    seed,
    conditionProfileId,
    quality,
    conditionFishingEvents: [{ stepIndex: 0, targetConditions: ['good'] }],
    steps: [
      step({ before, action: 'observe', success: true, nextCondition: 'normal', after: afterObserve }),
      step({ before: afterObserve, action: 'hastyTouch', success: false, nextCondition: 'good', after: afterFailure }),
      step({ before: afterFailure, action: 'hastyTouch', success: true, nextCondition: 'normal', after: afterSuccess }),
      step({ before: afterSuccess, action: 'basicSynthesis', success: true, nextCondition: 'normal', after: afterFinish }),
    ],
  })
}

const budget: CommandBrewRiskBudget = {
  maxStochasticAttemptsPerEpisode: 2,
  maxConsecutiveStochasticFailures: 1,
  maxConditionFishingAttemptsPerEpisode: 1,
  minimumCpAfterStochasticFailure: 620,
  minimumDurabilityAfterStochasticFailure: 45,
  minimumPlausibleCompletedQualityAfterAdverseEvent: 10_200,
  maximumPlausibleP10QualityRegression: 0,
  maximumPlausibleAverageQualityRegression: 0,
  maximumPlausibleWorstEpisodeQualityRegression: 0,
}

function coverageManifest(
  overrides: Partial<CommandBrewRiskCoverageManifest> = {},
): CommandBrewRiskCoverageManifest {
  return {
    version: COMMAND_BREW_RISK_COVERAGE_MANIFEST_VERSION,
    corpusId: COMMAND_BREW_DEVELOPMENT_CORPUS.id,
    corpusRole: COMMAND_BREW_DEVELOPMENT_CORPUS.role,
    completeCoverage: true,
    equipmentIds: PLAYER_EQUIPMENT_PROFILES.map(({ id }) => id),
    plausibleConditionProfileIds: plausibleProfileIds,
    catastropheConditionProfileIds: catastropheProfileIds,
    plausibleSeeds: developmentSeeds,
    catastropheSeeds,
    ...overrides,
  }
}

function episodeMatrix(
  profileIds: readonly string[],
  seeds: readonly number[],
  create: (identity: Readonly<{
    equipmentId: string
    conditionProfileId: string
    seed: number
    seedIndex: number
  }>) => CommandBrewEvaluationEpisode,
): CommandBrewEvaluationEpisode[] {
  return PLAYER_EQUIPMENT_PROFILES.flatMap(({ id: equipmentId }) => profileIds.flatMap((conditionProfileId) => (
    seeds.map((seed, seedIndex) => create({ equipmentId, conditionProfileId, seed, seedIndex }))
  )))
}

describe('Command Brew strategic-risk development evaluation', () => {
  it('separates attempts, payoff, misses, failure recovery, streaks, resources, and true invalid stops', () => {
    const summary = summarizeCommandBrewRiskEpisodes([
      recoveredRiskEpisode('balanced', 10_500),
      stoppedEpisode({ conditionProfileId: 'balanced', stopReason: 'policy-null' }),
    ])

    expect(summary.stochasticActions).toMatchObject({
      attempts: 2,
      successes: 1,
      failures: 1,
      episodesWithAttempts: 1,
      episodesWithFailures: 1,
      maximumAttemptsInEpisode: 2,
      maximumConsecutiveFailures: 1,
      minimumCpAfterFailure: 623,
      minimumDurabilityAfterFailure: 45,
      attemptsByAction: { hastyTouch: 2 },
      failuresByAction: { hastyTouch: 1 },
      recovery: {
        episodes: 1,
        completed: 1,
        quality10200: 1,
        fullQuality12000: 0,
        incomplete: 0,
        actionsAfterLastAdverseEvent: { minimum: 2, average: 2, maximum: 2 },
      },
    })
    expect(summary.stochasticActions.successfulDirectQualityGain).toBeGreaterThan(0)
    expect(summary.stochasticActions.recovery.qualityGainedAfterLastAdverseEvent.minimum).toBeGreaterThan(0)
    expect(summary.conditionFishing).toMatchObject({
      attempts: 1,
      favorableOutcomes: 0,
      misses: 1,
      maximumAttemptsInEpisode: 1,
      maximumConsecutiveAttempts: 1,
      outcomesByCondition: { normal: 1 },
      recoveryAfterMiss: { episodes: 1, completed: 1, quality10200: 1 },
    })
    expect(summary.adverseEventRecovery).toMatchObject({
      episodes: 1,
      completed: 1,
      quality10200: 1,
      incomplete: 0,
    })
    expect(summary.integrity).toMatchObject({
      safetyViolations: 0,
      illegalActionStops: 0,
      policyNullStops: 1,
      nonCompletedStops: 1,
    })
  })

  it('keeps all-Normal quality visible without letting it veto plausible-world value', () => {
    const plausibleBaseline = episodeMatrix(plausibleProfileIds, developmentSeeds, (identity) => (
      completedEpisode({ ...identity, quality: 7_000 })
    ))
    const plausibleCandidate = episodeMatrix(plausibleProfileIds, developmentSeeds, (identity) => (
      recoveredRiskEpisode(identity.conditionProfileId, 10_500, identity.equipmentId, identity.seed)
    ))
    const catastropheBaseline = episodeMatrix(catastropheProfileIds, catastropheSeeds, (identity) => (
      completedEpisode({ ...identity, quality: 12_000 })
    ))
    const catastropheCandidate = episodeMatrix(catastropheProfileIds, catastropheSeeds, (identity) => (
      recoveredRiskEpisode(identity.conditionProfileId, 6_000, identity.equipmentId, identity.seed)
    ))
    const report = buildCommandBrewRiskAwareDevelopmentReport({
      coverage: coverageManifest(),
      plausible: {
        baseline: plausibleBaseline,
        candidate: plausibleCandidate,
      },
      catastropheRecovery: {
        baseline: catastropheBaseline,
        candidate: catastropheCandidate,
      },
      riskBudget: budget,
    })

    expect(report.plausible.paired).toMatchObject({
      completion: { wins: 0, losses: 0, ties: 1_152 },
      quality7200: { wins: 1_152, losses: 0, ties: 0 },
      quality10200: { wins: 1_152, losses: 0, ties: 0 },
      fullQuality12000: { wins: 0, losses: 0, ties: 1_152 },
    })
    expect(report.catastropheRecovery.paired).toMatchObject({
      completion: { wins: 0, losses: 0, ties: 192 },
      fullQuality12000: { wins: 0, losses: 192, ties: 0 },
    })
    expect(report.coverage.validatedCompleteCoverage).toBe(true)
    expect(report.developmentDecision).toEqual({
      formalPromotionEligible: false,
      developmentExpansionEligible: true,
      reasons: [],
      stressQualityBoundary: 'reported-but-not-a-promotion-veto',
    })
  })

  it('requires an explicit risk budget and rejects unrecovered catastrophe stops', () => {
    const baseline = completedEpisode({ conditionProfileId: 'balanced', quality: 7_000 })
    const candidate = recoveredRiskEpisode('balanced', 10_500)
    const withoutBudget = buildCommandBrewRiskAwareDevelopmentReport({
      coverage: coverageManifest({ completeCoverage: false }),
      plausible: { baseline: [baseline], candidate: [candidate] },
      catastropheRecovery: {
        baseline: [completedEpisode({ conditionProfileId: 'all-normal', quality: 7_000 })],
        candidate: [recoveredRiskEpisode('all-normal', 7_000)],
      },
      riskBudget: null,
    })
    expect(withoutBudget.developmentDecision.developmentExpansionEligible).toBe(false)
    expect(withoutBudget.developmentDecision.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'explicit-risk-budget-missing', slice: 'plausible' }),
      expect.objectContaining({ kind: 'explicit-risk-budget-missing', slice: 'catastrophe-recovery' }),
    ]))

    const incompleteBudget = { ...budget } as Partial<CommandBrewRiskBudget>
    delete incompleteBudget.maximumPlausibleP10QualityRegression
    expect(() => buildCommandBrewRiskAwareDevelopmentReport({
      coverage: coverageManifest({ completeCoverage: false }),
      plausible: { baseline: [baseline], candidate: [candidate] },
      catastropheRecovery: {
        baseline: [completedEpisode({ conditionProfileId: 'all-normal', quality: 7_000 })],
        candidate: [recoveredRiskEpisode('all-normal', 7_000)],
      },
      riskBudget: incompleteBudget as CommandBrewRiskBudget,
    })).toThrow('maximumPlausibleP10QualityRegression must be a non-negative safe integer')

    const unrecovered = buildCommandBrewRiskAwareDevelopmentReport({
      coverage: coverageManifest({ completeCoverage: false }),
      plausible: { baseline: [baseline], candidate: [candidate] },
      catastropheRecovery: {
        baseline: [completedEpisode({ conditionProfileId: 'all-normal', quality: 7_000 })],
        candidate: [stoppedEpisode({ conditionProfileId: 'all-normal', stopReason: 'policy-null' })],
      },
      riskBudget: budget,
    })
    expect(unrecovered.developmentDecision.developmentExpansionEligible).toBe(false)
    expect(unrecovered.developmentDecision.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'catastrophe-completion-regression' }),
      expect.objectContaining({ kind: 'hard-stop-regression', slice: 'catastrophe-recovery' }),
    ]))
  })

  it('fails closed for partial, empty catastrophe, or relabelled frozen coverage', () => {
    const baseline = completedEpisode({ conditionProfileId: plausibleProfileIds[0]!, quality: 7_000 })
    const candidate = recoveredRiskEpisode(plausibleProfileIds[0]!, 10_500)
    const partial = buildCommandBrewRiskAwareDevelopmentReport({
      coverage: coverageManifest({ completeCoverage: false }),
      plausible: { baseline: [baseline], candidate: [candidate] },
      catastropheRecovery: { baseline: [], candidate: [] },
      riskBudget: budget,
    })
    expect(partial.coverage.validatedCompleteCoverage).toBe(false)
    expect(partial.developmentDecision.developmentExpansionEligible).toBe(false)
    expect(partial.developmentDecision.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'coverage-not-declared-complete' }),
      expect.objectContaining({
        kind: 'incomplete-or-unexpected-episode-coverage',
        slice: 'catastrophe-recovery',
      }),
    ]))

    const relabelledFrozen = buildCommandBrewRiskAwareDevelopmentReport({
      coverage: coverageManifest({
        corpusId: COMMAND_BREW_FROZEN_VALIDATION_CORPUS.id,
        corpusRole: 'development',
        completeCoverage: false,
      }),
      plausible: { baseline: [baseline], candidate: [candidate] },
      catastropheRecovery: { baseline: [], candidate: [] },
      riskBudget: budget,
    })
    expect(relabelledFrozen.developmentDecision.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'untrusted-or-non-development-corpus' }),
    ]))
  })

  it('requires explicit fishing intent and reads the post-Observe next condition', () => {
    const declared = recoveredRiskEpisode('balanced', 10_500)
    const ordinaryObserve = { ...declared, conditionFishingEvents: [] }

    expect(summarizeCommandBrewRiskEpisodes([ordinaryObserve]).conditionFishing).toMatchObject({
      attempts: 0,
      favorableOutcomes: 0,
      misses: 0,
    })
    expect(summarizeCommandBrewRiskEpisodes([declared]).conditionFishing).toMatchObject({
      attempts: 1,
      favorableOutcomes: 0,
      misses: 1,
      outcomesByCondition: { normal: 1 },
    })
  })

  it('rejects plausible lower-tail and raw downside hidden inside the same threshold band', () => {
    const plausibleBaseline = episodeMatrix(plausibleProfileIds, developmentSeeds, (identity) => (
      completedEpisode({ ...identity, quality: identity.seedIndex === 0 ? 7_199 : 11_999 })
    ))
    const plausibleCandidate = episodeMatrix(plausibleProfileIds, developmentSeeds, (identity) => (
      completedEpisode({ ...identity, quality: 10_200 })
    ))
    const catastropheBaseline = episodeMatrix(catastropheProfileIds, catastropheSeeds, (identity) => (
      completedEpisode({ ...identity, quality: 6_000 })
    ))
    const catastropheCandidate = episodeMatrix(catastropheProfileIds, catastropheSeeds, (identity) => (
      completedEpisode({ ...identity, quality: 1 })
    ))
    const report = buildCommandBrewRiskAwareDevelopmentReport({
      coverage: coverageManifest(),
      plausible: { baseline: plausibleBaseline, candidate: plausibleCandidate },
      catastropheRecovery: { baseline: catastropheBaseline, candidate: catastropheCandidate },
      riskBudget: budget,
    })

    expect(report.plausible.paired.quality10200).toMatchObject({ wins: 9, losses: 0 })
    expect(report.catastropheRecovery.paired.rawCompletedQuality.losses).toBe(192)
    expect(report.developmentDecision.developmentExpansionEligible).toBe(false)
    expect(report.developmentDecision.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'plausible-p10-quality-regression-budget-exceeded' }),
      expect.objectContaining({ kind: 'plausible-average-quality-regression-budget-exceeded' }),
      expect.objectContaining({ kind: 'plausible-worst-episode-quality-regression-budget-exceeded' }),
    ]))
    expect(report.developmentDecision.reasons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: expect.stringContaining('catastrophe-quality') }),
    ]))
  })

  it('rejects disconnected traces and inconsistent terminal metadata', () => {
    const valid = recoveredRiskEpisode('balanced', 10_500)
    const disconnected = structuredClone(valid)
    disconnected.result.steps[1]!.before = state({ step: 99 })
    expect(() => summarizeCommandBrewRiskEpisodes([disconnected])).toThrow('step state continuity mismatch')

    const terminalMismatch = structuredClone(valid)
    terminalMismatch.result.stopReason = 'policy-null'
    expect(() => summarizeCommandBrewRiskEpisodes([terminalMismatch])).toThrow('terminal/stopReason mismatch')
  })

  it('fails closed when an external candidate does not preserve the paired episode keys', () => {
    const baseline = completedEpisode({ conditionProfileId: 'balanced', quality: 7_000, seed: 1 })
    const candidate = completedEpisode({ conditionProfileId: 'balanced', quality: 10_500, seed: 2 })

    expect(() => compareCommandBrewRiskEpisodes([baseline], [candidate])).toThrow('missing paired baseline')
  })
})
