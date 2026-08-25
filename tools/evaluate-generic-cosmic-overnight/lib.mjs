import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { availableParallelism } from 'node:os'
import path from 'node:path'

export const OVERNIGHT_RUNNER_VERSION = 'generic-cosmic-overnight-runner-v1.1.0'
export const OVERNIGHT_CONFIG_SCHEMA_VERSION = 'generic-cosmic-overnight-config-v1'
export const OVERNIGHT_MANIFEST_SCHEMA_VERSION = 'generic-cosmic-overnight-manifest-v2'
export const OVERNIGHT_SHARD_SCHEMA_VERSION = 'generic-cosmic-overnight-shard-v1'

export const DEFAULT_RISKS = Object.freeze(['stable', 'balanced', 'aggressive'])
export const DEFAULT_WORLD_IDS = Object.freeze([
  'balanced-iid',
  'normal-heavy-iid',
  'opportunity-scarce-iid',
  'all-normal',
])
export const DEFAULT_SEED_COUNT = 64
export const DEFAULT_BASE_SEED = 20_260_824
export const DEFAULT_MAX_STEPS = 80
export const DEFAULT_TIME_BUDGET_MS = 8.5 * 60 * 60 * 1_000
export const DEFAULT_SHARD_TIMEOUT_MS = 30 * 60 * 1_000
export const DEFAULT_RETRIES = 2
export const DEFAULT_OUTPUT_ROOT = path.join(
  'evaluation-runs',
  'generic-cosmic-overnight',
)

const VALUE_OPTIONS = new Set([
  'family-limit',
  'risk',
  'seed-count',
  'base-seed',
  'time-budget',
  'shard-timeout',
  'retries',
  'workers',
  'output',
  'run-id',
  'baseline-dir',
  'engine',
  'native-binary',
  'native-baseline-solver',
  'native-candidate-solver',
])
const FLAG_OPTIONS = new Set(['help', 'status-only', 'native-preview'])

function objectRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return value
}

function finiteInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
  return value
}

function valueOption(args, name) {
  const prefix = `--${name}=`
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

function parseIntegerOption(value, fallback, label, bounds = {}) {
  if (value === undefined) return fallback
  return finiteInteger(Number(value), label, bounds)
}

function parseWorkersOption(value) {
  const requested = value ?? 'auto'
  if (requested === 'auto') {
    return Object.freeze({
      workers: Math.min(8, Math.max(1, Math.floor(availableParallelism() / 3))),
      workersRequested: requested,
    })
  }
  if (!/^\d+$/.test(requested)) {
    throw new RangeError('--workers must be auto or an integer between 1 and 64')
  }
  return Object.freeze({
    workers: finiteInteger(Number(requested), '--workers', { minimum: 1, maximum: 64 }),
    workersRequested: requested,
  })
}

export function parseDuration(
  value,
  label = '--time-budget',
  fallback = DEFAULT_TIME_BUDGET_MS,
) {
  if (value === undefined) return fallback
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value)
  if (match === null) {
    throw new RangeError(`${label} must be a positive duration such as 8.5h, 510m, or 30s`)
  }
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError(`${label} must be greater than zero`)
  }
  const unit = match[2] ?? 'h'
  const multiplier = unit === 'ms'
    ? 1
    : unit === 's' ? 1_000 : unit === 'm' ? 60_000 : 3_600_000
  const milliseconds = Math.round(amount * multiplier)
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new RangeError(`${label} is outside the supported duration range`)
  }
  return milliseconds
}

export function classifyIncompleteAttemptOutcome({
  shutdownRequested,
  timedOut,
  timeoutIsGlobalDeadline,
}) {
  if (shutdownRequested) return 'interrupted'
  if (timedOut && timeoutIsGlobalDeadline) return 'budget-exhausted'
  return 'failed'
}

