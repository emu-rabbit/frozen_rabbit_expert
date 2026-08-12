import { performance } from 'node:perf_hooks'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, legalActions, type CrafterProfile } from '@frozen-rabbit-expert/domain'
import {
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
  POC_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisode,
  type EpisodePolicy,
  type EpisodeResult,
} from '@frozen-rabbit-expert/simulator'
import {
  CONSISTENT_ROLLOUT_PLANNER_VERSION,
  COMMITTED_CONTINUATION_SELECTOR_VERSION,
  CONSERVATIVE_GUIDE_IMPROVEMENT_GATE_VERSION,
  CONTINUATION_MPC_PLANNER_VERSION,
  GUIDE_CONTINUATION_PLANNER_VERSION,
  GUIDE_INTEGRATED_POLICY_VERSION,
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_CONSERVATIVE_GUIDE_MINIMUM_PAIRED_WINS,
  DEFAULT_CONTINUATION_POPULATION,
  LEGACY_REGRESSION_CORPUS,
  POLICY_EVALUATION_CORPORA,
  POLICY_OBJECTIVE_VERSION,
  ROUTE_OPTION_ROLLOUT_PLANNER_VERSION,
  SCENARIO_BEAM_PLANNER_VERSION,
  TARGET_CRAFTER_722,
  TARGET_CRAFTER_SPECIALIST_DELINEATION_764,
  compareRouteScores,
  applyConservativeGuideImprovementGate,
  createGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyController,
  createGuideIntegratedPolicyFactory,
  createVideoInformedMainlineController,
  createSafetyProjectedPolicy,
  planWithRouteOptionRollouts,
  planWithScenarioBeam,
  planWithContinuationMpc,
  planWithConsistentContinuation,
  planWithGuideContinuation,
  scoreEpisodes,
  targetCrafterSafePolicy,
  type SerializableRouteControllerMemory,
  type GuideIntegratedDecisionMemory,
} from '@frozen-rabbit-expert/policy-lab'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  const value = Number(index >= 0 ? process.argv[index + 1] : fallback)
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`)
  return value
}

function numericArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a finite number`)
  return value
}

function stringArgument<T extends string>(name: string, fallback: T, allowed: readonly T[]): T {
  const index = process.argv.indexOf(`--${name}`)
  const value = (index >= 0 ? process.argv[index + 1] : fallback) as T
  if (!allowed.includes(value)) throw new Error(`--${name} must be one of: ${allowed.join(', ')}`)
  return value
}

function optionalString(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback
}

function seedSeries(count: number, start: number, stride: number): number[] {
  return Array.from({ length: count }, (_, index) => (start + Math.imul(index + 1, stride)) >>> 0)
}

const specialist = process.argv.includes('--specialist')
const targetCrafter = specialist
  ? TARGET_CRAFTER_SPECIALIST_DELINEATION_764
  : TARGET_CRAFTER_722
const crafter: CrafterProfile = {
  ...targetCrafter,
  craftsmanship: argument('craftsmanship', targetCrafter.craftsmanship),
  control: argument('control', targetCrafter.control),
  maxCp: argument('max-cp', targetCrafter.maxCp),
}
const corpusId = optionalString('corpus', LEGACY_REGRESSION_CORPUS.id)
const corpus = POLICY_EVALUATION_CORPORA.find((entry) => entry.id === corpusId)
if (corpus === undefined) {
  throw new Error(`--corpus must be one of: ${POLICY_EVALUATION_CORPORA.map((entry) => entry.id).join(', ')}`)
}
const seedCount = argument('seed-count', corpus.seedsPerConditionProfile)
const seedStart = argument('seed-start', corpus.seedStart)
const samplesPerProfile = argument('planner-samples', 8)
const legacyActionLimit = argument('max-episode-steps', 50)
const outerActionLimit = argument('outer-action-limit', legacyActionLimit)
const rolloutHorizon = argument('rollout-horizon', legacyActionLimit)
const plannerSeed = argument('planner-seed', 0x6f6e_652d)
const beamWidth = argument('beam-width', 48)
const scenariosPerProfile = argument('scenarios-per-profile', 1)
const includeEpisodes = process.argv.includes('--include-episodes')
const evaluationProfiles = process.argv.includes('--observed-only')
  ? [PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS]
  : [...POC_SENSITIVITY_PROFILES]
