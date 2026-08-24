import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
} from '@frozen-rabbit-expert/data'
import {
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  COMMAND_BREW_SENSITIVITY_PROFILES,
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
  assertConditionProfileCompatible,
  sampleCondition,
} from '../src'

describe('player-observed condition marginal', () => {
  it('preserves the 95-condition empirical trace as a versioned corpus checksum', () => {
    expect(PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS.evidence).toBe('empirical')
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

describe("Survey Craftsman's Command Brew condition models", () => {
  it('never assigns weight to a condition unavailable on the recipe', () => {
    const allowed = new Set(['normal', 'good', 'malleable'])
    for (const profile of COMMAND_BREW_SENSITIVITY_PROFILES) {
      const positiveConditions = Object.entries(profile.weights)
        .filter(([, weight]) => (weight ?? 0) > 0)
        .map(([condition]) => condition)
      expect(positiveConditions.every((condition) => allowed.has(condition))).toBe(true)
      expect(positiveConditions).toEqual(['normal', 'good', 'malleable'])
      expect(profile.evidence).toBe('assumption')
    }
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

  it('forces Sturdy after Robust without consuming a condition draw', () => {
    let draws = 0
    const condition = sampleCondition(BALANCED_ELEVATING_PLATFORMS_CONDITIONS, {
      nextCondition: () => { draws += 1; return 0.99 },
      nextSuccess: () => 0.5,
    }, 'robust')
    expect(condition).toBe('sturdy')
    expect(draws).toBe(0)
  })
})

describe('recipe-aware condition profile validation', () => {
  it('accepts matching current profiles and rejects recipe-impossible conditions', () => {
    expect(() => assertConditionProfileCompatible(
      COSMIC_TITANIUM_INGOT,
      PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
    )).not.toThrow()
    expect(() => assertConditionProfileCompatible(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
    )).toThrow(/unavailable condition/)
  })

  it('rejects duplicate-tool hazards such as blank IDs and invalid weights', () => {
    expect(() => assertConditionProfileCompatible(COSMIC_TITANIUM_INGOT, {
      id: ' ',
      evidence: 'assumption',
      weights: { normal: 1 },
    })).toThrow(/id must not be empty/)
    expect(() => assertConditionProfileCompatible(COSMIC_TITANIUM_INGOT, {
      id: 'invalid-negative-weight',
      evidence: 'assumption',
      weights: { normal: -1 },
    })).toThrow(/finite and non-negative/)
  })
})
