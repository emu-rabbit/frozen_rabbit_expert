import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useCraftSession } from '../apps/web/src/composables/useCraftSession'

describe('craft session scenario switching', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restarts both the current and a different recipe from a clean first step', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
    })
    const scope = effectScope()
    const session = scope.run(() => useCraftSession())!
    session.restart({
      craftsmanship: 5_408,
      control: 5_237,
      maxCp: 749,
      cosmicToolGoodBonus: true,
      specialist: false,
    })

    const expectCleanStart = (scenarioId: string) => {
      expect(session.scenarioId.value).toBe(scenarioId)
      expect(session.state.value).toMatchObject({
        step: 1,
        progress: 0,
        quality: 0,
        durability: session.recipe.value.durabilityMax,
        cp: session.crafter.maxCp,
        condition: 'normal',
      })
      expect(session.pendingAction.value).toBeNull()
      expect(session.actionCount.value).toBe(0)
      expect(session.events.value.map((event) => event.type)).toEqual([
        'craftStarted',
        'conditionSelected',
      ])
    }

    session.resync({
      step: 7,
      progress: 1_234,
      quality: 5_678,
      durability: 1,
      cp: 2,
      condition: 'good',
    }, 'test dirty state')
    session.beginAction('basicSynthesis')
    expect(session.pendingAction.value).toBe('basicSynthesis')

    session.selectScenario(session.scenarioId.value)
    expectCleanStart('cosmotized-ilmenite-ingot')

    session.resync({ step: 4, progress: 100, quality: 200 }, 'test another dirty state')
    session.selectScenario('hardened-survey-plank')
    expectCleanStart('hardened-survey-plank')

    scope.stop()
  })
})
