import {
  ACTIONS,
  applyObservedOutcome,
  assertCraftState,
  legalActions,
  previewAction,
  type ActionPreview,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  type EpisodeResult,
  type EpisodeStopReason,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  cloneGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyController,
  findGuaranteedProgressFinisherWithRecovery,
  findQualityBurstCertificate,
  isPolicyActionSafe,
  type GuideIntegratedDecisionMemory,
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
} from '@frozen-rabbit-expert/solver'
import { runGuideContinuationEpisode } from './guideContinuationPlanner'
import { scoreEpisodes } from './objective'
import { assertPlannerContext, type PlannerContext } from './routeOptionController'
import type { RouteScore } from './types'

export const CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION =
  'objective-aware-certificate-shielded-causal-root-mpc-v0.1.0'

export const MAX_CAUSAL_ROOT_MPC_CANDIDATES = 8

export type CausalRootCandidateOrigin =
  | 'guide-baseline'
  | 'progress-certificate'
  | 'objective-quality-progress-certificate'
  | 'deterministic-progress-pareto'
  | 'risky-progress-pareto'
  | 'deterministic-quality-pareto'
  | 'risky-quality-pareto'
  | 'condition-local'
  | 'specialist-local'
  | 'no-step-local'

export type CausalRootShieldStatus =
  | 'baseline'
  | 'eligible'
  | 'rejected-paired-guide-completion-loss'
  | 'rejected-robust-completion-loss'

export type CausalRootMpcSelectionReason =
  | 'candidate-objective-improvement'
  | 'baseline-no-completion-evidence'
  | 'baseline-no-shielded-improvement'
  | 'baseline-paired-guide-completion-shield'
  | 'baseline-robust-completion-shield'
  | 'baseline-budget-exhausted'
  | 'baseline-invalid-input'
  | 'baseline-evaluation-exception'
  | 'baseline-unavailable'

export interface CausalRootCandidate {
  action: CraftActionId
  origins: readonly CausalRootCandidateOrigin[]
  /** Existing certificates prove only one observed-current/then-Normal route. */
  certificateAssumption: 'none' | 'observed-current-then-normal-route-only'
  /** No current certificate API proves the guide continuation over every condition branch. */
  allConditionContinuationCertificate: 'unknown'
}

export interface CausalRootPairedOutcome {
  profileId: string
  sample: number
  pairedSeed: number
  terminal: CraftState['terminal']
  completed: boolean
  targetReached: boolean
  qualityTierRank: number
  quality: number
  progress: number
  cp: number
  durability: number
  actionCount: number
  finalStep: number
  finalCondition: CraftState['condition']
  stopReason: EpisodeStopReason
}

export interface CausalRootObjectiveScore {
  robustTargetRate: number
  averageTargetRate: number
  robustTierRank: number
  averageTierRank: number
  lowerTailCompletedQualityRatio: number
  averageCompletedQualityRatio: number
  completedCount: number
}

export interface CausalRootCandidateEvaluation {
  candidate: CausalRootCandidate
  routeScore: RouteScore
  objectiveScore: CausalRootObjectiveScore
  pairedOutcomes: readonly CausalRootPairedOutcome[]
  shieldStatus: CausalRootShieldStatus
}

export interface CertificateShieldedCausalRootMpcOptions {
  /** Recipe-owned guide config is mandatory; this planner never supplies a scenario default. */
  guideConfig: Readonly<GuideIntegratedPolicyConfig>
  /** The exact guide release being shielded is part of the research evidence identity. */
  baselinePolicyVersion: GuideIntegratedPolicyVersion
  startingDecisionMemory: Readonly<GuideIntegratedDecisionMemory>
  profiles: readonly WeightedConditionProfile[]
  samplesPerProfile: number
  maxEpisodeSteps: number
  seed: number
  /** Hard, deterministic Stage-1 budget. Partial candidate evidence is never used. */
  maxStage1Episodes: number
  maxCandidates?: number
}

export interface CertificateShieldedCausalRootMpcPlan {
  version: typeof CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION
  baselinePolicyVersion: GuideIntegratedPolicyVersion
  action: CraftActionId | null
  baselineAction: CraftActionId | null
  usedBaseline: boolean
  selectionReason: CausalRootMpcSelectionReason
  candidates: readonly CausalRootCandidate[]
  evaluations: readonly CausalRootCandidateEvaluation[]
  pairedSeeds: readonly { profileId: string; sample: number; pairedSeed: number }[]
  episodeCount: number
  error: string | null
}

