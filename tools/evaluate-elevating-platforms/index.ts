import { performance } from 'node:perf_hooks'
import {
  ACTIONS,
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  ELEVATING_PLATFORMS_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeResult,
  type EpisodeTraceResult,
} from '@frozen-rabbit-expert/simulator'
import {
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'
import { CRAFT_SCENARIOS } from '../../apps/web/src/scenarios'

function positiveIntegerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? fallback : Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

const seedCount = positiveIntegerOption('--seed-count', 32)
const seeds = Array.from({ length: seedCount }, (_, index) => index + 1)
const scenarios = CRAFT_SCENARIOS.filter((scenario) => (
  scenario.scenarioId === 'hardened-survey-plank'
  || scenario.scenarioId === 'mobile-work-stairs'
))
const maxSteps = 80

interface EvaluatedEpisode {
  conditionProfileId: string
  seed: number
  result: EpisodeResult | EpisodeTraceResult
}

function percentile(samples: readonly number[], fraction: number): number {
  return samples[Math.max(0, Math.ceil(samples.length * fraction) - 1)] ?? 0
}

function equipmentId(crafter: CrafterProfile): string {
  return `${crafter.craftsmanship}/${crafter.control}/${crafter.maxCp}/${crafter.cosmicToolGoodBonus ? 'cosmic' : 'regular'}`
}

const evaluations = scenarios.flatMap((scenario) => scenario.developmentEquipmentProfiles.map((equipment) => {
  if (equipment.specialist) throw new Error('Elevating Platforms evaluation must not include specialist profiles')
  const crafter: CrafterProfile = { level: 100, ...equipment, specialist: false }
  let safetyViolations = 0
  let specialistRecommendations = 0
  const latencies: number[] = []
  const episodes = ELEVATING_PLATFORMS_SENSITIVITY_PROFILES.flatMap((conditionProfile) => (
    seeds.map((seed): EvaluatedEpisode => {
      const policy = createGuideIntegratedPolicyFactory(
        scenario.planner.config,
        scenario.objective,
      )()
      const audited: EpisodePolicy = (recipe, activeCrafter, state) => {
        const startedAt = performance.now()
        const action = policy(recipe, activeCrafter, state)
        latencies.push(performance.now() - startedAt)
        if (action !== null) {
          if (ACTIONS[action].specialistOnly === true) specialistRecommendations += 1
          if (!legalActions(recipe, activeCrafter, state).includes(action)
            || !isPolicyActionSafe(recipe, activeCrafter, state, action)) {
            safetyViolations += 1
          }
        }
        return action
      }
      const initialState = createInitialCraftState(scenario.recipe, crafter)
      const firstAction = audited(scenario.recipe, crafter, initialState)
      const result = firstAction === null
        ? {
            terminal: 'none' as const,
            finalState: initialState,
            actions: [] as CraftActionId[],
            stoppedByLimit: false,
            stopReason: 'policy-null' as const,
          }
        : runEpisodeTrace({
            recipe: scenario.recipe,
            crafter,
            initialState,
            firstAction,
            policy: audited,
            random: createEpisodeRandomStream(seed),
            conditionProfile,
            maxSteps,
          })
      return { conditionProfileId: conditionProfile.id, seed, result }
    })
  ))
  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  const completedQuality = completed.map(({ result }) => result.finalState.quality)
    .sort((left, right) => left - right)
  const sortedLatencies = [...latencies].sort((left, right) => left - right)
  return {
    scenarioId: scenario.scenarioId,
    recipeProfileId: scenario.recipe.profileId,
    policyVersion: scenario.planner.policyVersion,
    equipment: equipmentId(crafter),
    specialist: crafter.specialist,
    episodes: episodes.length,
    completed: completed.length,
    completionRate: completed.length / episodes.length,
    fullQuality: completed.filter(({ result }) => result.finalState.quality >= scenario.objective.qualityTarget).length,
    atLeast90PercentQuality: completed.filter(({ result }) => result.finalState.quality >= Math.ceil(scenario.objective.qualityTarget * 0.9)).length,
    atLeast95PercentQuality: completed.filter(({ result }) => result.finalState.quality >= Math.ceil(scenario.objective.qualityTarget * 0.95)).length,
    completedQuality: {
      minimum: completedQuality[0] ?? 0,
      p10: percentile(completedQuality, 0.1),
      median: percentile(completedQuality, 0.5),
      maximum: completedQuality.at(-1) ?? 0,
    },
    stopReasons: Object.fromEntries([
      'completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit',
    ].map((reason) => [reason, episodes.filter(({ result }) => result.stopReason === reason).length])),
    incompleteExamples: episodes.filter(({ result }) => result.terminal !== 'completed').slice(0, 3).map((episode) => ({
      conditionProfileId: episode.conditionProfileId,
      seed: episode.seed,
      stopReason: episode.result.stopReason,
      finalState: episode.result.finalState,
      actions: episode.result.actions,
    })),
    safetyViolations,
    specialistRecommendations,
    latency: {
      measuredStates: sortedLatencies.length,
      p50Ms: percentile(sortedLatencies, 0.5),
      p95Ms: percentile(sortedLatencies, 0.95),
      maximumMs: sortedLatencies.at(-1) ?? 0,
    },
    byConditionProfile: Object.fromEntries(ELEVATING_PLATFORMS_SENSITIVITY_PROFILES.map((profile) => {
      const profileEpisodes = episodes.filter((episode) => episode.conditionProfileId === profile.id)
      const profileCompleted = profileEpisodes.filter(({ result }) => result.terminal === 'completed')
      return [profile.id, {
        evidence: profile.evidence,
        completed: profileCompleted.length,
        episodes: profileEpisodes.length,
        fullQuality: profileCompleted.filter(({ result }) => result.finalState.quality >= scenario.objective.qualityTarget).length,
      }]
    })),
  }
}))

console.log(JSON.stringify({
  interpretation: 'Non-specialist cross-equipment development sensitivity. Condition weights are assumptions, not official probabilities or real-world success rates. No learned expert/specialist artifact is used.',
  seedCount,
  maxSteps,
  evaluations,
}, null, 2))
