import { createHash } from 'node:crypto'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  MATERIAL_CONDITIONS,
  applyObservedOutcome,
  craftScenarioModelContentHash,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  drawSimulatedActionOutcome,
  type EpisodeRandomStream,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  assertCraftAdaptivePolicyProgramV1,
  craftAdaptivePolicyProgramContentHashV1,
  createCraftAdaptivePolicyControllerV1,
  type CraftAdaptivePolicyDecisionResultV1,
  type CraftAdaptivePolicyProgramV1,
  type SerializableCraftAdaptivePolicyMemoryV1,
} from '@frozen-rabbit-expert/solver'
import type { NativeRandomCursor } from './transitionBatch'

export const NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION = 'native-adaptive-policy-matrix-v1' as const
export const NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_CASES = 64
export const NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_STEPS_PER_CASE = 64
export const NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROJECTED_TRANSITIONS = 4_096
export const NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROTOCOL_CELL_BYTES = 1_024
export const NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROJECTED_EVALUATION_UNITS = 25_000_000
export const NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_OUTPUT_BYTES = 64 * 1024 * 1024

const NATIVE_ADAPTIVE_POLICY_MATRIX_OUTPUT_BASE_BYTES_PER_STEP = 16 * 1024
const NATIVE_ADAPTIVE_POLICY_MATRIX_OUTPUT_BASE_BYTES_PER_OUTCOME = 8 * 1024
const NATIVE_ADAPTIVE_POLICY_MATRIX_OUTPUT_SUMMARY_BYTES = 4 * 1024
// Rust currently materializes each flag value as a String cell before joining rows.
const NATIVE_ADAPTIVE_POLICY_MATRIX_PROJECTED_BYTES_PER_FLAG_CELL = 32
const UTF8_ENCODER = new TextEncoder()

export type NativeAdaptivePolicyStopReason =
  | 'completed'
  | 'failed'
  | 'policy-null'
  | 'action-limit'

export interface NativeAdaptivePolicyComparableMemory {
  activeNodeId: string
  resumeNodeId: string | null
  totalActionUses: number
  totalNoStepUses: number
  nodeActionUses: number
  nodeNoStepUses: number
  totalObservedTransitions: number
  actionUses: Readonly<Record<CraftActionId, number>>
  flags: Readonly<Record<string, boolean>>
  lastAction: CraftActionId | null
  lastActionSuccess: boolean | null
  terminated: boolean
  terminationReason: string | null
}

export interface NativeAdaptivePolicyDecisionTrace {
  nodeId: string
  decisionId: string
  action: CraftActionId
  memory: Readonly<NativeAdaptivePolicyComparableMemory>
}

export interface NativeAdaptivePolicyTraceStep {
  index: number
  decision: Readonly<NativeAdaptivePolicyDecisionTrace>
  success: boolean
  nextCondition: MaterialCondition
  cursorBefore: Readonly<NativeRandomCursor>
  cursorAfter: Readonly<NativeRandomCursor>
  explanationCodes: readonly string[]
  before: Readonly<CraftState>
  after: Readonly<CraftState>
  memoryAfter: Readonly<NativeAdaptivePolicyComparableMemory>
}

export interface NativeAdaptivePolicyFinalStatus {
  nodeId: string
  decisionId: string | null
  status: 'active' | 'terminated'
  terminationReason: string | null
}

export interface NativeAdaptivePolicyOutcome {
  caseId: string
  crafterCaseId: string
  worldId: string
  programContentHash: string
  scenarioId: string
  scenarioModelIdentityVersion: typeof CRAFT_SCENARIO_MODEL_IDENTITY_VERSION
  scenarioModelContentHash: string
  featureSchemaVersion: string
  safetyVersion: string
  seed: number
  stopReason: NativeAdaptivePolicyStopReason
  initialCursor: Readonly<NativeRandomCursor>
  finalCursor: Readonly<NativeRandomCursor>
  finalStatus: Readonly<NativeAdaptivePolicyFinalStatus>
  finalState: Readonly<CraftState>
  finalMemory: Readonly<NativeAdaptivePolicyComparableMemory>
  steps: readonly Readonly<NativeAdaptivePolicyTraceStep>[]
}

export interface NativeAdaptivePolicyWorld {
  id: string
  seed: number
  conditionProfile: Readonly<WeightedConditionProfile>
}

export interface NativeAdaptivePolicyCaseSpec {
  caseId: string
  crafterCaseId: string
  crafter: Readonly<CrafterProfile>
  world: Readonly<NativeAdaptivePolicyWorld>
  conditionDrawOffset: number
  successDrawOffset: number
  maxSteps: number
}