interface PreviewCandidate {
  action: CraftActionId
  preview: ActionPreview
}

interface CandidateAccumulator {
  action: CraftActionId
  origins: Set<CausalRootCandidateOrigin>
  hasRouteCertificate: boolean
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const record = value as Readonly<Record<string, unknown>>
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableSerialize(record[key])}`
  )).join(',')}}`
}

function hashText(value: string): number {
  let hash = 0x811c_9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return hash >>> 0
}

function mix32(value: number): number {
  let mixed = value >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x7feb_352d)
  mixed ^= mixed >>> 15
  mixed = Math.imul(mixed, 0x846c_a68b)
  mixed ^= mixed >>> 16
  return mixed >>> 0
}

/** Stable by profile identity and sample, independent of profile/candidate order. */
export function causalRootMpcPairedSeed(
  baseSeed: number,
  evidenceIdentity: string,
  profileId: string,
  sample: number,
): number {
  return mix32(
    (baseSeed >>> 0)
    ^ hashText(evidenceIdentity)
    ^ hashText(profileId)
    ^ Math.imul(sample + 1, 0x9e37_79b1),
  )
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
}

function resolvedCandidateLimit(value: number | undefined): number {
  const resolved = value ?? MAX_CAUSAL_ROOT_MPC_CANDIDATES
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_CAUSAL_ROOT_MPC_CANDIDATES) {
    throw new RangeError(
      `maxCandidates must be an integer between 1 and ${MAX_CAUSAL_ROOT_MPC_CANDIDATES}`,
    )
  }
  return resolved
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fallbackPlan(
  options: Readonly<CertificateShieldedCausalRootMpcOptions>,
  baselineAction: CraftActionId | null,
  selectionReason: CausalRootMpcSelectionReason,
  candidates: readonly CausalRootCandidate[] = [],
  error: unknown = null,
): CertificateShieldedCausalRootMpcPlan {
  return {
    version: CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION,
    baselinePolicyVersion: options.baselinePolicyVersion,
    action: baselineAction,
    baselineAction,
    usedBaseline: true,
    selectionReason,
    candidates,
    evaluations: [],
    pairedSeeds: [],
    episodeCount: 0,
    error: error === null ? null : errorMessage(error),
  }
}

function addCandidate(
  candidates: Map<CraftActionId, CandidateAccumulator>,
  action: CraftActionId | undefined,
  origin: CausalRootCandidateOrigin,
  certificate = false,
): void {
  if (action === undefined) return
  const existing = candidates.get(action)
  if (existing !== undefined) {
    existing.origins.add(origin)
    existing.hasRouteCertificate ||= certificate
    return
  }
  candidates.set(action, {
    action,
    origins: new Set([origin]),
    hasRouteCertificate: certificate,
  })
}

function comparePreviewCandidates(
  left: PreviewCandidate,
  right: PreviewCandidate,
  channel: 'progress' | 'quality',
): number {
  const leftPrimary = channel === 'progress' ? left.preview.progressGain : left.preview.qualityGain
  const rightPrimary = channel === 'progress' ? right.preview.progressGain : right.preview.qualityGain
  const leftSecondary = channel === 'progress' ? left.preview.qualityGain : left.preview.progressGain
  const rightSecondary = channel === 'progress' ? right.preview.qualityGain : right.preview.progressGain
  return rightPrimary * right.preview.successRate - leftPrimary * left.preview.successRate
    || rightSecondary * right.preview.successRate - leftSecondary * left.preview.successRate
    || right.preview.successRate - left.preview.successRate
    || left.preview.cpCost - right.preview.cpCost
    || left.preview.durabilityCost - right.preview.durabilityCost
    || left.action.localeCompare(right.action)
}

