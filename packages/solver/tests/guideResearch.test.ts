import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, previewAction, type CrafterProfile } from '@frozen-rabbit-expert/domain'
import {
  GUIDE_TECHNIQUES,
  RESEARCH_TEACHER_PROMOTED,
  recommendWithResearchTeacher,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5140,
  maxCp: 630,
  cosmicToolGoodBonus: true,
}

describe('rejected rollout-teacher research surface', () => {
  it('keeps the sourced technique catalog structurally usable without freezing old action oracles', () => {
    expect(new Set(GUIDE_TECHNIQUES.map((technique) => technique.id)).size)
      .toBe(GUIDE_TECHNIQUES.length)
    expect(GUIDE_TECHNIQUES.every((technique) => technique.sources.length > 0)).toBe(true)
  })

  it('remains explicitly unpromoted while its offline entrypoint returns only a legal action', () => {
    const state = {
      ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter),
      step: 10,
      progress: 6100,
      quality: 6500,
      durability: 25,
      cp: 410,
      innerQuiet: 6,
    }
    const result = recommendWithResearchTeacher(COSMIC_TITANIUM_INGOT, crafter, state, {
      mechanicsVersion: 'test-mechanics',
      maxTimeMs: 250,
      samplesPerProfile: 1,
      maxEpisodeSteps: 20,
      seed: 42,
    })

    expect(RESEARCH_TEACHER_PROMOTED).toBe(false)
    expect(result).not.toBeNull()
    expect(previewAction(
      COSMIC_TITANIUM_INGOT,
      crafter,
      state,
      result!.recommendation.action,
    ).legal).toBe(true)
  })
})
