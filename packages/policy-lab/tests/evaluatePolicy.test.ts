import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  previewAction,
  type CrafterProfile,
  type SourceMetadata,
} from '@frozen-rabbit-expert/domain'
import {
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
} from '@frozen-rabbit-expert/simulator'
import {
  CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
  CRAFTER_GROUP_KEY_FIELDS,
  CRAFTER_POPULATION_MANIFEST_VERSION,
  crafterMechanicsSignature,
  decidePromotion,
  evaluatePolicyPopulationHeldOut,
  normalizeCrafterProfile,
  type CrafterGroupedSplitManifestV1,
  type CrafterPopulationManifestV1,
  type HeldOutPolicyResult,
  type PopulationHeldOutEvaluationOptions,
  type RouteScore,
} from '../src'

function score(overrides: Partial<RouteScore> = {}): RouteScore {
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
    averageSteps: 25,
    averageSuccessfulSteps: 25,
    ...overrides,
  }
}

function result(routeScore: RouteScore): HeldOutPolicyResult {
  return { score: routeScore, episodeCount: 1_000, safetyViolations: 0 }
}

const source: SourceMetadata = {
  sourceKind: 'empirical',
  patch: '7.51',
  verifiedAt: '2026-08-14',
  confidence: 'verified',
}

function evaluationEvidence(): {
  population: CrafterPopulationManifestV1
  split: CrafterGroupedSplitManifestV1
} {
  const definitions = [
    {
      id: 'unseen-interpolation',
      groupId: 'unseen-interpolation-group',
      crafter: normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[1]!.crafter),
      provenance: 'loadout-derived' as const,
    },
    {
      id: 'ood-low-cp',
      groupId: 'ood-low-cp-group',
      crafter: normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[0]!.crafter),
      provenance: 'boundary-probe' as const,
    },
    {
      id: 'held-out-boundary',
      groupId: 'held-out-boundary-group',
      crafter: normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[2]!.crafter),
      provenance: 'boundary-probe' as const,
    },
    {
      id: 'non-held-out-control',
      groupId: 'non-held-out-control-group',
      crafter: normalizeCrafterProfile({
        ...PLAYER_EQUIPMENT_PROFILES[2]!.crafter,
        maxCp: PLAYER_EQUIPMENT_PROFILES[2]!.crafter.maxCp + 10,
      }),
      provenance: 'loadout-derived' as const,
    },
  ]
  const population: CrafterPopulationManifestV1 = {
    version: CRAFTER_POPULATION_MANIFEST_VERSION,
    populationId: 'held-out-evaluator-test-v1',
    patch: '7.51',
    recipeScope: [COSMIC_TITANIUM_NAILS.profileId],
    profiles: definitions.map((definition) => ({
      ...definition,
      source,
      tags: ['held-out-test'],
      mechanicsSignatureByRecipe: {
        [COSMIC_TITANIUM_NAILS.profileId]: crafterMechanicsSignature(
          COSMIC_TITANIUM_NAILS,
          definition.crafter,
        ),
      },
    })),
  }
  return {
    population,
    split: {
      version: CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
      splitId: 'held-out-evaluator-split-v1',
      populationId: population.populationId,
      groupKeyFields: CRAFTER_GROUP_KEY_FIELDS,
      trainGroupIds: ['non-held-out-control-group'],
      validationGroupIds: [],
      heldOutInterpolationGroupIds: ['unseen-interpolation-group'],
      heldOutBoundaryGroupIds: ['held-out-boundary-group'],
      reservedFinalGroupIds: [],
      oodProbeGroupIds: ['ood-low-cp-group'],
      seedCorpusIdsByRole: {
        train: ['train-seeds-v1'],
        heldOutInterpolation: ['interpolation-seeds-v1'],
        heldOutBoundary: ['boundary-seeds-v1'],
        oodProbe: ['ood-seeds-v1'],
      },
    },
  }
}

function evaluationOptions(
  evidence = evaluationEvidence(),
): PopulationHeldOutEvaluationOptions {
  return {
    ...evidence,
    populationRecipes: [COSMIC_TITANIUM_NAILS],
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    profiles: [NORMAL_HEAVY_POC_CONDITIONS],
    seedCorporaByRole: {
      heldOutInterpolation: { corpusId: 'interpolation-seeds-v1', seeds: [11, 29] },
      heldOutBoundary: { corpusId: 'boundary-seeds-v1', seeds: [11, 29] },
      oodProbe: { corpusId: 'ood-seeds-v1', seeds: [11, 29] },
    },
    maxEpisodeSteps: 2,
  }
}

