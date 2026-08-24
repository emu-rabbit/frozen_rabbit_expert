import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { availableParallelism, hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_WORLD_IDS,
  OVERNIGHT_CONFIG_SCHEMA_VERSION,
  OVERNIGHT_MANIFEST_SCHEMA_VERSION,
  OVERNIGHT_RUNNER_VERSION,
  OVERNIGHT_SHARD_SCHEMA_VERSION,
  atomicWriteJson,
  buildShardPlan,
  canonicalJson,
  classifyIncompleteAttemptOutcome,
  parseOvernightCliOptions,
  readJson,
  resolveBaselineShardPath,
  semanticConfigPayload,
  sha256File,
  sha256Value,
  summarizeComparisonRows,
  validateBaselineShard,
  validateCompletedShard,
  validateEvaluatorDescription,
  validateEvaluatorReport,
} from './lib.mjs'

const toolDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(toolDirectory, '..', '..')
const options = parseOvernightCliOptions(process.argv.slice(2))

if (options.help) {
  process.stdout.write(`Generic Cosmic overnight evaluator\n\n${[
    'node tools/evaluate-generic-cosmic-overnight/run.mjs [options]',
    '',
    'Options use --key=value syntax:',
    '  --family-limit=N       First N deterministic mechanics families (default: all 50)',
    '  --risk=LIST            stable,balanced,aggressive, a subset, or all',
    '  --seed-count=N         Seeds per equipment/world cell (default: 64; evaluator cap applies)',
    '  --base-seed=N          uint32 common base seed (default: 20260824)',
    '  --time-budget=8.5h     Strict invocation budget; active shards stop at the deadline',
    '  --shard-timeout=30m    Kill and retry one stuck shard after this duration',
    '  --workers=auto         Parallel shards; auto=min(8,max(1,floor(logical threads/3)))',
    '  --retries=N            Retries after the first attempt (default: 2)',
    '  --output=PATH          Run-root parent (default: evaluation-runs/generic-cosmic-overnight)',
    '  --run-id=ID            Stable run directory; default derives from config fingerprint',
    '  --baseline-dir=PATH    Completed overnight run (or its shards directory) for paired A/B',
    '  --status-only          Validate/recover shards and rebuild manifest without starting work',
    '  --help                 Show this help',
  ].join('\n')}\n`)
  process.exit(0)
}

function bundle(entryPath, outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true })
  const result = spawnSync(process.execPath, [
    path.join(repositoryRoot, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
    entryPath,
    '--file', outputPath,
    '--format', 'esm',
    '--platform', 'node',
  ], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`failed to bundle ${path.relative(repositoryRoot, entryPath)}`)
  }
}

function loadEvaluatorDescription(evaluatorBundle) {
  const result = spawnSync(process.execPath, [evaluatorBundle, '--describe'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`evaluator description failed: ${result.stderr || `exit ${result.status}`}`)
  }
  try {
    return validateEvaluatorDescription(JSON.parse(result.stdout))
  } catch (error) {
    throw new Error(
      `invalid evaluator description: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function expectedShard(description, shard, configFingerprint, runId, baselineExpected) {
  return {
    description,
    shard,
    configFingerprint,
    runId,
    seedCount: options.seedCount,
    baseSeed: options.baseSeed,
    baselineExpected,
    evaluatorBundleSha256,
  }
}

function preflightBaselines(description, shardPlan) {
  if (options.baselineDir === null) return { entries: [], values: new Map() }
  const baselineRoot = path.resolve(repositoryRoot, options.baselineDir)
  const entries = []
  const values = new Map()
  const errors = []
  for (const shard of shardPlan) {
    try {
      const filePath = resolveBaselineShardPath(baselineRoot, shard.fileName)
      const value = readJson(filePath, `baseline shard ${shard.fileName}`)
      validateBaselineShard(value, {
        description,
        shard,
        seedCount: options.seedCount,
        baseSeed: options.baseSeed,
      })
      if (value.evaluatorBundleSha256 === evaluatorBundleSha256) {
        throw new Error(
          'baseline uses the same evaluator bundle; this is a determinism replay, not solver-version A/B',
        )
      }
      entries.push({ fileName: shard.fileName, filePath, sha256: sha256File(filePath) })
      values.set(shard.fileName, value)
    } catch (error) {
      errors.push(`${shard.fileName}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (errors.length > 0) {
    throw new Error(`baseline preflight failed for ${errors.length} shard(s):\n${errors.join('\n')}`)
  }
  return { entries, values }
}

function ensureImmutableConfig(runRoot, runId, configFingerprint, payload) {
  mkdirSync(runRoot, { recursive: true })
  const configPath = path.join(runRoot, 'config.json')
  if (existsSync(configPath)) {
    const existing = readJson(configPath, 'immutable overnight config')
    if (existing.schemaVersion !== OVERNIGHT_CONFIG_SCHEMA_VERSION
      || existing.runId !== runId
      || existing.configFingerprint !== configFingerprint
      || canonicalJson(existing.payload) !== canonicalJson(payload)) {
      throw new Error(
        `run-id ${runId} already exists with a different or invalid immutable config`,
      )
    }
    return configPath
  }
  const existingEntries = readdirSync(runRoot).filter(
    (entry) => entry !== '.runner-lock.json' && entry !== 'invalid',
  )
  if (existingEntries.length > 0) {
    throw new Error(
      `run directory ${runRoot} already contains artifacts but has no immutable config.json`,
    )
  }
  atomicWriteJson(configPath, {
    schemaVersion: OVERNIGHT_CONFIG_SCHEMA_VERSION,
    runId,
    configFingerprint,
    createdAt: new Date().toISOString(),
    payload,
  })
  return configPath
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

function renameResilient(source, destination) {
  const retryDelaysMs = [10, 25, 50, 100]
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(source, destination)
      return
    } catch (error) {
      const delay = retryDelaysMs[attempt]
      if (delay === undefined || !['EACCES', 'EBUSY', 'EEXIST', 'EPERM'].includes(error?.code)) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay)
    }
  }
}

