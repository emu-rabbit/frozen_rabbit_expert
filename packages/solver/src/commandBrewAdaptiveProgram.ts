import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import {
  CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION,
  CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION,
  CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION,
  sealCraftAdaptivePolicyProgramV1,
  type CraftAdaptivePolicyGuardV1,
  type CraftAdaptivePolicyNodeV1,
  type CraftAdaptivePolicyTransitionV1,
} from './adaptivePolicyProgram'
import { GUIDE_SCENARIO_POLICY_BINDINGS } from './guideScenarioPolicyRegistry'

export const COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM_VERSION =
  'command-brew-conservative-adaptive-program-v0.1.0'

export const COMMAND_BREW_CONSERVATIVE_ROUTE = [
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
] as const satisfies readonly CraftActionId[]

export const COMMAND_BREW_FULL_QUALITY_ROUTE = [
  'reflect',
  'manipulation',
  'basicTouch',
  'refinedTouch',
  'innovation',
  'delicateSynthesis',
  'basicTouch',
  'standardTouch',
  'advancedTouch',
  'trainedPerfection',
  'greatStrides',
  'innovation',
  'preparatoryTouch',
  'greatStrides',
  'byregotsBlessing',
  'veneration',
  'wasteNot2',
  'groundwork',
  'immaculateMend',
  'groundwork',
  'veneration',
  'groundwork',
  'groundwork',
  'groundwork',
  'groundwork',
] as const satisfies readonly CraftActionId[]

const binding = GUIDE_SCENARIO_POLICY_BINDINGS['survey-craftsmans-command-brew']
const finalNodeId = 'safe-finish'
const protectNodeId = 'protect-progress'
const entryNodeId = 'select-capability-envelope'
const protectedMalleableFlag = 'consume-protected-malleable'

const conservativeRouteSteps = [
  ['open-muscle-memory', 'muscleMemory', 'none'],
  ['maintain-manipulation', 'manipulation', 'none'],
  ['progress-veneration-1', 'veneration', 'none'],
  ['progress-waste-not', 'wasteNot', 'none'],
  ['progress-groundwork-1', 'groundwork', 'progress'],
  ['progress-groundwork-2', 'groundwork', 'progress'],
  ['progress-groundwork-3', 'groundwork', 'progress'],
  ['progress-delicate-1', 'delicateSynthesis', 'delicate'],
  ['progress-veneration-2', 'veneration', 'none'],
  ['progress-groundwork-4', 'groundwork', 'progress'],
  ['progress-careful-synthesis', 'carefulSynthesis', 'progress'],
  ['progress-delicate-2', 'delicateSynthesis', 'delicate'],
  ['quality-prudent-touch', 'prudentTouch', 'quality'],
  ['restore-immaculate-mend', 'immaculateMend', 'quality'],
  ['reserve-trained-perfection', 'trainedPerfection', 'quality'],
  ['quality-innovation-1', 'innovation', 'quality'],
  ['quality-basic-touch-1', 'basicTouch', 'quality'],
  ['quality-standard-touch', 'standardTouch', 'quality'],
  ['quality-advanced-touch', 'advancedTouch', 'quality'],
  ['quality-innovation-2', 'innovation', 'quality'],
  ['quality-basic-touch-2', 'basicTouch', 'quality'],
  ['quality-refined-touch', 'refinedTouch', 'quality'],
  ['quality-byregots-blessing', 'byregotsBlessing', 'quality'],
] as const satisfies readonly (readonly [
  id: string,
  action: CraftActionId,
  kind: 'none' | 'progress' | 'delicate' | 'quality',
])[]

