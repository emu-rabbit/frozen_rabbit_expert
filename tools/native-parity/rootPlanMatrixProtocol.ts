import {
  ACTIONS,
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  MATERIAL_CONDITIONS,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import type { EpisodeStopReason } from '@frozen-rabbit-expert/simulator'
import {
  NATIVE_ROOT_PLAN_MATRIX_VERSION,
  assertPreparedNativeRootPlanMatrix,
  nativeRootPlanMatrixOutcomeSha256,
  type NativeRootPlanMatrixOutcome,
  type PreparedNativeRootPlanMatrix,
} from './rootPlanMatrix'
import {
  decodeNativeStateCells,
  encodeNativeStateCells,
  outputFnv1a64,
  parsedBoolean,
  parsedCondition,
  requiredInteger,
} from './transitionBatchProtocol'

const EMPTY = '-'

export const NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS = 2_000_000
export const NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS = 100_000_000
export const NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES = 240 * 1024 * 1024
export const NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS = 10_000_000
export const NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS = 100_000_000

const NATIVE_ROOT_PLAN_MATRIX_OUTPUT_BASE_BYTES_PER_OUTCOME = 4_096
const NATIVE_ROOT_PLAN_MATRIX_OUTPUT_BYTES_PER_FULL_TRACE_TRANSITION = 1_024
const NATIVE_ROOT_PLAN_MATRIX_OUTPUT_SUMMARY_BYTES = 4_096
const UTF8_ENCODER = new TextEncoder()

export interface NativeRootPlanMatrixBatchProjection {
  requests: number
  operations: number
  projectedTransitions: number
  projectedOutputBytes: number
}

function checkedAdd(left: number, right: number, label: string): number {
  const value = left + right
  if (!Number.isSafeInteger(value)) throw new RangeError(`root-plan ${label} overflow`)
  return value
}

function checkedMultiply(left: number, right: number, label: string): number {
  const value = left * right
  if (!Number.isSafeInteger(value)) throw new RangeError(`root-plan ${label} overflow`)
  return value
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).length
}

function projectNativeRootPlanMatrixBatch(
  prepared: readonly PreparedNativeRootPlanMatrix[],
): NativeRootPlanMatrixBatchProjection {
  if (prepared.length === 0) throw new Error('native root-plan matrix batch must not be empty')
  let operations = 0
  let projectedTransitions = 0
  let projectedOutputBytes = NATIVE_ROOT_PLAN_MATRIX_OUTPUT_SUMMARY_BYTES
  for (const entry of prepared) {
    assertPreparedNativeRootPlanMatrix(entry)
    if (1 + entry.continuationPlan.actions.length > 1_000) {
      throw new RangeError(`${entry.spec.caseId} root plus continuation must contain at most 1000 actions`)
    }
    const requestOperations = checkedMultiply(
      entry.spec.candidates.length,
      entry.spec.samples.length,
      'operation count',
    )
    const actionBound = Math.min(entry.spec.maxSteps, 1 + entry.continuationPlan.actions.length)
    const requestTransitions = checkedMultiply(requestOperations, actionBound, 'transition count')
    operations = checkedAdd(operations, requestOperations, 'batch operation count')
    projectedTransitions = checkedAdd(
      projectedTransitions,
      requestTransitions,
      'batch transition count',
    )

    const identityBytes = [
      entry.spec.caseId,
      entry.spec.scenarioId,
      entry.scenarioModelContentHash,
      entry.spec.conditionProfileId,
      entry.continuationPlan.planId,
    ].reduce((total, token) => checkedAdd(total, utf8ByteLength(token), 'output byte count'), 0)
    const traceBytes = checkedMultiply(
      actionBound,
      NATIVE_ROOT_PLAN_MATRIX_OUTPUT_BYTES_PER_FULL_TRACE_TRANSITION,
      'output byte count',
    )
    const candidateOutputBytes = entry.spec.candidates.reduce((total, candidate) => {
      const outcomeBytes = checkedAdd(
        checkedAdd(
          NATIVE_ROOT_PLAN_MATRIX_OUTPUT_BASE_BYTES_PER_OUTCOME,
          identityBytes,
          'output byte count',
        ),
        utf8ByteLength(candidate.candidateId),
        'output byte count',
      )
      return checkedAdd(
        total,
        checkedAdd(outcomeBytes, traceBytes, 'output byte count'),
        'output byte count',
      )
    }, 0)
    projectedOutputBytes = checkedAdd(
      projectedOutputBytes,
      checkedMultiply(entry.spec.samples.length, candidateOutputBytes, 'output byte count'),
      'batch output byte count',
    )
  }
  return { requests: prepared.length, operations, projectedTransitions, projectedOutputBytes }
}

