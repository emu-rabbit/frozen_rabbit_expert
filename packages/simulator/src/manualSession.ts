import {
  ACTIONS,
  MATERIAL_CONDITIONS,
  applyObservedOutcome,
  createInitialCraftState,
  legalActions,
  previewAction,
  type ActionPreview,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { drawSimulatedActionOutcome } from './drawActionOutcome'
import { createEpisodeRandomStream } from './randomStreams'
import type { EpisodeRandomStream, WeightedConditionProfile } from './types'

export const MANUAL_CRAFT_SESSION_SCHEMA = 'manual-craft-session-v1' as const

/**
 * Serializable input history for a blind manual craft. The seeded random
 * streams are deliberately reconstructed from history instead of being
 * exposed through the view/formatter.
 */
export interface ManualCraftSession {
  schema: typeof MANUAL_CRAFT_SESSION_SCHEMA
  scenarioId: string
  recipe: RecipeProfile
  objectiveId: string
  qualityTarget: number
  crafterProfileId: string
  crafter: CrafterProfile
  conditionProfile: WeightedConditionProfile
  seed: number
  maxActions: number
  actions: readonly CraftActionId[]
}

export interface CreateManualCraftSessionOptions {
  scenarioId: string
  recipe: RecipeProfile
  objectiveId: string
  qualityTarget: number
  crafterProfileId: string
  crafter: CrafterProfile
  conditionProfile: WeightedConditionProfile
  seed: number
  maxActions?: number
}

export interface ManualCraftStep {
  before: CraftState
  action: CraftActionId
  success: boolean
  nextCondition: CraftState['condition']
  after: CraftState
  explanationCodes: readonly string[]
}

export interface ManualCraftReplay {
  state: CraftState
  steps: readonly ManualCraftStep[]
}

export interface ManualLegalAction {
  id: CraftActionId
  category: (typeof ACTIONS)[CraftActionId]['category']
  cpCost: number
  durabilityCost: number
  successRate: number
  progressGain: number
  qualityGain: number
}

export interface ManualCraftSessionView {
  scenarioId: string
  recipeName: string
  crafterProfileId: string
  conditionProfileId: string
  conditionEvidence: WeightedConditionProfile['evidence']
  actionCount: number
  maxActions: number
  state: CraftState
  progressRequired: number
  qualityTarget: number
  durabilityMax: number
  maxCp: number
  terminal: CraftState['terminal'] | 'action-limit'
  lastStep: ManualCraftStep | null
  legalActions: readonly ManualLegalAction[]
}

function assertSessionDefinition(session: ManualCraftSession): void {
  if (session.schema !== MANUAL_CRAFT_SESSION_SCHEMA) {
    throw new Error(`Unsupported manual session schema: ${String(session.schema)}`)
  }
  if (!Number.isSafeInteger(session.seed) || session.seed < 0 || session.seed > 0xffff_ffff) {
    throw new RangeError('seed must be an unsigned 32-bit integer')
  }
  if (
    !Number.isInteger(session.qualityTarget)
    || session.qualityTarget < session.recipe.requiredQuality
    || session.qualityTarget > session.recipe.qualityMax
  ) {
    throw new RangeError('qualityTarget must be an integer between requiredQuality and qualityMax')
  }
  if (!Number.isInteger(session.maxActions) || session.maxActions <= 0) {
    throw new RangeError('maxActions must be a positive integer')
  }
  if (session.actions.length > session.maxActions) {
    throw new RangeError('manual session action history exceeds maxActions')
  }
  const available = new Set(session.recipe.availableConditions)
  const validateWeights = (
    weights: Readonly<Partial<Record<CraftState['condition'], number>>>,
    label: string,
  ): void => {
    let total = 0
    for (const [condition, weight] of Object.entries(weights)) {
      if (!MATERIAL_CONDITIONS.includes(condition as CraftState['condition'])) {
        throw new Error(`${label} contains unknown condition: ${condition}`)
      }
      if (!Number.isFinite(weight) || (weight ?? 0) < 0) {
        throw new RangeError(`${label}.${condition} must be a finite non-negative number`)
      }
      if ((weight ?? 0) > 0 && !available.has(condition as CraftState['condition'])) {
        throw new Error(`${label} can draw unsupported condition: ${condition}`)
      }
      total += weight ?? 0
    }
    if (total <= 0) throw new RangeError(`${label} must contain positive total weight`)
  }
  validateWeights(session.conditionProfile.weights, 'conditionProfile.weights')
  for (const [previousCondition, weights] of Object.entries(
    session.conditionProfile.transitionWeights ?? {},
  )) {
    if (!available.has(previousCondition as CraftState['condition'])) {
      throw new Error(`transitionWeights contains unsupported previous condition: ${previousCondition}`)
    }
    validateWeights(weights ?? {}, `conditionProfile.transitionWeights.${previousCondition}`)
  }
}

function applyBlindAction(
  session: ManualCraftSession,
  state: CraftState,
  action: CraftActionId,
  random: EpisodeRandomStream,
): ManualCraftStep {
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
    throw new Error(`Unknown action: ${String(action)}`)
  }
  const preview = previewAction(session.recipe, session.crafter, state, action)
  if (!preview.legal) throw new Error(`Illegal action ${action}: ${preview.reason}`)

  const { success, nextCondition } = drawSimulatedActionOutcome(
    preview,
    state,
    session.conditionProfile,
    random,
  )
  const transition = applyObservedOutcome(
    session.recipe,
    session.crafter,
    state,
    action,
    { success, nextCondition },
  )
  return {
    before: state,
    action,
    success,
    nextCondition,
    after: transition.nextState,
    explanationCodes: transition.explanationCodes,
  }
}

