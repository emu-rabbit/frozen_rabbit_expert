import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
  CONDITION_RESOLUTION_LOCK_MS,
  useCraftSession,
} from '../apps/web/src/composables/useCraftSession'

describe('craft session scenario switching', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('restarts both the current and a different recipe from a clean first step', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
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
    expectCleanStart('cosmic-expert-36282')

    session.resync({ step: 4, progress: 100, quality: 200 }, 'test another dirty state')
    session.selectScenario('cosmic-expert-36205')
    expectCleanStart('cosmic-expert-36205')

    scope.stop()
  })

  it('clears saved craft sessions on load while retaining equipment values', () => {
    const storage = new Map<string, string>([
      ['frozen-rabbit-expert/equipment-v2', JSON.stringify({
        craftsmanship: 5_408,
        control: 5_237,
        maxCp: 749,
        cosmicToolGoodBonus: true,
        specialist: false,
      })],
      ['frozen-rabbit-expert/session-v0.8.0', '{"stale":true}'],
      ['frozen-rabbit-expert/session-v0.7.0', '{"stale":true}'],
      ['frozen-rabbit-expert/session-v0.6.0', '{"stale":true}'],
    ])
    const writtenKeys: string[] = []
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writtenKeys.push(key)
        storage.set(key, value)
      },
      removeItem: (key: string) => storage.delete(key),
    })

    const scope = effectScope()
    const session = scope.run(() => useCraftSession())!

    expect(session.savedEquipment.value).toMatchObject({
      craftsmanship: 5_408,
      control: 5_237,
      maxCp: 749,
    })
    expect(session.configured.value).toBe(false)
    expect(session.scenarioId.value).toBe('cosmic-expert-36282')
    expect(session.events.value).toEqual([])
    expect([...storage.keys()].filter((key) => key.includes('/session-'))).toEqual([])

    session.restart(session.savedEquipment.value!)
    expect(writtenKeys).toEqual([
      'frozen-rabbit-expert/equipment-v2',
      'frozen-rabbit-expert/risk-preference-v1',
    ])

    scope.stop()
  })

  it('rejects a second condition resolution that lands on the next recommendation', () => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
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

    expect(session.completeAction('reflect', true, 'good')).toBe(true)
    expect(session.actionCount.value).toBe(1)
    expect(session.conditionInputLocked.value).toBe(true)

    expect(session.completeAction('manipulation', true, 'normal')).toBe(false)
    session.beginAction('manipulation')
    expect(session.pendingAction.value).toBeNull()
    expect(session.actionCount.value).toBe(1)

    vi.advanceTimersByTime(CONDITION_RESOLUTION_LOCK_MS)
    expect(session.conditionInputLocked.value).toBe(false)
    expect(session.completeAction('manipulation', true, 'normal')).toBe(true)
    expect(session.actionCount.value).toBe(2)

    scope.stop()
  })

  it('rejects state resync while an action is awaiting its result', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
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
    session.beginAction('reflect')
    const eventCount = session.events.value.length

    session.resync({ quality: 123 }, 'must not cross an unresolved action')

    expect(session.pendingAction.value).toBe('reflect')
    expect(session.events.value).toHaveLength(eventCount)
    expect(session.state.value.quality).toBe(0)
    scope.stop()
  })

  it('starts an in-memory session when browser storage rejects writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('storage unavailable', 'QuotaExceededError')
      },
      removeItem: () => undefined,
    })
    const scope = effectScope()
    const session = scope.run(() => useCraftSession())!

    expect(() => session.restart({
      craftsmanship: 5_408,
      control: 5_237,
      maxCp: 749,
      cosmicToolGoodBonus: true,
      specialist: false,
    }, 'aggressive')).not.toThrow()
    expect(session.configured.value).toBe(true)
    expect(session.riskPreference.value).toBe('aggressive')
    expect(session.state.value).toMatchObject({
      step: 1,
      cp: 749,
      condition: 'normal',
      terminal: 'none',
    })
    expect(session.events.value.map((event) => event.type)).toEqual([
      'craftStarted',
      'conditionSelected',
    ])
    scope.stop()
  })

  it('atomically restarts from a higher to a lower CP panel', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
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
    expect(session.completeAction('reflect', true, 'normal')).toBe(true)

    expect(() => session.restart({
      craftsmanship: 5_408,
      control: 5_140,
      maxCp: 630,
      cosmicToolGoodBonus: true,
      specialist: false,
    })).not.toThrow()
    expect(session.configured.value).toBe(true)
    expect(session.state.value).toMatchObject({
      step: 1,
      cp: 630,
      progress: 0,
      quality: 0,
      condition: 'normal',
    })
    expect(session.events.value.map((event) => event.type)).toEqual([
      'craftStarted',
      'conditionSelected',
    ])
    scope.stop()
  })

  it('does not replay a long old action history against a newly selected recipe', () => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
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
    for (const action of ['reflect', 'basicTouch', 'basicTouch'] as const) {
      expect(session.completeAction(action, true, 'normal')).toBe(true)
      vi.advanceTimersByTime(CONDITION_RESOLUTION_LOCK_MS)
    }
    expect(session.actionCount.value).toBe(3)

    expect(() => session.selectScenario('cosmic-expert-36205')).not.toThrow()
    expect(session.scenarioId.value).toBe('cosmic-expert-36205')
    expect(session.state.value).toMatchObject({
      step: 1,
      durability: 20,
      cp: 749,
      progress: 0,
      quality: 0,
      condition: 'normal',
    })
    expect(session.actionCount.value).toBe(0)
    scope.stop()
  })
})
