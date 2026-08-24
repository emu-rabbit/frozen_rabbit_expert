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
  previewAction,
  type ActionPreview,
  type CraftActionId,
  type CraftBuffs,
  type CraftState,
  type MaterialCondition,
  type ObservedActionOutcome,
  type RecipeProfile,
  type TransitionResult,
} from '@frozen-rabbit-expert/domain'
import {
  BALANCED_COMMAND_BREW_CONDITIONS,
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  BALANCED_POC_CONDITIONS,
  createEpisodeRandomStream,
  drawSimulatedActionOutcome,
  type EpisodeRandomStream,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'

export const NATIVE_TRANSITION_BATCH_VERSION = 'native-transition-batch-v2' as const

export type NativeTransitionBatchCommand = 'preview' | 'apply' | 'simulate'

type StatePatch = Partial<Omit<CraftState, 'buffs'>> & {
  buffs?: Partial<CraftBuffs>
}

interface FixtureCaseBase {
  caseId: string
  scenarioId: CraftScenarioDataId
  equipmentProfileId: PlayerEquipmentProfileId
  state?: StatePatch
  action: CraftActionId
  tags: readonly string[]
}

export interface NativePreviewFixtureCase extends FixtureCaseBase {
  command: 'preview'
}

export interface NativeApplyFixtureCase extends FixtureCaseBase {
  command: 'apply'
  observed: Readonly<ObservedActionOutcome>
}

export interface NativeSimulateFixtureCase extends FixtureCaseBase {
  command: 'simulate'
  seed: number
  conditionDrawOffset: number
  successDrawOffset: number
}

export type NativeTransitionFixtureCase =
  | NativePreviewFixtureCase
  | NativeApplyFixtureCase
  | NativeSimulateFixtureCase

export interface NativeRandomCursor {
  condition: number
  success: number
}

export interface NativeTransitionOracleResult {
  caseId: string
  command: NativeTransitionBatchCommand
  preview: Readonly<ActionPreview>
  observed: Readonly<ObservedActionOutcome> | null
  nextState: Readonly<CraftState> | null
  explanationCodes: readonly string[]
  cursorBefore: Readonly<NativeRandomCursor>
  cursorAfter: Readonly<NativeRandomCursor>
}

export interface PreparedNativeTransitionCase {
  spec: Readonly<NativeTransitionFixtureCase>
  recipe: Readonly<RecipeProfile>
  crafter: Readonly<(typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter']>
  state: Readonly<CraftState>
  conditionWeights: Readonly<Record<MaterialCondition, number>>
  oracle: Readonly<NativeTransitionOracleResult>
}

export interface NativeTransitionComparableResult {
  caseId: string
  command: NativeTransitionBatchCommand
  preview: {
    legal: boolean
    reason: string | null
    cpCost: number
    durabilityCost: number
    successRate: number
    progressGain: number
    qualityGain: number
  }
  observed: Readonly<ObservedActionOutcome> | null
  nextState: Readonly<CraftState> | null
  explanationCodes: readonly string[]
  cursorBefore: Readonly<NativeRandomCursor>
  cursorAfter: Readonly<NativeRandomCursor>
}

function initialMatrixCases(): NativeApplyFixtureCase[] {
  return CRAFT_SCENARIO_DATA.flatMap(({ scenarioId }) => (
    PLAYER_EQUIPMENT_PROFILES.map(({ id: equipmentProfileId }) => ({
      caseId: `initial-reflect-${scenarioId}-${equipmentProfileId}`,
      scenarioId,
      equipmentProfileId,
      command: 'apply' as const,
      action: 'reflect' as const,
      observed: { success: true, nextCondition: 'normal' as const },
      tags: ['five-recipes', 'three-equipment', 'initial', 'success'],
    }))
  ))
}

const CURATED_CASES: readonly NativeTransitionFixtureCase[] = [
  {
    caseId: 'good-cosmic-tool-quality',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 6, condition: 'good', innerQuiet: 4 },
    action: 'preciseTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['condition-good', 'quality', 'inner-quiet', 'success'],
  },
  {
    caseId: 'centered-risk-failure',
    scenarioId: 'cosmotized-ilmenite-nails',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'apply',
    state: { step: 7, condition: 'centered' },
    action: 'rapidSynthesis',
    observed: { success: false, nextCondition: 'normal' },
    tags: ['condition-centered', 'failure', 'risky-action'],
  },
  {
    caseId: 'sturdy-waste-not-trained-perfection',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-specialist-cosmic-tool-v1',
    command: 'apply',
    state: {
      step: 8,
      condition: 'sturdy',
      trainedPerfectionActive: true,
      buffs: { wasteNot: 3 },
    },
    action: 'groundwork',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['condition-sturdy', 'buff-waste-not', 'trained-perfection', 'success'],
  },
  {
    caseId: 'pliant-primed-independent-cp',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 5, condition: 'pliant' },
    action: 'manipulation',
    observed: { success: true, nextCondition: 'primed' },
    tags: ['condition-pliant', 'cp-rounding', 'buff-manipulation'],
  },
  {
    caseId: 'primed-innovation-duration',
    scenarioId: 'hardened-survey-plank',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'apply',
    state: { step: 4, condition: 'primed' },
    action: 'innovation',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['condition-primed', 'buff-innovation', 'duration'],
  },
  {
    caseId: 'malleable-muscle-memory-veneration-progress',
    scenarioId: 'cosmotized-ilmenite-nails',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: {
      step: 9,
      condition: 'malleable',
      buffs: { muscleMemory: 2, veneration: 3 },
    },
    action: 'carefulSynthesis',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['condition-malleable', 'buff-muscle-memory', 'buff-veneration', 'progress'],
  },
  {
    caseId: 'quality-buff-stack-and-byregot',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: {
      step: 12,
      innerQuiet: 10,
      buffs: { greatStrides: 2, innovation: 3 },
    },
    action: 'byregotsBlessing',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['buff-great-strides', 'buff-innovation', 'quality', 'inner-quiet'],
  },
  {
    caseId: 'manipulation-tick-and-expedience',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: {
      step: 13,
      durability: 25,
      buffs: { manipulation: 4, expedience: 1 },
    },
    action: 'daringTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['buff-manipulation', 'buff-expedience', 'durability-tick'],
  },
  {
    caseId: 'combo-standard-touch-cp',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 8, comboFrom: 'basicTouch', innerQuiet: 2 },
    action: 'standardTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['combo', 'cp-rounding', 'quality'],
  },
  {
    caseId: 'final-appraisal-terminal-guard',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: {
      step: 20,
      progress: 9_900,
      durability: 20,
      buffs: { finalAppraisal: 3 },
    },
    action: 'basicSynthesis',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['buff-final-appraisal', 'terminal-boundary', 'progress'],
  },
  {
    caseId: 'required-quality-terminal-failure',
    scenarioId: 'hardened-survey-plank',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 15, progress: 4_600, quality: 0, durability: 20 },
    action: 'basicSynthesis',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['terminal-failed-required-quality', 'terminal'],
  },
  {
    caseId: 'completed-terminal',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 18, progress: 9_900, quality: 8_000, durability: 20 },
    action: 'basicSynthesis',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['terminal-completed', 'terminal'],
  },
  {
    caseId: 'durability-terminal-failure',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'apply',
    state: { step: 6, durability: 5 },
    action: 'basicTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['terminal-failed-durability', 'terminal'],
  },
  {
    caseId: 'terminal-preview-illegal',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'preview',
    state: { terminal: 'completed', progress: 10_000 },
    action: 'basicSynthesis',
    tags: ['terminal-input', 'preview-illegal'],
  },
  {
    caseId: 'specialist-careful-observation-no-step-reroll',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-specialist-cosmic-tool-v1',
    command: 'simulate',
    state: { step: 9, condition: 'normal' },
    action: 'carefulObservation',
    seed: 0x5100_0001,
    conditionDrawOffset: 2,
    successDrawOffset: 3,
    tags: ['specialist', 'no-step', 'rerolls-condition', 'rng-condition-only'],
  },
  {
    caseId: 'specialist-heart-and-soul-no-step-no-reroll',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-specialist-cosmic-tool-v1',
    command: 'simulate',
    state: { step: 10, condition: 'normal' },
    action: 'heartAndSoul',
    seed: 0x5100_0002,
    conditionDrawOffset: 1,
    successDrawOffset: 2,
    tags: ['specialist', 'no-step', 'rng-no-consumption'],
  },
  {
    caseId: 'specialist-quick-innovation-no-step',
    scenarioId: 'cosmotized-ilmenite-nails',
    equipmentProfileId: 'player-food-medicine-specialist-cosmic-tool-v1',
    command: 'apply',
    state: { step: 14, condition: 'normal' },
    action: 'quickInnovation',
    observed: { success: true, nextCondition: 'good' },
    tags: ['specialist', 'no-step', 'buff-innovation'],
  },
  {
    caseId: 'good-omen-forced-next-good',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'simulate',
    state: { step: 11, condition: 'goodOmen' },
    action: 'basicTouch',
    seed: 0x5100_0003,
    conditionDrawOffset: 4,
    successDrawOffset: 5,
    tags: ['condition-good-omen', 'forced-good', 'rng-success-only'],
  },
  {
    caseId: 'robust-halves-durability-and-forces-sturdy',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'simulate',
    state: { step: 11, condition: 'robust' },
    action: 'basicTouch',
    seed: 0x5100_0005,
    conditionDrawOffset: 6,
    successDrawOffset: 7,
    tags: ['condition-robust', 'forced-sturdy', 'durability-halved', 'rng-success-only'],
  },
  {
    caseId: 'normal-simulated-success-and-condition',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'simulate',
    state: { step: 3, condition: 'normal' },
    action: 'hastyTouch',
    seed: 0x5100_0004,
    conditionDrawOffset: 3,
    successDrawOffset: 1,
    tags: ['rng-condition', 'rng-success', 'risky-action'],
  },
  {
    caseId: 'prudent-synthesis-normal',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 6, durability: 25 },
    action: 'prudentSynthesis',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'progress', 'reduced-durability-cost'],
  },
  {
    caseId: 'intensive-synthesis-good',
    scenarioId: 'cosmotized-ilmenite-nails',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 8, condition: 'good' },
    action: 'intensiveSynthesis',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'condition-good', 'progress'],
  },
  {
    caseId: 'muscle-memory-opening-buff',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'apply',
    action: 'muscleMemory',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'opening-action', 'buff-muscle-memory'],
  },
  {
    caseId: 'advanced-touch-observe-combo',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 8, comboFrom: 'observe', innerQuiet: 3 },
    action: 'advancedTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'combo', 'quality'],
  },
  {
    caseId: 'prudent-touch-normal',
    scenarioId: 'hardened-survey-plank',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'apply',
    state: { step: 7, durability: 15, innerQuiet: 2 },
    action: 'prudentTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'quality', 'reduced-durability-cost'],
  },
  {
    caseId: 'preparatory-touch-sturdy',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 9, condition: 'sturdy', durability: 25, innerQuiet: 4 },
    action: 'preparatoryTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'condition-sturdy', 'quality', 'inner-quiet'],
  },
  {
    caseId: 'trained-finesse-inner-quiet-ten',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 15, durability: 15, innerQuiet: 10 },
    action: 'trainedFinesse',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'quality', 'inner-quiet-ten', 'zero-durability-cost'],
  },
  {
    caseId: 'refined-touch-basic-combo',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 10, comboFrom: 'basicTouch', innerQuiet: 4 },
    action: 'refinedTouch',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'combo', 'quality', 'inner-quiet'],
  },
  {
    caseId: 'delicate-synthesis-dual-gain',
    scenarioId: 'cosmotized-ilmenite-nails',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 11, progress: 2_000, quality: 4_000, innerQuiet: 3 },
    action: 'delicateSynthesis',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'progress', 'quality'],
  },
  {
    caseId: 'tricks-of-the-trade-good-cp-restore',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'apply',
    state: { step: 7, condition: 'good', cp: 615 },
    action: 'tricksOfTheTrade',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'condition-good', 'cp-restore'],
  },
  {
    caseId: 'trained-perfection-activate',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 7 },
    action: 'trainedPerfection',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'trained-perfection', 'one-use-resource'],
  },
  {
    caseId: 'masters-mend-partial-repair',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 12, durability: 5 },
    action: 'mastersMend',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'durability-repair', 'repair-cap'],
  },
  {
    caseId: 'immaculate-mend-full-repair',
    scenarioId: 'mobile-work-stairs',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 14, durability: 5 },
    action: 'immaculateMend',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'durability-repair', 'full-repair'],
  },
  {
    caseId: 'waste-not-primed-duration',
    scenarioId: 'hardened-survey-plank',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 5, condition: 'primed' },
    action: 'wasteNot',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'condition-primed', 'buff-waste-not', 'duration'],
  },
  {
    caseId: 'waste-not-two-duration',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 6 },
    action: 'wasteNot2',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'buff-waste-not', 'duration'],
  },
  {
    caseId: 'veneration-primed-duration',
    scenarioId: 'cosmotized-ilmenite-nails',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 9, condition: 'primed' },
    action: 'veneration',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'condition-primed', 'buff-veneration', 'duration'],
  },
  {
    caseId: 'great-strides-duration',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 9, innerQuiet: 5 },
    action: 'greatStrides',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'buff-great-strides', 'duration'],
  },
  {
    caseId: 'observe-sets-combo',
    scenarioId: 'cosmotized-ilmenite-ingot',
    equipmentProfileId: 'player-unbuffed-cosmic-tool-v1',
    command: 'apply',
    state: { step: 5 },
    action: 'observe',
    observed: { success: true, nextCondition: 'normal' },
    tags: ['direct-action-coverage', 'combo', 'utility'],
  },
  {
    caseId: 'final-appraisal-no-step-activate',
    scenarioId: 'survey-craftsmans-command-brew',
    equipmentProfileId: 'player-food-medicine-cosmic-tool-v1',
    command: 'apply',
    state: { step: 17, condition: 'centered', comboFrom: 'observe' },
    action: 'finalAppraisal',
    observed: { success: true, nextCondition: 'good' },
    tags: ['direct-action-coverage', 'no-step', 'buff-final-appraisal'],
  },
]

