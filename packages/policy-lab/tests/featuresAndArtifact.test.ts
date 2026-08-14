import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  HARDENED_SURVEY_PLANK,
  HARDENED_SURVEY_PLANK_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_MECHANICS_VERSION,
  MATERIAL_CONDITIONS,
  createInitialCraftState,
  type CraftObjective,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  CRAFTER_MECHANICS_SIGNATURE_VERSION,
  POLICY_FEATURE_SCHEMA,
  POLICY_FEATURE_SCHEMA_VERSION,
  assertCompactScorerCompatible,
  crafterMechanicsSignature,
  encodePolicyState,
  trainCompactScorer,
  type CompactScorerArtifact,
  type LabeledPolicyState,
  type RouteScore,
} from '../src'

const crafter = PLAYER_EQUIPMENT_PROFILES[1]!.crafter

const scenarios = [
  [COSMIC_TITANIUM_INGOT, COSMIC_TITANIUM_INGOT_OBJECTIVE],
  [COSMIC_TITANIUM_NAILS, COSMIC_TITANIUM_NAILS_OBJECTIVE],
  [HARDENED_SURVEY_PLANK, HARDENED_SURVEY_PLANK_OBJECTIVE],
  [MOBILE_WORK_STAIRS, MOBILE_WORK_STAIRS_OBJECTIVE],
  [SURVEY_CRAFTSMANS_COMMAND_BREW, SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE],
] as const

function featureIndex(name: (typeof POLICY_FEATURE_SCHEMA)[number]): number {
  const index = POLICY_FEATURE_SCHEMA.indexOf(name)
  if (index < 0) throw new Error(`missing feature ${name}`)
  return index
}

function routeScore(): RouteScore {
  return {
    robustCompletionRate: 1,
    averageCompletionRate: 1,
    failureRate: 0,
    hardStopRate: 0,
    nonCompletionRate: 0,
    stopReasonRates: {
      completed: 1,
      failed: 0,
      'policy-null': 0,
      'no-legal-action': 0,
      'illegal-action': 0,
      'action-limit': 0,
    },
    lowerTailBalance: 1,
    averageBalance: 1,
    averageViableProgressRatio: 1,
    averageViableQualityRatio: 1,
    averageSuccessfulCp: 0,
    averageSuccessfulDurability: 0,
    averageSteps: 1,
    averageSuccessfulSteps: 1,
  }
}

function trainingLabel(state: CraftState): LabeledPolicyState {
  return {
    objectiveId: COSMIC_TITANIUM_NAILS_OBJECTIVE.objectiveId,
    state,
    best: {
      action: 'muscleMemory',
      continuationPolicyId: 'fixture',
      score: routeScore(),
      episodeCount: 1,
    },
    alternatives: [],
  }
}

describe('objective-aware finite policy features', () => {
  it('returns one finite, fixed-schema vector for every current product recipe', () => {
    for (const [recipe, objective] of scenarios) {
      const vector = encodePolicyState(
        recipe,
        objective,
        crafter,
        createInitialCraftState(recipe, crafter),
      )
      expect(vector, recipe.profileId).toHaveLength(POLICY_FEATURE_SCHEMA.length)
      expect(vector.every(Number.isFinite), recipe.profileId).toBe(true)
    }
  })

  it('represents all eight material conditions with distinct one-hot entries', () => {
    const featureByCondition: Record<MaterialCondition, (typeof POLICY_FEATURE_SCHEMA)[number]> = {
      normal: 'condition-normal',
      good: 'condition-good',
      goodOmen: 'condition-good-omen',
      centered: 'condition-centered',
      sturdy: 'condition-sturdy',
      pliant: 'condition-pliant',
      malleable: 'condition-malleable',
      primed: 'condition-primed',
    }
    const conditionIndexes = MATERIAL_CONDITIONS.map((condition) => (
      featureIndex(featureByCondition[condition])
    ))

    for (const condition of MATERIAL_CONDITIONS) {
      const [recipe, objective] = condition === 'goodOmen' || condition === 'primed'
        ? [HARDENED_SURVEY_PLANK, HARDENED_SURVEY_PLANK_OBJECTIVE]
        : [COSMIC_TITANIUM_INGOT, COSMIC_TITANIUM_INGOT_OBJECTIVE]
      const initial = createInitialCraftState(recipe, crafter)
      const vector = encodePolicyState(recipe, objective, crafter, { ...initial, condition })
      expect(conditionIndexes.reduce((sum, index) => sum + vector[index]!, 0), condition).toBe(1)
      expect(vector[featureIndex(featureByCondition[condition])], condition).toBe(1)
    }
  })

  it('uses objective target and mode without treating requiredQuality zero as completion', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    const state = {
      ...initial,
      quality: Math.floor(COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget / 2),
    }
    const targetVector = encodePolicyState(
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      crafter,
      state,
    )
    const maxObjective: CraftObjective = {
      ...COSMIC_TITANIUM_NAILS_OBJECTIVE,
      objectiveId: 'cosmotized-ilmenite-nails-mechanics-max-test-v1',
      qualityTarget: COSMIC_TITANIUM_NAILS.qualityMax,
    }
    const maxVector = encodePolicyState(COSMIC_TITANIUM_NAILS, maxObjective, crafter, state)

    expect(targetVector[featureIndex('quality-objective-ratio')]).toBeCloseTo(0.5, 4)
    expect(targetVector[featureIndex('objective-mode-maximize-quality-with-safe-completion')]).toBe(1)
    expect(targetVector[featureIndex('mechanics-required-quality-objective-ratio')]).toBe(0)
    expect(targetVector).not.toEqual(maxVector)
  })

  it('normalizes absent specialist to false and exposes explicit specialist access', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const legacyCrafter = { ...crafter, specialist: undefined }
    const explicitNonSpecialist = { ...crafter, specialist: false }
    const specialist = { ...crafter, specialist: true }
    const legacy = encodePolicyState(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      legacyCrafter,
      initial,
    )
    const explicit = encodePolicyState(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      explicitNonSpecialist,
      initial,
    )
    const specialistVector = encodePolicyState(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      specialist,
      initial,
    )

    expect(legacy).toEqual(explicit)
    expect(legacy[featureIndex('crafter-specialist')]).toBe(0)
    expect(specialistVector[featureIndex('crafter-specialist')]).toBe(1)
  })

  it('encodes every specialist-use resource that can change future legal actions', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, {
      ...crafter,
      specialist: true,
    })
    const depleted = {
      ...initial,
      trainedPerfectionAvailable: false,
      trainedPerfectionActive: true,
      carefulObservationUsesLeft: 1,
      heartAndSoulAvailable: false,
      heartAndSoulActive: true,
      quickInnovationAvailable: false,
    }
    const vector = encodePolicyState(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      { ...crafter, specialist: true },
      depleted,
    )

    expect(vector[featureIndex('trained-perfection-available')]).toBe(0)
    expect(vector[featureIndex('trained-perfection-active')]).toBe(1)
    expect(vector[featureIndex('careful-observation-uses-left')]).toBeCloseTo(1 / 3)
    expect(vector[featureIndex('heart-and-soul-available')]).toBe(0)
    expect(vector[featureIndex('heart-and-soul-active')]).toBe(1)
    expect(vector[featureIndex('quick-innovation-available')]).toBe(0)
  })

  it('rejects an objective belonging to another recipe before encoding', () => {
    expect(() => encodePolicyState(
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )).toThrow(/does not belong/)
  })
})

