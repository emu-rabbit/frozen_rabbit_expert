import {
  ACTIONS,
  MATERIAL_CONDITIONS,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import type { EpisodeStopReason } from '@frozen-rabbit-expert/simulator'
import {
  NATIVE_ROLLOUT_BATCH_VERSION,
  type NativeRolloutComparableResult,
  type NativeRolloutComparableTraceStep,
  type PreparedNativeRolloutCase,
} from './rolloutBatch'
import {
  decodeNativeStateCells,
  encodeNativeStateCells,
  outputFnv1a64,
  parsedBoolean,
  parsedCondition,
  requiredInteger,
} from './transitionBatchProtocol'

const EMPTY = '-'

function booleanCell(value: boolean | undefined): string {
  return value === true ? '1' : '0'
}

function safeCell(value: string, label: string): string {
  if (value.length === 0 || /[\t\r\n]/u.test(value)) {
    throw new Error(`${label} is not a safe TSV cell: ${JSON.stringify(value)}`)
  }
  return value
}

function safeDelimitedToken(value: string, label: string): string {
  if (value.length === 0 || /[\t\r\n,;|]/u.test(value)) {
    throw new Error(`${label} is not safe for the native rollout protocol: ${JSON.stringify(value)}`)
  }
  return value
}

function parseAction(value: string, label: string): CraftActionId {
  if (ACTIONS[value as CraftActionId] === undefined) {
    throw new Error(`${label} has unknown action: ${value}`)
  }
  return value as CraftActionId
}

function parseActionList(value: string, label: string): readonly CraftActionId[] {
  if (value === EMPTY) return []
  return value.split(',').map((action, index) => parseAction(action, `${label}[${index}]`))
}

function parseTerminal(value: string, label: string): CraftState['terminal'] {
  if (value === 'none' || value === 'completed' || value === 'failed') return value
  throw new Error(`${label} has unknown terminal: ${value}`)
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
  throw new Error(`${label} has unknown stop reason: ${value}`)
}

export function encodeNativeRolloutInput(
  prepared: Readonly<PreparedNativeRolloutCase>,
): string {
  const { spec, recipe, crafter, state, conditionTransitionWeights } = prepared
  const actionCell = spec.actions.map((action, index) => (
    safeDelimitedToken(action, `${spec.caseId}.actions[${index}]`)
  )).join(',')
  const transitionWeightCells = MATERIAL_CONDITIONS.flatMap((previous) => (
    MATERIAL_CONDITIONS.map((next) => String(conditionTransitionWeights[previous][next]))
  ))
  const cells = [
    NATIVE_ROLLOUT_BATCH_VERSION,
    safeCell(spec.caseId, 'caseId'),
    'rollout',
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
    spec.seed,
    spec.conditionDrawOffset ?? 0,
    spec.successDrawOffset ?? 0,
    spec.maxSteps,
    ...transitionWeightCells,
    actionCell,
  ].map(String)
  if (cells.length !== 129) {
    throw new Error(`${spec.caseId} native rollout input must have 129 cells, got ${cells.length}`)
  }
  return cells.join('\t')
}

export function encodeNativeRolloutBatch(
  prepared: readonly PreparedNativeRolloutCase[],
): string {
  if (prepared.length === 0) throw new Error('native rollout batch must not be empty')
  return `${prepared.map(encodeNativeRolloutInput).join('\n')}\n`
}

export function encodeNativeRolloutCoreBenchmarkInput(
  prepared: readonly PreparedNativeRolloutCase[],
  repetitions: number,
): string {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  return [
    `${NATIVE_ROLLOUT_BATCH_VERSION}\t__batch__\tbenchmark\t${repetitions}`,
    encodeNativeRolloutBatch(prepared).trimEnd(),
    '',
  ].join('\n')
}

function parseTraceStep(value: string, caseId: string, index: number): NativeRolloutComparableTraceStep {
  const cells = value.split('|')
  if (cells.length !== 32) {
    throw new Error(`${caseId}.steps[${index}] must have 32 cells, got ${cells.length}`)
  }
  const cursorBefore = {
    condition: requiredInteger(cells[3]!, `${caseId}.steps[${index}].cursorBefore.condition`),
    success: requiredInteger(cells[4]!, `${caseId}.steps[${index}].cursorBefore.success`),
  }
  const cursorAfter = {
    condition: requiredInteger(cells[5]!, `${caseId}.steps[${index}].cursorAfter.condition`),
    success: requiredInteger(cells[6]!, `${caseId}.steps[${index}].cursorAfter.success`),
  }
  return {
    action: parseAction(cells[0]!, `${caseId}.steps[${index}].action`),
    success: parsedBoolean(cells[1]!, `${caseId}.steps[${index}].success`),
    nextCondition: parsedCondition(cells[2]!, `${caseId}.steps[${index}].nextCondition`),
    after: decodeNativeStateCells(cells.slice(8, 32), `${caseId}.steps[${index}].after`),
    explanationCodes: cells[7] === EMPTY ? [] : cells[7]!.split(','),
    cursorBefore,
    cursorAfter,
  }
}

function parseResultLine(line: string): NativeRolloutComparableResult {
  const cells = line.split('\t')
  const caseId = cells[1] ?? EMPTY
  if (cells[0] !== NATIVE_ROLLOUT_BATCH_VERSION) {
    throw new Error(`${caseId} returned unsupported native rollout version: ${cells[0]}`)
  }
  if (cells[2] !== 'rollout') throw new Error(`${caseId} returned unexpected command: ${cells[2]}`)
  if (cells[3] === 'error') throw new Error(`${caseId} native rollout error: ${cells[4] ?? 'unknown'}`)
  if (cells[3] !== 'ok') throw new Error(`${caseId} native rollout status is not ok: ${cells[3]}`)
  if (cells.length !== 35) {
    throw new Error(`${caseId} native rollout output must have 35 cells, got ${cells.length}`)
  }
  const terminal = parseTerminal(cells[4]!, `${caseId}.terminal`)
  const stopReason = parseStopReason(cells[5]!, `${caseId}.stopReason`)
  const actions = parseActionList(cells[6]!, `${caseId}.actions`)
  const transitions = requiredInteger(cells[7]!, `${caseId}.transitions`)
  const finalCursor = {
    condition: requiredInteger(cells[8]!, `${caseId}.finalCursor.condition`),
    success: requiredInteger(cells[9]!, `${caseId}.finalCursor.success`),
  }
  const finalState = decodeNativeStateCells(cells.slice(10, 34), `${caseId}.finalState`)
  const steps = cells[34] === EMPTY
    ? []
    : cells[34]!.split(';').map((step, index) => parseTraceStep(step, caseId, index))
  if (actions.length !== transitions || steps.length !== transitions) {
    throw new Error(
      `${caseId} rollout count mismatch: actions=${actions.length}, transitions=${transitions}, trace=${steps.length}`,
    )
  }
  if (terminal !== finalState.terminal) {
    throw new Error(`${caseId} terminal does not match final state: ${terminal} != ${finalState.terminal}`)
  }
  for (const [index, action] of actions.entries()) {
    if (steps[index]?.action !== action) {
      throw new Error(`${caseId} action/trace mismatch at ${index}: ${action} != ${steps[index]?.action}`)
    }
  }
  return {
    caseId,
    terminal,
    stopReason,
    actions,
    transitions,
    finalCursor,
    finalState,
    steps,
  }
}

export interface NativeRolloutBatchSummary {
  operations: number
  transitions: number
  kernelNs: number
  fnv1a64Hex: string
}

export interface ParsedNativeRolloutBatch {
  results: readonly NativeRolloutComparableResult[]
  summary: Readonly<NativeRolloutBatchSummary>
  outputFnv1a64Hex: string
}

export function parseNativeRolloutBatchOutput(stdout: string): ParsedNativeRolloutBatch {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0)
  const summaryLine = lines.at(-1)
  if (summaryLine === undefined) throw new Error('native rollout batch produced no output')
  const summaryCells = summaryLine.split('\t')
  if (
    summaryCells.length !== 8
    || summaryCells[0] !== NATIVE_ROLLOUT_BATCH_VERSION
    || summaryCells[1] !== '__batch__'
    || summaryCells[2] !== 'summary'
    || summaryCells[3] !== 'ok'
  ) throw new Error(`invalid native rollout batch summary: ${summaryLine}`)
  const resultLines = lines.slice(0, -1)
  const results = resultLines.map(parseResultLine)
  const summary: NativeRolloutBatchSummary = {
    operations: requiredInteger(summaryCells[4]!, 'summary.operations'),
    transitions: requiredInteger(summaryCells[5]!, 'summary.transitions'),
    kernelNs: requiredInteger(summaryCells[6]!, 'summary.kernelNs'),
    fnv1a64Hex: summaryCells[7]!,
  }
  if (summary.operations !== results.length) {
    throw new Error(`native rollout summary operations ${summary.operations} != ${results.length}`)
  }
  const transitions = results.reduce((sum, result) => sum + result.transitions, 0)
  if (summary.transitions !== transitions) {
    throw new Error(`native rollout summary transitions ${summary.transitions} != ${transitions}`)
  }
  const outputHash = outputFnv1a64(resultLines)
  if (summary.fnv1a64Hex !== outputHash) {
    throw new Error(`native rollout output hash mismatch: ${summary.fnv1a64Hex} != ${outputHash}`)
  }
  return { results, summary, outputFnv1a64Hex: outputHash }
}

