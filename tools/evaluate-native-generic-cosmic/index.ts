import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  cosmicExpertScenarioDataByRecipeId,
} from '@frozen-rabbit-expert/data'
import {
  MATERIAL_CONDITIONS,
  createInitialCraftState,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  SOLVER_POLICY_VERSION,
  objectiveOutcomeUtility,
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

import { parseRecommendationDurations, recommendationLatency, validateRecommendationTiming } from './timing'
import { reuseHistoricalCandidate } from './historical'

const PROTOCOL = 'native-generic-episode-batch-v7'
const LEGACY_PROTOCOL = 'native-generic-episode-batch-v6'
const MIGRATION_BASELINE = 'generic-craft-condition-set-portfolio-v0.22.0'
const DEFAULT_BASELINE = 'generic-craft-route-portfolio-v1.1.0'
const DEFAULT_CANDIDATE = 'generic-craft-route-portfolio-v1.2.0'

interface ToolOptions {
  baselineSolver: string
  candidateSolver: string
  referenceSolver: string | null
  binaryPath: string
  outputPath: string | null
  migrationParity: boolean
  migrationSimilarity: boolean
  timeoutMs: number
  planOnly: boolean
  baselineReport: string | null
}

interface NativeEpisode {
  arm: 'baseline' | 'candidate' | 'reference'
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
  recommendationDurationsNs?: readonly number[]
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
  const timeoutMs = Number(optionValue(args, 'native-timeout-ms') ?? 300_000)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('--native-timeout-ms must be a positive integer')
  }
  return {
    baselineSolver: optionValue(args, 'baseline-solver')
      ?? (migrationParity || migrationSimilarity ? MIGRATION_BASELINE : DEFAULT_BASELINE),
    candidateSolver: optionValue(args, 'candidate-solver')
      ?? (migrationParity ? SOLVER_POLICY_VERSION
        : migrationSimilarity ? MIGRATION_BASELINE
          : DEFAULT_CANDIDATE),
    referenceSolver: optionValue(args, 'reference-solver') ?? null,
    binaryPath: path.resolve(optionValue(args, 'native-binary')
      ?? path.join('native', 'craft-kernel', 'target', 'release', binaryName)),
    outputPath: optionValue(args, 'output') ?? null,
    migrationParity,
    migrationSimilarity,
    timeoutMs,
    planOnly: args.includes('--plan-only'),
    baselineReport: optionValue(args, 'baseline-report') ?? null,
  }
}

