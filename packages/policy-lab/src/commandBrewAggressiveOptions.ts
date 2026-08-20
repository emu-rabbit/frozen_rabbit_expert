import {
  ACTIONS,
  applyObservedOutcome,
  assertCraftObjective,
  assertCraftState,
  craftScenarioModelContentHash,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  advanceGuideIntegratedDecisionMemory,
  cloneGuideIntegratedDecisionMemory,
  craftAdaptivePolicyContextContentHashV1,
  craftAdaptivePolicyStateContentHashV1,
  createGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyController,
  GUIDE_SCENARIO_POLICY_BINDINGS,
  type GuideIntegratedDecisionMemory,
  type CraftAdaptivePolicyRuntimeContentHash,
} from '@frozen-rabbit-expert/solver'

export const COMMAND_BREW_GUIDE_EXTRACTED_RISK_OPTIONS_VERSION =
  'command-brew-guide-extracted-risk-options-v0.1.0'

export const COMMAND_BREW_GUIDE_EXTRACTED_OPTION_IDS = [
  'route-mainline',
  'progress-risk-loop',
  'quality-risk-loop',
  'condition-opportunity',
  'bounded-condition-fishing',
  'quality-burst',
  'resource-recovery',
  'safe-finish',
] as const

export type CommandBrewGuideExtractedOptionId =
  (typeof COMMAND_BREW_GUIDE_EXTRACTED_OPTION_IDS)[number]

export interface CommandBrewGuideExtractedOptionContext {
  scenarioId: string
  recipe: RecipeProfile
  objective: CraftObjective
  crafter: CrafterProfile
}

/**
 * Development audit boundary, not a claim about the real game distribution.
 * The controller reports an exceedance but deliberately keeps the protected
 * released guide action. Changing the action would turn a representation
 * checkpoint into an unvalidated policy change.
 */
export interface CommandBrewRiskAuditBudget {
  maxTotalAttempts: number
  maxProgressAttempts: number
  maxQualityAttempts: number
  maxConsecutiveFailures: number
  maxConsecutiveProgressFailures: number
  maxConsecutiveQualityFailures: number
  maxConditionFishingUses: number
}

/** Full U-panel development audit: 128 seeds x three plausible worlds. */
export const COMMAND_BREW_U_DEVELOPMENT_OBSERVED_RISK_ENVELOPE_V1 = {
  corpusId: 'command-brew-development-384-v1',
  episodes: 384,
  completed: 384,
  quality10200: 159,
  fullQuality12000: 145,
  episodesWithRiskFailures: 355,
  totalRiskFailures: 1_643,
  maximumTotalAttempts: 17,
  maximumProgressAttempts: 12,
  maximumQualityAttempts: 8,
  maximumConsecutiveFailures: 8,
  maximumConsecutiveProgressFailures: 8,
  maximumConsecutiveQualityFailures: 5,
  maximumConditionFishingUses: 0,
  minimumCpAfterRiskFailure: 0,
  minimumDurabilityAfterRiskFailure: 5,
} as const

export const COMMAND_BREW_DEVELOPMENT_RISK_AUDIT_BUDGET_V1: Readonly<CommandBrewRiskAuditBudget> = {
  // One-attempt headroom over the complete U development observation. These
  // caps describe the portable representation's audit boundary; they do not
  // rewrite the released guide action when exceeded.
  maxTotalAttempts: 18,
  maxProgressAttempts: 13,
  maxQualityAttempts: 9,
  maxConsecutiveFailures: 9,
  maxConsecutiveProgressFailures: 9,
  maxConsecutiveQualityFailures: 6,
  maxConditionFishingUses: 1,
}

export interface CommandBrewRiskCounters {
  totalAttempts: number
  totalSuccesses: number
  totalFailures: number
  progressAttempts: number
  progressSuccesses: number
  progressFailures: number
  qualityAttempts: number
  qualitySuccesses: number
  qualityFailures: number
  consecutiveFailures: number
  maximumConsecutiveFailures: number
  consecutiveProgressFailures: number
  maximumConsecutiveProgressFailures: number
  consecutiveQualityFailures: number
  maximumConsecutiveQualityFailures: number
  conditionFishingUses: number
  conditionFishingGoodHits: number
  conditionFishingMisses: number
}

