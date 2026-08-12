import { describe, expect, it } from 'vitest'
import { PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS } from '../src'

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