export function validateNativeRootPlanMatrixBatch(
  prepared: readonly PreparedNativeRootPlanMatrix[],
): NativeRootPlanMatrixBatchProjection {
  const projection = projectNativeRootPlanMatrixBatch(prepared)
  if (projection.operations > NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS) {
    throw new RangeError(
      `root-plan batch operations ${projection.operations} exceed ${NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS}`,
    )
  }
  if (projection.projectedTransitions > NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS) {
    throw new RangeError(
      `root-plan batch projected transitions ${projection.projectedTransitions} exceed ${NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS}`,
    )
  }
  if (projection.projectedOutputBytes > NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES) {
    throw new RangeError(
      `root-plan batch projected output bytes ${projection.projectedOutputBytes} exceed ${NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES}`,
    )
  }
  return projection
}

export function validateNativeRootPlanMatrixBenchmark(
  prepared: readonly PreparedNativeRootPlanMatrix[],
  repetitions: number,
): NativeRootPlanMatrixBatchProjection {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('root-plan benchmark repetitions must be a positive safe integer')
  }
  const perRepetition = projectNativeRootPlanMatrixBatch(prepared)
  const operations = checkedMultiply(repetitions, perRepetition.operations, 'benchmark operation count')
  const projectedTransitions = checkedMultiply(
    repetitions,
    perRepetition.projectedTransitions,
    'benchmark transition count',
  )
  if (operations > NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS) {
    throw new RangeError(
      `root-plan benchmark operations ${operations} exceed ${NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS}`,
    )
  }
  if (projectedTransitions > NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS) {
    throw new RangeError(
      `root-plan benchmark projected transitions ${projectedTransitions} exceed ${NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS}`,
    )
  }
  return {
    requests: prepared.length,
    operations,
    projectedTransitions,
    projectedOutputBytes: NATIVE_ROOT_PLAN_MATRIX_OUTPUT_SUMMARY_BYTES,
  }
}

function booleanCell(value: boolean | undefined): string {
  return value ? '1' : '0'
}

function safeToken(value: string, label: string): string {
  if (value.length === 0 || /[\t\r\n,:;|]/u.test(value)) {
    throw new Error(`${label} is not a safe root-plan protocol token: ${JSON.stringify(value)}`)
  }
  return value
}

function parseAction(value: string, label: string): CraftActionId {
  if (ACTIONS[value as CraftActionId] === undefined) throw new Error(`${label} has unknown action ${value}`)
  return value as CraftActionId
}

function parseActionList(value: string, label: string): readonly CraftActionId[] {
  if (value === EMPTY) return []
  return value.split(',').map((action, index) => parseAction(action, `${label}[${index}]`))
}

function parseTerminal(value: string, label: string): CraftState['terminal'] {
  if (value === 'none' || value === 'completed' || value === 'failed') return value
  throw new Error(`${label} has invalid terminal ${value}`)
}

function parseStopReason(value: string, label: string): EpisodeStopReason {
  if (
    value === 'completed'
    || value === 'failed'
    || value === 'policy-null'
    || value === 'no-legal-action'
    || value === 'illegal-action'
    || value === 'action-limit'
  ) return value
  throw new Error(`${label} has invalid stop reason ${value}`)
}

function requiredUint32(value: string, label: string): number {
  const parsed = requiredInteger(value, label)
  if (parsed < 0 || parsed > 0xffff_ffff) throw new RangeError(`${label} must be uint32`)
  return parsed
}