export interface SerializableCommandBrewGuideExtractedOptionMemory {
  version: typeof COMMAND_BREW_GUIDE_EXTRACTED_RISK_OPTIONS_VERSION
  guidePolicyVersion: typeof SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION
  guideMemory: GuideIntegratedDecisionMemory
  contextContentHash: CraftAdaptivePolicyRuntimeContentHash
  initialStateHash: CraftAdaptivePolicyRuntimeContentHash
  lastObservedStateHash: CraftAdaptivePolicyRuntimeContentHash | null
  totalObservedTransitions: number
  activeOptionId: CommandBrewGuideExtractedOptionId
  recoveryFromOptionId: 'progress-risk-loop' | 'quality-risk-loop' | null
  lastActualAction: CraftActionId | null
  lastActualActionSucceeded: boolean | null
  risk: CommandBrewRiskCounters
  budgetExceeded: boolean
}

export interface CommandBrewGuideExtractedOptionDecision {
  action: CraftActionId | null
  optionId: CommandBrewGuideExtractedOptionId
  resumeOptionId: 'progress-risk-loop' | 'quality-risk-loop' | null
  reason: string
  currentWithinAuditEnvelope: boolean
  projectedWithinAuditEnvelope: boolean
  memory: SerializableCommandBrewGuideExtractedOptionMemory
}

export interface ObservedCommandBrewGuideExtractedTransition {
  before: CraftState
  action: CraftActionId
  success: boolean
  after: CraftState
}

/**
 * Action-segmentation and replay scaffold over the protected guide, not yet
 * an independently executable option FSM. activeOptionId and
 * recoveryFromOptionId explain guide action/history; they do not commit an
 * independent continuation.
 */
export interface CommandBrewGuideExtractedOptionController {
  readonly context: CommandBrewGuideExtractedOptionContext
  snapshot(): SerializableCommandBrewGuideExtractedOptionMemory
  decide(state: Readonly<CraftState>): CommandBrewGuideExtractedOptionDecision
  /** Accepts a different legal actual action after a recommendation. */
  advance(
    observed: Readonly<ObservedCommandBrewGuideExtractedTransition>,
  ): SerializableCommandBrewGuideExtractedOptionMemory
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`)
  return value
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer`)
  return value
}

function cloneRiskCounters(risk: Readonly<CommandBrewRiskCounters>): CommandBrewRiskCounters {
  const clone = { ...risk }
  for (const [key, value] of Object.entries(clone)) nonNegativeInteger(value, `risk.${key}`)
  if (clone.totalAttempts !== clone.totalSuccesses + clone.totalFailures) {
    throw new Error('risk total attempts do not equal successes plus failures')
  }
  if (clone.progressAttempts !== clone.progressSuccesses + clone.progressFailures) {
    throw new Error('progress risk attempts do not equal successes plus failures')
  }
  if (clone.qualityAttempts !== clone.qualitySuccesses + clone.qualityFailures) {
    throw new Error('quality risk attempts do not equal successes plus failures')
  }
  if (clone.totalAttempts !== clone.progressAttempts + clone.qualityAttempts) {
    throw new Error('risk total attempts do not equal progress plus quality attempts')
  }
  if (clone.maximumConsecutiveFailures < clone.consecutiveFailures) {
    throw new Error('maximum consecutive risk failures is below the current streak')
  }
  if (clone.maximumConsecutiveProgressFailures < clone.consecutiveProgressFailures) {
    throw new Error('maximum consecutive progress failures is below the current streak')
  }
  if (clone.maximumConsecutiveQualityFailures < clone.consecutiveQualityFailures) {
    throw new Error('maximum consecutive quality failures is below the current streak')
  }
  if (clone.conditionFishingGoodHits + clone.conditionFishingMisses > clone.conditionFishingUses) {
    throw new Error('condition fishing outcomes exceed uses')
  }
  return clone
}

