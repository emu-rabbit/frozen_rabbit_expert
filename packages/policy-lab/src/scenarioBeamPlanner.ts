import {
  ACTIONS,
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
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import { assertPlannerContext, type PlannerContext } from './routeOptionController'

export const SCENARIO_BEAM_PLANNER_VERSION = 'scenario-beam-planner-v0.2.0'

export interface ScenarioBeamPlannerOptions {
  profiles: readonly WeightedConditionProfile[]
  scenariosPerProfile: number
  beamWidth: number
  maxActions: number
  seed: number
}

export interface ScenarioBeamActionScore {
  action: CraftActionId
  worstProfileCompletionExistenceRate: number
  averageCompletionExistenceRate: number
  worstScenarioPotential: number
  averageScenarioPotential: number
}

export interface ScenarioBeamPlan {
  version: typeof SCENARIO_BEAM_PLANNER_VERSION
  action: CraftActionId
  score: ScenarioBeamActionScore
  alternatives: ScenarioBeamActionScore[]
  scenarioCount: number
  beamWidth: number
  rootActionCount: number
  expandedBeamNodes: number
  candidateAdvanceCalls: number
  successDrawReads: number
  conditionDrawReads: number
  evidence: 'optimistic-existence-not-causal-policy'
}

interface BeamNode {
  state: CraftState
  rootAction: CraftActionId
  successDrawIndex: number
  conditionDrawIndex: number
}

interface ScenarioOutcome {
  completed: boolean
  potential: number
}

interface RootAggregate {
  action: CraftActionId
  byProfile: Map<string, ScenarioOutcome[]>
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function stringHash(serialized: string): number {
  let hash = 0x811c_9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return hash >>> 0
}

function stateHash(state: CraftState): number {
  return stringHash(JSON.stringify(state))
}

export function scenarioBeamStateIdentityKey(state: CraftState): string {
  const buffs = state.buffs
  return [
    state.step,
    state.progress,
    state.quality,
    state.durability,
    state.cp,
    state.condition,
    state.innerQuiet,
    state.comboFrom ?? '-',
    buffs.wasteNot,
    buffs.veneration,
    buffs.greatStrides,
    buffs.innovation,
    buffs.finalAppraisal,
    buffs.manipulation,
    buffs.muscleMemory,
    buffs.expedience,
    Number(state.trainedPerfectionAvailable),
    Number(state.trainedPerfectionActive),
    state.carefulObservationUsesLeft,
    Number(state.heartAndSoulAvailable),
    Number(state.heartAndSoulActive),
    Number(state.quickInnovationAvailable),
    state.terminal,
    state.failureReason ?? '-',
  ].join(':')
}

interface ScenarioRunResult {
  outcomes: Map<CraftActionId, ScenarioOutcome>
  expandedBeamNodes: number
  candidateAdvanceCalls: number
  successDrawReads: number
  conditionDrawReads: number
}

/**
 * An optimistic but action-agnostic estimate used only to keep a diverse,
 * fixed-size frontier. Completion is always ranked above this estimate.
 */
export function scenarioBeamStatePotential(context: PlannerContext, state: CraftState): number {
  assertPlannerContext(context)
  const qualityTarget = context.objective.qualityTarget
  if (state.terminal === 'completed') {
    const objectiveQuality = Math.min(1, state.quality / qualityTarget)
    return 10_000_000
      + objectiveQuality * 2_000_000
      + state.cp * 1_000
      + Math.max(0, state.durability) * 100
  }
  if (state.terminal === 'failed') return -10_000_000

  const progressRatio = state.progress / context.recipe.progressRequired
  const qualityRatio = state.quality / qualityTarget
  const effectiveDurability = state.durability
    + state.buffs.manipulation * 5
    + state.buffs.wasteNot * 2.5
    + Number(state.trainedPerfectionAvailable || state.trainedPerfectionActive) * 10
  const estimatedQuality = Math.min(
    1.4,
    (
      state.quality
      + state.cp * 17
      + state.innerQuiet * 450
      + effectiveDurability * 80
    ) / qualityTarget,
  )
  const estimatedProgress = Math.min(
    1.4,
    progressRatio + effectiveDurability / 90 + state.cp / 1_800,
  )

  return Math.min(estimatedQuality, estimatedProgress) * 2_000_000
    + Math.min(progressRatio, qualityRatio) * 1_000_000
    + qualityRatio * 500_000
    + progressRatio * 250_000
    + state.innerQuiet * 20_000
    + state.cp * 250
    + effectiveDurability * 2_000
    + state.buffs.innovation * 8_000
    + state.buffs.greatStrides * 8_000
    + state.buffs.veneration * 4_000
}

function diversityBucket(node: Readonly<BeamNode>): string {
  const { state, rootAction, successDrawIndex, conditionDrawIndex } = node
  const buffs = state.buffs
  return [
    rootAction,
    successDrawIndex,
    conditionDrawIndex,
    Math.floor(state.progress / 350),
    Math.floor(state.quality / 500),
    Math.floor(state.cp / 30),
    Math.floor(Math.max(0, state.durability) / 5),
    state.innerQuiet,
    state.condition,
    buffs.wasteNot,
    buffs.veneration,
    buffs.greatStrides,
    buffs.innovation,
    buffs.manipulation,
    buffs.muscleMemory,
    buffs.expedience,
    buffs.finalAppraisal,
    state.comboFrom ?? '-',
    Number(state.trainedPerfectionAvailable),
    Number(state.trainedPerfectionActive),
    state.carefulObservationUsesLeft,
    Number(state.heartAndSoulAvailable),
    Number(state.heartAndSoulActive),
    Number(state.quickInnovationAvailable),
  ].join(':')
}

function safeAdvancingActions(
  context: PlannerContext,
  state: CraftState,
  cache: Map<string, CraftActionId[]>,
): CraftActionId[] {
  const key = scenarioBeamStateIdentityKey(state)
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const actions = legalActions(context.recipe, context.crafter, state).filter((action) => {
    const preview = previewAction(context.recipe, context.crafter, state, action)
    return ACTIONS[action].noStep !== true
      && isPolicyActionSafe(context.recipe, context.crafter, state, action, preview)
  })
  cache.set(key, actions)
  return actions
}

function scenarioSeed(
  baseSeed: number,
  state: CraftState,
  profileId: string,
  scenarioIndex: number,
): number {
  return baseSeed
    ^ stateHash(state)
    ^ Math.imul(stringHash(profileId), 0x85eb_ca6b)
    ^ Math.imul(scenarioIndex + 1, 0x9e37_79b1)
}

function runScenario(
  context: PlannerContext,
  initialState: CraftState,
  profile: WeightedConditionProfile,
  rootActions: readonly CraftActionId[],
  options: ScenarioBeamPlannerOptions,
  seed: number,
): ScenarioRunResult {
  const random = createEpisodeRandomStream(seed)
  const successDraws = Array.from({ length: options.maxActions }, () => random.nextSuccess())
  const conditionDraws = Array.from({ length: options.maxActions }, () => random.nextCondition())
  const actionCache = new Map<string, CraftActionId[]>()
  const outcomes = new Map<CraftActionId, ScenarioOutcome>(rootActions.map((action) => [
    action,
    { completed: false, potential: -Infinity },
  ]))
  let expandedBeamNodes = 1
  let candidateAdvanceCalls = 0
  let successDrawReads = 0
  let conditionDrawReads = 0

  const advance = (
    state: CraftState,
    action: CraftActionId,
    successDrawIndex: number,
    conditionDrawIndex: number,
  ): Omit<BeamNode, 'rootAction'> => {
    candidateAdvanceCalls += 1
    const preview = previewAction(context.recipe, context.crafter, state, action)
    let nextSuccessDrawIndex = successDrawIndex
    let nextConditionDrawIndex = conditionDrawIndex
    const { success, nextCondition } = drawSimulatedActionOutcome(preview, state, profile, {
      nextSuccess: () => {
        const draw = successDraws[nextSuccessDrawIndex]
        if (draw === undefined) throw new Error('scenario success RNG tape exhausted')
        nextSuccessDrawIndex += 1
        successDrawReads += 1
        return draw
      },
      nextCondition: () => {
        const draw = conditionDraws[nextConditionDrawIndex]
        if (draw === undefined) throw new Error('scenario condition RNG tape exhausted')
        nextConditionDrawIndex += 1
        conditionDrawReads += 1
        return draw
      },
    })
    const nextState = applyObservedOutcome(
      context.recipe,
      context.crafter,
      state,
      action,
      { success, nextCondition },
    ).nextState
    return {
      state: nextState,
      successDrawIndex: nextSuccessDrawIndex,
      conditionDrawIndex: nextConditionDrawIndex,
    }
  }

  let beam = rootActions.flatMap((action): BeamNode[] => {
    const advanced = advance(initialState, action, 0, 0)
    const next = advanced.state
    if (next.terminal === 'failed') return []
    const outcome = outcomes.get(action)!
    outcome.completed ||= next.terminal === 'completed'
    outcome.potential = Math.max(outcome.potential, scenarioBeamStatePotential(context, next))
    return next.terminal === 'completed' ? [] : [{ ...advanced, rootAction: action }]
  })
  beam.sort((left, right) => (
    scenarioBeamStatePotential(context, right.state) - scenarioBeamStatePotential(context, left.state)
  ))
  beam = beam.slice(0, options.beamWidth)

  for (let depth = 1; depth < options.maxActions && beam.length > 0; depth += 1) {
    const bestByBucket = new Map<string, BeamNode>()
    for (const node of beam) {
      expandedBeamNodes += 1
      for (const action of safeAdvancingActions(context, node.state, actionCache)) {
        const advanced = advance(
          node.state,
          action,
          node.successDrawIndex,
          node.conditionDrawIndex,
        )
        const next = advanced.state
        if (next.terminal === 'failed') continue
        const outcome = outcomes.get(node.rootAction)!
        outcome.completed ||= next.terminal === 'completed'
        outcome.potential = Math.max(outcome.potential, scenarioBeamStatePotential(context, next))
        if (next.terminal === 'completed') continue
        const candidate: BeamNode = { ...advanced, rootAction: node.rootAction }
        const key = diversityBucket(candidate)
        const previous = bestByBucket.get(key)
        if (
          previous === undefined
          || scenarioBeamStatePotential(context, next) > scenarioBeamStatePotential(context, previous.state)
        ) bestByBucket.set(key, candidate)
      }
    }
    beam = [...bestByBucket.values()]
      .sort((left, right) => (
        scenarioBeamStatePotential(context, right.state) - scenarioBeamStatePotential(context, left.state)
      ))
      .slice(0, options.beamWidth)
  }

  return {
    outcomes,
    expandedBeamNodes,
    candidateAdvanceCalls,
    successDrawReads,
    conditionDrawReads,
  }
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function scoreAggregate(aggregate: RootAggregate): ScenarioBeamActionScore {
  const profileCompletionRates = [...aggregate.byProfile.values()].map((outcomes) => (
    outcomes.filter((outcome) => outcome.completed).length / Math.max(1, outcomes.length)
  ))
  const allOutcomes = [...aggregate.byProfile.values()].flat()
  const potentials = allOutcomes.map((outcome) => outcome.potential)
  return {
    action: aggregate.action,
    worstProfileCompletionExistenceRate: profileCompletionRates.length === 0
      ? 0
      : Math.min(...profileCompletionRates),
    averageCompletionExistenceRate: mean(profileCompletionRates),
    worstScenarioPotential: potentials.length === 0 ? -Infinity : Math.min(...potentials),
    averageScenarioPotential: mean(potentials),
  }
}

function compareActionScores(left: ScenarioBeamActionScore, right: ScenarioBeamActionScore): number {
  const comparisons = [
    left.worstProfileCompletionExistenceRate - right.worstProfileCompletionExistenceRate,
    left.averageCompletionExistenceRate - right.averageCompletionExistenceRate,
    left.worstScenarioPotential - right.worstScenarioPotential,
    left.averageScenarioPotential - right.averageScenarioPotential,
  ]
  return comparisons.find((difference) => Math.abs(difference) > 1e-9) ?? 0
}

/**
 * Optimistic candidate proposer over independently generated hypothetical
 * futures. Branches are selected with hindsight inside each scenario, so its
 * completion fields are existence signals—not causal policy success rates.
 * The planner never receives or reconstructs the live episode RNG stream.
 */
export function planWithScenarioBeam(
  context: PlannerContext,
  state: CraftState,
  options: ScenarioBeamPlannerOptions,
): ScenarioBeamPlan | null {
  assertPlannerContext(context)
  if (state.terminal !== 'none') return null
  positiveInteger(options.scenariosPerProfile, 'scenariosPerProfile')
  positiveInteger(options.beamWidth, 'beamWidth')
  positiveInteger(options.maxActions, 'maxActions')
  if (options.profiles.length === 0) throw new Error('profiles must not be empty')
  const profileIds = new Set<string>()
  for (const profile of options.profiles) {
    assertConditionProfileCompatible(context.recipe, profile)
    if (profileIds.has(profile.id)) throw new Error(`duplicate condition profile id: ${profile.id}`)
    profileIds.add(profile.id)
  }

  const actionCache = new Map<string, CraftActionId[]>()
  const rootActions = safeAdvancingActions(context, state, actionCache)
  if (rootActions.length === 0) return null
  const rootOrder = new Map(rootActions.map((action, index) => [action, index]))
  const aggregates = new Map<CraftActionId, RootAggregate>(rootActions.map((action) => [
    action,
    { action, byProfile: new Map(options.profiles.map((profile) => [profile.id, []])) },
  ]))
  let expandedBeamNodes = 0
  let candidateAdvanceCalls = 0
  let successDrawReads = 0
  let conditionDrawReads = 0

  for (const profile of options.profiles) {
    for (let scenarioIndex = 0; scenarioIndex < options.scenariosPerProfile; scenarioIndex += 1) {
      const scenario = runScenario(
        context,
        state,
        profile,
        rootActions,
        options,
        scenarioSeed(options.seed, state, profile.id, scenarioIndex),
      )
      expandedBeamNodes += scenario.expandedBeamNodes
      candidateAdvanceCalls += scenario.candidateAdvanceCalls
      successDrawReads += scenario.successDrawReads
      conditionDrawReads += scenario.conditionDrawReads
      for (const action of rootActions) {
        aggregates.get(action)!.byProfile.get(profile.id)!.push(scenario.outcomes.get(action)!)
      }
    }
  }

  const ranked = [...aggregates.values()]
    .map(scoreAggregate)
    .sort((left, right) => (
      compareActionScores(right, left)
      || (rootOrder.get(left.action) ?? Number.MAX_SAFE_INTEGER)
        - (rootOrder.get(right.action) ?? Number.MAX_SAFE_INTEGER)
      || left.action.localeCompare(right.action)
    ))
  const best = ranked[0]
  if (!best) return null
  return {
    version: SCENARIO_BEAM_PLANNER_VERSION,
    action: best.action,
    score: best,
    alternatives: ranked.slice(1),
    scenarioCount: options.profiles.length * options.scenariosPerProfile,
    beamWidth: options.beamWidth,
    rootActionCount: rootActions.length,
    expandedBeamNodes,
    candidateAdvanceCalls,
    successDrawReads,
    conditionDrawReads,
    evidence: 'optimistic-existence-not-causal-policy',
  }
}