function acquireRunLock(runRoot) {
  mkdirSync(runRoot, { recursive: true })
  const lockPath = path.join(runRoot, '.runner-lock.json')
  if (existsSync(lockPath)) {
    let owner = null
    try {
      owner = JSON.parse(readFileSync(lockPath, 'utf8'))
    } catch {
      const ageMs = Date.now() - statSync(lockPath).mtimeMs
      if (ageMs < 5_000) {
        throw new Error(`run lock is still being initialized: ${lockPath}`)
      }
    }
    if (typeof owner?.host === 'string' && owner.host !== hostname()) {
      throw new Error(
        `overnight run lock belongs to host ${owner.host}; refusing unsafe stale-lock recovery`,
      )
    }
    if (Number.isSafeInteger(owner?.pid) && processIsAlive(owner.pid)) {
      throw new Error(
        `another overnight runner (pid ${owner.pid}) already owns ${runRoot}`,
      )
    }
    const invalidDirectory = path.join(runRoot, 'invalid')
    mkdirSync(invalidDirectory, { recursive: true })
    renameResilient(
      lockPath,
      path.join(invalidDirectory, `stale-runner-lock.${Date.now()}.json`),
    )
  }

  const token = `${process.pid}-${Date.now()}`
  let descriptor
  try {
    descriptor = openSync(lockPath, 'wx')
    writeFileSync(descriptor, `${JSON.stringify({
      pid: process.pid,
      host: hostname(),
      token,
      startedAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8')
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor)
    throw new Error(
      `could not acquire exclusive overnight run lock ${lockPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  closeSync(descriptor)

  let released = false
  return () => {
    if (released) return
    released = true
    try {
      const owner = JSON.parse(readFileSync(lockPath, 'utf8'))
      if (owner.token === token) unlinkSync(lockPath)
    } catch {
      // A force-kill or external filesystem failure leaves a stale lock that
      // the next invocation will preserve under invalid/ before recovering.
    }
  }
}

function partialFileName(finalName) {
  return finalName.replace(/\.json$/, '.partial.json')
}

function invalidFileName(finalName) {
  return finalName.replace(/\.json$/, `.${Date.now()}.invalid.json`)
}

function promotePartial(partialPath, finalPath, invalidDirectory) {
  if (existsSync(finalPath)) {
    mkdirSync(invalidDirectory, { recursive: true })
    renameResilient(finalPath, path.join(invalidDirectory, invalidFileName(path.basename(finalPath))))
  }
  renameResilient(partialPath, finalPath)
}

function scanShardState(runRoot, description, shardPlan, configFingerprint, runId) {
  const shardDirectory = path.join(runRoot, 'shards')
  const invalidDirectory = path.join(runRoot, 'invalid')
  mkdirSync(shardDirectory, { recursive: true })
  const states = new Map()
  for (const shard of shardPlan) {
    const finalPath = path.join(shardDirectory, shard.fileName)
    const partialPath = path.join(shardDirectory, partialFileName(shard.fileName))
    const expected = expectedShard(
      description,
      shard,
      configFingerprint,
      runId,
      options.baselineDir !== null,
    )
    let finalError = null
    if (existsSync(finalPath)) {
      try {
        const value = readJson(finalPath, `shard ${shard.fileName}`)
        validateCompletedShard(value, expected)
        states.set(shard.fileName, {
          status: 'completed',
          source: 'final',
          summary: value.summary,
          timing: completedShardTiming(value),
          finalPath,
          partialPath,
        })
        continue
      } catch (error) {
        finalError = error instanceof Error ? error.message : String(error)
      }
    }
    if (existsSync(partialPath)) {
      try {
        const value = readJson(partialPath, `partial shard ${shard.fileName}`)
        validateCompletedShard(value, expected, { label: `partial shard ${shard.fileName}` })
        promotePartial(partialPath, finalPath, invalidDirectory)
        states.set(shard.fileName, {
          status: 'completed',
          source: 'recovered-complete-partial',
          summary: value.summary,
          timing: completedShardTiming(value),
          finalPath,
          partialPath,
        })
        continue
      } catch (error) {
        mkdirSync(invalidDirectory, { recursive: true })
        const rejectedPartialPath = path.join(
          invalidDirectory,
          invalidFileName(path.basename(partialPath)),
        )
        renameResilient(partialPath, rejectedPartialPath)
        states.set(shard.fileName, {
          status: 'pending',
          source: 'invalid-or-incomplete-partial-quarantined',
          validationError: [
            ...(finalError === null ? [] : [`final: ${finalError}`]),
            `partial: ${error instanceof Error ? error.message : String(error)}`,
            `preserved: ${rejectedPartialPath}`,
          ].join('; '),
          finalPath,
          partialPath,
        })
        continue
      }
    }
    states.set(shard.fileName, {
      status: 'pending',
      source: finalError === null ? 'missing' : 'invalid-final',
      ...(finalError === null ? {} : { validationError: finalError }),
      finalPath,
      partialPath,
    })
  }
  return states
}

function loadPriorAttempts(manifestPath, configFingerprint) {
  if (!existsSync(manifestPath)) return { attempts: new Map(), warning: null }
  try {
    const manifest = readJson(manifestPath, 'previous manifest')
    if (manifest.configFingerprint !== configFingerprint || !Array.isArray(manifest.shards)) {
      return { attempts: new Map(), warning: 'previous manifest did not match immutable config' }
    }
    return {
      attempts: new Map(manifest.shards.map((entry) => [
        entry.fileName,
        Array.isArray(entry.attempts) ? entry.attempts : [],
      ])),
      warning: null,
    }
  } catch (error) {
    return {
      attempts: new Map(),
      warning: `previous manifest was unreadable and was rebuilt: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function completedShardTiming(value) {
  const evaluatorWallClockMs = value?.report?.budget?.wallClockMs
  return {
    ...(typeof value?.startedAt === 'string' ? { startedAt: value.startedAt } : {}),
    ...(typeof value?.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    ...(Number.isFinite(evaluatorWallClockMs) && evaluatorWallClockMs >= 0
      ? { evaluatorWallClockMs }
      : {}),
  }
}

function durationStatistics(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right)
  if (sorted.length === 0) {
    return { count: 0, totalMs: 0, medianMs: null, p95Ms: null, maxMs: null }
  }
  const percentile = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1]
  return {
    count: sorted.length,
    totalMs: sorted.reduce((sum, value) => sum + value, 0),
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1),
  }
}

function manifestSummary(shards) {
  const counts = { completed: 0, running: 0, failed: 0, pending: 0 }
  let completedEpisodes = 0
  for (const shard of shards) {
    if (shard.status in counts) counts[shard.status] += 1
    if (shard.status === 'completed') completedEpisodes += shard.summary?.episodes ?? 0
  }
  return {
    totalShards: shards.length,
    ...counts,
    completedEpisodes,
  }
}

function buildManifest({
  runId,
  configFingerprint,
  configPath,
  shardPlan,
  states,
  priorAttempts,
  priorWarning,
  invocationStartedAt,
  diskPreflight,
  outcome,
}) {
  const updatedAt = new Date().toISOString()
  const shards = shardPlan.map((shard) => {
    const state = states.get(shard.fileName)
    return {
      ordinal: shard.ordinal,
      fileName: shard.fileName,
      familyId: shard.familyId,
      representativeRecipeId: shard.representativeRecipeId,
      risk: shard.risk,
      status: state.status,
      source: state.source,
      ...(state.summary === undefined ? {} : { summary: state.summary }),
      ...(state.timing === undefined ? {} : { timing: state.timing }),
      ...(state.validationError === undefined ? {} : { validationError: state.validationError }),
      ...(state.cleanupWarning === undefined ? {} : { cleanupWarning: state.cleanupWarning }),
      ...(state.workerSlot === undefined ? {} : { workerSlot: state.workerSlot }),
      ...(state.childPid === undefined ? {} : { childPid: state.childPid }),
      ...(state.activeAttemptNumber === undefined
        ? {}
        : { activeAttemptNumber: state.activeAttemptNumber }),
      attempts: state.attempts ?? priorAttempts.get(shard.fileName) ?? [],
    }
  })
  const allAttempts = shards.flatMap((shard) => shard.attempts)
  const currentAttempts = allAttempts.filter(
    (attempt) => typeof attempt.startedAt === 'string'
      && attempt.startedAt >= invocationStartedAt,
  )
  const evaluatorDurations = shards.flatMap(
    (shard) => Number.isFinite(shard.timing?.evaluatorWallClockMs)
      ? [shard.timing.evaluatorWallClockMs]
      : [],
  )
  return {
    schemaVersion: OVERNIGHT_MANIFEST_SCHEMA_VERSION,
    runnerVersion: OVERNIGHT_RUNNER_VERSION,
    runId,
    configFingerprint,
    configPath: path.relative(path.dirname(configPath), configPath) || 'config.json',
    invocationStartedAt,
    updatedAt,
    timing: {
      currentInvocationWallClockMs: Math.max(
        0,
        Date.parse(updatedAt) - Date.parse(invocationStartedAt),
      ),
      currentInvocationAttempts: durationStatistics(
        currentAttempts.map((attempt) => attempt.durationMs),
      ),
      allRecordedAttempts: durationStatistics(
        allAttempts.map((attempt) => attempt.durationMs),
      ),
      completedShardEvaluators: durationStatistics(evaluatorDurations),
      interpretation: 'Invocation wall clock is elapsed real time for this process. Attempt/evaluator totals sum parallel child work and can exceed wall clock; per-shard timing is in shards[].timing and shards[].attempts[].',
    },
    operationalBudget: {
      timeBudgetMs: options.timeBudgetMs,
      shardTimeoutMs: options.shardTimeoutMs,
      retriesAfterFirstAttempt: options.retries,
      workers: options.workers,
      workersRequested: options.workersRequested,
      availableParallelism: availableParallelism(),
      host: hostname(),
      node: process.version,
      statusOnly: options.statusOnly,
      latencyScope: 'throughput run with competing worker processes; not target-device UI latency',
    },
    diskPreflight,
    outcome,
    ...(priorWarning === null ? {} : { recoveryWarning: priorWarning }),
    summary: manifestSummary(shards),
    shards,
  }
}

function writeManifest(context, outcome) {
  const manifest = buildManifest({ ...context, outcome })
  atomicWriteJson(context.manifestPath, manifest)
  return manifest
}

function evaluatorArguments(shard, rawOutputPath, baselineReportPath, description) {
  const expectedEpisodes = description.equipmentIds.length
    * description.worldIds.length
    * options.seedCount
  return [
    '--preset=full',
    `--recipe=${shard.representativeRecipeId}`,
    '--equipment=all',
    `--world=${DEFAULT_WORLD_IDS.join(',')}`,
    `--seed-count=${options.seedCount}`,
    `--base-seed=${options.baseSeed}`,
    `--candidate-risk=${shard.risk}`,
    ...(baselineReportPath === null
      ? ['--no-baseline']
      : [`--baseline-report=${baselineReportPath}`]),
    `--max-steps=${DEFAULT_MAX_STEPS}`,
    `--max-episodes=${expectedEpisodes}`,
    '--compact',
    '--quiet',
    `--output=${rawOutputPath}`,
  ]
}

const activeChildren = new Set()
let shutdownRequested = false
let shutdownSignal = null
let receivedSignalCount = 0

function terminateChild(child, signal = 'SIGTERM') {
  try {
    child.kill(signal)
  } catch {
    // The child may have exited between the Set iteration and kill call.
  }
  const forceTimer = setTimeout(() => {
    if (activeChildren.has(child)) {
      try {
        child.kill('SIGKILL')
      } catch {
        // The close handler is the source of truth.
      }
    }
  }, 5_000)
  forceTimer.unref()
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    receivedSignalCount += 1
    if (receivedSignalCount > 1) {
      process.exit(signal === 'SIGINT' ? 130 : 143)
    }
    shutdownRequested = true
    shutdownSignal = signal
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    process.stderr.write(
      `[overnight] ${signal} received; stopping ${activeChildren.size} active shard(s) and preserving completed work\n`,
    )
    for (const child of activeChildren) terminateChild(child, signal)
  })
}

function runLoggedChild(executable, args, logPath, timeoutMs, onSpawn) {
  return new Promise((resolve) => {
    mkdirSync(path.dirname(logPath), { recursive: true })
    const log = createWriteStream(logPath, { flags: 'a' })
    let logError = null
    log.on('error', (error) => {
      logError = error
    })
    log.write(`\n[${new Date().toISOString()}] ${JSON.stringify([executable, ...args])}\n`)
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    activeChildren.add(child)
    onSpawn?.(child)
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk)
      if (logError === null) log.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk)
      if (logError === null) log.write(chunk)
    })
    let spawnError = null
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      if (logError === null) {
        log.write(`\n[${new Date().toISOString()}] child timeout after ${timeoutMs}ms\n`)
      }
      terminateChild(child)
    }, timeoutMs)
    timeout.unref()
    child.on('error', (error) => {
      spawnError = error
      if (logError === null) log.write(`\nspawn error: ${error.stack ?? error.message}\n`)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      activeChildren.delete(child)
      const result = {
        code,
        signal,
        spawnError,
        timedOut,
        logError,
        childPid: child.pid ?? null,
      }
      if (logError !== null || log.closed || log.destroyed) resolve(result)
      else log.end(() => resolve(result))
    })
  })
}

function diskSpacePreflight(runRoot, plannedEpisodes, hasBaseline) {
  const filesystem = statfsSync(runRoot)
  const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize)
  const bytesPerEpisode = hasBaseline ? 20_000 : 10_000
  const requiredFreeBytes = Math.max(512 * 1024 * 1024, plannedEpisodes * bytesPerEpisode)
  if (!Number.isFinite(freeBytes) || freeBytes < requiredFreeBytes) {
    throw new Error(
      `insufficient free disk space: need about ${requiredFreeBytes} bytes, found ${freeBytes}`,
    )
  }
  return {
    checkedAt: new Date().toISOString(),
    freeBytesAtStart: freeBytes,
    conservativeRequiredBytes: requiredFreeBytes,
    bytesPerPlannedEpisode: bytesPerEpisode,
  }
}

const invocationStartedAt = new Date().toISOString()
const invocationStartedMs = Date.now()
const invocationDeadlineMs = invocationStartedMs + options.timeBudgetMs
const evaluatorBundle = path.join(
  repositoryRoot,
  '.tmp',
  `generic-cosmic-overnight-evaluator-${process.pid}.mjs`,
)
bundle(
  path.join(repositoryRoot, 'tools', 'evaluate-generic-cosmic-families', 'index.ts'),
  evaluatorBundle,
)
const evaluatorBundleSha256 = sha256File(evaluatorBundle)
const description = loadEvaluatorDescription(evaluatorBundle)
const shardPlan = buildShardPlan(description, options)
const baselines = preflightBaselines(description, shardPlan)
const payload = semanticConfigPayload(
  description,
  options,
  shardPlan,
  baselines.entries,
  evaluatorBundleSha256,
)
const configFingerprint = sha256Value(payload)
const runId = options.runId ?? `run-${configFingerprint.slice(0, 16)}`
const outputRoot = path.resolve(repositoryRoot, options.outputRoot)
const runRoot = path.join(outputRoot, runId)
const releaseRunLock = acquireRunLock(runRoot)
process.once('exit', releaseRunLock)
const plannedEpisodes = shardPlan.length * payload.expectedEpisodesPerShard
const diskPreflight = diskSpacePreflight(runRoot, plannedEpisodes, options.baselineDir !== null)
const configPath = ensureImmutableConfig(runRoot, runId, configFingerprint, payload)
const manifestPath = path.join(runRoot, 'manifest.json')
const prior = loadPriorAttempts(manifestPath, configFingerprint)
const states = scanShardState(runRoot, description, shardPlan, configFingerprint, runId)
const context = {
  runId,
  configFingerprint,
  configPath,
  manifestPath,
  shardPlan,
  states,
  priorAttempts: prior.attempts,
  priorWarning: prior.warning,
  invocationStartedAt,
  diskPreflight,
}

let manifest = writeManifest(context, options.statusOnly ? 'status-only' : 'running')
const completedShardsAtInvocationStart = manifest.summary.completed
const formatDurationMs = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 'unknown'
  const totalSeconds = Math.round(durationMs / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
const progressLine = () => {
  const summary = manifest.summary
  const percent = summary.totalShards === 0
    ? 100
    : summary.completed / summary.totalShards * 100
  const elapsedMs = Math.max(0, Date.now() - invocationStartedMs)
  const completedThisInvocation = Math.max(
    0,
    summary.completed - completedShardsAtInvocationStart,
  )
  const remainingShards = summary.running + summary.pending
  const etaMs = remainingShards === 0
    ? 0
    : completedThisInvocation === 0
      ? null
      : elapsedMs / completedThisInvocation * remainingShards
  const eta = etaMs === null ? 'unknown' : `~${formatDurationMs(etaMs)}`
  return `${summary.completed}/${summary.totalShards} shards (${percent.toFixed(1)}%), ${summary.running} running, ${summary.failed} failed, ${summary.pending} pending, ${summary.completedEpisodes} episodes saved; elapsed ${formatDurationMs(elapsedMs)}, ETA ${eta}`
}
process.stdout.write(`[overnight] ${runId}: ${progressLine()}\n`)

const rawDirectory = path.join(runRoot, 'raw-partials')
const logDirectory = path.join(runRoot, 'logs')
const baselineReportDirectory = path.join(runRoot, 'baseline-reports')
if (!options.statusOnly) {
  mkdirSync(rawDirectory, { recursive: true })
  mkdirSync(logDirectory, { recursive: true })
  if (options.baselineDir !== null) mkdirSync(baselineReportDirectory, { recursive: true })
}

let budgetExhausted = false

function clearActiveState(state) {
  delete state.workerSlot
  delete state.childPid
  delete state.activeAttemptNumber
}

function completedShardValue(shard, report, {
  startedAt,
  evaluatorCommand,
}) {
  return {
    schemaVersion: OVERNIGHT_SHARD_SCHEMA_VERSION,
    status: 'completed',
    runnerVersion: OVERNIGHT_RUNNER_VERSION,
    configFingerprint,
    evaluatorBundleSha256,
    runId,
    ordinal: shard.ordinal,
    familyId: shard.familyId,
    representativeRecipeId: shard.representativeRecipeId,
    risk: shard.risk,
    seedCountPerCell: options.seedCount,
    baseSeed: options.baseSeed,
    maxSteps: DEFAULT_MAX_STEPS,
    startedAt,
    completedAt: new Date().toISOString(),
    evaluatorCommand,
    summary: summarizeComparisonRows(report.comparisonRows),
    reportFingerprint: sha256Value(report),
    report,
  }
}

function persistCompletedShard(state, shard, report, metadata, source) {
  const expected = expectedShard(
    description,
    shard,
    configFingerprint,
    runId,
    options.baselineDir !== null,
  )
  const completedValue = completedShardValue(shard, report, metadata)
  atomicWriteJson(state.partialPath, completedValue)
  const reread = readJson(state.partialPath, `completed partial ${shard.fileName}`)
  validateCompletedShard(reread, expected)
  promotePartial(state.partialPath, state.finalPath, path.join(runRoot, 'invalid'))
  state.status = 'completed'
  state.source = source
  state.summary = completedValue.summary
  state.timing = completedShardTiming(completedValue)
  delete state.validationError
  clearActiveState(state)
  return completedValue
}

function recoverCompletedRawOutputs() {
  if (!existsSync(rawDirectory)) return
  const rawNames = readdirSync(rawDirectory)
  for (const shard of shardPlan) {
    const state = states.get(shard.fileName)
    if (state.status === 'completed') continue
    const prefix = shard.fileName.replace(/\.json$/, '.attempt-')
    const candidates = rawNames
      .filter((name) => name.startsWith(prefix) && name.endsWith('.raw.partial.json'))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    for (const name of candidates) {
      const rawPath = path.join(rawDirectory, name)
      try {
        const report = readJson(rawPath, `recoverable raw evaluator output ${name}`)
        const expected = expectedShard(
          description,
          shard,
          configFingerprint,
          runId,
          options.baselineDir !== null,
        )
        validateEvaluatorReport(report, expected, { baseline: options.baselineDir !== null })
        persistCompletedShard(state, shard, report, {
          startedAt: statSync(rawPath).mtime.toISOString(),
          evaluatorCommand: null,
        }, 'recovered-valid-raw-output')
        try {
          unlinkSync(rawPath)
        } catch {
          // The validated final is already durable; duplicate cleanup is best effort.
        }
        break
      } catch (error) {
        state.validationError = `raw recovery rejected ${name}: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}

recoverCompletedRawOutputs()
manifest = writeManifest(context, options.statusOnly ? 'status-only' : 'running')

if (options.statusOnly) {
  const complete = manifest.summary.completed === manifest.summary.totalShards
  manifest = writeManifest(context, complete ? 'status-complete' : 'status-incomplete')
  process.stdout.write(`[overnight] status-only: ${progressLine()}\n`)
  process.stdout.write(`[overnight] manifest: ${manifestPath}\n`)
  process.exit(complete ? 0 : 75)
}

async function executeShard(shard, workerSlot) {
  const state = states.get(shard.fileName)
  if (state.status === 'completed') return
  const attempts = [...(state.attempts ?? prior.attempts.get(shard.fileName) ?? [])]
  state.attempts = attempts
  state.status = 'running'
  state.source = 'child-process'
  state.workerSlot = workerSlot
  manifest = writeManifest(context, 'running')

  for (let retryIndex = 0; retryIndex <= options.retries; retryIndex += 1) {
    if (shutdownRequested) {
      state.status = 'pending'
      state.source = 'interrupted-before-attempt'
      clearActiveState(state)
      manifest = writeManifest(context, 'interrupted')
      return
    }
    const remainingBudgetMs = invocationDeadlineMs - Date.now()
    if (remainingBudgetMs <= 0) {
      budgetExhausted = true
      state.status = 'pending'
      state.source = 'budget-exhausted-before-attempt'
      clearActiveState(state)
      manifest = writeManifest(context, 'budget-exhausted')
      return
    }

    const attemptNumber = attempts.length + 1
    const attemptStartedAt = new Date().toISOString()
    const attemptStartedMs = Date.now()
    const rawOutputPath = path.join(
      rawDirectory,
      shard.fileName.replace(/\.json$/, `.attempt-${attemptNumber}.raw.partial.json`),
    )
    const logPath = path.join(
      logDirectory,
      shard.fileName.replace(/\.json$/, `.attempt-${attemptNumber}.log`),
    )
    let baselineReportPath = null
    if (options.baselineDir !== null) {
      baselineReportPath = path.join(baselineReportDirectory, shard.fileName)
      atomicWriteJson(baselineReportPath, baselines.values.get(shard.fileName).report)
    }
    const evaluatorArgs = evaluatorArguments(
      shard,
      rawOutputPath,
      baselineReportPath,
      description,
    )
    const attempt = {
      attemptNumber,
      retryIndex,
      workerSlot,
      startedAt: attemptStartedAt,
      logPath: path.relative(runRoot, logPath),
      outcome: 'running',
    }
    attempts.push(attempt)
    state.activeAttemptNumber = attemptNumber
    manifest = writeManifest(context, 'running')
    process.stdout.write(
      `[overnight] worker ${workerSlot}: shard ${shard.ordinal + 1}/${shardPlan.length} ${shard.familyId} ${shard.risk}, attempt ${retryIndex + 1}/${options.retries + 1}\n`,
    )

    const childTimeoutMs = Math.max(
      1,
      Math.min(options.shardTimeoutMs, invocationDeadlineMs - Date.now()),
    )
    const timeoutIsGlobalDeadline = childTimeoutMs < options.shardTimeoutMs
    const childResult = await runLoggedChild(
      process.execPath,
      [evaluatorBundle, ...evaluatorArgs],
      logPath,
      childTimeoutMs,
      (child) => {
        state.childPid = child.pid ?? null
      },
    )
    attempt.finishedAt = new Date().toISOString()
    attempt.durationMs = Date.now() - attemptStartedMs
    attempt.exitCode = childResult.code
    attempt.signal = childResult.signal
    attempt.childPid = childResult.childPid
    attempt.timedOut = childResult.timedOut

    let report = null
    let reportError = null
    const expected = expectedShard(
      description,
      shard,
      configFingerprint,
      runId,
      options.baselineDir !== null,
    )
    if (existsSync(rawOutputPath)) {
      try {
        report = readJson(rawOutputPath, `raw evaluator output for ${shard.fileName}`)
        validateEvaluatorReport(report, expected, { baseline: options.baselineDir !== null })
      } catch (error) {
        report = null
        reportError = error instanceof Error ? error.message : String(error)
      }
    } else {
      reportError = 'evaluator did not produce a raw report'
    }

    let attemptError = null
    if (report !== null) {
      const source = childResult.code === 0 && !childResult.timedOut
        ? 'new-final'
        : 'recovered-valid-final-output'
      persistCompletedShard(state, shard, report, {
        startedAt: attemptStartedAt,
        evaluatorCommand: [process.execPath, evaluatorBundle, ...evaluatorArgs],
      }, source)
      attempt.outcome = source === 'new-final' ? 'completed' : 'completed-from-valid-output'
      try {
        unlinkSync(rawOutputPath)
      } catch (error) {
        state.cleanupWarning = `could not remove duplicate raw output: ${error instanceof Error ? error.message : String(error)}`
      }
      manifest = writeManifest(context, 'running')
      process.stdout.write(`[overnight] ${progressLine()}\n`)
      return
    }

    if (childResult.spawnError !== null) attemptError = childResult.spawnError.message
    else if (childResult.logError !== null) attemptError = `log write failed: ${childResult.logError.message}`
    else if (childResult.timedOut) {
      attemptError = timeoutIsGlobalDeadline
        ? 'invocation time budget expired while evaluator was running'
        : `evaluator exceeded shard timeout ${options.shardTimeoutMs}ms`
    } else if (childResult.code !== 0) {
      attemptError = `evaluator exited with code ${childResult.code} signal ${childResult.signal ?? 'none'}`
    } else attemptError = reportError

    attempt.outcome = classifyIncompleteAttemptOutcome({
      shutdownRequested,
      timedOut: childResult.timedOut,
      timeoutIsGlobalDeadline,
    })
    attempt.error = attemptError
    state.validationError = reportError === null
      ? attemptError
      : `${attemptError}; report: ${reportError}`

    if (shutdownRequested) {
      state.status = 'pending'
      state.source = 'interrupted'
      clearActiveState(state)
      manifest = writeManifest(context, 'interrupted')
      return
    }
    if (childResult.timedOut && timeoutIsGlobalDeadline) {
      budgetExhausted = true
      state.status = 'pending'
      state.source = 'budget-exhausted-during-attempt'
      clearActiveState(state)
      manifest = writeManifest(context, 'budget-exhausted')
      return
    }
    if (retryIndex < options.retries) {
      state.status = 'running'
      state.source = 'retrying-after-failure'
      manifest = writeManifest(context, 'retrying')
      continue
    }

    state.status = 'failed'
    state.source = 'retry-limit-exhausted'
    clearActiveState(state)
    manifest = writeManifest(context, 'running-with-failures')
    process.stdout.write(`[overnight] ${progressLine()}\n`)
    return
  }
}

const pendingShards = shardPlan.filter(
  (shard) => states.get(shard.fileName).status !== 'completed',
)
let nextShardIndex = 0
function takeNextShard() {
  if (shutdownRequested || budgetExhausted) return null
  if (Date.now() >= invocationDeadlineMs) {
    budgetExhausted = true
    return null
  }
  const shard = pendingShards[nextShardIndex]
  if (shard === undefined) return null
  nextShardIndex += 1
  return shard
}

const workerCount = Math.min(options.workers, Math.max(1, pendingShards.length))
await Promise.all(Array.from({ length: workerCount }, async (_unused, index) => {
  const workerSlot = index + 1
  while (!shutdownRequested && !budgetExhausted) {
    const shard = takeNextShard()
    if (shard === null) return
    await executeShard(shard, workerSlot)
  }
}))

const remaining = [...states.values()].filter((state) => state.status !== 'completed')
const finalOutcome = shutdownRequested
  ? 'interrupted'
  : remaining.length === 0
    ? 'completed'
    : budgetExhausted ? 'budget-exhausted' : 'completed-with-failures'
manifest = writeManifest(context, finalOutcome)
process.stdout.write(`[overnight] ${finalOutcome}: ${progressLine()}\n`)
process.stdout.write(`[overnight] manifest: ${manifestPath}\n`)
if (shutdownRequested) process.exitCode = shutdownSignal === 'SIGINT' ? 130 : 143
else if (finalOutcome === 'budget-exhausted') process.exitCode = 75
else if (finalOutcome === 'completed-with-failures') process.exitCode = 1
