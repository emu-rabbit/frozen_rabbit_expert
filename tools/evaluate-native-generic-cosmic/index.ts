import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cosmicExpertScenarioDataByRecipeId } from '@frozen-rabbit-expert/data'
import {
  MATERIAL_CONDITIONS,
  createInitialCraftState,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  SOLVER_POLICY_VERSION,
  resolveObjectivePolicy,
  resolveRiskPreferencePreset,
} from '@frozen-rabbit-expert/solver'
import type { EpisodeStopReason } from '@frozen-rabbit-expert/simulator'
import {
  buildMatrixPlan,
  completionContractForRequiredQuality,
  describeGenericCosmicFamilyEvaluator,
  parseMatrixCliOptions,
  runMigrationOracleEpisode,
  type CompletionContract,
  type MatrixCase,
} from '../evaluate-generic-cosmic-families/matrix'
import {
  decodeNativeStateCells,
  encodeNativeStateCells,
  requiredInteger,
} from '../native-parity/transitionBatchProtocol'

const PROTOCOL = 'native-generic-episode-batch-v2'
const DEFAULT_BASELINE = 'generic-craft-budgeted-condition-v0.20.0'
const DEFAULT_CANDIDATE = 'generic-craft-ts-v0.6-semantic-port-v0.21.0'

interface ToolOptions {
  baselineSolver: string
  candidateSolver: string
  binaryPath: string
  outputPath: string | null
  migrationParity: boolean
  migrationSimilarity: boolean
}

