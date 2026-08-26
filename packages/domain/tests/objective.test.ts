import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  assertCraftObjective,
  minimumQualityForHqChancePercent,
  type CraftObjective,
} from '../src'

describe('craft objective runtime contract', () => {
  it('maps HQ chance milestones back to their minimum raw quality', () => {
    expect(minimumQualityForHqChancePercent(50, 22_500)).toBe(17_100)
    expect(minimumQualityForHqChancePercent(75, 22_500)).toBe(18_450)
    expect(minimumQualityForHqChancePercent(100, 22_500)).toBe(22_500)
    expect(() => minimumQualityForHqChancePercent(0, 22_500)).toThrow(/hqChancePercent/)
  })

  it('accepts both supported objective modes for their owning recipes', () => {
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
    )).not.toThrow()
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
    )).not.toThrow()
  })

  it('rejects identity, mode, and recipe ceiling drift', () => {
    const invalid = (patch: Partial<CraftObjective>) => ({
      ...COSMIC_TITANIUM_INGOT_OBJECTIVE,
      ...patch,
    })
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      invalid({ objectiveId: '  ' }),
    )).toThrow(/objectiveId/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
    )).toThrow(/does not belong/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      invalid({ mode: 'future-mode' as CraftObjective['mode'] }),
    )).toThrow(/unsupported mode/)
    expect(() => assertCraftObjective(
      {
        ...COSMIC_TITANIUM_INGOT,
        qualityMax: COSMIC_TITANIUM_INGOT.requiredQuality + 100,
      },
      invalid({}),
    )).toThrow(/maximum tier must equal recipe qualityMax/)
  })

  it('rejects missing, duplicate, unordered, and out-of-maximum quality tiers', () => {
    const invalid = (qualityTiers: CraftObjective['qualityTiers']) => ({
      ...COSMIC_TITANIUM_NAILS_OBJECTIVE,
      qualityTiers,
    })

    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_NAILS,
      invalid([]),
    )).toThrow(/must declare either maximum only or scored\/mid\/high\/maximum tiers/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_NAILS,
      invalid([
        { id: 'scored', minimumQuality: 16_440, minimumCollectability: 1_644 },
        { id: 'scored', minimumQuality: 19_180, minimumCollectability: 1_918 },
      ]),
    )).toThrow(/must declare either|duplicate quality tier/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_NAILS,
      invalid([
        { id: 'mid', minimumQuality: 19_180, minimumCollectability: 1_918 },
        { id: 'high', minimumQuality: 16_440, minimumCollectability: 2_466 },
      ]),
    )).toThrow(/must declare either|strictly increasing/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_NAILS,
      invalid([{
        id: 'maximum',
        minimumQuality: COSMIC_TITANIUM_NAILS.qualityMax + 1,
        minimumCollectability: 2_711,
      }]),
    )).toThrow(/within recipe qualityMax/)
  })
})