function matrixArguments(args: readonly string[]): readonly string[] {
  const stripped = args.filter((argument) => ![
    '--baseline-solver=',
    '--candidate-solver=',
    '--reference-solver=',
    '--native-binary=',
    '--native-timeout-ms=',
    '--baseline-report=',
  ].some((prefix) => argument.startsWith(prefix))
    && argument !== '--migration-parity'
    && argument !== '--migration-similarity'
    && argument !== '--plan-only')
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

function randomConditionMask(conditions: readonly string[]): number {
  return conditions.reduce((mask, condition) => {
    const index = MATERIAL_CONDITIONS.indexOf(condition as (typeof MATERIAL_CONDITIONS)[number])
    if (index < 0) throw new Error(`unknown random condition ${condition}`)
    return mask | (1 << index)
  }, 0)
}

function nativeQualityUtilityKind(
  scenario: NonNullable<ReturnType<typeof cosmicExpertScenarioDataByRecipeId>>,
): string {
  if (scenario.recipe.requiredQuality > 0) return 'hard-quality-max'
  if (scenario.recipe.qualityOutcome === 'hq-chance') return 'hq-chance'
  if (scenario.objective.qualityTiers.length === 4) return 'collectability-tiers'
  return 'continuous-collectability'
}

function encodeCase(
  evaluationCase: Readonly<MatrixCase>,
  solverVersion: string,
  risk: 'stable' | 'balanced' | 'aggressive',
  trace: boolean,
  protocol: string,
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
  const qualityMilestones = [...objectivePolicy.qualityMilestones]
  if (qualityMilestones.length < 1 || qualityMilestones.length > 4) {
    throw new Error(`${evaluationCase.caseId} has unsupported quality milestone count`)
  }
  while (qualityMilestones.length < 4) qualityMilestones.push(0)
  const cells = [
    protocol,
    safeCell(evaluationCase.caseId, 'caseId'),
    'episode',
    safeCell(solverVersion, 'solverVersion'),
    risk,
    recipe.qualityMax,
    objectivePolicy.protectedQualityFloor,
    booleanCell(scenario.objective.mode === 'maximize-quality-with-safe-completion'),
    nativeQualityUtilityKind(scenario),
    objectivePolicy.qualityMilestones.length,
    ...qualityMilestones,
    randomConditionMask(recipe.randomConditions ?? recipe.availableConditions),
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
  artifactPrefix: string | null = null,
  timeoutMs = 300_000,
  protocol: string = PROTOCOL,
): { rows: readonly NativeEpisode[]; summary: readonly string[]; wallClockMs: number } {
  const input = `${planCases.map((entry) => encodeCase(entry, solverVersion, risk, trace, protocol)).join('\n')}\n`
  if (artifactPrefix !== null) {
    mkdirSync(path.dirname(path.resolve(artifactPrefix)), { recursive: true })
    writeFileSync(`${artifactPrefix}.${arm}.tsv`, input, 'utf8')
  }
  const startedAt = performance.now()
  const result = spawnSync(binaryPath, [], {
    cwd: process.cwd(),
    input,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
    timeout: timeoutMs,
  })
  const wallClockMs = performance.now() - startedAt
  if (result.status !== 0) {
    throw new Error(`native generic binary failed (${result.status}): ${result.error?.message ?? (result.stderr || result.stdout)}`)
  }
  const lines = result.stdout.trim().split(/\r?\n/u).filter(Boolean)
  const summary = lines.at(-1)?.split('\t') ?? []
  if (summary[0] !== protocol || summary[1] !== '__batch__' || summary[2] !== 'summary'
    || summary[3] !== 'ok' || Number(summary[4]) !== planCases.length) {
    throw new Error('native generic summary is missing or inconsistent')
  }
  const rows = lines.slice(0, -1).map((line, index): NativeEpisode => {
    const cells = line.split('\t')
    const expected = planCases[index]
    if (expected === undefined || cells.length !== (protocol === PROTOCOL ? 51 : 50) || cells[0] !== protocol
      || cells[1] !== expected.caseId || cells[2] !== 'episode' || cells[3] !== 'ok') {
      throw new Error(`native generic row ${index} has invalid identity or shape (${cells.length} cells)`)
    }
    if (cells[4] !== solverVersion || cells[5] !== risk) {
      throw new Error(`native generic row ${index} solver/risk mismatch`)
    }
    const row: NativeEpisode = {
      arm,
      solverVersion,
      risk,
      caseId: cells[1]!,
      terminal: parseTerminal(cells[15]!),
      stopReason: parseStopReason(cells[16]!),
      actions: parseActionList(cells[18]!),
      finalCursor: {
        condition: requiredInteger(cells[19]!, `${cells[1]}.cursor.condition`),
        success: requiredInteger(cells[20]!, `${cells[1]}.cursor.success`),
      },
      recommendationCalls: requiredInteger(cells[21]!, `${cells[1]}.recommendationCalls`),
      recommendationNs: Number(cells[22]),
      recommendationMaxNs: Number(cells[23]),
      ...(protocol === PROTOCOL ? {
        recommendationDurationsNs: parseRecommendationDurations(cells[50]!),
      } : {}),
      plannerContext: cells[24]!,
      finalState: decodeNativeStateCells(cells.slice(25, 49), cells[1]!),
      trace: cells[49] === '-' ? null : cells[49]!,
    }
    if (protocol === PROTOCOL) validateRecommendationTiming(row)
    return row
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
  qualityMaximum: number
  protectedQualityFloor: number
  qualityUtilityKind: string
  qualityMilestones: readonly number[]
  hqChanceMilestones: readonly number[]
  protectedHqChanceFloorPercent: number | null
  terminal: CraftState['terminal']
  stopReason: EpisodeStopReason
  actions: number
  advancingSteps: number
  progress: number
  quality: number
  durability: number
  cp: number
  completedObjectiveUtility: number
  qualityMaximumReached: boolean
  recommendationCalls: number
  recommendationNs: number
  recommendationMaxNs: number
  recommendationDurationsNs?: readonly number[]
  plannerContext: string
  trace?: string
}

function rowIdentity(evaluationCase: Readonly<MatrixCase>, risk: NativeEpisode['risk']) {
  const scenario = cosmicExpertScenarioDataByRecipeId(evaluationCase.recipeId)
  if (scenario === null) throw new Error(`missing recipe ${evaluationCase.recipeId}`)
  const objectivePolicy = resolveObjectivePolicy(scenario.recipe, {
    objective: scenario.objective,
    riskPreset: resolveRiskPreferencePreset(risk),
  })
  return {
    caseId: evaluationCase.caseId,
    caseFingerprint: evaluationCase.caseFingerprint,
    familyId: evaluationCase.family.familyId,
    recipeId: evaluationCase.recipeId,
    equipmentId: evaluationCase.equipment.id,
    worldId: evaluationCase.world.id,
    worldRole: evaluationCase.world.role,
    seedIndex: evaluationCase.seedIndex,
    pairedSeed: evaluationCase.pairedSeed,
    risk,
    completionContract: completionContractForRequiredQuality(scenario.recipe.requiredQuality),
    qualityMaximum: scenario.recipe.qualityMax,
    protectedQualityFloor: objectivePolicy.protectedQualityFloor,
    qualityUtilityKind: objectivePolicy.qualityUtilityKind,
    qualityMilestones: objectivePolicy.qualityMilestones,
    hqChanceMilestones: objectivePolicy.hqChanceMilestones,
    protectedHqChanceFloorPercent: objectivePolicy.protectedHqChanceFloorPercent,
  }
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
    const completed = episode.terminal === 'completed'
    return {
      arm: episode.arm,
      solverVersion: episode.solverVersion,
      ...rowIdentity(evaluationCase, episode.risk),
      terminal: episode.terminal,
      stopReason: episode.stopReason,
      actions: episode.actions.length,
      advancingSteps: Math.max(0, episode.finalState.step - 1),
      progress: episode.finalState.progress,
      quality: episode.finalState.quality,
      durability: episode.finalState.durability,
      cp: episode.finalState.cp,
      completedObjectiveUtility: completed
        ? objectiveOutcomeUtility(scenario.recipe, scenario.objective, episode.finalState.quality)
        : 0,
      qualityMaximumReached: completed && episode.finalState.quality >= scenario.recipe.qualityMax,
      recommendationCalls: episode.recommendationCalls,
      recommendationNs: episode.recommendationNs,
      recommendationMaxNs: episode.recommendationMaxNs,
      ...(episode.recommendationDurationsNs === undefined ? {} : {
        recommendationDurationsNs: episode.recommendationDurationsNs,
      }),
      plannerContext: episode.plannerContext,
      ...(episode.trace === null ? {} : { trace: episode.trace }),
    }
  })
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('percentile fraction must be between 0 and 1')
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!
}

function lengthDistribution(values: readonly number[]) {
  if (values.length === 0) {
    return {
      count: 0,
      p50: null,
      p90: null,
      p95: null,
      maximum: null,
      mean: null,
    }
  }
  const sorted = [...values].sort((left, right) => left - right)
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    maximum: sorted.at(-1)!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  }
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
  const nonCompleted = rows.filter((row) => row.terminal !== 'completed')
  return {
    episodes: rows.length,
    completed: completed.length,
    qualityMaximumReached: rows.filter((row) => row.qualityMaximumReached).length,
    stopReasons,
    objectiveUtilityMean: rows.length === 0 ? null
      : rows.reduce((sum, row) => sum + row.completedObjectiveUtility, 0) / rows.length,
    craftLength: {
      completed: {
        actions: lengthDistribution(completed.map((row) => row.actions)),
        advancingSteps: lengthDistribution(completed.map((row) => row.advancingSteps)),
      },
      nonCompleted: {
        actions: lengthDistribution(nonCompleted.map((row) => row.actions)),
        advancingSteps: lengthDistribution(nonCompleted.map((row) => row.advancingSteps)),
      },
    },
    recommendationCalls: rows.reduce((sum, row) => sum + row.recommendationCalls, 0),
    recommendationNs: rows.reduce((sum, row) => sum + row.recommendationNs, 0),
    recommendationMaxNs: rows.reduce((maximum, row) => Math.max(maximum, row.recommendationMaxNs), 0),
    recommendationLatency: recommendationLatency(rows),
  }
}

function grouped(rows: readonly PublicRow[], keyOf: (row: PublicRow) => string) {
  const groups = new Map<string, PublicRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [row])
    else group.push(row)
  }
  return [...groups].map(([key, values]) => ({ key, ...aggregate(values) }))
}

