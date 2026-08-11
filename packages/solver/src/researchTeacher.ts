import {
  ACTIONS,
  applyObservedOutcome,
  legalActions,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  POC_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisode,
  type EpisodeResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { POC_GUIDE_TECHNIQUES } from './guideTechniques'
import { guideRolloutAction } from './guideRolloutPolicy'
import { recommendAction } from './recommend'
import type { Recommendation } from './types'

export const RESEARCH_TEACHER_VERSION = 'cosmic-titanium-rollout-teacher-v0.1.0'
export const RESEARCH_TEACHER_PROMOTED = false

export interface ResearchTeacherOptions {
  mechanicsVersion: string
  maxTimeMs?: number
  samplesPerProfile?: number
  maxEpisodeSteps?: number
  seed?: number
  conditionProfiles?: readonly WeightedConditionProfile[]
}

export interface ResearchCandidateMetrics {
  action: CraftActionId
  score: number
  samples: number
  completionRate: number
  failureRate: number
  expectedQuality: number
  lowerTailQuality: number
  expectedCp: number
  expectedDurability: number
}

export interface ResearchTeacherAnalysis {
  engine: 'paired-rollout-teacher'
  version: typeof RESEARCH_TEACHER_VERSION
  durationMs: number
  timedOut: boolean
  requestedSamplesPerProfile: number
  completedPairedRounds: number
  conditionProfiles: string[]
  techniqueCount: number
  candidates: ResearchCandidateMetrics[]
  note: string
}

export interface ResearchTeacherResult {
  recommendation: Recommendation
  analysis: ResearchTeacherAnalysis
}

interface MutableCandidateStats {
  action: CraftActionId
  profileUtilities: Map<string, number[]>
  episodes: EpisodeResult[]
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function stateSeed(state: CraftState): number {
  const values = [state.step, state.progress, state.quality, state.durability, state.cp, state.innerQuiet]
  let hash = 0x811c9dc5
  for (const value of values) {
    hash ^= value
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function prematureCompletion(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
): boolean {
  const preview = previewAction(recipe, crafter, state, action)
  return preview.progressGain > 0
    && state.progress + preview.progressGain >= recipe.progressRequired
    && state.quality < recipe.requiredQuality
}

function rootCandidates(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
): CraftActionId[] {
  const legal = legalActions(recipe, crafter, state)
  let guideGated = legal
  if (state.step === 1) {
    guideGated = legal.filter((action) => action === 'muscleMemory' || action === 'reflect')
  } else if (state.condition === 'malleable' && state.progress / recipe.progressRequired < 0.82) {
    const malleableProgressActions: CraftActionId[] = [
      'rapidSynthesis', 'groundwork', 'carefulSynthesis', 'prudentSynthesis', 'basicSynthesis',
    ]
    guideGated = legal.filter((action) => malleableProgressActions.includes(action))
  } else if (
    state.condition === 'normal'
    && state.durability > 10
    && state.buffs.innovation > 0
    && (state.comboFrom === 'standardTouch' || state.comboFrom === 'observe')
    && legal.includes('advancedTouch')
  ) {
    // A live discounted Advanced Touch route consumes the same Innovation slot
    // as abandoning it. Keep it unless a condition or survival emergency
    // creates a competing opportunity.
    guideGated = ['advancedTouch']
  }
  return guideGated.filter((action) => {
    if (prematureCompletion(recipe, crafter, state, action)) return false
    if (ACTIONS[action].noStep !== true) return true
    if (action !== 'finalAppraisal') return false
    return legalActions(recipe, crafter, state).some((next) => prematureCompletion(recipe, crafter, state, next))
  })
}

function episodeUtility(recipe: RecipeProfile, episode: EpisodeResult): number {
  const state = episode.finalState
  const qualityRatio = Math.min(1, state.quality / recipe.requiredQuality)
  const progressRatio = Math.min(1, state.progress / recipe.progressRequired)
  if (state.terminal === 'completed') {
    return 1_000_000 + state.cp * 45 + Math.max(0, state.durability) * 350 - episode.actions.length * 80
  }
  if (state.terminal === 'failed') {
    return -1_000_000 + qualityRatio * 65_000 + progressRatio * 35_000
  }
  return -180_000
    + Math.min(qualityRatio, progressRatio) * 260_000
    + qualityRatio * 85_000
    + progressRatio * 55_000
    + state.cp * 22
    + Math.max(0, state.durability) * 120
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function finalizeCandidate(
  recipe: RecipeProfile,
  stats: MutableCandidateStats,
): ResearchCandidateMetrics {
  const profileMeans = [...stats.profileUtilities.values()].filter((values) => values.length > 0).map(mean)
  const utilities = [...stats.profileUtilities.values()].flat()
  const episodes = stats.episodes
  const robustUtility = profileMeans.length > 0 ? Math.min(...profileMeans) : -Infinity
  const averageUtility = mean(utilities)
  return {
    action: stats.action,
    score: robustUtility * 0.7 + averageUtility * 0.3,
    samples: episodes.length,
    completionRate: episodes.filter((episode) => episode.terminal === 'completed').length / Math.max(1, episodes.length),
    failureRate: episodes.filter((episode) => episode.terminal === 'failed').length / Math.max(1, episodes.length),
    expectedQuality: mean(episodes.map((episode) => episode.finalState.quality)),
    lowerTailQuality: percentile(episodes.map((episode) => episode.finalState.quality), 0.1),
    expectedCp: mean(episodes.map((episode) => episode.finalState.cp)),
    expectedDurability: mean(episodes.map((episode) => Math.max(0, episode.finalState.durability))),
  }
}

function tradeoff(action: CraftActionId): Recommendation['alternatives'][number]['tradeoff'] {
  const definition = ACTIONS[action]
  if (definition.successRate < 1) return 'higher-variance'
  if (action === 'tricksOfTheTrade') return 'recovers-cp'
  if (definition.category === 'progress') return 'more-progress'
  if (definition.category === 'quality') return 'more-quality'
  if (definition.category === 'repair') return 'preserves-durability'
  if (definition.category === 'buff') return 'setup-next-actions'
  return 'lower-resource-cost'
}

export function recommendWithResearchTeacher(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: ResearchTeacherOptions,
): ResearchTeacherResult | null {
  if (state.terminal !== 'none') return null
  const baseline = recommendAction(recipe, crafter, state, { mechanicsVersion: options.mechanicsVersion })
  if (baseline === null) return null

  const startedAt = now()
  const maxTimeMs = Math.min(9_000, Math.max(250, options.maxTimeMs ?? 4_500))
  const deadline = startedAt + maxTimeMs
  const requestedSamples = Math.max(1, options.samplesPerProfile ?? 16)
  const maxEpisodeSteps = Math.max(8, options.maxEpisodeSteps ?? 40)
  const profiles = options.conditionProfiles ?? POC_SENSITIVITY_PROFILES
  const candidates = rootCandidates(recipe, crafter, state)
  if (candidates.length === 0) return null

  const stats = new Map<CraftActionId, MutableCandidateStats>(candidates.map((action) => [action, {
    action,
    profileUtilities: new Map(profiles.map((profile) => [profile.id, []])),
    episodes: [],
  }]))
  const baseSeed = (options.seed ?? 0x5f37_59df) ^ stateSeed(state)
  let completedPairedRounds = 0
  let timedOut = false

  outer: for (let sample = 0; sample < requestedSamples; sample += 1) {
    for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
      if (now() >= deadline) {
        timedOut = true
        break outer
      }
      const profile = profiles[profileIndex]!
      const pairedSeed = baseSeed ^ Math.imul(sample + 1, 0x9e37_79b1) ^ Math.imul(profileIndex + 1, 0x85eb_ca6b)
      for (const action of candidates) {
        const episode = runEpisode({
          recipe,
          crafter,
          initialState: state,
          firstAction: action,
          policy: guideRolloutAction,
          random: createEpisodeRandomStream(pairedSeed),
          conditionProfile: profile,
          maxSteps: maxEpisodeSteps,
        })
        const candidate = stats.get(action)!
        candidate.episodes.push(episode)
        candidate.profileUtilities.get(profile.id)!.push(episodeUtility(recipe, episode))
      }
    }
    completedPairedRounds += 1
  }

  const ranked = [...stats.values()]
    .map((candidate) => finalizeCandidate(recipe, candidate))
    .sort((a, b) => b.score - a.score || b.completionRate - a.completionRate || a.action.localeCompare(b.action))
  const winner = ranked[0]
  if (!winner) return null

  const nextState = applyObservedOutcome(recipe, crafter, state, winner.action, {
    success: true,
    nextCondition: 'normal',
  }).nextState
  const durationMs = now() - startedAt
  return {
    recommendation: {
      ...baseline,
      action: winner.action,
      alternatives: ranked.slice(1, 3).map((candidate) => ({
        action: candidate.action,
        tradeoff: tradeoff(candidate.action),
      })),
      reasons: ['research-rollout-route'],
      progressFinisher: nextState.terminal === 'completed' ? 'ready' : 'uncertain',
      policyVersion: RESEARCH_TEACHER_VERSION,
    },
    analysis: {
      engine: 'paired-rollout-teacher',
      version: RESEARCH_TEACHER_VERSION,
      durationMs,
      timedOut,
      requestedSamplesPerProfile: requestedSamples,
      completedPairedRounds,
      conditionProfiles: profiles.map((profile) => profile.id),
      techniqueCount: POC_GUIDE_TECHNIQUES.length,
      candidates: ranked.slice(0, 5),
      note: 'Completion rates are sensitivity results across assumed profiles, not recipe-specific probabilities.',
    },
  }
}