function cloneMemory(
  memory: Readonly<SerializableCommandBrewGuideExtractedOptionMemory>,
  expectedContextContentHash?: CraftAdaptivePolicyRuntimeContentHash,
): SerializableCommandBrewGuideExtractedOptionMemory {
  if (memory.version !== COMMAND_BREW_GUIDE_EXTRACTED_RISK_OPTIONS_VERSION) {
    throw new Error(`Command Brew option memory version mismatch: ${memory.version}`)
  }
  if (memory.guidePolicyVersion !== SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION) {
    throw new Error(`Command Brew guide policy version mismatch: ${memory.guidePolicyVersion}`)
  }
  if (!COMMAND_BREW_GUIDE_EXTRACTED_OPTION_IDS.includes(memory.activeOptionId)) {
    throw new Error(`unknown Command Brew option id: ${memory.activeOptionId}`)
  }
  if (
    memory.recoveryFromOptionId !== null
    && memory.recoveryFromOptionId !== 'progress-risk-loop'
    && memory.recoveryFromOptionId !== 'quality-risk-loop'
  ) throw new Error('unknown Command Brew recovery source option')
  const guideMemory = cloneGuideIntegratedDecisionMemory(memory.guideMemory)
  if (!/^sha256:[0-9a-f]{64}$/.test(memory.contextContentHash)) {
    throw new Error('Command Brew option context content hash is invalid')
  }
  if (
    expectedContextContentHash !== undefined
    && memory.contextContentHash !== expectedContextContentHash
  ) throw new Error('Command Brew option memory context binding mismatch')
  if (!/^sha256:[0-9a-f]{64}$/.test(memory.initialStateHash)) {
    throw new Error('Command Brew option initial state hash is invalid')
  }
  if (
    memory.lastObservedStateHash !== null
    && !/^sha256:[0-9a-f]{64}$/.test(memory.lastObservedStateHash)
  ) throw new Error('Command Brew option last observed state hash is invalid')
  const totalObservedTransitions = nonNegativeInteger(
    memory.totalObservedTransitions,
    'totalObservedTransitions',
  )
  if (guideMemory.actionUses !== totalObservedTransitions) {
    throw new Error('guide action memory and observed transition count drifted')
  }
  if ((totalObservedTransitions === 0) !== (memory.lastObservedStateHash === null)) {
    throw new Error('last observed state hash does not match the observed transition count')
  }
  if ((memory.lastActualAction === null) !== (memory.lastActualActionSucceeded === null)) {
    throw new Error('last actual action and observed result must both be present or absent')
  }
  if ((totalObservedTransitions === 0) !== (memory.lastActualAction === null)) {
    throw new Error('last actual action does not match the observed transition count')
  }
  if (memory.risk.totalAttempts > totalObservedTransitions) {
    throw new Error('risk attempts exceed observed transitions')
  }
  return {
    ...memory,
    guideMemory,
    contextContentHash: memory.contextContentHash,
    initialStateHash: memory.initialStateHash,
    lastObservedStateHash: memory.lastObservedStateHash,
    totalObservedTransitions,
    risk: cloneRiskCounters(memory.risk),
  }
}

function initialRiskCounters(): CommandBrewRiskCounters {
  return {
    totalAttempts: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    progressAttempts: 0,
    progressSuccesses: 0,
    progressFailures: 0,
    qualityAttempts: 0,
    qualitySuccesses: 0,
    qualityFailures: 0,
    consecutiveFailures: 0,
    maximumConsecutiveFailures: 0,
    consecutiveProgressFailures: 0,
    maximumConsecutiveProgressFailures: 0,
    consecutiveQualityFailures: 0,
    maximumConsecutiveQualityFailures: 0,
    conditionFishingUses: 0,
    conditionFishingGoodHits: 0,
    conditionFishingMisses: 0,
  }
}

export function createCommandBrewGuideExtractedOptionMemory(
  contextContentHash: CraftAdaptivePolicyRuntimeContentHash,
  initialStateHash: CraftAdaptivePolicyRuntimeContentHash,
): SerializableCommandBrewGuideExtractedOptionMemory {
  return {
    version: COMMAND_BREW_GUIDE_EXTRACTED_RISK_OPTIONS_VERSION,
    guidePolicyVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
    guideMemory: createGuideIntegratedDecisionMemory(),
    contextContentHash,
    initialStateHash,
    lastObservedStateHash: null,
    totalObservedTransitions: 0,
    activeOptionId: 'route-mainline',
    recoveryFromOptionId: null,
    lastActualAction: null,
    lastActualActionSucceeded: null,
    risk: initialRiskCounters(),
    budgetExceeded: false,
  }
}

