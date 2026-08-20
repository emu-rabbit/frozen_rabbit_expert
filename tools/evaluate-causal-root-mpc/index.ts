import { performance } from 'node:perf_hooks'
import {
  PLAYER_EQUIPMENT_PROFILES,
  type CraftScenarioDataId,
  type PlayerEquipmentProfile,
  type PlayerEquipmentProfileId,
} from '@frozen-rabbit-expert/data'
import {
  ACTIONS,
  createInitialCraftState,
  legalActions,
  type CraftObjective,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION,
  MAX_CAUSAL_ROOT_MPC_CANDIDATES,
  MIN_CAUSAL_ROOT_MPC_CANDIDATE_SAMPLES_PER_PROFILE,
  planWithCertificateShieldedCausalRootMpc,
  type CausalRootMpcSelectionReason,
} from '@frozen-rabbit-expert/policy-lab'
import {
  runEpisode,
  type EpisodePolicy,
  type EpisodeRandomStream,
  type EpisodeResult,
  type EpisodeStopReason,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  advanceGuideIntegratedDecisionMemory,
  createGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyController,
  isPolicyActionSafe,
  resolvePlayerProfilePolicyConfig,
  type GuideIntegratedPolicyConfig,
} from '@frozen-rabbit-expert/solver'
import {
  CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE,
  CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS,
  CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES,
  createPairedEpisodeRandomStreams,
  pairedDevelopmentSeeds,
  type CausalRootMpcDevelopmentScenario,
  type PairedDevelopmentSeed,
} from './scenarios'

export const CAUSAL_ROOT_MPC_DEVELOPMENT_RUNNER_VERSION =
  'causal-root-mpc-closed-loop-paired-development-evaluator-v0.4.0'
export const MIN_PAIRED_EPISODES_FOR_DEVELOPMENT_GATE = 20
export const MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE = 20
export const MIN_BOTH_COMPLETED_PAIRS_FOR_QUALITY_GATE = 20
export const MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_SEED_COUNT = 64
export const MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_STEPS = 100
export const MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_SAMPLES_PER_PROFILE = 16
export const MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_EPISODE_STEPS = 100
export const MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_OUTER_PAIRED_EPISODES = 10_000
export const MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PROJECTED_SIMULATION_STEPS = 50_000_000

export type CausalRootMpcTimingSource = 'system' | 'injected'

const STOP_REASONS = [
  'completed',
  'failed',
  'policy-null',
  'no-legal-action',
  'illegal-action',
  'action-limit',
] as const satisfies readonly EpisodeStopReason[]

const FORBIDDEN_CORPUS_OPTION_KEYS = [
  'corpus',
  'corpusId',
  'corpusRole',
  'frozenValidation',
  'reservedFinal',
  'reservedFinalSeeds',
] as const

export interface CausalRootMpcDevelopmentEvaluationOptions {
  scenarioIds?: readonly CraftScenarioDataId[]
  equipmentProfileIds?: readonly PlayerEquipmentProfileId[]
  conditionProfileIds?: readonly string[]
  seedCount?: number
  maxSteps?: number
  plannerSamplesPerProfile?: number
  plannerMaxEpisodeSteps?: number
  now?: () => number
}

export interface CountRate {
  count: number
  total: number
  rate: number
}

export interface NumericDistribution {
  count: number
  minimum: number | null
  p10: number | null
  median: number | null
  p90: number | null
  p95: number | null
  p99: number | null
  maximum: number | null
  average: number | null
}

export interface CausalRootMpcArmSummary {
  episodes: number
  completion: CountRate
  objectiveHits: CountRate
  terminalCompleted: number
  invalidTerminalCompletions: number
  stopReasons: Readonly<Record<EpisodeStopReason, number>>
  quality: {
    allFinalStates: NumericDistribution
    validCompletions: NumericDistribution
  }
  actions: {
    allEpisodes: NumericDistribution
    validCompletions: NumericDistribution
  }
  safetyViolations: number
  nulls: {
    policyNullSelections: number
    plannerNullPlans: number
    plannerErrorPlans: number
    plannerBudgetFallbackPlans: number
  }
  planner: {
    calls: number
    baselineSelections: number
    candidateSelections: number
    deviationFromBaseline: CountRate
    innerEpisodes: number
    selectionReasons: Readonly<Partial<Record<CausalRootMpcSelectionReason, number>>>
  }
  specialistActionInvocations: number
  latency: NumericDistribution
  byConditionProfile: Readonly<Record<string, {
    evidence: WeightedConditionProfile['evidence']
    completion: CountRate
    objectiveHits: CountRate
    safetyViolations: number
    policyNullSelections: number
    averageFinalQuality: number
    averageActions: number
  }>>
}

export interface CausalRootMpcPairedSummary {
  episodes: number
  pairedEpisodesByConditionProfile: Readonly<Record<string, number>>
  completion: {
    both: number
    baselineOnly: number
    causalOnly: number
    neither: number
    causalWins: number
    causalLosses: number
    ties: number
  }
  objectiveHits: {
    both: number
    baselineOnly: number
    causalOnly: number
    neither: number
    causalWins: number
    causalLosses: number
    ties: number
  }
  qualityWhenBothComplete: {
    causalHigher: number
    baselineHigher: number
    tied: number
    causalWins: number
    causalLosses: number
    ties: number
    averageCausalMinusBaseline: number | null
  }
  actionsWhenBothComplete: {
    causalShorter: number
    baselineShorter: number
    tied: number
    causalWins: number
    causalLosses: number
    ties: number
    averageCausalMinusBaseline: number | null
  }
  worstConditionProfileCompletionRateDelta: number
  worstConditionProfileObjectiveHitRateDelta: number
}