export function encodeNativeRootPlanMatrixInput(
  prepared: Readonly<PreparedNativeRootPlanMatrix>,
): string {
  assertPreparedNativeRootPlanMatrix(prepared)
  const { spec, recipe, crafter, state, conditionTransitionWeights, continuationPlan } = prepared
  const samples = spec.samples.map(({ sampleIndex, pairedSeed }) => `${sampleIndex}:${pairedSeed}`).join(',')
  const candidates = spec.candidates.map(({ ordinal, candidateId, rootAction }) => [
    ordinal,
    safeToken(candidateId, `${spec.caseId}.candidateId`),
    rootAction,
  ].join(':')).join(',')
  const transitionWeights = MATERIAL_CONDITIONS.flatMap((previous) => (
    MATERIAL_CONDITIONS.map((next) => String(conditionTransitionWeights[previous][next]))
  ))
  const cells = [
    NATIVE_ROOT_PLAN_MATRIX_VERSION,
    safeToken(spec.caseId, 'caseId'),
    'matrix',
    safeToken(spec.scenarioId, 'scenarioId'),
    prepared.scenarioModelIdentityVersion,
    prepared.scenarioModelContentHash,
    safeToken(spec.conditionProfileId, 'conditionProfileId'),
    safeToken(continuationPlan.planId, 'continuationPlanId'),
    continuationPlan.contentFnv1a32,
    'full-trace',
    recipe.canonicalRecipeId,
    recipe.recipeLevel,
    recipe.progressRequired,
    recipe.qualityMax,
    recipe.requiredQuality,
    recipe.durabilityMax,
    recipe.progressDivider,
    recipe.qualityDivider,
    recipe.progressModifier,
    recipe.qualityModifier,
    crafter.level,
    crafter.craftsmanship,
    crafter.control,
    crafter.maxCp,
    booleanCell(crafter.cosmicToolGoodBonus),
    booleanCell(crafter.specialist),
    ...encodeNativeStateCells(state),
    spec.conditionDrawOffset ?? 0,
    spec.successDrawOffset ?? 0,
    spec.maxSteps,
    ...transitionWeights,
    continuationPlan.actions.length === 0 ? EMPTY : continuationPlan.actions.join(','),
    samples,
    candidates,
  ].map(String)
  if (cells.length !== 137) {
    throw new Error(`${spec.caseId} native root-plan input must have 137 cells, got ${cells.length}`)
  }
  return cells.join('\t')
}

export function encodeNativeRootPlanMatrixBatch(
  prepared: readonly PreparedNativeRootPlanMatrix[],
): string {
  validateNativeRootPlanMatrixBatch(prepared)
  return `${prepared.map(encodeNativeRootPlanMatrixInput).join('\n')}\n`
}

export function encodeNativeRootPlanMatrixBenchmarkInput(
  prepared: readonly PreparedNativeRootPlanMatrix[],
  repetitions: number,
): string {
  validateNativeRootPlanMatrixBenchmark(prepared, repetitions)
  return [
    `${NATIVE_ROOT_PLAN_MATRIX_VERSION}\t__batch__\tbenchmark\t${repetitions}`,
    prepared.map(encodeNativeRootPlanMatrixInput).join('\n'),
    '',
  ].join('\n')
}

function parseTraceStep(value: string, label: string) {
  const cells = value.split('|')
  if (cells.length !== 32) throw new Error(`${label} must have 32 trace cells, got ${cells.length}`)
  return {
    action: parseAction(cells[0]!, `${label}.action`),
    success: parsedBoolean(cells[1]!, `${label}.success`),
    nextCondition: parsedCondition(cells[2]!, `${label}.nextCondition`),
    cursorBefore: {
      condition: requiredInteger(cells[3]!, `${label}.cursorBefore.condition`),
      success: requiredInteger(cells[4]!, `${label}.cursorBefore.success`),
    },
    cursorAfter: {
      condition: requiredInteger(cells[5]!, `${label}.cursorAfter.condition`),
      success: requiredInteger(cells[6]!, `${label}.cursorAfter.success`),
    },
    explanationCodes: cells[7] === EMPTY ? [] : cells[7]!.split(','),
    after: decodeNativeStateCells(cells.slice(8, 32), `${label}.after`),
  }
}

