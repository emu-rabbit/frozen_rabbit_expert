import { describe, expect, it } from 'vitest'
import { createInitialCraftState } from '@frozen-rabbit-expert/domain'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import { MODEL_VERSIONS, createSessionExport, type SessionEvent } from '../src'

const crafter = {
  level: 100,
  craftsmanship: 5_408,
  control: 5_237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
  specialist: true,
}

describe('session export', () => {
  it('keeps replay identities and events without product maturity classifications', () => {
    const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const events: SessionEvent[] = [
      { type: 'craftStarted', id: 'start', at: 1 },
      { type: 'conditionSelected', id: 'condition', at: 2, condition: 'normal' },
    ]
    const exported = createSessionExport(
      'cosmic-expert-36282',
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      initialState,
      events,
      { ...MODEL_VERSIONS, plannerPolicy: 'current-web-policy' },
    )

    expect(exported.manifest.schema).toBe('expert-session-v0.11.0')
    expect(exported.manifest.modelVersions.plannerPolicy).toBe('current-web-policy')
    expect(exported.events).toEqual(events)
    expect('support' in exported).toBe(false)
  })
})