export interface PreparedNativeAdaptivePolicyMatrix {
  program: Readonly<CraftAdaptivePolicyProgramV1>
  recipe: typeof SURVEY_CRAFTSMANS_COMMAND_BREW
  objective: typeof SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE
  cases: readonly Readonly<NativeAdaptivePolicyCaseSpec>[]
}

const EXACT_MIN_CRAFTER: Readonly<CrafterProfile> = {
  level: 100,
  craftsmanship: 5_350,
  control: 5_215,
  maxCp: 748,
  cosmicToolGoodBonus: true,
  specialist: false,
}

const EXACT_MAX_CRAFTER: Readonly<CrafterProfile> = {
  level: 100,
  craftsmanship: 5_500,
  control: 5_350,
  maxCp: 780,
  cosmicToolGoodBonus: true,
  specialist: false,
}

const OOD_CP_629_CRAFTER: Readonly<CrafterProfile> = {
  ...PLAYER_EQUIPMENT_PROFILES[0]!.crafter,
  maxCp: 629,
}

const allRows = (
  weights: Readonly<Partial<Record<MaterialCondition, number>>>,
): NonNullable<WeightedConditionProfile['transitionWeights']> => Object.fromEntries(
  MATERIAL_CONDITIONS.map((condition) => [condition, weights]),
) as NonNullable<WeightedConditionProfile['transitionWeights']>

const WORLDS: readonly NativeAdaptivePolicyWorld[] = [
  {
    id: 'all-normal-v1',
    seed: 0x7a11_0001,
    conditionProfile: {
      id: 'native-adaptive-all-normal-v1',
      weights: { normal: 1 },
      transitionWeights: allRows({ normal: 1 }),
      evidence: 'assumption',
    },
  },
  {
    id: 'all-malleable-v1',
    seed: 0x7a11_0002,
    conditionProfile: {
      id: 'native-adaptive-all-malleable-v1',
      weights: { malleable: 1 },
      transitionWeights: allRows({ malleable: 1 }),
      evidence: 'assumption',
    },
  },
  {
    id: 'non-iid-good-chain-v1',
    seed: 0x7a11_0003,
    conditionProfile: {
      id: 'native-adaptive-non-iid-cycle-v1',
      weights: { normal: 1 },
      transitionWeights: {
        normal: { good: 1 },
        good: { good: 1 },
        malleable: { normal: 1 },
        goodOmen: { normal: 1 },
        centered: { normal: 1 },
        sturdy: { malleable: 1 },
        pliant: { normal: 1 },
        primed: { good: 1 },
      },
      evidence: 'assumption',
    },
  },
]

const CRAFTER_CASES: readonly Readonly<{
  id: string
  crafter: Readonly<CrafterProfile>
}>[] = [
  ...PLAYER_EQUIPMENT_PROFILES.map(({ id, crafter }) => ({ id, crafter })),
  { id: 'command-brew-exact-min-v1', crafter: EXACT_MIN_CRAFTER },
  { id: 'command-brew-exact-max-v1', crafter: EXACT_MAX_CRAFTER },
  { id: 'command-brew-ood-cp629-v1', crafter: OOD_CP_629_CRAFTER },
]