const guideIntegratedConfig = {
  ...DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  maxManipulation: numericArgument(
    'max-manipulation',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.maxManipulation,
  ),
  maxInnovation: numericArgument(
    'max-innovation',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.maxInnovation,
  ),
  maxGreatStrides: numericArgument(
    'max-great-strides',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.maxGreatStrides,
  ),
  freeQualityCpFloor: numericArgument(
    'free-quality-cp-floor',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.freeQualityCpFloor,
  ),
  balanceTolerance: numericArgument(
    'balance-tolerance',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.balanceTolerance,
  ),
  greatStridesQuality: numericArgument(
    'great-strides-quality',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.greatStridesQuality,
  ),
  useSpecialistFinisher: process.argv.includes('--enable-specialist-finisher'),
  maxFinisherObserves: numericArgument(
    'max-finisher-observes',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.maxFinisherObserves,
  ),
  heartAndSoulPreciseMaxInnerQuiet: numericArgument(
    'heart-and-soul-precise-max-iq',
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.heartAndSoulPreciseMaxInnerQuiet,
  ),
}
const plannerKind = stringArgument(
  'planner',
  'consistent',
  [
    'consistent', 'continuation-mpc', 'committed-continuation', 'route-option',
    'scenario-beam', 'guide-integrated', 'guide-continuation',
    'guide-continuation-gated',
  ] as const,
)
const baselineKind = stringArgument(
  'baseline',
  plannerKind === 'guide-continuation-gated' ? 'guide-integrated' : 'target',
  ['target', 'guide-integrated'] as const,
)
const usesGuideContinuation = plannerKind === 'guide-continuation'
  || plannerKind === 'guide-continuation-gated'
const gateMinimumPairedWins = argument(
  'gate-min-paired-wins',
  DEFAULT_CONSERVATIVE_GUIDE_MINIMUM_PAIRED_WINS,
)
const seeds = seedSeries(seedCount, seedStart, corpus.seedStride)
const continuation = { id: 'target-video-informed-v2', policy: targetCrafterSafePolicy }
const latencySamples: number[] = []
type CandidatePlan = ReturnType<typeof planWithConsistentContinuation>
  | ReturnType<typeof planWithContinuationMpc>
  | ReturnType<typeof planWithRouteOptionRollouts>
  | ReturnType<typeof planWithScenarioBeam>
  | ReturnType<typeof planWithGuideContinuation>
  | ReturnType<typeof applyConservativeGuideImprovementGate>
const planCache = new Map<string, CandidatePlan>()
let openingPlan: CandidatePlan | undefined