export interface NativeRolloutCoreBenchmarkSummary {
  repetitions: number
  cases: number
  operations: number
  transitions: number
  kernelNs: number
  hash: string
}

export function parseNativeRolloutCoreBenchmarkOutput(
  stdout: string,
): NativeRolloutCoreBenchmarkSummary {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0)
  if (lines.length !== 1) {
    throw new Error(`native rollout benchmark must return one summary row, got ${lines.length}`)
  }
  const cells = lines[0]!.split('\t')
  if (
    cells.length !== 10
    || cells[0] !== NATIVE_ROLLOUT_BATCH_VERSION
    || cells[1] !== '__batch__'
    || cells[2] !== 'benchmark'
    || cells[3] !== 'ok'
  ) throw new Error(`invalid native rollout benchmark summary: ${lines[0]}`)
  if (!/^[0-9a-f]{8,16}$/u.test(cells[9]!)) {
    throw new Error(`invalid native rollout benchmark hash: ${cells[9]}`)
  }
  return {
    repetitions: requiredInteger(cells[4]!, 'benchmark.repetitions'),
    cases: requiredInteger(cells[5]!, 'benchmark.cases'),
    operations: requiredInteger(cells[6]!, 'benchmark.operations'),
    transitions: requiredInteger(cells[7]!, 'benchmark.transitions'),
    kernelNs: requiredInteger(cells[8]!, 'benchmark.kernelNs'),
    hash: cells[9]!,
  }
}