function comparison(
  rows: readonly PublicRow[],
  leftArm: NativeEpisode['arm'] = 'baseline',
  rightArm: NativeEpisode['arm'] = 'candidate',
) {
  const baseline = new Map(rows.filter((row) => row.arm === leftArm).map((row) => [row.caseId, row]))
  const candidate = new Map(rows.filter((row) => row.arm === rightArm).map((row) => [row.caseId, row]))
  let completionWins = 0
  let completionLosses = 0
  let qualityMaximumWins = 0
  let qualityMaximumLosses = 0
  let utilityDelta = 0
  const completionRegressionCaseIds: string[] = []
  for (const [caseId, left] of baseline) {
    const right = candidate.get(caseId)
    if (right === undefined) throw new Error(`${rightArm} missing paired case ${caseId}`)
    const leftCompleted = left.terminal === 'completed'
    const rightCompleted = right.terminal === 'completed'
    if (!leftCompleted && rightCompleted) completionWins += 1
    if (leftCompleted && !rightCompleted) {
      completionLosses += 1
      completionRegressionCaseIds.push(caseId)
    }
    if (!left.qualityMaximumReached && right.qualityMaximumReached) qualityMaximumWins += 1
    if (left.qualityMaximumReached && !right.qualityMaximumReached) qualityMaximumLosses += 1
    utilityDelta += right.completedObjectiveUtility - left.completedObjectiveUtility
  }
  return {
    leftArm,
    rightArm,
    pairs: baseline.size,
    completionWins,
    completionLosses,
    qualityMaximumWins,
    qualityMaximumLosses,
    objectiveUtilityMeanDelta: baseline.size === 0 ? null : utilityDelta / baseline.size,
    completionRegressionCaseIds,
  }
}