function createCandidatePolicy(): EpisodePolicy {
  const guideIntegratedPolicy = createGuideIntegratedPolicyFactory(guideIntegratedConfig)()
  let previousContinuationPolicyId: string | undefined
  let committedContinuation = undefined as (typeof DEFAULT_CONTINUATION_POPULATION)[number] | undefined
  let routeMemory: SerializableRouteControllerMemory | undefined
  let guideDecisionMemory: GuideIntegratedDecisionMemory = createGuideIntegratedDecisionMemory()
  let pendingRouteTransition: {
    before: Parameters<EpisodePolicy>[2]
    action: NonNullable<ReturnType<EpisodePolicy>>
    startingMemory: SerializableRouteControllerMemory
  } | undefined
  let decisionsMade = 0
  return (recipe, profile, state) => {
    if (plannerKind === 'guide-integrated') {
      const started = performance.now()
      decisionsMade += 1
      const action = guideIntegratedPolicy(recipe, profile, state)
      latencySamples.push(performance.now() - started)
      return action
    }
    if (plannerKind === 'route-option' && pendingRouteTransition !== undefined) {
      const controller = createVideoInformedMainlineController(
        { recipe, crafter: profile },
        pendingRouteTransition.before,
        { initialMemory: pendingRouteTransition.startingMemory },
      )
      routeMemory = controller.advance({
        before: pendingRouteTransition.before,
        action: pendingRouteTransition.action,
        success: true,
        after: state,
      })
      pendingRouteTransition = undefined
    }
    if (committedContinuation !== undefined) {
      decisionsMade += 1
      return createSafetyProjectedPolicy(
        committedContinuation.policy,
        targetCrafterSafePolicy,
      )(recipe, profile, state)
    }
    const remainingRolloutHorizon = Math.max(
      1,
      Math.min(rolloutHorizon, outerActionLimit - decisionsMade),
    )
    const key = JSON.stringify({
      plannerKind,
      previousContinuationPolicyId,
      guideDecisionMemory: usesGuideContinuation ? guideDecisionMemory : undefined,
      routeMemory: plannerKind === 'route-option' ? routeMemory : undefined,
      remainingRolloutHorizon,
      state,
    })
    let plan = planCache.get(key)
    if (plan === undefined) {
      const started = performance.now()
      plan = plannerKind === 'consistent'
        ? planWithConsistentContinuation(recipe, profile, state, {
            profiles: POC_SENSITIVITY_PROFILES,
            continuation,
            samplesPerProfile,
            maxEpisodeSteps: remainingRolloutHorizon,
            seed: plannerSeed,
          })
        : plannerKind === 'route-option'
          ? planWithRouteOptionRollouts({ recipe, crafter: profile }, state, {
              profiles: POC_SENSITIVITY_PROFILES,
              samplesPerProfile,
              maxEpisodeActions: remainingRolloutHorizon,
              seed: plannerSeed,
              ...(routeMemory === undefined ? {} : { initialMemory: routeMemory }),
            })
          : usesGuideContinuation
            ? (() => {
                const continuationPlan = planWithGuideContinuation(recipe, profile, state, {
                  profiles: POC_SENSITIVITY_PROFILES,
                  samplesPerProfile,
                  maxEpisodeSteps: remainingRolloutHorizon,
                  seed: plannerSeed,
                  startingDecisionMemory: guideDecisionMemory,
                  ...(baselineKind === 'guide-integrated'
                    || plannerKind === 'guide-continuation-gated'
                    ? { config: guideIntegratedConfig }
                    : {}),
                })
                if (plannerKind !== 'guide-continuation-gated' || continuationPlan === null) {
                  return continuationPlan
                }
                const guideController = createGuideIntegratedPolicyController(
                  guideIntegratedConfig,
                  guideDecisionMemory,
                )
                const guideAction = guideController.policy(recipe, profile, state)
                return guideAction === null
                  ? null
                  : applyConservativeGuideImprovementGate(continuationPlan, guideAction, {
                      minimumPairedCandidateOnlyWins: gateMinimumPairedWins,
                    })
              })()
          : plannerKind === 'scenario-beam'
            ? planWithScenarioBeam({ recipe, crafter: profile }, state, {
                profiles: POC_SENSITIVITY_PROFILES,
                scenariosPerProfile,
                beamWidth,
                maxActions: remainingRolloutHorizon,
                seed: plannerSeed,
              })
            : planWithContinuationMpc(recipe, profile, state, {
                profiles: POC_SENSITIVITY_PROFILES,
                continuations: DEFAULT_CONTINUATION_POPULATION,
                samplesPerProfile,
                maxEpisodeSteps: remainingRolloutHorizon,
                seed: plannerSeed,
                continuationFallbackPolicy: targetCrafterSafePolicy,
                ...(previousContinuationPolicyId === undefined ? {} : { previousContinuationPolicyId }),
              })
      latencySamples.push(performance.now() - started)
      planCache.set(key, plan)
    }
    if (plannerKind === 'continuation-mpc' && plan !== null) {
      previousContinuationPolicyId = plan.continuationPolicyId
    }
    if (plannerKind === 'committed-continuation' && plan !== null) {
      committedContinuation = DEFAULT_CONTINUATION_POPULATION.find(
        (entry) => entry.id === plan!.continuationPolicyId,
      )
      if (committedContinuation === undefined) {
        throw new Error(`missing continuation: ${plan.continuationPolicyId}`)
      }
    }
    if (plannerKind === 'route-option' && plan !== null) {
      pendingRouteTransition = {
        before: state,
        action: plan.action,
        startingMemory: plan.startingMemory,
      }
    }
    if (usesGuideContinuation && plan !== null) {
      guideDecisionMemory = plan.decisionMemoryAfterAction
    }
    if (state.step === 1 && openingPlan === undefined) openingPlan = plan
    decisionsMade += 1
    if (plan !== null) return plan.action
    if (usesGuideContinuation && (
      baselineKind === 'guide-integrated'
      || plannerKind === 'guide-continuation-gated'
    )) {
      const fallbackController = createGuideIntegratedPolicyController(
        guideIntegratedConfig,
        guideDecisionMemory,
      )
      const fallbackAction = fallbackController.policy(recipe, profile, state)
      guideDecisionMemory = fallbackController.snapshot()
      return fallbackAction
    }
    return targetCrafterSafePolicy(recipe, profile, state)
  }
}

/** Every evaluation episode calls this factory independently. In particular,
 * the guide-integrated baseline must never share mutable decision memory across
 * paired seeds or condition profiles. */
function createBaselinePolicy(): EpisodePolicy {
  return baselineKind === 'guide-integrated'
    ? createGuideIntegratedPolicyFactory(guideIntegratedConfig)()
    : targetCrafterSafePolicy
}

