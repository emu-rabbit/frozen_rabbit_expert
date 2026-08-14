import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import { assertCraftObjective, type CraftObjective } from '../src'

describe('craft objective runtime contract', () => {
  it('accepts both supported objective modes for their owning recipes', () => {
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
    )).not.toThrow()
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
    )).not.toThrow()
  })

  it('rejects identity, mode, target-integrity, and required-quality drift', () => {
    const invalid = (patch: Partial<CraftObjective>) => ({
      ...COSMIC_TITANIUM_INGOT_OBJECTIVE,
      ...patch,
    })
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      invalid({ objectiveId: '  ' }),
    )).toThrow(/objectiveId/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
    )).toThrow(/does not belong/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      invalid({ mode: 'future-mode' as CraftObjective['mode'] }),
    )).toThrow(/unsupported mode/)
    expect(() => assertCraftObjective(
      COSMIC_TITANIUM_INGOT,
      invalid({ qualityTarget: Number.NaN }),
    )).toThrow(/positive safe integer/)
    expect(() => assertCraftObjective(
      {
        ...COSMIC_TITANIUM_INGOT,
        qualityMax: COSMIC_TITANIUM_INGOT.requiredQuality + 100,
      },
      invalid({ qualityTarget: COSMIC_TITANIUM_INGOT.requiredQuality + 1 }),
    )).toThrow(/must target recipe.requiredQuality/)
  })
})