function countingRandom(
  seed: number,
  conditionOffset: number,
  successOffset: number,
): { random: EpisodeRandomStream; cursor: () => NativeRandomCursor } {
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

function comparableMemory(
  memory: Readonly<SerializableCraftAdaptivePolicyMemoryV1>,
): NativeAdaptivePolicyComparableMemory {
  return {
    activeNodeId: memory.activeNodeId,
    resumeNodeId: memory.resumeNodeId,
    totalActionUses: memory.totalActionUses,
    totalNoStepUses: memory.totalNoStepUses,
    nodeActionUses: memory.nodeActionUses,
    nodeNoStepUses: memory.nodeNoStepUses,
    totalObservedTransitions: memory.totalObservedTransitions,
    actionUses: { ...memory.actionUses },
    flags: { ...memory.flags },
    lastAction: memory.lastAction,
    lastActionSuccess: memory.lastActionSuccess,
    terminated: memory.terminated,
    terminationReason: memory.terminationReason,
  }
}

function finalStatusFromDecision(
  decision: Readonly<CraftAdaptivePolicyDecisionResultV1>,
): NativeAdaptivePolicyFinalStatus {
  return {
    nodeId: decision.nodeId,
    decisionId: decision.decisionId,
    status: decision.status,
    terminationReason: decision.terminationReason,
  }
}

function finalStatusFromMemory(
  memory: Readonly<SerializableCraftAdaptivePolicyMemoryV1>,
): NativeAdaptivePolicyFinalStatus {
  return {
    nodeId: memory.activeNodeId,
    decisionId: null,
    status: memory.terminated ? 'terminated' : 'active',
    terminationReason: memory.terminationReason,
  }
}

function assertPreparedIdentity(prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>): void {
  const { program, recipe, objective } = prepared
  assertCraftAdaptivePolicyProgramV1(program)
  const { contentHash: _contentHash, ...definition } = program
  if (craftAdaptivePolicyProgramContentHashV1(definition) !== program.contentHash) {
    throw new Error('adaptive program canonical content hash mismatch')
  }
  const scenarioHash = craftScenarioModelContentHash(recipe, objective)
  if (
    program.scenarioModelIdentityVersion !== CRAFT_SCENARIO_MODEL_IDENTITY_VERSION
    || program.scenarioModelContentHash !== scenarioHash
  ) throw new Error('adaptive program scenario model identity mismatch')
  if (
    program.recipeProfileId !== recipe.profileId
    || program.objectiveId !== objective.objectiveId
    || program.objectiveMode !== objective.mode
    || program.qualityMaximum !== recipe.qualityMax
  ) throw new Error('adaptive program recipe/objective binding mismatch')
}

function checkedAdd(left: number, right: number, label: string): number {
  const value = left + right
  if (!Number.isSafeInteger(value)) throw new RangeError(`adaptive matrix ${label} overflow`)
  return value
}

function checkedMultiply(left: number, right: number, label: string): number {
  const value = left * right
  if (!Number.isSafeInteger(value)) throw new RangeError(`adaptive matrix ${label} overflow`)
  return value
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).length
}

function assertProtocolCell(value: string, label: string): void {
  if (value.length === 0 || /[\t\r\n]/u.test(value)) {
    throw new Error(`${label} is not a safe adaptive-policy TSV cell`)
  }
  const bytes = utf8ByteLength(value)
  if (bytes > NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROTOCOL_CELL_BYTES) {
    throw new RangeError(
      `${label} has ${bytes} bytes and exceeds the adaptive-policy protocol cell cap`,
    )
  }
}

function referencedProgramFlagCount(program: Readonly<CraftAdaptivePolicyProgramV1>): number {
  const flags = new Set<string>()
  const inspectGuards = (guards: readonly Readonly<{ kind: string; feature: string }>[]): void => {
    for (const guard of guards) {
      if (guard.kind === 'boolean' && guard.feature.startsWith('memory.flags.')) {
        flags.add(guard.feature.slice('memory.flags.'.length))
      }
    }
  }
  for (const node of program.nodes) {
    if (node.onBudgetExhausted.kind === 'goto' && node.onBudgetExhausted.setFlag !== undefined) {
      flags.add(node.onBudgetExhausted.setFlag.flag)
    }
    for (const transition of node.transitions) {
      if (transition.setFlag !== undefined) flags.add(transition.setFlag.flag)
      inspectGuards(transition.all)
    }
    for (const decision of node.decisions) inspectGuards(decision.all)
  }
  return flags.size
}

function projectedEvaluationUnits(
  program: Readonly<CraftAdaptivePolicyProgramV1>,
  projectedTransitions: number,
): number {
  const maximumTransitionUnits = Math.max(1, ...program.nodes.map((node) => (
    node.transitions.reduce((total, transition) => (
      checkedAdd(total, 1 + transition.all.length, 'transition evaluation units')
    ), 0)
  )))
  const maximumDecisionUnits = Math.max(1, ...program.nodes.map((node) => (
    node.decisions.reduce((total, decision) => checkedAdd(
      total,
      1 + decision.all.length + decision.actions.length * 3,
      'decision evaluation units',
    ), 0)
  )))
  const settleUnits = checkedMultiply(
    program.limits.maxSettleHops + 1,
    maximumTransitionUnits,
    'settle evaluation units',
  )
  const perStep = checkedAdd(
    checkedMultiply(2, settleUnits, 'per-step settle evaluation units'),
    maximumDecisionUnits,
    'per-step evaluation units',
  )
  return checkedMultiply(projectedTransitions, perStep, 'projected evaluation units')
}

