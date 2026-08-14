import {
  assertCraftObjective,
  assertCraftState,
  legalActions,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  assertConditionProfileCompatible,
  createEpisodeRandomStream,
  runEpisode,
  type EpisodePolicy,
  type EpisodeResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import { compareRouteScores, scoreEpisodes } from './objective'
import {
  crafterSplitRoleByGroupId,
  validateCrafterGroupedSplit,
  validateCrafterPopulationManifest,
  type CrafterGroupedSplitManifestV1,
  type CrafterPopulationManifestV1,
  type CrafterPopulationProfileV1,
  type CrafterSplitRole,
  type NormalizedCrafterProfile,
} from './crafterPopulation'
import type { RouteScore } from './types'

export interface HeldOutEvaluationOptions {
  profiles: readonly WeightedConditionProfile[]
  seeds: readonly number[]
  maxEpisodeSteps: number
  objective: Readonly<CraftObjective>
}

export interface HeldOutPolicyResult {
  score: RouteScore
  episodeCount: number
  safetyViolations: number
}

export interface PromotionDecision {
  promote: boolean
  reasons: string[]
  basis: 'completion-gain' | 'near-perfect-efficiency' | null
}

export interface PromotionCriteria {
  minimumRobustCompletionGain?: number
  nearPerfectCompletionFloor?: number
  minimumAverageSuccessfulStepReduction?: number
}

export type EpisodePolicyFactory = () => EpisodePolicy

export const HELD_OUT_CRAFTER_COVERAGE = [
  'held-out-interpolation',
  'held-out-boundary',
  'out-of-distribution',
] as const

export type HeldOutCrafterCoverage = (typeof HELD_OUT_CRAFTER_COVERAGE)[number]

export const HELD_OUT_CRAFTER_SPLIT_ROLES = [
  'heldOutInterpolation',
  'heldOutBoundary',
  'oodProbe',
] as const satisfies readonly CrafterSplitRole[]

export type HeldOutCrafterSplitRole = (typeof HELD_OUT_CRAFTER_SPLIT_ROLES)[number]

export interface HeldOutCrafterEvaluationCase {
  profileId: string
  initialStateCorpusId: string
  initialStates: readonly CraftState[]
}

export interface ResolvedHeldOutCrafterEvaluationCase extends HeldOutCrafterEvaluationCase {
  caseKey: string
  groupId: string
  crafter: Readonly<NormalizedCrafterProfile>
  splitRole: HeldOutCrafterSplitRole
  coverage: HeldOutCrafterCoverage
  seedCorpusId: string
}

export interface DecisionLatencySummary {
  decisionCount: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
}

export interface PolicyFactoryColdStartLatencySummary {
  factoryInvocationCount: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
}

export interface HeldOutCrafterPolicyResult extends HeldOutPolicyResult {
  caseKey: string
  profileId: string
  groupId: string
  initialStateCorpusId: string
  splitRole: HeldOutCrafterSplitRole
  coverage: HeldOutCrafterCoverage
  seedCorpusId: string
  /** Decision-weighted latency of calls into the already-created policy. */
  policyCallbackLatency: DecisionLatencySummary
  /** Episode-weighted cost of constructing a fresh policy instance. */
  policyFactoryColdStartLatency: PolicyFactoryColdStartLatencySummary
}

export interface HeldOutSeedCorpusSelection {
  corpusId: string
  seeds: readonly number[]
}

export interface PopulationHeldOutEvaluationOptions {
  population: Readonly<CrafterPopulationManifestV1>
  split: Readonly<CrafterGroupedSplitManifestV1>
  populationRecipes: readonly Readonly<RecipeProfile>[]
  objective: Readonly<CraftObjective>
  profiles: readonly WeightedConditionProfile[]
  seedCorporaByRole: Readonly<Partial<Record<
    HeldOutCrafterSplitRole,
    Readonly<HeldOutSeedCorpusSelection>
  >>>
  maxEpisodeSteps: number
  now?: () => number
}

export interface WorstProfilePolicyCallbackP95 {
  profileId: string
  p95Ms: number
}

export interface PopulationHeldOutPolicyResult extends HeldOutPolicyResult {
  objectiveId: string
  perCrafter: readonly HeldOutCrafterPolicyResult[]
  coverageScores: Readonly<Partial<Record<HeldOutCrafterCoverage, RouteScore>>>
  worstProfileId: string
  worstProfileCompletionRate: number
  worstDecileCompletionRate: number
  /** Decision-weighted across every evaluated crafter and episode. */
  policyCallbackLatency: DecisionLatencySummary
  /** Episode-weighted across every evaluated crafter and episode. */
  policyFactoryColdStartLatency: PolicyFactoryColdStartLatencySummary
  worstProfilePolicyCallbackP95: WorstProfilePolicyCallbackP95
}

export type PopulationEpisodePolicyFactory = (
  crafterCase: Readonly<ResolvedHeldOutCrafterEvaluationCase>,
) => EpisodePolicy

function quantile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)] ?? 0
}

