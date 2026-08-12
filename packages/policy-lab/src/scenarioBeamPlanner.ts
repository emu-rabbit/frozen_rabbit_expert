import {
  ACTIONS,
  applyObservedOutcome,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  sampleCondition,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import type { PlannerContext } from './routeOptionController'

export const SCENARIO_BEAM_PLANNER_VERSION = 'scenario-beam-planner-v0.1.0'

export interface ScenarioBeamPlannerOptions {
  profiles: readonly WeightedConditionProfile[]
  scenariosPerProfile: number
  beamWidth: number
  maxActions: number
  seed: number
}

export interface ScenarioBeamActionScore {
  action: CraftActionId
  robustCompletionRate: number
  averageCompletionRate: number
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
  evidence: 'sampled-completion' | 'sampled-potential'
}

interface BeamNode {
  state: CraftState
  rootAction: CraftActionId
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
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function stateHash(state: CraftState): number {
  const serialized = JSON.stringify(state)
  let hash = 0x811c_9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193)
  }
  return hash >>> 0
}

function stateKey(state: CraftState): string {
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
    state.terminal,
  ].join(':')
}

/**
 * An optimistic but action-agnostic estimate used only to keep a diverse,
 * fixed-size frontier. Completion is always ranked above this estimate.
 */
export function scenarioBeamStatePotential(context: PlannerContext, state: CraftState): number {
  if (state.terminal === 'completed') {
    return 10_000_000 + state.cp * 1_000 + Math.max(0, state.durability) * 100
  }
  if (state.terminal === 'failed') return -10_000_000

  const progressRatio = state.progress / context.recipe.progressRequired
  const qualityRatio = state.quality / context.recipe.requiredQuality
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
    ) / context.recipe.requiredQuality,
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

function diversityBucket(state: CraftState, rootAction: CraftActionId): string {
  const buffs = state.buffs
  return [
    rootAction,
    Math.floor(state.progress / 350),
    Math.floor(state.quality / 500),
    Math.floor(state.cp / 30),
    Math.floor(Math.max(0, state.durability) / 5),
    state.innerQuiet,
    buffs.wasteNot,
    buffs.veneration,
    buffs.greatStrides,
    buffs.innovation,
    buffs.manipulation,
    buffs.muscleMemory,
    buffs.expedience,
    state.comboFrom ?? '-',
    Number(state.trainedPerfectionAvailable),
    Number(state.trainedPerfectionActive),
  ].join(':')
}

function safeAdvancingActions(
  context: PlannerContext,
  state: CraftState,
  cache: Map<string, CraftActionId[]>,
): CraftActionId[] {
  const key = stateKey(state)
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
  profileIndex: number,
  scenarioIndex: number,
): number {
  return baseSeed
    ^ stateHash(state)
    ^ Math.imul(profileIndex + 1, 0x85eb_ca6b)
    ^ Math.imul(scenarioIndex + 1, 0x9e37_79b1)
}

