import {
  ACTIONS,
  MATERIAL_CONDITIONS,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  NATIVE_TRANSITION_BATCH_VERSION,
  type NativeTransitionBatchCommand,
  type NativeTransitionComparableResult,
  type PreparedNativeTransitionCase,
} from './transitionBatch'

const EMPTY = '-'

function booleanCell(value: boolean | undefined): string {
  return value === true ? '1' : '0'
}

function safeText(value: string): string {
  if (value.length === 0 || value.includes('\t') || /[\r\n]/u.test(value)) {
    throw new Error(`native batch text is not a safe TSV cell: ${JSON.stringify(value)}`)
  }
  return value
}

export function encodeNativeStateCells(state: Readonly<CraftState>): readonly string[] {
  return [
    state.step,
    state.progress,
    state.quality,
    state.durability,
    state.cp,
    safeText(state.condition),
    state.innerQuiet,
    state.buffs.wasteNot,
    state.buffs.veneration,
    state.buffs.greatStrides,
    state.buffs.innovation,
    state.buffs.finalAppraisal,
    state.buffs.manipulation,
    state.buffs.muscleMemory,
    state.buffs.expedience,
    state.comboFrom === null ? EMPTY : safeText(state.comboFrom),
    booleanCell(state.trainedPerfectionAvailable),
    booleanCell(state.trainedPerfectionActive),
    state.carefulObservationUsesLeft,
    booleanCell(state.heartAndSoulAvailable),
    booleanCell(state.heartAndSoulActive),
    booleanCell(state.quickInnovationAvailable),
    safeText(state.terminal),
    state.failureReason === null ? EMPTY : safeText(state.failureReason),
  ].map(String)
}

function weightsCells(
  weights: Readonly<Record<MaterialCondition, number>>,
): readonly string[] {
  return MATERIAL_CONDITIONS.map((condition) => String(weights[condition]))
}

export function encodeNativeTransitionInput(
  prepared: Readonly<PreparedNativeTransitionCase>,
): string {
  const { spec, recipe, crafter, state } = prepared
  const common = [
    NATIVE_TRANSITION_BATCH_VERSION,
    safeText(spec.caseId),
    spec.command,
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
    spec.action,
  ].map(String)
  switch (spec.command) {
    case 'preview':
      return common.join('\t')
    case 'apply':
      return [
        ...common,
        booleanCell(spec.observed.success),
        spec.observed.nextCondition,
      ].join('\t')
    case 'simulate':
      return [
        ...common,
        spec.seed >>> 0,
        spec.conditionDrawOffset,
        spec.successDrawOffset,
        ...weightsCells(prepared.conditionWeights),
      ].join('\t')
  }
}

export function encodeNativeTransitionBatch(
  prepared: readonly PreparedNativeTransitionCase[],
): string {
  return `${prepared.map(encodeNativeTransitionInput).join('\n')}\n`
}

export interface NativeBatchSummary {
  operations: number
  kernelNs: number
  fnv1a64Hex: string
}

export interface ParsedNativeTransitionBatch {
  results: readonly NativeTransitionComparableResult[]
  summary: Readonly<NativeBatchSummary>
  outputFnv1a64Hex: string
}

export interface NativeCoreBenchmarkSummary {
  repetitions: number
  cases: number
  operations: number
  kernelNs: number
  fnv1a32Hex: string
}

export function requiredInteger(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a safe integer: ${value}`)
  return parsed
}

function requiredFinite(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite: ${value}`)
  return parsed
}

export function parsedBoolean(value: string, label: string): boolean {
  if (value === '0') return false
  if (value === '1') return true
  throw new Error(`${label} must be 0 or 1: ${value}`)
}

export function parsedCondition(value: string, label: string): MaterialCondition {
  if ((MATERIAL_CONDITIONS as readonly string[]).includes(value)) {
    return value as MaterialCondition
  }
  throw new Error(`${label} has unknown condition: ${value}`)
}

