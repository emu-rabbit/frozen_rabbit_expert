import { describe, expect, it } from 'vitest'
import {
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
  sampleCondition,
} from '../src'

describe('player-observed condition marginal', () => {
  it('preserves the 95 pure-Observe conditions supplied by the player', () => {
    expect(PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS.weights).toEqual({
      normal: 36,
      good: 14,
      centered: 13,
      sturdy: 13,
      pliant: 10,
      malleable: 9,
    })
    expect(Object.values(PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS.weights)
      .reduce((sum, count) => sum + (count ?? 0), 0)).toBe(95)
  })
})

describe('Elevating Platforms condition model', () => {
  it('uses only the seven player-observed conditions', () => {
    expect(BALANCED_ELEVATING_PLATFORMS_CONDITIONS.weights).toEqual({
      normal: 1,
      good: 1,
      goodOmen: 1,
      sturdy: 1,
      pliant: 1,
      malleable: 1,
      primed: 1,
    })
  })

  it('forces Good after Good Omen without consuming a condition draw', () => {
    let draws = 0
    const condition = sampleCondition(BALANCED_ELEVATING_PLATFORMS_CONDITIONS, {
      nextCondition: () => { draws += 1; return 0.99 },
      nextSuccess: () => 0.5,
    }, 'goodOmen')
    expect(condition).toBe('good')
    expect(draws).toBe(0)
  })
})