function parseOutcome(line: string): NativeRootPlanMatrixOutcome {
  const cells = line.split('\t')
  const caseId = cells[1] ?? EMPTY
  if (cells[0] !== NATIVE_ROOT_PLAN_MATRIX_VERSION) throw new Error(`${caseId} has unsupported version`)
  if (cells[2] !== 'outcome') throw new Error(`${caseId} has unexpected command ${cells[2]}`)
  if (cells[3] === 'error') throw new Error(`${caseId} native root-plan error: ${cells[4] ?? 'unknown'}`)
  if (cells[3] !== 'ok' || cells.length !== 45) {
    throw new Error(`${caseId} native root-plan outcome must be an ok 45-cell row`)
  }
  if (
    cells[4]!.length === 0
    || cells[5] !== CRAFT_SCENARIO_MODEL_IDENTITY_VERSION
    || cells[6]!.length === 0
    || cells[7]!.length === 0
    || cells[8]!.length === 0
  ) {
    throw new Error(`${caseId} returned an empty identity cell`)
  }
  const actions = parseActionList(cells[16]!, `${caseId}.actions`)
  const transitions = requiredUint32(cells[17]!, `${caseId}.transitions`)
  const steps = cells[44] === EMPTY
    ? []
    : cells[44]!.split(';').map((step, index) => parseTraceStep(step, `${caseId}.steps[${index}]`))
  if (actions.length !== transitions || steps.length !== transitions) {
    throw new Error(`${caseId} action/transition/trace counts do not match`)
  }
  const finalState = decodeNativeStateCells(cells.slice(20, 44), `${caseId}.finalState`)
  const terminal = parseTerminal(cells[14]!, `${caseId}.terminal`)
  if (terminal !== finalState.terminal) throw new Error(`${caseId} terminal does not match finalState`)
  const rootAction = parseAction(cells[11]!, `${caseId}.rootAction`)
  if (actions[0] !== undefined && actions[0] !== rootAction) {
    throw new Error(`${caseId} first executed action does not match rootAction`)
  }
  return {
    caseId,
    scenarioId: cells[4]! as NativeRootPlanMatrixOutcome['scenarioId'],
    scenarioModelIdentityVersion: cells[5] as NativeRootPlanMatrixOutcome['scenarioModelIdentityVersion'],
    scenarioModelContentHash: cells[6]!,
    conditionProfileId: cells[8]!,
    continuationPlanId: cells[7]!,
    candidateOrdinal: requiredUint32(cells[9]!, `${caseId}.candidateOrdinal`),
    candidateId: cells[10]!,
    rootAction,
    sampleIndex: requiredUint32(cells[12]!, `${caseId}.sampleIndex`),
    pairedSeed: requiredUint32(cells[13]!, `${caseId}.pairedSeed`),
    rollout: {
      caseId: `${caseId}.${cells[10]}.${cells[12]}`,
      terminal,
      stopReason: parseStopReason(cells[15]!, `${caseId}.stopReason`),
      actions,
      transitions,
      finalCursor: {
        condition: requiredUint32(cells[18]!, `${caseId}.finalCursor.condition`),
        success: requiredUint32(cells[19]!, `${caseId}.finalCursor.success`),
      },
      finalState,
      steps,
    },
  }
}

export interface NativeRootPlanMatrixBatchSummary {
  requests: number
  operations: number
  transitions: number
  kernelNs: number
  fnv1a64Hex: string
}

export interface ParsedNativeRootPlanMatrixBatch {
  outcomes: readonly NativeRootPlanMatrixOutcome[]
  summary: Readonly<NativeRootPlanMatrixBatchSummary>
  outputFnv1a64Hex: string
  correctnessSha256: string
}

