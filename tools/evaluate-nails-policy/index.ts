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
const seeds = corpusSeeds(NAILS_DEVELOPMENT_CORPUS)
const maxSteps = 80

interface EvaluatedEpisode {
  profileId: string
  seed: number
  result: EpisodeResult
}

function runPolicy(policyFactory: () => EpisodePolicy) {
  let safetyViolations = 0
  const latencies: number[] = []
  const initialState = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
  const episodes = profiles.flatMap((profile) => seeds.map((seed): EvaluatedEpisode => {
    const policy = policyFactory()
    const audited: EpisodePolicy = (recipe, activeCrafter, state) => {
      const startedAt = performance.now()
      const action = policy(recipe, activeCrafter, state)
      latencies.push(performance.now() - startedAt)
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
  return { episodes, safetyViolations, latencies }
}

function percentile(samples: readonly number[], fraction: number): number {
  return samples[Math.max(0, Math.ceil(samples.length * fraction) - 1)] ?? 0
}

function summarize(run: ReturnType<typeof runPolicy>) {
  const completed = run.episodes.filter(({ result }) => result.terminal === 'completed')
  const tierCounts = Object.fromEntries(COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers.map((tier) => [
    tier.id,
    completed.filter(({ result }) => result.finalState.quality >= tier.minimumQuality).length,
  ]))
  const sortedLatencies = [...run.latencies].sort((left, right) => left - right)
  return {
    episodes: run.episodes.length,
    completed: completed.length,
    trueFailures: run.episodes.filter(({ result }) => result.terminal === 'failed').length,
    safetyViolations: run.safetyViolations,
    stopReasons: Object.fromEntries([
      'completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit',
    ].map((reason) => [
      reason,
      run.episodes.filter(({ result }) => result.stopReason === reason).length,
    ])),
    qualityTiers: tierCounts,
    averageCompletedQuality: completed.reduce((sum, { result }) => sum + result.finalState.quality, 0)
      / Math.max(1, completed.length),
    averageCompletedCollectability: completed.reduce(
      (sum, { result }) => sum + Math.floor(result.finalState.quality / 10),
      0,
    ) / Math.max(1, completed.length),
    averageCompletedActions: completed.reduce((sum, { result }) => sum + result.actions.length, 0)
      / Math.max(1, completed.length),
    byProfile: Object.fromEntries(profiles.map((profile) => {
      const episodes = run.episodes.filter((episode) => episode.profileId === profile.id)
      const profileCompleted = episodes.filter(({ result }) => result.terminal === 'completed')
      return [profile.id, {
        evidence: profile.evidence,
        completed: profileCompleted.length,
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
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  evaluationObjective,
))

console.log(JSON.stringify({
  policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
  objective: evaluationObjective,
  crafter,
  corpus: NAILS_DEVELOPMENT_CORPUS,
  maxSteps,
  interpretation: 'Fresh nails development sensitivity only. The empirical marginal came from one ingot trace and is not a nails condition oracle.',
  nailsSpecific: summarize(nailsSpecific),
}, null, 2))
