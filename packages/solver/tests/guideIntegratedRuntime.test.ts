import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  type CrafterProfile,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  DEFAULT_GUIDE_FINISHER_NODE_LIMIT,
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
  GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedDecisionMemory,
  rebuildGuideIntegratedDecisionMemory,
  recommendGuideIntegratedAction,
} from '../src'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

function stateAt(patch: Partial<CraftState> = {}): CraftState {
  return { ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter), ...patch }
}

describe('guide-integrated runtime boundary', () => {
  it('rebuilds serializable route memory from actual actions, including undo and deviation', () => {
    const history: CraftActionId[] = [
      'reflect',
      'manipulation',
      'wasteNot2',
      'innovation',
      'greatStrides',
    ]
    const complete = rebuildGuideIntegratedDecisionMemory(history)
    expect(complete).toEqual({
      version: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
      wasteNotUses: 1,
      manipulationUses: 1,
      innovationUses: 1,
      greatStridesUses: 1,
      lastAction: 'greatStrides',
    })
    expect(JSON.parse(JSON.stringify(complete))).toEqual(complete)

    const undone = rebuildGuideIntegratedDecisionMemory(history.slice(0, -1))
    expect(undone.greatStridesUses).toBe(0)
    expect(undone.lastAction).toBe('innovation')

    const deviated = rebuildGuideIntegratedDecisionMemory([...history.slice(0, -1), 'hastyTouch'])
    expect(deviated.greatStridesUses).toBe(0)
    expect(deviated.lastAction).toBe('hastyTouch')
  })

  it('returns a concise versioned recommendation without committing supplied memory', () => {
    const memory = createGuideIntegratedDecisionMemory()
    const before = JSON.stringify(memory)
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_INGOT,
      crafter,
      stateAt(),
      { decisionMemory: memory },
    )

    expect(result).toMatchObject({
      action: 'reflect',
      phase: 'opener',
      reason: 'open-with-reflect',
      policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
      decisionMemoryVersion: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
      deadlineExceeded: false,
    })
    expect(JSON.stringify(memory)).toBe(before)
    expect(MODEL_VERSIONS.cosmicTitaniumPolicy).toBe(GUIDE_INTEGRATED_POLICY_VERSION)
  })

  it('accepts the actual current event-path history directly', () => {
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_INGOT,
      crafter,
      stateAt({ step: 2 }),
      { actualActionHistory: ['reflect', 'manipulation'] },
    )
    expect(result?.action).not.toBe('manipulation')
  })

  it('explains a Sturdy setup action by its real resource purpose', () => {
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_INGOT,
      crafter,
      stateAt({ step: 2, condition: 'sturdy', durability: 20 }),
      { actualActionHistory: ['rapidSynthesis'] },
    )
    expect(result).toMatchObject({
      action: 'manipulation',
      reason: 'maintain-durability',
    })
  })

  it('uses the score-preserving deterministic certificate cap and enforces the web deadline contract', () => {
    expect(DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG.finisherSearchNodeLimit)
      .toBe(DEFAULT_GUIDE_FINISHER_NODE_LIMIT)
    expect(() => recommendGuideIntegratedAction(
      COSMIC_TITANIUM_INGOT,
      crafter,
      stateAt(),
      { deadlineMs: 3_001 },
    )).toThrow(/no greater than 3000/)
  })

  it('returns null for an already terminal session', () => {
    expect(recommendGuideIntegratedAction(
      COSMIC_TITANIUM_INGOT,
      crafter,
      stateAt({ terminal: 'failed', failureReason: 'durability-depleted' }),
    )).toBeNull()
  })
})