export type CausalRootMpcDevelopmentStopReason =
  | 'baseline-only-completion-loss'
  | 'baseline-only-objective-hit-loss'
  | 'worst-condition-profile-completion-regression'
  | 'worst-condition-profile-objective-hit-regression'
  | 'paired-completed-quality-regression'
  | 'insufficient-paired-episodes-for-development-gate'
  | 'insufficient-paired-episodes-per-condition-profile-for-development-gate'
  | 'insufficient-completed-pairs-for-quality-gate'
  | 'safety-violation'
  | 'planner-null'
  | 'planner-evaluation-error'
  | 'planner-budget-fallback'
  | 'causal-planner-latency-inconclusive-injected-clock'
  | 'causal-planner-p95-at-least-1000ms'

export interface CausalRootMpcDevelopmentStopMetrics {
  pairedEpisodes: number
  minimumPairedEpisodesPerConditionProfile: number
  bothCompletedPairs: number
  baselineOnlyCompletions: number
  baselineOnlyObjectiveHits: number
  baselineHigherCompletedQualityPairs: number
  qualityIsPrimaryObjective: boolean
  worstConditionProfileCompletionRateDelta: number
  worstConditionProfileObjectiveHitRateDelta: number
  safetyViolations: number
  plannerNullPlans: number
  plannerErrorPlans: number
  plannerBudgetFallbackPlans: number
  timingSource: CausalRootMpcTimingSource
  causalPlannerP95Ms: number | null
}

export interface CausalRootMpcEquipmentEvaluation {
  equipmentProfileId: PlayerEquipmentProfileId
  equipmentLabel: string
  crafter: PlayerEquipmentProfile['crafter']
  baselineConfig: Readonly<GuideIntegratedPolicyConfig>
  baseline: CausalRootMpcArmSummary
  causal: CausalRootMpcArmSummary
  paired: CausalRootMpcPairedSummary
  stopSignals: {
    shouldStopExpansion: boolean
    reasons: readonly CausalRootMpcDevelopmentStopReason[]
    strongPlannerP95TargetMs: 1000
    minimumEvidence: {
      pairedEpisodes: typeof MIN_PAIRED_EPISODES_FOR_DEVELOPMENT_GATE
      pairedEpisodesPerConditionProfile: typeof MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE
      bothCompletedQualityPairs: typeof MIN_BOTH_COMPLETED_PAIRS_FOR_QUALITY_GATE
    }
    insufficientConditionProfiles: readonly {
      conditionProfileId: string
      pairedEpisodes: number
    }[]
  }
}

export interface CausalRootMpcScenarioEvaluation {
  scenarioId: CraftScenarioDataId
  recipeProfileId: string
  objectiveId: string
  baselinePolicyVersion: string
  conditionProfiles: readonly {
    id: string
    evidence: WeightedConditionProfile['evidence']
  }[]
  /**
   * The planner always sees the scenario's complete development sensitivity
   * set. Filtering outer episodes must not silently create a different policy.
   */
  plannerConditionProfiles: readonly {
    id: string
    evidence: WeightedConditionProfile['evidence']
  }[]
  equipment: readonly CausalRootMpcEquipmentEvaluation[]
}

export interface CausalRootMpcDevelopmentEvaluationReport {
  version: typeof CAUSAL_ROOT_MPC_DEVELOPMENT_RUNNER_VERSION
  candidatePlannerVersion: typeof CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION
  timingSource: CausalRootMpcTimingSource
  latencyEvidence: 'measured-system-clock' | 'inconclusive-injected-clock'
  evidence: typeof CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE
  dataAccess: {
    seedSource: 'generated-paired-development-seeds-only'
    plannerSeedSource: 'independent-explicit-scenario-id-namespace'
    reservedFinalAccessed: false
    frozenValidationAccessed: false
  }
  seedEvidence: {
    environmentPairing: 'baseline-causal-common-environment-seed'
    plannerIsolation: 'independent-fixed-scenario-id-namespace'
    scenarioNamespaces: readonly {
      scenarioId: CraftScenarioDataId
      environmentNamespaceId: string
      plannerNamespaceId: string
    }[]
  }
  interpretation: string
  parameters: {
    scenarioIds: readonly CraftScenarioDataId[]
    equipmentProfileIds: readonly PlayerEquipmentProfileId[]
    conditionProfileIds: readonly string[]
    seedCountPerConditionProfile: number
    maxSteps: number
    plannerSamplesPerProfile: number
    plannerMaxEpisodeSteps: number
    projectedOuterPairedEpisodes: number
    projectedPlannerEpisodes: number
    projectedSimulationSteps: number
    workloadLimits: {
      seedCountPerConditionProfile: typeof MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_SEED_COUNT
      maxSteps: typeof MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_STEPS
      plannerSamplesPerProfile:
        typeof MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_SAMPLES_PER_PROFILE
      plannerMaxEpisodeSteps:
        typeof MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_EPISODE_STEPS
      outerPairedEpisodes: typeof MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_OUTER_PAIRED_EPISODES
      projectedSimulationSteps:
        typeof MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PROJECTED_SIMULATION_STEPS
    }
  }
  scenarios: readonly CausalRootMpcScenarioEvaluation[]
}

interface DecisionAudit {
  latenciesMs: number[]
  safetyViolations: number
  policyNullSelections: number
  plannerNullPlans: number
  plannerErrorPlans: number
  plannerBudgetFallbackPlans: number
  plannerCalls: number
  baselineSelections: number
  candidateSelections: number
  plannerInnerEpisodes: number
  plannerSelectionReasons: Map<CausalRootMpcSelectionReason, number>
}

interface EvaluatedEpisode {
  conditionProfile: Readonly<WeightedConditionProfile>
  pairedSeed: Readonly<PairedDevelopmentSeed>
  result: EpisodeResult
  audit: DecisionAudit
}

interface ResolvedEvaluationOptions {
  scenarios: readonly CausalRootMpcDevelopmentScenario[]
  equipmentProfiles: readonly PlayerEquipmentProfile[]
  conditionProfileIds: readonly string[] | null
  seedCount: number
  maxSteps: number
  plannerSamplesPerProfile: number
  plannerMaxEpisodeSteps: number
  now: () => number
  timingSource: CausalRootMpcTimingSource
  projectedOuterPairedEpisodes: number
  projectedPlannerEpisodes: number
  projectedSimulationSteps: number
}

