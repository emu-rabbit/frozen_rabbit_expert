import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
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
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
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

  it('uses an external objective for nails without treating requiredQuality zero as satisfied', () => {
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
      { objective: COSMIC_TITANIUM_NAILS_OBJECTIVE },
    )
    expect(result).toMatchObject({
      action: 'reflect',
      phase: 'opener',
      policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    })
    expect(MODEL_VERSIONS.cosmicTitaniumNailsPolicy)
      .toBe(NAILS_GUIDE_INTEGRATED_POLICY_VERSION)
  })

  it('cashes out the nails when another quality action would lose the proven finish', () => {
    const nailsState: CraftState = {
      ...createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
      step: 20,
      progress: 9900,
      quality: 12000,
      durability: 10,
      cp: 0,
      innerQuiet: 5,
      trainedPerfectionAvailable: false,
    }
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      nailsState,
      { objective: COSMIC_TITANIUM_NAILS_OBJECTIVE },
    )
    expect(result?.action).toBe('basicSynthesis')
  })

  it('prefers a safe Good Intensive Synthesis over the less efficient cashout action', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const nailsState: CraftState = {
      ...initial,
      step: 26,
      condition: 'good',
      progress: 6040,
      quality: 11317,
      durability: 15,
      cp: 135,
      innerQuiet: 10,
      buffs: {
        ...initial.buffs,
        innovation: 3,
        manipulation: 6,
      },
    }
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      nailsState,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        actualActionHistory: [
          'reflect', 'manipulation', 'wasteNot2', 'rapidSynthesis', 'rapidSynthesis',
          'innovation', 'preparatoryTouch', 'preparatoryTouch', 'preparatoryTouch',
          'rapidSynthesis', 'preciseTouch', 'veneration', 'rapidSynthesis',
          'rapidSynthesis', 'trainedFinesse', 'manipulation', 'preciseTouch',
          'trainedFinesse', 'preciseTouch', 'veneration', 'rapidSynthesis',
          'tricksOfTheTrade', 'manipulation', 'innovation', 'hastyTouch',
        ],
      },
    )

    expect(result).toMatchObject({
      action: 'intensiveSynthesis',
      reason: 'condition-good-progress',
    })
  })

  it('keeps improving quality when merely crossing the first tier is not the objective', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const nailsState: CraftState = {
      ...initial,
      step: 31,
      condition: 'sturdy',
      progress: 7248,
      quality: 14729,
      durability: 10,
      cp: 79,
      innerQuiet: 10,
      buffs: {
        ...initial.buffs,
        innovation: 2,
        manipulation: 1,
      },
    }
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      nailsState,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        actualActionHistory: [
          'reflect', 'manipulation', 'wasteNot2', 'rapidSynthesis', 'rapidSynthesis',
          'innovation', 'preparatoryTouch', 'preparatoryTouch', 'preparatoryTouch',
          'rapidSynthesis', 'preciseTouch', 'veneration', 'rapidSynthesis',
          'rapidSynthesis', 'trainedFinesse', 'manipulation', 'preciseTouch',
          'trainedFinesse', 'preciseTouch', 'veneration', 'rapidSynthesis',
          'tricksOfTheTrade', 'manipulation', 'innovation', 'hastyTouch',
          'intensiveSynthesis', 'trainedFinesse', 'innovation', 'hastyTouch',
          'daringTouch',
        ],
      },
    )

    expect(result?.action).toBe('trainedFinesse')
  })

  it('reserves enough CP to cash out Inner Quiet before another action spends it', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const nailsState: CraftState = {
      ...initial,
      step: 26,
      condition: 'good',
      progress: 8607,
      quality: 16209,
      durability: 20,
      cp: 36,
      innerQuiet: 10,
      buffs: {
        ...initial.buffs,
        manipulation: 5,
      },
    }
    const result = recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      nailsState,
      { objective: COSMIC_TITANIUM_NAILS_OBJECTIVE },
    )

    expect(result).toMatchObject({
      action: 'byregotsBlessing',
      reason: 'quality-finisher',
    })
  })

  it('requires a positive objective for recipes whose mechanics quality minimum is zero', () => {
    expect(() => recommendGuideIntegratedAction(
      COSMIC_TITANIUM_NAILS,
      crafter,
      createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )).toThrow(/qualityTarget/i)
  })
})
