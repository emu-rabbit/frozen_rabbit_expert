/** Community HQ curve indexed by floored quality percent. */
export const COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT = [
  1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6,
  6, 7, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13,
  13, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 19, 19, 20, 20, 21,
  22, 23, 24, 26, 28, 31, 34, 38, 42, 47, 52, 58, 64, 68, 71, 74, 76, 78, 80, 81,
  82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94, 96, 98, 100,
] as const

export function estimateHqChancePercent(
  quality: number,
  qualityMax: number,
): number {
  if (!Number.isFinite(quality) || quality < 0) throw new RangeError('quality must be non-negative')
  if (!Number.isFinite(qualityMax) || qualityMax <= 0) throw new RangeError('qualityMax must be positive')
  const qualityPercent = Math.min(100, Math.floor(quality * 100 / qualityMax))
  if (qualityPercent < 50) return Math.floor(1 + qualityPercent * 14 / 50)
  return COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT[qualityPercent] ?? 100
}

/**
 * Converts a player-facing HQ chance milestone back into the minimum raw
 * quality points that reach it on the versioned community curve.
 */
export function minimumQualityForHqChancePercent(
  hqChancePercent: number,
  qualityMax: number,
): number {
  if (!Number.isInteger(hqChancePercent) || hqChancePercent < 1 || hqChancePercent > 100) {
    throw new RangeError('hqChancePercent must be an integer between 1 and 100')
  }
  if (!Number.isFinite(qualityMax) || qualityMax <= 0) {
    throw new RangeError('qualityMax must be positive')
  }
  for (let qualityPercent = 0; qualityPercent <= 100; qualityPercent += 1) {
    if (estimateHqChancePercent(qualityPercent, 100) >= hqChancePercent) {
      return Math.ceil(qualityPercent * qualityMax / 100)
    }
  }
  return Math.ceil(qualityMax)
}