function replayWithRandom(session: ManualCraftSession): ManualCraftReplay & { random: EpisodeRandomStream } {
  assertSessionDefinition(session)
  const random = createEpisodeRandomStream(session.seed)
  const steps: ManualCraftStep[] = []
  let state = createInitialCraftState(session.recipe, session.crafter)

  for (const action of session.actions) {
    if (state.terminal !== 'none') {
      throw new Error(`Manual session contains action ${action} after terminal state`)
    }
    const step = applyBlindAction(session, state, action, random)
    steps.push(step)
    state = step.after
  }
  return { state, steps, random }
}

export function createManualSession(options: CreateManualCraftSessionOptions): ManualCraftSession {
  const session: ManualCraftSession = {
    schema: MANUAL_CRAFT_SESSION_SCHEMA,
    scenarioId: options.scenarioId,
    recipe: options.recipe,
    objectiveId: options.objectiveId,
    qualityTarget: options.qualityTarget,
    crafterProfileId: options.crafterProfileId,
    crafter: { ...options.crafter },
    conditionProfile: options.conditionProfile,
    seed: options.seed,
    maxActions: options.maxActions ?? 80,
    actions: [],
  }
  assertSessionDefinition(session)
  return session
}

export function replayManualSession(session: ManualCraftSession): ManualCraftReplay {
  const { random: _random, ...replay } = replayWithRandom(session)
  return replay
}

export function stepManualSession(
  session: ManualCraftSession,
  action: CraftActionId,
): ManualCraftSession {
  const replay = replayWithRandom(session)
  if (replay.state.terminal !== 'none') {
    throw new Error(`Cannot act after terminal state: ${replay.state.terminal}`)
  }
  if (session.actions.length >= session.maxActions) {
    throw new Error(`Cannot act after action limit: ${session.maxActions}`)
  }
  // Resolve exactly one caller-selected action. No policy or recommendation is
  // consulted here; the random outcome was fixed when the seed was chosen.
  applyBlindAction(session, replay.state, action, replay.random)
  return { ...session, actions: [...session.actions, action] }
}

function toLegalAction(preview: ActionPreview): ManualLegalAction {
  return {
    id: preview.action.id,
    category: preview.action.category,
    cpCost: preview.cpCost,
    durabilityCost: preview.durabilityCost,
    successRate: preview.successRate,
    progressGain: preview.progressGain,
    qualityGain: preview.qualityGain,
  }
}

