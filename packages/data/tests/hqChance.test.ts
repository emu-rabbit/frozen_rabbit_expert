import { describe, expect, it } from 'vitest'
import {
  estimateHqChancePercentFromCommunityTable,
  estimateMobileWorkStairsExpectedMissionPoints,
} from '../src'

describe('provisional non-linear HQ quality utility', () => {
  it('matches the versioned community curve at representative breakpoints', () => {
    expect(estimateHqChancePercentFromCommunityTable(0, 22_500)).toBe(1)
    expect(estimateHqChancePercentFromCommunityTable(3_375, 22_500)).toBe(5)
    expect(estimateHqChancePercentFromCommunityTable(5_625, 22_500)).toBe(8)
    expect(estimateHqChancePercentFromCommunityTable(11_249, 22_500)).toBe(14)
    expect(estimateHqChancePercentFromCommunityTable(11_250, 22_500)).toBe(15)
    expect(estimateHqChancePercentFromCommunityTable(14_625, 22_500)).toBe(21)
    expect(estimateHqChancePercentFromCommunityTable(16_875, 22_500)).toBe(47)
    expect(estimateHqChancePercentFromCommunityTable(20_250, 22_500)).toBe(86)
    expect(estimateHqChancePercentFromCommunityTable(20_249, 22_500)).toBe(85)
    expect(estimateHqChancePercentFromCommunityTable(22_500, 22_500)).toBe(100)
  })

  it('turns the provisional HQ chance into the known 200/800 mission reward expectation', () => {
    expect(estimateMobileWorkStairsExpectedMissionPoints(0, 22_500)).toBe(206)
    expect(estimateMobileWorkStairsExpectedMissionPoints(22_500, 22_500)).toBe(800)
  })

  it('rejects invalid inputs rather than hiding them with clamping', () => {
    expect(() => estimateHqChancePercentFromCommunityTable(-1, 22_500)).toThrow()
    expect(() => estimateHqChancePercentFromCommunityTable(1, 0)).toThrow()
  })
})