export function decodeNativeStateCells(cells: readonly string[], caseId: string): CraftState {
  if (cells.length !== 24) throw new Error(`${caseId} native state must have 24 cells`)
  const comboCell = cells[15]!
  if (comboCell !== EMPTY && ACTIONS[comboCell as CraftActionId] === undefined) {
    throw new Error(`${caseId} has unknown combo action: ${comboCell}`)
  }
  const terminal = cells[22]
  if (terminal !== 'none' && terminal !== 'completed' && terminal !== 'failed') {
    throw new Error(`${caseId} has unknown terminal: ${terminal}`)
  }
  const failureCell = cells[23]
  if (failureCell !== EMPTY && failureCell !== 'durability' && failureCell !== 'required-quality') {
    throw new Error(`${caseId} has unknown failure reason: ${failureCell}`)
  }
  return {
    step: requiredInteger(cells[0]!, `${caseId}.step`),
    progress: requiredInteger(cells[1]!, `${caseId}.progress`),
    quality: requiredInteger(cells[2]!, `${caseId}.quality`),
    durability: requiredInteger(cells[3]!, `${caseId}.durability`),
    cp: requiredInteger(cells[4]!, `${caseId}.cp`),
    condition: parsedCondition(cells[5]!, `${caseId}.condition`),
    innerQuiet: requiredInteger(cells[6]!, `${caseId}.innerQuiet`),
    buffs: {
      wasteNot: requiredInteger(cells[7]!, `${caseId}.buffs.wasteNot`),
      veneration: requiredInteger(cells[8]!, `${caseId}.buffs.veneration`),
      greatStrides: requiredInteger(cells[9]!, `${caseId}.buffs.greatStrides`),
      innovation: requiredInteger(cells[10]!, `${caseId}.buffs.innovation`),
      finalAppraisal: requiredInteger(cells[11]!, `${caseId}.buffs.finalAppraisal`),
      manipulation: requiredInteger(cells[12]!, `${caseId}.buffs.manipulation`),
      muscleMemory: requiredInteger(cells[13]!, `${caseId}.buffs.muscleMemory`),
      expedience: requiredInteger(cells[14]!, `${caseId}.buffs.expedience`),
    },
    comboFrom: comboCell === EMPTY ? null : comboCell as CraftActionId,
    trainedPerfectionAvailable: parsedBoolean(
      cells[16]!,
      `${caseId}.trainedPerfectionAvailable`,
    ),
    trainedPerfectionActive: parsedBoolean(cells[17]!, `${caseId}.trainedPerfectionActive`),
    carefulObservationUsesLeft: requiredInteger(
      cells[18]!,
      `${caseId}.carefulObservationUsesLeft`,
    ),
    heartAndSoulAvailable: parsedBoolean(cells[19]!, `${caseId}.heartAndSoulAvailable`),
    heartAndSoulActive: parsedBoolean(cells[20]!, `${caseId}.heartAndSoulActive`),
    quickInnovationAvailable: parsedBoolean(cells[21]!, `${caseId}.quickInnovationAvailable`),
    terminal,
    failureReason: failureCell === EMPTY ? null : failureCell,
  }
}

export function outputFnv1a64(lines: readonly string[]): string {
  let hash = 0xcbf2_9ce4_8422_2325n
  const prime = 0x0000_0100_0000_01b3n
  const mask = 0xffff_ffff_ffff_ffffn
  const encoder = new TextEncoder()
  for (const line of lines) {
    for (const byte of encoder.encode(`${line}\n`)) {
      hash ^= BigInt(byte)
      hash = (hash * prime) & mask
    }
  }
  return hash.toString(16).padStart(16, '0')
}

function parseCommand(value: string, caseId: string): NativeTransitionBatchCommand {
  if (value === 'preview' || value === 'apply' || value === 'simulate') return value
  throw new Error(`${caseId} has unexpected native command: ${value}`)
}

