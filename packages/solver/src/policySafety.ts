import {
  previewAction,
  type ActionPreview,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'

export type PolicySafetyVetoReason =
  | 'illegal-action'
  | 'premature-completion'
  | 'durability-failure'
  | 'non-advancing-loop'
  | 'unfunded-condition-fishing'

/**
 * Consecutive Observe is a costly condition-fishing option, not an invariant
 * violation. Keep it available only when a high-value quality finisher and a
 * conservative progress finish remain funded after the extra roll.
 */
export function canSpendObserveOnConditionFishing(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  actionPreview?: ActionPreview,
): boolean {
  const observe = actionPreview ?? previewAction(recipe, crafter, state, 'observe')
  if (!observe.legal || state.condition === 'good' || state.quality >= recipe.requiredQuality) return false
  if (state.innerQuiet < 10 || state.progress / recipe.progressRequired < 0.8) return false

  const carefulState = { ...state, condition: 'normal' as const }
  const careful = previewAction(recipe, crafter, carefulState, 'carefulSynthesis')
  if (!careful.legal || careful.progressGain <= 0) return false
  const synthesisSteps = Math.ceil((recipe.progressRequired - state.progress) / careful.progressGain)
  const progressDurability = synthesisSteps * careful.durabilityCost
  const progressCp = synthesisSteps * careful.cpCost
  if (synthesisSteps < 1 || state.durability < progressDurability + 10) return false

  // An active buff must survive this Observe and any setup action before it can
  // be treated as saved. Otherwise reserve enough CP to establish it again.
  const greatStridesCp = state.buffs.greatStrides > 2 ? 0 : 32
  const innovationCp = state.buffs.innovation > 2 ? 0 : 18
  const reserveAfterObserve = progressCp + greatStridesCp + innovationCp + 24
  if (state.cp - observe.cpCost < reserveAfterObserve) return false

  const goodFinisherState: CraftState = {
    ...state,
    condition: 'good',
    buffs: { ...state.buffs, greatStrides: 2, innovation: 2 },
  }
  const blessing = previewAction(recipe, crafter, goodFinisherState, 'byregotsBlessing')
  return blessing.legal && (state.quality + blessing.qualityGain) / recipe.requiredQuality >= 0.95
}

export function policySafetyVetoReason(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  actionPreview?: ActionPreview,
): PolicySafetyVetoReason | null {
  const preview = actionPreview ?? previewAction(recipe, crafter, state, action)
  if (!preview.legal) return 'illegal-action'

  // Final Appraisal is the only no-step action in the current mechanics. Once
  // active, refreshing it changes no decision-relevant state except spending
  // CP, so a deterministic policy would choose it again forever. This is a
  // structural dead loop rather than an opportunity-cost buff refresh.
  if (action === 'finalAppraisal' && state.buffs.finalAppraisal > 0) {
    return 'non-advancing-loop'
  }
  if (
    action === 'observe'
    && state.comboFrom === 'observe'
    && !canSpendObserveOnConditionFishing(recipe, crafter, state, preview)
  ) {
    return 'unfunded-condition-fishing'
  }

  const completesProgress = state.progress + preview.progressGain >= recipe.progressRequired
  const reachesRequiredQuality = state.quality + preview.qualityGain >= recipe.requiredQuality
  if (completesProgress && !reachesRequiredQuality) return 'premature-completion'

  const guaranteedValidCompletion = preview.successRate === 1
    && completesProgress
    && reachesRequiredQuality
  if (preview.durabilityCost >= state.durability && !guaranteedValidCompletion) {
    return 'durability-failure'
  }

  // Buff refreshes and first Observe are opportunity-cost decisions. Keep them
  // in the candidate set so full-episode evaluation can learn when condition
  // value outweighs waste; only an unfunded repeated-Observe loop is gated.
  return null
}

export function isPolicyActionSafe(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  actionPreview?: ActionPreview,
): boolean {
  return policySafetyVetoReason(recipe, crafter, state, action, actionPreview) === null
}
