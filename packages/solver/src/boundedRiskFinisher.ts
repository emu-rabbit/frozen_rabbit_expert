import {
  ACTIONS,
  applyObservedOutcome,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { isPolicyActionSafe } from './policySafety'

export const BOUNDED_RISK_FINISHER_VERSION = 'bounded-risk-finisher-v0.2.0'

const DEFAULT_MAX_REMAINDER_ACTIONS = 6
const DEFAULT_MAX_RISKY_ACTIONS = 2
const DEFAULT_MAX_NODE_EXPANSIONS_PER_ROOT = 50_000

const RISKY_ACTIONS = new Set<CraftActionId>([
  'rapidSynthesis',
  'hastyTouch',
  'daringTouch',
])

const REMAINDER_ACTIONS = [
  'rapidSynthesis',
  'prudentSynthesis',
  'carefulSynthesis',
  'basicSynthesis',
  'groundwork',
  'intensiveSynthesis',
  'hastyTouch',
  'daringTouch',
  'prudentTouch',
  'basicTouch',
  'standardTouch',
  'advancedTouch',
  'refinedTouch',
  'preparatoryTouch',
  'trainedFinesse',
  'preciseTouch',
  'byregotsBlessing',
  'delicateSynthesis',
  'innovation',
  'greatStrides',
  'veneration',
  'wasteNot',
  'wasteNot2',
  'trainedPerfection',
  'manipulation',
  'mastersMend',
  'immaculateMend',
  'observe',
  'heartAndSoul',
  'quickInnovation',
  'tricksOfTheTrade',
] as const satisfies readonly CraftActionId[]

const SETUP_ACTIONS = new Set<CraftActionId>([
  'innovation',
  'greatStrides',
  'veneration',
  'wasteNot',
  'wasteNot2',
  'trainedPerfection',
  'manipulation',
  'mastersMend',
  'immaculateMend',
  'observe',
  'heartAndSoul',
  'quickInnovation',
  'tricksOfTheTrade',
])

export type BoundedRiskSearchEvidence =
  | 'complete-bounded-search'
  | 'root-infeasible'
  | 'node-budget-exhausted'

export type BoundedRiskDecisionEvidence =
  | 'candidate-higher-bounded-probability'
  | 'baseline-equal-or-better'
  | 'candidate-no-bounded-route'
  | 'incomplete-search-fallback'

export interface BoundedRiskFinisherRoute {
  version: typeof BOUNDED_RISK_FINISHER_VERSION
  conditionAssumption: 'observed-root-then-normal'
  branchAssumption: 'listed-risk-actions-succeed'
  actions: readonly CraftActionId[]
  successProbability: number
  riskyActionCount: number
  projectedState: CraftState
}

export interface BoundedRiskRootEvaluation {
  rootAction: CraftActionId
  route: BoundedRiskFinisherRoute | null
  complete: boolean
  evidence: BoundedRiskSearchEvidence
  expandedNodes: number
}

export interface BoundedRiskFinisherDecision {
  version: typeof BOUNDED_RISK_FINISHER_VERSION
  action: CraftActionId
  successProbability: number
  evidence: BoundedRiskDecisionEvidence
  candidate: BoundedRiskRootEvaluation
  baseline: BoundedRiskRootEvaluation
  elapsedMs: number
}

export interface BoundedRiskFinisherOptions {
  maxRemainderActions?: number
  maxRiskyActions?: number
  maxNodeExpansionsPerRoot?: number
  /** Diagnostic timing seam only. It cannot change the selected action. */
  now?: () => number
}

interface ResolvedSearchOptions {
  maxRemainderActions: number
  maxRiskyActions: number
  maxNodeExpansionsPerRoot: number
  now: () => number
}

interface RemainderRoute {
  actions: CraftActionId[]
  successProbability: number
  riskyActionCount: number
  projectedState: CraftState
}

interface RemainderSearchResult {
  route: RemainderRoute | null
  complete: boolean
  evidence: Exclude<BoundedRiskSearchEvidence, 'root-infeasible'>
  expandedNodes: number
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
  return value
}

function resolveOptions(options: BoundedRiskFinisherOptions): ResolvedSearchOptions {
  return {
    maxRemainderActions: boundedInteger(
      options.maxRemainderActions ?? DEFAULT_MAX_REMAINDER_ACTIONS,
      0,
      6,
      'maxRemainderActions',
    ),
    maxRiskyActions: boundedInteger(
      options.maxRiskyActions ?? DEFAULT_MAX_RISKY_ACTIONS,
      0,
      2,
      'maxRiskyActions',
    ),
    maxNodeExpansionsPerRoot: boundedInteger(
      options.maxNodeExpansionsPerRoot ?? DEFAULT_MAX_NODE_EXPANSIONS_PER_ROOT,
      1,
      1_000_000,
      'maxNodeExpansionsPerRoot',
    ),
    now: options.now ?? Date.now,
  }
}

function routeCandidates(
  recipe: RecipeProfile,
  state: CraftState,
  remainingActions: number,
): readonly CraftActionId[] {
  return REMAINDER_ACTIONS.filter((action) => {
    const definition = ACTIONS[action]
    if (state.quality >= recipe.requiredQuality && definition.category === 'quality') return false
    if (state.buffs.innovation > 0 && (action === 'innovation' || action === 'quickInnovation')) return false
    if (state.buffs.greatStrides > 0 && action === 'greatStrides') return false
    if (state.buffs.veneration > 0 && action === 'veneration') return false
    if (state.buffs.wasteNot > 0 && (action === 'wasteNot' || action === 'wasteNot2')) return false
    if (state.buffs.manipulation > 0 && action === 'manipulation') return false
    if (action === 'observe' && !(state.buffs.manipulation > 0 && state.durability <= 10)) return false
    if ((action === 'mastersMend' || action === 'immaculateMend') && state.durability >= 20) return false
    if (remainingActions <= 1 && SETUP_ACTIONS.has(action)) return false
    return true
  })
}

function bestCompletionRemainder(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialState: CraftState,
  initialRiskyActionCount: number,
  options: ResolvedSearchOptions,
): RemainderSearchResult {
  let best: RemainderRoute | null = null
  let evidence: RemainderSearchResult['evidence'] = 'complete-bounded-search'
  let expandedNodes = 0
  const seen = new Map<string, number>()

  const visit = (
    state: CraftState,
    actions: CraftActionId[],
    riskyActionCount: number,
    successProbability: number,
  ): void => {
    if (evidence !== 'complete-bounded-search') return
    if (expandedNodes >= options.maxNodeExpansionsPerRoot) {
      evidence = 'node-budget-exhausted'
      return
    }
    expandedNodes += 1

    if (state.terminal === 'completed') {
      if (
        best === null
        || successProbability > best.successProbability
        || successProbability === best.successProbability && actions.length < best.actions.length
      ) {
        best = {
          actions,
          successProbability,
          riskyActionCount,
          projectedState: state,
        }
      }
      return
    }
    if (state.terminal !== 'none' || actions.length >= options.maxRemainderActions) return
    if (best !== null && successProbability <= best.successProbability) return

    const key = `${actions.length}|${riskyActionCount}|${JSON.stringify(state)}`
    if ((seen.get(key) ?? -1) >= successProbability) return
    seen.set(key, successProbability)

    const remainingActions = options.maxRemainderActions - actions.length
    for (const action of routeCandidates(recipe, state, remainingActions)) {
      const isRisky = RISKY_ACTIONS.has(action)
      if (isRisky && riskyActionCount >= options.maxRiskyActions) continue
      const preview = previewAction(recipe, crafter, state, action)
      if (!preview.legal || !isPolicyActionSafe(recipe, crafter, state, action, preview)) continue
      const nextState = applyObservedOutcome(recipe, crafter, state, action, {
        success: true,
        nextCondition: 'normal',
      }).nextState
      visit(
        nextState,
        [...actions, action],
        riskyActionCount + Number(isRisky),
        successProbability * preview.successRate,
      )
      if (evidence !== 'complete-bounded-search') return
    }
  }

  visit(initialState, [], initialRiskyActionCount, 1)
  return {
    route: best,
    complete: evidence === 'complete-bounded-search',
    evidence,
    expandedNodes,
  }
}

function evaluateRoot(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  rootAction: CraftActionId,
  options: ResolvedSearchOptions,
): BoundedRiskRootEvaluation {
  const preview = previewAction(recipe, crafter, state, rootAction)
  if (!preview.legal || !isPolicyActionSafe(recipe, crafter, state, rootAction, preview)) {
    return {
      rootAction,
      route: null,
      complete: true,
      evidence: 'root-infeasible',
      expandedNodes: 0,
    }
  }

  const rootRiskyActionCount = Number(RISKY_ACTIONS.has(rootAction))
  if (rootRiskyActionCount > options.maxRiskyActions) {
    return {
      rootAction,
      route: null,
      complete: true,
      evidence: 'root-infeasible',
      expandedNodes: 0,
    }
  }
  const afterRoot = applyObservedOutcome(recipe, crafter, state, rootAction, {
    success: true,
    nextCondition: 'normal',
  }).nextState
  if (afterRoot.terminal === 'completed') {
    return {
      rootAction,
      route: {
        version: BOUNDED_RISK_FINISHER_VERSION,
        conditionAssumption: 'observed-root-then-normal',
        branchAssumption: 'listed-risk-actions-succeed',
        actions: [rootAction],
        successProbability: preview.successRate,
        riskyActionCount: rootRiskyActionCount,
        projectedState: afterRoot,
      },
      complete: true,
      evidence: 'complete-bounded-search',
      expandedNodes: 0,
    }
  }
  if (afterRoot.terminal === 'failed') {
    return {
      rootAction,
      route: null,
      complete: true,
      evidence: 'complete-bounded-search',
      expandedNodes: 0,
    }
  }

  const remainder = bestCompletionRemainder(
    recipe,
    crafter,
    afterRoot,
    rootRiskyActionCount,
    options,
  )
  return {
    rootAction,
    route: remainder.route === null
      ? null
      : {
          version: BOUNDED_RISK_FINISHER_VERSION,
          conditionAssumption: 'observed-root-then-normal',
          branchAssumption: 'listed-risk-actions-succeed',
          actions: [rootAction, ...remainder.route.actions],
          successProbability: preview.successRate * remainder.route.successProbability,
          riskyActionCount: remainder.route.riskyActionCount,
          projectedState: remainder.route.projectedState,
        },
    complete: remainder.complete,
    evidence: remainder.evidence,
    expandedNodes: remainder.expandedNodes,
  }
}

/**
 * Compares two currently observable root actions without sampling future RNG.
 * The current condition applies to each root; every later step is held at
 * Normal. Rapid/Hasty/Daring are followed only through their success branches,
 * and the returned route probability is the exact product of those rates.
 *
 * An incomplete search always returns the baseline action. The deterministic
 * per-root node cap is the only action-selection work bound. Wall-clock time is
 * reported after the decision but cannot alter exploration or the chosen action.
 */
export function compareBoundedRiskFinisherRoots(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  candidateAction: CraftActionId,
  baselineAction: CraftActionId,
  requestedOptions: BoundedRiskFinisherOptions = {},
): BoundedRiskFinisherDecision {
  const options = resolveOptions(requestedOptions)
  const startedAt = options.now()
  const candidate = evaluateRoot(
    recipe,
    crafter,
    state,
    candidateAction,
    options,
  )
  const baseline = evaluateRoot(
    recipe,
    crafter,
    state,
    baselineAction,
    options,
  )

  let action = baselineAction
  let evidence: BoundedRiskDecisionEvidence
  if (!candidate.complete || !baseline.complete) {
    evidence = 'incomplete-search-fallback'
  } else if (candidate.route === null) {
    evidence = 'candidate-no-bounded-route'
  } else if (
    candidate.route.successProbability
    > (baseline.route?.successProbability ?? 0)
  ) {
    action = candidateAction
    evidence = 'candidate-higher-bounded-probability'
  } else {
    evidence = 'baseline-equal-or-better'
  }

  const chosenRoute = action === candidateAction ? candidate.route : baseline.route
  return {
    version: BOUNDED_RISK_FINISHER_VERSION,
    action,
    successProbability: chosenRoute?.successProbability ?? 0,
    evidence,
    candidate,
    baseline,
    elapsedMs: Math.max(0, options.now() - startedAt),
  }
}
