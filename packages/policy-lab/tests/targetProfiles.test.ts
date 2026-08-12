import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, previewAction } from '@frozen-rabbit-expert/domain'
import {
  TARGET_CRAFTER_MEDICINE_749,
  TARGET_CRAFTER_SPECIALIST_MEDICINE_749,
} from '../src'

describe('target crafter benchmark profiles', () => {
  it('isolates specialist eligibility from the medicine-adjusted panel stats', () => {
    const { specialist, ...specialistStats } = TARGET_CRAFTER_SPECIALIST_MEDICINE_749
    expect(specialist).toBe(true)
    expect(specialistStats).toEqual(TARGET_CRAFTER_MEDICINE_749)

    const normalState = createInitialCraftState(COSMIC_TITANIUM_INGOT, TARGET_CRAFTER_MEDICINE_749)
    const specialistState = createInitialCraftState(
      COSMIC_TITANIUM_INGOT,
      TARGET_CRAFTER_SPECIALIST_MEDICINE_749,
    )
    expect(previewAction(
      COSMIC_TITANIUM_INGOT,
      TARGET_CRAFTER_MEDICINE_749,
      normalState,
      'heartAndSoul',
    )).toMatchObject({ legal: false, reason: 'specialist' })
    expect(previewAction(
      COSMIC_TITANIUM_INGOT,
      TARGET_CRAFTER_SPECIALIST_MEDICINE_749,
      specialistState,
      'heartAndSoul',
    ).legal).toBe(true)
  })
})