function runScenario(
  context: PlannerContext,
  initialState: CraftState,
  profile: WeightedConditionProfile,
  rootActions: readonly CraftActionId[],
  options: ScenarioBeamPlannerOptions,
  seed: number,
): Map<CraftActionId, ScenarioOutcome> {
  const random = createEpisodeRandomStream(seed)
  const successDraws = Array.from({ length: options.maxActions }, () => random.nextSuccess())
  const conditionDraws = Array.from({ length: options.maxActions }, () => random.nextCondition())
  const actionCache = new Map<string, CraftActionId[]>()
  const outcomes = new Map<CraftActionId, ScenarioOutcome>(rootActions.map((action) => [
    action,
    { completed: false, potential: -Infinity },
  ]))

  const advance = (state: CraftState, action: CraftActionId, depth: number): CraftState => {
    const preview = previewAction(context.recipe, context.crafter, state, action)
    const success = successDraws[depth]! < preview.successRate
    const nextCondition = sampleCondition(profile, {
      nextCondition: () => conditionDraws[depth]!,
      nextSuccess: () => successDraws[depth]!,
    }, state.condition)
    return applyObservedOutcome(
      context.recipe,
      context.crafter,
      state,
      action,
      { success, nextCondition },
    ).nextState
  }

  let beam = rootActions.flatMap((action): BeamNode[] => {
    const next = advance(initialState, action, 0)
    if (next.terminal === 'failed') return []
    const outcome = outcomes.get(action)!
    outcome.completed ||= next.terminal === 'completed'
    outcome.potential = Math.max(outcome.potential, scenarioBeamStatePotential(context, next))
    return next.terminal === 'completed' ? [] : [{ state: next, rootAction: action }]
  })
  beam.sort((left, right) => (
    scenarioBeamStatePotential(context, right.state) - scenarioBeamStatePotential(context, left.state)
  ))
  beam = beam.slice(0, options.beamWidth)

  for (let depth = 1; depth < options.maxActions && beam.length > 0; depth += 1) {
    const bestByBucket = new Map<string, BeamNode>()
    for (const node of beam) {
      for (const action of safeAdvancingActions(context, node.state, actionCache)) {
        const next = advance(node.state, action, depth)
        if (next.terminal === 'failed') continue
        const outcome = outcomes.get(node.rootAction)!
        outcome.completed ||= next.terminal === 'completed'
        outcome.potential = Math.max(outcome.potential, scenarioBeamStatePotential(context, next))
        if (next.terminal === 'completed') continue
        const candidate = { state: next, rootAction: node.rootAction }
        const key = diversityBucket(next, node.rootAction)
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

  return outcomes
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
    robustCompletionRate: profileCompletionRates.length === 0 ? 0 : Math.min(...profileCompletionRates),
    averageCompletionRate: mean(profileCompletionRates),
    worstScenarioPotential: potentials.length === 0 ? -Infinity : Math.min(...potentials),
    averageScenarioPotential: mean(potentials),
  }
}

function compareActionScores(left: ScenarioBeamActionScore, right: ScenarioBeamActionScore): number {
  const comparisons = [
    left.robustCompletionRate - right.robustCompletionRate,
    left.averageCompletionRate - right.averageCompletionRate,
    left.worstScenarioPotential - right.worstScenarioPotential,
    left.averageScenarioPotential - right.averageScenarioPotential,
  ]
  return comparisons.find((difference) => Math.abs(difference) > 1e-9) ?? 0
}

/**
 * Plans against independently generated hypothetical futures. The planner does
 * not receive or reconstruct the episode's real RNG stream; every observed
 * state triggers a fresh search, so the result remains causal.
 */
export function planWithScenarioBeam(
  context: PlannerContext,
  state: CraftState,
  options: ScenarioBeamPlannerOptions,
): ScenarioBeamPlan | null {
  if (state.terminal !== 'none') return null
  positiveInteger(options.scenariosPerProfile, 'scenariosPerProfile')
  positiveInteger(options.beamWidth, 'beamWidth')
  positiveInteger(options.maxActions, 'maxActions')
  if (options.profiles.length === 0) throw new Error('profiles must not be empty')

  const actionCache = new Map<string, CraftActionId[]>()
  const rootActions = safeAdvancingActions(context, state, actionCache)
  if (rootActions.length === 0) return null
  const rootOrder = new Map(rootActions.map((action, index) => [action, index]))
  const aggregates = new Map<CraftActionId, RootAggregate>(rootActions.map((action) => [
    action,
    { action, byProfile: new Map(options.profiles.map((profile) => [profile.id, []])) },
  ]))

  for (const [profileIndex, profile] of options.profiles.entries()) {
    for (let scenarioIndex = 0; scenarioIndex < options.scenariosPerProfile; scenarioIndex += 1) {
      const outcomes = runScenario(
        context,
        state,
        profile,
        rootActions,
        options,
        scenarioSeed(options.seed, state, profileIndex, scenarioIndex),
      )
      for (const action of rootActions) {
        aggregates.get(action)!.byProfile.get(profile.id)!.push(outcomes.get(action)!)
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
    evidence: best.averageCompletionRate > 0 ? 'sampled-completion' : 'sampled-potential',
  }
}
