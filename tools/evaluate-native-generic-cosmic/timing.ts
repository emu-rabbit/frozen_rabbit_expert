/** Per-call wall time around recommendation only; samples retain call order. */
export interface RecommendationTiming {
  recommendationCalls: number
  recommendationNs: number
  recommendationMaxNs: number
  recommendationDurationsNs?: readonly number[]
}

export function parseRecommendationDurations(value: string): readonly number[] {
  if (value === '-') return []
  if (!/^\d+(,\d+)*$/u.test(value)) throw new Error('invalid recommendation timing sample encoding')
  return value.split(',').map(Number)
}

export function validateRecommendationTiming(row: RecommendationTiming): void {
  const samples = row.recommendationDurationsNs
  const integer = (value: number) => Number.isSafeInteger(value) && value >= 0
  if (!integer(row.recommendationCalls) || !integer(row.recommendationNs)
    || !integer(row.recommendationMaxNs) || !Array.isArray(samples)
    || samples.length !== row.recommendationCalls || !samples.every(integer)) {
    throw new Error('recommendation timing samples/count must be nonnegative safe integers')
  }
  if (samples.reduce((sum, value) => sum + value, 0) !== row.recommendationNs
    || samples.reduce((maximum, value) => Math.max(maximum, value), 0) !== row.recommendationMaxNs) {
    throw new Error('recommendation timing samples disagree with total/maximum')
  }
}

/** Pool raw calls, never episode percentiles. Legacy reports stay unknown. */
export function recommendationLatency(rows: readonly RecommendationTiming[]) {
  if (rows.some((row) => row.recommendationDurationsNs === undefined)) return null
  const samples = rows.flatMap((row) => [...row.recommendationDurationsNs!]).sort((a, b) => a - b)
  const rank = (fraction: number) => samples[Math.ceil(samples.length * fraction) - 1] ?? null
  return {
    unit: 'ns',
    percentileMethod: 'nearest-rank',
    count: samples.length,
    p50: rank(0.5),
    p95: rank(0.95),
    p99: rank(0.99),
    maximum: samples.at(-1) ?? null,
    mean: samples.length === 0 ? null : samples.reduce((sum, value) => sum + value, 0) / samples.length,
  }
}