export function parseOvernightCliOptions(args) {
  const seen = new Set()
  for (const argument of args) {
    if (!argument.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${argument}`)
    }
    const equalsIndex = argument.indexOf('=')
    const name = argument.slice(2, equalsIndex < 0 ? undefined : equalsIndex)
    if (seen.has(name)) throw new Error(`duplicate overnight option: --${name}`)
    seen.add(name)
    if (equalsIndex < 0) {
      if (!FLAG_OPTIONS.has(name)) {
        if (VALUE_OPTIONS.has(name)) throw new Error(`--${name} requires --${name}=<value>`)
        throw new Error(`unknown overnight option: --${name}`)
      }
      continue
    }
    if (FLAG_OPTIONS.has(name)) throw new Error(`--${name} is a flag and must not use =<value>`)
    if (!VALUE_OPTIONS.has(name)) throw new Error(`unknown overnight option: --${name}`)
    if (argument.slice(equalsIndex + 1).length === 0) {
      throw new Error(`--${name} must not be empty`)
    }
  }

  const riskValue = valueOption(args, 'risk') ?? DEFAULT_RISKS.join(',')
  const risks = riskValue === 'all'
    ? [...DEFAULT_RISKS]
    : riskValue.split(',')
  if (risks.length === 0 || new Set(risks).size !== risks.length) {
    throw new Error('--risk must contain one or more unique risk preferences')
  }
  for (const risk of risks) {
    if (!DEFAULT_RISKS.includes(risk)) {
      throw new RangeError('--risk must contain only stable, balanced, or aggressive')
    }
  }

  const runId = valueOption(args, 'run-id') ?? null
  if (runId !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new Error('--run-id must be 1-128 safe filename characters')
  }
  const workerOptions = parseWorkersOption(valueOption(args, 'workers'))
  const engine = valueOption(args, 'engine') ?? 'legacy-ts'
  if (!['legacy-ts', 'rust-native'].includes(engine)) {
    throw new Error('--engine must be legacy-ts or rust-native')
  }
  if (engine === 'rust-native' && workerOptions.workersRequested === 'auto') {
    throw new Error('rust-native overnight requires an explicit calibrated --workers value')
  }
  if (engine === 'rust-native' && !args.includes('--native-preview')) {
    throw new Error(
      'rust-native formal overnight is blocked until worker-calibration evidence is implemented; '
      + 'use --native-preview for bounded smoke, determinism, or timing runs',
    )
  }
  if (engine !== 'rust-native' && args.includes('--native-preview')) {
    throw new Error('--native-preview requires --engine=rust-native')
  }

  return Object.freeze({
    familyLimit: parseIntegerOption(
      valueOption(args, 'family-limit'),
      null,
      '--family-limit',
      { minimum: 1, maximum: 10_000 },
    ),
    risks: Object.freeze(risks),
    seedCount: parseIntegerOption(
      valueOption(args, 'seed-count'),
      DEFAULT_SEED_COUNT,
      '--seed-count',
      { minimum: 1, maximum: 512 },
    ),
    baseSeed: parseIntegerOption(
      valueOption(args, 'base-seed'),
      DEFAULT_BASE_SEED,
      '--base-seed',
      { minimum: 0, maximum: 0xffff_ffff },
    ),
    timeBudgetMs: parseDuration(valueOption(args, 'time-budget')),
    shardTimeoutMs: parseDuration(
      valueOption(args, 'shard-timeout'),
      '--shard-timeout',
      DEFAULT_SHARD_TIMEOUT_MS,
    ),
    retries: parseIntegerOption(
      valueOption(args, 'retries'),
      DEFAULT_RETRIES,
      '--retries',
      { minimum: 0, maximum: 20 },
    ),
    ...workerOptions,
    outputRoot: valueOption(args, 'output') ?? DEFAULT_OUTPUT_ROOT,
    runId,
    baselineDir: valueOption(args, 'baseline-dir') ?? null,
    engine,
    nativeBinary: valueOption(args, 'native-binary') ?? null,
    nativeBaselineSolver: valueOption(args, 'native-baseline-solver') ?? null,
    nativeCandidateSolver: valueOption(args, 'native-candidate-solver') ?? null,
    nativePreview: args.includes('--native-preview'),
    statusOnly: args.includes('--status-only'),
    help: args.includes('--help'),
  })
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
  )
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

export function sha256Value(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function matrixContentFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

function isMatrixFingerprint(value) {
  return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value)
}

function expectedPairedSeed(description, familyId, equipmentId, worldId, seedIndex, baseSeed) {
  const familyIndex = description.families.findIndex((family) => family.familyId === familyId)
  const equipmentIndex = description.equipmentIds.indexOf(equipmentId)
  const worldIndex = description.worldIds.indexOf(worldId)
  if (familyIndex < 0 || equipmentIndex < 0 || worldIndex < 0) {
    throw new Error('paired seed requires canonical family, equipment, and world IDs')
  }
  const canonicalCounter = (
    (familyIndex * description.equipmentIds.length + equipmentIndex)
      * description.worldIds.length
      + worldIndex
  ) * description.maxSeedsPerCell + seedIndex
  return (baseSeed ^ canonicalCounter) >>> 0
}

function equipmentProfileFingerprint(profileValue, label) {
  const profile = objectRecord(profileValue, label)
  const crafter = objectRecord(profile.crafter, `${label}.crafter`)
  if (typeof profile.id !== 'string' || profile.id.length === 0
    || typeof profile.preparation !== 'string' || profile.preparation.length === 0
    || typeof profile.specialistConsumableCost !== 'string'
    || profile.specialistConsumableCost.length === 0) {
    throw new Error(`${label} has invalid equipment identity fields`)
  }
  for (const field of ['level', 'craftsmanship', 'control', 'maxCp']) {
    finiteInteger(crafter[field], `${label}.crafter.${field}`, { minimum: 0 })
  }
  if (typeof crafter.cosmicToolGoodBonus !== 'boolean'
    || (crafter.specialist !== undefined && typeof crafter.specialist !== 'boolean')) {
    throw new Error(`${label}.crafter has invalid capability fields`)
  }
  return matrixContentFingerprint({
    id: profile.id,
    preparation: profile.preparation,
    specialistConsumableCost: profile.specialistConsumableCost,
    crafter: {
      level: crafter.level,
      craftsmanship: crafter.craftsmanship,
      control: crafter.control,
      maxCp: crafter.maxCp,
      cosmicToolGoodBonus: crafter.cosmicToolGoodBonus,
      specialist: crafter.specialist ?? false,
    },
  })
}

export function safeShardFileName(familyId, risk) {
  if (!/^[A-Za-z0-9._-]+$/.test(familyId)) {
    throw new Error(`family ID is not filename-safe: ${familyId}`)
  }
  if (!DEFAULT_RISKS.includes(risk)) throw new Error(`unsupported risk: ${risk}`)
  return `${familyId}--${risk}.json`
}

export function validateEvaluatorDescription(value) {
  const description = objectRecord(value, 'evaluator description')
  for (const field of [
    'matrixSchemaVersion',
    'pairedComparisonContractVersion',
    'catalogVersion',
    'mechanicsVersion',
    'policyVersion',
  ]) {
    if (typeof description[field] !== 'string' || description[field].length === 0) {
      throw new Error(`evaluator description.${field} must be a non-empty string`)
    }
  }
  finiteInteger(description.maxSeedsPerCell, 'evaluator description.maxSeedsPerCell', {
    minimum: 1,
  })
  if (!Array.isArray(description.equipmentIds) || description.equipmentIds.length < 1) {
    throw new Error('evaluator description must expose at least one equipment ID')
  }
  const equipmentIds = new Set()
  for (const [index, equipmentId] of description.equipmentIds.entries()) {
    if (typeof equipmentId !== 'string' || equipmentId.trim().length === 0) {
      throw new Error(`evaluator description.equipmentIds[${index}] must be a non-empty string`)
    }
    if (equipmentIds.has(equipmentId)) {
      throw new Error(`duplicate evaluator equipment ID: ${equipmentId}`)
    }
    equipmentIds.add(equipmentId)
  }
  if (!Array.isArray(description.worldIds)
    || canonicalJson(description.worldIds) !== canonicalJson(DEFAULT_WORLD_IDS)) {
    throw new Error('evaluator description world IDs do not match the overnight contract')
  }
  if (!Array.isArray(description.families) || description.families.length === 0) {
    throw new Error('evaluator description must expose at least one family')
  }
  const familyIds = new Set()
  for (const [index, rawFamily] of description.families.entries()) {
    const family = objectRecord(rawFamily, `evaluator description.families[${index}]`)
    if (typeof family.familyId !== 'string' || family.familyId.length === 0) {
      throw new Error(`evaluator description.families[${index}].familyId is invalid`)
    }
    finiteInteger(
      family.representativeRecipeId,
      `evaluator description.families[${index}].representativeRecipeId`,
      { minimum: 1 },
    )
    const scenarioPrefix = `${family.familyId}|objective:`
    if (typeof family.evaluationScenarioId !== 'string'
      || !family.evaluationScenarioId.startsWith(scenarioPrefix)
      || !isMatrixFingerprint(family.evaluationScenarioId.slice(scenarioPrefix.length))) {
      throw new Error(`evaluator description.families[${index}].evaluationScenarioId is invalid`)
    }
    if (familyIds.has(family.familyId)) throw new Error(`duplicate family: ${family.familyId}`)
    familyIds.add(family.familyId)
  }
  return description
}

export function buildShardPlan(descriptionValue, options) {
  const description = validateEvaluatorDescription(descriptionValue)
  if (options.seedCount > description.maxSeedsPerCell) {
    throw new Error(
      `--seed-count=${options.seedCount} exceeds evaluator cap ${description.maxSeedsPerCell}`,
    )
  }
  const families = options.familyLimit === null
    ? description.families
    : description.families.slice(0, options.familyLimit)
  if (options.familyLimit !== null && families.length !== options.familyLimit) {
    throw new Error(
      `--family-limit=${options.familyLimit} exceeds catalog family count ${description.families.length}`,
    )
  }
  return Object.freeze(families.flatMap((family, familyIndex) => (
    options.risks.map((risk) => Object.freeze({
      ordinal: familyIndex * options.risks.length + options.risks.indexOf(risk),
      familyId: family.familyId,
      representativeRecipeId: family.representativeRecipeId,
      risk,
      fileName: safeShardFileName(family.familyId, risk),
    }))
  )))
}

export function semanticConfigPayload(
  descriptionValue,
  options,
  shardPlan,
  baselineFiles,
  evaluatorBundleSha256,
  executionIdentity = null,
) {
  const description = validateEvaluatorDescription(descriptionValue)
  if (typeof evaluatorBundleSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(evaluatorBundleSha256)) {
    throw new Error('evaluator bundle SHA-256 must be a lowercase 64-character digest')
  }
  return Object.freeze({
    schemaVersion: OVERNIGHT_CONFIG_SCHEMA_VERSION,
    runnerVersion: OVERNIGHT_RUNNER_VERSION,
    evaluator: Object.freeze({
      matrixSchemaVersion: description.matrixSchemaVersion,
      pairedComparisonContractVersion: description.pairedComparisonContractVersion,
      catalogVersion: description.catalogVersion,
      mechanicsVersion: description.mechanicsVersion,
      policyVersion: description.policyVersion,
      bundleSha256: evaluatorBundleSha256,
      ...(executionIdentity === null ? {} : { execution: executionIdentity }),
    }),
    axes: Object.freeze({
      familyCount: new Set(shardPlan.map((shard) => shard.familyId)).size,
      families: Object.freeze(shardPlan
        .filter((_shard, index) => index % options.risks.length === 0)
        .map((shard) => Object.freeze({
          familyId: shard.familyId,
          representativeRecipeId: shard.representativeRecipeId,
        }))),
      risks: Object.freeze([...options.risks]),
      equipmentIds: Object.freeze([...description.equipmentIds]),
      worldIds: Object.freeze([...description.worldIds]),
      seedCountPerCell: options.seedCount,
      baseSeed: options.baseSeed,
      maxSteps: DEFAULT_MAX_STEPS,
    }),
    expectedEpisodesPerShard: description.equipmentIds.length
      * description.worldIds.length
      * options.seedCount,
    baseline: options.baselineDir === null
      ? null
      : Object.freeze({
          files: Object.freeze(baselineFiles.map((entry) => Object.freeze({
            fileName: entry.fileName,
            sha256: entry.sha256,
          }))),
        }),
  })
}

const ATOMIC_RENAME_RETRY_DELAYS_MS = Object.freeze([10, 25, 50, 100])
const TRANSIENT_RENAME_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EEXIST', 'EPERM'])

function sleepMilliseconds(milliseconds) {
  if (milliseconds <= 0) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

export function atomicWriteJson(filePath, value, options = {}) {
  const absolute = path.resolve(filePath)
  mkdirSync(path.dirname(absolute), { recursive: true })
  const temporary = path.join(
    path.dirname(absolute),
    `.${path.basename(absolute)}.${process.pid}.${Date.now()}.${process.hrtime.bigint()}.tmp`,
  )
  const rename = options.rename ?? renameSync
  const retryDelaysMs = options.retryDelaysMs ?? ATOMIC_RENAME_RETRY_DELAYS_MS
  const sleep = options.sleep ?? sleepMilliseconds
  if (!Array.isArray(retryDelaysMs)
    || retryDelaysMs.some((delay) => !Number.isSafeInteger(delay) || delay < 0)) {
    throw new Error('atomic rename retry delays must be non-negative integers')
  }
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    let retryIndex = 0
    while (true) {
      try {
        rename(temporary, absolute)
        return
      } catch (error) {
        const delay = retryDelaysMs[retryIndex]
        if (delay === undefined || !TRANSIENT_RENAME_ERROR_CODES.has(error?.code)) throw error
        retryIndex += 1
        sleep(delay)
      }
    }
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function readJson(filePath, label = filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function resolveBaselineShardPath(baselineDir, fileName) {
  const direct = path.resolve(baselineDir, fileName)
  const nested = path.resolve(baselineDir, 'shards', fileName)
  if (existsSync(nested)) return nested
  if (existsSync(direct)) return direct
  throw new Error(`baseline shard is missing: ${nested} (or ${direct})`)
}

function exactArray(actual, expected, label) {
  if (!Array.isArray(actual) || canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the expected ordered values`)
  }
}

