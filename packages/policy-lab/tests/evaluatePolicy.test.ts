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
  type CraftState,
  type RecipeProfile,
  type SourceMetadata,
} from '@frozen-rabbit-expert/domain'
import {
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
  type EpisodePolicy,
} from '@frozen-rabbit-expert/simulator'
import {
  CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
  CRAFTER_GROUP_KEY_FIELDS,
  CRAFTER_POPULATION_MANIFEST_VERSION,
  canonicalCrafterGroupedSplitManifestContentHash,
  canonicalCrafterPopulationManifestContentHash,
  canonicalEvidenceContentHash,
  crafterMechanicsSignature,
  createEvaluationCorpusSealManifest,
  compareDevelopmentPolicies,
  decideSealedPopulationPromotion,
  evaluatePolicyHeldOut,
  evaluatePolicyPopulationHeldOut,
  normalizeCrafterProfile,
  populationHeldOutEvaluationSetupContentHash,
  sealInitialStateCorpus,
  sealSeedCorpus,
  sealedPopulationEvidenceNotProvidedDecision,
  type CrafterEvidenceSnapshotV1,
  type CrafterGroupedSplitManifestV4,
  type CrafterPopulationManifestV2,
  type CrafterPopulationProfileV2,
  type HeldOutCrafterEvaluationCase,
  type HeldOutPolicyResult,
  type PopulationHeldOutEvaluationOptions,
  type PopulationHeldOutPolicyResult,
  type SealedPopulationPromotionExpectedAnchors,
  type RouteScore,
  type Sha256ContentHash,
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

const calculatorSourceRevision = 'synthetic-unit-test-calculator-output-v1'
const calculatorSource: SourceMetadata = {
  sourceKind: 'empirical',
  sourceRevision: calculatorSourceRevision,
  patch: '7.51',
  verifiedAt: '2026-08-14',
  confidence: 'provisional',
  notes: ['Synthetic evaluator fixture; not evidence of a real unseen player loadout.'],
}

function contentHash(index: number): Sha256ContentHash {
  return `sha256:${index.toString(16).padStart(64, '0')}` as Sha256ContentHash
}

function snapshot(
  snapshotId: string,
  hashIndex: number,
  sourceRevision: string,
): CrafterEvidenceSnapshotV1 {
  return {
    snapshotId,
    version: 'synthetic-unit-test-snapshot-v1',
    sourceId: 'synthetic-evaluate-policy-test-fixtures',
    sourceRevision,
    contentHash: contentHash(hashIndex),
  }
}

function syntheticCalculatorProfile(
  id: string,
  groupId: string,
  crafter: Readonly<CrafterProfile>,
  hashBase: number,
): CrafterPopulationProfileV2 {
  const normalizedCrafter = normalizeCrafterProfile(crafter)
  return {
    id,
    groupId,
    splitFamilyId: `${id}-synthetic-loadout-family`,
    crafter: normalizedCrafter,
    provenance: 'loadout-derived',
    evidenceRole: 'population',
    derivation: {
      kind: 'versioned-calculator',
      snapshot: snapshot(`${id}-result`, hashBase, calculatorSourceRevision),
      calculatorId: 'synthetic-unit-test-loadout-calculator',
      calculatorVersion: 'synthetic-unit-test-v1',
      calculatorSourceRevision: 'synthetic-unit-test-calculator-source-v1',
      calculatorContentHash: contentHash(900),
      inputSnapshot: snapshot(
        `${id}-input`,
        hashBase + 1,
        'synthetic-unit-test-loadout-input-v1',
      ),
      gameDataSnapshot: snapshot(
        'shared-game-data',
        901,
        'synthetic-unit-test-game-data-v1',
      ),
      calculatedCrafter: normalizedCrafter,
    },
    source: calculatorSource,
    tags: ['synthetic-unit-test-only', 'not-real-unseen-loadout-evidence'],
    mechanicsSignatureByRecipe: {
      [COSMIC_TITANIUM_NAILS.profileId]: crafterMechanicsSignature(
        COSMIC_TITANIUM_NAILS,
        normalizedCrafter,
      ),
    },
  }
}

function syntheticBoundaryProbeProfile(
  baseProfile: Readonly<CrafterPopulationProfileV2>,
): CrafterPopulationProfileV2 {
  const baseCrafter = baseProfile.crafter
  const crafter = { ...baseCrafter, maxCp: baseCrafter.maxCp - 100 }
  const sourceRevision = 'synthetic-unit-test-boundary-output-v1'
  return {
    id: 'synthetic-ood-low-cp-probe',
    groupId: 'synthetic-ood-low-cp-probe-group',
    splitFamilyId: baseProfile.splitFamilyId,
    crafter,
    provenance: 'boundary-probe',
    evidenceRole: 'adversarial',
    derivation: {
      kind: 'boundary-probe',
      snapshot: snapshot('synthetic-ood-probe-result', 300, sourceRevision),
      generatorId: 'synthetic-unit-test-boundary-generator',
      generatorVersion: 'synthetic-unit-test-v1',
      generatorSourceRevision: 'synthetic-unit-test-boundary-generator-source-v1',
      generatorContentHash: contentHash(301),
      inputSnapshot: baseProfile.derivation.snapshot,
      basePopulationId: 'synthetic-held-out-evaluator-test-v2',
      baseProfileId: baseProfile.id,
      changedFields: ['maxCp'],
      purpose: 'Exercise the OOD-only boundary-probe evaluator contract.',
      generatedCrafter: crafter,
    },
    source: {
      sourceKind: 'assumption',
      sourceRevision,
      patch: '7.51',
      verifiedAt: '2026-08-20',
      confidence: 'unknown',
      notes: ['Synthetic OOD probe; not player population evidence.'],
    },
    tags: ['synthetic-unit-test-only', 'boundary-probe'],
    mechanicsSignatureByRecipe: {
      [COSMIC_TITANIUM_NAILS.profileId]: crafterMechanicsSignature(
        COSMIC_TITANIUM_NAILS,
        crafter,
      ),
    },
  }
}

function evaluationEvidence(): {
  population: CrafterPopulationManifestV2
  split: CrafterGroupedSplitManifestV4
} {
  const interpolationProfile = syntheticCalculatorProfile(
    'synthetic-interpolation-fixture',
    'synthetic-interpolation-fixture-group',
    PLAYER_EQUIPMENT_PROFILES[1]!.crafter,
    100,
  )
  const controlProfile = syntheticCalculatorProfile(
    'synthetic-control-fixture',
    'synthetic-control-fixture-group',
    {
      ...PLAYER_EQUIPMENT_PROFILES[2]!.crafter,
      maxCp: PLAYER_EQUIPMENT_PROFILES[2]!.crafter.maxCp + 10,
    },
    400,
  )
  const definitions = [
    interpolationProfile,
    syntheticBoundaryProbeProfile(controlProfile),
    syntheticCalculatorProfile(
      'synthetic-held-out-boundary-fixture',
      'synthetic-held-out-boundary-fixture-group',
      PLAYER_EQUIPMENT_PROFILES[2]!.crafter,
      200,
    ),
    controlProfile,
    syntheticCalculatorProfile(
      'synthetic-non-heldout-fixture',
      'synthetic-non-heldout-fixture-group',
      {
        ...PLAYER_EQUIPMENT_PROFILES[0]!.crafter,
        maxCp: PLAYER_EQUIPMENT_PROFILES[0]!.crafter.maxCp + 20,
      },
      500,
    ),
  ]
  const population: CrafterPopulationManifestV2 = {
    version: CRAFTER_POPULATION_MANIFEST_VERSION,
    populationId: 'synthetic-held-out-evaluator-test-v2',
    patch: '7.51',
    recipeScope: [COSMIC_TITANIUM_NAILS.profileId],
    profiles: definitions,
  }
  return {
    population,
    split: {
      version: CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
      splitId: 'synthetic-held-out-evaluator-split-v2',
      populationId: population.populationId,
      groupKeyFields: CRAFTER_GROUP_KEY_FIELDS,
      regressionSeenGroupIds: [],
      trainGroupIds: [
        'synthetic-control-fixture-group',
        'synthetic-non-heldout-fixture-group',
      ],
      validationGroupIds: [],
      heldOutInterpolationGroupIds: ['synthetic-interpolation-fixture-group'],
      heldOutBoundaryGroupIds: ['synthetic-held-out-boundary-fixture-group'],
      reservedFinalGroupIds: [],
      oodProbeGroupIds: ['synthetic-ood-low-cp-probe-group'],
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
  initialStateCases: readonly HeldOutCrafterEvaluationCase[] = [],
): PopulationHeldOutEvaluationOptions {
  const interpolationSeedCorpus = { corpusId: 'interpolation-seeds-v1', seeds: [11, 29] }
  const boundarySeedCorpus = { corpusId: 'boundary-seeds-v1', seeds: [13, 31] }
  const oodSeedCorpus = { corpusId: 'ood-seeds-v1', seeds: [17, 37] }
  const trainSeedCorpus = { corpusId: 'train-seeds-v1', seeds: [19, 41] }
  const initialStateCorpusIdByGroupId = Object.fromEntries(initialStateCases.flatMap((crafterCase) => {
    const profile = evidence.population.profiles.find(({ id }) => id === crafterCase.profileId)
    return profile === undefined ? [] : [[profile.groupId, crafterCase.initialStateCorpusId]]
  }))
  const corpusSealManifest = createEvaluationCorpusSealManifest(
    'held-out-evaluator-corpus-seals-v1',
    [
      sealSeedCorpus(trainSeedCorpus.corpusId, trainSeedCorpus.seeds),
      sealSeedCorpus(interpolationSeedCorpus.corpusId, interpolationSeedCorpus.seeds),
      sealSeedCorpus(boundarySeedCorpus.corpusId, boundarySeedCorpus.seeds),
      sealSeedCorpus(oodSeedCorpus.corpusId, oodSeedCorpus.seeds),
      ...initialStateCases.map((crafterCase) => {
        const profile = evidence.population.profiles.find(({ id }) => (
          id === crafterCase.profileId
        ))!
        return sealInitialStateCorpus(
          crafterCase.initialStateCorpusId,
          crafterCase.initialStates,
          {
            recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
            crafterGroupId: profile.groupId,
          },
        )
      }),
    ],
  )
  const evaluationSplit: CrafterGroupedSplitManifestV4 = {
    ...evidence.split,
    initialStateCorpusIdByRecipeAndGroupId: {
      [COSMIC_TITANIUM_NAILS.profileId]: initialStateCorpusIdByGroupId,
    },
  }
  return {
    ...evidence,
    split: evaluationSplit,
    corpusSealManifest,
    expectedPopulationManifestContentHash: canonicalCrafterPopulationManifestContentHash(
      evidence.population,
    ),
    expectedSplitManifestContentHash: canonicalCrafterGroupedSplitManifestContentHash(
      evaluationSplit,
    ),
    expectedCorpusSealManifestContentHash: corpusSealManifest.manifestContentHash,
    populationRecipes: [COSMIC_TITANIUM_NAILS],
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    profiles: [NORMAL_HEAVY_POC_CONDITIONS],
    seedCorporaByRole: {
      heldOutInterpolation: interpolationSeedCorpus,
      heldOutBoundary: boundarySeedCorpus,
      oodProbe: oodSeedCorpus,
    },
    maxEpisodeSteps: 2,
    declaredPolicyArtifact: {
      policyId: 'synthetic-held-out-policy',
      policyVersion: 'synthetic-held-out-policy-v1',
      contentHash: contentHash(950),
    },
  }
}

function heldOutCases(
  evidence: ReturnType<typeof evaluationEvidence>,
  stateForCrafter: (crafter: Readonly<CrafterProfile>) => CraftState,
): HeldOutCrafterEvaluationCase[] {
  const profileById = new Map(evidence.population.profiles.map((profile) => [profile.id, profile]))
  return [
    ['synthetic-interpolation-fixture', 'near-completion-interpolation-v1'],
    ['synthetic-held-out-boundary-fixture', 'near-completion-boundary-v1'],
    ['synthetic-ood-low-cp-probe', 'near-completion-ood-v1'],
  ].map(([profileId, initialStateCorpusId]) => ({
    profileId: profileId!,
    initialStateCorpusId: initialStateCorpusId!,
    initialStates: [stateForCrafter(profileById.get(profileId!)!.crafter)],
  }))
}

function sealedPromotionPair(
  candidateOverrides: Partial<PopulationHeldOutEvaluationOptions> = {},
): {
  baseline: PopulationHeldOutPolicyResult
  candidate: PopulationHeldOutPolicyResult
} {
  const evidence = evaluationEvidence()
  const cases = heldOutCases(evidence, (crafter) => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)
    return {
      ...initial,
      progress: COSMIC_TITANIUM_NAILS.progressRequired
        - previewAction(COSMIC_TITANIUM_NAILS, crafter, initial, 'basicSynthesis').progressGain,
    }
  })
  const baseOptions = evaluationOptions(evidence, cases)
  let baselineClock = 0
  const baseline = evaluatePolicyPopulationHeldOut(
    COSMIC_TITANIUM_NAILS,
    cases,
    () => {
      let firstDecision = true
      const baselinePolicy: EpisodePolicy = () => {
        if (firstDecision) {
          firstDecision = false
          return 'observe'
        }
        return 'basicSynthesis'
      }
      return baselinePolicy
    },
    {
      ...baseOptions,
      declaredPolicyArtifact: {
        policyId: 'synthetic-guide-baseline',
        policyVersion: 'synthetic-guide-baseline-v1',
        contentHash: contentHash(951),
      },
      now: () => baselineClock++,
    },
  )
  let candidateClock = 0
  const candidate = evaluatePolicyPopulationHeldOut(
    COSMIC_TITANIUM_NAILS,
    cases,
    () => () => 'basicSynthesis',
    {
      ...baseOptions,
      declaredPolicyArtifact: {
        policyId: 'synthetic-compact-candidate',
        policyVersion: 'synthetic-compact-candidate-v1',
        contentHash: contentHash(952),
      },
      now: () => candidateClock++,
      ...candidateOverrides,
    },
  )
  return { baseline, candidate }
}

function promotionAnchors(
  result: Readonly<PopulationHeldOutPolicyResult>,
): SealedPopulationPromotionExpectedAnchors {
  return {
    expectedPopulationManifestContentHash: result.populationManifestContentHash,
    expectedSplitManifestContentHash: result.splitManifestContentHash,
    expectedCorpusSealManifestContentHash: result.corpusSealManifestContentHash,
    expectedEvaluationSetupContentHash: populationHeldOutEvaluationSetupContentHash(result),
  }
}

describe('held-out policy evaluation', () => {
  it('reports a materially shorter route as a development comparison, not a promotion', () => {
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

    expect(compareDevelopmentPolicies(baseline, candidate)).toEqual({
      scope: 'development-comparison-only',
      candidateBetter: true,
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

    const decision = compareDevelopmentPolicies(baseline, candidate)
    expect(decision.candidateBetter).toBe(false)
    expect(decision.basis).toBeNull()
    expect(decision.reasons).toContain('no-completion-or-near-perfect-efficiency-gain')
    expect(decision.reasons).toContain('stall-rate-regression')
  })

  it.each([-1, 0x1_0000_0000])(
    'rejects non-uint32 seed %s before the generic held-out evaluator can alias it',
    (seed) => {
      const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
      expect(() => evaluatePolicyHeldOut(
        COSMIC_TITANIUM_NAILS,
        crafter,
        [createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)],
        () => () => null,
        {
          profiles: [NORMAL_HEAVY_POC_CONDITIONS],
          seeds: [seed],
          maxEpisodeSteps: 1,
          objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        },
      )).toThrow(/uint32/)
    },
  )

  it('keeps synthetic held-out equipment results separate before reporting worst-profile and OOD metrics', () => {
    const evidence = evaluationEvidence()
    const profileById = new Map(evidence.population.profiles.map((profile) => [profile.id, profile]))
    const inDistribution = profileById.get('synthetic-interpolation-fixture')!.crafter
    const outOfDistribution = profileById.get('synthetic-ood-low-cp-probe')!.crafter
    const boundary = profileById.get('synthetic-held-out-boundary-fixture')!.crafter
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
        profileId: 'synthetic-interpolation-fixture',
        initialStateCorpusId: 'near-completion-interpolation-v1',
        initialStates: [nearCompletion(inDistribution)],
        // These forged values are deliberately ignored; manifest identity wins.
        groupId: 'forged-group',
        crafter: outOfDistribution,
        coverage: 'out-of-distribution',
      },
      {
        profileId: 'synthetic-held-out-boundary-fixture',
        initialStateCorpusId: 'near-completion-boundary-v1',
        initialStates: [nearCompletion(boundary)],
      },
      {
        profileId: 'synthetic-ood-low-cp-probe',
        initialStateCorpusId: 'near-completion-ood-v1',
        initialStates: [nearCompletion(outOfDistribution)],
      },
    ]
    const factoryInputs: Readonly<CrafterProfile>[] = []
    const result = evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      (crafter) => {
        factoryInputs.push(crafter)
        return crafter.maxCp === outOfDistribution.maxCp
          ? () => null
          : () => 'basicSynthesis'
      },
      {
        ...evaluationOptions(evidence, requestedCases),
        now: () => timestamp++,
      },
    )

    expect(result.episodeCount).toBe(6)
    expect(factoryInputs).not.toHaveLength(0)
    expect(factoryInputs.every((crafter) => (
      !('coverage' in crafter)
      && !('initialStates' in crafter)
      && !('seedCorpusId' in crafter)
      && Object.isFrozen(crafter)
    ))).toBe(true)
    expect(result.corpusSealManifestId).toBe('held-out-evaluator-corpus-seals-v1')
    expect(result.perCrafter.map(({ profileId, score: profileScore }) => [
      profileId,
      profileScore.robustCompletionRate,
    ])).toEqual([
      ['synthetic-interpolation-fixture', 1],
      ['synthetic-held-out-boundary-fixture', 1],
      ['synthetic-ood-low-cp-probe', 0],
    ])
    expect(result.perCrafter[0]).toMatchObject({
      groupId: 'synthetic-interpolation-fixture-group',
      splitFamilyId: 'synthetic-interpolation-fixture-synthetic-loadout-family',
      evidenceRole: 'population',
      splitRole: 'heldOutInterpolation',
      coverage: 'held-out-interpolation',
      seedCorpusId: 'interpolation-seeds-v1',
      initialStateCorpusId: 'near-completion-interpolation-v1',
      seedCorpusContentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      initialStateCorpusContentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
    expect(JSON.parse(result.perCrafter[0]!.caseKey)).toContain('near-completion-interpolation-v1')
    expect(result.coverageScores['held-out-interpolation']!.robustCompletionRate).toBe(1)
    expect(result.coverageScores['held-out-boundary']!.robustCompletionRate).toBe(1)
    expect(result.coverageScores['out-of-distribution']!.robustCompletionRate).toBe(0)
    expect(result.worstProfileId).toBe('synthetic-ood-low-cp-probe')
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
      profileId: 'synthetic-held-out-boundary-fixture',
      p95Ms: 1,
    })
  })

  it('rejects changed seed content under an already-sealed corpus id', () => {
    const evidence = evaluationEvidence()
    const requestedCases = heldOutCases(
      evidence,
      (crafter) => createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )
    const options = evaluationOptions(evidence, requestedCases)

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      {
        ...options,
        seedCorporaByRole: {
          ...options.seedCorporaByRole,
          heldOutInterpolation: {
            corpusId: 'interpolation-seeds-v1',
            seeds: [11, 31],
          },
        },
      },
    )).toThrow(/seed corpus interpolation-seeds-v1 content hash mismatch/)
  })

  it('requires independently frozen population, split, and corpus-manifest anchors', () => {
    const evidence = evaluationEvidence()
    const requestedCases = heldOutCases(
      evidence,
      (crafter) => createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )
    const options = evaluationOptions(evidence, requestedCases)
    const wrongHash = `sha256:${'0'.repeat(64)}` as Sha256ContentHash

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      {
        ...options,
        expectedPopulationManifestContentHash: wrongHash,
      },
    )).toThrow(/crafter population manifest trusted hash mismatch/)

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      {
        ...options,
        expectedSplitManifestContentHash: wrongHash,
      },
    )).toThrow(/crafter split manifest trusted hash mismatch/)

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      {
        ...options,
        expectedCorpusSealManifestContentHash: wrongHash,
      },
    )).toThrow(/corpus seal manifest trusted hash mismatch/)
  })

  it('content-addresses the full evaluation setup, not only its display ids', () => {
    const evidence = evaluationEvidence()
    const requestedCases = heldOutCases(
      evidence,
      (crafter) => createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )
    const options = evaluationOptions(evidence, requestedCases)
    const baseline = evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      options,
    )
    const changedBudget = evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      { ...options, maxEpisodeSteps: options.maxEpisodeSteps + 1 },
    )

    expect(baseline.evaluationIdentityHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(baseline.evaluationIdentity.population.profiles[0]!.crafter)
      .toEqual(options.population.profiles[0]!.crafter)
    expect(baseline.populationManifestContentHash)
      .toBe(options.expectedPopulationManifestContentHash)
    expect(baseline.splitManifestContentHash)
      .toBe(options.expectedSplitManifestContentHash)
    expect(baseline.corpusSealManifestContentHash)
      .toBe(options.expectedCorpusSealManifestContentHash)
    expect(Object.isFrozen(baseline.evaluationIdentity)).toBe(true)
    expect(Object.isFrozen(baseline.evaluationIdentity.population)).toBe(true)
    expect(Object.isFrozen(baseline.evaluationIdentity.population.profiles[0]!.crafter)).toBe(true)
    expect(changedBudget.evaluationIdentityHash).not.toBe(baseline.evaluationIdentityHash)
    expect(changedBudget.perCrafter[0]!.caseKey).not.toBe(baseline.perCrafter[0]!.caseKey)

    const recordedPolicyVersion = baseline.evaluationIdentity.declaredPolicyArtifact.policyVersion
    ;(options.declaredPolicyArtifact as { policyVersion: string }).policyVersion = 'mutated-after-evaluation'
    expect(baseline.evaluationIdentity.declaredPolicyArtifact.policyVersion).toBe(recordedPolicyVersion)
  })

  it('rejects a canonical corpus id sealed as the wrong content kind', () => {
    const evidence = evaluationEvidence()
    const requestedCases = heldOutCases(
      evidence,
      (crafter) => createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )
    const options = evaluationOptions(evidence, requestedCases)
    const firstSeal = options.corpusSealManifest.entries.find(({ corpusId }) => (
      corpusId === 'interpolation-seeds-v1'
    ))!
    const wrongKindSeal = sealInitialStateCorpus(
      firstSeal.corpusId,
      requestedCases[0]!.initialStates,
      {
        recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
        crafterGroupId: 'synthetic-interpolation-fixture-group',
      },
    )
    const wrongKindManifest = createEvaluationCorpusSealManifest(
      options.corpusSealManifest.manifestId,
      options.corpusSealManifest.entries.map((entry) => (
        entry.corpusId === firstSeal.corpusId ? wrongKindSeal : entry
      )),
    )

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      {
        ...options,
        corpusSealManifest: wrongKindManifest,
        expectedCorpusSealManifestContentHash: wrongKindManifest.manifestContentHash,
      },
    )).toThrow(/has kind initial-state, expected seed/)
  })

  it('rejects changed initial-state content under an already-sealed corpus id', () => {
    const evidence = evaluationEvidence()
    const requestedCases = heldOutCases(
      evidence,
      (crafter) => createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )
    const options = evaluationOptions(evidence, requestedCases)
    const firstCase = requestedCases[0]!
    const changedCases = [{
      ...firstCase,
      initialStates: [{
        ...firstCase.initialStates[0]!,
        progress: firstCase.initialStates[0]!.progress + 1,
      }],
    }, ...requestedCases.slice(1)]

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      changedCases,
      () => () => null,
      options,
    )).toThrow(/initial-state corpus near-completion-interpolation-v1 content hash mismatch/)
  })

  it('binds each initial-state corpus to its exact held-out crafter group', () => {
    const evidence = evaluationEvidence()
    const requestedCases = heldOutCases(
      evidence,
      (crafter) => createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter),
    )
    const options = evaluationOptions(evidence, requestedCases)
    const interpolationGroup = 'synthetic-interpolation-fixture-group'
    const boundaryGroup = 'synthetic-held-out-boundary-fixture-group'
    const bindings = options.split.initialStateCorpusIdByRecipeAndGroupId![
      COSMIC_TITANIUM_NAILS.profileId
    ]!
    const swappedSplit: CrafterGroupedSplitManifestV4 = {
      ...options.split,
      initialStateCorpusIdByRecipeAndGroupId: {
        ...options.split.initialStateCorpusIdByRecipeAndGroupId,
        [COSMIC_TITANIUM_NAILS.profileId]: {
          ...bindings,
          [interpolationGroup]: bindings[boundaryGroup]!,
          [boundaryGroup]: bindings[interpolationGroup]!,
        },
      },
    }

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      requestedCases,
      () => () => null,
      {
        ...options,
        split: swappedSplit,
        expectedSplitManifestContentHash: canonicalCrafterGroupedSplitManifestContentHash(swappedSplit),
      },
    )).toThrow(/binding mismatch/)
  })

  it('refuses cherry-picked held-out groups and undeclared seed corpora', () => {
    const evidence = evaluationEvidence()
    const interpolation = evidence.population.profiles.find((profile) => (
      profile.id === 'synthetic-interpolation-fixture'
    ))!
    const boundary = evidence.population.profiles.find((profile) => (
      profile.id === 'synthetic-held-out-boundary-fixture'
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
      evaluationOptions(evidence, partialCases),
    )).toThrow(/missing oodProbe group: synthetic-ood-low-cp-probe-group/)

    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      partialCases,
      () => () => null,
      {
        ...evaluationOptions(evidence, partialCases),
        seedCorporaByRole: {
          ...evaluationOptions(evidence, partialCases).seedCorporaByRole,
          heldOutBoundary: { corpusId: 'not-in-the-split', seeds: [11] },
        },
      },
    )).toThrow(/not declared by split/)
  })

  it.each(['train', 'validation', 'reservedFinal'] as const)(
    'does not let a %s group masquerade as held-out evidence',
    (role) => {
      const evidence = evaluationEvidence()
      const profileId = 'synthetic-non-heldout-fixture'
      const groupId = `${profileId}-group`
      const split: CrafterGroupedSplitManifestV4 = {
        ...evidence.split,
        trainGroupIds: role === 'train'
          ? evidence.split.trainGroupIds
          : evidence.split.trainGroupIds.filter((candidate) => candidate !== groupId),
        validationGroupIds: role === 'validation' ? [groupId] : [],
        reservedFinalGroupIds: role === 'reservedFinal' ? [groupId] : [],
      }
      const crafter = evidence.population.profiles.find((profile) => (
        profile.id === profileId
      ))!.crafter
      const forgedCase = {
        profileId,
        initialStateCorpusId: 'forged-held-out-states-v1',
        initialStates: [createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)],
      }
      expect(() => evaluatePolicyPopulationHeldOut(
        COSMIC_TITANIUM_NAILS,
        [forgedCase],
        () => () => null,
        evaluationOptions({ ...evidence, split }, [forgedCase]),
      )).toThrow(new RegExp(`${role} crafter .* cannot be evaluated as held-out evidence`))
    },
  )

  it('rejects duplicate or recipe-incompatible condition profile identities', () => {
    const evidence = evaluationEvidence()
    const crafter = evidence.population.profiles[0]!.crafter
    const crafterCase = {
      profileId: 'synthetic-interpolation-fixture',
      initialStateCorpusId: 'condition-validation-states-v1',
      initialStates: [createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)],
    }
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [crafterCase],
      () => () => null,
      {
        ...evaluationOptions(evidence, [crafterCase]),
        profiles: [NORMAL_HEAVY_POC_CONDITIONS, { ...NORMAL_HEAVY_POC_CONDITIONS }],
      },
    )).toThrow(/duplicate condition profile id/)
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [crafterCase],
      () => () => null,
      {
        ...evaluationOptions(evidence, [crafterCase]),
        profiles: [BALANCED_ELEVATING_PLATFORMS_CONDITIONS],
      },
    )).toThrow(/unavailable condition/)
  })

  it('rejects objective mismatch and unknown equipment identity', () => {
    const evidence = evaluationEvidence()
    const crafter = normalizeCrafterProfile(PLAYER_EQUIPMENT_PROFILES[1]!.crafter)
    const crafterCase = {
      profileId: 'synthetic-interpolation-fixture',
      initialStateCorpusId: 'initial-v1',
      initialStates: [createInitialCraftState(COSMIC_TITANIUM_NAILS, crafter)],
    }
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [{ ...crafterCase, profileId: 'missing-profile' }],
      () => () => null,
      evaluationOptions(evidence, [crafterCase]),
    )).toThrow(/unknown held-out crafter profileId/)
    expect(() => evaluatePolicyPopulationHeldOut(
      COSMIC_TITANIUM_NAILS,
      [crafterCase],
      () => () => null,
      {
        ...evaluationOptions(evidence, [crafterCase]),
        objective: { ...COSMIC_TITANIUM_NAILS_OBJECTIVE, recipeProfileId: 'wrong-recipe' },
      },
    )).toThrow(/does not belong/)
  })

  it('detaches and freezes recipe/state execution inputs before an injected policy can mutate them', () => {
    const evidence = evaluationEvidence()
    const mutableRecipe = {
      ...COSMIC_TITANIUM_NAILS,
      availableConditions: [...COSMIC_TITANIUM_NAILS.availableConditions],
    } as RecipeProfile
    const cases = heldOutCases(
      evidence,
      (crafter) => createInitialCraftState(mutableRecipe, crafter),
    )
    const originalProgressRequired = mutableRecipe.progressRequired
    const rawStates = new Set(cases.flatMap((crafterCase) => crafterCase.initialStates))
    const expectedStateHashes = new Map(cases.map((crafterCase) => {
      const profile = evidence.population.profiles.find(({ id }) => id === crafterCase.profileId)!
      return [crafterCase.profileId, sealInitialStateCorpus(
        crafterCase.initialStateCorpusId,
        crafterCase.initialStates,
        {
          recipeProfileId: mutableRecipe.profileId,
          crafterGroupId: profile.groupId,
        },
      ).contentHash]
    }))
    let attemptedPolicyInputMutations = 0
    const result = evaluatePolicyPopulationHeldOut(
      mutableRecipe,
      cases,
      () => (policyRecipe, _crafter, policyState) => {
        mutableRecipe.progressRequired = 1
        for (const crafterCase of cases) {
          ;(crafterCase.initialStates[0] as CraftState).progress = originalProgressRequired
        }
        expect(Object.isFrozen(policyRecipe)).toBe(true)
        expect(Object.isFrozen(policyState)).toBe(true)
        expect(policyRecipe).not.toBe(mutableRecipe)
        expect(rawStates.has(policyState)).toBe(false)
        try {
          policyRecipe.progressRequired = 1
        } catch {
          attemptedPolicyInputMutations += 1
        }
        try {
          policyState.progress = originalProgressRequired
        } catch {
          attemptedPolicyInputMutations += 1
        }
        return 'basicSynthesis'
      },
      {
        ...evaluationOptions(evidence, cases),
        populationRecipes: [mutableRecipe],
        maxEpisodeSteps: 1,
      },
    )

    expect(mutableRecipe.progressRequired).toBe(1)
    expect(cases.every((crafterCase) => (
      crafterCase.initialStates[0]!.progress === originalProgressRequired
    ))).toBe(true)
    expect(attemptedPolicyInputMutations).toBe(result.episodeCount * 2)
    expect(result.score.robustCompletionRate).toBe(0)
    expect(result.evaluationIdentity.recipe.progressRequired).toBe(originalProgressRequired)
    expect(result.evaluationIdentityHash).toBe(
      canonicalEvidenceContentHash(result.evaluationIdentity),
    )
    expect(result.perCrafter.every((crafter) => (
      crafter.initialStateCorpusContentHash === expectedStateHashes.get(crafter.profileId)
    ))).toBe(true)
  })
})

