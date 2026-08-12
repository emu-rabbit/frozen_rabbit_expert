import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  playerEquipmentProfileById,
} from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  FINISHER_CERTIFICATE_VERSION,
  assessProgressFinisher,
  assessQualityBurst,
  findGuaranteedProgressFinisher,
  findGuaranteedProgressFinisherWithRecovery,
  findQualityBurstCertificate,
} from '../src'

const recipe = COSMIC_TITANIUM_INGOT
const crafter = playerEquipmentProfileById('player-food-medicine-cosmic-tool-v1')!.crafter

function stateAt(overrides: Partial<CraftState>): CraftState {
  const initial = createInitialCraftState(recipe, crafter)
  return {
    ...initial,
    step: 20,
    progress: 6700,
    quality: recipe.requiredQuality,
    durability: 30,
    cp: 200,
    ...overrides,
    buffs: { ...initial.buffs, ...overrides.buffs },
  }
}

function replayCurrentThenNormal(state: CraftState, actions: readonly CraftActionId[]): CraftState {
  let current = state
  for (const action of actions) {
    const preview = previewAction(recipe, crafter, current, action)
    expect(preview.legal, action).toBe(true)
    expect(preview.successRate, action).toBe(1)
    current = applyObservedOutcome(recipe, crafter, current, action, {
      success: true,
      nextCondition: 'normal',
    }).nextState
  }
  return current
}