interface EvaluatedEpisode {
  profileId: string
  seed: number
  result: EpisodeResult
}

interface EvaluatedRun {
  episodes: EvaluatedEpisode[]
  safetyViolations: number
}

function runPolicy(policyFactory: () => EpisodePolicy): EvaluatedRun {
  const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
  let safetyViolations = 0
  const episodes = evaluationProfiles.flatMap((conditionProfile) => seeds.map((seed) => {
    const policy = policyFactory()
    const auditedPolicy: EpisodePolicy = (recipe, profile, state) => {
      const action = policy(recipe, profile, state)
      if (action !== null && (
        !legalActions(recipe, profile, state).includes(action)
        || !isPolicyActionSafe(recipe, profile, state, action)
      )) safetyViolations += 1
      return action
    }
    const firstAction = auditedPolicy(COSMIC_TITANIUM_INGOT, crafter, initialState)
    const result = firstAction === null
      ? {
          terminal: 'none' as const,
          finalState: initialState,
          actions: [],
          stoppedByLimit: false,
          stopReason: legalActions(COSMIC_TITANIUM_INGOT, crafter, initialState).length === 0
            ? 'no-legal-action' as const
            : 'policy-null' as const,
        }
      : runEpisode({
          recipe: COSMIC_TITANIUM_INGOT,
          crafter,
          initialState,
          firstAction,
          policy: auditedPolicy,
          random: createEpisodeRandomStream(seed),
          conditionProfile,
          maxSteps: outerActionLimit,
        })
    return { profileId: conditionProfile.id, seed, result }
  }))
  return { episodes, safetyViolations }
}

function summarize(run: EvaluatedRun) {
  const { episodes } = run
  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  const episodesByProfile = new Map(evaluationProfiles.map((profile) => [
    profile.id,
    episodes.filter((episode) => episode.profileId === profile.id).map((episode) => episode.result),
  ]))
  const stopReasons = Object.fromEntries([
    'completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit',
  ].map((reason) => [reason, episodes.filter(({ result }) => result.stopReason === reason).length]))
  return {
    episodes: episodes.length,
    completed: completed.length,
    safetyViolations: run.safetyViolations,
    stopReasons,
    routeScore: scoreEpisodes(COSMIC_TITANIUM_INGOT, episodesByProfile),
    byProfile: Object.fromEntries(evaluationProfiles.map((profile) => {
      const profileEpisodes = episodes.filter((episode) => episode.profileId === profile.id)
      return [profile.id, {
        completed: profileEpisodes.filter(({ result }) => result.terminal === 'completed').length,
        episodes: profileEpisodes.length,
      }]
    })),
    averageProgressRatio: episodes.reduce((sum, { result }) => (
      sum + result.finalState.progress / COSMIC_TITANIUM_INGOT.progressRequired
    ), 0) / Math.max(1, episodes.length),
    averageQualityRatio: episodes.reduce((sum, { result }) => (
      sum + result.finalState.quality / COSMIC_TITANIUM_INGOT.requiredQuality
    ), 0) / Math.max(1, episodes.length),
    ...(includeEpisodes ? {
      episodeDetails: episodes.map(({ profileId, seed, result }) => ({
        profileId,
        seed,
        terminal: result.terminal,
        stopReason: result.stopReason,
        actions: result.actions,
        finalState: result.finalState,
      })),
    } : {}),
  }
}

const baselineRun = runPolicy(createBaselinePolicy)
const candidateRun = runPolicy(createCandidatePolicy)
const baselineByKey = new Map(baselineRun.episodes.map((episode) => [`${episode.profileId}:${episode.seed}`, episode]))
let candidateOnlyWins = 0
let baselineOnlyWins = 0
for (const episode of candidateRun.episodes) {
  const baseline = baselineByKey.get(`${episode.profileId}:${episode.seed}`)!
  if (episode.result.terminal === 'completed' && baseline.result.terminal !== 'completed') candidateOnlyWins += 1
  if (episode.result.terminal !== 'completed' && baseline.result.terminal === 'completed') baselineOnlyWins += 1
}
latencySamples.sort((left, right) => left - right)
const percentile = (fraction: number): number => (
  latencySamples[Math.max(0, Math.ceil(latencySamples.length * fraction) - 1)] ?? 0
)
const baselineSummary = summarize(baselineRun)
const candidateSummary = summarize(candidateRun)
const conservativeGateDecisions = [...planCache.values()].flatMap((plan) => (
  plan !== null && 'gate' in plan ? [plan.gate] : []
))

