import {
  applyObservedOutcome,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  assertConditionProfileCompatible,
  drawSimulatedActionOutcome,
  type EpisodeRandomStream,
  type EpisodeResult,
  type EpisodeStopReason,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { compareRouteScores, scoreEpisodes } from './objective'
import {
  createVideoInformedMainlineController,
  type PlannerContext,
  type RouteOptionActionCandidate,
  type RouteOptionId,
  type SerializableRouteControllerMemory,
  type VideoInformedMainlineControllerOptions,
} from './routeOptionController'
import type { RouteScore } from './types'

export const ROUTE_OPTION_ROLLOUT_PLANNER_VERSION = 'route-option-rollout-planner-v0.2.0'

export type RouteOptionControllerTuning = Omit<
  VideoInformedMainlineControllerOptions,
  'initialMemory' | 'initialOptionId'
>

export interface RouteOptionEpisodeOptions {
  context: PlannerContext
  initialState: CraftState
  initialMemory?: SerializableRouteControllerMemory
  firstAction?: CraftActionId
  controllerOptions?: RouteOptionControllerTuning
  random: EpisodeRandomStream
  conditionProfile: WeightedConditionProfile
  maxActions: number
}

export interface RouteOptionEpisodeResult extends EpisodeResult {
  controllerMemory: SerializableRouteControllerMemory
}

export interface RouteOptionRolloutPlannerOptions {
  profiles: readonly WeightedConditionProfile[]
  samplesPerProfile: number
  maxEpisodeActions: number
  seed: number
  initialMemory?: SerializableRouteControllerMemory
  controllerOptions?: RouteOptionControllerTuning
}

export interface RouteOptionCandidateEvaluation {
  optionId: RouteOptionId
  action: CraftActionId
  score: RouteScore
  episodeCount: number
}

export interface RouteOptionRolloutPlan {
  version: typeof ROUTE_OPTION_ROLLOUT_PLANNER_VERSION
  optionId: RouteOptionId
  action: CraftActionId
  score: RouteScore
  alternatives: RouteOptionCandidateEvaluation[]
  startingMemory: SerializableRouteControllerMemory
  remainingOptionActions: number
  episodeCountPerCandidate: number
  evidence: 'completion-supported' | 'finishability-surrogate'
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function controllerFor(
  context: PlannerContext,
  state: CraftState,
  initialMemory: SerializableRouteControllerMemory | undefined,
  controllerOptions: RouteOptionControllerTuning | undefined,
) {
  return createVideoInformedMainlineController(context, state, {
    ...controllerOptions,
    ...(initialMemory === undefined ? {} : { initialMemory }),
  })
}

function stoppedResult(
  state: CraftState,
  actions: CraftActionId[],
  stopReason: EpisodeStopReason,
  controllerMemory: SerializableRouteControllerMemory,
): RouteOptionEpisodeResult {
  return {
    terminal: state.terminal,
    finalState: state,
    actions,
    stoppedByLimit: state.terminal === 'none' && stopReason === 'action-limit',
    stopReason,
    controllerMemory,
  }
}

/**
 * Research-only episode adapter for the stateful route controller. The
 * controller is recreated from a memory snapshot for every rollout, and its
 * budget advances exactly once after each observed transition.
 */
export function runRouteOptionEpisode(options: RouteOptionEpisodeOptions): RouteOptionEpisodeResult {
  const maxActions = positiveInteger(options.maxActions, 'maxActions')
  assertConditionProfileCompatible(options.context.recipe, options.conditionProfile)
  const controller = controllerFor(
    options.context,
    options.initialState,
    options.initialMemory,
    options.controllerOptions,
  )
  let state = options.initialState
  const actions: CraftActionId[] = []
  const opening = controller.decide(state)
  let nextAction = options.firstAction ?? opening.action

  if (state.terminal !== 'none') {
    return stoppedResult(state, actions, state.terminal, controller.snapshot())
  }
  if (nextAction === null) {
    const stopReason = legalActions(options.context.recipe, options.context.crafter, state).length === 0
      ? 'no-legal-action'
      : 'policy-null'
    return stoppedResult(state, actions, stopReason, controller.snapshot())
  }
  if (
    options.firstAction !== undefined
    && !opening.candidates.some((candidate) => candidate.action === options.firstAction)
  ) throw new Error(`first action ${options.firstAction} is not an active-option candidate`)

  while (state.terminal === 'none' && actions.length < maxActions) {
    const preview = previewAction(options.context.recipe, options.context.crafter, state, nextAction)
    if (!preview.legal) {
      return stoppedResult(state, actions, 'illegal-action', controller.snapshot())
    }

    const { success, nextCondition } = drawSimulatedActionOutcome(
      preview,
      state,
      options.conditionProfile,
      options.random,
    )
    const before = state
    state = applyObservedOutcome(
      options.context.recipe,
      options.context.crafter,
      state,
      nextAction,
      { success, nextCondition },
    ).nextState
    actions.push(nextAction)
    controller.advance({ before, action: nextAction, success, after: state })

    if (state.terminal !== 'none') {
      return stoppedResult(state, actions, state.terminal, controller.snapshot())
    }
    if (actions.length >= maxActions) {
      return stoppedResult(state, actions, 'action-limit', controller.snapshot())
    }
    const decision = controller.decide(state)
    if (decision.action === null) {
      const stopReason = legalActions(options.context.recipe, options.context.crafter, state).length === 0
        ? 'no-legal-action'
        : 'policy-null'
      return stoppedResult(state, actions, stopReason, controller.snapshot())
    }
    nextAction = decision.action
  }

  return stoppedResult(state, actions, 'action-limit', controller.snapshot())
}

function stateAndRouteSeed(state: CraftState, memory: SerializableRouteControllerMemory): number {
  const serialized = JSON.stringify({ state, memory })
  let hash = 0x811c_9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return hash >>> 0
}

function evaluateCandidate(
  context: PlannerContext,
  state: CraftState,
  startingMemory: SerializableRouteControllerMemory,
  candidate: RouteOptionActionCandidate,
  options: RouteOptionRolloutPlannerOptions,
  baseSeed: number,
): RouteOptionCandidateEvaluation {
  const episodesByProfile = new Map<string, RouteOptionEpisodeResult[]>()
  for (const [profileIndex, profile] of options.profiles.entries()) {
    const episodes: RouteOptionEpisodeResult[] = []
    for (let sample = 0; sample < options.samplesPerProfile; sample += 1) {
      const pairedSeed = baseSeed
        ^ Math.imul(profileIndex + 1, 0x85eb_ca6b)
        ^ Math.imul(sample + 1, 0x9e37_79b1)
      episodes.push(runRouteOptionEpisode({
        context,
        initialState: state,
        initialMemory: startingMemory,
        firstAction: candidate.action,
        ...(options.controllerOptions === undefined
          ? {}
          : { controllerOptions: options.controllerOptions }),
        random: createEpisodeRandomStream(pairedSeed),
        conditionProfile: profile,
        maxActions: options.maxEpisodeActions,
      }))
    }
    episodesByProfile.set(profile.id, episodes)
  }
  return {
    optionId: startingMemory.activeOption.optionId,
    action: candidate.action,
    score: scoreEpisodes(context.recipe, episodesByProfile, context.objective),
    episodeCount: options.profiles.length * options.samplesPerProfile,
  }
}

/** Fixed-budget root improvement over one committed option continuation. */
export function planWithRouteOptionRollouts(
  context: PlannerContext,
  state: CraftState,
  options: RouteOptionRolloutPlannerOptions,
): RouteOptionRolloutPlan | null {
  if (state.terminal !== 'none') return null
  positiveInteger(options.samplesPerProfile, 'samplesPerProfile')
  positiveInteger(options.maxEpisodeActions, 'maxEpisodeActions')
  if (options.profiles.length === 0) throw new Error('profiles must not be empty')
  const profileIds = new Set<string>()
  for (const profile of options.profiles) {
    assertConditionProfileCompatible(context.recipe, profile)
    if (profileIds.has(profile.id)) throw new Error(`duplicate condition profile id: ${profile.id}`)
    profileIds.add(profile.id)
  }

  const probe = controllerFor(context, state, options.initialMemory, options.controllerOptions)
  const decision = probe.decide(state)
  if (decision.action === null || decision.candidates.length === 0) return null
  const startingMemory = decision.memory
  const baseSeed = options.seed ^ stateAndRouteSeed(state, startingMemory)
  const candidateOrder = new Map(decision.candidates.map((candidate, index) => [candidate.action, index]))
  const ranked = decision.candidates
    .map((candidate) => evaluateCandidate(context, state, startingMemory, candidate, options, baseSeed))
    .sort((left, right) => (
      compareRouteScores(right.score, left.score)
      || (candidateOrder.get(left.action) ?? Number.MAX_SAFE_INTEGER)
        - (candidateOrder.get(right.action) ?? Number.MAX_SAFE_INTEGER)
      || left.action.localeCompare(right.action)
    ))
  const best = ranked[0]
  if (!best) return null
  return {
    version: ROUTE_OPTION_ROLLOUT_PLANNER_VERSION,
    optionId: best.optionId,
    action: best.action,
    score: best.score,
    alternatives: ranked.slice(1),
    startingMemory,
    remainingOptionActions: Math.max(
      0,
      startingMemory.activeOption.actionBudget - startingMemory.activeOption.actionsUsed,
    ),
    episodeCountPerCandidate: best.episodeCount,
    evidence: best.score.averageCompletionRate > 0
      ? 'completion-supported'
      : 'finishability-surrogate',
  }
}