function projectedOutputBytes(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
): number {
  const identityBytes = [
    prepared.program.contentHash,
    prepared.program.scenarioId,
    prepared.program.scenarioModelIdentityVersion,
    prepared.program.scenarioModelContentHash,
    prepared.program.featureSchemaVersion,
    prepared.program.safetyVersion,
  ].reduce((total, value) => checkedAdd(total, utf8ByteLength(value), 'identity output bytes'), 0)
  const flagCellsBytes = checkedMultiply(
    referencedProgramFlagCount(prepared.program),
    NATIVE_ADAPTIVE_POLICY_MATRIX_PROJECTED_BYTES_PER_FLAG_CELL,
    'flag output bytes',
  )
  let total = NATIVE_ADAPTIVE_POLICY_MATRIX_OUTPUT_SUMMARY_BYTES
  for (const spec of prepared.cases) {
    const caseIdBytes = utf8ByteLength(spec.caseId)
    const stepBytes = checkedAdd(
      checkedAdd(
        NATIVE_ADAPTIVE_POLICY_MATRIX_OUTPUT_BASE_BYTES_PER_STEP,
        checkedAdd(caseIdBytes, identityBytes, 'step identity output bytes'),
        'step output bytes',
      ),
      checkedMultiply(2, flagCellsBytes, 'step flag output bytes'),
      'step output bytes',
    )
    const outcomeBytes = [
      NATIVE_ADAPTIVE_POLICY_MATRIX_OUTPUT_BASE_BYTES_PER_OUTCOME,
      caseIdBytes,
      identityBytes,
      utf8ByteLength(spec.crafterCaseId),
      utf8ByteLength(spec.world.id),
      flagCellsBytes,
    ].reduce((subtotal, value) => checkedAdd(subtotal, value, 'outcome output bytes'), 0)
    total = checkedAdd(
      total,
      checkedAdd(
        checkedMultiply(spec.maxSteps, stepBytes, 'case step output bytes'),
        outcomeBytes,
        'case output bytes',
      ),
      'batch output bytes',
    )
  }
  return total
}

export function validatePreparedNativeAdaptivePolicyMatrix(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
): void {
  assertPreparedIdentity(prepared)
  if (prepared.cases.length < 1 || prepared.cases.length > NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_CASES) {
    throw new RangeError(`adaptive matrix cases must contain 1..${NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_CASES}`)
  }
  const caseIds = new Set<string>()
  let projectedTransitions = 0
  for (const spec of prepared.cases) {
    assertProtocolCell(spec.caseId, 'caseId')
    assertProtocolCell(spec.crafterCaseId, `${spec.caseId}.crafterCaseId`)
    assertProtocolCell(spec.world.id, `${spec.caseId}.worldId`)
    if (caseIds.has(spec.caseId)) throw new Error(`duplicate adaptive matrix case ${spec.caseId}`)
    caseIds.add(spec.caseId)
    if (
      !Number.isSafeInteger(spec.maxSteps)
      || spec.maxSteps < 1
      || spec.maxSteps > NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_STEPS_PER_CASE
    ) throw new RangeError(`${spec.caseId}.maxSteps is outside the adaptive matrix bound`)
    for (const [label, value] of [
      ['seed', spec.world.seed],
      ['conditionDrawOffset', spec.conditionDrawOffset],
      ['successDrawOffset', spec.successDrawOffset],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
        throw new RangeError(`${spec.caseId}.${label} must be uint32`)
      }
    }
    projectedTransitions += spec.maxSteps
  }
  if (projectedTransitions > NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROJECTED_TRANSITIONS) {
    throw new RangeError('adaptive matrix projected transitions exceed the batch cap')
  }
  const evaluationUnits = projectedEvaluationUnits(prepared.program, projectedTransitions)
  if (evaluationUnits > NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROJECTED_EVALUATION_UNITS) {
    throw new RangeError(
      `adaptive matrix projected evaluation units ${evaluationUnits} exceed ${NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROJECTED_EVALUATION_UNITS}`,
    )
  }
  const outputBytes = projectedOutputBytes(prepared)
  if (outputBytes > NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_OUTPUT_BYTES) {
    throw new RangeError(
      `adaptive matrix projected output bytes ${outputBytes} exceed ${NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_OUTPUT_BYTES}`,
    )
  }
}