function assertRiskBudget(budget: Readonly<CommandBrewRiskAuditBudget>): void {
  positiveInteger(budget.maxTotalAttempts, 'risk budget maxTotalAttempts')
  positiveInteger(budget.maxProgressAttempts, 'risk budget maxProgressAttempts')
  positiveInteger(budget.maxQualityAttempts, 'risk budget maxQualityAttempts')
  positiveInteger(budget.maxConsecutiveFailures, 'risk budget maxConsecutiveFailures')
  positiveInteger(
    budget.maxConsecutiveProgressFailures,
    'risk budget maxConsecutiveProgressFailures',
  )
  positiveInteger(
    budget.maxConsecutiveQualityFailures,
    'risk budget maxConsecutiveQualityFailures',
  )
  positiveInteger(budget.maxConditionFishingUses, 'risk budget maxConditionFishingUses')
  if (budget.maxProgressAttempts > budget.maxTotalAttempts) {
    throw new RangeError('progress risk budget cannot exceed total attempts')
  }
  if (budget.maxQualityAttempts > budget.maxTotalAttempts) {
    throw new RangeError('quality risk budget cannot exceed total attempts')
  }
}

function withinBudget(
  risk: Readonly<CommandBrewRiskCounters>,
  budget: Readonly<CommandBrewRiskAuditBudget>,
): boolean {
  return risk.totalAttempts <= budget.maxTotalAttempts
    && risk.progressAttempts <= budget.maxProgressAttempts
    && risk.qualityAttempts <= budget.maxQualityAttempts
    && risk.maximumConsecutiveFailures <= budget.maxConsecutiveFailures
    && risk.maximumConsecutiveProgressFailures <= budget.maxConsecutiveProgressFailures
    && risk.maximumConsecutiveQualityFailures <= budget.maxConsecutiveQualityFailures
    && risk.conditionFishingUses <= budget.maxConditionFishingUses
}

function projectedRiskCounters(
  current: Readonly<CommandBrewRiskCounters>,
  action: CraftActionId | null,
): CommandBrewRiskCounters {
  if (action === null) return cloneRiskCounters(current)
  const option = riskyOption(action)
  if (option === null && action !== 'observe' && action !== 'carefulObservation') {
    return cloneRiskCounters(current)
  }
  // Projection is intentionally adverse: a stochastic action is checked as a
  // failure and condition fishing as a miss. It is a cap check, not a forecast.
  return advanceRiskCounters(current, action, false, 'normal')
}

function riskyOption(action: CraftActionId): 'progress-risk-loop' | 'quality-risk-loop' | null {
  if (action === 'rapidSynthesis') return 'progress-risk-loop'
  if (action === 'hastyTouch' || action === 'daringTouch') return 'quality-risk-loop'
  return null
}

function classifyOption(
  state: Readonly<CraftState>,
  action: CraftActionId | null,
  memory: Readonly<SerializableCommandBrewGuideExtractedOptionMemory>,
  qualityTarget: number,
): { optionId: CommandBrewGuideExtractedOptionId; reason: string } {
  if (action === null || state.terminal !== 'none') {
    return { optionId: 'safe-finish', reason: 'terminal-or-guide-stopped' }
  }
  if (state.quality >= qualityTarget && ACTIONS[action].category === 'progress') {
    return { optionId: 'safe-finish', reason: 'quality-objective-reached-finish-progress' }
  }
  const risk = riskyOption(action)
  if (risk !== null) return { optionId: risk, reason: `${risk}-guide-action` }
  if (
    state.condition === 'good'
    && (action === 'preciseTouch' || action === 'tricksOfTheTrade' || action === 'intensiveSynthesis')
  ) return { optionId: 'condition-opportunity', reason: 'consume-observed-good' }
  if (memory.recoveryFromOptionId !== null) {
    return { optionId: 'resource-recovery', reason: 'recover-after-observed-risk-failure' }
  }
  if (action === 'observe' || action === 'carefulObservation') {
    return { optionId: 'bounded-condition-fishing', reason: 'explicit-condition-reroll' }
  }
  if (action === 'greatStrides' || action === 'innovation' || action === 'byregotsBlessing') {
    return { optionId: 'quality-burst', reason: 'quality-burst-setup-or-cashout' }
  }
  if (
    ACTIONS[action].category === 'repair'
    || state.durability <= 10
  ) return { optionId: 'resource-recovery', reason: 'recover-after-risk-or-resource-boundary' }
  return { optionId: 'route-mainline', reason: 'protected-guide-mainline' }
}