function dominates(
  left: PreviewCandidate,
  right: PreviewCandidate,
  channel: 'progress' | 'quality',
): boolean {
  const leftPrimary = channel === 'progress' ? left.preview.progressGain : left.preview.qualityGain
  const rightPrimary = channel === 'progress' ? right.preview.progressGain : right.preview.qualityGain
  const leftSecondary = channel === 'progress' ? left.preview.qualityGain : left.preview.progressGain
  const rightSecondary = channel === 'progress' ? right.preview.qualityGain : right.preview.progressGain
  const noWorse = leftPrimary >= rightPrimary
    && leftSecondary >= rightSecondary
    && left.preview.successRate >= right.preview.successRate
    && left.preview.cpCost <= right.preview.cpCost
    && left.preview.durabilityCost <= right.preview.durabilityCost
  const strictlyBetter = leftPrimary > rightPrimary
    || leftSecondary > rightSecondary
    || left.preview.successRate > right.preview.successRate
    || left.preview.cpCost < right.preview.cpCost
    || left.preview.durabilityCost < right.preview.durabilityCost
  return noWorse && strictlyBetter
}

function paretoFront(
  previews: readonly PreviewCandidate[],
  channel: 'progress' | 'quality',
  deterministic: boolean,
): PreviewCandidate[] {
  const filtered = previews.filter(({ preview }) => {
    const gain = channel === 'progress' ? preview.progressGain : preview.qualityGain
    return gain > 0 && (deterministic ? preview.successRate === 1 : preview.successRate < 1)
  })
  return filtered
    .filter((candidate) => !filtered.some((other) => (
      other.action !== candidate.action && dominates(other, candidate, channel)
    )))
    .sort((left, right) => comparePreviewCandidates(left, right, channel))
}

function candidateAdvancesState(
  context: Readonly<PlannerContext>,
  state: CraftState,
  candidate: PreviewCandidate,
): boolean {
  if (candidate.preview.action.noStep !== true) return true
  const next = applyObservedOutcome(
    context.recipe,
    context.crafter,
    state,
    candidate.action,
    { success: true, nextCondition: state.condition },
  ).nextState
  return stableSerialize(next) !== stableSerialize(state)
}

function localCandidates(
  context: Readonly<PlannerContext>,
  state: CraftState,
  previews: readonly PreviewCandidate[],
): Array<{ origin: CausalRootCandidateOrigin; candidates: PreviewCandidate[] }> {
  const sorted = (values: PreviewCandidate[]): PreviewCandidate[] => values.sort((left, right) => (
    right.preview.progressGain + right.preview.qualityGain
      - left.preview.progressGain - left.preview.qualityGain
    || right.preview.successRate - left.preview.successRate
    || left.preview.cpCost - right.preview.cpCost
    || left.preview.durabilityCost - right.preview.durabilityCost
    || left.action.localeCompare(right.action)
  ))
  const conditionLocal = sorted(previews.filter(({ preview }) => (
    preview.action.requiresCondition?.includes(state.condition) === true
    || (state.condition === 'goodOmen' && preview.action.category === 'buff')
    || (state.condition === 'primed' && preview.action.category === 'buff')
  )))
  const specialistLocal = sorted(previews.filter(({ preview }) => preview.action.specialistOnly === true))
  const noStepLocal = sorted(previews.filter((candidate) => (
    candidate.preview.action.noStep === true && candidateAdvancesState(context, state, candidate)
  )))
  return [
    { origin: 'condition-local', candidates: conditionLocal },
    { origin: 'specialist-local', candidates: specialistLocal },
    { origin: 'no-step-local', candidates: noStepLocal },
  ]
}

function materializeCandidate(accumulator: CandidateAccumulator): CausalRootCandidate {
  return {
    action: accumulator.action,
    origins: [...accumulator.origins],
    certificateAssumption: accumulator.hasRouteCertificate
      ? 'observed-current-then-normal-route-only'
      : 'none',
    allConditionContinuationCertificate: 'unknown',
  }
}

