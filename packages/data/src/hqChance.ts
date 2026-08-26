import {
  estimateHqChancePercent,
  type SourceMetadata,
} from '@frozen-rabbit-expert/domain'

export {
  COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT,
  estimateHqChancePercent as estimateHqChancePercentFromCommunityTable,
} from '@frozen-rabbit-expert/domain'

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

/** NQ is 200 points and HQ is 800 points for Mobile Work Stairs. */
export function estimateMobileWorkStairsExpectedMissionPoints(quality: number, qualityMax: number): number {
  const hqChance = estimateHqChancePercent(quality, qualityMax) / 100
  return 200 + 600 * hqChance
}