describe('Normal worst-case finisher certificates', () => {
  it('finds an exact guaranteed progress route and reports its resource floor', () => {
    const state = stateAt({ progress: 6700, cp: 100, durability: 30 })
    const certificate = findGuaranteedProgressFinisher(recipe, crafter, state)

    expect(certificate).not.toBeNull()
    expect(certificate!.version).toBe(FINISHER_CERTIFICATE_VERSION)
    expect(certificate!.conditionAssumption).toBe('observed-current-then-normal')
    expect(certificate!.successProbability).toBe(1)
    expect(certificate!.actions).toEqual(['prudentSynthesis', 'basicSynthesis'])
    expect(certificate!.requiredCp).toBe(18)
    expect(certificate!.requiredDurability).toBe(6)
    expect(certificate!.durabilityCost).toBe(15)
    expect(certificate!.projectedState.terminal).toBe('completed')
    expect(replayCurrentThenNormal(state, certificate!.actions)).toEqual(certificate!.projectedState)
  })

  it('uses the observed Malleable action and assumes Normal only afterward', () => {
    const state = stateAt({
      progress: 6100,
      condition: 'malleable',
      cp: 18,
      durability: 20,
    })

    const certificate = findGuaranteedProgressFinisher(recipe, crafter, state, { maxActions: 1 })
    expect(certificate?.actions).toEqual(['groundwork'])
    expect(certificate?.projectedState.terminal).toBe('completed')
    expect(findGuaranteedProgressFinisher(
      recipe,
      crafter,
      { ...state, condition: 'normal' },
      { maxActions: 1 },
    )).toBeNull()
  })

  it('can prove a compact recovery setup followed by a deterministic finish', () => {
    const state = stateAt({ progress: 6700, cp: 100, durability: 5 })
    const certificate = findGuaranteedProgressFinisherWithRecovery(recipe, crafter, state)

    expect(certificate).not.toBeNull()
    expect(certificate!.actions[0]).toBe('trainedPerfection')
    expect(certificate!.actions.slice(1)).toEqual(['basicSynthesis', 'basicSynthesis'])
    expect(certificate!.projectedState.terminal).toBe('completed')
  })

  it('shares one deterministic node budget across direct and recovery search', () => {
    const state = stateAt({ progress: 6700, cp: 100, durability: 5 })

    expect(findGuaranteedProgressFinisherWithRecovery(recipe, crafter, state, {
      maxNodeExpansions: 2,
    })).toBeNull()

    const bestFoundAtBoundary = findGuaranteedProgressFinisherWithRecovery(
      recipe,
      crafter,
      state,
      { maxNodeExpansions: 3 },
    )
    expect(bestFoundAtBoundary?.actions).toEqual(['trainedPerfection', 'groundwork'])
    expect(bestFoundAtBoundary?.projectedState.terminal).toBe('completed')
  })

  it('rejects the old 50% quality burst boundary when no Normal burst can finish', () => {
    const state = stateAt({
      quality: recipe.requiredQuality / 2,
      innerQuiet: 10,
      cp: 220,
      durability: 30,
    })

    expect(findQualityBurstCertificate(recipe, crafter, state)).toBeNull()
  })

  it('certifies a quality burst only together with its guaranteed progress finish', () => {
    const state = stateAt({ quality: 12_500, innerQuiet: 10, cp: 200, durability: 30 })
    const certificate = findQualityBurstCertificate(recipe, crafter, state)

    expect(certificate).not.toBeNull()
    expect(certificate!.qualityActions).toEqual([
      'greatStrides',
      'innovation',
      'trainedFinesse',
      'greatStrides',
      'byregotsBlessing',
    ])
    expect(certificate!.progressActions).toEqual(['prudentSynthesis', 'basicSynthesis'])
    expect(certificate!.requiredCp).toBe(156)
    expect(certificate!.requiredDurability).toBe(16)
    expect(certificate!.qualityEndState.quality).toBeGreaterThanOrEqual(recipe.requiredQuality)
    expect(certificate!.projectedState.terminal).toBe('completed')
    expect(replayCurrentThenNormal(state, certificate!.actions)).toEqual(certificate!.projectedState)
    expect(assessQualityBurst(recipe, crafter, state)).toMatchObject({
      feasibility: 'guaranteed',
      commitMode: 'certified',
      action: 'greatStrides',
    })
  })

  it('certifies an external policy quality target when mechanics requiredQuality is zero', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const state: CraftState = {
      ...initial,
      step: 20,
      progress: 6700,
      quality: 20_000,
      innerQuiet: 10,
      durability: 30,
      cp: 200,
    }
    const certificate = findQualityBurstCertificate(
      COSMIC_TITANIUM_NAILS,
      crafter,
      state,
      { qualityTarget: 24_660 },
    )

    expect(certificate).not.toBeNull()
    expect(certificate!.qualityTarget).toBe(24_660)
    expect(certificate!.qualityEndState.quality).toBeGreaterThanOrEqual(24_660)
    expect(certificate!.projectedState.terminal).toBe('completed')
  })

  it('returns a valid best-found quality proof when its shared budget is exhausted', () => {
    const state = stateAt({ quality: 12_500, innerQuiet: 10, cp: 200, durability: 30 })

    expect(findQualityBurstCertificate(recipe, crafter, state, {
      maxNodeExpansions: 52,
    })).toBeNull()

    const bestFoundAtBoundary = findQualityBurstCertificate(recipe, crafter, state, {
      maxNodeExpansions: 53,
    })
    expect(bestFoundAtBoundary).not.toBeNull()
    expect(bestFoundAtBoundary!.projectedState.terminal).toBe('completed')
    expect(replayCurrentThenNormal(state, bestFoundAtBoundary!.actions)).toEqual(
      bestFoundAtBoundary!.projectedState,
    )
  })

  it('rejects a quality-completing burst when neither durability nor recovery can fund progress', () => {
    const state = stateAt({
      quality: 12_500,
      innerQuiet: 10,
      cp: 150,
      durability: 15,
      trainedPerfectionAvailable: false,
    })

    expect(findQualityBurstCertificate(recipe, crafter, state)).toBeNull()
  })

  it('uses a known Good Byregot now but never assumes another favorable condition', () => {
    const buffs = { ...stateAt({}).buffs, innovation: 2, greatStrides: 2 }
    const insufficient = stateAt({
      progress: 7000,
      quality: 10_500,
      innerQuiet: 10,
      condition: 'good',
      cp: 30,
      durability: 20,
      buffs,
    })
    const certificate = findQualityBurstCertificate(recipe, crafter, insufficient)
    expect(certificate).not.toBeNull()
    expect(certificate!.qualityActions).toEqual(['byregotsBlessing'])
    expect(certificate!.progressActions).toEqual(['basicSynthesis'])
    expect(certificate!.requiredCp).toBe(24)
    expect(certificate!.requiredDurability).toBe(11)
    expect(certificate!.projectedState.terminal).toBe('completed')
    expect(findQualityBurstCertificate(
      recipe,
      crafter,
      { ...insufficient, condition: 'normal' },
    )).toBeNull()
  })

  it('keeps bounded proof absence contingent instead of turning it into a veto', () => {
    const progressState = stateAt({ progress: 6100, quality: 10_000, cp: 0, durability: 5 })
    expect(assessProgressFinisher(recipe, crafter, progressState)).toMatchObject({
      feasibility: 'contingent-or-risky',
      certificate: null,
      reason: 'bounded-proof-not-found',
    })

    // This state needs more than one synthesis, so a one-node proof budget is
    // genuinely exhausted instead of finding an immediate Groundwork finish.
    expect(assessProgressFinisher(recipe, crafter, stateAt({ progress: 5000 }), {
      maxNodeExpansions: 1,
    })).toMatchObject({
      feasibility: 'contingent-or-risky',
      certificate: null,
      reason: 'bounded-proof-not-found',
    })

    const qualityState = stateAt({
      quality: recipe.requiredQuality / 2,
      innerQuiet: 10,
      cp: 220,
      durability: 30,
    })
    expect(assessQualityBurst(recipe, crafter, qualityState)).toMatchObject({
      feasibility: 'contingent-or-risky',
      certificate: null,
      commitMode: 'continue-quality-cycle',
      action: null,
    })
  })

  it('allows Byregot desperation only after independent conservative-route failure', () => {
    const state = stateAt({
      quality: recipe.requiredQuality / 2,
      innerQuiet: 10,
      cp: 220,
      durability: 30,
    })
    const assessment = assessQualityBurst(recipe, crafter, state, {
      conservativeRouteStatus: 'infeasible',
    })

    expect(assessment).toMatchObject({
      feasibility: 'contingent-or-risky',
      certificate: null,
      commitMode: 'desperation',
      action: 'byregotsBlessing',
      reason: 'desperation-after-conservative-route-infeasible',
    })
    expect(assessment.contingencies).toContain('hasty-touch-success')
    expect(assessment.contingencies).toContain('future-sturdy')

    expect(assessQualityBurst(recipe, crafter, { ...state, durability: 10 }, {
      conservativeRouteStatus: 'infeasible',
    })).toMatchObject({
      feasibility: 'contingent-or-risky',
      commitMode: 'continue-quality-cycle',
      action: null,
    })
  })

  it('reports terminal states as infeasible assessments', () => {
    const failed = stateAt({ terminal: 'failed', failureReason: 'durability' })
    expect(assessProgressFinisher(recipe, crafter, failed).feasibility).toBe('infeasible')
    expect(assessQualityBurst(recipe, crafter, failed)).toMatchObject({
      feasibility: 'infeasible',
      commitMode: 'none',
      action: null,
    })
  })

  it('rejects invalid node-expansion limits', () => {
    const state = stateAt({})
    expect(() => findGuaranteedProgressFinisher(recipe, crafter, state, {
      maxNodeExpansions: 0,
    })).toThrow('maxNodeExpansions must be a positive safe integer')
    expect(() => findQualityBurstCertificate(recipe, crafter, {
      ...state,
      quality: 12_500,
    }, {
      maxNodeExpansions: Number.POSITIVE_INFINITY,
    })).toThrow('maxNodeExpansions must be a positive safe integer')
  })
})
