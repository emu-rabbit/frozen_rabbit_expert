import { createHash } from 'node:crypto'
import {
  CRAFT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
  type CraftScenarioDataId,
  type PlayerEquipmentProfileId,
} from '@frozen-rabbit-expert/data'
import {
  MATERIAL_CONDITIONS,
  applyObservedOutcome,
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftBuffs,
  type CraftState,
  type MaterialCondition,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  BALANCED_COMMAND_BREW_CONDITIONS,
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  BALANCED_POC_CONDITIONS,
  assertConditionProfileCompatible,
  createEpisodeRandomStream,
  drawSimulatedActionOutcome,
  type EpisodeRandomStream,
  type EpisodeStopReason,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import type { NativeRandomCursor } from './transitionBatch'

export const NATIVE_ROLLOUT_BATCH_VERSION = 'native-rollout-batch-v1' as const

type StatePatch = Partial<Omit<CraftState, 'buffs'>> & {
  buffs?: Partial<CraftBuffs>
}

export interface NativeRolloutFixtureCase {
  caseId: string
  scenarioId: CraftScenarioDataId
  equipmentProfileId: PlayerEquipmentProfileId
  state?: StatePatch
  seed: number
  conditionDrawOffset?: number
  successDrawOffset?: number
  maxSteps: number
  actions: readonly CraftActionId[]
  conditionModel?: 'synthetic-non-iid-row-lock-v1'
  tags: readonly string[]
}

export type NativeConditionTransitionWeights = Readonly<Record<
  MaterialCondition,
  Readonly<Record<MaterialCondition, number>>
>>

export interface NativeRolloutTraceStep {
  before: Readonly<CraftState>
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
  after: Readonly<CraftState>
  explanationCodes: readonly string[]
  cursorBefore: Readonly<NativeRandomCursor>
  cursorAfter: Readonly<NativeRandomCursor>
}

export interface NativeRolloutOracleResult {
  caseId: string
  terminal: CraftState['terminal']
  finalState: Readonly<CraftState>
  actions: readonly CraftActionId[]
  stoppedByLimit: boolean
  stopReason: EpisodeStopReason
  initialCursor: Readonly<NativeRandomCursor>
  finalCursor: Readonly<NativeRandomCursor>
  steps: readonly NativeRolloutTraceStep[]
}

export interface NativeRolloutComparableTraceStep {
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
  after: Readonly<CraftState>
  explanationCodes: readonly string[]
  cursorBefore: Readonly<NativeRandomCursor>
  cursorAfter: Readonly<NativeRandomCursor>
}

export interface NativeRolloutComparableResult {
  caseId: string
  terminal: CraftState['terminal']
  stopReason: EpisodeStopReason
  actions: readonly CraftActionId[]
  transitions: number
  finalCursor: Readonly<NativeRandomCursor>
  finalState: Readonly<CraftState>
  steps: readonly NativeRolloutComparableTraceStep[]
}

export interface PreparedNativeRolloutCase {
  spec: Readonly<NativeRolloutFixtureCase>
  recipe: Readonly<RecipeProfile>
  crafter: Readonly<(typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter']>
  state: Readonly<CraftState>
  conditionProfile: Readonly<WeightedConditionProfile>
  conditionTransitionWeights: NativeConditionTransitionWeights
  oracle: Readonly<NativeRolloutOracleResult>
}

export const NATIVE_ROLLOUT_FIXTURE_CASES: readonly NativeRolloutFixtureCase[] = [
  {
    caseId: 'ingot-multi-step-buff-route',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    seed: 0x6100_0001,
    maxSteps: 8,
    actions: ['reflect', 'manipulation', 'wasteNot2', 'groundwork', 'groundwork'],
    tags: ['multi-step', 'quality', 'buffs', 'policy-null'],
  },
  {
    caseId: 'nails-risk-and-progress-route',
    scenarioId: 'cosmotized-ilmenite-nails',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    seed: 0x6100_0002,
    maxSteps: 8,
    actions: [
      'muscleMemory',
      'manipulation',
      'veneration',
      'rapidSynthesis',
      'hastyTouch',
      'carefulSynthesis',
    ],
    tags: ['multi-step', 'risky-actions', 'independent-rng'],
  },
  {
    caseId: 'plank-required-quality-terminal',
    scenarioId: 'hardened-survey-plank',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    state: { progress: 4_600, quality: 0, durability: 20 },
    seed: 0x6100_0003,
    maxSteps: 4,
    actions: ['basicSynthesis', 'basicSynthesis'],
    tags: ['terminal', 'required-quality', 'fixed-sequence'],
  },
  {
    caseId: 'stairs-good-omen-forced-good-route',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    state: { step: 5, condition: 'goodOmen', innerQuiet: 2 },
    seed: 0x6100_0004,
    conditionDrawOffset: 3,
    successDrawOffset: 2,
    maxSteps: 8,
    actions: ['basicTouch', 'preciseTouch', 'innovation', 'groundwork'],
    tags: ['good-omen', 'forced-good', 'rng-cursor', 'multi-step'],
  },
  {
    caseId: 'brew-specialist-no-step-route',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-specialist-cosmic-tool-v1',
    state: { step: 4, condition: 'normal' },
    seed: 0x6100_0005,
    conditionDrawOffset: 1,
    successDrawOffset: 4,
    maxSteps: 8,
    actions: [
      'carefulObservation',
      'heartAndSoul',
      'quickInnovation',
      'observe',
      'basicTouch',
    ],
    tags: ['specialist', 'no-step', 'reroll', 'resources'],
  },
  {
    caseId: 'brew-near-completion-terminal',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    state: { step: 18, progress: 9_900, quality: 12_000, durability: 20 },
    seed: 0x6100_0006,
    maxSteps: 4,
    actions: ['basicSynthesis', 'basicTouch'],
    tags: ['terminal', 'completion', 'early-stop'],
  },
  {
    caseId: 'ingot-illegal-sequence-stop',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    state: { step: 2 },
    seed: 0x6100_0007,
    maxSteps: 4,
    actions: ['reflect', 'basicSynthesis'],
    tags: ['illegal-action', 'zero-transition'],
  },
  {
    caseId: 'stairs-action-limit',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    seed: 0x6100_0008,
    maxSteps: 2,
    actions: ['reflect', 'manipulation', 'wasteNot2', 'groundwork'],
    tags: ['action-limit', 'fixed-budget'],
  },
  {
    caseId: 'ingot-non-iid-condition-row-lock',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    seed: 0x6100_0009,
    maxSteps: 3,
    actions: ['observe', 'observe', 'observe'],
    conditionModel: 'synthetic-non-iid-row-lock-v1',
    tags: ['non-iid', 'previous-condition-row', 'deterministic-transition'],
  },
  {
    caseId: 'brew-no-step-action-limit',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-specialist-cosmic-tool-v1',
    state: { step: 7, condition: 'normal' },
    seed: 0x6100_000a,
    conditionDrawOffset: 2,
    successDrawOffset: 3,
    maxSteps: 2,
    actions: ['carefulObservation', 'heartAndSoul', 'quickInnovation'],
    tags: ['specialist', 'no-step', 'action-limit', 'action-budget'],
  },
] as const

const SYNTHETIC_NON_IID_ROW_LOCK_CONDITIONS: WeightedConditionProfile = {
  id: 'native-rollout-synthetic-non-iid-row-lock-v1',
  evidence: 'assumption',
  weights: { normal: 1 },
  transitionWeights: {
    normal: { good: 1 },
    good: { malleable: 1 },
    malleable: { normal: 1 },
  },
}

function profileForRecipe(
  recipe: Readonly<RecipeProfile>,
  conditionModel: NativeRolloutFixtureCase['conditionModel'],
): Readonly<WeightedConditionProfile> {
  if (conditionModel === 'synthetic-non-iid-row-lock-v1') {
    return SYNTHETIC_NON_IID_ROW_LOCK_CONDITIONS
  }
  switch (recipe.missionFamily) {
    case 'sinus-ardorum-explus-equipment-materials-i':
      return BALANCED_POC_CONDITIONS
    case 'sinus-ardorum-explus-elevating-platforms':
      return BALANCED_ELEVATING_PLATFORMS_CONDITIONS
    case 'sinus-ardorum-ex-artisans-mixtures':
      return BALANCED_COMMAND_BREW_CONDITIONS
    default:
      throw new Error(`no native rollout condition profile for ${recipe.profileId}`)
  }
}

function patchedState(
  recipe: Readonly<RecipeProfile>,
  crafter: Readonly<(typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter']>,
  patch: StatePatch | undefined,
): CraftState {
  const initial = createInitialCraftState(recipe, crafter)
  return {
    ...initial,
    ...patch,
    buffs: { ...initial.buffs, ...patch?.buffs },
  }
}

function resolvedConditionTransitionWeights(
  profile: Readonly<WeightedConditionProfile>,
): NativeConditionTransitionWeights {
  return Object.fromEntries(MATERIAL_CONDITIONS.map((previous) => {
    const weights = profile.transitionWeights?.[previous] ?? profile.weights
    return [previous, Object.fromEntries(MATERIAL_CONDITIONS.map((next) => [
      next,
      Math.max(0, weights[next] ?? 0),
    ]))]
  })) as NativeConditionTransitionWeights
}

function countingRandom(
  seed: number,
  conditionOffset: number,
  successOffset: number,
): {
  random: EpisodeRandomStream
  cursor: () => NativeRandomCursor
} {
  const source = createEpisodeRandomStream(seed)
  for (let index = 0; index < conditionOffset; index += 1) source.nextCondition()
  for (let index = 0; index < successOffset; index += 1) source.nextSuccess()
  let condition = conditionOffset
  let success = successOffset
  return {
    random: {
      nextCondition: () => {
        condition += 1
        return source.nextCondition()
      },
      nextSuccess: () => {
        success += 1
        return source.nextSuccess()
      },
    },
    cursor: () => ({ condition, success }),
  }
}

function assertUint32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be a uint32 integer`)
  }
}

export function executePreparedNativeRolloutCase(
  prepared: Readonly<Omit<PreparedNativeRolloutCase, 'oracle'>>,
): NativeRolloutOracleResult {
  const { spec, recipe, crafter, state: initialState, conditionProfile } = prepared
  assertConditionProfileCompatible(recipe, conditionProfile)
  assertUint32(spec.seed, `${spec.caseId} seed`)
  const conditionOffset = spec.conditionDrawOffset ?? 0
  const successOffset = spec.successDrawOffset ?? 0
  assertUint32(conditionOffset, `${spec.caseId} conditionDrawOffset`)
  assertUint32(successOffset, `${spec.caseId} successDrawOffset`)
  if (!Number.isSafeInteger(spec.maxSteps) || spec.maxSteps < 1 || spec.maxSteps > 1_000) {
    throw new RangeError(`${spec.caseId} maxSteps must be an integer in [1, 1000]`)
  }
  if (spec.actions.length === 0) throw new Error(`${spec.caseId} actions must not be empty`)

  const counted = countingRandom(spec.seed, conditionOffset, successOffset)
  const initialCursor = counted.cursor()
  let state = initialState
  const actions: CraftActionId[] = []
  const steps: NativeRolloutTraceStep[] = []
  let stopReason: EpisodeStopReason | null = null

  while (state.terminal === 'none' && actions.length < spec.maxSteps) {
    const action = spec.actions[actions.length]
    if (action === undefined) {
      stopReason = legalActions(recipe, crafter, state).length === 0
        ? 'no-legal-action'
        : 'policy-null'
      break
    }
    const preview = previewAction(recipe, crafter, state, action)
    if (!preview.legal) {
      stopReason = 'illegal-action'
      break
    }
    const cursorBefore = counted.cursor()
    const observed = drawSimulatedActionOutcome(
      preview,
      state,
      conditionProfile,
      counted.random,
    )
    const transition = applyObservedOutcome(recipe, crafter, state, action, observed)
    const before = state
    state = transition.nextState
    actions.push(action)
    const cursorAfter = counted.cursor()
    steps.push({
      before,
      action,
      success: observed.success,
      nextCondition: observed.nextCondition,
      after: state,
      explanationCodes: transition.explanationCodes,
      cursorBefore,
      cursorAfter,
    })

    if (state.terminal !== 'none') {
      stopReason = state.terminal
      break
    }
    if (actions.length >= spec.maxSteps) {
      stopReason = 'action-limit'
      break
    }
  }

  stopReason ??= state.terminal === 'completed'
    ? 'completed'
    : state.terminal === 'failed'
      ? 'failed'
      : actions.length >= spec.maxSteps
        ? 'action-limit'
        : 'policy-null'

  return {
    caseId: spec.caseId,
    terminal: state.terminal,
    finalState: state,
    actions,
    stoppedByLimit: state.terminal === 'none' && actions.length >= spec.maxSteps,
    stopReason,
    initialCursor,
    finalCursor: counted.cursor(),
    steps,
  }
}

export function prepareNativeRolloutBatch(): readonly PreparedNativeRolloutCase[] {
  const caseIds = new Set<string>()
  return NATIVE_ROLLOUT_FIXTURE_CASES.map((spec) => {
    if (caseIds.has(spec.caseId)) throw new Error(`duplicate native rollout caseId: ${spec.caseId}`)
    caseIds.add(spec.caseId)
    const scenario = CRAFT_SCENARIO_DATA.find(({ scenarioId }) => scenarioId === spec.scenarioId)
    if (scenario === undefined) throw new Error(`unknown rollout scenario: ${spec.scenarioId}`)
    const equipment = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === spec.equipmentProfileId)
    if (equipment === undefined) throw new Error(`unknown rollout equipment: ${spec.equipmentProfileId}`)
    const conditionProfile = profileForRecipe(scenario.recipe, spec.conditionModel)
    const prepared = {
      spec,
      recipe: scenario.recipe,
      crafter: equipment.crafter,
      state: patchedState(scenario.recipe, equipment.crafter, spec.state),
      conditionProfile,
      conditionTransitionWeights: resolvedConditionTransitionWeights(conditionProfile),
    }
    return {
      ...prepared,
      oracle: executePreparedNativeRolloutCase(prepared),
    }
  })
}

export function nativeRolloutComparableResult(
  result: Readonly<NativeRolloutOracleResult>,
): NativeRolloutComparableResult {
  return {
    caseId: result.caseId,
    terminal: result.terminal,
    stopReason: result.stopReason,
    actions: result.actions,
    transitions: result.steps.length,
    finalCursor: result.finalCursor,
    finalState: result.finalState,
    steps: result.steps.map((step) => ({
      action: step.action,
      success: step.success,
      nextCondition: step.nextCondition,
      after: step.after,
      explanationCodes: step.explanationCodes,
      cursorBefore: step.cursorBefore,
      cursorAfter: step.cursorAfter,
    })),
  }
}

export function nativeRolloutOracleHash(
  prepared: readonly PreparedNativeRolloutCase[],
): string {
  return createHash('sha256')
    .update(JSON.stringify(prepared.map(({ oracle }) => nativeRolloutComparableResult(oracle))))
    .digest('hex')
}