export function summarizeComparisonRows(rows) {
  const candidate = rows.filter((row) => row.arm === 'candidate')
  const summarize = (selected) => {
    const objectiveUtilityTotal = selected.reduce(
      (sum, row) => sum + (
        Number.isFinite(row.completedObjectiveUtility) ? row.completedObjectiveUtility : 0
      ),
      0,
    )
    return Object.freeze({
      episodes: selected.length,
      completed: selected.filter((row) => row.terminal === 'completed').length,
      qualityTargetReached: selected.filter((row) => row.qualityTargetReached === true).length,
      policyNull: selected.filter((row) => row.stopReason === 'policy-null').length,
      actionLimit: selected.filter((row) => row.stopReason === 'action-limit').length,
      terminalFailed: selected.filter((row) => row.terminal === 'failed').length,
      illegalAction: selected.filter((row) => row.stopReason === 'illegal-action').length,
      objectiveUtilityTotal,
      objectiveUtilityMean: selected.length === 0 ? null : objectiveUtilityTotal / selected.length,
      recommendationCalls: selected.reduce(
        (sum, row) => sum + (Number.isFinite(row.recommendationCalls) ? row.recommendationCalls : 0),
        0,
      ),
    })
  }
  return Object.freeze({
    ...summarize(candidate),
    byCompletionContract: Object.freeze({
      'progress-only': summarize(candidate.filter(
        (row) => row.completionContract === 'progress-only',
      )),
      'progress-and-required-quality': summarize(candidate.filter(
        (row) => row.completionContract === 'progress-and-required-quality',
      )),
    }),
  })
}