describe('held-out policy promotion', () => {
  it('accepts a materially shorter route when near-perfect completion is preserved', () => {
    const baseline = result(score({
      averageSuccessfulCp: 100,
      averageSuccessfulDurability: 20,
    }))
    const candidate = result(score({
      averageSuccessfulSteps: 24,
      averageSteps: 24,
      averageSuccessfulCp: 0,
      averageSuccessfulDurability: 5,
    }))

    expect(decidePromotion(baseline, candidate)).toEqual({
      promote: true,
      reasons: [],
      basis: 'near-perfect-efficiency',
    })
  })

  it('does not trade observed completion away for a shorter route', () => {
    const baseline = result(score())
    const candidate = result(score({
      robustCompletionRate: 0.99,
      averageCompletionRate: 0.99,
      nonCompletionRate: 0.01,
      averageSuccessfulSteps: 20,
      averageSteps: 20,
      stopReasonRates: {
        completed: 0.99,
        failed: 0,
        'policy-null': 0,
        'no-legal-action': 0,
        'illegal-action': 0,
        'action-limit': 0.01,
      },
    }))

    const decision = decidePromotion(baseline, candidate)
    expect(decision.promote).toBe(false)
    expect(decision.basis).toBeNull()
    expect(decision.reasons).toContain('no-completion-or-near-perfect-efficiency-gain')
    expect(decision.reasons).toContain('stall-rate-regression')
  })

  it('keeps unseen equipment results separate before reporting worst-profile and OOD metrics', () => {
    const evidence = evaluationEvidence()
    const inDistribution = normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[1]!.crafter)
    const outOfDistribution = normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[0]!.crafter)
    const boundary = normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[2]!.crafter)
    const nearCompletion = (crafter: typeof inDistribution) => {
      const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
      const gain = previewAction(COSMIC_TITANIUM_NAILS, crafter, initial, 'basicSynthesis').progressGain
      return {
        ...initial,
        progress: COSMIC_TITANIUM_NAILS.progressRequired - gain,
      }
    }
    let timestamp = 0
    const requestedCases = [
      {
        profileId: 'unseen-interpolation',
        initialStateCorpusId: 'near-completion-interpolation-v1',
        initialStates: [nearCompletion(inDistribution)],
        // These forged values are deliberately ignored; manifest identity wins.
        groupId: 'forged-group',
        crafter: outOfDistribution,
        coverage: 'out-of-distribution',
      },
      {
        profileId: 'held-out-boundary',
        initialStateCorpusId: 'near-completion-boundary-v1',
        initialStates: [nearCompletion(boundary)],
      },
      {
        profileId: 'ood-low-cp',
        initialStateCorpusId: 'near-completion-ood-v1',
        initialStates: [nearCompletion(outOfDistribution)],
      },
    ]
    const result = evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      (crafterCase) => crafterCase.coverage === 'out-of-distribution'
        ? () => null
        : () => 'basicSynthesis',
      {
        ...evaluationOptions(evidence),
        now: () => timestamp++,
      },
    )

    expect(result.episodeCount).toBe(6)
    expect(result.perCrafter.map(({ profileId, score: profileScore }) => [
      profileId,
      profileScore.robustCompletionRate,
    ])).toEqual([
      ['unseen-interpolation', 1],
      ['held-out-boundary', 1],
      ['ood-low-cp', 0],
    ])
    expect(result.perCrafter[0]).toMatchObject({
      groupId: 'unseen-interpolation-group',
      splitRole: 'heldOutInterpolation',
      coverage: 'held-out-interpolation',
      seedCorpusId: 'interpolation-seeds-v1',
      initialStateCorpusId: 'near-completion-interpolation-v1',
    })
    expect(JSON.parse(result.perCrafter[0]!.caseKey)).toContain('near-completion-interpolation-v1')
    expect(result.coverageScores['held-out-interpolation']!.robustCompletionRate).toBe(1)
    expect(result.coverageScores['held-out-boundary']!.robustCompletionRate).toBe(1)
    expect(result.coverageScores['out-of-distribution']!.robustCompletionRate).toBe(0)
    expect(result.worstProfileId).toBe('ood-low-cp')
    expect(result.worstProfileCompletionRate).toBe(0)
    expect(result.worstDecileCompletionRate).toBe(0)
    expect(result.score.robustCompletionRate).toBe(0)
    expect(result.score.averageCompletionRate).toBeCloseTo(2 / 3)
    expect(result.policyCallbackLatency).toEqual({
      decisionCount: 6,
      p50Ms: 1,
      p95Ms: 1,
      p99Ms: 1,
      maxMs: 1,
    })
    expect(result.policyFactoryColdStartLatency).toEqual({
      factoryInvocationCount: 6,
      p50Ms: 1,
      p95Ms: 1,
      p99Ms: 1,
      maxMs: 1,
    })
    expect(result.worstProfilePolicyCallbackP95).toEqual({
      profileId: 'held-out-boundary',
      p95Ms: 1,
    })
  })

  it('refuses cherry-picked held-out groups and undeclared seed corpora', () => {
    const evidence = evaluationEvidence()
    const interpolation = evidence.population.profiles.find((profile) => (
      profile.id === 'unseen-interpolation'
    ))!
    const boundary = evidence.population.profiles.find((profile) => (
      profile.id === 'held-out-boundary'
    ))!
    const partialCases = [interpolation, boundary].map((profile) => ({
      profileId: profile.id,
      initialStateCorpusId: `${profile.id}-states-v1`,
      initialStates: [createInitialCraftState(COSMIC_TITANIUM_NAILS, profile.crafter)],
    }))

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      partialCases,
      () => () => null,
      evaluationOptions(evidence),
    )).toThrow(/missing oodProbe group: ood-low-cp-group/)

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      partialCases,
      () => () => null,
      {
        ...evaluationOptions(evidence),
        seedCorporaByRole: {
          ...evaluationOptions(evidence).seedCorporaByRole,
          heldOutBoundary: { corpusId: 'not-in-the-split', seeds: [11] },
        },
      },
    )).toThrow(/not declared by split/)
  })

  it.each(['train', 'validation', 'reservedFinal'] as const)(
    'does not let a %s group masquerade as held-out evidence',
    (role) => {
      const evidence = evaluationEvidence()
      const controlGroupId = 'non-held-out-control-group'
      const split: CrafterGroupedSplitManifestV1 = {
        ...evidence.split,
        trainGroupIds: role === 'train' ? [controlGroupId] : [],
        validationGroupIds: role === 'validation' ? [controlGroupId] : [],
        reservedFinalGroupIds: role === 'reservedFinal' ? [controlGroupId] : [],
      }
      const crafter = evidence.population.profiles.find((profile) => (
        profile.id === 'non-held-out-control'
      ))!.crafter
      expect(() => evaluatePolicyPopulationHeldOut(
        COSMIC_TITANIUM_NAILS,
        [{
          profileId: 'non-held-out-control',
          initialStateCorpusId: 'forged-held-out-states-v1',
          initialStates: [createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)],
        }],
        () => () => null,
        evaluationOptions({ ...evidence, split }),
      )).toThrow(new RegExp(`${role} crafter .* cannot be evaluated as held-out evidence`))
    },
  )

  it('rejects duplicate or recipe-incompatible condition profile identities', () => {
    const evidence = evaluationEvidence()
    const crafter = evidence.population.profiles[0]!.crafter
    const crafterCase = {
      profileId: 'unseen-interpolation',
      initialStateCorpusId: 'condition-validation-states-v1',
      initialStates: [createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)],
    }
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [crafterCase],
      () => () => null,
      {
        ...evaluationOptions(evidence),
        profiles: [NORMAL_HEAVY_POC_CONDITIONS, { ...NORMAL_HEAVY_POC_CONDITIONS }],
      },
    )).toThrow(/duplicate condition profile id/)
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [crafterCase],
      () => () => null,
      {
        ...evaluationOptions(evidence),
        profiles: [BALANCED_ELEVATING_PLATFORMS_CONDITIONS],
      },
    )).toThrow(/unavailable condition/)
  })

  it('rejects objective mismatch and unknown equipment identity', () => {
    const evidence = evaluationEvidence()
    const crafter = normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[1]!.crafter)
    const crafterCase = {
      profileId: 'unseen-interpolation',
      initialStateCorpusId: 'initial-v1',
      initialStates: [createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)],
    }
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [{ ...crafterCase, profileId: 'missing-profile' }],
      () => () => null,
      evaluationOptions(evidence),
    )).toThrow(/unknown held-out crafter profileId/)
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [crafterCase],
      () => () => null,
      {
        ...evaluationOptions(evidence),
        objective: { ...COSMIC_TITANIUM_NAILS_OBJECTIVE, recipeProfileId: 'wrong-recipe' },
      },
    )).toThrow(/does not belong/)
  })
})
