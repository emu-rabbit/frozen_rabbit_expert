import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  HARDENED_SURVEY_PLANK,
  HARDENED_SURVEY_PLANK_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
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
  DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
  GUIDE_INTEGRATED_POLICY_VERSION,
  HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
  MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
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
      actionUses: 5,
      lastQualityActionUse: 1,
      lastPreciseTouchActionUse: 0,
      wasteNotUses: 1,
      manipulationUses: 1,
      innovationUses: 1,
      greatStridesUses: 1,
      lastAction: 'greatStrides',
    })
    expect(JSON.parse(JSON.stringify(complete))).toEqual(complete)

    const undone = rebuildGuideIntegratedDecisionMemory(history.slice(0, -1))
    expect(undone.greatStridesUses).toBe(0)
    expect(undone.actionUses).toBe(4)
    expect(undone.lastAction).toBe('innovation')

    const deviated = rebuildGuideIntegratedDecisionMemory([...history.slice(0, -1), 'hastyTouch'])
    expect(deviated.greatStridesUses).toBe(0)
    expect(deviated.lastQualityActionUse).toBe(5)
    expect(deviated.lastAction).toBe('hastyTouch')

    const withNoStepAction = rebuildGuideIntegratedDecisionMemory([...history, 'carefulObservation'])
    expect(withNoStepAction.actionUses).toBe(6)
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
    expect(MODEL_VERSIONS.scenarioPolicies['cosmotized-ilmenite-ingot']).toBe(GUIDE_INTEGRATED_POLICY_VERSION)
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
    expect(MODEL_VERSIONS.scenarioPolicies['cosmotized-ilmenite-nails'])
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

  it('binds each Elevating Platforms recipe to its own policy version', () => {
    const nonSpecialist = { ...crafter, specialist: false }
    const plank = recommendGuideIntegratedAction(
      HARDENED_SURVEY_PLANK,
      nonSpecialist,
      createInitialCraftState(HARDENED_SURVEY_PLANK, nonSpecialist),
      {
        objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
        config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
        policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
      },
    )
    const stairs = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      nonSpecialist,
      createInitialCraftState(MOBILE_WORK_STAIRS, nonSpecialist),
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        config: {
          ...DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
          adaptiveByregotCashoutCpCeiling: 100,
          adaptiveByregotMinimumProjectedQualityRatio: 0.70,
        },
        policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
      },
    )
    expect(plank).toMatchObject({ action: 'reflect', policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION })
    expect(stairs).toMatchObject({ action: 'reflect', policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION })
    expect(MODEL_VERSIONS.scenarioPolicies['hardened-survey-plank']).toBe(plank?.policyVersion)
    expect(MODEL_VERSIONS.scenarioPolicies['mobile-work-stairs']).toBe(stairs?.policyVersion)
  })

  it('uses a certified Innovation setup before the adaptive stairs Byregot cashout', () => {
    const initial = createInitialCraftState(MOBILE_WORK_STAIRS, crafter)
    const stairsState: CraftState = {
      ...initial,
      step: 24,
      progress: 7600,
      quality: 12000,
      durability: 30,
      cp: 100,
      innerQuiet: 10,
      trainedPerfectionAvailable: false,
      buffs: {
        ...initial.buffs,
        greatStrides: 2,
      },
    }
    const result = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      stairsState,
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        config: {
          ...DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
          adaptiveByregotCashoutCpCeiling: 100,
        },
        policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
      },
    )

    expect(result).toMatchObject({
      action: 'innovation',
      reason: 'activate-quality-buff',
    })

    const blockedByProjectedQuality = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      stairsState,
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        config: {
          ...DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
          adaptiveByregotCashoutCpCeiling: 100,
          adaptiveByregotMinimumProjectedQualityRatio: 0.95,
        },
        policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
      },
    )
    expect(blockedByProjectedQuality).toMatchObject({
      action: 'byregotsBlessing',
      reason: 'quality-finisher',
    })
  })

  it('spends an observed post-reserve Malleable on progress when the exact profile enables it', () => {
    const initial = createInitialCraftState(MOBILE_WORK_STAIRS, crafter)
    const stairsState: CraftState = {
      ...initial,
      step: 25,
      progress: 7000,
      quality: 18000,
      durability: 30,
      cp: 200,
      condition: 'malleable',
    }
    const shared = {
      ...DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
      adaptiveByregotCashoutCpCeiling: 100,
      adaptiveByregotMinimumProjectedQualityRatio: 0.75,
      adaptiveGoodQualityExtensionActionBudget: 36,
    }
    const before = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      stairsState,
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        actualActionHistory: ['wasteNot2'],
        config: { ...shared, consumeMalleableBeforeVeneration: false },
      },
    )
    const after = recommendGuideIntegratedAction(
      MOBILE_WORK_STAIRS,
      crafter,
      stairsState,
      {
        objective: MOBILE_WORK_STAIRS_OBJECTIVE,
        actualActionHistory: ['wasteNot2'],
        config: { ...shared, consumeMalleableBeforeVeneration: true },
      },
    )

    expect(before?.action).toBe('veneration')
    expect(after).toMatchObject({ action: 'rapidSynthesis', reason: 'condition-malleable-progress' })
  })

  it('takes a deterministic plank progress prefix only when it unlocks the full joint certificate', () => {
    const plankCrafter: CrafterProfile = {
      level: 100,
      craftsmanship: 5408,
      control: 5140,
      maxCp: 630,
      cosmicToolGoodBonus: true,
      specialist: false,
    }
    const plankState: CraftState = {
      step: 21,
      progress: 3488,
      quality: 9420,
      durability: 15,
      cp: 95,
      condition: 'sturdy',
      innerQuiet: 10,
      buffs: {
        wasteNot: 0,
        veneration: 0,
        greatStrides: 0,
        innovation: 6,
        finalAppraisal: 0,
        manipulation: 6,
        muscleMemory: 0,
        expedience: 0,
      },
      comboFrom: null,
      trainedPerfectionAvailable: false,
      trainedPerfectionActive: false,
      carefulObservationUsesLeft: 0,
      heartAndSoulAvailable: false,
      heartAndSoulActive: false,
      quickInnovationAvailable: false,
      terminal: 'none',
      failureReason: null,
    }
    const actualActionHistory: CraftActionId[] = [
      'reflect', 'manipulation', 'veneration', 'wasteNot2', 'rapidSynthesis',
      'rapidSynthesis', 'innovation', 'preparatoryTouch', 'manipulation',
      'preparatoryTouch', 'veneration', 'innovation', 'preciseTouch',
      'preciseTouch', 'trainedPerfection', 'rapidSynthesis', 'carefulSynthesis',
      'manipulation', 'preciseTouch', 'innovation',
    ]
    const withoutJointPrefix = recommendGuideIntegratedAction(
      HARDENED_SURVEY_PLANK,
      plankCrafter,
      plankState,
      {
        objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
        actualActionHistory,
        config: {
          ...DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
          requiredQualityProgressPrefixCertificate: false,
        },
      },
    )
    const withJointPrefix = recommendGuideIntegratedAction(
      HARDENED_SURVEY_PLANK,
      plankCrafter,
      plankState,
      {
        objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
        actualActionHistory,
        config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
      },
    )

    expect(withoutJointPrefix?.action).toBe('preparatoryTouch')
    expect(withJointPrefix).toMatchObject({
      action: 'carefulSynthesis',
      reason: 'condition-sturdy-value',
    })
  })
})