export function validateEvaluatorReport(reportValue, expected, { baseline = false } = {}) {
  const report = objectRecord(reportValue, 'evaluator report')
  for (const [field, value] of [
    ['schemaVersion', expected.description.matrixSchemaVersion],
    ['catalogVersion', expected.description.catalogVersion],
    ['mechanicsVersion', expected.description.mechanicsVersion],
    ['policyVersion', expected.description.policyVersion],
  ]) {
    if (report[field] !== value) throw new Error(`evaluator report.${field} mismatch`)
  }
  if (typeof report.matrixId !== 'string' || report.matrixId.length === 0) {
    throw new Error('evaluator report.matrixId must be a non-empty string')
  }
  if (report.requestedRecipeId !== expected.shard.representativeRecipeId) {
    throw new Error('evaluator report requestedRecipeId mismatch')
  }
  if (report.mechanicsFamilyCount !== 1 || report.evaluationScenarioCount !== 1) {
    throw new Error('evaluator report must contain exactly one mechanics family')
  }
  if (!Array.isArray(report.evaluationScenarios) || report.evaluationScenarios.length !== 1) {
    throw new Error('evaluator report must expose exactly one evaluation scenario')
  }
  const expectedFamily = expected.description.families.find(
    (family) => family.familyId === expected.shard.familyId,
  )
  if (expectedFamily === undefined) throw new Error('expected shard family is absent from description')
  const scenarioPrefix = `${expectedFamily.familyId}|objective:`
  const expectedObjectiveUtilitySignature = expectedFamily.evaluationScenarioId.slice(
    scenarioPrefix.length,
  )
  const scenario = objectRecord(report.evaluationScenarios[0], 'evaluator report scenario')
  if (scenario.familyId !== expected.shard.familyId
    || scenario.representativeRecipeId !== expected.shard.representativeRecipeId
    || scenario.evaluationScenarioId !== expectedFamily.evaluationScenarioId
    || scenario.objectiveUtilitySignature !== expectedObjectiveUtilitySignature) {
    throw new Error('evaluator report scenario identity mismatch')
  }
  if (!Array.isArray(report.equipmentProfiles)) {
    throw new Error('evaluator report equipmentProfiles must be an array')
  }
  const equipmentProfiles = report.equipmentProfiles.map((profile, index) => (
    objectRecord(profile, `evaluator report.equipmentProfiles[${index}]`)
  ))
  exactArray(
    equipmentProfiles.map((profile) => profile.id),
    expected.description.equipmentIds,
    'evaluator report equipment profiles',
  )
  const equipmentFingerprints = new Map(equipmentProfiles.map((profile, index) => [
    profile.id,
    equipmentProfileFingerprint(profile, `evaluator report.equipmentProfiles[${index}]`),
  ]))
  if (!Array.isArray(report.conditionWorlds)) {
    throw new Error('evaluator report conditionWorlds must be an array')
  }
  const conditionWorlds = report.conditionWorlds.map((world, index) => (
    objectRecord(world, `evaluator report.conditionWorlds[${index}]`)
  ))
  exactArray(
    conditionWorlds.map((world) => world.id),
    expected.description.worldIds,
    'evaluator report condition worlds',
  )
  const worldRoles = new Map(conditionWorlds.map((world, index) => {
    if (typeof world.role !== 'string' || world.role.length === 0) {
      throw new Error(`evaluator report.conditionWorlds[${index}].role is invalid`)
    }
    return [world.id, world.role]
  }))
  if (report.seed?.baseSeed !== expected.baseSeed
    || report.seed?.seedCountPerCell !== expected.seedCount) {
    throw new Error('evaluator report seed contract mismatch')
  }
  const expectedEpisodes = expected.description.equipmentIds.length
    * expected.description.worldIds.length
    * expected.seedCount
  if (report.budget?.projectedEpisodes !== expectedEpisodes
    || report.budget?.completedEpisodes !== expectedEpisodes
    || report.budget?.bounded !== true) {
    throw new Error('evaluator report episode budget is incomplete')
  }
  if (!Array.isArray(report.arms) || report.arms.length !== 1
    || report.arms[0]?.id !== 'candidate'
    || report.arms[0]?.risk !== expected.shard.risk) {
    throw new Error('evaluator report must contain the requested candidate risk only')
  }
  const comparisonContract = objectRecord(
    report.comparisonContract,
    'evaluator report.comparisonContract',
  )
  if (comparisonContract.version !== expected.description.pairedComparisonContractVersion
    || comparisonContract.baseSeed !== expected.baseSeed
    || comparisonContract.maxStepsPerEpisode !== DEFAULT_MAX_STEPS
    || comparisonContract.caseCount !== expectedEpisodes
    || !isMatrixFingerprint(comparisonContract.caseSetFingerprint)) {
    throw new Error('evaluator report comparisonContract mismatch')
  }
  if (!Array.isArray(report.comparisonRows) || report.comparisonRows.length !== expectedEpisodes) {
    throw new Error('evaluator report comparison row count mismatch')
  }
  const caseIds = new Set()
  const cellIds = new Set()
  const pairedSeeds = new Set()
  const conditionWorldFingerprints = new Map()
  for (const [index, rawRow] of report.comparisonRows.entries()) {
    const row = objectRecord(rawRow, `evaluator report.comparisonRows[${index}]`)
    if (row.arm !== 'candidate'
      || row.risk !== expected.shard.risk
      || row.familyId !== expected.shard.familyId
      || row.recipeId !== expected.shard.representativeRecipeId
      || row.evaluationScenarioId !== expectedFamily.evaluationScenarioId
      || row.objectiveUtilitySignature !== expectedObjectiveUtilitySignature
      || !expected.description.equipmentIds.includes(row.equipmentId)
      || !expected.description.worldIds.includes(row.worldId)
      || row.worldRole !== worldRoles.get(row.worldId)
      || typeof row.caseId !== 'string'
      || row.caseId.length === 0) {
      throw new Error(`evaluator report.comparisonRows[${index}] axis mismatch`)
    }
    finiteInteger(row.seedIndex, `evaluator report.comparisonRows[${index}].seedIndex`, {
      maximum: expected.seedCount - 1,
    })
    if (row.baseSeed !== expected.baseSeed || row.maxSteps !== DEFAULT_MAX_STEPS) {
      throw new Error(`evaluator report.comparisonRows[${index}] seed/maxSteps mismatch`)
    }
    const pairedSeed = expectedPairedSeed(
      expected.description,
      row.familyId,
      row.equipmentId,
      row.worldId,
      row.seedIndex,
      expected.baseSeed,
    )
    if (row.pairedSeed !== pairedSeed) {
      throw new Error(`evaluator report.comparisonRows[${index}] pairedSeed mismatch`)
    }
    if (!isMatrixFingerprint(row.equipmentFingerprint)
      || row.equipmentFingerprint !== equipmentFingerprints.get(row.equipmentId)) {
      throw new Error(`evaluator report.comparisonRows[${index}] equipmentFingerprint mismatch`)
    }
    if (!isMatrixFingerprint(row.conditionWorldFingerprint)) {
      throw new Error(`evaluator report.comparisonRows[${index}] conditionWorldFingerprint is invalid`)
    }
    const priorWorldFingerprint = conditionWorldFingerprints.get(row.worldId)
    if (priorWorldFingerprint !== undefined && priorWorldFingerprint !== row.conditionWorldFingerprint) {
      throw new Error(`evaluator report world ${row.worldId} has inconsistent fingerprints`)
    }
    conditionWorldFingerprints.set(row.worldId, row.conditionWorldFingerprint)
    if (!['none', 'completed', 'failed'].includes(row.terminal)
      || typeof row.stopReason !== 'string' || row.stopReason.length === 0
      || typeof row.qualityTargetReached !== 'boolean'
      || !Number.isFinite(row.completedObjectiveUtility)
      || row.completedObjectiveUtility < 0
      || row.completedObjectiveUtility > 1) {
      throw new Error(`evaluator report.comparisonRows[${index}] outcome fields are invalid`)
    }
    finiteInteger(
      row.recommendationCalls,
      `evaluator report.comparisonRows[${index}].recommendationCalls`,
    )
    if (!['progress-only', 'progress-and-required-quality'].includes(row.completionContract)) {
      throw new Error(`evaluator report.comparisonRows[${index}].completionContract is invalid`)
    }
    const expectedCaseFingerprint = matrixContentFingerprint({
      comparisonContractVersion: expected.description.pairedComparisonContractVersion,
      evaluationScenarioId: row.evaluationScenarioId,
      objectiveUtilitySignature: row.objectiveUtilitySignature,
      recipeId: row.recipeId,
      equipmentId: row.equipmentId,
      equipmentFingerprint: row.equipmentFingerprint,
      worldId: row.worldId,
      conditionWorldFingerprint: row.conditionWorldFingerprint,
      baseSeed: row.baseSeed,
      seedIndex: row.seedIndex,
      maxSteps: row.maxSteps,
      pairedSeed: row.pairedSeed,
    })
    if (row.caseFingerprint !== expectedCaseFingerprint) {
      throw new Error(`evaluator report.comparisonRows[${index}] caseFingerprint mismatch`)
    }
    const expectedCaseId = [
      row.evaluationScenarioId,
      `recipe:${row.recipeId}`,
      `equipment:${row.equipmentId}@${row.equipmentFingerprint}`,
      `world:${row.worldId}@${row.conditionWorldFingerprint}`,
      `base-seed:${row.baseSeed}`,
      `sample:${row.seedIndex}`,
      `max-steps:${row.maxSteps}`,
      `case:${row.caseFingerprint}`,
    ].join('|')
    if (row.caseId !== expectedCaseId) {
      throw new Error(`evaluator report.comparisonRows[${index}] caseId mismatch`)
    }
    if (caseIds.has(row.caseId)) throw new Error('evaluator report has duplicate candidate case IDs')
    caseIds.add(row.caseId)
    const cellId = canonicalJson([row.equipmentId, row.worldId, row.seedIndex])
    if (cellIds.has(cellId)) {
      throw new Error('evaluator report has duplicate equipment/world/seed cells')
    }
    cellIds.add(cellId)
    if (pairedSeeds.has(row.pairedSeed)) {
      throw new Error('evaluator report has duplicate paired seeds')
    }
    pairedSeeds.add(row.pairedSeed)
  }
  for (const equipmentId of expected.description.equipmentIds) {
    for (const worldId of expected.description.worldIds) {
      for (let seedIndex = 0; seedIndex < expected.seedCount; seedIndex += 1) {
        const cellId = canonicalJson([equipmentId, worldId, seedIndex])
        if (!cellIds.has(cellId)) {
          throw new Error(`evaluator report is missing equipment/world/seed cell ${cellId}`)
        }
      }
    }
  }
  if (new Set(conditionWorldFingerprints.values()).size !== expected.description.worldIds.length) {
    throw new Error('evaluator report condition worlds do not have distinct fingerprints')
  }
  const expectedCaseSetFingerprint = matrixContentFingerprint(report.comparisonRows
    .map((row) => ({
      caseId: row.caseId,
      caseFingerprint: row.caseFingerprint,
      pairedSeed: row.pairedSeed,
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId)))
  if (comparisonContract.caseSetFingerprint !== expectedCaseSetFingerprint) {
    throw new Error('evaluator report comparisonContract caseSetFingerprint mismatch')
  }
  if (baseline) {
    const externalBaseline = objectRecord(
      report.externalBaseline,
      'evaluator report.externalBaseline',
    )
    if (report.comparisonKind !== 'solver-version-ab'
      || externalBaseline.exactCaseIdentityMatch !== true
      || externalBaseline.risk !== expected.shard.risk
      || externalBaseline.comparisonContractVersion
        !== expected.description.pairedComparisonContractVersion
      || externalBaseline.baseSeed !== expected.baseSeed
      || externalBaseline.caseSetFingerprint !== expectedCaseSetFingerprint
      || externalBaseline.candidatePolicyVersion !== report.policyVersion
      || typeof externalBaseline.policyVersion !== 'string'
      || externalBaseline.policyVersion.length === 0
      || typeof externalBaseline.matrixId !== 'string'
      || externalBaseline.matrixId.length === 0) {
      throw new Error('evaluator report external baseline pairing is incomplete')
    }
  } else if (report.comparisonKind !== 'candidate-only'
    || report.externalBaseline !== undefined) {
    throw new Error('evaluator report must be candidate-only without --baseline-dir')
  }
  return report
}

export function validateNativeEvaluatorReport(reportValue, expected) {
  const report = objectRecord(reportValue, 'native evaluator report')
  const identity = objectRecord(expected.executionIdentity, 'native execution identity')
  if (identity.engine !== 'rust-native-closed-loop'
    || report.schemaVersion !== 'native-generic-cosmic-paired-matrix-v1'
    || report.executionEngine !== identity.engine) {
    throw new Error('native evaluator engine/schema mismatch')
  }
  if (report.solvers?.baseline !== identity.baselineSolver
    || report.solvers?.candidate !== identity.candidateSolver
    || report.risk !== expected.shard.risk) {
    throw new Error('native evaluator solver/risk identity mismatch')
  }
  if (canonicalJson(report.binary?.handshake) !== canonicalJson(identity.binaryHandshake)) {
    throw new Error('native evaluator binary handshake mismatch')
  }
  const expectedEpisodes = expected.description.equipmentIds.length
    * expected.description.worldIds.length
    * expected.seedCount
  if (report.cases !== expectedEpisodes || report.episodes !== expectedEpisodes * 2) {
    throw new Error('native evaluator episode budget is incomplete')
  }
  if (!Array.isArray(report.rows) || report.rows.length !== expectedEpisodes * 2) {
    throw new Error('native evaluator rows are incomplete')
  }
  const caseArms = new Map()
  const axisPairs = new Map()
  for (const [index, rawRow] of report.rows.entries()) {
    const row = objectRecord(rawRow, `native evaluator rows[${index}]`)
    if (!['baseline', 'candidate'].includes(row.arm)
      || row.solverVersion !== (row.arm === 'baseline'
        ? identity.baselineSolver
        : identity.candidateSolver)
      || row.familyId !== expected.shard.familyId
      || row.recipeId !== expected.shard.representativeRecipeId
      || !expected.description.equipmentIds.includes(row.equipmentId)
      || !expected.description.worldIds.includes(row.worldId)
      || row.risk !== expected.shard.risk
      || typeof row.caseId !== 'string'
      || row.caseId.length === 0
      || !isMatrixFingerprint(row.caseFingerprint)) {
      throw new Error(`native evaluator rows[${index}] axis/identity mismatch`)
    }
    finiteInteger(row.seedIndex, `native evaluator rows[${index}].seedIndex`, {
      maximum: expected.seedCount - 1,
    })
    const pairedSeed = expectedPairedSeed(
      expected.description,
      row.familyId,
      row.equipmentId,
      row.worldId,
      row.seedIndex,
      expected.baseSeed,
    )
    if (row.pairedSeed !== pairedSeed
      || !['progress-only', 'progress-and-required-quality'].includes(row.completionContract)
      || !['none', 'completed', 'failed'].includes(row.terminal)
      || typeof row.stopReason !== 'string'
      || typeof row.qualityTargetReached !== 'boolean'
      || !Number.isFinite(row.completedObjectiveUtility)
      || row.completedObjectiveUtility < 0
      || row.completedObjectiveUtility > 1) {
      throw new Error(`native evaluator rows[${index}] outcome/seed mismatch`)
    }
    finiteInteger(row.recommendationCalls, `native evaluator rows[${index}].recommendationCalls`)
    const arms = caseArms.get(row.caseId) ?? new Set()
    if (arms.has(row.arm)) throw new Error(`duplicate native case arm: ${row.caseId}/${row.arm}`)
    arms.add(row.arm)
    caseArms.set(row.caseId, arms)
    const axisKey = canonicalJson([row.equipmentId, row.worldId, row.seedIndex])
    const axisPair = axisPairs.get(axisKey) ?? { caseId: row.caseId, arms: new Set() }
    if (axisPair.caseId !== row.caseId) {
      throw new Error(`native paired case axes disagree on case ID: ${axisKey}`)
    }
    if (axisPair.arms.has(row.arm)) {
      throw new Error(`duplicate native axis arm: ${axisKey}/${row.arm}`)
    }
    axisPair.arms.add(row.arm)
    axisPairs.set(axisKey, axisPair)
  }
  if (caseArms.size !== expectedEpisodes
    || [...caseArms.values()].some((arms) => arms.size !== 2)) {
    throw new Error('native evaluator does not contain exactly one paired row per arm/case')
  }
  for (const equipmentId of expected.description.equipmentIds) {
    for (const worldId of expected.description.worldIds) {
      for (let seedIndex = 0; seedIndex < expected.seedCount; seedIndex += 1) {
        const axisKey = canonicalJson([equipmentId, worldId, seedIndex])
        const pair = axisPairs.get(axisKey)
        if (pair === undefined || pair.arms.size !== 2) {
          throw new Error(`native evaluator is missing paired axis ${axisKey}`)
        }
      }
    }
  }
  if (axisPairs.size !== expectedEpisodes) {
    throw new Error('native evaluator has unexpected paired axes')
  }
  return report
}

export function validateCompletedShard(value, expected, options = {}) {
  const shard = objectRecord(value, options.label ?? 'overnight shard')
  if (shard.schemaVersion !== OVERNIGHT_SHARD_SCHEMA_VERSION || shard.status !== 'completed') {
    throw new Error('overnight shard is not a completed v1 shard')
  }
  if (shard.configFingerprint !== expected.configFingerprint
    || shard.evaluatorBundleSha256 !== expected.evaluatorBundleSha256
    || shard.runId !== expected.runId
    || shard.familyId !== expected.shard.familyId
    || shard.representativeRecipeId !== expected.shard.representativeRecipeId
    || shard.risk !== expected.shard.risk
    || shard.seedCountPerCell !== expected.seedCount
    || shard.baseSeed !== expected.baseSeed
    || shard.maxSteps !== DEFAULT_MAX_STEPS) {
    throw new Error('overnight shard identity/config mismatch')
  }
  const rawReport = objectRecord(shard.report, 'overnight shard report')
  if (typeof shard.reportFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(shard.reportFingerprint)
    || shard.reportFingerprint !== sha256Value(rawReport)) {
    throw new Error('overnight shard report fingerprint does not match report content')
  }
  const native = expected.executionIdentity?.engine === 'rust-native-closed-loop'
  const report = native
    ? validateNativeEvaluatorReport(rawReport, expected)
    : validateEvaluatorReport(rawReport, expected, {
        baseline: expected.baselineExpected,
      })
  const summary = summarizeComparisonRows(native ? report.rows : report.comparisonRows)
  if (canonicalJson(summary) !== canonicalJson(shard.summary)) {
    throw new Error('overnight shard summary does not match report rows')
  }
  return shard
}

export function validateBaselineShard(value, expected) {
  const shard = objectRecord(value, 'baseline overnight shard')
  if (shard.schemaVersion !== OVERNIGHT_SHARD_SCHEMA_VERSION || shard.status !== 'completed') {
    throw new Error('baseline shard is not complete')
  }
  if (shard.familyId !== expected.shard.familyId
    || shard.representativeRecipeId !== expected.shard.representativeRecipeId
    || shard.risk !== expected.shard.risk
    || shard.seedCountPerCell !== expected.seedCount
    || shard.baseSeed !== expected.baseSeed
    || shard.maxSteps !== DEFAULT_MAX_STEPS) {
    throw new Error('baseline shard axes do not match current shard')
  }
  if (typeof shard.evaluatorBundleSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(shard.evaluatorBundleSha256)) {
    throw new Error('baseline shard evaluator bundle SHA-256 is missing or invalid')
  }
  const report = objectRecord(shard.report, 'baseline evaluator report')
  if (typeof shard.reportFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(shard.reportFingerprint)
    || shard.reportFingerprint !== sha256Value(report)) {
    throw new Error('baseline shard report fingerprint does not match report content')
  }
  if (typeof report.policyVersion !== 'string' || report.policyVersion.length === 0) {
    throw new Error('baseline evaluator policyVersion is invalid')
  }
  const baselineDescription = {
    ...expected.description,
    policyVersion: report.policyVersion,
  }
  validateEvaluatorReport(report, {
    ...expected,
    description: baselineDescription,
  }, {
    baseline: report.comparisonKind === 'solver-version-ab',
  })
  return shard
}
