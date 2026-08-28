import { createHash } from 'node:crypto'
import { validateRecommendationTiming } from './timing.ts'

// Metadata shared by both arms; outcomes and timing deliberately are not keys.
const IDENTITY_FIELDS = [
  'caseId', 'caseFingerprint', 'familyId', 'recipeId', 'equipmentId', 'worldId',
  'worldRole', 'seedIndex', 'pairedSeed', 'risk', 'completionContract',
  'qualityMaximum', 'protectedQualityFloor', 'qualityUtilityKind',
  'qualityMilestones', 'hqChanceMilestones', 'protectedHqChanceFloorPercent',
] as const

function record(value: unknown): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('historical baseline must contain objects')
  }
  return value as Record<string, any>
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  return value
}

export function historicalSource(shardValue: unknown) {
  const shard = record(shardValue), report = record(shard.report)
  const digest = createHash('sha256').update(JSON.stringify(canonical(report))).digest('hex')
  if (shard.status !== 'completed' || shard.reportFingerprint !== digest
    || report.schemaVersion !== 'native-generic-cosmic-paired-matrix-v4'
    || report.binary?.handshake?.[0] !== 'native-generic-episode-batch-v7') {
    throw new Error('historical baseline is not an intact completed native v4 shard')
  }
  for (const value of [shard.configFingerprint, shard.evaluatorBundleSha256, report.binary?.sha256]) {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
      throw new Error('historical baseline provenance digest is invalid')
    }
  }
  if (typeof shard.runId !== 'string' || typeof report.solvers?.candidate !== 'string') {
    throw new Error('historical baseline source identity is missing')
  }
  return {
    runId: shard.runId as string,
    configFingerprint: shard.configFingerprint as string,
    evaluatorBundleSha256: shard.evaluatorBundleSha256 as string,
    reportFingerprint: shard.reportFingerprint as string,
    binarySha256: report.binary.sha256 as string,
    solverVersion: report.solvers.candidate as string,
    arm: 'candidate' as const,
  }
}

export function reuseHistoricalCandidate<T extends { caseId: string; arm: string; solverVersion: string }>(
  shardValue: unknown,
  expectedRows: readonly T[],
  comparisonContract: unknown,
  baselineSolver: string,
  currentHandshake: readonly string[],
): { rows: T[]; source: ReturnType<typeof historicalSource> } {
  const shard = record(shardValue), report = record(shard.report)
  const source = historicalSource(shard)
  if (source.solverVersion !== baselineSolver
    || JSON.stringify(canonical(report.comparisonContract)) !== JSON.stringify(canonical(comparisonContract))
    || report.binary.handshake[4] !== currentHandshake[4]
    || report.binary.handshake[5] !== currentHandshake[5]) {
    throw new Error('historical baseline solver, mechanics ABI or case-set mismatch')
  }
  if (!Array.isArray(report.rows)) throw new Error('historical baseline rows missing')
  const saved = report.rows.filter((row: any) => row.arm === 'candidate')
  const byId = new Map(saved.map((row: any) => [row.caseId, row]))
  if (saved.length !== expectedRows.length || byId.size !== expectedRows.length) {
    throw new Error('historical baseline has missing or duplicate cases')
  }
  const rows = expectedRows.map(expected => {
    const row = record(byId.get(expected.caseId)), metadata = record(expected)
    if (row.solverVersion !== baselineSolver || IDENTITY_FIELDS.some(key => (
      JSON.stringify(row[key]) !== JSON.stringify(metadata[key])
    ))) throw new Error(`historical baseline case identity mismatch: ${expected.caseId}`)
    validateRecommendationTiming(row as Parameters<typeof validateRecommendationTiming>[0])
    return { ...row, arm: 'baseline' } as T
  })
  return { rows, source }
}