interface NativeEpisode {
  arm: 'baseline' | 'candidate'
  solverVersion: string
  risk: 'stable' | 'balanced' | 'aggressive'
  caseId: string
  terminal: CraftState['terminal']
  stopReason: EpisodeStopReason
  actions: readonly CraftActionId[]
  finalCursor: { condition: number; success: number }
  recommendationCalls: number
  recommendationNs: number
  recommendationMaxNs: number
  plannerContext: string
  finalState: CraftState
  trace: string | null
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

function parseToolOptions(args: readonly string[]): ToolOptions {
  const binaryName = process.platform === 'win32'
    ? 'craft-kernel-generic-episode.exe'
    : 'craft-kernel-generic-episode'
  const migrationParity = args.includes('--migration-parity')
  const migrationSimilarity = args.includes('--migration-similarity')
  if (migrationParity && migrationSimilarity) {
    throw new Error('--migration-parity and --migration-similarity are mutually exclusive')
  }
  return {
    baselineSolver: optionValue(args, 'baseline-solver') ?? DEFAULT_BASELINE,
    candidateSolver: optionValue(args, 'candidate-solver')
      ?? (migrationParity ? SOLVER_POLICY_VERSION
        : migrationSimilarity ? DEFAULT_BASELINE
          : DEFAULT_CANDIDATE),
    binaryPath: path.resolve(optionValue(args, 'native-binary')
      ?? path.join('native', 'craft-kernel', 'target', 'release', binaryName)),
    outputPath: optionValue(args, 'output') ?? null,
    migrationParity,
    migrationSimilarity,
  }
}

function matrixArguments(args: readonly string[]): readonly string[] {
  const stripped = args.filter((argument) => ![
    '--baseline-solver=',
    '--candidate-solver=',
    '--native-binary=',
  ].some((prefix) => argument.startsWith(prefix))
    && argument !== '--migration-parity'
    && argument !== '--migration-similarity')
  return stripped.includes('--no-baseline') ? stripped : [...stripped, '--no-baseline']
}

function safeCell(value: string, label: string): string {
  if (value.length === 0 || /[\t\r\n]/u.test(value)) {
    throw new Error(`${label} is not a safe TSV cell`)
  }
  return value
}

function booleanCell(value: boolean | undefined): string {
  return value === true ? '1' : '0'
}

function transitionWeightCells(evaluationCase: Readonly<MatrixCase>): readonly string[] {
  return MATERIAL_CONDITIONS.flatMap((previous) => {
    const row = evaluationCase.conditionProfile.transitionWeights?.[previous]
      ?? evaluationCase.conditionProfile.weights
    return MATERIAL_CONDITIONS.map((next) => String(Math.max(0, row[next] ?? 0)))
  })
}

function encodeCase(
  evaluationCase: Readonly<MatrixCase>,
  solverVersion: string,
  risk: 'stable' | 'balanced' | 'aggressive',
  trace: boolean,
): string {
  const scenario = cosmicExpertScenarioDataByRecipeId(evaluationCase.recipeId)
  if (scenario === null) throw new Error(`missing recipe ${evaluationCase.recipeId}`)
  const objectivePolicy = resolveObjectivePolicy(scenario.recipe, {
    objective: scenario.objective,
    riskPreset: resolveRiskPreferencePreset(risk),
  })
  const state = createInitialCraftState(scenario.recipe, evaluationCase.equipment.crafter)
  const recipe = scenario.recipe
  const crafter = evaluationCase.equipment.crafter
  const routeQualityTarget = objectivePolicy.evidence === 'verified-collectability-tiers'
    ? objectivePolicy.voluntaryQualityFloor
    : objectivePolicy.qualityTarget
  const utilityThresholds = [...objectivePolicy.utilityThresholds]
  if (utilityThresholds.length < 1 || utilityThresholds.length > 4) {
    throw new Error(`${evaluationCase.caseId} has unsupported utility threshold count`)
  }
  while (utilityThresholds.length < 4) utilityThresholds.push(0)
  const cells = [
    PROTOCOL,
    safeCell(evaluationCase.caseId, 'caseId'),
    'episode',
    safeCell(solverVersion, 'solverVersion'),
    risk,
    scenario.objective.qualityTarget,
    objectivePolicy.voluntaryQualityFloor,
    routeQualityTarget,
    booleanCell(scenario.objective.mode === 'maximize-quality-with-safe-completion'),
    objectivePolicy.evidence,
    objectivePolicy.utilityThresholds.length,
    ...utilityThresholds,
    trace ? 'full' : 'none',
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
    evaluationCase.pairedSeed,
    0,
    0,
    evaluationCase.maxSteps,
    ...transitionWeightCells(evaluationCase),
  ].map(String)
  if (cells.length !== 141) {
    throw new Error(`${evaluationCase.caseId} generic input must have 141 cells, got ${cells.length}`)
  }
  return cells.join('\t')
}

function parseActionList(value: string): readonly CraftActionId[] {
  return value === '-' ? [] : value.split(',') as CraftActionId[]
}

function parseTerminal(value: string): CraftState['terminal'] {
  if (value === 'none' || value === 'completed' || value === 'failed') return value
  throw new Error(`unknown terminal ${value}`)
}

function parseStopReason(value: string): EpisodeStopReason {
  if (value === 'completed' || value === 'failed' || value === 'policy-null'
    || value === 'no-legal-action' || value === 'illegal-action' || value === 'action-limit') {
    return value
  }
  throw new Error(`unknown stop reason ${value}`)
}

function runNative(
  binaryPath: string,
  planCases: readonly Readonly<MatrixCase>[],
  solverVersion: string,
  arm: NativeEpisode['arm'],
  risk: NativeEpisode['risk'],
  trace: boolean,
): { rows: readonly NativeEpisode[]; summary: readonly string[]; wallClockMs: number } {
  const input = `${planCases.map((entry) => encodeCase(entry, solverVersion, risk, trace)).join('\n')}\n`
  const startedAt = performance.now()
  const result = spawnSync(binaryPath, [], {
    cwd: process.cwd(),
    input,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
  })
  const wallClockMs = performance.now() - startedAt
  if (result.status !== 0) {
    throw new Error(`native generic binary failed (${result.status}): ${result.stderr || result.stdout}`)
  }
  const lines = result.stdout.trim().split(/\r?\n/u).filter(Boolean)
  const summary = lines.at(-1)?.split('\t') ?? []
  if (summary[0] !== PROTOCOL || summary[1] !== '__batch__' || summary[2] !== 'summary'
    || summary[3] !== 'ok' || Number(summary[4]) !== planCases.length) {
    throw new Error('native generic summary is missing or inconsistent')
  }
  const rows = lines.slice(0, -1).map((line, index): NativeEpisode => {
    const cells = line.split('\t')
    const expected = planCases[index]
    if (expected === undefined || cells.length !== 51 || cells[0] !== PROTOCOL
      || cells[1] !== expected.caseId || cells[2] !== 'episode' || cells[3] !== 'ok') {
      throw new Error(`native generic row ${index} has invalid identity or shape (${cells.length} cells)`)
    }
    if (cells[4] !== solverVersion || cells[5] !== risk) {
      throw new Error(`native generic row ${index} solver/risk mismatch`)
    }
    return {
      arm,
      solverVersion,
      risk,
      caseId: cells[1]!,
      terminal: parseTerminal(cells[16]!),
      stopReason: parseStopReason(cells[17]!),
      actions: parseActionList(cells[19]!),
      finalCursor: {
        condition: requiredInteger(cells[20]!, `${cells[1]}.cursor.condition`),
        success: requiredInteger(cells[21]!, `${cells[1]}.cursor.success`),
      },
      recommendationCalls: requiredInteger(cells[22]!, `${cells[1]}.recommendationCalls`),
      recommendationNs: Number(cells[23]),
      recommendationMaxNs: Number(cells[24]),
      plannerContext: cells[25]!,
      finalState: decodeNativeStateCells(cells.slice(26, 50), cells[1]!),
      trace: cells[50] === '-' ? null : cells[50]!,
    }
  })
  return { rows, summary, wallClockMs }
}

function migrationTraceCell(
  steps: ReturnType<typeof runMigrationOracleEpisode>['steps'],
): string | null {
  if (steps.length === 0) return null
  return steps.map((step) => [
    step.action,
    step.success ? '1' : '0',
    step.nextCondition,
    step.cursorBefore.condition,
    step.cursorBefore.success,
    step.cursorAfter.condition,
    step.cursorAfter.success,
    step.explanationCodes.length === 0 ? '-' : step.explanationCodes.join(','),
    ...encodeNativeStateCells(step.after),
  ].join('|')).join(';')
}

function runTypeScriptMigrationOracle(
  planCases: readonly Readonly<MatrixCase>[],
  risk: NativeEpisode['risk'],
): { rows: readonly NativeEpisode[]; wallClockMs: number } {
  const startedAt = performance.now()
  const rows = planCases.map((evaluationCase): NativeEpisode => {
    const episode = runMigrationOracleEpisode(evaluationCase, risk)
    return {
      arm: 'baseline',
      solverVersion: SOLVER_POLICY_VERSION,
      risk,
      caseId: episode.caseId,
      terminal: episode.terminal,
      stopReason: episode.stopReason,
      actions: episode.actions,
      finalCursor: episode.finalCursor,
      recommendationCalls: episode.recommendationCalls,
      recommendationNs: 0,
      recommendationMaxNs: 0,
      plannerContext: episode.finalMemory,
      finalState: episode.finalState,
      trace: migrationTraceCell(episode.steps),
    }
  })
  return { rows, wallClockMs: performance.now() - startedAt }
}

const MIGRATION_PARITY_FIELDS = [
  'risk',
  'caseId',
  'terminal',
  'stopReason',
  'actions',
  'finalCursor',
  'recommendationCalls',
  'plannerContext',
  'finalState',
  'trace',
] as const satisfies readonly (keyof NativeEpisode)[]

function migrationParityMismatches(
  expectedRows: readonly NativeEpisode[],
  actualRows: readonly NativeEpisode[],
) {
  const actualByCase = new Map(actualRows.map((row) => [row.caseId, row]))
  const mismatches: Array<{
    caseId: string
    fields: readonly string[]
    expectedSha256: string
    actualSha256: string
  }> = []
  for (const expected of expectedRows) {
    const actual = actualByCase.get(expected.caseId)
    if (actual === undefined) {
      mismatches.push({
        caseId: expected.caseId,
        fields: ['missing-native-row'],
        expectedSha256: sha256(JSON.stringify(expected)),
        actualSha256: sha256('missing'),
      })
      continue
    }
    const fields = MIGRATION_PARITY_FIELDS.filter((field) => (
      JSON.stringify(expected[field]) !== JSON.stringify(actual[field])
    ))
    if (fields.length > 0) {
      mismatches.push({
        caseId: expected.caseId,
        fields,
        expectedSha256: sha256(JSON.stringify(expected)),
        actualSha256: sha256(JSON.stringify(actual)),
      })
    }
  }
  for (const actual of actualRows) {
    if (!expectedRows.some((expected) => expected.caseId === actual.caseId)) {
      mismatches.push({
        caseId: actual.caseId,
        fields: ['unexpected-native-row'],
        expectedSha256: sha256('missing'),
        actualSha256: sha256(JSON.stringify(actual)),
      })
    }
  }
  return mismatches
}

function migrationActionSimilarity(
  expectedRows: readonly NativeEpisode[],
  actualRows: readonly NativeEpisode[],
) {
  const actualByCase = new Map(actualRows.map((row) => [row.caseId, row]))
  let firstActionAgreements = 0
  let exactActionSequenceAgreements = 0
  let alignedActionAgreements = 0
  let alignedActionPositions = 0
  let terminalAgreements = 0
  let stopReasonAgreements = 0
  for (const expected of expectedRows) {
    const actual = actualByCase.get(expected.caseId)
    if (actual === undefined) continue
    if (expected.actions[0] === actual.actions[0]) firstActionAgreements += 1
    if (JSON.stringify(expected.actions) === JSON.stringify(actual.actions)) {
      exactActionSequenceAgreements += 1
    }
    const aligned = Math.min(expected.actions.length, actual.actions.length)
    alignedActionPositions += aligned
    for (let index = 0; index < aligned; index += 1) {
      if (expected.actions[index] === actual.actions[index]) alignedActionAgreements += 1
    }
    if (expected.terminal === actual.terminal) terminalAgreements += 1
    if (expected.stopReason === actual.stopReason) stopReasonAgreements += 1
  }
  const pairs = expectedRows.length
  return {
    pairs,
    firstActionAgreementRate: pairs === 0 ? null : firstActionAgreements / pairs,
    exactActionSequenceAgreementRate: pairs === 0 ? null : exactActionSequenceAgreements / pairs,
    alignedActionAgreementRate: alignedActionPositions === 0
      ? null
      : alignedActionAgreements / alignedActionPositions,
    terminalAgreementRate: pairs === 0 ? null : terminalAgreements / pairs,
    stopReasonAgreementRate: pairs === 0 ? null : stopReasonAgreements / pairs,
  }
}

interface PublicRow {
  arm: NativeEpisode['arm']
  solverVersion: string
  caseId: string
  caseFingerprint: string
  familyId: string
  recipeId: number
  equipmentId: string
  worldId: string
  worldRole: string
  seedIndex: number
  pairedSeed: number
  risk: NativeEpisode['risk']
  completionContract: CompletionContract
  qualityTarget: number
  voluntaryQualityFloor: number
  terminal: CraftState['terminal']
  stopReason: EpisodeStopReason
  actions: number
  progress: number
  quality: number
  durability: number
  cp: number
  completedObjectiveUtility: number
  qualityTargetReached: boolean
  recommendationCalls: number
  recommendationNs: number
  recommendationMaxNs: number
  plannerContext: string
  trace?: string
}

function publicRows(
  planCases: readonly Readonly<MatrixCase>[],
  episodes: readonly NativeEpisode[],
): readonly PublicRow[] {
  const metadata = new Map(planCases.map((entry) => [entry.caseId, entry]))
  return episodes.map((episode) => {
    const evaluationCase = metadata.get(episode.caseId)
    if (evaluationCase === undefined) throw new Error(`missing case metadata ${episode.caseId}`)
    const scenario = cosmicExpertScenarioDataByRecipeId(evaluationCase.recipeId)
    if (scenario === null) throw new Error(`missing recipe ${evaluationCase.recipeId}`)
    const objectivePolicy = resolveObjectivePolicy(scenario.recipe, {
      objective: scenario.objective,
      riskPreset: resolveRiskPreferencePreset(episode.risk),
    })
    const completed = episode.terminal === 'completed'
    return {
      arm: episode.arm,
      solverVersion: episode.solverVersion,
      caseId: episode.caseId,
      caseFingerprint: evaluationCase.caseFingerprint,
      familyId: evaluationCase.family.familyId,
      recipeId: evaluationCase.recipeId,
      equipmentId: evaluationCase.equipment.id,
      worldId: evaluationCase.world.id,
      worldRole: evaluationCase.world.role,
      seedIndex: evaluationCase.seedIndex,
      pairedSeed: evaluationCase.pairedSeed,
      risk: episode.risk,
      completionContract: completionContractForRequiredQuality(scenario.recipe.requiredQuality),
      qualityTarget: scenario.objective.qualityTarget,
      voluntaryQualityFloor: objectivePolicy.voluntaryQualityFloor,
      terminal: episode.terminal,
      stopReason: episode.stopReason,
      actions: episode.actions.length,
      progress: episode.finalState.progress,
      quality: episode.finalState.quality,
      durability: episode.finalState.durability,
      cp: episode.finalState.cp,
      completedObjectiveUtility: completed
        ? Math.max(0, Math.min(1, episode.finalState.quality / scenario.objective.qualityTarget))
        : 0,
      qualityTargetReached: completed && episode.finalState.quality >= scenario.objective.qualityTarget,
      recommendationCalls: episode.recommendationCalls,
      recommendationNs: episode.recommendationNs,
      recommendationMaxNs: episode.recommendationMaxNs,
      plannerContext: episode.plannerContext,
      ...(episode.trace === null ? {} : { trace: episode.trace }),
    }
  })
}

function aggregate(rows: readonly PublicRow[]) {
  const stopReasons: Record<EpisodeStopReason, number> = {
    completed: 0,
    failed: 0,
    'policy-null': 0,
    'no-legal-action': 0,
    'illegal-action': 0,
    'action-limit': 0,
  }
  for (const row of rows) stopReasons[row.stopReason] += 1
  const completed = rows.filter((row) => row.terminal === 'completed')
  return {
    episodes: rows.length,
    completed: completed.length,
    qualityTargetReached: rows.filter((row) => row.qualityTargetReached).length,
    stopReasons,
    objectiveUtilityMean: rows.length === 0 ? null
      : rows.reduce((sum, row) => sum + row.completedObjectiveUtility, 0) / rows.length,
    actionsMean: completed.length === 0 ? null
      : completed.reduce((sum, row) => sum + row.actions, 0) / completed.length,
    recommendationCalls: rows.reduce((sum, row) => sum + row.recommendationCalls, 0),
    recommendationNs: rows.reduce((sum, row) => sum + row.recommendationNs, 0),
    recommendationMaxNs: rows.reduce((maximum, row) => Math.max(maximum, row.recommendationMaxNs), 0),
  }
}

function grouped(rows: readonly PublicRow[], keyOf: (row: PublicRow) => string) {
  const groups = new Map<string, PublicRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups].map(([key, values]) => ({ key, ...aggregate(values) }))
}

