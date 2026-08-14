import {
  assertCraftObjective,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  runEpisode,
  type EpisodeRandomStream,
  type EpisodeResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  advanceGuideIntegratedDecisionMemory,
  cloneGuideIntegratedDecisionMemory,
  createGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyController,
  type GuideIntegratedDecisionMemory,
  type GuideIntegratedPolicyConfig,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'
import { compareRouteScores, scoreEpisodes } from './objective'
import type { RouteScore } from './types'

export const GUIDE_CONTINUATION_PLANNER_VERSION = 'guide-continuation-planner-v0.2.0'

export interface GuideContinuationEpisodeOptions {
  recipe: RecipeProfile
  objective: Readonly<CraftObjective>
  crafter: CrafterProfile
  initialState: CraftState
  firstAction: CraftActionId
  startingDecisionMemory?: Readonly<GuideIntegratedDecisionMemory>
  config?: Readonly<GuideIntegratedPolicyConfig>
  random: EpisodeRandomStream
  conditionProfile: WeightedConditionProfile
  maxEpisodeSteps: number
}

export interface GuideContinuationEpisodeResult extends EpisodeResult {
  startingDecisionMemory: GuideIntegratedDecisionMemory
  decisionMemoryAfterFirstAction: GuideIntegratedDecisionMemory
  endingDecisionMemory: GuideIntegratedDecisionMemory
}

export interface GuideContinuationPlannerOptions {
  objective: Readonly<CraftObjective>
  profiles: readonly WeightedConditionProfile[]
  samplesPerProfile: number
  maxEpisodeSteps: number
  seed: number
  startingDecisionMemory?: Readonly<GuideIntegratedDecisionMemory>
  config?: Readonly<GuideIntegratedPolicyConfig>
}

export interface GuideContinuationEndingMemory {
  profileId: string
  sample: number
  pairedSeed: number
  memory: GuideIntegratedDecisionMemory
}

export interface GuideContinuationCompletionOutcome {
  profileId: string
  sample: number
  pairedSeed: number
  completed: boolean
}

export interface GuideContinuationCandidateEvaluation {
  action: CraftActionId
  score: RouteScore
  episodeCount: number
  decisionMemoryAfterAction: GuideIntegratedDecisionMemory
  endingDecisionMemories: readonly GuideContinuationEndingMemory[]
  completionOutcomes: readonly GuideContinuationCompletionOutcome[]
}

export interface GuideContinuationPlan {
  version: typeof GUIDE_CONTINUATION_PLANNER_VERSION
  action: CraftActionId
  score: RouteScore
  alternatives: readonly GuideContinuationCandidateEvaluation[]
  startingDecisionMemory: GuideIntegratedDecisionMemory
  /** Valid when the recommended action is the action actually used. */
  decisionMemoryAfterAction: GuideIntegratedDecisionMemory
  endingDecisionMemories: readonly GuideContinuationEndingMemory[]
  completionOutcomes: readonly GuideContinuationCompletionOutcome[]
  episodeCountPerCandidate: number
  evidence: 'completion-supported' | 'finishability-surrogate'
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function stateAndMemorySeed(
  state: CraftState,
  memory: GuideIntegratedDecisionMemory,
  config: Readonly<GuideIntegratedPolicyConfig>,
): number {
  const serialized = JSON.stringify({ state, memory, config })
  let hash = 0x811c_9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return hash >>> 0
}

/**
 * Runs one root action followed by a fresh guide-integrated controller. The
 * root action is recorded before the continuation is created, so usage limits
 * see the same action that the simulator executes exactly once.
 */
export function runGuideContinuationEpisode(
  options: GuideContinuationEpisodeOptions,
): GuideContinuationEpisodeResult {
  assertCraftObjective(options.recipe, options.objective)
  positiveInteger(options.maxEpisodeSteps, 'maxEpisodeSteps')
  if (options.initialState.terminal !== 'none') throw new Error('initialState must be non-terminal')
  const preview = previewAction(options.recipe, options.crafter, options.initialState, options.firstAction)
  if (
    !preview.legal
    || !isPolicyActionSafe(
      options.recipe,
      options.crafter,
      options.initialState,
      options.firstAction,
      preview,
    )
  ) throw new Error(`first action ${options.firstAction} must be legal and safe`)

  const config = options.config ?? DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG
  const startingDecisionMemory = cloneGuideIntegratedDecisionMemory(
    options.startingDecisionMemory ?? createGuideIntegratedDecisionMemory(),
  )
  const decisionMemoryAfterFirstAction = advanceGuideIntegratedDecisionMemory(
    startingDecisionMemory,
    options.firstAction,
  )
  const controller = createGuideIntegratedPolicyController(
    config,
    decisionMemoryAfterFirstAction,
    options.objective,
  )
  const episode = runEpisode({
    recipe: options.recipe,
    crafter: options.crafter,
    initialState: options.initialState,
    firstAction: options.firstAction,
    policy: controller.policy,
    random: options.random,
    conditionProfile: options.conditionProfile,
    maxSteps: options.maxEpisodeSteps,
  })
  return {
    ...episode,
    startingDecisionMemory,
    decisionMemoryAfterFirstAction,
    endingDecisionMemory: controller.snapshot(),
  }
}

function evaluateCandidate(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  startingDecisionMemory: GuideIntegratedDecisionMemory,
  config: Readonly<GuideIntegratedPolicyConfig>,
  options: GuideContinuationPlannerOptions,
  baseSeed: number,
): GuideContinuationCandidateEvaluation {
  const episodesByProfile = new Map<string, GuideContinuationEpisodeResult[]>()
  const endingDecisionMemories: GuideContinuationEndingMemory[] = []
  const completionOutcomes: GuideContinuationCompletionOutcome[] = []
  for (const [profileIndex, profile] of options.profiles.entries()) {
    const episodes: GuideContinuationEpisodeResult[] = []
    for (let sample = 0; sample < options.samplesPerProfile; sample += 1) {
      const pairedSeed = (baseSeed
        ^ Math.imul(profileIndex + 1, 0x85eb_ca6b)
        ^ Math.imul(sample + 1, 0x9e37_79b1)) >>> 0
      const episode = runGuideContinuationEpisode({
        recipe,
        objective: options.objective,
        crafter,
        initialState: state,
        firstAction: action,
        startingDecisionMemory,
        config,
        random: createEpisodeRandomStream(pairedSeed),
        conditionProfile: profile,
        maxEpisodeSteps: options.maxEpisodeSteps,
      })
      episodes.push(episode)
      endingDecisionMemories.push({
        profileId: profile.id,
        sample,
        pairedSeed,
        memory: episode.endingDecisionMemory,
      })
      completionOutcomes.push({
        profileId: profile.id,
        sample,
        pairedSeed,
        completed: episode.terminal === 'completed',
      })
    }
    episodesByProfile.set(profile.id, episodes)
  }
  return {
    action,
    score: scoreEpisodes(recipe, episodesByProfile, options.objective),
    episodeCount: options.profiles.length * options.samplesPerProfile,
    decisionMemoryAfterAction: advanceGuideIntegratedDecisionMemory(startingDecisionMemory, action),
    endingDecisionMemories,
    completionOutcomes,
  }
}

/**
 * Research-only one-step improvement over the stateful guide continuation.
 * Every legal safe root action receives independent controller memory and an
 * identical hypothetical condition/success stream for each profile/sample.
 * These streams are derived from the supplied research seed, never the live
 * episode random stream.
 */
export function planWithGuideContinuation(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: GuideContinuationPlannerOptions,
): GuideContinuationPlan | null {
  assertCraftObjective(recipe, options.objective)
  if (state.terminal !== 'none') return null
  positiveInteger(options.samplesPerProfile, 'samplesPerProfile')
  positiveInteger(options.maxEpisodeSteps, 'maxEpisodeSteps')
  if (options.profiles.length === 0) throw new Error('profiles must not be empty')

  const startingDecisionMemory = cloneGuideIntegratedDecisionMemory(
    options.startingDecisionMemory ?? createGuideIntegratedDecisionMemory(),
  )
  const config = options.config ?? DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG
  const candidates = legalActions(recipe, crafter, state).filter((action) => {
    const preview = previewAction(recipe, crafter, state, action)
    return isPolicyActionSafe(recipe, crafter, state, action, preview)
  })
  if (candidates.length === 0) return null

  const baseSeed = options.seed ^ stateAndMemorySeed(state, startingDecisionMemory, config)
  const candidateOrder = new Map(candidates.map((action, index) => [action, index]))
  const ranked = candidates
    .map((action) => evaluateCandidate(
      recipe,
      crafter,
      state,
      action,
      startingDecisionMemory,
      config,
      options,
      baseSeed,
    ))
    .sort((left, right) => (
      compareRouteScores(right.score, left.score)
      || (candidateOrder.get(left.action) ?? Number.MAX_SAFE_INTEGER)
        - (candidateOrder.get(right.action) ?? Number.MAX_SAFE_INTEGER)
      || left.action.localeCompare(right.action)
    ))
  const best = ranked[0]
  if (best === undefined) return null
  return {
    version: GUIDE_CONTINUATION_PLANNER_VERSION,
    action: best.action,
    score: best.score,
    alternatives: ranked.slice(1),
    startingDecisionMemory: cloneGuideIntegratedDecisionMemory(startingDecisionMemory),
    decisionMemoryAfterAction: cloneGuideIntegratedDecisionMemory(best.decisionMemoryAfterAction),
    endingDecisionMemories: best.endingDecisionMemories.map((ending) => ({
      ...ending,
      memory: cloneGuideIntegratedDecisionMemory(ending.memory),
    })),
    completionOutcomes: best.completionOutcomes.map((outcome) => ({ ...outcome })),
    episodeCountPerCandidate: best.episodeCount,
    evidence: best.score.averageCompletionRate > 0
      ? 'completion-supported'
      : 'finishability-surrogate',
  }
}