function emptyAudit(): DecisionAudit {
  return {
    latenciesMs: [],
    safetyViolations: 0,
    policyNullSelections: 0,
    plannerNullPlans: 0,
    plannerErrorPlans: 0,
    plannerBudgetFallbackPlans: 0,
    plannerCalls: 0,
    baselineSelections: 0,
    candidateSelections: 0,
    plannerInnerEpisodes: 0,
    plannerSelectionReasons: new Map(),
  }
}

function boundedPositiveSafeInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be an integer between 1 and ${maximum}`)
  }
  return value
}

function checkedProduct(values: readonly number[], label: string): number {
  const product = values.reduce((result, value) => result * value, 1)
  if (!Number.isSafeInteger(product)) throw new RangeError(`${label} exceeds safe integer range`)
  return product
}

function assertUniqueNonEmptyIds(ids: readonly string[], label: string): void {
  if (ids.length === 0) throw new Error(`${label} must not be empty`)
  const seen = new Set<string>()
  for (const id of ids) {
    if (id.trim().length === 0) throw new Error(`${label} must not contain an empty id`)
    if (seen.has(id)) throw new Error(`${label} contains duplicate id: ${id}`)
    seen.add(id)
  }
}

function selectedById<T extends { id?: string; scenarioId?: string }>(
  all: readonly T[],
  requested: readonly string[] | undefined,
  key: 'id' | 'scenarioId',
  label: string,
): readonly T[] {
  if (requested === undefined) return all
  assertUniqueNonEmptyIds(requested, label)
  const byId = new Map(all.map((entry) => [String(entry[key]), entry]))
  const unknown = requested.filter((id) => !byId.has(id))
  if (unknown.length > 0) throw new Error(`unknown ${label}: ${unknown.join(', ')}`)
  return requested.map((id) => byId.get(id)!)
}

function resolveOptions(
  options: Readonly<CausalRootMpcDevelopmentEvaluationOptions>,
): ResolvedEvaluationOptions {
  const rawOptions = options as Readonly<Record<string, unknown>>
  const forbidden = FORBIDDEN_CORPUS_OPTION_KEYS.find((key) => (
    Object.prototype.hasOwnProperty.call(rawOptions, key)
  ))
  if (forbidden !== undefined) {
    throw new Error(
      `${forbidden} is not accepted: this runner is development-only and cannot read frozen or reserved-final corpora`,
    )
  }
  const scenarios = selectedById(
    CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS,
    options.scenarioIds,
    'scenarioId',
    'scenarioIds',
  )
  const equipmentProfiles = selectedById(
    PLAYER_EQUIPMENT_PROFILES,
    options.equipmentProfileIds,
    'id',
    'equipmentProfileIds',
  )
  if (options.conditionProfileIds !== undefined) {
    assertUniqueNonEmptyIds(options.conditionProfileIds, 'conditionProfileIds')
  }
  const conditionProfileIds = options.conditionProfileIds ?? null
  const seedCount = boundedPositiveSafeInteger(
    options.seedCount ?? 1,
    'seedCount',
    MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_SEED_COUNT,
  )
  const maxSteps = boundedPositiveSafeInteger(
    options.maxSteps ?? 80,
    'maxSteps',
    MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_STEPS,
  )
  const plannerSamplesPerProfile = boundedPositiveSafeInteger(
    options.plannerSamplesPerProfile ?? 1,
    'plannerSamplesPerProfile',
    MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_SAMPLES_PER_PROFILE,
  )
  const plannerMaxEpisodeSteps = boundedPositiveSafeInteger(
    options.plannerMaxEpisodeSteps ?? 80,
    'plannerMaxEpisodeSteps',
    MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_EPISODE_STEPS,
  )
  const candidateUpperBound = plannerSamplesPerProfile
    < MIN_CAUSAL_ROOT_MPC_CANDIDATE_SAMPLES_PER_PROFILE
    ? 1
    : MAX_CAUSAL_ROOT_MPC_CANDIDATES
  let projectedOuterPairedEpisodes = 0
  let projectedPlannerEpisodes = 0
  for (const scenario of scenarios) {
    const outerPairs = checkedProduct([
      selectedConditionProfiles(scenario, conditionProfileIds).length,
      equipmentProfiles.length,
      seedCount,
    ], 'projected outer paired episodes')
    projectedOuterPairedEpisodes += outerPairs
    projectedPlannerEpisodes += checkedProduct([
      outerPairs,
      maxSteps,
      candidateUpperBound,
      scenario.assumedConditionProfiles.length,
      plannerSamplesPerProfile,
    ], 'projected planner episodes')
  }
  if (projectedOuterPairedEpisodes > MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_OUTER_PAIRED_EPISODES) {
    throw new RangeError(
      `projected outer paired episodes ${projectedOuterPairedEpisodes} exceed limit ${MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_OUTER_PAIRED_EPISODES}`,
    )
  }
  const projectedSimulationSteps = checkedProduct(
    [projectedPlannerEpisodes, plannerMaxEpisodeSteps],
    'projected simulation steps',
  ) + checkedProduct(
    [projectedOuterPairedEpisodes, 2, maxSteps],
    'projected outer simulation steps',
  )
  if (projectedSimulationSteps > MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PROJECTED_SIMULATION_STEPS) {
    throw new RangeError(
      `projected simulation steps ${projectedSimulationSteps} exceed limit ${MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PROJECTED_SIMULATION_STEPS}`,
    )
  }
  return {
    scenarios,
    equipmentProfiles,
    conditionProfileIds,
    seedCount,
    maxSteps,
    plannerSamplesPerProfile,
    plannerMaxEpisodeSteps,
    now: options.now ?? (() => performance.now()),
    timingSource: options.now === undefined ? 'system' : 'injected',
    projectedOuterPairedEpisodes,
    projectedPlannerEpisodes,
    projectedSimulationSteps,
  }
}

function selectedConditionProfiles(
  scenario: Readonly<CausalRootMpcDevelopmentScenario>,
  requestedIds: readonly string[] | null,
): readonly Readonly<WeightedConditionProfile>[] {
  if (requestedIds === null) return scenario.assumedConditionProfiles
  const byId = new Map(scenario.assumedConditionProfiles.map((profile) => [profile.id, profile]))
  const missing = requestedIds.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new Error(
      `conditionProfileIds are not development profiles for ${scenario.scenarioId}: ${missing.join(', ')}`,
    )
  }
  return requestedIds.map((id) => byId.get(id)!)
}

function incrementCount<Key extends string>(counts: Map<Key, number>, key: Key): void {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function auditAction(
  recipe: Readonly<RecipeProfile>,
  crafter: PlayerEquipmentProfile['crafter'],
  state: CraftState,
  action: ReturnType<EpisodePolicy>,
  audit: DecisionAudit,
): void {
  if (action === null) {
    audit.policyNullSelections += 1
    return
  }
  if (
    !legalActions(recipe, crafter, state).includes(action)
    || !isPolicyActionSafe(recipe, crafter, state, action)
  ) audit.safetyViolations += 1
}

function policyNullEpisode(initialState: CraftState): EpisodeResult {
  return {
    terminal: 'none',
    finalState: initialState,
    actions: [],
    stoppedByLimit: false,
    stopReason: 'policy-null',
  }
}

function runAuditedEpisode(
  scenario: Readonly<CausalRootMpcDevelopmentScenario>,
  equipment: Readonly<PlayerEquipmentProfile>,
  conditionProfile: Readonly<WeightedConditionProfile>,
  seed: Readonly<PairedDevelopmentSeed>,
  random: EpisodeRandomStream,
  policy: EpisodePolicy,
  audit: DecisionAudit,
  maxSteps: number,
  now: () => number,
): EvaluatedEpisode {
  const initialState = createInitialCraftState(scenario.recipe, equipment.crafter)
  const auditedPolicy: EpisodePolicy = (recipe, crafter, state) => {
    const startedAt = now()
    const action = policy(recipe, crafter, state)
    audit.latenciesMs.push(Math.max(0, now() - startedAt))
    auditAction(recipe, crafter, state, action, audit)
    return action
  }
  const firstAction = auditedPolicy(scenario.recipe, equipment.crafter, initialState)
  const result = firstAction === null
    ? policyNullEpisode(initialState)
    : runEpisode({
        recipe: scenario.recipe,
        crafter: equipment.crafter,
        initialState,
        firstAction,
        policy: auditedPolicy,
        random,
        conditionProfile,
        maxSteps,
      })
  return { conditionProfile, pairedSeed: seed, result, audit }
}

function runBaselineEpisode(
  scenario: Readonly<CausalRootMpcDevelopmentScenario>,
  equipment: Readonly<PlayerEquipmentProfile>,
  conditionProfile: Readonly<WeightedConditionProfile>,
  seed: Readonly<PairedDevelopmentSeed>,
  random: EpisodeRandomStream,
  config: Readonly<GuideIntegratedPolicyConfig>,
  maxSteps: number,
  now: () => number,
): EvaluatedEpisode {
  const audit = emptyAudit()
  const controller = createGuideIntegratedPolicyController(
    config,
    createGuideIntegratedDecisionMemory(),
    scenario.objective,
  )
  return runAuditedEpisode(
    scenario,
    equipment,
    conditionProfile,
    seed,
    random,
    controller.policy,
    audit,
    maxSteps,
    now,
  )
}

function runCausalEpisode(
  scenario: Readonly<CausalRootMpcDevelopmentScenario>,
  equipment: Readonly<PlayerEquipmentProfile>,
  conditionProfile: Readonly<WeightedConditionProfile>,
  plannerProfiles: readonly Readonly<WeightedConditionProfile>[],
  seed: Readonly<PairedDevelopmentSeed>,
  random: EpisodeRandomStream,
  config: Readonly<GuideIntegratedPolicyConfig>,
  maxSteps: number,
  plannerSamplesPerProfile: number,
  plannerMaxEpisodeSteps: number,
  now: () => number,
): EvaluatedEpisode {
  const audit = emptyAudit()
  let memory = createGuideIntegratedDecisionMemory()
  const maxStage1Episodes = MAX_CAUSAL_ROOT_MPC_CANDIDATES
    * plannerProfiles.length
    * plannerSamplesPerProfile
  if (!Number.isSafeInteger(maxStage1Episodes)) {
    throw new RangeError('causal planner Stage-1 episode budget exceeds safe integer range')
  }

  const policy: EpisodePolicy = (_recipe, _crafter, state) => {
    audit.plannerCalls += 1
    const remainingActions = Math.max(1, maxSteps - memory.actionUses)
    const plan = planWithCertificateShieldedCausalRootMpc({
      recipe: scenario.recipe,
      objective: scenario.objective,
      crafter: equipment.crafter,
    }, state, {
      scenarioId: scenario.scenarioId,
      guideConfig: config,
      baselinePolicyVersion: scenario.baselinePolicyVersion,
      startingDecisionMemory: memory,
      profiles: plannerProfiles,
      samplesPerProfile: plannerSamplesPerProfile,
      maxEpisodeSteps: Math.min(plannerMaxEpisodeSteps, remainingActions),
      seed: seed.plannerSeed,
      maxStage1Episodes,
    })
    if (plan === null) {
      audit.plannerNullPlans += 1
      return null
    }
    incrementCount(audit.plannerSelectionReasons, plan.selectionReason)
    if (plan.error !== null) audit.plannerErrorPlans += 1
    if (plan.selectionReason === 'baseline-budget-exhausted') {
      audit.plannerBudgetFallbackPlans += 1
    }
    if (plan.action === null) {
      audit.plannerNullPlans += 1
      return null
    }
    audit.plannerInnerEpisodes += plan.episodeCount
    if (plan.usedBaseline) audit.baselineSelections += 1
    else audit.candidateSelections += 1
    memory = advanceGuideIntegratedDecisionMemory(memory, plan.action)
    return plan.action
  }
  return runAuditedEpisode(
    scenario,
    equipment,
    conditionProfile,
    seed,
    random,
    policy,
    audit,
    maxSteps,
    now,
  )
}

function validCompletion(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
  result: Readonly<EpisodeResult>,
): boolean {
  if (result.terminal !== 'completed') return false
  if (result.finalState.progress < recipe.progressRequired) return false
  return objective.mode === 'required-quality'
    ? result.finalState.quality >= objective.qualityTarget
    : true
}

function objectiveHit(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
  result: Readonly<EpisodeResult>,
): boolean {
  return validCompletion(recipe, objective, result)
    && result.finalState.quality >= objective.qualityTarget
}

function countRate(count: number, total: number): CountRate {
  return { count, total, rate: total === 0 ? 0 : count / total }
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null
}

function distribution(values: readonly number[]): NumericDistribution {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    count: sorted.length,
    minimum: sorted[0] ?? null,
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    maximum: sorted.at(-1) ?? null,
    average: sorted.length === 0
      ? null
      : sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  }
}

function stopReasonCounts(episodes: readonly EvaluatedEpisode[]): Record<EpisodeStopReason, number> {
  return Object.fromEntries(STOP_REASONS.map((reason) => [
    reason,
    episodes.filter(({ result }) => result.stopReason === reason).length,
  ])) as Record<EpisodeStopReason, number>
}

function summarizeArmCore(
  scenario: Readonly<CausalRootMpcDevelopmentScenario>,
  episodes: readonly EvaluatedEpisode[],
) {
  const completed = episodes.filter(({ result }) => validCompletion(
    scenario.recipe,
    scenario.objective,
    result,
  ))
  const hits = episodes.filter(({ result }) => objectiveHit(
    scenario.recipe,
    scenario.objective,
    result,
  ))
  return {
    completion: countRate(completed.length, episodes.length),
    objectiveHits: countRate(hits.length, episodes.length),
    terminalCompleted: episodes.filter(({ result }) => result.terminal === 'completed').length,
    invalidTerminalCompletions: episodes.filter(({ result }) => (
      result.terminal === 'completed'
      && !validCompletion(scenario.recipe, scenario.objective, result)
    )).length,
    stopReasons: stopReasonCounts(episodes),
    quality: {
      allFinalStates: distribution(episodes.map(({ result }) => result.finalState.quality)),
      validCompletions: distribution(completed.map(({ result }) => result.finalState.quality)),
    },
    actions: {
      allEpisodes: distribution(episodes.map(({ result }) => result.actions.length)),
      validCompletions: distribution(completed.map(({ result }) => result.actions.length)),
    },
  }
}

function summarizeArm(
  scenario: Readonly<CausalRootMpcDevelopmentScenario>,
  conditionProfiles: readonly Readonly<WeightedConditionProfile>[],
  episodes: readonly EvaluatedEpisode[],
): CausalRootMpcArmSummary {
  const core = summarizeArmCore(scenario, episodes)
  const audits = episodes.map(({ audit }) => audit)
  const plannerCalls = audits.reduce((sum, audit) => sum + audit.plannerCalls, 0)
  const baselineSelections = audits.reduce((sum, audit) => sum + audit.baselineSelections, 0)
  const candidateSelections = audits.reduce((sum, audit) => sum + audit.candidateSelections, 0)
  const nonNullPlannerSelections = baselineSelections + candidateSelections
  const specialistActionInvocations = episodes.reduce((sum, { result }) => (
    sum + result.actions.filter((action) => ACTIONS[action].specialistOnly === true).length
  ), 0)
  return {
    episodes: episodes.length,
    ...core,
    safetyViolations: audits.reduce((sum, audit) => sum + audit.safetyViolations, 0),
    nulls: {
      policyNullSelections: audits.reduce((sum, audit) => sum + audit.policyNullSelections, 0),
      plannerNullPlans: audits.reduce((sum, audit) => sum + audit.plannerNullPlans, 0),
      plannerErrorPlans: audits.reduce((sum, audit) => sum + audit.plannerErrorPlans, 0),
      plannerBudgetFallbackPlans: audits.reduce(
        (sum, audit) => sum + audit.plannerBudgetFallbackPlans,
        0,
      ),
    },
    planner: {
      calls: plannerCalls,
      baselineSelections,
      candidateSelections,
      deviationFromBaseline: countRate(candidateSelections, nonNullPlannerSelections),
      innerEpisodes: audits.reduce((sum, audit) => sum + audit.plannerInnerEpisodes, 0),
      selectionReasons: Object.fromEntries(
        [...audits.reduce((counts, audit) => {
          for (const [reason, count] of audit.plannerSelectionReasons) {
            counts.set(reason, (counts.get(reason) ?? 0) + count)
          }
          return counts
        }, new Map<CausalRootMpcSelectionReason, number>())]
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    specialistActionInvocations,
    latency: distribution(audits.flatMap((audit) => audit.latenciesMs)),
    byConditionProfile: Object.fromEntries(conditionProfiles.map((profile) => {
      const group = episodes.filter((episode) => episode.conditionProfile.id === profile.id)
      const groupCore = summarizeArmCore(scenario, group)
      return [profile.id, {
        evidence: profile.evidence,
        completion: groupCore.completion,
        objectiveHits: groupCore.objectiveHits,
        safetyViolations: group.reduce((sum, episode) => sum + episode.audit.safetyViolations, 0),
        policyNullSelections: group.reduce(
          (sum, episode) => sum + episode.audit.policyNullSelections,
          0,
        ),
        averageFinalQuality: group.reduce(
          (sum, episode) => sum + episode.result.finalState.quality,
          0,
        ) / Math.max(1, group.length),
        averageActions: group.reduce(
          (sum, episode) => sum + episode.result.actions.length,
          0,
        ) / Math.max(1, group.length),
      }]
    })),
  }
}

function assertPairedEpisodeIdentity(
  baseline: Readonly<EvaluatedEpisode>,
  causal: Readonly<EvaluatedEpisode>,
): void {
  if (
    baseline.conditionProfile.id !== causal.conditionProfile.id
    || baseline.pairedSeed.corpusId !== causal.pairedSeed.corpusId
    || baseline.pairedSeed.scenarioId !== causal.pairedSeed.scenarioId
    || baseline.pairedSeed.seedIndex !== causal.pairedSeed.seedIndex
    || baseline.pairedSeed.environmentSeed !== causal.pairedSeed.environmentSeed
    || baseline.pairedSeed.baselineEnvironmentSeed
      !== causal.pairedSeed.causalEnvironmentSeed
    || baseline.pairedSeed.plannerSeed !== causal.pairedSeed.plannerSeed
  ) throw new Error('paired episodes must share condition-profile and seed evidence')
}

function pairedSummary(
  scenario: Readonly<CausalRootMpcDevelopmentScenario>,
  conditionProfiles: readonly Readonly<WeightedConditionProfile>[],
  baseline: readonly EvaluatedEpisode[],
  causal: readonly EvaluatedEpisode[],
): CausalRootMpcPairedSummary {
  if (baseline.length !== causal.length) throw new Error('paired arms must have equal episode counts')
  let bothCompletions = 0
  let baselineOnlyCompletions = 0
  let causalOnlyCompletions = 0
  let neitherCompletions = 0
  let bothHits = 0
  let baselineOnlyHits = 0
  let causalOnlyHits = 0
  let neitherHits = 0
  let causalHigher = 0
  let baselineHigher = 0
  let qualityTied = 0
  let causalShorter = 0
  let baselineShorter = 0
  let actionsTied = 0
  const qualityDeltas: number[] = []
  const actionDeltas: number[] = []

  for (let index = 0; index < baseline.length; index += 1) {
    const baselineEpisode = baseline[index]!
    const causalEpisode = causal[index]!
    assertPairedEpisodeIdentity(baselineEpisode, causalEpisode)
    const baselineCompleted = validCompletion(
      scenario.recipe,
      scenario.objective,
      baselineEpisode.result,
    )
    const causalCompleted = validCompletion(
      scenario.recipe,
      scenario.objective,
      causalEpisode.result,
    )
    if (baselineCompleted && causalCompleted) bothCompletions += 1
    else if (baselineCompleted) baselineOnlyCompletions += 1
    else if (causalCompleted) causalOnlyCompletions += 1
    else neitherCompletions += 1

    const baselineHit = objectiveHit(scenario.recipe, scenario.objective, baselineEpisode.result)
    const causalHit = objectiveHit(scenario.recipe, scenario.objective, causalEpisode.result)
    if (baselineHit && causalHit) bothHits += 1
    else if (baselineHit) baselineOnlyHits += 1
    else if (causalHit) causalOnlyHits += 1
    else neitherHits += 1

    if (baselineCompleted && causalCompleted) {
      const qualityDelta = causalEpisode.result.finalState.quality
        - baselineEpisode.result.finalState.quality
      qualityDeltas.push(qualityDelta)
      if (qualityDelta > 0) causalHigher += 1
      else if (qualityDelta < 0) baselineHigher += 1
      else qualityTied += 1

      const actionDelta = causalEpisode.result.actions.length
        - baselineEpisode.result.actions.length
      actionDeltas.push(actionDelta)
      if (actionDelta < 0) causalShorter += 1
      else if (actionDelta > 0) baselineShorter += 1
      else actionsTied += 1
    }
  }

  const conditionDeltas = conditionProfiles.map((profile) => {
    const baselineGroup = baseline.filter((episode) => episode.conditionProfile.id === profile.id)
    const causalGroup = causal.filter((episode) => episode.conditionProfile.id === profile.id)
    const baselineRate = baselineGroup.filter(({ result }) => validCompletion(
      scenario.recipe,
      scenario.objective,
      result,
    )).length / Math.max(1, baselineGroup.length)
    const causalRate = causalGroup.filter(({ result }) => validCompletion(
      scenario.recipe,
      scenario.objective,
      result,
    )).length / Math.max(1, causalGroup.length)
    return causalRate - baselineRate
  })
  const conditionObjectiveDeltas = conditionProfiles.map((profile) => {
    const baselineGroup = baseline.filter((episode) => episode.conditionProfile.id === profile.id)
    const causalGroup = causal.filter((episode) => episode.conditionProfile.id === profile.id)
    const baselineRate = baselineGroup.filter(({ result }) => objectiveHit(
      scenario.recipe,
      scenario.objective,
      result,
    )).length / Math.max(1, baselineGroup.length)
    const causalRate = causalGroup.filter(({ result }) => objectiveHit(
      scenario.recipe,
      scenario.objective,
      result,
    )).length / Math.max(1, causalGroup.length)
    return causalRate - baselineRate
  })
  const averageOrNull = (values: readonly number[]): number | null => values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length
  const pairedEpisodesByConditionProfile = Object.fromEntries(conditionProfiles.map((profile) => [
    profile.id,
    baseline.filter((episode) => episode.conditionProfile.id === profile.id).length,
  ]))
  return {
    episodes: baseline.length,
    pairedEpisodesByConditionProfile,
    completion: {
      both: bothCompletions,
      baselineOnly: baselineOnlyCompletions,
      causalOnly: causalOnlyCompletions,
      neither: neitherCompletions,
      causalWins: causalOnlyCompletions,
      causalLosses: baselineOnlyCompletions,
      ties: bothCompletions + neitherCompletions,
    },
    objectiveHits: {
      both: bothHits,
      baselineOnly: baselineOnlyHits,
      causalOnly: causalOnlyHits,
      neither: neitherHits,
      causalWins: causalOnlyHits,
      causalLosses: baselineOnlyHits,
      ties: bothHits + neitherHits,
    },
    qualityWhenBothComplete: {
      causalHigher,
      baselineHigher,
      tied: qualityTied,
      causalWins: causalHigher,
      causalLosses: baselineHigher,
      ties: qualityTied,
      averageCausalMinusBaseline: averageOrNull(qualityDeltas),
    },
    actionsWhenBothComplete: {
      causalShorter,
      baselineShorter,
      tied: actionsTied,
      causalWins: causalShorter,
      causalLosses: baselineShorter,
      ties: actionsTied,
      averageCausalMinusBaseline: averageOrNull(actionDeltas),
    },
    worstConditionProfileCompletionRateDelta: Math.min(...conditionDeltas),
    worstConditionProfileObjectiveHitRateDelta: Math.min(...conditionObjectiveDeltas),
  }
}

export function causalRootMpcDevelopmentStopReasons(
  metrics: Readonly<CausalRootMpcDevelopmentStopMetrics>,
): readonly CausalRootMpcDevelopmentStopReason[] {
  const reasons: CausalRootMpcDevelopmentStopReason[] = []
  if (metrics.pairedEpisodes < MIN_PAIRED_EPISODES_FOR_DEVELOPMENT_GATE) {
    reasons.push('insufficient-paired-episodes-for-development-gate')
  }
  if (
    metrics.minimumPairedEpisodesPerConditionProfile
    < MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE
  ) {
    reasons.push('insufficient-paired-episodes-per-condition-profile-for-development-gate')
  }
  if (
    metrics.qualityIsPrimaryObjective
    && metrics.bothCompletedPairs < MIN_BOTH_COMPLETED_PAIRS_FOR_QUALITY_GATE
  ) {
    reasons.push('insufficient-completed-pairs-for-quality-gate')
  }
  if (metrics.baselineOnlyCompletions > 0) reasons.push('baseline-only-completion-loss')
  if (metrics.baselineOnlyObjectiveHits > 0) reasons.push('baseline-only-objective-hit-loss')
  if (
    metrics.qualityIsPrimaryObjective
    && metrics.baselineHigherCompletedQualityPairs > 0
  ) reasons.push('paired-completed-quality-regression')
  if (metrics.worstConditionProfileCompletionRateDelta < 0) {
    reasons.push('worst-condition-profile-completion-regression')
  }
  if (metrics.worstConditionProfileObjectiveHitRateDelta < 0) {
    reasons.push('worst-condition-profile-objective-hit-regression')
  }
  if (metrics.safetyViolations > 0) reasons.push('safety-violation')
  if (metrics.plannerNullPlans > 0) reasons.push('planner-null')
  if (metrics.plannerErrorPlans > 0) reasons.push('planner-evaluation-error')
  if (metrics.plannerBudgetFallbackPlans > 0) reasons.push('planner-budget-fallback')
  if (metrics.timingSource === 'injected') {
    reasons.push('causal-planner-latency-inconclusive-injected-clock')
  } else if ((metrics.causalPlannerP95Ms ?? Number.POSITIVE_INFINITY) >= 1000) {
    reasons.push('causal-planner-p95-at-least-1000ms')
  }
  return reasons
}

function stopSignals(
  objective: Readonly<CraftObjective>,
  causal: Readonly<CausalRootMpcArmSummary>,
  paired: Readonly<CausalRootMpcPairedSummary>,
  timingSource: CausalRootMpcTimingSource,
): CausalRootMpcEquipmentEvaluation['stopSignals'] {
  const conditionPairCounts = Object.entries(paired.pairedEpisodesByConditionProfile)
  const insufficientConditionProfiles = conditionPairCounts
    .filter(([, count]) => count < MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE)
    .map(([conditionProfileId, pairedEpisodes]) => ({ conditionProfileId, pairedEpisodes }))
  const reasons = causalRootMpcDevelopmentStopReasons({
    pairedEpisodes: paired.episodes,
    minimumPairedEpisodesPerConditionProfile: Math.min(
      ...conditionPairCounts.map(([, count]) => count),
    ),
    bothCompletedPairs: paired.completion.both,
    baselineOnlyCompletions: paired.completion.baselineOnly,
    baselineOnlyObjectiveHits: paired.objectiveHits.baselineOnly,
    baselineHigherCompletedQualityPairs: paired.qualityWhenBothComplete.baselineHigher,
    qualityIsPrimaryObjective: objective.mode === 'maximize-quality-with-safe-completion',
    worstConditionProfileCompletionRateDelta:
      paired.worstConditionProfileCompletionRateDelta,
    worstConditionProfileObjectiveHitRateDelta:
      paired.worstConditionProfileObjectiveHitRateDelta,
    safetyViolations: causal.safetyViolations,
    plannerNullPlans: causal.nulls.plannerNullPlans,
    plannerErrorPlans: causal.nulls.plannerErrorPlans,
    plannerBudgetFallbackPlans: causal.nulls.plannerBudgetFallbackPlans,
    timingSource,
    causalPlannerP95Ms: causal.latency.p95,
  })
  return {
    shouldStopExpansion: reasons.length > 0,
    reasons,
    strongPlannerP95TargetMs: 1000,
    minimumEvidence: {
      pairedEpisodes: MIN_PAIRED_EPISODES_FOR_DEVELOPMENT_GATE,
      pairedEpisodesPerConditionProfile: MIN_PAIRED_EPISODES_PER_CONDITION_PROFILE,
      bothCompletedQualityPairs: MIN_BOTH_COMPLETED_PAIRS_FOR_QUALITY_GATE,
    },
    insufficientConditionProfiles,
  }
}

/**
 * Executes only the generated, regression-seen development matrix. There is
 * intentionally no corpus parameter or import path for frozen/reserved data.
 */
export function evaluateCausalRootMpcDevelopment(
  options: Readonly<CausalRootMpcDevelopmentEvaluationOptions> = {},
): CausalRootMpcDevelopmentEvaluationReport {
  const resolved = resolveOptions(options)
  const scenarios = resolved.scenarios.map((scenario) => {
    const evaluationConditionProfiles = selectedConditionProfiles(
      scenario,
      resolved.conditionProfileIds,
    )
    const plannerConditionProfiles = scenario.assumedConditionProfiles
    const seeds = pairedDevelopmentSeeds(scenario.scenarioId, resolved.seedCount)
    const equipment = resolved.equipmentProfiles.map((equipmentProfile) => {
      const baselineConfig = resolvePlayerProfilePolicyConfig(
        scenario.scenarioId,
        equipmentProfile.crafter,
      )
      const baselineEpisodes: EvaluatedEpisode[] = []
      const causalEpisodes: EvaluatedEpisode[] = []
      for (const conditionProfile of evaluationConditionProfiles) {
        for (const seed of seeds) {
          const random = createPairedEpisodeRandomStreams(seed)
          baselineEpisodes.push(runBaselineEpisode(
            scenario,
            equipmentProfile,
            conditionProfile,
            seed,
            random.baseline,
            baselineConfig,
            resolved.maxSteps,
            resolved.now,
          ))
          causalEpisodes.push(runCausalEpisode(
            scenario,
            equipmentProfile,
            conditionProfile,
            plannerConditionProfiles,
            seed,
            random.causal,
            baselineConfig,
            resolved.maxSteps,
            resolved.plannerSamplesPerProfile,
            resolved.plannerMaxEpisodeSteps,
            resolved.now,
          ))
        }
      }
      const baseline = summarizeArm(scenario, evaluationConditionProfiles, baselineEpisodes)
      const causal = summarizeArm(scenario, evaluationConditionProfiles, causalEpisodes)
      const paired = pairedSummary(
        scenario,
        evaluationConditionProfiles,
        baselineEpisodes,
        causalEpisodes,
      )
      return {
        equipmentProfileId: equipmentProfile.id,
        equipmentLabel: equipmentProfile.label,
        crafter: equipmentProfile.crafter,
        baselineConfig,
        baseline,
        causal,
        paired,
        stopSignals: stopSignals(scenario.objective, causal, paired, resolved.timingSource),
      }
    })
    return {
      scenarioId: scenario.scenarioId,
      recipeProfileId: scenario.recipe.profileId,
      objectiveId: scenario.objective.objectiveId,
      baselinePolicyVersion: scenario.baselinePolicyVersion,
      conditionProfiles: evaluationConditionProfiles.map((profile) => ({
        id: profile.id,
        evidence: profile.evidence,
      })),
      plannerConditionProfiles: plannerConditionProfiles.map((profile) => ({
        id: profile.id,
        evidence: profile.evidence,
      })),
      equipment,
    }
  })
  const conditionProfileIds = [...new Set(scenarios.flatMap((scenario) => (
    scenario.conditionProfiles.map(({ id }) => id)
  )))]
  return {
    version: CAUSAL_ROOT_MPC_DEVELOPMENT_RUNNER_VERSION,
    candidatePlannerVersion: CERTIFICATE_SHIELDED_CAUSAL_ROOT_MPC_VERSION,
    timingSource: resolved.timingSource,
    latencyEvidence: resolved.timingSource === 'system'
      ? 'measured-system-clock'
      : 'inconclusive-injected-clock',
    evidence: CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE,
    dataAccess: {
      seedSource: 'generated-paired-development-seeds-only',
      plannerSeedSource: 'independent-explicit-scenario-id-namespace',
      reservedFinalAccessed: false,
      frozenValidationAccessed: false,
    },
    seedEvidence: {
      environmentPairing: 'baseline-causal-common-environment-seed',
      plannerIsolation: 'independent-fixed-scenario-id-namespace',
      scenarioNamespaces: scenarios.map(({ scenarioId }) => ({
        scenarioId,
        environmentNamespaceId:
          CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES[scenarioId].environmentNamespaceId,
        plannerNamespaceId:
          CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES[scenarioId].plannerNamespaceId,
      })),
    },
    interpretation:
      'Regression-seen exact equipment and assumed condition sensitivity only. Baseline and causal arms share environment seeds, while planner simulations use an independent explicit scenario-id namespace. Outer condition filters only select reported episodes; the planner always sees the scenario complete development sensitivity set. This closed-loop paired development report is not held-out, frozen, reserved-final, promotion, or real-world probability evidence.',
    parameters: {
      scenarioIds: scenarios.map(({ scenarioId }) => scenarioId),
      equipmentProfileIds: resolved.equipmentProfiles.map(({ id }) => id),
      conditionProfileIds,
      seedCountPerConditionProfile: resolved.seedCount,
      maxSteps: resolved.maxSteps,
      plannerSamplesPerProfile: resolved.plannerSamplesPerProfile,
      plannerMaxEpisodeSteps: resolved.plannerMaxEpisodeSteps,
      projectedOuterPairedEpisodes: resolved.projectedOuterPairedEpisodes,
      projectedPlannerEpisodes: resolved.projectedPlannerEpisodes,
      projectedSimulationSteps: resolved.projectedSimulationSteps,
      workloadLimits: {
        seedCountPerConditionProfile: MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_SEED_COUNT,
        maxSteps: MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_STEPS,
        plannerSamplesPerProfile:
          MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_SAMPLES_PER_PROFILE,
        plannerMaxEpisodeSteps:
          MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_EPISODE_STEPS,
        outerPairedEpisodes: MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_OUTER_PAIRED_EPISODES,
        projectedSimulationSteps:
          MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PROJECTED_SIMULATION_STEPS,
      },
    },
    scenarios,
  }
}