function comparison(rows: readonly PublicRow[]) {
  const baseline = new Map(rows.filter((row) => row.arm === 'baseline').map((row) => [row.caseId, row]))
  const candidate = new Map(rows.filter((row) => row.arm === 'candidate').map((row) => [row.caseId, row]))
  let completionWins = 0
  let completionLosses = 0
  let targetWins = 0
  let targetLosses = 0
  let utilityDelta = 0
  const completionRegressionCaseIds: string[] = []
  for (const [caseId, left] of baseline) {
    const right = candidate.get(caseId)
    if (right === undefined) throw new Error(`candidate missing paired case ${caseId}`)
    const leftCompleted = left.terminal === 'completed'
    const rightCompleted = right.terminal === 'completed'
    if (!leftCompleted && rightCompleted) completionWins += 1
    if (leftCompleted && !rightCompleted) {
      completionLosses += 1
      completionRegressionCaseIds.push(caseId)
    }
    if (!left.qualityTargetReached && right.qualityTargetReached) targetWins += 1
    if (left.qualityTargetReached && !right.qualityTargetReached) targetLosses += 1
    utilityDelta += right.completedObjectiveUtility - left.completedObjectiveUtility
  }
  return {
    pairs: baseline.size,
    completionWins,
    completionLosses,
    targetWins,
    targetLosses,
    objectiveUtilityMeanDelta: baseline.size === 0 ? null : utilityDelta / baseline.size,
    completionRegressionCaseIds,
  }
}