describe('compact scorer artifact migration', () => {
  function artifact(): CompactScorerArtifact {
    const legacyCrafter = { ...crafter, specialist: undefined }
    return trainCompactScorer(
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      legacyCrafter,
      [trainingLabel(createInitialCraftState(COSMIC_TITANIUM_NAILS, legacyCrafter))],
      { epochs: 1, hiddenUnits: 4, seed: 17 },
    )
  }

  it('locks schema, objective, normalized crafter, and recipe mechanics signature', () => {
    const trained = artifact()
    expect(trained.featureSchemaVersion).toBe(POLICY_FEATURE_SCHEMA_VERSION)
    expect(trained.mechanicsModelVersion).toBe(CRAFT_MECHANICS_VERSION)
    expect(trained.objective).toEqual({
      objectiveId: COSMIC_TITANIUM_NAILS_OBJECTIVE.objectiveId,
      mode: COSMIC_TITANIUM_NAILS_OBJECTIVE.mode,
      qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget,
    })
    expect(trained.crafterProfile.specialist).toBe(false)
    expect(trained.crafterMechanicsSignatureVersion).toBe(CRAFTER_MECHANICS_SIGNATURE_VERSION)
    expect(trained.crafterMechanicsSignature).toBe(crafterMechanicsSignature(
      COSMIC_TITANIUM_NAILS,
      crafter,
    ))
    expect(() => assertCompactScorerCompatible(
      trained,
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      { ...crafter, specialist: false },
    )).not.toThrow()
  })

  it('rejects objective identity or target drift', () => {
    const trained = artifact()
    expect(() => trainCompactScorer(
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      crafter,
      [{
        ...trainingLabel(createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)),
        objectiveId: 'different-objective',
      }],
      { epochs: 1, hiddenUnits: 4 },
    )).toThrow(/labels do not belong/)
    expect(() => assertCompactScorerCompatible(
      trained,
      COSMIC_TITANIUM_NAILS,
      { ...COSMIC_TITANIUM_NAILS_OBJECTIVE, objectiveId: 'different-objective' },
      crafter,
    )).toThrow(/objective identity mismatch/)
    expect(() => assertCompactScorerCompatible(
      trained,
      COSMIC_TITANIUM_NAILS,
      { ...COSMIC_TITANIUM_NAILS_OBJECTIVE, qualityTarget: COSMIC_TITANIUM_NAILS.qualityMax },
      crafter,
    )).toThrow(/objective identity mismatch/)
  })

  it('requires retraining for legacy schema and rejects stale mechanics signatures', () => {
    const trained = artifact()
    const legacy = ({
      ...trained,
      version: 'offline-compact-action-scorer-poc-v0.6.0',
    } as unknown as CompactScorerArtifact)
    expect(() => assertCompactScorerCompatible(
      legacy,
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      crafter,
    )).toThrow(/retraining required/)

    expect(() => assertCompactScorerCompatible(
      { ...trained, crafterMechanicsSignature: 'stale-signature' },
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      crafter,
    )).toThrow(/mechanics signature mismatch/)

    expect(() => assertCompactScorerCompatible(
      { ...trained, mechanicsModelVersion: 'stale-mechanics' as typeof CRAFT_MECHANICS_VERSION },
      COSMIC_TITANIUM_NAILS,
      COSMIC_TITANIUM_NAILS_OBJECTIVE,
      crafter,
    )).toThrow(/mechanics model version mismatch/)
  })
})
