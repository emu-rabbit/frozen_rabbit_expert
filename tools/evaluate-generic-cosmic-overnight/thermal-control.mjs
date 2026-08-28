import { readFileSync, statSync } from 'node:fs'

export const THERMAL_POLICY = Object.freeze({
  version: 'overnight-thermal-v1',
  windowMs: 300_000,
  hotCelsius: 90,
  hotBudgetMs: 60_000,
  stopCelsius: 93,
  decreaseCelsius: 90,
  decreaseHoldMs: 20_000,
  increaseBelowCelsius: 82,
  increaseHoldMs: 120_000,
  increaseCooldownMs: 60_000,
  staleMs: 10_000,
  startupSamples: 3,
  startupTimeoutMs: 30_000,
})

// All running durations use a monotonic clock. Wall time is only used to age
// persisted hot intervals across invocations; downtime itself is never hot time.
export class ThermalController {
  constructor({ maxWorkers, initialWorkers = maxWorkers, windowMs = THERMAL_POLICY.windowMs, now = 0,
    wallNow = Date.now(), previous = null }) {
    if (!Number.isInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 64
      || !Number.isInteger(initialWorkers) || initialWorkers < 1 || initialWorkers > maxWorkers
      || !Number.isInteger(windowMs) || windowMs < 60_000 || windowMs > 3_600_000) {
      throw new Error('thermal controls require 1..64 workers and a 1m..1h window')
    }
    this.policy = { ...THERMAL_POLICY, windowMs }
    this.maxWorkers = maxWorkers
    this.targetWorkers = initialWorkers
    this.startedAt = now
    this.lastTick = now
    this.lastFreshAt = null
    this.temperatureCelsius = null
    this.coldSince = null
    this.hotSince = null
    this.lastChangeAt = now
    this.startupCount = 0
    this.ready = false
    this.stopReason = null
    this.intervals = []
    this.events = []
    if (previous?.version === THERMAL_POLICY.version && Array.isArray(previous.hotIntervals)) {
      const downtime = wallNow - Date.parse(previous.recordedAt)
      if (!Number.isFinite(downtime) || downtime < -1_000) {
        this.stop('thermal-history-clock-invalid', now)
      } else {
        for (const interval of previous.hotIntervals) {
          if (!Number.isFinite(interval.startAgeMs) || !Number.isFinite(interval.endAgeMs)
            || interval.startAgeMs < interval.endAgeMs || interval.endAgeMs < 0) {
            this.stop('thermal-history-invalid', now)
            break
          }
          const start = now - Math.max(0, downtime) - interval.startAgeMs
          const end = now - Math.max(0, downtime) - interval.endAgeMs
          if (end > now - windowMs) this.intervals.push([Math.max(start, now - windowMs), end])
        }
      }
    }
  }

  stop(reason, now) {
    if (this.stopReason !== null) return
    this.stopReason = reason
    this.events.push({ type: 'stop', reason, at: now, temperatureCelsius: this.temperatureCelsius })
  }

  hotMs(now) {
    return this.intervals.reduce((total, [start, end]) =>
      total + Math.max(0, Math.min(now, end) - Math.max(start, now - this.policy.windowMs)), 0)
  }

  tick(now) {
    if (this.stopReason !== null) return
    if (now < this.lastTick) return this.stop('thermal-clock-invalid', now)
    if (this.lastFreshAt !== null && now - this.lastFreshAt >= this.policy.staleMs) {
      return this.stop('temperature-stale', now)
    }
    if (this.lastFreshAt === null && now - this.startedAt >= this.policy.staleMs) {
      return this.stop('temperature-unavailable', now)
    }
    if (this.temperatureCelsius >= this.policy.hotCelsius && now > this.lastTick) {
      const last = this.intervals.at(-1)
      if (last?.[1] === this.lastTick) last[1] = now
      else this.intervals.push([this.lastTick, now])
    }
    this.lastTick = now
    this.intervals = this.intervals.filter(([, end]) => end > now - this.policy.windowMs)
    if (this.hotMs(now) >= this.policy.hotBudgetMs) return this.stop('temperature-window-budget', now)
    if (!this.ready && now - this.startedAt >= this.policy.startupTimeoutMs) {
      this.stop('temperature-startup-not-cool', now)
    }
  }

