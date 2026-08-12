import { describe, expect, it } from 'vitest'
import {
  TARGET_CRAFTER_722,
  TARGET_CRAFTER_MEDICINE_749,
  TARGET_CRAFTER_SPECIALIST_DELINEATION_764,
  TARGET_CRAFTER_SPECIALIST_MEDICINE_749,
} from '../src'

describe('target crafter benchmark profiles', () => {
  it('keeps specialist medicine separate from historical and non-specialist profiles', () => {
    expect(TARGET_CRAFTER_722).toMatchObject({ maxCp: 722 })
    expect(TARGET_CRAFTER_722.specialist).toBeUndefined()

    expect(TARGET_CRAFTER_MEDICINE_749).toMatchObject({ maxCp: 749 })
    expect(TARGET_CRAFTER_MEDICINE_749.specialist).toBeUndefined()

    expect(TARGET_CRAFTER_SPECIALIST_MEDICINE_749).toEqual({
      ...TARGET_CRAFTER_MEDICINE_749,
      specialist: true,
    })
    expect(TARGET_CRAFTER_SPECIALIST_DELINEATION_764).toEqual({
      level: 100,
      craftsmanship: 5428,
      control: 5257,
      maxCp: 764,
      cosmicToolGoodBonus: true,
      specialist: true,
    })
  })
})
