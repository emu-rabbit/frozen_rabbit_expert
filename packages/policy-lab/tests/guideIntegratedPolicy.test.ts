import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  type CrafterProfile,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
  SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING,
  advanceGuideIntegratedDecisionMemory,
  createGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyFactory,
  createGuideIntegratedPolicyController,
} from '../src/guideIntegratedPolicy'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

const specialistCrafter: CrafterProfile = {
  ...crafter,
  specialist: true,
}

type StateOverrides = Omit<Partial<CraftState>, 'buffs'> & {
  buffs?: Partial<CraftState['buffs']>
}

function stateAt(overrides: StateOverrides = {}): CraftState {
  const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
  return {
    ...initial,
    ...overrides,
    buffs: {
      ...initial.buffs,
      ...overrides.buffs,
    },
  }
}

function specialistStateAt(overrides: StateOverrides = {}): CraftState {
  const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, specialistCrafter)
  return {
    ...initial,
    ...overrides,
    buffs: {
      ...initial.buffs,
      ...overrides.buffs,
    },
  }
}

function decide(policy: ReturnType<ReturnType<typeof createGuideIntegratedPolicyFactory>>, state: CraftState) {
  return policy(COSMIC_TITANIUM_INGOT, crafter, state)
}

describe('guide-integrated research policy', () => {
  it('opens with Reflect', () => {
    const policy = createGuideIntegratedPolicyFactory()()

    expect(decide(policy, stateAt())).toBe('reflect')
  })

  it('uses Heart and Soul only as the proven low-CP Tricks bridge for a specialist', () => {
    const controller = createGuideIntegratedPolicyController()
    const bridgeState = specialistStateAt({
      step: 28,
      progress: 6_040,
      quality: 15_000,
      durability: 20,
      cp: SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING,
      condition: 'normal',
      innerQuiet: 10,
    })

    expect(controller.policy(COSMIC_TITANIUM_INGOT, specialistCrafter, bridgeState))
      .toBe('heartAndSoul')
    expect(controller.snapshot().lastAction).toBe('heartAndSoul')

    const activated = applyObservedOutcome(
      COSMIC_TITANIUM_INGOT,
      specialistCrafter,
      bridgeState,
      'heartAndSoul',
      { success: true, nextCondition: 'normal' },
    ).nextState
    expect(controller.policy(COSMIC_TITANIUM_INGOT, specialistCrafter, activated))
      .toBe('tricksOfTheTrade')
    expect(controller.snapshot().lastAction).toBe('tricksOfTheTrade')
  })

  it('does not spend Heart and Soul above the bridge ceiling or on a non-specialist', () => {
    const specialistPolicy = createGuideIntegratedPolicyFactory()()
    const ordinaryPolicy = createGuideIntegratedPolicyFactory()()
    const aboveCeiling = specialistStateAt({
      step: 12,
      cp: SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING + 1,
      condition: 'normal',
    })

    expect(specialistPolicy(COSMIC_TITANIUM_INGOT, specialistCrafter, aboveCeiling))
      .not.toBe('heartAndSoul')
    expect(decide(ordinaryPolicy, stateAt({
      step: 12,
      cp: SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING,
      condition: 'normal',
    }))).not.toBe('heartAndSoul')
  })

  it('uses an observed Good directly instead of spending Heart and Soul', () => {
    const policy = createGuideIntegratedPolicyFactory()()
    const goodState = specialistStateAt({
      step: 12,
      cp: SPECIALIST_HEART_AND_SOUL_TRICKS_CP_CEILING,
      condition: 'good',
    })

    expect(policy(COSMIC_TITANIUM_INGOT, specialistCrafter, goodState)).toBe('tricksOfTheTrade')
  })

  it('establishes early Manipulation before the first Waste Not II cycle', () => {
    const lowDurabilityPolicy = createGuideIntegratedPolicyFactory()()
    const ordinaryPolicy = createGuideIntegratedPolicyFactory()()

    expect(decide(lowDurabilityPolicy, stateAt({ step: 2, durability: 20 }))).toBe('manipulation')
    expect(decide(ordinaryPolicy, stateAt({ step: 2 }))).toBe('manipulation')
    expect(decide(ordinaryPolicy, stateAt({
      step: 3,
      durability: 60,
      buffs: { manipulation: 7 },
    }))).toBe('wasteNot2')
  })

  it('isolates usage counters between episode policies from the same factory', () => {
    const createPolicy = createGuideIntegratedPolicyFactory()
    const firstEpisode = createPolicy()
    const secondEpisode = createPolicy()
    const earlyState = stateAt({ step: 2 })

    expect(decide(firstEpisode, earlyState)).toBe('manipulation')
    expect(decide(firstEpisode, earlyState)).toBe('wasteNot2')
    expect(decide(secondEpisode, earlyState)).toBe('manipulation')
  })

  it('serializes, clones, and advances explicit usage memory by actual action', () => {
    const initial = createGuideIntegratedDecisionMemory()
    const used = ['wasteNot', 'wasteNot2', 'manipulation', 'innovation', 'greatStrides']
      .reduce(advanceGuideIntegratedDecisionMemory, initial)

    expect(initial).toEqual({
      version: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
      wasteNotUses: 0,
      manipulationUses: 0,
      innovationUses: 0,
      greatStridesUses: 0,
      lastAction: null,
    })
    expect(used).toEqual({
      version: GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
      wasteNotUses: 2,
      manipulationUses: 1,
      innovationUses: 1,
      greatStridesUses: 1,
      lastAction: 'greatStrides',
    })
    expect(JSON.parse(JSON.stringify(used))).toEqual(used)

    const controller = createGuideIntegratedPolicyController(
      DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
      used,
    )
    const snapshot = controller.snapshot()
    snapshot.wasteNotUses = 99
    expect(controller.snapshot()).toEqual(used)

    const restored = createGuideIntegratedPolicyController(
      DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
      advanceGuideIntegratedDecisionMemory(initial, 'wasteNot2'),
    )
    expect(decide(restored.policy, stateAt({ step: 2 }))).not.toBe('wasteNot2')
  })

  it('honors Daring Touch mode when Expedience is available', () => {
    const daringState = stateAt({
      step: 12,
      progress: 4500,
      quality: 3000,
      durability: 30,
      innerQuiet: 5,
      buffs: {
        wasteNot: 4,
        manipulation: 4,
        innovation: 2,
        expedience: 1,
      },
    })
    const alwaysPolicy = createGuideIntegratedPolicyFactory()()
    const neverPolicy = createGuideIntegratedPolicyFactory({
      ...DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
      daringMode: 'never',
    })()

    expect(decide(alwaysPolicy, daringState)).toBe('daringTouch')
    expect(decide(neverPolicy, daringState)).not.toBe('daringTouch')
  })

  it('switches from paid quality work to Hasty Touch only after reaching the CP reserve floor', () => {
    const lowCpPolicy = createGuideIntegratedPolicyFactory()()
    const fundedPolicy = createGuideIntegratedPolicyFactory()()
    const qualityState = stateAt({
      step: 16,
      progress: 6000,
      quality: 8000,
      durability: 30,
      innerQuiet: 7,
      buffs: {
        wasteNot: 4,
        manipulation: 4,
        innovation: 2,
      },
    })

    expect(decide(lowCpPolicy, { ...qualityState, cp: 149 })).toBe('hastyTouch')
    expect(decide(fundedPolicy, { ...qualityState, cp: 150 })).toBe('preparatoryTouch')
  })

  it('uses one durability-free Finesse before the second Manipulation on Normal', () => {
    const memoryAfterFirstManipulation = advanceGuideIntegratedDecisionMemory(
      createGuideIntegratedDecisionMemory(),
      'manipulation',
    )
    const controller = createGuideIntegratedPolicyController(
      DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
      memoryAfterFirstManipulation,
    )
    const recoveryBoundary = stateAt({
      step: 10,
      progress: 1510,
      quality: 7370,
      durability: 17,
      cp: 413,
      condition: 'normal',
      innerQuiet: 10,
      buffs: { wasteNot: 1 },
    })

    expect(decide(controller.policy, recoveryBoundary)).toBe('trainedFinesse')
    expect(decide(controller.policy, {
      ...recoveryBoundary,
      step: 11,
      quality: 8020,
      cp: 381,
      buffs: { ...recoveryBoundary.buffs, wasteNot: 0 },
    })).toBe('manipulation')
  })

  it('does not spend Byregot before its quality threshold or a finishing hit', () => {
    const policy = createGuideIntegratedPolicyFactory()()
    const earlyBurstState = stateAt({
      step: 20,
      progress: 6500,
      quality: 5000,
      durability: 30,
      innerQuiet: 8,
      buffs: {
        wasteNot: 4,
        manipulation: 4,
        innovation: 2,
        greatStrides: 2,
      },
    })

    expect(decide(policy, earlyBurstState)).toBe('preparatoryTouch')
  })

  it('uses the bounded-risk Byregot route at the seed 3366042018 decision state', () => {
    const actionsBeforeDecision = [
      'reflect',
      'manipulation',
      'preciseTouch',
      'wasteNot2',
      'rapidSynthesis',
      'rapidSynthesis',
      'innovation',
      'preparatoryTouch',
      'manipulation',
      'preparatoryTouch',
      'rapidSynthesis',
      'innovation',
      'hastyTouch',
      'daringTouch',
      'trainedFinesse',
      'rapidSynthesis',
      'rapidSynthesis',
      'trainedPerfection',
      'manipulation',
      'veneration',
      'rapidSynthesis',
      'innovation',
      'trainedFinesse',
      'preciseTouch',
      'trainedFinesse',
      'innovation',
      'trainedFinesse',
      'greatStrides',
    ] as const
    const memory = actionsBeforeDecision.reduce(
      advanceGuideIntegratedDecisionMemory,
      createGuideIntegratedDecisionMemory(),
    )
    const controller = createGuideIntegratedPolicyController(
      DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
      memory,
    )
    const decisionState = stateAt({
      step: 29,
      progress: 5285,
      quality: 13_648,
      durability: 30,
      cp: 87,
      condition: 'normal',
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
      buffs: { greatStrides: 3, innovation: 2 },
    })

    expect(decide(controller.policy, decisionState)).toBe('byregotsBlessing')
    expect(controller.snapshot().lastAction).toBe('byregotsBlessing')
  })

  it('uses a certified deterministic progress finish once quality is complete', () => {
    const policy = createGuideIntegratedPolicyFactory()()
    const finishingState = stateAt({
      step: 24,
      progress: 6700,
      quality: COSMIC_TITANIUM_INGOT.requiredQuality,
      durability: 30,
      cp: 100,
      trainedPerfectionAvailable: false,
    })

    expect(decide(policy, finishingState)).toBe('prudentSynthesis')
  })

  it('commits a certified quality burst together with its progress reserve', () => {
    const policy = createGuideIntegratedPolicyFactory()()
    const certifiedState = stateAt({
      step: 24,
      progress: 6700,
      quality: 12_500,
      durability: 30,
      cp: 200,
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
    })

    expect(decide(policy, certifiedState)).toBe('greatStrides')
  })

  it('keeps a narrow Byregot desperation route when another quality cycle is unfunded', () => {
    const policy = createGuideIntegratedPolicyFactory()()
    const desperationState = stateAt({
      step: 38,
      progress: 6100,
      quality: 17_000,
      durability: 20,
      cp: 24,
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
    })

    expect(decide(policy, desperationState)).toBe('byregotsBlessing')
  })

  it('does not start Great Strides without preserving Byregot CP', () => {
    const policy = createGuideIntegratedPolicyFactory()()
    const unfundedState = stateAt({
      step: 24,
      progress: 6700,
      quality: 14_200,
      durability: 30,
      cp: 50,
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
      buffs: { innovation: 3 },
    })

    expect(decide(policy, unfundedState)).not.toBe('greatStrides')
  })
})