describe('sealed population promotion', () => {
  it('keeps a development-only tool report formally unpromoted', () => {
    expect(sealedPopulationEvidenceNotProvidedDecision()).toEqual({
      evidenceKind: null,
      promote: false,
      reasons: ['sealed-population-evidence-not-provided'],
      basis: null,
      evidenceBoundaries: [
        'single-crafter-development-evaluation-is-not-population-held-out-evidence',
        'declared-policy-artifact-identity-does-not-prove-executed-factory-bytes',
      ],
    })
  })

  it('rejects a better synthetic comparison whose split is not promotion-ready', () => {
    const { baseline, candidate } = sealedPromotionPair()

    const decision = decideSealedPopulationPromotion(
      baseline,
      candidate,
      promotionAnchors(baseline),
    )

    expect(decision).toMatchObject({
      version: 'sealed-population-promotion-decision-v2',
      evidenceKind: 'sealed-population-held-out',
      promote: false,
      reasons: [
        'baseline-promotion-split-not-ready',
        'candidate-promotion-split-not-ready',
        'baseline-latency-evidence-inconclusive:caller-injected-clock',
        'candidate-latency-evidence-inconclusive:caller-injected-clock',
        'policy-artifact-execution-binding-not-proven',
        'reserved-final-evidence-not-evaluated',
      ],
      basis: 'near-perfect-efficiency',
      evidenceBoundaries: [
        'declared-policy-artifact-identity-does-not-prove-executed-factory-bytes',
        'serialized-evaluation-summaries-must-be-recomputed-before-promotion',
      ],
    })
    expect(decision.baselineEvaluationIdentityHash).toBe(baseline.evaluationIdentityHash)
    expect(decision.candidateEvaluationIdentityHash).toBe(candidate.evaluationIdentityHash)
  })

  it('rejects a detached clone even when every serialized field is unchanged', () => {
    const { baseline, candidate } = sealedPromotionPair()
    const detachedCandidate: PopulationHeldOutPolicyResult = { ...candidate }

    expect(decideSealedPopulationPromotion(
      baseline,
      detachedCandidate,
      promotionAnchors(baseline),
    ).reasons)
      .toContain('candidate-evaluation-summary-not-produced-by-live-evaluator')
    expect(Object.isFrozen(candidate)).toBe(true)
    expect(Object.isFrozen(candidate.perCrafter[0])).toBe(true)
  })

  it('requires complete release-owned anchors and rejects a wrong anchor', () => {
    const { baseline, candidate } = sealedPromotionPair()
    const missing = decideSealedPopulationPromotion(
      baseline,
      candidate,
      undefined as never,
    )
    const wrong = decideSealedPopulationPromotion(
      baseline,
      candidate,
      {
        ...promotionAnchors(baseline),
        expectedPopulationManifestContentHash: contentHash(777),
      },
    )

    expect(missing.reasons).toContain('release-owned-promotion-anchors-not-provided')
    expect(wrong.reasons).toContain('release-population-anchor-mismatch')
    expect(missing.promote).toBe(false)
    expect(wrong.promote).toBe(false)
  })

  it('rejects a different evaluation horizon instead of comparing unlike evidence', () => {
    const { baseline, candidate } = sealedPromotionPair({ maxEpisodeSteps: 3 })

    const decision = decideSealedPopulationPromotion(
      baseline,
      candidate,
      promotionAnchors(baseline),
    )

    expect(decision.promote).toBe(false)
    expect(decision.reasons).toContain('max-episode-steps-incompatible')
    expect(decision.reasons).toContain('evaluation-setup-incompatible')
  })

  it('rejects reused or version-colliding declared artifact identities', () => {
    const reused = sealedPromotionPair({
      declaredPolicyArtifact: {
        policyId: 'synthetic-guide-baseline',
        policyVersion: 'synthetic-guide-baseline-v1',
        contentHash: contentHash(951),
      },
    })
    const collision = sealedPromotionPair({
      declaredPolicyArtifact: {
        policyId: 'synthetic-guide-baseline',
        policyVersion: 'synthetic-guide-baseline-v1',
        contentHash: contentHash(999),
      },
    })

    expect(decideSealedPopulationPromotion(
      reused.baseline,
      reused.candidate,
      promotionAnchors(reused.baseline),
    ).reasons)
      .toEqual(expect.arrayContaining([
        'policy-artifact-identities-identical',
        'policy-artifact-content-hash-identical',
      ]))
    expect(decideSealedPopulationPromotion(
      collision.baseline,
      collision.candidate,
      promotionAnchors(collision.baseline),
    ).reasons)
      .toContain('policy-artifact-version-collision')
  })

  it('fails closed on missing OOD evidence and on worst-tail or safety regressions', () => {
    const { baseline, candidate } = sealedPromotionPair()
    const withoutOod: PopulationHeldOutPolicyResult = {
      ...candidate,
      coverageScores: {
        'held-out-interpolation': candidate.coverageScores['held-out-interpolation'],
        'held-out-boundary': candidate.coverageScores['held-out-boundary'],
      },
    }
    const regressed: PopulationHeldOutPolicyResult = {
      ...candidate,
      worstDecileCompletionRate: baseline.worstDecileCompletionRate - 0.01,
      safetyViolations: 1,
    }

    expect(decideSealedPopulationPromotion(
      baseline,
      withoutOod,
      promotionAnchors(baseline),
    ).reasons)
      .toContain('candidate-out-of-distribution-evidence-missing')
    expect(decideSealedPopulationPromotion(
      baseline,
      regressed,
      promotionAnchors(baseline),
    ).reasons)
      .toEqual(expect.arrayContaining([
        'candidate-safety-violations',
        'safety-violations:1',
        'worst-decile-completion-regression',
      ]))
  })

  it('fails closed on latency evidence regression or a missing trusted anchor', () => {
    const { baseline, candidate } = sealedPromotionPair()
    const slower: PopulationHeldOutPolicyResult = {
      ...candidate,
      policyCallbackLatency: {
        ...candidate.policyCallbackLatency,
        p95Ms: baseline.policyCallbackLatency.p95Ms + 1,
        p99Ms: baseline.policyCallbackLatency.p99Ms + 1,
        maxMs: baseline.policyCallbackLatency.maxMs + 1,
      },
    }
    const detached: PopulationHeldOutPolicyResult = {
      ...candidate,
      populationManifestContentHash: contentHash(777),
    }

    expect(decideSealedPopulationPromotion(
      baseline,
      slower,
      promotionAnchors(baseline),
    ).reasons)
      .toContain('policy-callback-p95-regression')
    expect(decideSealedPopulationPromotion(
      baseline,
      detached,
      promotionAnchors(baseline),
    ).reasons)
      .toEqual(expect.arrayContaining([
        'candidate-population-anchor-mismatch',
        'population-anchor-incompatible',
      ]))
  })
})