export const NATIVE_TRANSITION_FIXTURE_CASES: readonly NativeTransitionFixtureCase[] = [
  ...initialMatrixCases(),
  ...CURATED_CASES,
]

function profileForRecipe(recipe: Readonly<RecipeProfile>): Readonly<WeightedConditionProfile> {
  switch (recipe.missionFamily) {
    case 'sinus-ardorum-explus-equipment-materials-i':
      return BALANCED_POC_CONDITIONS
    case 'sinus-ardorum-explus-elevating-platforms':
      return BALANCED_ELEVATING_PLATFORMS_CONDITIONS
    case 'sinus-ardorum-ex-artisans-mixtures':
      return BALANCED_COMMAND_BREW_CONDITIONS
    default:
      throw new Error(`no native parity condition profile for ${recipe.profileId}`)
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

function conditionWeights(
  profile: Readonly<WeightedConditionProfile>,
  previous: MaterialCondition,
): Record<MaterialCondition, number> {
  const weights = profile.transitionWeights?.[previous] ?? profile.weights
  return Object.fromEntries(MATERIAL_CONDITIONS.map((condition) => [
    condition,
    Math.max(0, weights[condition] ?? 0),
  ])) as Record<MaterialCondition, number>
}

function countingRandom(
  seed: number,
  conditionOffset: number,
  successOffset: number,
): { random: EpisodeRandomStream; before: NativeRandomCursor; after: () => NativeRandomCursor } {
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
    before: { condition, success },
    after: () => ({ condition, success }),
  }
}

function oracleFor(
  spec: Readonly<NativeTransitionFixtureCase>,
  recipe: Readonly<RecipeProfile>,
  crafter: Readonly<(typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter']>,
  state: Readonly<CraftState>,
  profile: Readonly<WeightedConditionProfile>,
): NativeTransitionOracleResult {
  const preview = previewAction(recipe, crafter, state, spec.action)
  if (spec.command === 'preview') {
    return {
      caseId: spec.caseId,
      command: spec.command,
      preview,
      observed: null,
      nextState: null,
      explanationCodes: [],
      cursorBefore: { condition: 0, success: 0 },
      cursorAfter: { condition: 0, success: 0 },
    }
  }
  if (!preview.legal) throw new Error(`fixture ${spec.caseId} uses illegal action: ${preview.reason}`)
  let observed: ObservedActionOutcome
  let cursorBefore = { condition: 0, success: 0 }
  let cursorAfter = cursorBefore
  if (spec.command === 'apply') {
    observed = spec.observed
  } else {
    const counter = countingRandom(
      spec.seed,
      spec.conditionDrawOffset,
      spec.successDrawOffset,
    )
    cursorBefore = counter.before
    observed = drawSimulatedActionOutcome(preview, state, profile, counter.random)
    cursorAfter = counter.after()
  }
  const transition: TransitionResult = applyObservedOutcome(
    recipe,
    crafter,
    state,
    spec.action,
    observed,
  )
  return {
    caseId: spec.caseId,
    command: spec.command,
    preview,
    observed,
    nextState: transition.nextState,
    explanationCodes: transition.explanationCodes,
    cursorBefore,
    cursorAfter,
  }
}

export function executePreparedNativeTransitionCase(
  prepared: Readonly<Omit<PreparedNativeTransitionCase, 'oracle'>>,
): NativeTransitionOracleResult {
  return oracleFor(
    prepared.spec,
    prepared.recipe,
    prepared.crafter,
    prepared.state,
    profileForRecipe(prepared.recipe),
  )
}

export function nativeTransitionComparableResult(
  oracle: Readonly<NativeTransitionOracleResult>,
): NativeTransitionComparableResult {
  return {
    caseId: oracle.caseId,
    command: oracle.command,
    preview: {
      legal: oracle.preview.legal,
      reason: oracle.preview.reason ?? null,
      cpCost: oracle.preview.cpCost,
      durabilityCost: oracle.preview.durabilityCost,
      successRate: oracle.preview.successRate,
      progressGain: oracle.preview.progressGain,
      qualityGain: oracle.preview.qualityGain,
    },
    observed: oracle.observed,
    nextState: oracle.nextState,
    explanationCodes: oracle.explanationCodes,
    cursorBefore: oracle.cursorBefore,
    cursorAfter: oracle.cursorAfter,
  }
}

export function prepareNativeTransitionBatch(): readonly PreparedNativeTransitionCase[] {
  const caseIds = new Set<string>()
  return NATIVE_TRANSITION_FIXTURE_CASES.map((spec) => {
    if (caseIds.has(spec.caseId)) throw new Error(`duplicate native fixture caseId: ${spec.caseId}`)
    caseIds.add(spec.caseId)
    const scenario = CRAFT_SCENARIO_DATA.find(({ scenarioId }) => scenarioId === spec.scenarioId)
    if (scenario === undefined) throw new Error(`unknown native fixture scenario: ${spec.scenarioId}`)
    const equipment = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === spec.equipmentProfileId)
    if (equipment === undefined) {
      throw new Error(`unknown native fixture equipment: ${spec.equipmentProfileId}`)
    }
    const state = patchedState(scenario.recipe, equipment.crafter, spec.state)
    const profile = profileForRecipe(scenario.recipe)
    return {
      spec,
      recipe: scenario.recipe,
      crafter: equipment.crafter,
      state,
      conditionWeights: conditionWeights(profile, state.condition),
      oracle: oracleFor(spec, scenario.recipe, equipment.crafter, state, profile),
    }
  })
}

export function nativeTransitionOracleHash(
  prepared: readonly PreparedNativeTransitionCase[],
): string {
  return createHash('sha256')
    .update(JSON.stringify(prepared.map(({ oracle }) => nativeTransitionComparableResult(oracle))))
    .digest('hex')
}
