import { performance } from 'node:perf_hooks'
import {
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  ACTION_IDS,
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  NAILS_DEVELOPMENT_CORPUS,
  TARGET_CRAFTER_SPECIALIST_DELINEATION_764,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
  POC_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeResult,
  type EpisodeTraceResult,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'

const standardCrafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}
const profiles = process.argv.includes('--observed-only')
  ? [PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS]
  : [
      ...POC_SENSITIVITY_PROFILES,
      PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
    ]
function numericOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`)
  return value
}

function positiveIntegerOption(name: string, fallback: number): number {
  const value = numericOption(name, fallback)
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

const specialist = process.argv.includes('--specialist')
const compact = process.argv.includes('--compact')
const targetCrafter = specialist ? TARGET_CRAFTER_SPECIALIST_DELINEATION_764 : standardCrafter
const crafter: CrafterProfile = {
  ...targetCrafter,
  craftsmanship: positiveIntegerOption('--craftsmanship', targetCrafter.craftsmanship),
  control: positiveIntegerOption('--control', targetCrafter.control),
  maxCp: positiveIntegerOption('--max-cp', targetCrafter.maxCp),
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
  useSpecialistFinisher: !process.argv.includes('--disable-specialist-finisher'),
  maxFinisherObserves: numericOption(
    '--max-finisher-observes',
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG.maxFinisherObserves,
  ),
  heartAndSoulPreciseMaxInnerQuiet: numericOption(
    '--heart-and-soul-precise-max-iq',
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG.heartAndSoulPreciseMaxInnerQuiet,
  ),
}
const allSeeds = corpusSeeds(NAILS_DEVELOPMENT_CORPUS)
const seedCount = positiveIntegerOption('--seed-count', allSeeds.length)
if (seedCount > allSeeds.length) throw new RangeError(`--seed-count must be no greater than ${allSeeds.length}`)
const seeds = allSeeds.slice(0, seedCount)
const maxSteps = 80

interface EvaluatedEpisode {
  profileId: string
  seed: number
  result: EpisodeResult | EpisodeTraceResult
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
      : runEpisodeTrace({
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
  const actionCounts = (['carefulObservation', 'heartAndSoul', 'quickInnovation', 'observe', 'byregotsBlessing'] as const)
    .reduce<Record<string, number>>((counts, action) => {
      counts[action] = run.episodes.reduce(
        (sum, episode) => sum + episode.result.actions.filter((used) => used === action).length,
        0,
      )
      return counts
    }, {})
  const allActionCounts = (episodes: readonly EvaluatedEpisode[]) => Object.fromEntries(
    ACTION_IDS.map((action) => [
      action,
      episodes.reduce(
        (sum, episode) => sum + episode.result.actions.filter((used) => used === action).length,
        0,
      ),
    ]),
  )
  const cashoutSteps = run.episodes.flatMap((episode) => (
    'steps' in episode.result
      ? episode.result.steps.filter((step) => step.action === 'byregotsBlessing')
      : []
  ))
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
    qualityBands: {
      belowScored: completed.filter(({ result }) => result.finalState.quality < 16440).length,
      oneHundredPoints: completed.filter(({ result }) => result.finalState.quality >= 16440 && result.finalState.quality < 19180).length,
      threeHundredPoints: completed.filter(({ result }) => result.finalState.quality >= 19180 && result.finalState.quality < 24660).length,
      highToBelowMaximum: completed.filter(({ result }) => result.finalState.quality >= 24660 && result.finalState.quality < COSMIC_TITANIUM_NAILS.qualityMax).length,
      maximumQuality: completed.filter(({ result }) => result.finalState.quality >= COSMIC_TITANIUM_NAILS.qualityMax).length,
    },
    qualityTail: {
      atLeast90PercentOfQualityMaximum: completed.filter(({ result }) => result.finalState.quality >= Math.ceil(COSMIC_TITANIUM_NAILS.qualityMax * 0.9)).length,
      atLeast95PercentOfQualityMaximum: completed.filter(({ result }) => result.finalState.quality >= Math.ceil(COSMIC_TITANIUM_NAILS.qualityMax * 0.95)).length,
      atLeast97PercentOfQualityMaximum: completed.filter(({ result }) => result.finalState.quality >= Math.ceil(COSMIC_TITANIUM_NAILS.qualityMax * 0.97)).length,
      atLeast97Point5PercentOfQualityMaximum: completed.filter(({ result }) => result.finalState.quality >= Math.ceil(COSMIC_TITANIUM_NAILS.qualityMax * 0.975)).length,
      maximumQuality: completed.filter(({ result }) => result.finalState.quality >= COSMIC_TITANIUM_NAILS.qualityMax).length,
    },
    actionCounts,
    byregotCashouts: {
      count: cashoutSteps.length,
      onGood: cashoutSteps.filter((step) => step.before.condition === 'good').length,
      withGreatStrides: cashoutSteps.filter((step) => step.before.buffs.greatStrides > 0).length,
      withInnovation: cashoutSteps.filter((step) => step.before.buffs.innovation > 0).length,
      averageQualityGain: cashoutSteps.reduce(
        (sum, step) => sum + step.after.quality - step.before.quality,
        0,
      ) / Math.max(1, cashoutSteps.length),
    },
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
        maximum: profileCompleted.filter(({ result }) => result.finalState.quality >= COSMIC_TITANIUM_NAILS.qualityMax).length,
        ...(compact ? {} : { actionCounts: allActionCounts(episodes) }),
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
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
))

console.log(JSON.stringify({
  policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
  objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
  config: evaluationConfig,
  crafter,
  corpus: NAILS_DEVELOPMENT_CORPUS,
  seedCount,
  maxSteps,
  interpretation: 'Fresh nails development sensitivity only. The player-observed 95-condition marginal is the primary tuning environment; IID replay is not an exact transition model or real-world success probability.',
  nailsSpecific: summarize(nailsSpecific),
}, null, 2))