export function executePreparedNativeAdaptivePolicyCase(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
  spec: Readonly<NativeAdaptivePolicyCaseSpec>,
): NativeAdaptivePolicyOutcome {
  assertPreparedIdentity(prepared)
  const { program, recipe, objective } = prepared
  const initialState = createInitialCraftState(recipe, spec.crafter)
  const controller = createCraftAdaptivePolicyControllerV1({
    scenarioId: program.scenarioId,
    recipe,
    objective,
    crafter: spec.crafter,
  }, program)
  const counted = countingRandom(spec.world.seed, spec.conditionDrawOffset, spec.successDrawOffset)
  const initialCursor = counted.cursor()
  let state = initialState
  let finalMemory = comparableMemory(controller.snapshot())
  let finalStatus: NativeAdaptivePolicyFinalStatus = {
    nodeId: program.entryNode,
    decisionId: null,
    status: 'active',
    terminationReason: null,
  }
  let stopReason: NativeAdaptivePolicyStopReason | null = null
  const steps: NativeAdaptivePolicyTraceStep[] = []

  while (state.terminal === 'none' && steps.length < spec.maxSteps) {
    const decision = controller.decide(state)
    if (decision.action === null) {
      finalMemory = comparableMemory(decision.memory)
      finalStatus = finalStatusFromDecision(decision)
      stopReason = 'policy-null'
      break
    }
    if (decision.decisionId === null) throw new Error(`${spec.caseId} active decision has no decisionId`)
    const action = decision.action
    const preview = previewAction(recipe, spec.crafter, state, action)
    if (!preview.legal) throw new Error(`${spec.caseId} adaptive program returned illegal ${action}`)
    const cursorBefore = counted.cursor()
    const observed = drawSimulatedActionOutcome(
      preview,
      state,
      spec.world.conditionProfile,
      counted.random,
    )
    const before = state
    const transition = applyObservedOutcome(recipe, spec.crafter, before, action, observed)
    state = transition.nextState
    const advanced = controller.advance({
      before,
      action,
      success: observed.success,
      after: state,
    })
    const cursorAfter = counted.cursor()
    steps.push({
      index: steps.length,
      decision: {
        nodeId: decision.nodeId,
        decisionId: decision.decisionId,
        action,
        memory: comparableMemory(decision.memory),
      },
      success: observed.success,
      nextCondition: observed.nextCondition,
      cursorBefore,
      cursorAfter,
      explanationCodes: transition.explanationCodes,
      before,
      after: state,
      memoryAfter: comparableMemory(advanced),
    })
    finalMemory = comparableMemory(advanced)
    finalStatus = finalStatusFromMemory(advanced)
    if (state.terminal === 'completed' || state.terminal === 'failed') {
      stopReason = state.terminal
      break
    }
    if (steps.length >= spec.maxSteps) {
      stopReason = 'action-limit'
      break
    }
  }

  stopReason ??= state.terminal === 'completed'
    ? 'completed'
    : state.terminal === 'failed'
      ? 'failed'
      : steps.length >= spec.maxSteps
        ? 'action-limit'
        : 'policy-null'

  return {
    caseId: spec.caseId,
    crafterCaseId: spec.crafterCaseId,
    worldId: spec.world.id,
    programContentHash: program.contentHash,
    scenarioId: program.scenarioId,
    scenarioModelIdentityVersion: program.scenarioModelIdentityVersion,
    scenarioModelContentHash: program.scenarioModelContentHash,
    featureSchemaVersion: program.featureSchemaVersion,
    safetyVersion: program.safetyVersion,
    seed: spec.world.seed,
    stopReason,
    initialCursor,
    finalCursor: counted.cursor(),
    finalStatus,
    finalState: state,
    finalMemory,
    steps,
  }
}

export function executePreparedNativeAdaptivePolicyMatrix(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
): readonly NativeAdaptivePolicyOutcome[] {
  validatePreparedNativeAdaptivePolicyMatrix(prepared)
  return prepared.cases.map((spec) => executePreparedNativeAdaptivePolicyCase(prepared, spec))
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalJsonValue(entry)]))
  }
  return value
}

export function nativeAdaptivePolicyOutcomeSha256(
  outcomes: readonly NativeAdaptivePolicyOutcome[],
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJsonValue(outcomes)))
    .digest('hex')
}

export function prepareNativeAdaptivePolicyMatrix(): PreparedNativeAdaptivePolicyMatrix {
  const cases = CRAFTER_CASES.flatMap(({ id: crafterCaseId, crafter }, crafterIndex) => (
    WORLDS.map((world, worldIndex) => ({
      caseId: `${crafterCaseId}.${world.id}`,
      crafterCaseId,
      crafter,
      world: {
        ...world,
        seed: (world.seed + Math.imul(crafterIndex + 1, 0x101) + worldIndex) >>> 0,
      },
      conditionDrawOffset: worldIndex,
      successDrawOffset: crafterIndex % 3,
      maxSteps: COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM.limits.maxActions,
    }))
  ))
  const prepared: PreparedNativeAdaptivePolicyMatrix = {
    program: COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    cases,
  }
  validatePreparedNativeAdaptivePolicyMatrix(prepared)
  return prepared
}
