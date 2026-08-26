import {
  assertCraftObjective,
  previewAction,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import { targetCrafterSafePolicy } from './targetCrafterPolicy'

export const ROUTE_OPTION_IDS = [
  'progress-window',
  'inner-quiet-build',
  'quality-cycle',
  'quality-burst',
  'safe-finish',
  'resource-recovery',
  'bounded-condition-fishing',
] as const

export type RouteOptionId = (typeof ROUTE_OPTION_IDS)[number]

export const VIDEO_INFORMED_MAINLINE_ROUTE_ID = 'video-informed-mainline-v2'

/**
 * Planner inputs that are stable across one episode. CraftState remains an
 * explicit argument to every decision and is never hidden inside this context.
 */
export interface PlannerContext {
  recipe: RecipeProfile
  objective: CraftObjective
  crafter: CrafterProfile
}

export function assertPlannerContext(context: Readonly<PlannerContext>): void {
  assertCraftObjective(context.recipe, context.objective)
}

function objectiveDecisionRecipe(context: Readonly<PlannerContext>): RecipeProfile {
  return context.recipe.requiredQuality === context.recipe.qualityMax
    ? context.recipe
    : { ...context.recipe, requiredQuality: context.recipe.qualityMax }
}

export interface SerializableRouteOptionMemory {
  optionId: RouteOptionId
  enteredAtStep: number
  actionsUsed: number
  actionBudget: number
  resumeOptionId: RouteOptionId | null
  fishingRollsRemaining: number
}

export type RouteControllerTerminationReason =
  | 'craft-completed'
  | 'craft-failed'
  | 'action-budget-exhausted'
  | 'option-infeasible'
  | 'no-safe-candidate'
  | 'route-complete'
  | 'option-transition-loop'

export interface SerializableRouteControllerMemory {
  routeId: typeof VIDEO_INFORMED_MAINLINE_ROUTE_ID
  activeOption: SerializableRouteOptionMemory
  totalObservedTransitions: number
  fishingUsed: boolean
  terminated: boolean
  terminationReason: RouteControllerTerminationReason | null
}

export type RouteOptionStatus =
  | { kind: 'active' }
  | { kind: 'completed'; reason: string }
  | { kind: 'needs-recovery'; reason: string }
  | { kind: 'terminated'; reason: RouteControllerTerminationReason }

export interface RouteOptionActionCandidate {
  action: CraftActionId
  kind: 'mainline' | 'condition-interrupt'
  reason: string
}

export interface ObservedOptionTransition {
  before: CraftState
  action: CraftActionId
  success: boolean
  after: CraftState
}

export interface RouteOptionDecision {
  action: CraftActionId | null
  optionId: RouteOptionId
  candidates: readonly RouteOptionActionCandidate[]
  status: RouteOptionStatus
  memory: SerializableRouteControllerMemory
}

export interface RouteOptionController {
  readonly context: PlannerContext
  snapshot(): SerializableRouteControllerMemory
  status(state: CraftState): RouteOptionStatus
  decide(state: CraftState): RouteOptionDecision
  advance(transition: ObservedOptionTransition): SerializableRouteControllerMemory
}

export interface VideoInformedMainlineControllerOptions {
  actionBudgets?: Readonly<Partial<Record<RouteOptionId, number>>>
  fishingRolls?: number
  initialOptionId?: RouteOptionId
  initialMemory?: SerializableRouteControllerMemory
}

const DEFAULT_ACTION_BUDGETS: Readonly<Record<RouteOptionId, number>> = {
  'progress-window': 10,
  'inner-quiet-build': 16,
  'quality-cycle': 12,
  'quality-burst': 8,
  'safe-finish': 8,
  'resource-recovery': 4,
  'bounded-condition-fishing': 2,
}

const PROGRESS_WINDOW_FLOOR = 0.82
const QUALITY_BURST_ENTRY = 0.5

const OPTION_ACTION_POOLS = {
  'progress-window': [
    'muscleMemory', 'reflect', 'intensiveSynthesis', 'rapidSynthesis',
    'groundwork', 'carefulSynthesis', 'prudentSynthesis', 'delicateSynthesis',
    'basicSynthesis', 'trainedPerfection', 'veneration', 'manipulation',
    'wasteNot2', 'tricksOfTheTrade',
  ],
  'inner-quiet-build': [
    'reflect', 'preciseTouch', 'preparatoryTouch', 'prudentTouch', 'refinedTouch',
    'standardTouch', 'advancedTouch', 'hastyTouch', 'daringTouch',
    'delicateSynthesis', 'basicTouch', 'innovation', 'trainedPerfection',
    'manipulation', 'wasteNot2', 'tricksOfTheTrade',
  ],
  'quality-cycle': [
    'trainedFinesse', 'byregotsBlessing', 'preparatoryTouch', 'prudentTouch',
    'standardTouch', 'advancedTouch', 'hastyTouch', 'daringTouch',
    'delicateSynthesis', 'basicTouch', 'innovation', 'greatStrides',
    'manipulation', 'wasteNot2', 'observe', 'tricksOfTheTrade',
  ],
  'quality-burst': [
    'byregotsBlessing', 'greatStrides', 'innovation', 'trainedFinesse',
    'preciseTouch', 'hastyTouch', 'daringTouch', 'delicateSynthesis', 'observe',
  ],
  'safe-finish': [
    'carefulSynthesis', 'prudentSynthesis', 'basicSynthesis', 'rapidSynthesis',
    'intensiveSynthesis', 'groundwork', 'delicateSynthesis', 'veneration',
    'trainedPerfection', 'mastersMend',
  ],
  'resource-recovery': [
    'trainedPerfection', 'manipulation', 'mastersMend', 'immaculateMend',
    'wasteNot2', 'wasteNot', 'tricksOfTheTrade',
  ],
  'bounded-condition-fishing': [
    'observe', 'byregotsBlessing', 'trainedFinesse', 'advancedTouch',
  ],
} as const satisfies Readonly<Record<RouteOptionId, readonly CraftActionId[]>>

function cloneOptionMemory(memory: SerializableRouteOptionMemory): SerializableRouteOptionMemory {
  return { ...memory }
}

function cloneControllerMemory(memory: SerializableRouteControllerMemory): SerializableRouteControllerMemory {
  return {
    ...memory,
    activeOption: cloneOptionMemory(memory.activeOption),
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function optionBudget(
  optionId: RouteOptionId,
  options: VideoInformedMainlineControllerOptions,
): number {
  return positiveInteger(
    options.actionBudgets?.[optionId] ?? DEFAULT_ACTION_BUDGETS[optionId],
    `action budget for ${optionId}`,
  )
}

function createOptionMemory(
  optionId: RouteOptionId,
  state: CraftState,
  options: VideoInformedMainlineControllerOptions,
  resumeOptionId: RouteOptionId | null = null,
): SerializableRouteOptionMemory {
  const fishingRolls = positiveInteger(options.fishingRolls ?? 2, 'fishing rolls')
  return {
    optionId,
    enteredAtStep: state.step,
    actionsUsed: 0,
    actionBudget: optionBudget(optionId, options),
    resumeOptionId,
    fishingRollsRemaining: optionId === 'bounded-condition-fishing' ? fishingRolls : 0,
  }
}

function hasMitigatedDurabilityCandidate(
  context: PlannerContext,
  state: CraftState,
  optionId: RouteOptionId,
): boolean {
  const manipulationTick = state.buffs.manipulation > 0
  const reducedDurabilityCost = state.buffs.wasteNot > 0 || state.condition === 'sturdy'
  if (!manipulationTick && !reducedDurabilityCost) return false

  return OPTION_ACTION_POOLS[optionId].some((action) => {
    const preview = previewAction(context.recipe, context.crafter, state, action)
    if (
      !preview.legal
      || preview.action.category === 'repair'
      || !isPolicyActionSafe(context.recipe, context.crafter, state, action, preview)
    ) return false

    if (preview.durabilityCost === 0) {
      return manipulationTick && action !== 'manipulation' && preview.action.noStep !== true
    }
    return preview.durabilityCost < state.durability
      && (manipulationTick || reducedDurabilityCost)
  })
}

function needsResourceRecovery(
  context: PlannerContext,
  state: CraftState,
  optionId: RouteOptionId,
): boolean {
  if (state.durability > 10 || state.trainedPerfectionAvailable || state.trainedPerfectionActive) {
    return false
  }
  return !hasMitigatedDurabilityCandidate(context, state, optionId)
}

/** Pure option status evaluation; it does not transition the route controller. */
export function evaluateRouteOptionStatus(
  context: PlannerContext,
  state: CraftState,
  memory: SerializableRouteOptionMemory,
): RouteOptionStatus {
  if (state.terminal === 'completed') return { kind: 'terminated', reason: 'craft-completed' }
  if (state.terminal === 'failed') return { kind: 'terminated', reason: 'craft-failed' }

  const progressRatio = state.progress / context.recipe.progressRequired
  const qualityRatio = state.quality / context.recipe.qualityMax

  switch (memory.optionId) {
    case 'progress-window':
      if (
        progressRatio >= PROGRESS_WINDOW_FLOOR
        && state.buffs.muscleMemory === 0
        && state.buffs.veneration === 0
      ) return { kind: 'completed', reason: 'progress-headroom-secured' }
      break
    case 'inner-quiet-build':
      if (state.innerQuiet >= 10 || state.quality >= context.recipe.qualityMax) {
        return { kind: 'completed', reason: 'inner-quiet-target-reached' }
      }
      break
    case 'quality-cycle':
      if (state.quality >= context.recipe.qualityMax) {
        return { kind: 'completed', reason: 'quality-target-reached' }
      }
      if (state.innerQuiet < 10 && memory.actionsUsed > 0) {
        return { kind: 'completed', reason: 'inner-quiet-needs-rebuild' }
      }
      if (state.innerQuiet >= 10 && qualityRatio >= QUALITY_BURST_ENTRY) {
        return { kind: 'completed', reason: 'quality-burst-ready' }
      }
      break
    case 'quality-burst':
      if (state.quality >= context.recipe.qualityMax) {
        return { kind: 'completed', reason: 'quality-target-reached' }
      }
      if (state.innerQuiet < 10) {
        return { kind: 'completed', reason: 'quality-burst-consumed' }
      }
      break
    case 'safe-finish':
      if (state.quality < context.recipe.qualityMax) {
        return { kind: 'terminated', reason: 'option-infeasible' }
      }
      break
    case 'resource-recovery':
      if (state.durability >= 20 || state.trainedPerfectionActive) {
        return { kind: 'completed', reason: 'resource-reserve-restored' }
      }
      break
    case 'bounded-condition-fishing':
      if (
        state.condition === 'good'
        || state.buffs.greatStrides === 0
        || state.quality >= context.recipe.qualityMax
        || memory.fishingRollsRemaining <= 0
      ) return { kind: 'completed', reason: 'condition-fishing-ended' }
      break
  }

  if (memory.actionsUsed >= memory.actionBudget) {
    return { kind: 'terminated', reason: 'action-budget-exhausted' }
  }
  if (
    memory.optionId !== 'resource-recovery'
    && memory.optionId !== 'bounded-condition-fishing'
    && needsResourceRecovery(context, state, memory.optionId)
  ) return { kind: 'needs-recovery', reason: 'durability-reserve-broken' }
  return { kind: 'active' }
}

function safeCandidate(
  context: PlannerContext,
  state: CraftState,
  action: CraftActionId,
  reason: string,
): RouteOptionActionCandidate | null {
  const preview = previewAction(context.recipe, context.crafter, state, action)
  if (!preview.legal || !isPolicyActionSafe(context.recipe, context.crafter, state, action, preview)) return null
  return {
    action,
    kind: state.condition === 'normal' ? 'mainline' : 'condition-interrupt',
    reason,
  }
}

/** The target policy supplies one mainline proposal; the option-local pool
 * supplies tactical alternatives without changing continuation identity. */
export function routeOptionCandidates(
  context: PlannerContext,
  state: CraftState,
  memory: SerializableRouteOptionMemory,
): readonly RouteOptionActionCandidate[] {
  const actions: Array<{ action: CraftActionId; reason: string }> = []
  if (memory.optionId === 'bounded-condition-fishing') {
    actions.push({ action: 'observe', reason: 'bounded-condition-fishing-mainline' })
  } else {
    // Legacy continuation heuristics may read requiredQuality as their route
    // target. Adapt that read-only decision input, but keep every mechanics
    // preview/transition on the canonical recipe.
    const mainline = targetCrafterSafePolicy(objectiveDecisionRecipe(context), context.crafter, state)
    if (
      mainline !== null
      && OPTION_ACTION_POOLS[memory.optionId].some((action) => action === mainline)
    ) actions.push({ action: mainline, reason: `${memory.optionId}-mainline` })
  }
  for (const action of OPTION_ACTION_POOLS[memory.optionId]) {
    actions.push({ action, reason: `${memory.optionId}-alternative` })
  }

  const seen = new Set<CraftActionId>()
  return actions.flatMap(({ action, reason }) => {
    if (seen.has(action)) return []
    seen.add(action)
    const candidate = safeCandidate(context, state, action, reason)
    return candidate === null ? [] : [candidate]
  })
}

function nextMainlineOption(
  completed: SerializableRouteOptionMemory,
  state: CraftState,
): RouteOptionId | null {
  if (completed.optionId === 'resource-recovery' || completed.optionId === 'bounded-condition-fishing') {
    return completed.resumeOptionId
  }
  if (completed.optionId === 'progress-window') return 'inner-quiet-build'
  if (completed.optionId === 'inner-quiet-build') return 'quality-cycle'
  if (completed.optionId === 'quality-cycle') {
    return state.innerQuiet < 10 ? 'inner-quiet-build' : 'quality-burst'
  }
  if (completed.optionId === 'quality-burst') {
    return state.innerQuiet < 10 ? 'inner-quiet-build' : 'quality-cycle'
  }
  return null
}

function shouldEnterConditionFishing(
  context: PlannerContext,
  state: CraftState,
  memory: SerializableRouteControllerMemory,
): boolean {
  if (memory.fishingUsed || memory.activeOption.optionId !== 'quality-burst') return false
  if (
    state.innerQuiet < 10
    || state.condition === 'good'
    || state.buffs.greatStrides === 0
    || state.progress / context.recipe.progressRequired < 0.8
    || state.quality / context.recipe.qualityMax < QUALITY_BURST_ENTRY
    || state.cp < 80
    || state.durability < 20
  ) return false
  return safeCandidate(context, state, 'observe', 'bounded-condition-fishing') !== null
}

function validateInitialMemory(memory: SerializableRouteControllerMemory): void {
  if (memory.routeId !== VIDEO_INFORMED_MAINLINE_ROUTE_ID) throw new Error('route memory version mismatch')
  if (!ROUTE_OPTION_IDS.includes(memory.activeOption.optionId)) throw new Error('unknown route option')
  positiveInteger(memory.activeOption.actionBudget, 'initial action budget')
  if (!Number.isInteger(memory.activeOption.actionsUsed) || memory.activeOption.actionsUsed < 0) {
    throw new Error('initial actionsUsed must be a non-negative integer')
  }
}

export function createVideoInformedMainlineController(
  context: PlannerContext,
  initialState: CraftState,
  options: VideoInformedMainlineControllerOptions = {},
): RouteOptionController {
  assertPlannerContext(context)
  if (options.initialMemory !== undefined && options.initialOptionId !== undefined) {
    throw new Error('initialMemory and initialOptionId are mutually exclusive')
  }

  let memory = options.initialMemory === undefined
    ? {
        routeId: VIDEO_INFORMED_MAINLINE_ROUTE_ID,
        activeOption: createOptionMemory(options.initialOptionId ?? 'progress-window', initialState, options),
        totalObservedTransitions: 0,
        fishingUsed: false,
        terminated: false,
        terminationReason: null,
      } satisfies SerializableRouteControllerMemory
    : cloneControllerMemory(options.initialMemory)
  validateInitialMemory(memory)

  const terminate = (reason: RouteControllerTerminationReason): void => {
    memory = { ...memory, terminated: true, terminationReason: reason }
  }

  const activate = (
    optionId: RouteOptionId,
    state: CraftState,
    resumeOptionId: RouteOptionId | null = null,
  ): void => {
    memory = {
      ...memory,
      activeOption: createOptionMemory(optionId, state, options, resumeOptionId),
    }
  }

  const settle = (state: CraftState): void => {
    for (let transition = 0; transition < ROUTE_OPTION_IDS.length + 2; transition += 1) {
      if (memory.terminated) return
      const currentStatus = evaluateRouteOptionStatus(context, state, memory.activeOption)
      if (currentStatus.kind === 'terminated') {
        terminate(currentStatus.reason)
        return
      }
      if (currentStatus.kind === 'needs-recovery') {
        activate('resource-recovery', state, memory.activeOption.optionId)
        continue
      }
      if (currentStatus.kind === 'completed') {
        const nextOptionId = state.quality >= context.recipe.qualityMax
          && memory.activeOption.optionId !== 'resource-recovery'
          && memory.activeOption.optionId !== 'bounded-condition-fishing'
          ? 'safe-finish'
          : nextMainlineOption(memory.activeOption, state)
        if (nextOptionId === null) {
          terminate('route-complete')
          return
        }
        activate(nextOptionId, state)
        continue
      }
      if (shouldEnterConditionFishing(context, state, memory)) {
        const resumeOptionId = memory.activeOption.optionId
        memory = { ...memory, fishingUsed: true }
        activate('bounded-condition-fishing', state, resumeOptionId)
        continue
      }
      return
    }
    terminate('option-transition-loop')
  }

  return {
    context,
    snapshot: () => cloneControllerMemory(memory),
    status: (state) => {
      settle(state)
      return memory.terminated
        ? { kind: 'terminated', reason: memory.terminationReason ?? 'option-infeasible' }
        : evaluateRouteOptionStatus(context, state, memory.activeOption)
    },
    decide: (state) => {
      settle(state)
      if (memory.terminated) {
        return {
          action: null,
          optionId: memory.activeOption.optionId,
          candidates: [],
          status: { kind: 'terminated', reason: memory.terminationReason ?? 'option-infeasible' },
          memory: cloneControllerMemory(memory),
        }
      }
      const candidates = routeOptionCandidates(context, state, memory.activeOption)
      if (candidates.length === 0) {
        terminate('no-safe-candidate')
        return {
          action: null,
          optionId: memory.activeOption.optionId,
          candidates,
          status: { kind: 'terminated', reason: 'no-safe-candidate' },
          memory: cloneControllerMemory(memory),
        }
      }
      return {
        action: candidates[0]!.action,
        optionId: memory.activeOption.optionId,
        candidates,
        status: { kind: 'active' },
        memory: cloneControllerMemory(memory),
      }
    },
    advance: (observed) => {
      if (memory.terminated) return cloneControllerMemory(memory)
      const active = memory.activeOption
      memory = {
        ...memory,
        totalObservedTransitions: memory.totalObservedTransitions + 1,
        activeOption: {
          ...active,
          actionsUsed: active.actionsUsed + 1,
          fishingRollsRemaining: active.optionId === 'bounded-condition-fishing'
            && observed.action === 'observe'
            ? Math.max(0, active.fishingRollsRemaining - 1)
            : active.fishingRollsRemaining,
        },
      }
      settle(observed.after)
      return cloneControllerMemory(memory)
    },
  }
}

/** Every call creates fresh mutable route memory for one episode/session. */
export function createVideoInformedMainlineControllerFactory(
  context: PlannerContext,
  options: VideoInformedMainlineControllerOptions = {},
): (initialState: CraftState) => RouteOptionController {
  return (initialState) => createVideoInformedMainlineController(context, initialState, options)
}