function handshake(binaryPath: string): readonly string[] {
  for (const protocol of [PROTOCOL, LEGACY_PROTOCOL]) {
    const result = spawnSync(binaryPath, [], {
      input: `${protocol}\t__handshake__\thandshake\n`,
      encoding: 'utf8', windowsHide: true, timeout: 10_000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) continue
    const cells = result.stdout.trim().split('\t')
    if (cells[0] !== protocol || cells[1] !== '__handshake__' || cells[2] !== 'handshake'
      || cells[3] !== 'ok') throw new Error('native handshake is malformed')
    return cells
  }
  throw new Error('native handshake failed for supported protocols v7/v6')
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
  if (toolOptions.referenceSolver !== null
    && (toolOptions.migrationParity || toolOptions.migrationSimilarity)) {
    throw new Error('--reference-solver is not supported for migration runs')
  }
  if (toolOptions.referenceSolver !== null && toolOptions.baselineReport !== null) {
    throw new Error('--reference-solver requires a fresh baseline arm')
  }
  if (toolOptions.baselineReport !== null && (toolOptions.migrationParity || toolOptions.migrationSimilarity)) {
    throw new Error('historical baseline is not supported for migration runs')
  }
  // Validate the saved case set before any candidate work starts.
  const historical = toolOptions.baselineReport === null ? null : reuseHistoricalCandidate(
    JSON.parse(readFileSync(toolOptions.baselineReport, 'utf8')),
    plan.cases.map(entry => ({ ...rowIdentity(entry, options.candidateRisk), arm: 'baseline', solverVersion: toolOptions.baselineSolver })),
    plan.comparisonContract, toolOptions.baselineSolver, identity,
  )
  if (toolOptions.planOnly) {
    if (toolOptions.outputPath === null || toolOptions.migrationParity || toolOptions.migrationSimilarity) {
      throw new Error('--plan-only requires --output and ordinary native evaluation options')
    }
    const plannedArms: readonly [NativeEpisode['arm'], string][] = [
      ['baseline', toolOptions.baselineSolver],
      ['candidate', toolOptions.candidateSolver],
      ...(toolOptions.referenceSolver === null
        ? []
        : [['reference', toolOptions.referenceSolver] as [NativeEpisode['arm'], string]]),
    ]
    for (const [arm, solver] of plannedArms) {
      if (historical !== null && arm === 'baseline') continue
      if (!advertisedSolvers.has(solver)) throw new Error(`native binary does not advertise solver ${solver}`)
      const input = plan.cases.map((entry) => encodeCase(entry, solver, options.candidateRisk, options.includeTrace, identity[0]!))
      mkdirSync(path.dirname(path.resolve(toolOptions.outputPath)), { recursive: true })
      writeFileSync(`${toolOptions.outputPath}.${arm}.tsv`, `${input.join('\n')}\n`, 'utf8')
    }
    const report = {
      schemaVersion: 'native-generic-cosmic-plan-v1',
      cases: plan.cases.length, risk: options.candidateRisk, handshake: identity,
      rows: plan.cases.map((entry) => ({
        caseId: entry.caseId, caseFingerprint: entry.caseFingerprint,
        familyId: entry.family.familyId, recipeId: entry.recipeId,
        equipmentId: entry.equipment.id, worldId: entry.world.id,
        seedIndex: entry.seedIndex, pairedSeed: entry.pairedSeed,
      })),
    }
    emitReport(report, toolOptions.outputPath, { cases: report.cases, executedEpisodes: 0 })
    return
  }
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
      toolOptions.outputPath,
      toolOptions.timeoutMs,
      identity[0],
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
  if ((historical === null && !advertisedSolvers.has(toolOptions.baselineSolver))
    || !advertisedSolvers.has(toolOptions.candidateSolver)
    || (toolOptions.referenceSolver !== null
      && !advertisedSolvers.has(toolOptions.referenceSolver))) {
    throw new Error('native handshake does not advertise the requested solver versions')
  }
  const baseline = historical === null ? runNative(
    toolOptions.binaryPath,
    plan.cases,
    toolOptions.baselineSolver,
    'baseline',
    options.candidateRisk,
    options.includeTrace,
    toolOptions.outputPath,
    toolOptions.timeoutMs,
    identity[0],
  ) : null
  const candidate = runNative(
    toolOptions.binaryPath,
    plan.cases,
    toolOptions.candidateSolver,
    'candidate',
    options.candidateRisk,
    options.includeTrace,
    toolOptions.outputPath,
    toolOptions.timeoutMs,
    identity[0],
  )
  const reference = toolOptions.referenceSolver === null ? null : runNative(
    toolOptions.binaryPath,
    plan.cases,
    toolOptions.referenceSolver,
    'reference',
    options.candidateRisk,
    options.includeTrace,
    toolOptions.outputPath,
    toolOptions.timeoutMs,
    identity[0],
  )
  const rows: readonly PublicRow[] = [
    ...(historical === null ? publicRows(plan.cases, baseline!.rows) : historical.rows as PublicRow[]),
    ...publicRows(plan.cases, candidate.rows),
    ...(reference === null ? [] : publicRows(plan.cases, reference.rows)),
  ]
  const pairedComparisonByCompletionContract = (
    ['progress-only', 'progress-and-required-quality'] as const
  ).map((completionContract) => ({
    completionContract,
    ...comparison(rows.filter((row) => row.completionContract === completionContract)),
  }))
  const candidateVsReference = reference === null
    ? null
    : comparison(rows, 'reference', 'candidate')
  const candidateVsReferenceByCompletionContract = reference === null
    ? null
    : (['progress-only', 'progress-and-required-quality'] as const).map(
      (completionContract) => ({
        completionContract,
        ...comparison(
          rows.filter((row) => row.completionContract === completionContract),
          'reference',
          'candidate',
        ),
      }),
    )
  const report = {
    schemaVersion: reference !== null ? 'native-generic-cosmic-three-arm-matrix-v1'
      : historical !== null ? 'native-generic-cosmic-paired-matrix-v5'
      : identity[0] === PROTOCOL ? 'native-generic-cosmic-paired-matrix-v4' : 'native-generic-cosmic-paired-matrix-v3',
    matrixId: plan.matrixId,
    comparisonContract: plan.comparisonContract,
    executionEngine: 'rust-native-closed-loop',
    binary: {
      path: toolOptions.binaryPath,
      handshake: identity,
      sha256: createHash('sha256').update(readFileSync(toolOptions.binaryPath)).digest('hex'),
    },
    solvers: {
      baseline: toolOptions.baselineSolver,
      candidate: toolOptions.candidateSolver,
      ...(toolOptions.referenceSolver === null ? {} : { reference: toolOptions.referenceSolver }),
    },
    risk: options.candidateRisk,
    cases: plan.cases.length,
    episodes: rows.length,
    executedEpisodes: historical === null ? rows.length : candidate.rows.length,
    reusedEpisodes: historical === null ? 0 : historical.rows.length,
    ...(historical === null ? {} : { baselineSource: historical.source }),
    timing: {
      baselineWallClockMs: baseline?.wallClockMs ?? null,
      candidateWallClockMs: candidate.wallClockMs,
      referenceWallClockMs: reference?.wallClockMs ?? null,
      baselineNativeSummary: baseline?.summary ?? null,
      baselineTimingOrigin: historical === null ? 'current-execution' : 'historical-source',
      candidateNativeSummary: candidate.summary,
      referenceNativeSummary: reference?.summary ?? null,
    },
    summaryByArm: grouped(rows, (row) => row.arm),
    byCompletionContractAndArm: grouped(rows, (row) => `${row.arm}|${row.completionContract}`),
    byFamilyAndArm: grouped(rows, (row) => `${row.arm}|${row.familyId}`),
    byEquipmentAndArm: grouped(rows, (row) => `${row.arm}|${row.equipmentId}`),
    byWorldAndArm: grouped(rows, (row) => `${row.arm}|${row.worldId}`),
    pairedComparison: comparison(rows),
    pairedComparisonByCompletionContract,
    ...(candidateVsReference === null ? {} : {
      candidateVsReference,
      candidateVsReferenceByCompletionContract,
    }),
    overnightReadiness: {
      eligible: false,
      comparisonEvidence: 'bounded-development-outcomes',
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
    ...(candidateVsReference === null ? {} : { candidateVsReference }),
    timing: report.timing,
  })
}

main(process.argv.slice(2))
