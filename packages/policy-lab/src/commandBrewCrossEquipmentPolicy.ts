import {
  ACTIONS,
  applyObservedOutcome,
  calculateBaseProgress,
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  createGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyController,
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'

export const COMMAND_BREW_CROSS_EQUIPMENT_POLICY_VERSION =
  'command-brew-cross-equipment-route-candidate-v0.1.0'
export const COMMAND_BREW_CONDITION_AWARE_GUIDE_POLICY_VERSION =
  'command-brew-condition-aware-guide-candidate-v0.1.0'

/**
 * Development-only all-Normal route found by deterministic beam search. The
 * controller below treats this as a route skeleton, not as a macro: it skips
 * progress steps that would finish before the quality phase and chooses the
 * route from crafter stats rather than an equipment/profile id.
 */
export const COMMAND_BREW_LOW_RESOURCE_ROUTE = [
  'muscleMemory',
  'manipulation',
  'veneration',
  'wasteNot',
  'groundwork',
  'groundwork',
  'groundwork',
  'delicateSynthesis',
  'veneration',
  'groundwork',
  'carefulSynthesis',
  'delicateSynthesis',
  'prudentTouch',
  'immaculateMend',
  'trainedPerfection',
  'innovation',
  'basicTouch',
  'standardTouch',
  'advancedTouch',
  'innovation',
  'basicTouch',
  'refinedTouch',
  'byregotsBlessing',
  'basicSynthesis',
] as const satisfies readonly CraftActionId[]

const FINAL_SYNTHESIS_INDEX = COMMAND_BREW_LOW_RESOURCE_ROUTE.length - 1

export type CommandBrewCrossEquipmentMode =
  | 'guide'
  | 'low-resource-route'
  | 'guide-outside-deterministic-envelope'

export interface CommandBrewCrossEquipmentPolicyController {
  readonly mode: CommandBrewCrossEquipmentMode
  readonly policy: EpisodePolicy
}

export interface DeterministicPolicyProbe {
  readonly terminal: CraftState['terminal']
  readonly quality: number
  readonly actionCount: number
  readonly riskyActionUses: number
  readonly stopped: boolean
}

function safeDeterministicAction(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
): boolean {
  const preview = previewAction(recipe, crafter, state, action)
  return preview.legal
    && preview.successRate === 1
    && legalActions(recipe, crafter, state).includes(action)
    && isPolicyActionSafe(recipe, crafter, state, action, preview)
}

function secondVenerationIsRedundant(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
): boolean {
  let projected: CraftState = { ...state, condition: 'normal' }
  for (const action of ['groundwork', 'carefulSynthesis', 'delicateSynthesis'] as const) {
    const preview = previewAction(recipe, crafter, projected, action)
    if (!preview.legal || preview.successRate < 1) return false
    projected = applyObservedOutcome(recipe, crafter, projected, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    if (projected.terminal !== 'none') return false
  }
  const finalBasicSynthesisGain = Math.floor(
    (Math.floor(calculateBaseProgress(recipe, crafter)) * ACTIONS.basicSynthesis.progressPotency!) / 100,
  )
  return projected.progress + finalBasicSynthesisGain >= recipe.progressRequired
}

/**
 * A profile-id-free capability probe. It deliberately requires an all-Normal
 * guide path with no probabilistic actions before retaining the released
 * guide route for a crafter panel.
 */
export function probePolicyOnAllNormal(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  policy: EpisodePolicy,
  maxActions = 80,
): DeterministicPolicyProbe {
  return probePolicyFromStateOnAllNormal(
    recipe,
    crafter,
    createInitialCraftState(recipe, crafter),
    policy,
    maxActions,
  )
}

function probePolicyFromStateOnAllNormal(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialState: CraftState,
  policy: EpisodePolicy,
  maxActions: number,
): DeterministicPolicyProbe {
  let state = initialState
  let riskyActionUses = 0
  let actionCount = 0
  while (state.terminal === 'none' && actionCount < maxActions) {
    const action = policy(recipe, crafter, state)
    if (action === null) {
      return { terminal: state.terminal, quality: state.quality, actionCount, riskyActionUses, stopped: true }
    }
    const preview = previewAction(recipe, crafter, state, action)
    if (!preview.legal || !legalActions(recipe, crafter, state).includes(action)) {
      return { terminal: state.terminal, quality: state.quality, actionCount, riskyActionUses, stopped: true }
    }
    if (preview.successRate < 1) riskyActionUses += 1
    state = applyObservedOutcome(recipe, crafter, state, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    actionCount += 1
  }
  return {
    terminal: state.terminal,
    quality: state.quality,
    actionCount,
    riskyActionUses,
    stopped: state.terminal === 'none',
  }
}

function createLowResourceRoutePolicy(objective: Readonly<CraftObjective>): EpisodePolicy {
  let routeIndex = 0
  let usedFinalAppraisal = false
  const fallbackGuide = createGuideIntegratedPolicyFactory(
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
    objective,
  )()

  return (recipe, crafter, state) => {
    if (state.terminal !== 'none') return null
    if (state.quality >= recipe.qualityMax) routeIndex = FINAL_SYNTHESIS_INDEX

    while (routeIndex < COMMAND_BREW_LOW_RESOURCE_ROUTE.length) {
      const expected = COMMAND_BREW_LOW_RESOURCE_ROUTE[routeIndex]!
      if (
        routeIndex === 8
        && expected === 'veneration'
        && secondVenerationIsRedundant(recipe, crafter, state)
      ) {
        routeIndex += 1
        continue
      }
      if (
        usedFinalAppraisal
        && expected === 'refinedTouch'
        && state.cp < previewAction(recipe, crafter, state, 'refinedTouch').cpCost
          + ACTIONS.byregotsBlessing.cpCost
        && safeDeterministicAction(recipe, crafter, state, 'basicTouch')
      ) {
        routeIndex += 1
        return 'basicTouch'
      }
      const preview = previewAction(recipe, crafter, state, expected)
      const beforeFinalSynthesis = routeIndex < FINAL_SYNTHESIS_INDEX
      const wouldPrematurelyComplete = beforeFinalSynthesis
        && preview.progressGain > 0
        && state.progress + preview.progressGain >= recipe.progressRequired

      if (wouldPrematurelyComplete) {
        const finalBasicSynthesisGain = Math.floor(
          (Math.floor(calculateBaseProgress(recipe, crafter)) * ACTIONS.basicSynthesis.progressPotency!) / 100,
        )
        const finalProgressAlreadySecured = state.progress + finalBasicSynthesisGain >= recipe.progressRequired
        // Final Appraisal converts a lucky Malleable spike into a 9,999
        // progress hold. This keeps the remaining quality sequence alive and
        // avoids spending the last durability on an underpowered fallback.
        if (
          !finalProgressAlreadySecured
          && state.buffs.finalAppraisal === 0
          && safeDeterministicAction(recipe, crafter, state, 'finalAppraisal')
        ) {
          usedFinalAppraisal = true
          return 'finalAppraisal'
        }
        if (state.buffs.finalAppraisal > 0 && safeDeterministicAction(recipe, crafter, state, expected)) {
          routeIndex += 1
          return expected
        }
        routeIndex += 1
        if (preview.qualityGain > 0) {
          for (const substitute of ['prudentTouch', 'basicTouch', 'trainedFinesse'] as const) {
            if (safeDeterministicAction(recipe, crafter, state, substitute)) return substitute
          }
        }
        continue
      }

      if (safeDeterministicAction(recipe, crafter, state, expected)) {
        routeIndex += 1
        return expected
      }

      // A route skeleton is never allowed to turn an unexpected state into an
      // illegal or probabilistic recommendation. Fall through to the released
      // guide, which remains the research safety net.
      break
    }

    return fallbackGuide(recipe, crafter, state)
  }
}

function lowResourceRouteProbe(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  objective: Readonly<CraftObjective>,
): DeterministicPolicyProbe {
  return probePolicyOnAllNormal(
    recipe,
    crafter,
    createLowResourceRoutePolicy(objective),
  )
}

export function createCommandBrewCrossEquipmentPolicyController(
  recipe: Readonly<RecipeProfile>,
  crafter: Readonly<CrafterProfile>,
  objective: Readonly<CraftObjective>,
): CommandBrewCrossEquipmentPolicyController {
  if (objective.recipeProfileId !== recipe.profileId) {
    throw new Error(`objective ${objective.objectiveId} does not belong to recipe ${recipe.profileId}`)
  }
  const guideFactory = createGuideIntegratedPolicyFactory(
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
    objective,
  )
  const guideProbe = probePolicyOnAllNormal(recipe, crafter, guideFactory())
  if (
    guideProbe.terminal === 'completed'
    && guideProbe.quality >= recipe.qualityMax
    && guideProbe.riskyActionUses === 0
  ) {
    return { mode: 'guide', policy: guideFactory() }
  }

  const routeProbe = lowResourceRouteProbe(recipe, crafter, objective)
  if (routeProbe.terminal === 'completed' && routeProbe.riskyActionUses === 0) {
    return { mode: 'low-resource-route', policy: createLowResourceRoutePolicy(objective) }
  }
  return { mode: 'guide-outside-deterministic-envelope', policy: guideFactory() }
}

export function createCommandBrewCrossEquipmentPolicyFactory(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
): (crafter: Readonly<CrafterProfile>) => EpisodePolicy {
  return (crafter) => createCommandBrewCrossEquipmentPolicyController(
    recipe,
    crafter,
    objective,
  ).policy
}

/**
 * A lighter profile-id-free candidate: Normal/Good states keep more progress
 * in reserve for a quality cycle, while a currently Malleable state uses the
 * released balance. One shared decision memory keeps route counters coherent
 * when the condition changes between steps.
 */
export function createCommandBrewConditionAwareGuidePolicy(
  objective: Readonly<CraftObjective>,
): EpisodePolicy {
  let memory = createGuideIntegratedDecisionMemory()
  return (recipe, crafter, state) => {
    const config = state.condition === 'malleable'
      ? DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG
      : {
          ...DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
          progressFloorBeforeQuality: 0.8,
          greatStridesQuality: 0.75,
        }
    const controller = createGuideIntegratedPolicyController(config, memory, objective)
    const action = controller.policy(recipe, crafter, state)
    memory = controller.snapshot()
    return action
  }
}

export function commandBrewRouteUsesOnlyDeterministicActions(): boolean {
  return COMMAND_BREW_LOW_RESOURCE_ROUTE.every((action) => ACTIONS[action].successRate === 1)
}