export function parseNativeRootPlanMatrixBatchOutput(
  stdout: string,
): ParsedNativeRootPlanMatrixBatch {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0)
  const summaryLine = lines.at(-1)
  if (summaryLine === undefined) throw new Error('native root-plan matrix produced no output')
  const cells = summaryLine.split('\t')
  if (
    cells.length !== 9
    || cells[0] !== NATIVE_ROOT_PLAN_MATRIX_VERSION
    || cells[1] !== '__batch__'
    || cells[2] !== 'summary'
    || cells[3] !== 'ok'
  ) throw new Error(`invalid native root-plan summary: ${summaryLine}`)
  const outcomeLines = lines.slice(0, -1)
  const outcomes = outcomeLines.map(parseOutcome)
  const summary = {
    requests: requiredInteger(cells[4]!, 'summary.requests'),
    operations: requiredInteger(cells[5]!, 'summary.operations'),
    transitions: requiredInteger(cells[6]!, 'summary.transitions'),
    kernelNs: requiredInteger(cells[7]!, 'summary.kernelNs'),
    fnv1a64Hex: cells[8]!,
  }
  if (summary.operations !== outcomes.length) throw new Error('native root-plan operation count mismatch')
  if (summary.transitions !== outcomes.reduce((sum, outcome) => sum + outcome.rollout.transitions, 0)) {
    throw new Error('native root-plan transition count mismatch')
  }
  const outputHash = outputFnv1a64(outcomeLines)
  if (summary.fnv1a64Hex !== outputHash) throw new Error('native root-plan output hash mismatch')
  const correctnessSha256 = nativeRootPlanMatrixOutcomeSha256(outcomes)
  return { outcomes, summary, outputFnv1a64Hex: outputHash, correctnessSha256 }
}

export interface NativeRootPlanMatrixBenchmarkSummary {
  repetitions: number
  requests: number
  operations: number
  transitions: number
  kernelNs: number
  fnv1a32Hex: string
}

export function parseNativeRootPlanMatrixBenchmarkOutput(
  stdout: string,
): NativeRootPlanMatrixBenchmarkSummary {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0)
  if (lines.length !== 1) throw new Error('native root-plan benchmark must return one row')
  const cells = lines[0]!.split('\t')
  if (
    cells.length !== 10
    || cells[0] !== NATIVE_ROOT_PLAN_MATRIX_VERSION
    || cells[1] !== '__batch__'
    || cells[2] !== 'benchmark'
    || cells[3] !== 'ok'
  ) throw new Error(`invalid native root-plan benchmark summary: ${lines[0]}`)
  return {
    repetitions: requiredInteger(cells[4]!, 'benchmark.repetitions'),
    requests: requiredInteger(cells[5]!, 'benchmark.requests'),
    operations: requiredInteger(cells[6]!, 'benchmark.operations'),
    transitions: requiredInteger(cells[7]!, 'benchmark.transitions'),
    kernelNs: requiredInteger(cells[8]!, 'benchmark.kernelNs'),
    fnv1a32Hex: cells[9]!,
  }
}

export function assertRootPlanMatrixProtocolIdentity(
  prepared: readonly PreparedNativeRootPlanMatrix[],
  outcomes: readonly NativeRootPlanMatrixOutcome[],
): void {
  const expectedByCase = new Map(prepared.map((entry) => [entry.spec.caseId, entry]))
  const expectedPairs = new Set(prepared.flatMap((entry) => entry.spec.candidates.flatMap((candidate) => (
    entry.spec.samples.map((sample) => [
      entry.spec.caseId,
      candidate.ordinal,
      candidate.candidateId,
      candidate.rootAction,
      sample.sampleIndex,
      sample.pairedSeed,
    ].join('\u0000'))
  ))))
  const actualPairs = new Set<string>()
  for (const outcome of outcomes) {
    const expected = expectedByCase.get(outcome.caseId)
    if (expected === undefined) throw new Error(`native root-plan returned unknown case ${outcome.caseId}`)
    if (
      expected.spec.scenarioId !== outcome.scenarioId
      || expected.scenarioModelIdentityVersion !== outcome.scenarioModelIdentityVersion
      || expected.scenarioModelContentHash !== outcome.scenarioModelContentHash
      || expected.spec.conditionProfileId !== outcome.conditionProfileId
      || expected.continuationPlan.planId !== outcome.continuationPlanId
    ) throw new Error(`${outcome.caseId} native root-plan identity mismatch`)
    const pair = [
      outcome.caseId,
      outcome.candidateOrdinal,
      outcome.candidateId,
      outcome.rootAction,
      outcome.sampleIndex,
      outcome.pairedSeed,
    ].join('\u0000')
    if (actualPairs.has(pair)) throw new Error(`native root-plan returned duplicate pair ${pair}`)
    actualPairs.add(pair)
  }
  if (actualPairs.size !== expectedPairs.size || [...expectedPairs].some((pair) => !actualPairs.has(pair))) {
    throw new Error('native root-plan returned a missing or unexpected candidate/sample pair')
  }
}