export function manualSessionView(session: ManualCraftSession): ManualCraftSessionView {
  const replay = replayManualSession(session)
  const terminal = replay.state.terminal === 'none' && session.actions.length >= session.maxActions
    ? 'action-limit'
    : replay.state.terminal
  return {
    scenarioId: session.scenarioId,
    recipeName: session.recipe.displayName,
    crafterProfileId: session.crafterProfileId,
    conditionProfileId: session.conditionProfile.id,
    conditionEvidence: session.conditionProfile.evidence,
    actionCount: session.actions.length,
    maxActions: session.maxActions,
    state: replay.state,
    progressRequired: session.recipe.progressRequired,
    qualityTarget: session.qualityTarget,
    durabilityMax: session.recipe.durabilityMax,
    maxCp: session.crafter.maxCp,
    terminal,
    lastStep: replay.steps.at(-1) ?? null,
    legalActions: terminal === 'none'
      ? legalActions(session.recipe, session.crafter, replay.state)
          .map((action) => toLegalAction(previewAction(session.recipe, session.crafter, replay.state, action)))
      : [],
  }
}

function formatBuffs(state: CraftState): string {
  const active = Object.entries(state.buffs)
    .filter(([, duration]) => duration > 0)
    .map(([id, duration]) => `${id}:${duration}`)
  return active.length === 0 ? '-' : active.join(',')
}

export function formatManualSession(session: ManualCraftSession): string {
  const view = manualSessionView(session)
  const state = view.state
  const lines = [
    `${view.scenarioId} | ${view.recipeName} | profile=${view.crafterProfileId}`,
    `conditionModel=${view.conditionProfileId} evidence=${view.conditionEvidence} | outcomeStream=fixed-hidden`,
    `actions=${view.actionCount}/${view.maxActions} terminal=${view.terminal}`,
    `state: step=${state.step} condition=${state.terminal === 'none' ? state.condition : '-'} progress=${state.progress}/${view.progressRequired} quality=${state.quality}/${view.qualityTarget} durability=${state.durability}/${view.durabilityMax} cp=${state.cp}/${view.maxCp} IQ=${state.innerQuiet}`,
    `buffs: ${formatBuffs(state)} | combo=${state.comboFrom ?? '-'} | trainedPerfection=${state.trainedPerfectionAvailable ? 'available' : state.trainedPerfectionActive ? 'active' : 'used'}${session.crafter.specialist === true ? ` | carefulObservation=${state.carefulObservationUsesLeft} | heartAndSoul=${state.heartAndSoulActive ? 'active' : state.heartAndSoulAvailable ? 'available' : 'used'} | quickInnovation=${state.quickInnovationAvailable ? 'available' : 'used'}` : ' | specialist=n/a'}`,
  ]
  if (view.lastStep !== null) {
    lines.push(state.terminal === 'none'
      ? `last: ${view.lastStep.action} ${view.lastStep.success ? 'success' : 'failure'} -> condition=${state.condition}`
      : `last: ${view.lastStep.action} ${view.lastStep.success ? 'success' : 'failure'} -> terminal=${state.terminal}`)
  }
  if (view.terminal === 'failed') lines.push(`failureReason=${state.failureReason ?? 'unknown'}`)
  if (view.terminal === 'completed') {
    lines.push(`result: completed quality=${state.quality}/${view.qualityTarget} actions=${view.actionCount}`)
  } else if (view.terminal === 'failed' || view.terminal === 'action-limit') {
    lines.push(`result: ${view.terminal} quality=${state.quality}/${view.qualityTarget} actions=${view.actionCount}`)
  } else {
    for (const category of ['progress', 'quality', 'repair', 'buff', 'utility'] as const) {
      const ids = view.legalActions.filter((action) => action.category === category).map((action) => action.id)
      if (ids.length > 0) lines.push(`legal.${category}: ${ids.join(' ')}`)
    }
  }
  return lines.join('\n')
}