const fullQualityRouteSteps = [
  ['full-quality-reflect', 'reflect', 'none'],
  ['full-quality-manipulation', 'manipulation', 'none'],
  ['full-quality-basic-touch-1', 'basicTouch', 'none'],
  ['full-quality-refined-touch', 'refinedTouch', 'none'],
  ['full-quality-innovation-1', 'innovation', 'none'],
  ['full-quality-delicate-synthesis', 'delicateSynthesis', 'delicate'],
  ['full-quality-basic-touch-2', 'basicTouch', 'none'],
  ['full-quality-standard-touch', 'standardTouch', 'none'],
  ['full-quality-advanced-touch', 'advancedTouch', 'none'],
  ['full-quality-trained-perfection', 'trainedPerfection', 'none'],
  ['full-quality-great-strides-1', 'greatStrides', 'none'],
  ['full-quality-innovation-2', 'innovation', 'none'],
  ['full-quality-preparatory-touch', 'preparatoryTouch', 'none'],
  ['full-quality-great-strides-2', 'greatStrides', 'none'],
  ['full-quality-byregots-blessing', 'byregotsBlessing', 'none'],
  ['full-quality-veneration-1', 'veneration', 'none'],
  ['full-quality-waste-not-2', 'wasteNot2', 'none'],
  ['full-quality-groundwork-1', 'groundwork', 'progress'],
  ['full-quality-immaculate-mend', 'immaculateMend', 'none'],
  ['full-quality-groundwork-2', 'groundwork', 'progress'],
  ['full-quality-veneration-2', 'veneration', 'none'],
  ['full-quality-groundwork-3', 'groundwork', 'progress'],
  ['full-quality-groundwork-4', 'groundwork', 'progress'],
  ['full-quality-groundwork-5', 'groundwork', 'progress'],
  ['full-quality-groundwork-6', 'groundwork', 'progress'],
] as const satisfies readonly (readonly [
  id: string,
  action: CraftActionId,
  kind: 'none' | 'progress' | 'delicate' | 'quality',
])[]

const fullQuality: CraftAdaptivePolicyGuardV1 = {
  kind: 'integer',
  feature: 'state.quality',
  op: 'gte',
  value: 12_000,
}

const nodeUnused: CraftAdaptivePolicyGuardV1 = {
  kind: 'integer',
  feature: 'memory.nodeActionUses',
  op: 'eq',
  value: 0,
}