export function parseNativeTransitionBatchOutput(stdout: string): ParsedNativeTransitionBatch {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0)
  const summaryLine = lines.at(-1)
  if (summaryLine === undefined) throw new Error('native batch produced no output')
  const summaryCells = summaryLine.split('\t')
  if (
    summaryCells.length !== 7
    || summaryCells[0] !== NATIVE_TRANSITION_BATCH_VERSION
    || summaryCells[1] !== '__batch__'
    || summaryCells[2] !== 'summary'
    || summaryCells[3] !== 'ok'
  ) throw new Error(`invalid native batch summary: ${summaryLine}`)
  const outputLines = lines.slice(0, -1)
  const summary: NativeBatchSummary = {
    operations: requiredInteger(summaryCells[4]!, 'summary.operations'),
    kernelNs: requiredInteger(summaryCells[5]!, 'summary.kernelNs'),
    fnv1a64Hex: summaryCells[6]!,
  }
  if (summary.operations !== outputLines.length) {
    throw new Error(
      `native summary operations ${summary.operations} does not match ${outputLines.length} rows`,
    )
  }
  const outputHash = outputFnv1a64(outputLines)
  if (outputHash !== summary.fnv1a64Hex) {
    throw new Error(`native output hash mismatch: ${outputHash} != ${summary.fnv1a64Hex}`)
  }
  const results = outputLines.map((line): NativeTransitionComparableResult => {
    const cells = line.split('\t')
    const caseId = cells[1] ?? '-'
    if (cells[0] !== NATIVE_TRANSITION_BATCH_VERSION) {
      throw new Error(`${caseId} returned unsupported native version: ${cells[0]}`)
    }
    if (cells[3] === 'error') throw new Error(`${caseId} native error: ${cells[4] ?? 'unknown'}`)
    if (cells[3] !== 'ok') throw new Error(`${caseId} native status is not ok: ${cells[3]}`)
    const command = parseCommand(cells[2]!, caseId)
    const expectedArity = command === 'preview' ? 11 : 42
    if (cells.length !== expectedArity) {
      throw new Error(`${caseId} ${command} output must have ${expectedArity} cells`)
    }
    const preview = {
      legal: parsedBoolean(cells[4]!, `${caseId}.preview.legal`),
      reason: cells[5] === EMPTY ? null : cells[5]!,
      cpCost: requiredInteger(cells[6]!, `${caseId}.preview.cpCost`),
      durabilityCost: requiredInteger(cells[7]!, `${caseId}.preview.durabilityCost`),
      successRate: requiredFinite(cells[8]!, `${caseId}.preview.successRate`),
      progressGain: requiredInteger(cells[9]!, `${caseId}.preview.progressGain`),
      qualityGain: requiredInteger(cells[10]!, `${caseId}.preview.qualityGain`),
    }
    if (command === 'preview') {
      return {
        caseId,
        command,
        preview,
        observed: null,
        nextState: null,
        explanationCodes: [],
        cursorBefore: { condition: 0, success: 0 },
        cursorAfter: { condition: 0, success: 0 },
      }
    }
    const cursorCells = cells.slice(38, 42)
    const cursorBefore = command === 'apply'
      ? { condition: 0, success: 0 }
      : {
          condition: requiredInteger(cursorCells[0]!, `${caseId}.cursorBefore.condition`),
          success: requiredInteger(cursorCells[1]!, `${caseId}.cursorBefore.success`),
        }
    const cursorAfter = command === 'apply'
      ? { condition: 0, success: 0 }
      : {
          condition: requiredInteger(cursorCells[2]!, `${caseId}.cursorAfter.condition`),
          success: requiredInteger(cursorCells[3]!, `${caseId}.cursorAfter.success`),
        }
    if (command === 'apply' && cursorCells.some((cell) => cell !== EMPTY)) {
      throw new Error(`${caseId} apply cursor columns must be '-'`)
    }
    return {
      caseId,
      command,
      preview,
      observed: {
        success: parsedBoolean(cells[11]!, `${caseId}.actualSuccess`),
        nextCondition: parsedCondition(cells[12]!, `${caseId}.actualNextCondition`),
      },
      nextState: decodeNativeStateCells(cells.slice(13, 37), caseId),
      explanationCodes: cells[37] === EMPTY ? [] : cells[37]!.split(','),
      cursorBefore,
      cursorAfter,
    }
  })
  return { results, summary, outputFnv1a64Hex: outputHash }
}

export function encodeNativeCoreBenchmarkInput(
  prepared: readonly PreparedNativeTransitionCase[],
  repetitions: number,
): string {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive safe integer')
  }
  return [
    `${NATIVE_TRANSITION_BATCH_VERSION}\t__batch__\tbenchmark\t${repetitions}`,
    encodeNativeTransitionBatch(prepared).trimEnd(),
    '',
  ].join('\n')
}

export function parseNativeCoreBenchmarkOutput(stdout: string): NativeCoreBenchmarkSummary {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0)
  if (lines.length !== 1) {
    throw new Error(`native core benchmark must return one summary row, got ${lines.length}`)
  }
  const cells = lines[0]!.split('\t')
  if (
    cells.length !== 9
    || cells[0] !== NATIVE_TRANSITION_BATCH_VERSION
    || cells[1] !== '__batch__'
    || cells[2] !== 'benchmark'
    || cells[3] !== 'ok'
  ) throw new Error(`invalid native core benchmark summary: ${lines[0]}`)
  const fnv1a32Hex = cells[8]!
  if (!/^[0-9a-f]{8}$/u.test(fnv1a32Hex)) {
    throw new Error(`invalid native core benchmark FNV-1a32: ${fnv1a32Hex}`)
  }
  return {
    repetitions: requiredInteger(cells[4]!, 'benchmark.repetitions'),
    cases: requiredInteger(cells[5]!, 'benchmark.cases'),
    operations: requiredInteger(cells[6]!, 'benchmark.operations'),
    kernelNs: requiredInteger(cells[7]!, 'benchmark.kernelNs'),
    fnv1a32Hex,
  }
}