console.log(JSON.stringify({
  plannerKind,
  baselineKind,
  baselineVersion: baselineKind === 'guide-integrated'
    ? GUIDE_INTEGRATED_POLICY_VERSION
    : 'target-video-informed-v2',
  plannerVersion: plannerKind === 'consistent'
    ? CONSISTENT_ROLLOUT_PLANNER_VERSION
    : plannerKind === 'route-option'
      ? ROUTE_OPTION_ROLLOUT_PLANNER_VERSION
      : plannerKind === 'scenario-beam'
        ? SCENARIO_BEAM_PLANNER_VERSION
        : usesGuideContinuation
          ? GUIDE_CONTINUATION_PLANNER_VERSION
        : plannerKind === 'guide-integrated'
          ? GUIDE_INTEGRATED_POLICY_VERSION
        : plannerKind === 'continuation-mpc'
          ? CONTINUATION_MPC_PLANNER_VERSION
          : COMMITTED_CONTINUATION_SELECTOR_VERSION,
  objectiveVersion: POLICY_OBJECTIVE_VERSION,
  conservativeGuideGateVersion: plannerKind === 'guide-continuation-gated'
    ? CONSERVATIVE_GUIDE_IMPROVEMENT_GATE_VERSION
    : null,
  recipeProfileId: COSMIC_TITANIUM_INGOT.profileId,
  crafter,
  guideIntegratedConfig,
  corpus: {
    id: corpus.id,
    role: corpus.role,
    note: corpus.note,
    seedCount,
    seedStart,
    seedStride: corpus.seedStride,
    seedOverrides: seedCount !== corpus.seedsPerConditionProfile || seedStart !== corpus.seedStart,
    conditionProfiles: evaluationProfiles.map((profile) => ({
      id: profile.id,
      evidence: profile.evidence,
    })),
  },
  plannerBudget: {
    samplesPerProfile,
    rolloutHorizon,
    outerActionLimit,
    plannerSeed,
    beamWidth: plannerKind === 'scenario-beam' ? beamWidth : null,
    scenariosPerProfile: plannerKind === 'scenario-beam' ? scenariosPerProfile : null,
    gateMinimumPairedWins: plannerKind === 'guide-continuation-gated'
      ? gateMinimumPairedWins
      : null,
    continuationCount: plannerKind === 'consistent'
      ? 1
      : plannerKind === 'route-option'
        || plannerKind === 'scenario-beam'
        || plannerKind === 'guide-integrated'
        || usesGuideContinuation
        ? null
        : DEFAULT_CONTINUATION_POPULATION.length,
    fallbackPolicyId: continuation.id,
  },
  openingPlan: openingPlan === undefined ? null : openingPlan,
  baseline: baselineSummary,
  candidate: candidateSummary,
  objectiveComparison: compareRouteScores(candidateSummary.routeScore, baselineSummary.routeScore),
  paired: { candidateOnlyWins, baselineOnlyWins, netWins: candidateOnlyWins - baselineOnlyWins },
  latency: {
    measuredStates: latencySamples.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: latencySamples.at(-1) ?? 0,
  },
  planEvidence: {
    evaluatedStates: planCache.size,
    completionSupportedStates: [...planCache.values()].filter((plan) => (
      plan?.evidence === 'completion-supported' || plan?.evidence === 'sampled-completion'
    )).length,
    finishabilitySurrogateStates: [...planCache.values()].filter((plan) => (
      plan?.evidence === 'finishability-surrogate' || plan?.evidence === 'sampled-potential'
    )).length,
    evidenceCounts: Object.fromEntries(
      [...planCache.values()].flatMap((plan) => plan === null ? [] : [plan.evidence])
        .reduce((counts, evidence) => counts.set(evidence, (counts.get(evidence) ?? 0) + 1), new Map<string, number>()),
    ),
    nullPlanStates: [...planCache.values()].filter((plan) => plan === null).length,
    conservativeGuideGate: plannerKind === 'guide-continuation-gated'
      ? {
          gatedStates: conservativeGateDecisions.length,
          deviations: conservativeGateDecisions.filter((gate) => gate.deviatedFromGuide).length,
          reasonCounts: Object.fromEntries(
            conservativeGateDecisions.reduce((counts, gate) => (
              counts.set(gate.reason, (counts.get(gate.reason) ?? 0) + 1)
            ), new Map<string, number>()),
          ),
        }
      : null,
  },
  interpretation: process.argv.includes('--observed-only')
    ? 'Player-observed 95-condition marginal sensitivity; IID replay is not an exact transition model or real-world success probability.'
    : 'Assumed-profile stress sensitivity; not a recipe-specific real-world success probability.',
}, null, 2))