function advanceRiskCounters(
  current: Readonly<CommandBrewRiskCounters>,
  action: CraftActionId,
  success: boolean,
  nextCondition: CraftState['condition'],
): CommandBrewRiskCounters {
  const risk = cloneRiskCounters(current)
  const option = riskyOption(action)
  if (option !== null) {
    risk.totalAttempts += 1
    if (success) risk.totalSuccesses += 1
    else risk.totalFailures += 1
    if (option === 'progress-risk-loop') {
      risk.progressAttempts += 1
      if (success) risk.progressSuccesses += 1
      else risk.progressFailures += 1
      risk.consecutiveProgressFailures = success ? 0 : risk.consecutiveProgressFailures + 1
      risk.maximumConsecutiveProgressFailures = Math.max(
        risk.maximumConsecutiveProgressFailures,
        risk.consecutiveProgressFailures,
      )
    } else {
      risk.qualityAttempts += 1
      if (success) risk.qualitySuccesses += 1
      else risk.qualityFailures += 1
      risk.consecutiveQualityFailures = success ? 0 : risk.consecutiveQualityFailures + 1
      risk.maximumConsecutiveQualityFailures = Math.max(
        risk.maximumConsecutiveQualityFailures,
        risk.consecutiveQualityFailures,
      )
    }
    risk.consecutiveFailures = success ? 0 : risk.consecutiveFailures + 1
    risk.maximumConsecutiveFailures = Math.max(
      risk.maximumConsecutiveFailures,
      risk.consecutiveFailures,
    )
  }
  if (action === 'observe' || action === 'carefulObservation') {
    risk.conditionFishingUses += 1
    if (nextCondition === 'good') risk.conditionFishingGoodHits += 1
    else risk.conditionFishingMisses += 1
  }
  return risk
}