function handshake(binaryPath: string): readonly string[] {
  const result = spawnSync(binaryPath, [], {
    input: `${PROTOCOL}\t__handshake__\thandshake\n`,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) throw new Error(`native handshake failed: ${result.stderr || result.stdout}`)
  const cells = result.stdout.trim().split('\t')
  if (cells[0] !== PROTOCOL || cells[1] !== '__handshake__' || cells[2] !== 'handshake'
    || cells[3] !== 'ok') throw new Error('native handshake is malformed')
  return cells
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function migrationSemanticRows(rows: readonly NativeEpisode[]) {
  return rows.map((row) => Object.fromEntries(
    MIGRATION_PARITY_FIELDS.map((field) => [field, row[field]]),
  ))
}

function emitReport(
  report: object,
  outputPathValue: string | null,
  compact: object,
): void {
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  const reportHash = sha256(serialized)
  if (outputPathValue !== null) {
    const outputPath = path.resolve(outputPathValue)
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, serialized, 'utf8')
    process.stdout.write(`${JSON.stringify({
      outputPath,
      reportSha256: reportHash,
      ...compact,
    }, null, 2)}\n`)
  } else {
    process.stdout.write(serialized)
  }
}

function main(args: readonly string[]) {
  if (args.includes('--describe')) {
    if (args.length !== 1) throw new Error('--describe cannot be combined with evaluator options')
    process.stdout.write(`${JSON.stringify({
      ...describeGenericCosmicFamilyEvaluator(),
      executionEngine: 'rust-native-closed-loop',
      nativeEpisodeProtocol: PROTOCOL,
    })}\n`)
    return
  }
  const toolOptions = parseToolOptions(args)
  const options = parseMatrixCliOptions(matrixArguments(args))
  const plan = buildMatrixPlan(options)
  const identity = handshake(toolOptions.binaryPath)
  const advertisedSolvers = new Set(identity.slice(9))
  if (toolOptions.migrationParity || toolOptions.migrationSimilarity) {
    if (!advertisedSolvers.has(toolOptions.candidateSolver)) {
      throw new Error('native handshake does not advertise the requested migration solver')
    }
    const expected = runTypeScriptMigrationOracle(plan.cases, options.candidateRisk)
    const actual = runNative(
      toolOptions.binaryPath,
      plan.cases,
      toolOptions.candidateSolver,
      'candidate',
      options.candidateRisk,
      toolOptions.migrationParity || options.includeTrace,
    )
    const mismatches = migrationParityMismatches(expected.rows, actual.rows)
    const expectedSemanticRows = migrationSemanticRows(expected.rows)
    const actualSemanticRows = migrationSemanticRows(actual.rows)
    const semanticRows = publicRows(plan.cases, [...expected.rows, ...actual.rows])
    const report = {
      schemaVersion: toolOptions.migrationParity
        ? 'generic-ts-rust-stepwise-migration-parity-v1'
        : 'generic-ts-rust-stratified-migration-similarity-v1',
      matrixId: plan.matrixId,
      comparisonContract: plan.comparisonContract,
      oraclePolicyVersion: SOLVER_POLICY_VERSION,
      nativePolicyVersion: toolOptions.candidateSolver,
      risk: options.candidateRisk,
      cases: plan.cases.length,
      parityFields: MIGRATION_PARITY_FIELDS,
      expectedCorpusSha256: sha256(JSON.stringify(expectedSemanticRows)),
      actualCorpusSha256: sha256(JSON.stringify(actualSemanticRows)),
      exactParity: mismatches.length === 0,
      mismatchCount: mismatches.length,
      mismatchExamples: mismatches.slice(0, 50),
      actionSimilarity: migrationActionSimilarity(expected.rows, actual.rows),
      summaryByArm: grouped(semanticRows, (row) => row.arm),
      byCompletionContractAndArm: grouped(
        semanticRows,
        (row) => `${row.arm}|${row.completionContract}`,
      ),
      pairedComparison: comparison(semanticRows),
      pairedComparisonByCompletionContract: (
        ['progress-only', 'progress-and-required-quality'] as const
      ).map((completionContract) => ({
        completionContract,
        ...comparison(semanticRows.filter((row) => row.completionContract === completionContract)),
      })),
      timing: {
        typescriptWallClockMs: expected.wallClockMs,
        nativeWallClockMs: actual.wallClockMs,
        nativeSummary: actual.summary,
      },
      binary: {
        path: toolOptions.binaryPath,
        handshake: identity,
      },
      rows: options.includeTrace ? semanticRows : undefined,
    }
    emitReport(report, toolOptions.outputPath, {
      exactParity: report.exactParity,
      mismatchCount: report.mismatchCount,
      expectedCorpusSha256: report.expectedCorpusSha256,
      actualCorpusSha256: report.actualCorpusSha256,
      timing: report.timing,
      actionSimilarity: report.actionSimilarity,
      pairedComparison: report.pairedComparison,
      byCompletionContractAndArm: report.byCompletionContractAndArm,
    })
    if (toolOptions.migrationParity && !report.exactParity) process.exitCode = 1
    return
  }
  if (!advertisedSolvers.has(toolOptions.baselineSolver)
    || !advertisedSolvers.has(toolOptions.candidateSolver)) {
    throw new Error('native handshake does not advertise the requested solver versions')
  }
  const baseline = runNative(
    toolOptions.binaryPath,
    plan.cases,
    toolOptions.baselineSolver,
    'baseline',
    options.candidateRisk,
    options.includeTrace,
  )
  const candidate = runNative(
    toolOptions.binaryPath,
    plan.cases,
    toolOptions.candidateSolver,
    'candidate',
    options.candidateRisk,
    options.includeTrace,
  )
  const rows = publicRows(plan.cases, [...baseline.rows, ...candidate.rows])
  const pairedComparisonByCompletionContract = (
    ['progress-only', 'progress-and-required-quality'] as const
  ).map((completionContract) => ({
    completionContract,
    ...comparison(rows.filter((row) => row.completionContract === completionContract)),
  }))
  const report = {
    schemaVersion: 'native-generic-cosmic-paired-matrix-v1',
    matrixId: plan.matrixId,
    comparisonContract: plan.comparisonContract,
    executionEngine: 'rust-native-closed-loop',
    binary: {
      path: toolOptions.binaryPath,
      handshake: identity,
    },
    solvers: {
      baseline: toolOptions.baselineSolver,
      candidate: toolOptions.candidateSolver,
    },
    risk: options.candidateRisk,
    cases: plan.cases.length,
    episodes: rows.length,
    timing: {
      baselineWallClockMs: baseline.wallClockMs,
      candidateWallClockMs: candidate.wallClockMs,
      baselineNativeSummary: baseline.summary,
      candidateNativeSummary: candidate.summary,
    },
    summaryByArm: grouped(rows, (row) => row.arm),
    byCompletionContractAndArm: grouped(rows, (row) => `${row.arm}|${row.completionContract}`),
    byFamilyAndArm: grouped(rows, (row) => `${row.arm}|${row.familyId}`),
    byEquipmentAndArm: grouped(rows, (row) => `${row.arm}|${row.equipmentId}`),
    byWorldAndArm: grouped(rows, (row) => `${row.arm}|${row.worldId}`),
    pairedComparison: comparison(rows),
    pairedComparisonByCompletionContract,
    overnightReadiness: {
      eligible: false,
      migrationParity: 'bounded-similarity-only',
      reasons: [
        'this daytime matrix does not seal the overnight runner config or content-addressed binary',
        '1-vs-4-worker determinism and sustained worker calibration must be sealed separately',
      ],
    },
    rows,
  }
  emitReport(report, toolOptions.outputPath, {
    summaryByArm: report.summaryByArm,
    pairedComparison: report.pairedComparison,
    timing: report.timing,
  })
}

main(process.argv.slice(2))