function buildCandidates(
  context: Readonly<PlannerContext>,
  state: CraftState,
  baselineAction: CraftActionId,
  config: Readonly<GuideIntegratedPolicyConfig>,
  limit: number,
): CausalRootCandidate[] {
  const safePreviews = legalActions(context.recipe, context.crafter, state)
    .map((action) => ({ action, preview: previewAction(context.recipe, context.crafter, state, action) }))
    .filter((candidate) => isPolicyActionSafe(
      context.recipe,
      context.crafter,
      state,
      candidate.action,
      candidate.preview,
    ))
  if (!safePreviews.some(({ action }) => action === baselineAction)) {
    throw new Error(`guide baseline action ${baselineAction} is not legal and safe`)
  }

  const candidates = new Map<CraftActionId, CandidateAccumulator>()
  addCandidate(candidates, baselineAction, 'guide-baseline')

  const progressCertificate = findGuaranteedProgressFinisherWithRecovery(
    context.recipe,
    context.crafter,
    state,
    {
      maxActions: 8,
      maxNodeExpansions: config.finisherSearchNodeLimit,
    },
  )
  addCandidate(
    candidates,
    progressCertificate?.actions[0],
    'progress-certificate',
    true,
  )

  const qualityCertificate = findQualityBurstCertificate(
    context.recipe,
    context.crafter,
    state,
    {
      qualityTarget: context.objective.qualityTarget,
      maxQualityActions: 8,
      maxProgressActions: 8,
      maxNodeExpansions: config.finisherSearchNodeLimit,
    },
  )
  addCandidate(
    candidates,
    qualityCertificate?.actions[0],
    'objective-quality-progress-certificate',
    true,
  )

  const buckets: Array<{ origin: CausalRootCandidateOrigin; candidates: PreviewCandidate[] }> = [
    ...localCandidates(context, state, safePreviews),
    {
      origin: 'deterministic-progress-pareto',
      candidates: paretoFront(safePreviews, 'progress', true),
    },
    {
      origin: 'deterministic-quality-pareto',
      candidates: paretoFront(safePreviews, 'quality', true),
    },
    {
      origin: 'risky-progress-pareto',
      candidates: paretoFront(safePreviews, 'progress', false),
    },
    {
      origin: 'risky-quality-pareto',
      candidates: paretoFront(safePreviews, 'quality', false),
    },
  ]
  for (let depth = 0; candidates.size < limit; depth += 1) {
    let found = false
    for (const bucket of buckets) {
      const candidate = bucket.candidates[depth]
      if (candidate === undefined) continue
      found = true
      addCandidate(candidates, candidate.action, bucket.origin)
      if (candidates.size >= limit) break
    }
    if (!found) break
  }

  return [...candidates.values()].slice(0, limit).map(materializeCandidate)
}