export function createCommandBrewGuideExtractedOptionController(
  context: Readonly<CommandBrewGuideExtractedOptionContext>,
  options: {
    initialMemory?: Readonly<SerializableCommandBrewGuideExtractedOptionMemory>
    riskAuditBudget?: Readonly<CommandBrewRiskAuditBudget>
  } = {},
): CommandBrewGuideExtractedOptionController {
  assertCraftObjective(context.recipe, context.objective)
  const binding = GUIDE_SCENARIO_POLICY_BINDINGS['survey-craftsmans-command-brew']
  if (context.scenarioId !== 'survey-craftsmans-command-brew') {
    throw new Error('Command Brew option controller scenario binding mismatch')
  }
  if (context.recipe.profileId !== binding.recipeProfileId) {
    throw new Error('Command Brew option controller recipe binding mismatch')
  }
  if (context.objective.objectiveId !== binding.objectiveId) {
    throw new Error('Command Brew option controller objective binding mismatch')
  }
  if (craftScenarioModelContentHash(context.recipe, context.objective) !== binding.scenarioModelContentHash) {
    throw new Error('Command Brew option controller scenario model content hash mismatch')
  }
  const boundContext: CommandBrewGuideExtractedOptionContext = structuredClone({
    scenarioId: context.scenarioId,
    recipe: context.recipe,
    objective: context.objective,
    crafter: { ...context.crafter, specialist: context.crafter.specialist === true },
  })
  const deepFreeze = (value: unknown): void => {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze)
      Object.freeze(value)
    }
  }
  deepFreeze(boundContext)
  assertCraftState(
    boundContext.recipe,
    boundContext.crafter,
    createInitialCraftState(boundContext.recipe, boundContext.crafter),
  )
  const contextContentHash = craftAdaptivePolicyContextContentHashV1(boundContext)
  const initialStateHash = craftAdaptivePolicyStateContentHashV1(
    createInitialCraftState(boundContext.recipe, boundContext.crafter),
  )
  const budget = {
    ...COMMAND_BREW_DEVELOPMENT_RISK_AUDIT_BUDGET_V1,
    ...options.riskAuditBudget,
  }
  assertRiskBudget(budget)
  let memory = cloneMemory(
    options.initialMemory ?? createCommandBrewGuideExtractedOptionMemory(contextContentHash, initialStateHash),
    contextContentHash,
  )
  if (memory.initialStateHash !== initialStateHash) {
    throw new Error('Command Brew option memory initial state binding mismatch')
  }
  let pendingStateHash: string | null = null

  return {
    context: boundContext,
    snapshot: () => cloneMemory(memory, contextContentHash),
    decide: (state) => {
      assertCraftState(boundContext.recipe, boundContext.crafter, state)
      const stateHash = craftAdaptivePolicyStateContentHashV1(state)
      if (memory.totalObservedTransitions === 0 && stateHash !== memory.initialStateHash) {
        throw new Error('Command Brew option fresh memory only accepts the exact initial state')
      }
      if (
        memory.lastObservedStateHash !== null
        && memory.lastObservedStateHash !== stateHash
      ) throw new Error('Command Brew option decision state is not continuous with observed memory')
      const guide = createGuideIntegratedPolicyController(
        DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
        memory.guideMemory,
        boundContext.objective,
      )
      const action = guide.policy(boundContext.recipe, boundContext.crafter, structuredClone(state))
      const classification = classifyOption(state, action, memory, boundContext.objective.qualityTarget)
      const currentWithinAuditEnvelope = withinBudget(memory.risk, budget)
      const projectedWithinAuditEnvelope = withinBudget(
        projectedRiskCounters(memory.risk, action),
        budget,
      )
      const decision: CommandBrewGuideExtractedOptionDecision = {
        action,
        ...classification,
        resumeOptionId: classification.optionId === 'resource-recovery'
          ? memory.recoveryFromOptionId
          : null,
        reason: currentWithinAuditEnvelope && projectedWithinAuditEnvelope
          ? classification.reason
          : `${classification.reason}:risk-audit-budget-current-or-projected-exceeded`,
        currentWithinAuditEnvelope,
        projectedWithinAuditEnvelope,
        memory: cloneMemory(memory, contextContentHash),
      }
      pendingStateHash = stateHash
      return decision
    },
    advance: (observed) => {
      if (pendingStateHash === null) throw new Error('Command Brew option advance requires a preceding decision')
      if (pendingStateHash !== craftAdaptivePolicyStateContentHashV1(observed.before)) {
        throw new Error('Command Brew option advance before-state does not match the pending decision')
      }
      const preview = previewAction(boundContext.recipe, boundContext.crafter, observed.before, observed.action)
      if (!preview.legal) throw new Error(`cannot advance illegal observed action ${observed.action}`)
      const expectedAfter = applyObservedOutcome(
        boundContext.recipe,
        boundContext.crafter,
        observed.before,
        observed.action,
        { success: observed.success, nextCondition: observed.after.condition },
      ).nextState
      if (
        craftAdaptivePolicyStateContentHashV1(expectedAfter)
        !== craftAdaptivePolicyStateContentHashV1(observed.after)
      ) throw new Error('Command Brew option observed after-state does not match mechanics')

      const actualRiskOption = riskyOption(observed.action)
      const nextRisk = advanceRiskCounters(
        memory.risk,
        observed.action,
        observed.success,
        observed.after.condition,
      )
      let recoveryFromOptionId = memory.recoveryFromOptionId
      if (actualRiskOption !== null) recoveryFromOptionId = observed.success ? null : actualRiskOption
      else if (
        recoveryFromOptionId !== null
        && (ACTIONS[observed.action].category === 'progress' || ACTIONS[observed.action].category === 'quality')
      ) recoveryFromOptionId = null
      const actualClassification = classifyOption(
        observed.before,
        observed.action,
        memory,
        boundContext.objective.qualityTarget,
      )
      memory = cloneMemory({
        ...memory,
        guideMemory: advanceGuideIntegratedDecisionMemory(memory.guideMemory, observed.action),
        contextContentHash,
        lastObservedStateHash: craftAdaptivePolicyStateContentHashV1(observed.after),
        totalObservedTransitions: memory.totalObservedTransitions + 1,
        activeOptionId: actualClassification.optionId,
        recoveryFromOptionId,
        lastActualAction: observed.action,
        lastActualActionSucceeded: observed.success,
        risk: nextRisk,
        budgetExceeded: memory.budgetExceeded || !withinBudget(nextRisk, budget),
      }, contextContentHash)
      pendingStateHash = null
      return cloneMemory(memory, contextContentHash)
    },
  }
}
