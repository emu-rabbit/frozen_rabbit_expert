import { performance } from 'node:perf_hooks'
import {
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  NAILS_DEVELOPMENT_CORPUS,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
  POC_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisode,
  type EpisodePolicy,
  type EpisodeResult,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}
const profiles = [
  ...POC_SENSITIVITY_PROFILES,
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
] as const
function numericOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`)
  return value
}

const qualityTargetIndex = process.argv.indexOf('--quality-target')
const requestedQualityTarget = qualityTargetIndex >= 0
  ? Number(process.argv[qualityTargetIndex + 1])
  : COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget
if (!Number.isInteger(requestedQualityTarget) || requestedQualityTarget <= 0 || requestedQualityTarget > COSMIC_TITANIUM_NAILS.qualityMax) {
  throw new RangeError('--quality-target must be a positive integer no greater than qualityMax')
}
const evaluationObjective = {
  ...COSMIC_TITANIUM_NAILS_OBJECTIVE,
  qualityTarget: requestedQualityTarget,
}
const evaluationConfig = {
  ...DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  progressFloorBeforeQuality: numericOption(
    '--progress-floor',
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG.progressFloorBeforeQuality,
  ),
  maxManipulation: numericOption(
    '--max-manipulation',
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG.maxManipulation,
  ),
  maxInnovation: numericOption(
    '--max-innovation',
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG.maxInnovation,
  ),
  freeQualityCpFloor: numericOption(
    '--free-quality-cp-floor',
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG.freeQualityCpFloor,
  ),
  greatStridesQuality: numericOption(
    '--great-strides-quality',
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG.greatStridesQuality,
  ),
}
const seeds = corpusSeeds(NAILS_DEVELOPMENT_CORPUS)
const maxSteps = 80

interface EvaluatedEpisode {
  profileId: string
  seed: number
  result: EpisodeResult
}

function runPolicy(policyFactory: () => EpisodePolicy) {
  let safetyViolations = 0
  let finalAppraisalRecommendations = 0
  let observeRecommendations = 0
  let lowResourceInnovationRecommendations = 0
  const latencies: number[] = []
  const initialState = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
  const episodes = profiles.flatMap((profile) => seeds.map((seed): EvaluatedEpisode => {
    const policy = policyFactory()
    const audited: EpisodePolicy = (recipe, activeCrafter, state) => {
      const startedAt = performance.now()
      const action = policy(recipe, activeCrafter, state)
      latencies.push(performance.now() - startedAt)
      if (action === 'finalAppraisal') finalAppraisalRecommendations += 1
      if (action === 'observe') observeRecommendations += 1
      if (action === 'innovation' && state.innerQuiet < 2 && state.cp < 56) {
        lowResourceInnovationRecommendations += 1
      }
      if (action !== null && (
        !legalActions(recipe, activeCrafter, state).includes(action)
        || !isPolicyActionSafe(recipe, activeCrafter, state, action)
      )) safetyViolations += 1
      return action
    }
    const firstAction = audited(COSMIC_TITANIUM_NAILS, crafter, initialState)
    const result = firstAction === null
      ? {
          terminal: 'none' as const,
          finalState: initialState,
          actions: [] as CraftActionId[],
          stoppedByLimit: false,
          stopReason: 'policy-null' as const,
        }
      : runEpisode({
          recipe: COSMIC_TITANIUM_NAILS,
          crafter,
          initialState,
          firstAction,
          policy: audited,
          random: createEpisodeRandomStream(seed),
          conditionProfile: profile,
          maxSteps,
        })
    return { profileId: profile.id, seed, result }
  }))
  return {
    episodes,
    safetyViolations,
    latencies,
    finalAppraisalRecommendations,
    observeRecommendations,
    lowResourceInnovationRecommendations,
  }
}

function percentile(samples: readonly number[], fraction: number): number {
  return samples[Math.max(0, Math.ceil(samples.length * fraction) - 1)] ?? 0
}

function summarize(run: ReturnType<typeof runPolicy>) {
  const completed = run.episodes.filter(({ result }) => result.terminal === 'completed')
  const completedQuality = completed
    .map(({ result }) => result.finalState.quality)
    .sort((left, right) => left - right)
  const tierCounts = Object.fromEntries(COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers.map((tier) => [
    tier.id,
    completed.filter(({ result }) => result.finalState.quality >= tier.minimumQuality).length,
  ]))
  const sortedLatencies = [...run.latencies].sort((left, right) => left - right)
  return {
    episodes: run.episodes.length,
    completed: completed.length,
    completionRate: completed.length / run.episodes.length,
    trueFailures: run.episodes.filter(({ result }) => result.terminal === 'failed').length,
    safetyViolations: run.safetyViolations,
    suspiciousEndgameRecommendations: {
      finalAppraisal: run.finalAppraisalRecommendations,
      observe: run.observeRecommendations,
      lowResourceInnovation: run.lowResourceInnovationRecommendations,
    },
    stopReasons: Object.fromEntries([
      'completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit',
    ].map((reason) => [
      reason,
      run.episodes.filter(({ result }) => result.stopReason === reason).length,
    ])),
    qualityTiers: tierCounts,
    completedQuality: {
      minimum: completedQuality[0] ?? 0,
      p10: percentile(completedQuality, 0.1),
      p25: percentile(completedQuality, 0.25),
      median: percentile(completedQuality, 0.5),
      p75: percentile(completedQuality, 0.75),
      p90: percentile(completedQuality, 0.9),
      maximum: completedQuality.at(-1) ?? 0,
    },
    averageCompletedQuality: completed.reduce((sum, { result }) => sum + result.finalState.quality, 0)
      / Math.max(1, completed.length),
    completionWeightedQuality: completed.reduce(
      (sum, { result }) => sum + result.finalState.quality,
      0,
    ) / run.episodes.length,
    averageCompletedCollectability: completed.reduce(
      (sum, { result }) => sum + Math.floor(result.finalState.quality / 10),
      0,
    ) / Math.max(1, completed.length),
    averageCompletedActions: completed.reduce((sum, { result }) => sum + result.actions.length, 0)
      / Math.max(1, completed.length),
    byProfile: Object.fromEntries(profiles.map((profile) => {
      const episodes = run.episodes.filter((episode) => episode.profileId === profile.id)
      const profileCompleted = episodes.filter(({ result }) => result.terminal === 'completed')
      const profileQuality = profileCompleted
        .map(({ result }) => result.finalState.quality)
        .sort((left, right) => left - right)
      return [profile.id, {
        evidence: profile.evidence,
        completed: profileCompleted.length,
        completionRate: profileCompleted.length / episodes.length,
        medianCompletedQuality: percentile(profileQuality, 0.5),
        averageCompletedQuality: profileCompleted.reduce(
          (sum, { result }) => sum + result.finalState.quality,
          0,
        ) / Math.max(1, profileCompleted.length),
        completionWeightedQuality: profileCompleted.reduce(
          (sum, { result }) => sum + result.finalState.quality,
          0,
        ) / episodes.length,
        highTier: profileCompleted.filter(({ result }) => result.finalState.quality >= 24660).length,
        maximum: profileCompleted.filter(({ result }) => result.finalState.quality >= 27400).length,
        episodes: episodes.length,
      }]
    })),
    latency: {
      measuredStates: sortedLatencies.length,
      p50Ms: percentile(sortedLatencies, 0.5),
      p95Ms: percentile(sortedLatencies, 0.95),
      p99Ms: percentile(sortedLatencies, 0.99),
      maxMs: sortedLatencies.at(-1) ?? 0,
    },
  }
}

const nailsSpecific = runPolicy(createGuideIntegratedPolicyFactory(
  evaluationConfig,
  evaluationObjective,
))

console.log(JSON.stringify({
  policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
  objective: evaluationObjective,
  config: evaluationConfig,
  crafter,
  corpus: NAILS_DEVELOPMENT_CORPUS,
  maxSteps,
  interpretation: 'Fresh nails development sensitivity only. The empirical marginal came from one ingot trace and is not a nails condition oracle.',
  nailsSpecific: summarize(nailsSpecific),
}, null, 2))
