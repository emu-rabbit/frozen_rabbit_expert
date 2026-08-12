import { afterEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'
import { useCraftSession } from '../apps/web/src/composables/useCraftSession'

describe('craft session scenario switching', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updates the recipe and initial state atomically', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
    })
    const session = useCraftSession()
    const observed: Array<{ scenarioId: string; durability: number; maximum: number }> = []
    const stop = watch(session.scenarioId, () => {
      observed.push({
        scenarioId: session.scenarioId.value,
        durability: session.state.value.durability,
        maximum: session.recipe.value.durabilityMax,
      })
      expect(session.state.value.durability).toBe(session.recipe.value.durabilityMax)
    }, { flush: 'sync' })

    session.selectScenario('mobile-work-stairs')
    session.selectScenario('hardened-survey-plank')
    stop()

    expect(observed).toEqual([
      { scenarioId: 'mobile-work-stairs', durability: 60, maximum: 60 },
      { scenarioId: 'hardened-survey-plank', durability: 20, maximum: 20 },
    ])
  })
})
