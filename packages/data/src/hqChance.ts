import type { SourceMetadata } from '@frozen-rabbit-expert/domain'

/**
 * Community implementation reference only. This is deliberately kept out of
 * mechanics transitions until the curve is cross-checked against current
 * in-game displayed HQ percentages or result traces.
 */
export const COMMUNITY_HQ_CHANCE_TABLE_SOURCE: SourceMetadata = {
  sourceKind: 'empirical',
  sourceUrl: 'https://jp.finalfantasyxiv.com/lodestone/character/24774053/blog/5413404?order=2',
  sourceRevision: 'lodestone-player-research-patch-7.4;cross-check:ffxiv-teamcraft-simulator-table',
  patch: '7.4',
  verifiedAt: '2026-08-12',
  confidence: 'provisional',
  notes: [
    'Current player research states that quality below 50% is linear from 1% to 15% HQ; 50% and above use this integer-percent table.',
    'The same table is cross-checked against Teamcraft community simulator behavior.',
    'This remains a community-derived generic HQ curve, not yet a Recipe 36208 in-game result oracle.',
  ],
}

export const COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT = [
  1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6,
  6, 7, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13,
  13, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 19, 19, 20, 20, 21,
  22, 23, 24, 26, 28, 31, 34, 38, 42, 47, 52, 58, 64, 68, 71, 74, 76, 78, 80, 81,
  82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94, 96, 98, 100,
] as const

export function estimateHqChancePercentFromCommunityTable(
  quality: number,
  qualityMax: number,
): number {
  if (!Number.isFinite(quality) || quality < 0) throw new RangeError('quality must be non-negative')
  if (!Number.isFinite(qualityMax) || qualityMax <= 0) throw new RangeError('qualityMax must be positive')
  const qualityPercent = Math.min(100, Math.floor(quality * 100 / qualityMax))
  if (qualityPercent < 50) return Math.floor(1 + qualityPercent * 14 / 50)
  return COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT[qualityPercent] ?? 100
}

/** NQ is 200 points and HQ is 800 points for Mobile Work Stairs. */
export function estimateMobileWorkStairsExpectedMissionPoints(quality: number, qualityMax: number): number {
  const hqChance = estimateHqChancePercentFromCommunityTable(quality, qualityMax) / 100
  return 200 + 600 * hqChance
}