const commonFreshEntryGuards: readonly CraftAdaptivePolicyGuardV1[] = [
  { kind: 'enum', feature: 'state.terminal', op: 'eq', value: 'none' },
  { kind: 'enum', feature: 'state.condition', op: 'eq', value: 'normal' },
  { kind: 'enum', feature: 'state.comboFrom', op: 'eq', value: 'none' },
  { kind: 'integer', feature: 'state.step', op: 'eq', value: 1 },
  { kind: 'integer', feature: 'state.progress', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.quality', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.durability', op: 'eq', value: 55 },
  { kind: 'integer', feature: 'state.cpBps', op: 'eq', value: 10_000 },
  { kind: 'integer', feature: 'state.innerQuiet', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.wasteNot', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.veneration', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.greatStrides', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.innovation', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.finalAppraisal', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.manipulation', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.muscleMemory', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'state.buffs.expedience', op: 'eq', value: 0 },
  { kind: 'integer', feature: 'memory.totalObservedTransitions', op: 'eq', value: 0 },
  { kind: 'boolean', feature: 'state.trainedPerfectionAvailable', op: 'eq', value: true },
  { kind: 'boolean', feature: 'state.trainedPerfectionActive', op: 'eq', value: false },
]

const nonSpecialistFreshEntryGuards: readonly CraftAdaptivePolicyGuardV1[] = [
  ...commonFreshEntryGuards,
  { kind: 'boolean', feature: 'crafter.specialist', op: 'eq', value: false },
  { kind: 'integer', feature: 'state.carefulObservationUsesLeft', op: 'eq', value: 0 },
  { kind: 'boolean', feature: 'state.heartAndSoulAvailable', op: 'eq', value: false },
  { kind: 'boolean', feature: 'state.heartAndSoulActive', op: 'eq', value: false },
  { kind: 'boolean', feature: 'state.quickInnovationAvailable', op: 'eq', value: false },
]

const specialistFreshEntryGuards: readonly CraftAdaptivePolicyGuardV1[] = [
  ...commonFreshEntryGuards,
  { kind: 'boolean', feature: 'crafter.specialist', op: 'eq', value: true },
  { kind: 'integer', feature: 'state.carefulObservationUsesLeft', op: 'eq', value: 3 },
  { kind: 'boolean', feature: 'state.heartAndSoulAvailable', op: 'eq', value: true },
  { kind: 'boolean', feature: 'state.heartAndSoulActive', op: 'eq', value: false },
  { kind: 'boolean', feature: 'state.quickInnovationAvailable', op: 'eq', value: true },
]

const fullQualityEnvelopeGuards: readonly CraftAdaptivePolicyGuardV1[] = [
  { kind: 'integer', feature: 'crafter.level', op: 'eq', value: 100 },
  { kind: 'integer', feature: 'crafter.craftsmanship', op: 'gte', value: 5_350 },
  { kind: 'integer', feature: 'crafter.craftsmanship', op: 'lte', value: 5_500 },
  { kind: 'integer', feature: 'crafter.control', op: 'gte', value: 5_215 },
  { kind: 'integer', feature: 'crafter.control', op: 'lte', value: 5_350 },
  { kind: 'integer', feature: 'crafter.maxCp', op: 'gte', value: 748 },
  { kind: 'integer', feature: 'crafter.maxCp', op: 'lte', value: 780 },
  { kind: 'boolean', feature: 'crafter.cosmicToolGoodBonus', op: 'eq', value: true },
  { kind: 'integer', feature: 'preview.reflect.qualityGain', op: 'gte', value: 861 },
  { kind: 'integer', feature: 'preview.delicateSynthesis.progressGain', op: 'gte', value: 427 },
  previewBoolean('reflect', 'policySafe'),
  previewBoolean('delicateSynthesis', 'policySafe'),
  deterministic('reflect'),
  deterministic('delicateSynthesis'),
]

function previewBoolean(
  action: CraftActionId,
  field: 'legal' | 'policySafe' | 'wouldCompleteProgress' | 'wouldCompleteBelowQualityMaximum',
  value = true,
): CraftAdaptivePolicyGuardV1 {
  return {
    kind: 'boolean',
    feature: `preview.${action}.${field}`,
    op: 'eq',
    value,
  }
}

function deterministic(action: CraftActionId): CraftAdaptivePolicyGuardV1 {
  return {
    kind: 'integer',
    feature: `preview.${action}.successRateBps`,
    op: 'eq',
    value: 10_000,
  }
}

function actionSlug(action: CraftActionId): string {
  return action.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function routeNode(
  ordinal: number,
  id: string,
  action: CraftActionId,
  kind: 'none' | 'progress' | 'delicate' | 'quality',
  nextNodeId: string,
): CraftAdaptivePolicyNodeV1 {
  const transitions: CraftAdaptivePolicyTransitionV1[] = []
  const protectedMalleableAction = kind === 'delicate' ? action : 'basicSynthesis'

  if (kind === 'quality') {
    transitions.push({
      id: 'finish-at-objective',
      all: [fullQuality],
      goto: finalNodeId,
    })
  }

  if (kind === 'progress' || kind === 'delicate') {
    transitions.push({
      id: 'protect-current-malleable-finish',
      all: [
        nodeUnused,
        { kind: 'enum', feature: 'state.condition', op: 'eq', value: 'malleable' },
        { kind: 'integer', feature: 'state.buffs.finalAppraisal', op: 'eq', value: 0 },
        previewBoolean('basicSynthesis', 'wouldCompleteProgress'),
      ],
      goto: protectNodeId,
      setResume: 'active-node',
      setFlag: { flag: protectedMalleableFlag, value: true },
    })
    transitions.push({
      id: 'skip-after-final-progress-secured',
      all: [nodeUnused, previewBoolean('basicSynthesis', 'wouldCompleteProgress')],
      goto: kind === 'delicate' ? `${id}-quality-substitute` : nextNodeId,
    })
    transitions.push({
      id: 'protect-premature-completion',
      all: [nodeUnused, previewBoolean(action, 'wouldCompleteBelowQualityMaximum')],
      goto: protectNodeId,
      setResume: 'active-node',
    })
  }

  return {
    ordinal,
    id,
    actionBudget: 1,
    transitions,
    decisions: [
      ...(id === 'progress-delicate-1' ? [{
        id: 'use-single-good-precise-touch',
        all: [
          { kind: 'enum' as const, feature: 'state.condition' as const, op: 'eq' as const, value: 'good' },
          { kind: 'integer' as const, feature: 'state.step' as const, op: 'eq' as const, value: 8 },
          { kind: 'integer' as const, feature: 'state.progress' as const, op: 'gte' as const, value: 6_566 },
          { kind: 'integer' as const, feature: 'state.progress' as const, op: 'lte' as const, value: 9_416 },
          { kind: 'integer' as const, feature: 'state.quality' as const, op: 'eq' as const, value: 0 },
          { kind: 'integer' as const, feature: 'state.durability' as const, op: 'eq' as const, value: 40 },
          { kind: 'integer' as const, feature: 'state.cp' as const, op: 'eq' as const, value: 400 },
          { kind: 'integer' as const, feature: 'state.innerQuiet' as const, op: 'eq' as const, value: 0 },
          { kind: 'integer' as const, feature: 'state.buffs.wasteNot' as const, op: 'eq' as const, value: 1 },
          { kind: 'integer' as const, feature: 'state.buffs.veneration' as const, op: 'eq' as const, value: 0 },
          { kind: 'integer' as const, feature: 'state.buffs.manipulation' as const, op: 'eq' as const, value: 3 },
          { kind: 'integer' as const, feature: 'memory.actionUses.preciseTouch' as const, op: 'eq' as const, value: 0 },
          previewBoolean('preciseTouch', 'legal'),
          previewBoolean('preciseTouch', 'policySafe'),
          deterministic('preciseTouch'),
        ],
        actions: ['preciseTouch' as const],
      }] : []),
      ...(id === 'quality-basic-touch-2' ? [{
        id: 'use-second-good-precise-touch',
        all: [
          { kind: 'enum' as const, feature: 'state.condition' as const, op: 'eq' as const, value: 'good' },
          { kind: 'integer' as const, feature: 'state.step' as const, op: 'gte' as const, value: 19 },
          { kind: 'integer' as const, feature: 'state.step' as const, op: 'lte' as const, value: 21 },
          { kind: 'integer' as const, feature: 'state.progress' as const, op: 'gte' as const, value: 9_546 },
          { kind: 'integer' as const, feature: 'state.progress' as const, op: 'lte' as const, value: 9_999 },
          { kind: 'integer' as const, feature: 'state.quality' as const, op: 'gte' as const, value: 3_181 },
          { kind: 'integer' as const, feature: 'state.quality' as const, op: 'lte' as const, value: 6_193 },
          { kind: 'integer' as const, feature: 'state.durability' as const, op: 'eq' as const, value: 35 },
          { kind: 'integer' as const, feature: 'state.cp' as const, op: 'gte' as const, value: 64 },
          { kind: 'integer' as const, feature: 'state.cp' as const, op: 'lte' as const, value: 111 },
          { kind: 'integer' as const, feature: 'state.innerQuiet' as const, op: 'gte' as const, value: 6 },
          { kind: 'integer' as const, feature: 'state.innerQuiet' as const, op: 'lte' as const, value: 7 },
          { kind: 'integer' as const, feature: 'state.buffs.wasteNot' as const, op: 'eq' as const, value: 0 },
          { kind: 'integer' as const, feature: 'state.buffs.veneration' as const, op: 'eq' as const, value: 0 },
          { kind: 'integer' as const, feature: 'state.buffs.manipulation' as const, op: 'eq' as const, value: 0 },
          { kind: 'integer' as const, feature: 'memory.actionUses.preciseTouch' as const, op: 'lte' as const, value: 1 },
          previewBoolean('preciseTouch', 'legal'),
          previewBoolean('preciseTouch', 'policySafe'),
          deterministic('preciseTouch'),
        ],
        actions: ['preciseTouch' as const],
      }] : []),
      ...(kind === 'progress' || kind === 'delicate' ? [{
        id: 'consume-protected-malleable-progress',
        all: [
          { kind: 'boolean' as const, feature: `memory.flags.${protectedMalleableFlag}` as const, op: 'eq' as const, value: true },
          previewBoolean(protectedMalleableAction, 'legal'),
          previewBoolean(protectedMalleableAction, 'policySafe'),
          deterministic(protectedMalleableAction),
        ],
        actions: [protectedMalleableAction],
      }] : []),
      ...(id === 'quality-refined-touch' ? [{
        id: 'save-final-appraisal-cp',
        all: [
          { kind: 'integer' as const, feature: 'memory.actionUses.finalAppraisal' as const, op: 'gte' as const, value: 1 },
          { kind: 'integer' as const, feature: 'state.cp' as const, op: 'lt' as const, value: 48 },
          previewBoolean('basicTouch', 'legal'),
          previewBoolean('basicTouch', 'policySafe'),
          deterministic('basicTouch'),
        ],
        actions: ['basicTouch' as const],
      }] : []),
      {
        id: `use-${actionSlug(action)}`,
        all: [
          previewBoolean(action, 'legal'),
          previewBoolean(action, 'policySafe'),
          deterministic(action),
        ],
        actions: [action],
      },
    ],
    onBudgetExhausted: kind === 'progress' || kind === 'delicate'
      ? {
          kind: 'goto',
          goto: nextNodeId,
          setFlag: { flag: protectedMalleableFlag, value: false },
        }
      : { kind: 'goto', goto: nextNodeId },
  }
}

function qualitySubstituteNode(
  ordinal: number,
  sourceNodeId: string,
  nextNodeId: string,
): CraftAdaptivePolicyNodeV1 {
  const candidates = ['prudentTouch', 'basicTouch', 'trainedFinesse'] as const
  return {
    ordinal,
    id: `${sourceNodeId}-quality-substitute`,
    actionBudget: 1,
    transitions: [
      {
        id: 'finish-at-objective',
        all: [fullQuality],
        goto: finalNodeId,
      },
      {
        id: 'skip-if-no-safe-substitute',
        all: candidates.map((action) => previewBoolean(action, 'policySafe', false)),
        goto: nextNodeId,
      },
    ],
    decisions: candidates.map((action) => ({
      id: `substitute-${actionSlug(action)}`,
      all: [
        previewBoolean(action, 'legal'),
        previewBoolean(action, 'policySafe'),
        deterministic(action),
      ],
      actions: [action],
    })),
    onBudgetExhausted: { kind: 'goto', goto: nextNodeId },
  }
}

const routeNodes: CraftAdaptivePolicyNodeV1[] = [{
  ordinal: 0,
  id: entryNodeId,
  actionBudget: 0,
  transitions: [
    {
      id: 'use-full-quality-envelope-non-specialist',
      all: [
        ...nonSpecialistFreshEntryGuards,
        ...fullQualityEnvelopeGuards,
      ],
      goto: fullQualityRouteSteps[0][0],
    },
    {
      id: 'use-full-quality-envelope-specialist',
      all: [
        ...specialistFreshEntryGuards,
        ...fullQualityEnvelopeGuards,
      ],
      goto: fullQualityRouteSteps[0][0],
    },
    {
      id: 'use-conservative-fallback',
      all: [
        ...nonSpecialistFreshEntryGuards,
        { kind: 'integer', feature: 'crafter.level', op: 'eq', value: 100 },
        { kind: 'integer', feature: 'crafter.craftsmanship', op: 'eq', value: 5_408 },
        { kind: 'integer', feature: 'crafter.control', op: 'eq', value: 5_140 },
        { kind: 'integer', feature: 'crafter.maxCp', op: 'eq', value: 630 },
        { kind: 'boolean', feature: 'crafter.cosmicToolGoodBonus', op: 'eq', value: true },
      ],
      goto: conservativeRouteSteps[0][0],
    },
  ],
  decisions: [],
  onBudgetExhausted: { kind: 'terminate', reason: 'capability-routing-failed' },
}]

for (const [index, [id, action, kind]] of conservativeRouteSteps.entries()) {
  const nextNodeId = conservativeRouteSteps[index + 1]?.[0] ?? finalNodeId
  routeNodes.push(routeNode(routeNodes.length, id, action, kind, nextNodeId))
  if (kind === 'delicate') {
    routeNodes.push(qualitySubstituteNode(routeNodes.length, id, nextNodeId))
  }
}

for (const [index, [id, action, kind]] of fullQualityRouteSteps.entries()) {
  const nextNodeId = fullQualityRouteSteps[index + 1]?.[0] ?? finalNodeId
  routeNodes.push(routeNode(routeNodes.length, id, action, kind, nextNodeId))
  if (kind === 'delicate') {
    routeNodes.push(qualitySubstituteNode(routeNodes.length, id, nextNodeId))
  }
}

routeNodes.push({
  ordinal: routeNodes.length,
  id: protectNodeId,
  actionBudget: 1,
  transitions: [],
  decisions: [{
    id: 'hold-progress-at-one-short',
    all: [
      previewBoolean('finalAppraisal', 'legal'),
      previewBoolean('finalAppraisal', 'policySafe'),
      deterministic('finalAppraisal'),
    ],
    actions: ['finalAppraisal'],
  }],
  onBudgetExhausted: { kind: 'goto', goto: '$resume', setResume: 'clear' },
})

routeNodes.push({
  ordinal: routeNodes.length,
  id: finalNodeId,
  actionBudget: 3,
  transitions: [],
  decisions: [
    {
      id: 'complete-with-basic-synthesis',
      all: [
        previewBoolean('basicSynthesis', 'wouldCompleteProgress'),
        deterministic('basicSynthesis'),
      ],
      actions: ['basicSynthesis'],
      allowBelowObjectiveCompletion: true,
    },
    {
      id: 'complete-with-careful-synthesis',
      all: [
        previewBoolean('carefulSynthesis', 'wouldCompleteProgress'),
        deterministic('carefulSynthesis'),
      ],
      actions: ['carefulSynthesis'],
      allowBelowObjectiveCompletion: true,
    },
    {
      id: 'complete-with-groundwork',
      all: [
        previewBoolean('groundwork', 'wouldCompleteProgress'),
        deterministic('groundwork'),
      ],
      actions: ['groundwork'],
      allowBelowObjectiveCompletion: true,
    },
  ],
  onBudgetExhausted: { kind: 'terminate', reason: 'safe-finish-budget-exhausted' },
})

/**
 * Recipe-owned research artifact. It is executable data, not a callback and
 * not a released policy: every branch is bound to the exact Command Brew
 * recipe/objective hash and is interpreted by the shared v1 controller.
 */
export const COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM = sealCraftAdaptivePolicyProgramV1({
  version: CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION,
  programId: COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM_VERSION,
  scenarioId: 'survey-craftsmans-command-brew',
  recipeProfileId: binding.recipeProfileId,
  scenarioModelIdentityVersion: binding.scenarioModelIdentityVersion,
  scenarioModelContentHash: binding.scenarioModelContentHash,
  objectiveId: binding.objectiveId,
  objectiveMode: 'maximize-quality-with-safe-completion',
  qualityMaximum: 12_000,
  featureSchemaVersion: CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION,
  safetyVersion: CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION,
  entryNode: entryNodeId,
  limits: { maxActions: 40, maxSettleHops: 16 },
  nodes: routeNodes,
})