function tierRank(quality: number, context: Readonly<PlannerContext>): number {
  return [...context.objective.qualityTiers]
    .sort((left, right) => left.minimumQuality - right.minimumQuality)
    .filter((tier) => quality >= tier.minimumQuality)
    .length
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function lowerTail(values: readonly number[], fraction = 0.1): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function objectiveScore(
  context: Readonly<PlannerContext>,
  outcomes: readonly CausalRootPairedOutcome[],
): CausalRootObjectiveScore {
  const profileIds = [...new Set(outcomes.map(({ profileId }) => profileId))]
  const profileTargetRates = profileIds.map((profileId) => {
    const profile = outcomes.filter((outcome) => outcome.profileId === profileId)
    return profile.filter((outcome) => outcome.targetReached).length / profile.length
  })
  const profileTierRanks = profileIds.map((profileId) => mean(
    outcomes
      .filter((outcome) => outcome.profileId === profileId)
      .map((outcome) => outcome.completed ? outcome.qualityTierRank : 0),
  ))
  const completedRatios = outcomes
    .filter((outcome) => outcome.completed)
    .map((outcome) => Math.min(1, outcome.quality / context.objective.qualityTarget))
  return {
    robustTargetRate: profileTargetRates.length === 0 ? 0 : Math.min(...profileTargetRates),
    averageTargetRate: outcomes.filter((outcome) => outcome.targetReached).length / outcomes.length,
    robustTierRank: profileTierRanks.length === 0 ? 0 : Math.min(...profileTierRanks),
    averageTierRank: mean(outcomes.map((outcome) => outcome.completed ? outcome.qualityTierRank : 0)),
    lowerTailCompletedQualityRatio: lowerTail(completedRatios),
    averageCompletedQualityRatio: mean(completedRatios),
    completedCount: outcomes.filter((outcome) => outcome.completed).length,
  }
}

function evaluateCandidate(
  context: Readonly<PlannerContext>,
  state: CraftState,
  candidate: CausalRootCandidate,
  options: Readonly<CertificateShieldedCausalRootMpcOptions>,
  profiles: readonly WeightedConditionProfile[],
  evidenceIdentity: string,
): Omit<CausalRootCandidateEvaluation, 'shieldStatus'> {
  const episodesByProfile = new Map<string, EpisodeResult[]>()
  const pairedOutcomes: CausalRootPairedOutcome[] = []
  for (const profile of profiles) {
    const episodes: EpisodeResult[] = []
    for (let sample = 0; sample < options.samplesPerProfile; sample += 1) {
      const pairedSeed = causalRootMpcPairedSeed(
        options.seed,
        evidenceIdentity,
        profile.id,
        sample,
      )
      const episode = runGuideContinuationEpisode({
        recipe: context.recipe,
        objective: context.objective,
        crafter: context.crafter,
        initialState: state,
        firstAction: candidate.action,
        startingDecisionMemory: options.startingDecisionMemory,
        config: options.guideConfig,
        random: createEpisodeRandomStream(pairedSeed),
        conditionProfile: profile,
        maxEpisodeSteps: options.maxEpisodeSteps,
      })
      episodes.push(episode)
      const completed = episode.terminal === 'completed'
      pairedOutcomes.push({
        profileId: profile.id,
        sample,
        pairedSeed,
        terminal: episode.terminal,
        completed,
        targetReached: completed && episode.finalState.quality >= context.objective.qualityTarget,
        qualityTierRank: completed ? tierRank(episode.finalState.quality, context) : 0,
        quality: episode.finalState.quality,
        progress: episode.finalState.progress,
        cp: episode.finalState.cp,
        durability: episode.finalState.durability,
        actionCount: episode.actions.length,
        finalStep: episode.finalState.step,
        finalCondition: episode.finalState.condition,
        stopReason: episode.stopReason,
      })
    }
    episodesByProfile.set(profile.id, episodes)
  }
  return {
    candidate,
    routeScore: scoreEpisodes(context.recipe, episodesByProfile, context.objective),
    objectiveScore: objectiveScore(context, pairedOutcomes),
    pairedOutcomes,
  }
}

function completionVector(evaluation: CausalRootCandidateEvaluation): string {
  return evaluation.pairedOutcomes.map((outcome) => Number(outcome.completed)).join('')
}

function hasPairedGuideOnlyCompletion(
  baseline: CausalRootCandidateEvaluation,
  candidate: CausalRootCandidateEvaluation,
): boolean {
  const candidateByPair = new Map(candidate.pairedOutcomes.map((outcome) => [
    `${outcome.profileId}\u0000${outcome.sample}`,
    outcome,
  ]))
  return baseline.pairedOutcomes.some((baselineOutcome) => (
    baselineOutcome.completed
    && candidateByPair.get(`${baselineOutcome.profileId}\u0000${baselineOutcome.sample}`)?.completed !== true
  ))
}

function withShieldStatus(
  baseline: CausalRootCandidateEvaluation,
  evaluation: Omit<CausalRootCandidateEvaluation, 'shieldStatus'>,
): CausalRootCandidateEvaluation {
  const current = evaluation as CausalRootCandidateEvaluation
  if (evaluation.candidate.origins.includes('guide-baseline')) {
    return { ...evaluation, shieldStatus: 'baseline' }
  }
  if (hasPairedGuideOnlyCompletion(baseline, current)) {
    return { ...evaluation, shieldStatus: 'rejected-paired-guide-completion-loss' }
  }
  if (evaluation.routeScore.robustCompletionRate + 1e-12 < baseline.routeScore.robustCompletionRate) {
    return { ...evaluation, shieldStatus: 'rejected-robust-completion-loss' }
  }
  return { ...evaluation, shieldStatus: 'eligible' }
}

function compareNumbers(left: number, right: number): number {
  const difference = left - right
  return Math.abs(difference) <= 1e-12 ? 0 : difference
}

function compareMaximizeQuality(
  left: CausalRootCandidateEvaluation,
  right: CausalRootCandidateEvaluation,
): number {
  const leftScore = left.objectiveScore
  const rightScore = right.objectiveScore
  const comparisons = [
    compareNumbers(leftScore.robustTargetRate, rightScore.robustTargetRate),
    compareNumbers(leftScore.averageTargetRate, rightScore.averageTargetRate),
    compareNumbers(leftScore.robustTierRank, rightScore.robustTierRank),
    compareNumbers(leftScore.averageTierRank, rightScore.averageTierRank),
    compareNumbers(
      leftScore.lowerTailCompletedQualityRatio,
      rightScore.lowerTailCompletedQualityRatio,
    ),
    compareNumbers(leftScore.averageCompletedQualityRatio, rightScore.averageCompletedQualityRatio),
  ]
  if (
    left.routeScore.averageSuccessfulSteps !== null
    && right.routeScore.averageSuccessfulSteps !== null
  ) {
    comparisons.push(compareNumbers(
      right.routeScore.averageSuccessfulSteps,
      left.routeScore.averageSuccessfulSteps,
    ))
  }
  return comparisons.find((comparison) => comparison !== 0) ?? 0
}

function compareRequiredQuality(
  left: CausalRootCandidateEvaluation,
  right: CausalRootCandidateEvaluation,
): number {
  const completionComparisons = [
    compareNumbers(left.objectiveScore.completedCount, right.objectiveScore.completedCount),
    compareNumbers(left.routeScore.robustCompletionRate, right.routeScore.robustCompletionRate),
    compareNumbers(left.routeScore.averageCompletionRate, right.routeScore.averageCompletionRate),
  ]
  const completionDifference = completionComparisons.find((comparison) => comparison !== 0) ?? 0
  if (completionDifference !== 0) return completionDifference
  if (completionVector(left) !== completionVector(right)) return 0
  if (
    left.routeScore.averageSuccessfulSteps === null
    || right.routeScore.averageSuccessfulSteps === null
  ) return 0
  return compareNumbers(
    right.routeScore.averageSuccessfulSteps,
    left.routeScore.averageSuccessfulSteps,
  )
}

function selectCandidate(
  context: Readonly<PlannerContext>,
  baseline: CausalRootCandidateEvaluation,
  evaluations: readonly CausalRootCandidateEvaluation[],
): { selected: CausalRootCandidateEvaluation; reason: CausalRootMpcSelectionReason } {
  if (!evaluations.some((evaluation) => evaluation.objectiveScore.completedCount > 0)) {
    return { selected: baseline, reason: 'baseline-no-completion-evidence' }
  }

  const eligible = evaluations.filter((evaluation) => evaluation.shieldStatus === 'eligible')
  const compare = context.objective.mode === 'maximize-quality-with-safe-completion'
    ? compareMaximizeQuality
    : compareRequiredQuality
  const improving = eligible.filter((evaluation) => compare(evaluation, baseline) > 0)
  if (improving.length > 0) {
    const candidateOrder = new Map(evaluations.map((evaluation, index) => [
      evaluation.candidate.action,
      index,
    ]))
    const selected = [...improving].sort((left, right) => (
      compare(right, left)
      || (candidateOrder.get(left.candidate.action) ?? Number.MAX_SAFE_INTEGER)
        - (candidateOrder.get(right.candidate.action) ?? Number.MAX_SAFE_INTEGER)
      || left.candidate.action.localeCompare(right.candidate.action)
    ))[0]!
    return { selected, reason: 'candidate-objective-improvement' }
  }

  if (evaluations.some((evaluation) => (
    evaluation.shieldStatus === 'rejected-paired-guide-completion-loss'
  ))) {
    return { selected: baseline, reason: 'baseline-paired-guide-completion-shield' }
  }
  if (evaluations.some((evaluation) => (
    evaluation.shieldStatus === 'rejected-robust-completion-loss'
  ))) {
    return { selected: baseline, reason: 'baseline-robust-completion-shield' }
  }
  return { selected: baseline, reason: 'baseline-no-shielded-improvement' }
}

function baselineActionFor(
  context: Readonly<PlannerContext>,
  state: CraftState,
  options: Readonly<CertificateShieldedCausalRootMpcOptions>,
): CraftActionId | null {
  const controller = createGuideIntegratedPolicyController(
    options.guideConfig,
    cloneGuideIntegratedDecisionMemory(options.startingDecisionMemory),
    context.objective,
  )
  return controller.policy(context.recipe, context.crafter, state)
}

/**
 * Research-only, one-root causal MPC. The scenario-owned guide remains both
 * the baseline root and every candidate's continuation. Candidate evidence is
 * paired by profile/sample; no partial or unshielded result can escape.
 */
export function planWithCertificateShieldedCausalRootMpc(
  context: Readonly<PlannerContext>,
  state: CraftState,
  options: Readonly<CertificateShieldedCausalRootMpcOptions>,
): CertificateShieldedCausalRootMpcPlan | null {
  if (state.terminal !== 'none') return null

  let baselineAction: CraftActionId | null = null
  try {
    assertPlannerContext(context)
    assertCraftState(context.recipe, context.crafter, state)
    if (options.guideConfig === undefined || options.startingDecisionMemory === undefined) {
      throw new Error('guideConfig and startingDecisionMemory must be explicit')
    }
    if (String(options.baselinePolicyVersion).trim().length === 0) {
      throw new Error('baselinePolicyVersion must not be empty')
    }
    baselineAction = baselineActionFor(context, state, options)
  } catch (error) {
    return fallbackPlan(options, null, 'baseline-unavailable', [], error)
  }
  if (baselineAction === null) {
    return fallbackPlan(options, null, 'baseline-unavailable', [], 'guide baseline returned null')
  }

  let candidateLimit: number
  let profiles: WeightedConditionProfile[]
  try {
    positiveInteger(options.samplesPerProfile, 'samplesPerProfile')
    positiveInteger(options.maxEpisodeSteps, 'maxEpisodeSteps')
    positiveInteger(options.maxStage1Episodes, 'maxStage1Episodes')
    candidateLimit = resolvedCandidateLimit(options.maxCandidates)
    if (options.profiles.length === 0) throw new Error('profiles must not be empty')
    const seenProfileIds = new Set<string>()
    for (const profile of options.profiles) {
      if (profile.id.trim().length === 0) throw new Error('profile id must not be empty')
      if (seenProfileIds.has(profile.id)) throw new Error(`duplicate profile id: ${profile.id}`)
      seenProfileIds.add(profile.id)
    }
    profiles = [...options.profiles].sort((left, right) => left.id.localeCompare(right.id))
  } catch (error) {
    return fallbackPlan(options, baselineAction, 'baseline-invalid-input', [], error)
  }

  let candidates: CausalRootCandidate[]
  try {
    candidates = buildCandidates(context, state, baselineAction, options.guideConfig, candidateLimit)
  } catch (error) {
    return fallbackPlan(options, baselineAction, 'baseline-evaluation-exception', [], error)
  }
  const projectedEpisodes = candidates.length * profiles.length * options.samplesPerProfile
  if (projectedEpisodes > options.maxStage1Episodes) {
    return fallbackPlan(
      options,
      baselineAction,
      'baseline-budget-exhausted',
      candidates,
      `Stage-1 needs ${projectedEpisodes} episodes but budget is ${options.maxStage1Episodes}`,
    )
  }

  const evidenceIdentity = stableSerialize({
    version: CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION,
    baselinePolicyVersion: options.baselinePolicyVersion,
    recipeProfileId: context.recipe.profileId,
    objective: context.objective,
    crafter: context.crafter,
    state,
    startingDecisionMemory: options.startingDecisionMemory,
    guideConfig: options.guideConfig,
  })
  try {
    const rawEvaluations = candidates.map((candidate) => evaluateCandidate(
      context,
      state,
      candidate,
      options,
      profiles,
      evidenceIdentity,
    ))
    const baselineRaw = rawEvaluations.find((evaluation) => (
      evaluation.candidate.action === baselineAction
      && evaluation.candidate.origins.includes('guide-baseline')
    ))
    if (baselineRaw === undefined) throw new Error('baseline candidate was not evaluated')
    const baseline: CausalRootCandidateEvaluation = {
      ...baselineRaw,
      shieldStatus: 'baseline',
    }
    const evaluations = rawEvaluations.map((evaluation) => (
      evaluation === baselineRaw ? baseline : withShieldStatus(baseline, evaluation)
    ))
    const selection = selectCandidate(context, baseline, evaluations)
    return {
      version: CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION,
      baselinePolicyVersion: options.baselinePolicyVersion,
      action: selection.selected.candidate.action,
      baselineAction,
      usedBaseline: selection.selected.candidate.action === baselineAction,
      selectionReason: selection.reason,
      candidates,
      evaluations,
      pairedSeeds: baseline.pairedOutcomes.map(({ profileId, sample, pairedSeed }) => ({
        profileId,
        sample,
        pairedSeed,
      })),
      episodeCount: projectedEpisodes,
      error: null,
    }
  } catch (error) {
    return fallbackPlan(
      options,
      baselineAction,
      'baseline-evaluation-exception',
      candidates,
      error,
    )
  }
}
