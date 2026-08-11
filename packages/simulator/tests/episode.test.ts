import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CrafterProfile } from '@frozen-rabbit-expert/domain'
import {
  BALANCED_POC_CONDITIONS,
  createEpisodeRandomStream,
  runEpisode,
  sampleCondition,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5140,
  maxCp: 630,
  cosmicToolGoodBonus: true,
}

describe('episode simulator', () => {
  it('replays the same random stream deterministically', () => {
    const collect = () => {
      const random = createEpisodeRandomStream(42)
      return Array.from({ length: 12 }, () => ({
        condition: sampleCondition(BALANCED_POC_CONDITIONS, random),
        success: random.nextSuccess(),
      }))
    }
    expect(collect()).toEqual(collect())
  })

  it('runs a bounded trajectory without reading global randomness', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const result = runEpisode({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialState,
      firstAction: 'observe',
      policy: () => 'observe',
      random: createEpisodeRandomStream(7),
      conditionProfile: BALANCED_POC_CONDITIONS,
      maxSteps: 4,
    })
    expect(result.actions).toHaveLength(4)
    expect(result.stoppedByLimit).toBe(true)
  })
})
