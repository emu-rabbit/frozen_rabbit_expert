import {
  applyObservedOutcome,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  assertConditionProfileCompatible,
  createEpisodeRandomStream,
  drawSimulatedActionOutcome,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { assertPlannerContext, type PlannerContext } from './routeOptionController'
import { scenarioBeamStateIdentityKey, scenarioBeamStatePotential } from './scenarioBeamPlanner'

export const FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION = 'fixed-tape-clairvoyant-search-v0.1.0'

export interface FixedTapeClairvoyantSearchOptions {
  conditionProfile: WeightedConditionProfile
  seed: number
  beamWidth: number
  maxActions: number
  incumbentActions?: readonly CraftActionId[]
}

export interface FixedTapeRouteWitness {
  actions: readonly CraftActionId[]
  finalState: CraftState
  objectiveTargetReached: boolean
  successDrawsConsumed: number
  conditionDrawsConsumed: number
}

export interface FixedTapeClairvoyantSearchResult {
  version: typeof FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION
  evidence: 'clairvoyant-fixed-tape-feasible-witness-not-causal-policy'
  seed: number
  beamWidth: number
  maxActions: number
  witness: FixedTapeRouteWitness | null
  bestOpenState: CraftState | null
  objectiveTargetReachable: boolean
  completionReachable: boolean
  objectiveScoreSaturated: boolean
  frontierTruncated: boolean
  exhaustiveWithinFixedTapeHorizon: boolean
  stoppedAtObjectiveTarget: boolean
  expandedNodes: number
  candidateTransitions: number
  uniqueStatesKept: number
  maximumFrontierSize: number
  incumbentRouteEvaluated: boolean
}

export interface FixedTapeRouteReplay {
  finalState: CraftState
  successDrawsConsumed: number
  conditionDrawsConsumed: number
}

interface SearchNode {
  state: CraftState
  actions: readonly CraftActionId[]
  successDrawIndex: number
  conditionDrawIndex: number
}

interface RandomTape {
  success: readonly number[]
  condition: readonly number[]
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function createRandomTape(seed: number, maxActions: number): RandomTape {
  const random = createEpisodeRandomStream(seed)
  return {
    success: Array.from({ length: maxActions }, () => random.nextSuccess()),
    condition: Array.from({ length: maxActions }, () => random.nextCondition()),
  }
}

function nodeIdentity(node: Readonly<SearchNode>): string {
  return `${node.successDrawIndex}:${node.conditionDrawIndex}:${scenarioBeamStateIdentityKey(node.state)}`
}

function advanceOnTape(
  context: Readonly<PlannerContext>,
  profile: Readonly<WeightedConditionProfile>,
  tape: Readonly<RandomTape>,
  node: Readonly<SearchNode>,
  action: CraftActionId,
): SearchNode {
  const preview = previewAction(context.recipe, context.crafter, node.state, action)
  if (!preview.legal) throw new Error(`cannot advance illegal action ${action}`)
  let successDrawIndex = node.successDrawIndex
  let conditionDrawIndex = node.conditionDrawIndex
  const observed = drawSimulatedActionOutcome(preview, node.state, profile, {
    nextSuccess: () => {
      const draw = tape.success[successDrawIndex]
      if (draw === undefined) throw new Error('fixed-tape success RNG exhausted')
      successDrawIndex += 1
      return draw
    },
    nextCondition: () => {
      const draw = tape.condition[conditionDrawIndex]
      if (draw === undefined) throw new Error('fixed-tape condition RNG exhausted')
      conditionDrawIndex += 1
      return draw
    },
  })
  const state = applyObservedOutcome(
    context.recipe,
    context.crafter,
    node.state,
    action,
    observed,
  ).nextState
  return {
    state,
    actions: [...node.actions, action],
    successDrawIndex,
    conditionDrawIndex,
  }
}

function objectiveReached(context: Readonly<PlannerContext>, state: Readonly<CraftState>): boolean {
  return state.terminal === 'completed' && state.quality >= context.objective.qualityTarget
}

function compareWitnesses(
  context: Readonly<PlannerContext>,
  left: Readonly<SearchNode>,
  right: Readonly<SearchNode>,
): number {
  const fields = [
    Number(objectiveReached(context, left.state)) - Number(objectiveReached(context, right.state)),
    left.state.quality - right.state.quality,
    left.state.cp - right.state.cp,
    left.state.durability - right.state.durability,
    right.actions.length - left.actions.length,
  ]
  return fields.find((difference) => difference !== 0) ?? 0
}

function compareOpenNodes(context: Readonly<PlannerContext>, left: SearchNode, right: SearchNode): number {
  return scenarioBeamStatePotential(context, right.state)
    - scenarioBeamStatePotential(context, left.state)
    || nodeIdentity(left).localeCompare(nodeIdentity(right))
}

function asWitness(context: Readonly<PlannerContext>, node: Readonly<SearchNode>): FixedTapeRouteWitness {
  return {
    actions: node.actions,
    finalState: node.state,
    objectiveTargetReached: objectiveReached(context, node.state),
    successDrawsConsumed: node.successDrawIndex,
    conditionDrawsConsumed: node.conditionDrawIndex,
  }
}

/**
 * Replays a route against the same independent success/condition RNG tapes as
 * the simulator. This is useful for checking that a reported search witness is
 * mechanically feasible; it does not make the route executable without
 * knowing future outcomes.
 */
export function replayFixedTapeRoute(
  context: Readonly<PlannerContext>,
  initialState: Readonly<CraftState>,
  conditionProfile: Readonly<WeightedConditionProfile>,
  seed: number,
  actions: readonly CraftActionId[],
): FixedTapeRouteReplay {
  assertPlannerContext(context)
  assertConditionProfileCompatible(context.recipe, conditionProfile)
  const tape = createRandomTape(seed, Math.max(1, actions.length))
  let node: SearchNode = {
    state: { ...initialState, buffs: { ...initialState.buffs } },
    actions: [],
    successDrawIndex: 0,
    conditionDrawIndex: 0,
  }
  for (const action of actions) {
    if (node.state.terminal !== 'none') throw new Error('fixed-tape route continues after terminal state')
    node = advanceOnTape(context, conditionProfile, tape, node, action)
  }
  return {
    finalState: node.state,
    successDrawsConsumed: node.successDrawIndex,
    conditionDrawsConsumed: node.conditionDrawIndex,
  }
}

/**
 * Searches routes on one already-fixed future RNG tape. Every returned route
 * is a replayable mechanics witness. Because branch selection can see the
 * future tape, it is only an optimistic route-existence reference and must not
 * be reported as a causal policy success rate or as an equipment-wide upper
 * bound. When no frontier was truncated, failure to find a route is exact only
 * for this tape, initial state, action set, and maxActions horizon.
 */
export function searchFixedTapeClairvoyantRoute(
  context: Readonly<PlannerContext>,
  initialState: Readonly<CraftState>,
  options: Readonly<FixedTapeClairvoyantSearchOptions>,
): FixedTapeClairvoyantSearchResult {
  assertPlannerContext(context)
  assertConditionProfileCompatible(context.recipe, options.conditionProfile)
  positiveInteger(options.beamWidth, 'beamWidth')
  positiveInteger(options.maxActions, 'maxActions')

  const initial: SearchNode = {
    state: { ...initialState, buffs: { ...initialState.buffs } },
    actions: [],
    successDrawIndex: 0,
    conditionDrawIndex: 0,
  }
  const tape = createRandomTape(options.seed, options.maxActions)
  let incumbent: SearchNode | null = null
  if (options.incumbentActions !== undefined) {
    if (options.incumbentActions.length > options.maxActions) {
      throw new RangeError('incumbentActions cannot exceed maxActions')
    }
    incumbent = initial
    for (const action of options.incumbentActions) {
      if (incumbent.state.terminal !== 'none') {
        throw new Error('incumbentActions continue after terminal state')
      }
      incumbent = advanceOnTape(context, options.conditionProfile, tape, incumbent, action)
    }
  }
  let bestCompleted: SearchNode | null = initial.state.terminal === 'completed'
    ? initial
    : incumbent?.state.terminal === 'completed'
      ? incumbent
      : null
  let bestOpen: SearchNode | null = initial.state.terminal === 'none' ? initial : null
  let beam: SearchNode[] = initial.state.terminal === 'none' ? [initial] : []
  let frontierTruncated = false
  let stoppedAtObjectiveTarget = objectiveReached(context, initial.state)
  let expandedNodes = 0
  let candidateTransitions = 0
  let uniqueStatesKept = beam.length
  let maximumFrontierSize = beam.length

  for (let depth = 0; depth < options.maxActions && beam.length > 0 && !stoppedAtObjectiveTarget; depth += 1) {
    const nextByIdentity = new Map<string, SearchNode>()
    for (const node of beam) {
      expandedNodes += 1
      for (const action of legalActions(context.recipe, context.crafter, node.state)) {
        candidateTransitions += 1
        const next = advanceOnTape(context, options.conditionProfile, tape, node, action)
        if (next.state.terminal === 'failed') continue
        if (next.state.terminal === 'completed') {
          if (bestCompleted === null || compareWitnesses(context, next, bestCompleted) > 0) {
            bestCompleted = next
          }
          if (objectiveReached(context, next.state)) stoppedAtObjectiveTarget = true
          continue
        }
        const key = nodeIdentity(next)
        const previous = nextByIdentity.get(key)
        if (previous === undefined || next.actions.length < previous.actions.length) {
          nextByIdentity.set(key, next)
        }
        if (
          bestOpen === null
          || scenarioBeamStatePotential(context, next.state)
            > scenarioBeamStatePotential(context, bestOpen.state)
        ) bestOpen = next
      }
    }

    if (stoppedAtObjectiveTarget) break
    const nextFrontier = [...nextByIdentity.values()].sort((left, right) => (
      compareOpenNodes(context, left, right)
    ))
    uniqueStatesKept += nextFrontier.length
    maximumFrontierSize = Math.max(maximumFrontierSize, nextFrontier.length)
    if (nextFrontier.length > options.beamWidth) frontierTruncated = true
    beam = nextFrontier.slice(0, options.beamWidth)
  }

  const witness = bestCompleted === null ? null : asWitness(context, bestCompleted)
  const objectiveTargetReachable = witness?.objectiveTargetReached === true
  return {
    version: FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION,
    evidence: 'clairvoyant-fixed-tape-feasible-witness-not-causal-policy',
    seed: options.seed,
    beamWidth: options.beamWidth,
    maxActions: options.maxActions,
    witness,
    bestOpenState: bestOpen?.state ?? null,
    objectiveTargetReachable,
    completionReachable: witness !== null,
    objectiveScoreSaturated: objectiveTargetReachable,
    frontierTruncated,
    exhaustiveWithinFixedTapeHorizon: !frontierTruncated && !stoppedAtObjectiveTarget,
    stoppedAtObjectiveTarget,
    expandedNodes,
    candidateTransitions,
    uniqueStatesKept,
    maximumFrontierSize,
    incumbentRouteEvaluated: options.incumbentActions !== undefined,
  }
}
