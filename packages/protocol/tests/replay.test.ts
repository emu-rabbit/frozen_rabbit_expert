import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CrafterProfile } from '@frozen-rabbit-expert/domain'
import { replaySession, removeLastStep, type SessionEvent } from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5380,
  control: 5000,
  maxCp: 620,
  cosmicToolGoodBonus: false,
}

const events: SessionEvent[] = [
  { type: 'craftStarted', id: 'start', at: 1 },
  { type: 'craftActionUsed', id: 'used-1', at: 2, action: 'basicTouch', previousCondition: 'normal' },
  { type: 'craftActionResolved', id: 'resolved-1', at: 2, success: true, nextCondition: 'malleable' },
  { type: 'craftActionUsed', id: 'used-2', at: 3, action: 'basicSynthesis', previousCondition: 'malleable' },
  { type: 'craftActionResolved', id: 'resolved-2', at: 3, success: true, nextCondition: 'normal' },
]

describe('session replay', () => {
  it('is deterministic for the same event path', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const first = replaySession(COSMIC_TITANIUM_INGOT, crafter, initial, events)
    const second = replaySession(COSMIC_TITANIUM_INGOT, crafter, initial, events)
    expect(second).toEqual(first)
    expect(first.state).toMatchObject({ progress: 540, quality: 312, durability: 10, cp: 602 })
  })

  it('rejects a previous-condition mismatch', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const invalid = events.map((event) => ({ ...event })) as SessionEvent[]
    const used = invalid[1]
    if (used?.type === 'craftActionUsed') used.previousCondition = 'good'
    expect(() => replaySession(COSMIC_TITANIUM_INGOT, crafter, initial, invalid)).toThrow(/condition/i)
  })

  it('replays a player-selected condition before an action', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const selected: SessionEvent[] = [
      { type: 'craftStarted', id: 'start', at: 1 },
      { type: 'conditionSelected', id: 'condition', at: 2, condition: 'malleable' },
      { type: 'craftActionUsed', id: 'used', at: 3, action: 'basicSynthesis', previousCondition: 'malleable' },
      { type: 'craftActionResolved', id: 'resolved', at: 3, success: true, nextCondition: 'normal' },
    ]
    expect(replaySession(COSMIC_TITANIUM_INGOT, crafter, initial, selected).state.progress).toBe(540)
  })

  it('undoes one logical action pair', () => {
    const undone = removeLastStep(events)
    expect(undone.map((event) => event.id)).toEqual(['start', 'used-1', 'resolved-1'])
  })
})
