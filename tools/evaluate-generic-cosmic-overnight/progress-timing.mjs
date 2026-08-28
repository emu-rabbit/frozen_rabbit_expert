const nonnegative = (value) => Number.isFinite(value) && value >= 0
const timestamp = (value) => typeof value === 'string' ? Date.parse(value) : NaN

// Legacy manifests kept child durations, not a cumulative parent clock. Merge
// observed intervals: summing workers double-counts parallel work, while taking
// first-start to last-finish includes downtime between invocations.
export function restoreActiveTiming(previousManifest = null, completedTimings = []) {
  const saved = previousManifest?.timing
  if (nonnegative(saved?.activeWallClockMs)) {
    return {
      activeWallClockMs: saved.activeWallClockMs,
      historySource: saved.activeWallClockHistorySource ?? 'recorded',
    }
  }

  const intervals = []
  const addInterval = (start, end) => {
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      intervals.push([start, end])
    }
  }
  const invocationStart = timestamp(previousManifest?.invocationStartedAt)
  const checkpoint = timestamp(previousManifest?.updatedAt)
  const statusOnly = previousManifest?.operationalBudget?.statusOnly === true
    || previousManifest?.outcome?.startsWith('status-')
  if (!statusOnly) addInterval(invocationStart, checkpoint)

  for (const shard of previousManifest?.shards ?? []) {
    for (const attempt of shard.attempts ?? []) {
      const start = timestamp(attempt.startedAt)
      let end = timestamp(attempt.finishedAt)
      if (!Number.isFinite(end) && nonnegative(attempt.durationMs)) {
        end = start + attempt.durationMs
      }
      // A force-killed current attempt is known only up to the saved checkpoint.
      // An older unfinished attempt must never be extended across a later run.
      if (!Number.isFinite(end) && !statusOnly && start >= invocationStart) {
        end = checkpoint
      }
      addInterval(start, end)
    }
  }
  for (const timing of completedTimings) {
    // Raw recovery timestamps describe recovery, not actual computation.
    if (timing?.source === 'recovered-valid-raw-output') continue
    addInterval(timestamp(timing?.startedAt), timestamp(timing?.completedAt))
  }
  intervals.sort((left, right) => left[0] - right[0])
  let activeWallClockMs = 0
  let previousEnd = -Infinity
  for (const [start, end] of intervals) {
    activeWallClockMs += Math.max(0, end - Math.max(start, previousEnd))
    previousEnd = Math.max(previousEnd, end)
  }
  return {
    activeWallClockMs,
    // Legacy recovery omits any unrecorded work/setup; keep this visible even
    // after subsequent exact invocations and status-only calls.
    historySource: previousManifest !== null || completedTimings.length > 0
      ? 'legacy-intervals' : 'recorded',
  }
}

export function runProgressTiming({ priorTiming, invocationWallClockMs, statusOnly, summary }) {
  const currentInvocationWallClockMs = Math.max(0, invocationWallClockMs)
  const activeWallClockMs = priorTiming.activeWallClockMs
    + (statusOnly ? 0 : currentInvocationWallClockMs)
  const remainingShards = Math.max(0, summary.totalShards - summary.completed)
  const estimatedRemainingMs = remainingShards === 0
    ? 0
    : summary.completed > 0 && activeWallClockMs > 0
      ? activeWallClockMs / summary.completed * remainingShards
      : null
  return {
    currentInvocationWallClockMs,
    priorActiveWallClockMs: priorTiming.activeWallClockMs,
    activeWallClockMs,
    activeWallClockHistorySource: priorTiming.historySource,
    estimatedRemainingMs,
    etaBasis: 'cumulative-active-wall-clock-per-completed-shard',
  }
}
