import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CraftState } from '@frozen-rabbit-expert/domain'
import {
  BOUNDED_RISK_FINISHER_VERSION,
  TARGET_CRAFTER_MEDICINE_749,
  compareBoundedRiskFinisherRoots,
} from '../src'

const recipe = COSMIC_TITANIUM_INGOT
const crafter = TARGET_CRAFTER_MEDICINE_749

function rescueState(): CraftState {
  const initial = createInitialCraftState(recipe, crafter)
  return {
    ...initial,
    step: 29,
    progress: 5285,
    quality: 13_648,
    durability: 30,
    cp: 87,
    condition: 'normal',
    innerQuiet: 10,
    trainedPerfectionAvailable: false,
    buffs: {
      ...initial.buffs,
      greatStrides: 3,
      innovation: 2,
    },
  }
}

describe('bounded risky finisher comparison', () => {
  it('finds the seed 3366042018 Byregot rescue without assuming favorable conditions', () => {
    const decision = compareBoundedRiskFinisherRoots(
      recipe,
      crafter,
      rescueState(),
      'byregotsBlessing',
      'preparatoryTouch',
      { now: () => 0 },
    )

    expect(decision).toMatchObject({
      version: BOUNDED_RISK_FINISHER_VERSION,
      action: 'byregotsBlessing',
      successProbability: 0.5,
      evidence: 'candidate-higher-bounded-probability',
    })
    expect(decision.candidate).toMatchObject({
      rootAction: 'byregotsBlessing',
      complete: true,
      evidence: 'complete-bounded-search',
    })
    expect(decision.candidate.route).toMatchObject({
      conditionAssumption: 'observed-root-then-normal',
      branchAssumption: 'listed-risk-actions-succeed',
      successProbability: 0.5,
      riskyActionCount: 1,
    })
    expect(decision.candidate.route!.actions[0]).toBe('byregotsBlessing')
    expect(decision.candidate.route!.projectedState.terminal).toBe('completed')
    expect(decision.baseline).toMatchObject({
      rootAction: 'preparatoryTouch',
      route: null,
      complete: true,
      evidence: 'complete-bounded-search',
    })
  })

  it('falls back to the guide action when the deterministic node cap is exhausted', () => {
    const decision = compareBoundedRiskFinisherRoots(
      recipe,
      crafter,
      rescueState(),
      'byregotsBlessing',
      'preparatoryTouch',
      { maxNodeExpansionsPerRoot: 1, now: () => 0 },
    )

    expect(decision).toMatchObject({
      action: 'preparatoryTouch',
      evidence: 'incomplete-search-fallback',
    })
    expect([decision.candidate.evidence, decision.baseline.evidence])
      .toContain('node-budget-exhausted')
  })

  it('falls back to the guide action when the wall-clock guard expires', () => {
    let clock = 0
    const decision = compareBoundedRiskFinisherRoots(
      recipe,
      crafter,
      rescueState(),
      'byregotsBlessing',
      'preparatoryTouch',
      { maxWallClockMs: 1, now: () => clock++ },
    )

    expect(decision).toMatchObject({
      action: 'preparatoryTouch',
      evidence: 'incomplete-search-fallback',
    })
    expect([decision.candidate.evidence, decision.baseline.evidence])
      .toContain('wall-clock-exhausted')
  })
})
