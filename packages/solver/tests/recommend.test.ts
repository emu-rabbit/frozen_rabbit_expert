import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  applyObservedOutcome,
  previewAction,
  type CrafterProfile,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import { recommendAction, SOLVER_POLICY_VERSION } from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5140,
  maxCp: 630,
  cosmicToolGoodBonus: true,
}

function state(patch: Partial<CraftState> = {}): CraftState {
  return { ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter), ...patch }
}

function recommend(current: CraftState) {
  return recommendAction(COSMIC_TITANIUM_INGOT, crafter, current, { mechanicsVersion: MODEL_VERSIONS.mechanics })
}

describe('cosmic titanium lookahead policy v1.3', () => {
  it('publishes a versioned, legal recommendation from the opening state', () => {
    const result = recommend(state())
    expect(result).not.toBeNull()
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, state(), result!.action).legal).toBe(true)
    expect(result?.policyVersion).toBe(SOLVER_POLICY_VERSION)
  })

  it('returns ranked alternatives without locking a guide example into a hard rule', () => {
    const current = state({ step: 6, progress: 4300, quality: 4200, durability: 25, cp: 520, innerQuiet: 4, condition: 'good' })
    const result = recommend(current)
    expect(result).not.toBeNull()
    expect([result!.action, ...result!.alternatives.map((entry) => entry.action)]).toHaveLength(3)
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, current, result!.action).legal).toBe(true)
  })

  it('finishes only after mandatory quality has been reached', () => {
    const ready = state({ step: 20, progress: 7000, quality: 18900, durability: 10, cp: 100 })
    const result = recommend(ready)
    expect(result).not.toBeNull()
    expect(result?.phase).toBe('complete-synthesis')
    expect(result?.reasons).toContain('complete-craft')

    const early = state({ step: 20, progress: 7000, quality: 18000, durability: 20, cp: 100 })
    const earlyResult = recommend(early)
    expect(earlyResult).not.toBeNull()
    const preview = previewAction(COSMIC_TITANIUM_INGOT, crafter, early, earlyResult!.action)
    expect(early.progress + preview.progressGain).toBeLessThan(COSMIC_TITANIUM_INGOT.progressRequired)
  })

  it('never recommends an illegal or immediately fatal action across boundary states', () => {
    const conditions: MaterialCondition[] = ['normal', 'good', 'centered', 'sturdy', 'pliant', 'malleable']
    for (const condition of conditions) {
      for (const durability of [5, 10, 15, 30]) {
        const current = state({ step: 8, progress: 3500, quality: 6000, durability, cp: 240, innerQuiet: 6, condition })
        const result = recommend(current)
        expect(result, `${condition}/${durability}`).not.toBeNull()
        const preview = previewAction(COSMIC_TITANIUM_INGOT, crafter, current, result!.action)
        expect(preview.legal, `${condition}/${durability}/${result!.action}`).toBe(true)
        expect(current.progress + preview.progressGain >= COSMIC_TITANIUM_INGOT.progressRequired).toBe(false)
        const next = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, result!.action, {
          success: true,
          nextCondition: 'normal',
        }).nextState
        expect(next.terminal, `${condition}/${durability}/${result!.action}`).not.toBe('failed')
      }
    }
  })

  it('returns no recommendation after the craft is terminal', () => {
    expect(recommend(state({ terminal: 'failed', failureReason: 'durability', durability: 0 }))).toBeNull()
  })
})
