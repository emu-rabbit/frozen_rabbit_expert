import {
  ACTIONS,
  ACTION_IDS,
  createInitialCraftState,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import type {
  CraftAdaptivePolicyGuardV1,
  CraftAdaptivePolicyProgramV1,
} from '@frozen-rabbit-expert/solver'
import {
  NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
  NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROTOCOL_CELL_BYTES,
  nativeAdaptivePolicyOutcomeSha256,
  validatePreparedNativeAdaptivePolicyMatrix,
  type NativeAdaptivePolicyComparableMemory,
  type NativeAdaptivePolicyFinalStatus,
  type NativeAdaptivePolicyOutcome,
  type NativeAdaptivePolicyStopReason,
  type NativeAdaptivePolicyTraceStep,
  type PreparedNativeAdaptivePolicyMatrix,
} from './adaptivePolicyMatrix'
import {
  decodeNativeStateCells,
  encodeNativeStateCells,
  outputFnv1a64,
  parsedBoolean,
  parsedCondition,
  requiredInteger,
} from './transitionBatchProtocol'

const EMPTY = '-'
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
const UTF8_ENCODER = new TextEncoder()

// native-adaptive-policy-matrix-v1 is a frozen five-recipe checkpoint whose
// wire contract predates Robust. Do not let the global condition enum silently
// mutate this historical ABI; the Rust parser rejects a Robust initial state.
const ADAPTIVE_POLICY_V1_WIRE_CONDITIONS = [
  'normal',
  'good',
  'goodOmen',
  'centered',
  'sturdy',
  'pliant',
  'malleable',
  'primed',
] as const satisfies readonly MaterialCondition[]

export interface ParsedNativeAdaptivePolicyMatrix {
  outcomes: readonly NativeAdaptivePolicyOutcome[]
  summary: Readonly<{
    cases: number
    transitions: number
    kernelNs: number
    outputFnv1a64Hex: string
    structuredFnv1a32Hex: string
  }>
  fullTraceSha256: string
}

function safeCell(value: string, label: string): string {
  if (value.length === 0 || /[\t\r\n]/u.test(value)) {
    throw new Error(`${label} is not a safe adaptive-policy TSV cell`)
  }
  const bytes = UTF8_ENCODER.encode(value).length
  if (bytes > NATIVE_ADAPTIVE_POLICY_MATRIX_MAX_PROTOCOL_CELL_BYTES) {
    throw new RangeError(`${label} exceeds the adaptive-policy protocol cell cap`)
  }
  return value
}

function boolCell(value: boolean): string {
  return value ? '1' : '0'
}

function optionalCell(value: string | null | undefined): string {
  return value === null || value === undefined ? EMPTY : safeCell(value, 'optional value')
}

function effectCells(effect: Readonly<{
  kind?: 'goto' | 'terminate'
  goto?: string
  reason?: string
  setResume?: 'active-node' | 'clear'
  setFlag?: Readonly<{ flag: string; value: boolean }>
}>): readonly string[] {
  return [
    effect.kind ?? 'goto',
    effect.kind === 'terminate'
      ? safeCell(effect.reason ?? '', 'termination reason')
      : safeCell(effect.goto ?? '', 'goto'),
    optionalCell(effect.setResume),
    optionalCell(effect.setFlag?.flag),
    effect.setFlag === undefined ? EMPTY : boolCell(effect.setFlag.value),
  ]
}

function guardCells(guard: Readonly<CraftAdaptivePolicyGuardV1>): readonly string[] {
  return [
    guard.kind,
    safeCell(guard.feature, 'guard feature'),
    guard.op,
    guard.kind === 'boolean' ? boolCell(guard.value) : String(guard.value),
  ]
}

export function adaptivePolicyProgramFlagIds(
  program: Readonly<CraftAdaptivePolicyProgramV1>,
): readonly string[] {
  const flags = new Set<string>()
  for (const node of program.nodes) {
    if (node.onBudgetExhausted.kind === 'goto' && node.onBudgetExhausted.setFlag !== undefined) {
      flags.add(node.onBudgetExhausted.setFlag.flag)
    }
    for (const transition of node.transitions) {
      if (transition.setFlag !== undefined) flags.add(transition.setFlag.flag)
      for (const guard of transition.all) {
        if (guard.kind === 'boolean' && guard.feature.startsWith('memory.flags.')) {
          flags.add(guard.feature.slice('memory.flags.'.length))
        }
      }
    }
    for (const decision of node.decisions) {
      for (const guard of decision.all) {
        if (guard.kind === 'boolean' && guard.feature.startsWith('memory.flags.')) {
          flags.add(guard.feature.slice('memory.flags.'.length))
        }
      }
    }
  }
  return [...flags].sort()
}

function encodeProgramRows(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
): readonly (readonly string[])[] {
  const { program } = prepared
  const rows: string[][] = [[
    NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
    '__program__',
    'program',
    program.version,
    safeCell(program.programId, 'programId'),
    program.contentHash,
    safeCell(program.scenarioId, 'scenarioId'),
    safeCell(program.recipeProfileId, 'recipeProfileId'),
    program.scenarioModelIdentityVersion,
    program.scenarioModelContentHash,
    safeCell(program.objectiveId, 'objectiveId'),
    program.objectiveMode,
    String(program.qualityTarget),
    program.featureSchemaVersion,
    program.safetyVersion,
    safeCell(program.entryNode, 'entryNode'),
    String(program.limits.maxActions),
    String(program.limits.maxSettleHops),
    String(program.nodes.length),
    String(prepared.cases.length),
  ]]

  for (const node of program.nodes) {
    rows.push([
      NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
      safeCell(node.id, 'nodeId'),
      'node',
      String(node.ordinal),
      String(node.actionBudget),
      ...effectCells(node.onBudgetExhausted),
      String(node.transitions.length),
      String(node.decisions.length),
    ])
    node.transitions.forEach((transition, transitionIndex) => {
      rows.push([
        NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
        safeCell(node.id, 'nodeId'),
        'transition',
        String(transitionIndex),
        safeCell(transition.id, 'transitionId'),
        ...effectCells(transition),
        String(transition.all.length),
      ])
      transition.all.forEach((guard, guardIndex) => {
        rows.push([
          NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
          safeCell(node.id, 'nodeId'),
          'transition-guard',
          String(transitionIndex),
          String(guardIndex),
          ...guardCells(guard),
        ])
      })
    })
    node.decisions.forEach((decision, decisionIndex) => {
      rows.push([
        NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
        safeCell(node.id, 'nodeId'),
        'decision',
        String(decisionIndex),
        safeCell(decision.id, 'decisionId'),
        boolCell(decision.allowBelowObjectiveCompletion === true),
        String(decision.actions.length),
        String(decision.all.length),
      ])
      decision.all.forEach((guard, guardIndex) => {
        rows.push([
          NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
          safeCell(node.id, 'nodeId'),
          'decision-guard',
          String(decisionIndex),
          String(guardIndex),
          ...guardCells(guard),
        ])
      })
      decision.actions.forEach((action, actionIndex) => {
        rows.push([
          NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
          safeCell(node.id, 'nodeId'),
          'decision-action',
          String(decisionIndex),
          String(actionIndex),
          action,
        ])
      })
    })
  }
  return rows
}

function transitionWeightCells(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
  caseIndex: number,
): readonly string[] {
  const profile = prepared.cases[caseIndex]!.world.conditionProfile
  return ADAPTIVE_POLICY_V1_WIRE_CONDITIONS.flatMap((previous) => {
    const weights = profile.transitionWeights?.[previous] ?? profile.weights
    return ADAPTIVE_POLICY_V1_WIRE_CONDITIONS.map((next) => String(weights[next] ?? 0))
  })
}

function encodeCaseRow(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
  caseIndex: number,
): readonly string[] {
  const { program, recipe, objective } = prepared
  const spec = prepared.cases[caseIndex]!
  const initialState = createInitialCraftState(recipe, spec.crafter)
  return [
    NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
    safeCell(spec.caseId, 'caseId'),
    'case',
    program.contentHash,
    safeCell(program.scenarioId, 'scenarioId'),
    program.scenarioModelIdentityVersion,
    program.scenarioModelContentHash,
    program.featureSchemaVersion,
    program.safetyVersion,
    safeCell(program.recipeProfileId, 'recipeProfileId'),
    safeCell(program.objectiveId, 'objectiveId'),
    objective.mode,
    String(objective.qualityTarget),
    safeCell(spec.crafterCaseId, 'crafterCaseId'),
    safeCell(spec.world.id, 'worldId'),
    String(recipe.canonicalRecipeId),
    String(recipe.recipeLevel),
    String(recipe.progressRequired),
    String(recipe.qualityMax),
    String(recipe.requiredQuality),
    String(recipe.durabilityMax),
    String(recipe.progressDivider),
    String(recipe.qualityDivider),
    String(recipe.progressModifier),
    String(recipe.qualityModifier),
    String(spec.crafter.level),
    String(spec.crafter.craftsmanship),
    String(spec.crafter.control),
    String(spec.crafter.maxCp),
    boolCell(spec.crafter.cosmicToolGoodBonus),
    boolCell(spec.crafter.specialist === true),
    ...encodeNativeStateCells(initialState),
    String(spec.world.seed >>> 0),
    String(spec.conditionDrawOffset),
    String(spec.successDrawOffset),
    String(spec.maxSteps),
    ...transitionWeightCells(prepared, caseIndex),
  ]
}

export function encodeNativeAdaptivePolicyMatrixInput(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
): string {
  validatePreparedNativeAdaptivePolicyMatrix(prepared)
  const rows = [
    ...encodeProgramRows(prepared),
    ...prepared.cases.map((_, index) => encodeCaseRow(prepared, index)),
  ]
  return `${rows.map((row) => row.join('\t')).join('\n')}\n`
}

function memoryCells(
  memory: Readonly<NativeAdaptivePolicyComparableMemory>,
  flagIds: readonly string[],
): readonly string[] {
  return [
    safeCell(memory.activeNodeId, 'memory.activeNodeId'),
    optionalCell(memory.resumeNodeId),
    String(memory.totalActionUses),
    String(memory.totalNoStepUses),
    String(memory.nodeActionUses),
    String(memory.nodeNoStepUses),
    String(memory.totalObservedTransitions),
    ...ACTION_IDS.map((action) => String(memory.actionUses[action])),
    ...flagIds.map((flag) => boolCell(memory.flags[flag] === true)),
    optionalCell(memory.lastAction),
    memory.lastActionSuccess === null ? EMPTY : memory.lastActionSuccess ? 'success' : 'failure',
    boolCell(memory.terminated),
    optionalCell(memory.terminationReason),
  ]
}

function identityCells(outcome: Readonly<NativeAdaptivePolicyOutcome>): readonly string[] {
  return [
    outcome.programContentHash,
    outcome.scenarioId,
    outcome.scenarioModelIdentityVersion,
    outcome.scenarioModelContentHash,
    outcome.featureSchemaVersion,
    outcome.safetyVersion,
  ]
}

function stepCells(
  outcome: Readonly<NativeAdaptivePolicyOutcome>,
  step: Readonly<NativeAdaptivePolicyTraceStep>,
  flagIds: readonly string[],
): readonly string[] {
  return [
    NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
    outcome.caseId,
    'step',
    'ok',
    ...identityCells(outcome),
    String(step.index),
    step.decision.nodeId,
    step.decision.decisionId,
    step.decision.action,
    boolCell(step.success),
    step.nextCondition,
    String(step.cursorBefore.condition),
    String(step.cursorBefore.success),
    String(step.cursorAfter.condition),
    String(step.cursorAfter.success),
    ...encodeNativeStateCells(step.before),
    ...encodeNativeStateCells(step.after),
    ...memoryCells(step.decision.memory, flagIds),
    ...memoryCells(step.memoryAfter, flagIds),
    String(step.explanationCodes.length),
    ...step.explanationCodes,
  ]
}

function outcomeCells(
  outcome: Readonly<NativeAdaptivePolicyOutcome>,
  flagIds: readonly string[],
): readonly string[] {
  return [
    NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
    outcome.caseId,
    'outcome',
    'ok',
    ...identityCells(outcome),
    outcome.crafterCaseId,
    outcome.worldId,
    String(outcome.seed),
    outcome.stopReason,
    String(outcome.initialCursor.condition),
    String(outcome.initialCursor.success),
    String(outcome.finalCursor.condition),
    String(outcome.finalCursor.success),
    outcome.finalStatus.nodeId,
    optionalCell(outcome.finalStatus.decisionId),
    outcome.finalStatus.status,
    optionalCell(outcome.finalStatus.terminationReason),
    ...encodeNativeStateCells(outcome.finalState),
    ...memoryCells(outcome.finalMemory, flagIds),
    String(outcome.steps.length),
  ]
}

export function nativeAdaptivePolicyComparableOutputRows(
  program: Readonly<CraftAdaptivePolicyProgramV1>,
  outcomes: readonly Readonly<NativeAdaptivePolicyOutcome>[],
): readonly (readonly string[])[] {
  const flagIds = adaptivePolicyProgramFlagIds(program)
  return outcomes.flatMap((outcome) => [
    ...outcome.steps.map((step) => stepCells(outcome, step, flagIds)),
    outcomeCells(outcome, flagIds),
  ])
}

function fnv1a32Bytes(hash: number, bytes: Uint8Array): number {
  let next = hash >>> 0
  for (const byte of bytes) {
    next ^= byte
    next = Math.imul(next, 0x0100_0193) >>> 0
  }
  return next
}

function uint32LittleEndian(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
  return bytes
}

export function nativeAdaptivePolicyRowsFnv1a32Hex(
  rows: readonly (readonly string[])[],
): string {
  let hash = 0x811c_9dc5
  for (const row of rows) {
    hash = fnv1a32Bytes(hash, uint32LittleEndian(row.length))
    for (const cell of row) {
      const bytes = UTF8_ENCODER.encode(cell)
      hash = fnv1a32Bytes(hash, uint32LittleEndian(bytes.length))
      hash = fnv1a32Bytes(hash, bytes)
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function encodeNativeAdaptivePolicyExpectedOutput(
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
  outcomes: readonly Readonly<NativeAdaptivePolicyOutcome>[],
  kernelNs = 0,
): string {
  const rows = nativeAdaptivePolicyComparableOutputRows(prepared.program, outcomes)
  const lines = rows.map((row) => row.join('\t'))
  const summary = [
    NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION,
    '__batch__',
    'summary',
    'ok',
    String(outcomes.length),
    String(outcomes.reduce((total, outcome) => total + outcome.steps.length, 0)),
    String(kernelNs),
    outputFnv1a64(lines),
    nativeAdaptivePolicyRowsFnv1a32Hex(rows),
  ]
  return `${[...lines, summary.join('\t')].join('\n')}\n`
}

class OutputCells {
  private index = 0

  constructor(
    private readonly values: readonly string[],
    private readonly label: string,
  ) {}

  next(name: string): string {
    const value = this.values[this.index]
    if (value === undefined) throw new Error(`${this.label} is missing ${name}`)
    this.index += 1
    return value
  }

  integer(name: string): number {
    return requiredInteger(this.next(name), `${this.label}.${name}`)
  }

  boolean(name: string): boolean {
    return parsedBoolean(this.next(name), `${this.label}.${name}`)
  }

  optional(name: string): string | null {
    const value = this.next(name)
    return value === EMPTY ? null : value
  }

  rest(): readonly string[] {
    const rest = this.values.slice(this.index)
    this.index = this.values.length
    return rest
  }

  finish(): void {
    if (this.index !== this.values.length) {
      throw new Error(`${this.label} has ${this.values.length - this.index} extra cells`)
    }
  }
}

function parseAction(value: string, label: string): CraftActionId {
  if (ACTIONS[value as CraftActionId] === undefined) throw new Error(`${label} has unknown action ${value}`)
  return value as CraftActionId
}

function parseMemory(
  cells: OutputCells,
  flagIds: readonly string[],
  label: string,
): NativeAdaptivePolicyComparableMemory {
  const activeNodeId = cells.next(`${label}.activeNodeId`)
  const resumeNodeId = cells.optional(`${label}.resumeNodeId`)
  const totalActionUses = cells.integer(`${label}.totalActionUses`)
  const totalNoStepUses = cells.integer(`${label}.totalNoStepUses`)
  const nodeActionUses = cells.integer(`${label}.nodeActionUses`)
  const nodeNoStepUses = cells.integer(`${label}.nodeNoStepUses`)
  const totalObservedTransitions = cells.integer(`${label}.totalObservedTransitions`)
  const actionUses = Object.fromEntries(ACTION_IDS.map((action) => [
    action,
    cells.integer(`${label}.actionUses.${action}`),
  ])) as Record<CraftActionId, number>
  const flags = Object.fromEntries(flagIds.map((flag) => [
    flag,
    cells.boolean(`${label}.flags.${flag}`),
  ]))
  const lastActionCell = cells.optional(`${label}.lastAction`)
  const outcomeCell = cells.next(`${label}.lastActionOutcome`)
  if (outcomeCell !== EMPTY && outcomeCell !== 'success' && outcomeCell !== 'failure') {
    throw new Error(`${label}.lastActionOutcome is invalid`)
  }
  return {
    activeNodeId,
    resumeNodeId,
    totalActionUses,
    totalNoStepUses,
    nodeActionUses,
    nodeNoStepUses,
    totalObservedTransitions,
    actionUses,
    flags,
    lastAction: lastActionCell === null ? null : parseAction(lastActionCell, `${label}.lastAction`),
    lastActionSuccess: outcomeCell === EMPTY ? null : outcomeCell === 'success',
    terminated: cells.boolean(`${label}.terminated`),
    terminationReason: cells.optional(`${label}.terminationReason`),
  }
}

function parseIdentity(
  cells: OutputCells,
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
  label: string,
): readonly [string, string, string, string, string, string] {
  const actual = [
    cells.next('programContentHash'),
    cells.next('scenarioId'),
    cells.next('scenarioModelIdentityVersion'),
    cells.next('scenarioModelContentHash'),
    cells.next('featureSchemaVersion'),
    cells.next('safetyVersion'),
  ] as const
  const expected = [
    prepared.program.contentHash,
    prepared.program.scenarioId,
    prepared.program.scenarioModelIdentityVersion,
    prepared.program.scenarioModelContentHash,
    prepared.program.featureSchemaVersion,
    prepared.program.safetyVersion,
  ] as const
  if (actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} adaptive-policy identity echo mismatch`)
  }
  return actual
}

function parseState(cells: OutputCells, label: string): CraftState {
  const values = Array.from({ length: 24 }, (_, index) => cells.next(`${label}[${index}]`))
  return decodeNativeStateCells(values, label)
}

function parseStopReason(value: string, label: string): NativeAdaptivePolicyStopReason {
  if (value === 'completed' || value === 'failed' || value === 'policy-null' || value === 'action-limit') {
    return value
  }
  throw new Error(`${label} has invalid stop reason ${value}`)
}

function parseFinalStatus(
  nodeId: string,
  decisionId: string | null,
  status: string,
  terminationReason: string | null,
  label: string,
): NativeAdaptivePolicyFinalStatus {
  if (status !== 'active' && status !== 'terminated') throw new Error(`${label} has invalid status ${status}`)
  return { nodeId, decisionId, status, terminationReason }
}

export function parseNativeAdaptivePolicyMatrixOutput(
  stdout: string,
  prepared: Readonly<PreparedNativeAdaptivePolicyMatrix>,
): ParsedNativeAdaptivePolicyMatrix {
  validatePreparedNativeAdaptivePolicyMatrix(prepared)
  if (UTF8_ENCODER.encode(stdout).length > MAX_OUTPUT_BYTES) {
    throw new RangeError('native adaptive-policy output exceeds 64 MiB')
  }
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0)
  const summaryLine = lines.pop()
  if (summaryLine === undefined) throw new Error('native adaptive-policy matrix produced no output')
  const summaryCells = summaryLine.split('\t')
  if (
    summaryCells.length !== 9
    || summaryCells[0] !== NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION
    || summaryCells[1] !== '__batch__'
    || summaryCells[2] !== 'summary'
    || summaryCells[3] !== 'ok'
  ) throw new Error(`invalid adaptive-policy summary: ${summaryLine}`)
  const outputRows = lines.map((line) => line.split('\t'))
  const summary = {
    cases: requiredInteger(summaryCells[4]!, 'summary.cases'),
    transitions: requiredInteger(summaryCells[5]!, 'summary.transitions'),
    kernelNs: requiredInteger(summaryCells[6]!, 'summary.kernelNs'),
    outputFnv1a64Hex: summaryCells[7]!,
    structuredFnv1a32Hex: summaryCells[8]!,
  }
  if (outputFnv1a64(lines) !== summary.outputFnv1a64Hex) {
    throw new Error('native adaptive-policy raw output FNV-1a64 mismatch')
  }
  if (nativeAdaptivePolicyRowsFnv1a32Hex(outputRows) !== summary.structuredFnv1a32Hex) {
    throw new Error('native adaptive-policy structured FNV-1a32 mismatch')
  }

  const flagIds = adaptivePolicyProgramFlagIds(prepared.program)
  const stepsByCase = new Map<string, NativeAdaptivePolicyTraceStep[]>()
  const outcomes = new Map<string, NativeAdaptivePolicyOutcome>()
  for (const row of outputRows) {
    const caseId = row[1] ?? EMPTY
    const cells = new OutputCells(row, caseId)
    if (cells.next('version') !== NATIVE_ADAPTIVE_POLICY_MATRIX_VERSION) {
      throw new Error(`${caseId} has unsupported adaptive-policy output version`)
    }
    if (cells.next('caseId') !== caseId) throw new Error(`${caseId} case echo mismatch`)
    const kind = cells.next('kind')
    if (cells.next('status') !== 'ok') throw new Error(`${caseId} native adaptive-policy error`)
    const identity = parseIdentity(cells, prepared, caseId)
    if (kind === 'step') {
      const index = cells.integer('step.index')
      const nodeId = cells.next('step.nodeId')
      const decisionId = cells.next('step.decisionId')
      const action = parseAction(cells.next('step.action'), `${caseId}.step.action`)
      const success = cells.boolean('step.success')
      const nextCondition = parsedCondition(cells.next('step.nextCondition'), `${caseId}.step.nextCondition`)
      const cursorBefore = { condition: cells.integer('cursorBefore.condition'), success: cells.integer('cursorBefore.success') }
      const cursorAfter = { condition: cells.integer('cursorAfter.condition'), success: cells.integer('cursorAfter.success') }
      const before = parseState(cells, `${caseId}.before`)
      const after = parseState(cells, `${caseId}.after`)
      const memory = parseMemory(cells, flagIds, `${caseId}.decisionMemory`)
      const memoryAfter = parseMemory(cells, flagIds, `${caseId}.memoryAfter`)
      const explanationCount = cells.integer('explanationCount')
      const explanationCodes = cells.rest()
      if (explanationCodes.length !== explanationCount) throw new Error(`${caseId} explanation count mismatch`)
      const steps = stepsByCase.get(caseId) ?? []
      if (index !== steps.length) throw new Error(`${caseId} step index is not contiguous`)
      steps.push({
        index,
        decision: { nodeId, decisionId, action, memory },
        success,
        nextCondition,
        cursorBefore,
        cursorAfter,
        explanationCodes,
        before,
        after,
        memoryAfter,
      })
      stepsByCase.set(caseId, steps)
      continue
    }
    if (kind !== 'outcome') throw new Error(`${caseId} has unknown adaptive-policy row ${kind}`)
    if (outcomes.has(caseId)) throw new Error(`${caseId} has duplicate outcome`)
    const crafterCaseId = cells.next('crafterCaseId')
    const worldId = cells.next('worldId')
    const seed = cells.integer('seed')
    const stopReason = parseStopReason(cells.next('stopReason'), caseId)
    const initialCursor = { condition: cells.integer('initialCursor.condition'), success: cells.integer('initialCursor.success') }
    const finalCursor = { condition: cells.integer('finalCursor.condition'), success: cells.integer('finalCursor.success') }
    const finalStatus = parseFinalStatus(
      cells.next('finalStatus.nodeId'),
      cells.optional('finalStatus.decisionId'),
      cells.next('finalStatus.status'),
      cells.optional('finalStatus.terminationReason'),
      caseId,
    )
    const finalState = parseState(cells, `${caseId}.finalState`)
    const finalMemory = parseMemory(cells, flagIds, `${caseId}.finalMemory`)
    const stepCount = cells.integer('stepCount')
    cells.finish()
    const steps = stepsByCase.get(caseId) ?? []
    if (steps.length !== stepCount) throw new Error(`${caseId} outcome step count mismatch`)
    outcomes.set(caseId, {
      caseId,
      crafterCaseId,
      worldId,
      programContentHash: identity[0],
      scenarioId: identity[1],
      scenarioModelIdentityVersion: identity[2] as NativeAdaptivePolicyOutcome['scenarioModelIdentityVersion'],
      scenarioModelContentHash: identity[3],
      featureSchemaVersion: identity[4],
      safetyVersion: identity[5],
      seed,
      stopReason,
      initialCursor,
      finalCursor,
      finalStatus,
      finalState,
      finalMemory,
      steps,
    })
  }

  const ordered = prepared.cases.map((spec) => {
    const outcome = outcomes.get(spec.caseId)
    if (outcome === undefined) throw new Error(`${spec.caseId} has no native adaptive-policy outcome`)
    if (outcome.crafterCaseId !== spec.crafterCaseId || outcome.worldId !== spec.world.id) {
      throw new Error(`${spec.caseId} case metadata echo mismatch`)
    }
    return outcome
  })
  if (outcomes.size !== prepared.cases.length || summary.cases !== ordered.length) {
    throw new Error('native adaptive-policy case count mismatch')
  }
  const transitions = ordered.reduce((total, outcome) => total + outcome.steps.length, 0)
  if (summary.transitions !== transitions) throw new Error('native adaptive-policy transition count mismatch')
  return { outcomes: ordered, summary, fullTraceSha256: nativeAdaptivePolicyOutcomeSha256(ordered) }
}