  observe(temperatureCelsius, now, ageMs = 0, canIncrease = true) {
    this.tick(now)
    if (this.stopReason !== null) return
    if (!Number.isFinite(temperatureCelsius) || temperatureCelsius <= 0 || temperatureCelsius >= 150
      || !Number.isFinite(ageMs) || ageMs < 0 || ageMs >= this.policy.staleMs) {
      return this.stop('temperature-invalid', now)
    }
    this.lastFreshAt = now - ageMs
    this.temperatureCelsius = temperatureCelsius
    if (temperatureCelsius >= this.policy.stopCelsius) return this.stop('temperature-critical', now)
    if (!this.ready) {
      this.startupCount = temperatureCelsius < this.policy.decreaseCelsius ? this.startupCount + 1 : 0
      if (this.startupCount < this.policy.startupSamples) return
      this.ready = true
      this.lastChangeAt = now
      this.events.push({ type: 'ready', at: now, targetWorkers: this.targetWorkers })
    }
    this.coldSince = temperatureCelsius < this.policy.increaseBelowCelsius && canIncrease
      ? this.coldSince ?? now : null
    const hot = temperatureCelsius >= this.policy.hotCelsius
    this.hotSince = hot ? this.hotSince ?? now : null
    if (this.hotSince !== null && this.targetWorkers > 1
      && now - this.hotSince >= this.policy.decreaseHoldMs) {
      this.change(-1, 'temperature-hot', now)
      // Observe a fresh sustained interval after each reduction before shedding again.
      this.hotSince = now
    } else if (this.coldSince !== null && this.targetWorkers < this.maxWorkers
      && now - this.coldSince >= this.policy.increaseHoldMs
      && now - this.lastChangeAt >= this.policy.increaseCooldownMs) {
      this.change(1, 'temperature-cool', now)
    }
  }

  change(delta, reason, now) {
    const previousWorkers = this.targetWorkers
    this.targetWorkers += delta
    this.lastChangeAt = now
    this.coldSince = null
    this.events.push({ type: 'workers', reason, at: now, previousWorkers,
      targetWorkers: this.targetWorkers, temperatureCelsius: this.temperatureCelsius })
  }

  drainEvents() {
    return this.events.splice(0)
  }

  snapshot(now, wallNow = Date.now()) {
    return {
      version: this.policy.version, policy: this.policy, recordedAt: new Date(wallNow).toISOString(),
      maxWorkers: this.maxWorkers, targetWorkers: this.targetWorkers, ready: this.ready,
      temperatureCelsius: this.temperatureCelsius,
      sampleAgeMs: this.lastFreshAt === null ? null : now - this.lastFreshAt,
      hotWindowMs: this.hotMs(now), stopReason: this.stopReason,
      hotIntervals: this.intervals.map(([start, end]) => ({ startAgeMs: now - start, endAgeMs: now - end })),
    }
  }
}

// A changed mtime is not freshness: require a new sequence and advancing capture
// time. Re-reading the same snapshot must never reset the monotonic stale timer.
export class TemperatureFileReader {
  constructor(filePath) {
    this.filePath = filePath
    this.previous = null
  }

  read(wallNow = Date.now()) {
    let raw
    try {
      if (statSync(this.filePath).size > 16_384) throw new Error('temperature snapshot too large')
      raw = JSON.parse(readFileSync(this.filePath, 'utf8').replace(/^\uFEFF/, ''))
    } catch (error) {
      if (['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) return null
      throw error
    }
    if (raw.schemaVersion !== 'overnight-temperature-v1' || raw.provider !== 'amd-ryzen-master-sdk'
      || raw.sensor !== 'PMTable.dTemperature' || raw.unit !== 'Celsius'
      || typeof raw.sessionId !== 'string' || raw.sessionId.length === 0
      || !Number.isSafeInteger(raw.sequence) || raw.sequence < 1 || raw.status !== 'ok') {
      throw new Error(`temperature reader invalid/unavailable: ${raw.error ?? raw.status ?? 'bad schema'}`)
    }
    const startedMs = Date.parse(raw.startedAt)
    const observedMs = Date.parse(raw.observedAt)
    if (!Number.isFinite(startedMs) || !Number.isFinite(observedMs)
      || observedMs < startedMs || observedMs - startedMs > 3_500
      || observedMs > wallNow + 1_000 || startedMs > wallNow + 1_000
      || !Number.isFinite(raw.temperatureCelsius) || raw.temperatureCelsius <= 0 || raw.temperatureCelsius >= 150) {
      throw new Error('invalid temperature sample time/value')
    }
    const identity = `${raw.sessionId}:${raw.sequence}`
    if (this.previous !== null) {
      if (raw.sessionId !== this.previous.sessionId) throw new Error('temperature reader restarted; resume manually')
      if (identity === this.previous.identity) {
        if (JSON.stringify(raw) !== this.previous.json) throw new Error('temperature sample mutated without new sequence')
        return null
      }
      if (raw.sequence <= this.previous.sequence || startedMs <= this.previous.startedMs) {
        throw new Error('temperature sample did not advance')
      }
    }
    const ageMs = Math.max(0, wallNow - startedMs)
    if (ageMs >= THERMAL_POLICY.staleMs) throw new Error('temperature snapshot is stale')
    this.previous = { identity, sessionId: raw.sessionId, sequence: raw.sequence, startedMs, json: JSON.stringify(raw) }
    return { ...raw, ageMs }
  }
}
