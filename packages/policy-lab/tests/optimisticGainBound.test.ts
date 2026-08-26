import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import { createInitialCraftState } from '@frozen-rabbit-expert/domain'
import {
  TARGET_CRAFTER_MEDICINE_749,
  calculateOptimisticGainBound,
} from '../src'

const context = {
  recipe: COSMIC_TITANIUM_INGOT,
  objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
  crafter: TARGET_CRAFTER_MEDICINE_749,
}

describe('optimistic action-gain bound', () => {
  it('proves a one-action target impossible when no action can finish progress and target quality together', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const result = calculateOptimisticGainBound(context, initial, 1)
    expect(result.completionPossibleUnderRelaxation).toBe(false)
    expect(result.maximumQualityUpperBound).toBeNull()
    expect(result.qualityMaximumStatus).toBe('provably-unreachable-under-relaxation')
  })

  it('is monotone with horizon and never exceeds the mechanics quality cap', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const short = calculateOptimisticGainBound(context, initial, 8)
    const long = calculateOptimisticGainBound(context, initial, 16)
    expect(long.maximumQualityUpperBound ?? -1).toBeGreaterThanOrEqual(
      short.maximumQualityUpperBound ?? -1,
    )
    expect(long.maximumQualityUpperBound).toBeLessThanOrEqual(context.recipe.qualityMax)
  })

  it('makes every relaxation and the negative-only interpretation explicit', () => {
    const initial = createInitialCraftState(context.recipe, context.crafter)
    const result = calculateOptimisticGainBound(context, initial, 80)
    expect(result.actionGains.some((gain) => gain.progressGainUpper > 0)).toBe(true)
    expect(result.actionGains.some((gain) => gain.qualityGainUpper > 0)).toBe(true)
    expect(result.relaxation).toContain('ignore-cp-durability-setup-and-one-use-limits')
    expect(['provably-unreachable-under-relaxation', 'not-ruled-out']).toContain(result.qualityMaximumStatus)
  })
})