function summarizeLatencies(values: readonly number[]): DecisionLatencySummary {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    decisionCount: sorted.length,
    p50Ms: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    p99Ms: quantile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  }
}

function summarizeFactoryColdStarts(
  values: readonly number[],
): PolicyFactoryColdStartLatencySummary {
  const summary = summarizeLatencies(values)
  return {
    factoryInvocationCount: summary.decisionCount,
    p50Ms: summary.p50Ms,
    p95Ms: summary.p95Ms,
    p99Ms: summary.p99Ms,
    maxMs: summary.maxMs,
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

function assertUniqueSeeds(seeds: readonly number[], label: string): void {
  if (seeds.length === 0) throw new Error(`${label} seeds must not be empty`)
  const seen = new Set<number>()
  for (const seed of seeds) {
    if (!Number.isSafeInteger(seed)) throw new RangeError(`${label} seed must be a safe integer`)
    if (seen.has(seed)) throw new Error(`duplicate ${label} seed: ${seed}`)
    seen.add(seed)
  }
}

function validateConditionProfiles(
  recipe: Readonly<RecipeProfile>,
  profiles: readonly Readonly<WeightedConditionProfile>[],
): void {
  if (profiles.length === 0) throw new Error('condition profiles must not be empty')
  const profileIds = new Set<string>()
  for (const profile of profiles) {
    assertNonEmpty(profile.id, 'condition profile id')
    if (profileIds.has(profile.id)) throw new Error(`duplicate condition profile id: ${profile.id}`)
    profileIds.add(profile.id)
    assertConditionProfileCompatible(recipe, profile)
  }
}

function coverageForSplitRole(role: CrafterSplitRole): HeldOutCrafterCoverage | null {
  switch (role) {
    case 'heldOutInterpolation': return 'held-out-interpolation'
    case 'heldOutBoundary': return 'held-out-boundary'
    case 'oodProbe': return 'out-of-distribution'
    case 'train':
    case 'validation':
    case 'reservedFinal': return null
  }
}

function groupIdsForHeldOutRole(
  split: Readonly<CrafterGroupedSplitManifestV1>,
  role: HeldOutCrafterSplitRole,
): readonly string[] {
  switch (role) {
    case 'heldOutInterpolation': return split.heldOutInterpolationGroupIds
    case 'heldOutBoundary': return split.heldOutBoundaryGroupIds
    case 'oodProbe': return split.oodProbeGroupIds
  }
}

function selectedSeedCorpus(
  split: Readonly<CrafterGroupedSplitManifestV1>,
  role: HeldOutCrafterSplitRole,
  options: Readonly<PopulationHeldOutEvaluationOptions>,
): Readonly<HeldOutSeedCorpusSelection> {
  const selection = options.seedCorporaByRole[role]
  if (selection === undefined) throw new Error(`held-out evaluation requires ${role} seed corpus`)
  assertNonEmpty(selection.corpusId, `${role} selected seed corpus id`)
  if (!(split.seedCorpusIdsByRole?.[role] ?? []).includes(selection.corpusId)) {
    throw new Error(`${role} seed corpus ${selection.corpusId} is not declared by split ${split.splitId}`)
  }
  assertUniqueSeeds(selection.seeds, `${role} seed corpus ${selection.corpusId}`)
  return selection
}

function resolvedCaseKey(
  population: Readonly<CrafterPopulationManifestV1>,
  split: Readonly<CrafterGroupedSplitManifestV1>,
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
  profile: Readonly<CrafterPopulationProfileV1>,
  role: HeldOutCrafterSplitRole,
  seedCorpusId: string,
  initialStateCorpusId: string,
): string {
  // JSON tuple encoding is unambiguous even if an identity contains a delimiter.
  return JSON.stringify([
    population.populationId,
    split.splitId,
    recipe.profileId,
    objective.objectiveId,
    profile.id,
    profile.groupId,
    role,
    seedCorpusId,
    initialStateCorpusId,
  ])
}

interface EvaluatedEpisodes {
  episodesByProfile: Map<string, EpisodeResult[]>
  safetyViolations: number
  policyCallbackLatencies: number[]
  policyFactoryColdStartLatencies: number[]
}

function evaluateEpisodesForCrafter(
  recipe: RecipeProfile,
  crafterCase: Readonly<ResolvedHeldOutCrafterEvaluationCase>,
  seeds: readonly number[],
  policyFactory: PopulationEpisodePolicyFactory,
  options: Readonly<PopulationHeldOutEvaluationOptions>,
): EvaluatedEpisodes {
  const now = options.now ?? (() => globalThis.performance.now())
  const episodesByProfile = new Map<string, EpisodeResult[]>()
  const policyCallbackLatencies: number[] = []
  const policyFactoryColdStartLatencies: number[] = []
  let safetyViolations = 0
  for (const profile of options.profiles) {
    const episodes: EpisodeResult[] = []
    for (const initialState of crafterCase.initialStates) {
      for (const seed of seeds) {
        const factoryStartedAt = now()
        const policy = policyFactory(crafterCase)
        policyFactoryColdStartLatencies.push(Math.max(0, now() - factoryStartedAt))
        const auditedPolicy: EpisodePolicy = (currentRecipe, currentCrafter, state) => {
          const startedAt = now()
          const action = policy(currentRecipe, currentCrafter, state)
          policyCallbackLatencies.push(Math.max(0, now() - startedAt))
          if (action !== null && (
            !legalActions(currentRecipe, currentCrafter, state).includes(action)
            || !isPolicyActionSafe(currentRecipe, currentCrafter, state, action)
          )) safetyViolations += 1
          return action
        }
        const firstAction = auditedPolicy(recipe, crafterCase.crafter, initialState)
        if (firstAction === null) {
          episodes.push({
            terminal: 'none',
            finalState: initialState,
            actions: [],
            stoppedByLimit: false,
            stopReason: legalActions(recipe, crafterCase.crafter, initialState).length === 0
              ? 'no-legal-action'
              : 'policy-null',
          })
          continue
        }
        episodes.push(runEpisode({
          recipe,
          crafter: crafterCase.crafter,
          initialState,
          firstAction,
          policy: auditedPolicy,
          random: createEpisodeRandomStream(seed),
          conditionProfile: profile,
          maxSteps: options.maxEpisodeSteps,
        }))
      }
    }
    episodesByProfile.set(profile.id, episodes)
  }
  return {
    episodesByProfile,
    safetyViolations,
    policyCallbackLatencies,
    policyFactoryColdStartLatencies,
  }
}

export function evaluatePolicyHeldOut(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialStates: readonly CraftState[],
  policyFactory: EpisodePolicyFactory,
  options: HeldOutEvaluationOptions,
): HeldOutPolicyResult {
  assertCraftObjective(recipe, options.objective)
  validateConditionProfiles(recipe, options.profiles)
  assertUniqueSeeds(options.seeds, 'held-out')
  if (!Number.isSafeInteger(options.maxEpisodeSteps) || options.maxEpisodeSteps < 1) {
    throw new RangeError('maxEpisodeSteps must be a safe integer >= 1')
  }
  if (initialStates.length === 0) throw new Error('held-out initial states must not be empty')
  for (const initialState of initialStates) {
    assertCraftState(recipe, crafter, initialState)
    if (initialState.terminal !== 'none') {
      throw new Error('held-out initial states must be non-terminal')
    }
  }

  const episodesByProfile = new Map<string, EpisodeResult[]>()
  let safetyViolations = 0
  for (const profile of options.profiles) {
    const episodes: EpisodeResult[] = []
    for (const initialState of initialStates) {
      for (const seed of options.seeds) {
        const policy = policyFactory()
        const auditedPolicy: EpisodePolicy = (currentRecipe, currentCrafter, state) => {
          const action = policy(currentRecipe, currentCrafter, state)
          if (action !== null && (
            !legalActions(currentRecipe, currentCrafter, state).includes(action)
            || !isPolicyActionSafe(currentRecipe, currentCrafter, state, action)
          )) safetyViolations += 1
          return action
        }
        const firstAction = auditedPolicy(recipe, crafter, initialState)
        if (firstAction === null) {
          episodes.push({
            terminal: 'none',
            finalState: initialState,
            actions: [],
            stoppedByLimit: false,
            stopReason: legalActions(recipe, crafter, initialState).length === 0
              ? 'no-legal-action'
              : 'policy-null',
          })
          continue
        }
        episodes.push(runEpisode({
          recipe,
          crafter,
          initialState,
          firstAction,
          policy: auditedPolicy,
          random: createEpisodeRandomStream(seed),
          conditionProfile: profile,
          maxSteps: options.maxEpisodeSteps,
        }))
      }
    }
    episodesByProfile.set(profile.id, episodes)
  }
  return {
    score: scoreEpisodes(recipe, episodesByProfile, options.objective),
    episodeCount: [...episodesByProfile.values()].reduce((sum, episodes) => sum + episodes.length, 0),
    safetyViolations,
  }
}

interface EvaluatedCrafterCase {
  crafterCase: Readonly<ResolvedHeldOutCrafterEvaluationCase>
  evaluated: Readonly<EvaluatedEpisodes>
}

function flattenEpisodeSeries(
  evaluatedCases: readonly Readonly<EvaluatedCrafterCase>[],
): Map<string, readonly EpisodeResult[]> {
  const flattened = new Map<string, readonly EpisodeResult[]>()
  let seriesIndex = 0
  for (const { evaluated } of evaluatedCases) {
    for (const episodes of evaluated.episodesByProfile.values()) {
      // Generated keys make nested profile/condition identity collision-proof;
      // scoreEpisodes only consumes the distinct series and their episodes.
      flattened.set(`series-${seriesIndex}`, episodes)
      seriesIndex += 1
    }
  }
  return flattened
}

/**
 * Evaluates complete equipment groups independently. No profile is averaged
 * away before per-crafter and worst-tail metrics are produced.
 */
export function evaluatePolicyPopulationHeldOut(
  recipe: RecipeProfile,
  crafterCases: readonly HeldOutCrafterEvaluationCase[],
  policyFactory: PopulationEpisodePolicyFactory,
  options: PopulationHeldOutEvaluationOptions,
): PopulationHeldOutPolicyResult {
  const currentRecipeInputs = options.populationRecipes.filter((candidate) => (
    candidate.profileId === recipe.profileId
  ))
  if (currentRecipeInputs.length !== 1) {
    throw new Error(`populationRecipes must contain recipe ${recipe.profileId} exactly once`)
  }
  const recipesForValidation = options.populationRecipes.map((candidate) => (
    candidate.profileId === recipe.profileId ? recipe : candidate
  ))
  validateCrafterPopulationManifest(options.population, recipesForValidation)
  validateCrafterGroupedSplit(options.split, options.population)

  assertCraftObjective(recipe, options.objective)
  if (crafterCases.length === 0) throw new Error('held-out crafter cases must not be empty')
  validateConditionProfiles(recipe, options.profiles)
  if (!Number.isSafeInteger(options.maxEpisodeSteps) || options.maxEpisodeSteps < 1) {
    throw new RangeError('maxEpisodeSteps must be a safe integer >= 1')
  }
  const heldOutRoleSet = new Set<string>(HELD_OUT_CRAFTER_SPLIT_ROLES)
  for (const rawRole of Object.keys(options.seedCorporaByRole)) {
    if (!heldOutRoleSet.has(rawRole)) {
      throw new Error(`seed corpus selection is not a held-out role: ${rawRole}`)
    }
    selectedSeedCorpus(options.split, rawRole as HeldOutCrafterSplitRole, options)
  }
  const requiredEvidenceRoles: HeldOutCrafterSplitRole[] = [
    'heldOutInterpolation',
    'heldOutBoundary',
  ]
  if (options.split.oodProbeGroupIds.length > 0) requiredEvidenceRoles.push('oodProbe')
  for (const role of requiredEvidenceRoles) {
    if (groupIdsForHeldOutRole(options.split, role).length === 0) {
      throw new Error(`held-out evaluation requires at least one ${role} group`)
    }
    selectedSeedCorpus(options.split, role, options)
  }

  const populationProfilesById = new Map(options.population.profiles.map((profile) => [
    profile.id,
    profile,
  ]))
  const profileIds = new Set<string>()
  const groupIds = new Set<string>()
  const evaluatedCrafterCases: EvaluatedCrafterCase[] = []
  const aggregatePolicyCallbackLatencies: number[] = []
  const aggregatePolicyFactoryColdStartLatencies: number[] = []
  const perCrafter: HeldOutCrafterPolicyResult[] = []
  let safetyViolations = 0
  for (const requestedCase of crafterCases) {
    assertNonEmpty(requestedCase.profileId, 'held-out crafter profileId')
    assertNonEmpty(
      requestedCase.initialStateCorpusId,
      `initial state corpus id for ${requestedCase.profileId}`,
    )
    const populationProfile = populationProfilesById.get(requestedCase.profileId)
    if (populationProfile === undefined) {
      throw new Error(`unknown held-out crafter profileId: ${requestedCase.profileId}`)
    }
    const rawSplitRole = crafterSplitRoleByGroupId(options.split, populationProfile.groupId)
    if (rawSplitRole === null) {
      throw new Error(`crafter group is missing from validated split: ${populationProfile.groupId}`)
    }
    const coverage = coverageForSplitRole(rawSplitRole)
    if (coverage === null) {
      throw new Error(
        `${rawSplitRole} crafter ${populationProfile.id} cannot be evaluated as held-out evidence`,
      )
    }
    const splitRole = rawSplitRole as HeldOutCrafterSplitRole
    const seedCorpus = selectedSeedCorpus(options.split, splitRole, options)
    if (profileIds.has(populationProfile.id)) {
      throw new Error(`duplicate held-out crafter profileId: ${populationProfile.id}`)
    }
    if (groupIds.has(populationProfile.groupId)) {
      throw new Error(`duplicate held-out crafter groupId: ${populationProfile.groupId}`)
    }
    if (requestedCase.initialStates.length === 0) {
      throw new Error(`held-out crafter ${populationProfile.id} must provide initial states`)
    }
    for (const initialState of requestedCase.initialStates) {
      assertCraftState(recipe, populationProfile.crafter, initialState)
      if (initialState.terminal !== 'none') {
        throw new Error(`held-out crafter ${populationProfile.id} initial states must be non-terminal`)
      }
    }
    profileIds.add(populationProfile.id)
    groupIds.add(populationProfile.groupId)

    const crafterCase: ResolvedHeldOutCrafterEvaluationCase = {
      ...requestedCase,
      caseKey: resolvedCaseKey(
        options.population,
        options.split,
        recipe,
        options.objective,
        populationProfile,
        splitRole,
        seedCorpus.corpusId,
        requestedCase.initialStateCorpusId,
      ),
      groupId: populationProfile.groupId,
      crafter: populationProfile.crafter,
      splitRole,
      coverage,
      seedCorpusId: seedCorpus.corpusId,
    }

    const evaluated = evaluateEpisodesForCrafter(
      recipe,
      crafterCase,
      seedCorpus.seeds,
      policyFactory,
      options,
    )
    evaluatedCrafterCases.push({ crafterCase, evaluated })
    const score = scoreEpisodes(recipe, evaluated.episodesByProfile, options.objective)
    const episodeCount = [...evaluated.episodesByProfile.values()]
      .reduce((sum, episodes) => sum + episodes.length, 0)
    perCrafter.push({
      caseKey: crafterCase.caseKey,
      profileId: crafterCase.profileId,
      groupId: crafterCase.groupId,
      initialStateCorpusId: crafterCase.initialStateCorpusId,
      splitRole: crafterCase.splitRole,
      coverage: crafterCase.coverage,
      seedCorpusId: crafterCase.seedCorpusId,
      score,
      episodeCount,
      safetyViolations: evaluated.safetyViolations,
      policyCallbackLatency: summarizeLatencies(evaluated.policyCallbackLatencies),
      policyFactoryColdStartLatency: summarizeFactoryColdStarts(
        evaluated.policyFactoryColdStartLatencies,
      ),
    })
    safetyViolations += evaluated.safetyViolations
    aggregatePolicyCallbackLatencies.push(...evaluated.policyCallbackLatencies)
    aggregatePolicyFactoryColdStartLatencies.push(...evaluated.policyFactoryColdStartLatencies)
  }

  for (const role of requiredEvidenceRoles) {
    const evaluatedGroupIds = new Set(evaluatedCrafterCases
      .filter(({ crafterCase }) => crafterCase.splitRole === role)
      .map(({ crafterCase }) => crafterCase.groupId))
    for (const expectedGroupId of groupIdsForHeldOutRole(options.split, role)) {
      if (!evaluatedGroupIds.has(expectedGroupId)) {
        throw new Error(`held-out evaluation is missing ${role} group: ${expectedGroupId}`)
      }
    }
  }

  const coverageScores: Partial<Record<HeldOutCrafterCoverage, RouteScore>> = {}
  for (const coverage of HELD_OUT_CRAFTER_COVERAGE) {
    const matchingCases = evaluatedCrafterCases.filter(({ crafterCase }) => (
      crafterCase.coverage === coverage
    ))
    if (matchingCases.length === 0) continue
    const episodes = flattenEpisodeSeries(matchingCases)
    coverageScores[coverage] = scoreEpisodes(recipe, episodes, options.objective)
  }

  const aggregateEpisodes = flattenEpisodeSeries(evaluatedCrafterCases)

  const rankedProfiles = [...perCrafter].sort((left, right) => (
    left.score.robustCompletionRate - right.score.robustCompletionRate
    || left.profileId.localeCompare(right.profileId)
  ))
  const worstProfile = rankedProfiles[0]!
  const worstDecileCount = Math.max(1, Math.ceil(rankedProfiles.length * 0.1))
  const worstDecile = rankedProfiles.slice(0, worstDecileCount)
  const worstLatencyProfile = [...perCrafter].sort((left, right) => (
    right.policyCallbackLatency.p95Ms - left.policyCallbackLatency.p95Ms
    || left.profileId.localeCompare(right.profileId)
  ))[0]!
  return {
    objectiveId: options.objective.objectiveId,
    score: scoreEpisodes(recipe, aggregateEpisodes, options.objective),
    episodeCount: [...aggregateEpisodes.values()].reduce((sum, episodes) => sum + episodes.length, 0),
    safetyViolations,
    perCrafter,
    coverageScores,
    worstProfileId: worstProfile.profileId,
    worstProfileCompletionRate: worstProfile.score.robustCompletionRate,
    worstDecileCompletionRate: worstDecile.reduce(
      (sum, result) => sum + result.score.robustCompletionRate,
      0,
    ) / worstDecile.length,
    policyCallbackLatency: summarizeLatencies(aggregatePolicyCallbackLatencies),
    policyFactoryColdStartLatency: summarizeFactoryColdStarts(
      aggregatePolicyFactoryColdStartLatencies,
    ),
    worstProfilePolicyCallbackP95: {
      profileId: worstLatencyProfile.profileId,
      p95Ms: worstLatencyProfile.policyCallbackLatency.p95Ms,
    },
  }
}

export function decidePromotion(
  baseline: HeldOutPolicyResult,
  candidate: HeldOutPolicyResult,
  safetyViolations = candidate.safetyViolations,
  criteria: Readonly<PromotionCriteria> = {},
): PromotionDecision {
  const minimumRobustCompletionGain = criteria.minimumRobustCompletionGain ?? 0.01
  const nearPerfectCompletionFloor = criteria.nearPerfectCompletionFloor ?? 0.995
  const minimumAverageSuccessfulStepReduction = criteria.minimumAverageSuccessfulStepReduction ?? 0.25
  const baselineSuccessfulSteps = baseline.score.averageSuccessfulSteps
  const candidateSuccessfulSteps = candidate.score.averageSuccessfulSteps
  const hasCompletionGain = candidate.score.robustCompletionRate
    >= baseline.score.robustCompletionRate + minimumRobustCompletionGain
  const hasNearPerfectEfficiencyGain = baseline.score.robustCompletionRate >= nearPerfectCompletionFloor
    && candidate.score.robustCompletionRate + 1e-9 >= baseline.score.robustCompletionRate
    && candidate.score.averageCompletionRate + 1e-9 >= baseline.score.averageCompletionRate
    && baselineSuccessfulSteps !== null
    && candidateSuccessfulSteps !== null
    && candidateSuccessfulSteps
      <= baselineSuccessfulSteps - minimumAverageSuccessfulStepReduction
  const basis = hasCompletionGain
    ? 'completion-gain'
    : hasNearPerfectEfficiencyGain
      ? 'near-perfect-efficiency'
      : null
  const reasons: string[] = []
  if (safetyViolations > 0) reasons.push(`safety-violations:${safetyViolations}`)
  if (basis === null) reasons.push('no-completion-or-near-perfect-efficiency-gain')
  if (candidate.score.failureRate > baseline.score.failureRate + 1e-9) reasons.push('failure-rate-regression')
  if (candidate.score.hardStopRate > baseline.score.hardStopRate + 1e-9) reasons.push('hard-stop-rate-regression')
  const baselineStallRate = baseline.score.stopReasonRates['policy-null']
    + baseline.score.stopReasonRates['no-legal-action']
    + baseline.score.stopReasonRates['illegal-action']
    + baseline.score.stopReasonRates['action-limit']
  const candidateStallRate = candidate.score.stopReasonRates['policy-null']
    + candidate.score.stopReasonRates['no-legal-action']
    + candidate.score.stopReasonRates['illegal-action']
    + candidate.score.stopReasonRates['action-limit']
  if (candidateStallRate > baselineStallRate + 1e-9) reasons.push('stall-rate-regression')
  if (compareRouteScores(candidate.score, baseline.score) <= 0) reasons.push('objective-not-better')
  return { promote: reasons.length === 0, reasons, basis }
}
