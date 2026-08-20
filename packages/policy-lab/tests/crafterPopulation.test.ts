import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  HARDENED_SURVEY_PLANK,
  MOBILE_WORK_STAIRS,
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  type CrafterProfile,
  type RecipeProfile,
  type SourceMetadata,
} from '@frozen-rabbit-expert/domain'
import {
  CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
  CRAFTER_GROUP_KEY_FIELDS,
  CRAFTER_POPULATION_MANIFEST_VERSION,
  assertCrafterSplitPromotionReady,
  canonicalCrafterGroupedSplitManifestContentHash,
  canonicalCrafterPopulationManifestContentHash,
  createEvaluationCorpusSealManifest,
  crafterMechanicsSignature,
  crafterProfileGroupKey,
  crafterSplitRoleByGroupId,
  normalizeCrafterProfile,
  sealInitialStateCorpus,
  sealSeedCorpus,
  validateCrafterGroupedSplit,
  validateCrafterPopulationManifest,
  type CrafterEvidenceSnapshotV1,
  type CrafterGroupedSplitManifestV4,
  type CrafterPopulationManifestV2,
  type CrafterPopulationProfileV2,
  type CrafterSplitPromotionExpectedContentHashes,
  type EvaluationCorpusSealManifestV4,
  type Sha256ContentHash,
} from '../src'

const recipes = [
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  HARDENED_SURVEY_PLANK,
  MOBILE_WORK_STAIRS,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
] as const satisfies readonly RecipeProfile[]

const observedSourceRevision = 'synthetic-unit-test-observed-panel-record-v1'
const observedSource: SourceMetadata = {
  sourceKind: 'empirical',
  sourceRevision: observedSourceRevision,
  patch: '7.51',
  verifiedAt: '2026-08-12',
  confidence: 'verified',
  notes: ['Synthetic schema fixture around the three repository-known player panel values.'],
}

const calculatorSourceRevision = 'synthetic-unit-test-calculator-output-v1'
const calculatorSource: SourceMetadata = {
  sourceKind: 'empirical',
  sourceRevision: calculatorSourceRevision,
  patch: '7.51',
  verifiedAt: '2026-08-20',
  confidence: 'provisional',
  notes: ['Synthetic unit-test calculator record; not evidence of a real unseen player loadout.'],
}

function contentHash(index: number): Sha256ContentHash {
  return `sha256:${index.toString(16).padStart(64, '0')}` as Sha256ContentHash
}

function snapshot(
  snapshotId: string,
  hashIndex: number,
  sourceRevision: string,
  sourceId = 'synthetic-unit-test-fixtures',
): CrafterEvidenceSnapshotV1 {
  return {
    snapshotId,
    version: 'synthetic-unit-test-snapshot-v1',
    sourceId,
    sourceRevision,
    contentHash: contentHash(hashIndex),
  }
}

function mechanicsSignatures(crafter: Readonly<CrafterProfile>): Record<string, string> {
  return Object.fromEntries(recipes.map((recipe) => [
    recipe.profileId,
    crafterMechanicsSignature(recipe, crafter),
  ]))
}

function population(): CrafterPopulationManifestV2 {
  return {
    version: CRAFTER_POPULATION_MANIFEST_VERSION,
    populationId: 'player-regression-seen-v2',
    patch: '7.51',
    recipeScope: recipes.map((recipe) => recipe.profileId),
    profiles: PLAYER_EQUIPMENT_PROFILES.map((profile, index) => {
      const crafter = normalizeCrafterProfile(profile.crafter)
      return {
        id: profile.id,
        groupId: profile.id,
        splitFamilyId: 'player-current-underlying-loadout-family-v1',
        crafter,
        provenance: 'empirical',
        evidenceRole: 'regression-seen',
        derivation: {
          kind: 'observed-panel',
          snapshot: snapshot(
            `synthetic-unit-test-${profile.id}`,
            100 + index,
            observedSourceRevision,
          ),
          observationId: `synthetic-unit-test-observation-${index + 1}`,
          observedAt: '2026-08-12',
          observedCrafter: crafter,
        },
        source: observedSource,
        tags: ['regression-seen', `preparation:${profile.preparation}`],
        mechanicsSignatureByRecipe: mechanicsSignatures(crafter),
      }
    }),
  }
}

function split(): CrafterGroupedSplitManifestV4 {
  const groups = population().profiles.map((profile) => profile.groupId)
  return {
    version: CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
    splitId: 'structural-test-split-v2',
    populationId: 'player-regression-seen-v2',
    groupKeyFields: CRAFTER_GROUP_KEY_FIELDS,
    regressionSeenGroupIds: groups,
    trainGroupIds: [],
    validationGroupIds: [],
    heldOutInterpolationGroupIds: [],
    heldOutBoundaryGroupIds: [],
    reservedFinalGroupIds: [],
    oodProbeGroupIds: [],
    seedCorpusIdsByRole: {
      regressionSeen: ['regression-seeds-v1'],
    },
  }
}

function corpusSealManifest(
  groupedSplit: Readonly<CrafterGroupedSplitManifestV4>,
): EvaluationCorpusSealManifestV4 {
  const seedCorpusIds = [...new Set(Object.values(groupedSplit.seedCorpusIdsByRole ?? {}).flat())]
  const baseState = createInitialCraftState(recipes[0], PLAYER_EQUIPMENT_PROFILES[2]!.crafter)
  const initialStateBindings = Object.entries(
    groupedSplit.initialStateCorpusIdByRecipeAndGroupId ?? {},
  ).flatMap(([recipeProfileId, idsByGroupId]) => Object.entries(idsByGroupId).map(
    ([crafterGroupId, corpusId]) => ({ recipeProfileId, crafterGroupId, corpusId }),
  ))
  return createEvaluationCorpusSealManifest(
    `${groupedSplit.splitId}-corpus-seals-v1`,
    [
      ...seedCorpusIds.map((corpusId, index) => sealSeedCorpus(corpusId, [index + 1])),
      ...initialStateBindings.map((binding, index) => sealInitialStateCorpus(
        binding.corpusId,
        [{ ...baseState, progress: index }],
        binding,
      )),
    ],
  )
}

function promotionExpectedContentHashes(
  manifest: Readonly<CrafterPopulationManifestV2>,
  groupedSplit: Readonly<CrafterGroupedSplitManifestV4>,
  corpusSeals: Readonly<EvaluationCorpusSealManifestV4>,
): CrafterSplitPromotionExpectedContentHashes {
  return {
    expectedPopulationManifestContentHash: canonicalCrafterPopulationManifestContentHash(manifest),
    expectedSplitManifestContentHash: canonicalCrafterGroupedSplitManifestContentHash(groupedSplit),
    expectedCorpusSealManifestContentHash: corpusSeals.manifestContentHash,
  }
}

function syntheticCalculatorProfile(
  id: string,
  hashBase: number,
  maxCp: number,
): CrafterPopulationProfileV2 {
  const crafter = normalizeCrafterProfile({
    ...PLAYER_EQUIPMENT_PROFILES[2]!.crafter,
    maxCp,
  })
  return {
    id,
    groupId: `${id}-group`,
    splitFamilyId: `${id}-synthetic-loadout-family`,
    crafter,
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
      calculatedCrafter: crafter,
    },
    source: calculatorSource,
    tags: ['synthetic-unit-test-only', 'not-real-unseen-loadout-evidence'],
    mechanicsSignatureByRecipe: mechanicsSignatures(crafter),
  }
}

function boundaryProbeProfile(
  baseProfile: Readonly<CrafterPopulationProfileV2> = population().profiles[0]!,
  id = 'synthetic-low-cp-boundary-probe',
): CrafterPopulationProfileV2 {
  const baseCrafter = baseProfile.crafter
  const crafter = { ...baseCrafter, maxCp: baseCrafter.maxCp - 100 }
  const sourceRevision = 'synthetic-unit-test-boundary-output-v1'
  return {
    id,
    groupId: `${id}-group`,
    splitFamilyId: baseProfile.splitFamilyId,
    crafter,
    provenance: 'boundary-probe',
    evidenceRole: 'adversarial',
    derivation: {
      kind: 'boundary-probe',
      snapshot: snapshot(`${id}-result`, 800, sourceRevision),
      generatorId: 'synthetic-unit-test-boundary-generator',
      generatorVersion: 'synthetic-unit-test-v1',
      generatorSourceRevision: 'synthetic-unit-test-boundary-generator-source-v1',
      generatorContentHash: contentHash(801),
      inputSnapshot: baseProfile.derivation.snapshot,
      basePopulationId: 'player-regression-seen-v2',
      baseProfileId: baseProfile.id,
      changedFields: ['maxCp'],
      purpose: 'Exercise a deliberately synthetic low-CP boundary in unit tests.',
      generatedCrafter: crafter,
    },
    source: {
      sourceKind: 'assumption',
      sourceRevision,
      patch: '7.51',
      verifiedAt: '2026-08-20',
      confidence: 'unknown',
      notes: ['Synthetic boundary probe; not population or unseen-loadout evidence.'],
    },
    tags: ['boundary-probe', 'synthetic-unit-test-only'],
    mechanicsSignatureByRecipe: mechanicsSignatures(crafter),
  }
}

describe('crafter population and grouped splits', () => {
  it('normalizes optional specialist identity before grouping', () => {
    const legacy = { ...PLAYER_EQUIPMENT_PROFILES[0]!.crafter, specialist: undefined }
    const explicit = { ...legacy, specialist: false }

    expect(normalizeCrafterProfile(legacy).specialist).toBe(false)
    expect(crafterProfileGroupKey(legacy)).toBe(crafterProfileGroupKey(explicit))

    expect(() => normalizeCrafterProfile({
      ...legacy,
      cosmicToolGoodBonus: undefined,
    } as unknown as CrafterProfile)).toThrow(/cosmicToolGoodBonus must be an explicit boolean/)
    expect(() => normalizeCrafterProfile({
      ...legacy,
      specialist: 'false',
    } as unknown as CrafterProfile)).toThrow(/specialist must be a boolean/)
  })

  it('validates five-recipe mechanics signatures for regression-seen profiles', () => {
    const manifest = population()
    expect(() => validateCrafterPopulationManifest(manifest, recipes)).not.toThrow()

    for (const profile of manifest.profiles) {
      expect(profile.splitFamilyId).toBe('player-current-underlying-loadout-family-v1')
      expect(Object.keys(profile.mechanicsSignatureByRecipe)).toHaveLength(recipes.length)
      expect(Object.values(profile.mechanicsSignatureByRecipe).every((value) => (
        value.includes('progress=') && value.includes('quality=')
      ))).toBe(true)
    }
  })

  it('rejects aliases and derivation hashes that could masquerade as independent families', () => {
    const manifest = population()
    const duplicate = {
      ...manifest.profiles[0]!,
      id: 'duplicate-profile',
      groupId: 'different-group',
    }
    expect(() => validateCrafterPopulationManifest({
      ...manifest,
      profiles: [...manifest.profiles, duplicate],
    }, recipes)).toThrow(/equivalent crafter profiles use different groupIds/)

    const first = syntheticCalculatorProfile('synthetic-family-a', 300, 771)
    const second = syntheticCalculatorProfile('synthetic-family-b', 310, 772)
    expect(second.derivation.kind).toBe('versioned-calculator')
    if (second.derivation.kind !== 'versioned-calculator') throw new Error('unreachable')
    const sharedInputHash = first.derivation.kind === 'versioned-calculator'
      ? first.derivation.inputSnapshot.contentHash
      : contentHash(999)
    const hashAlias = {
      ...second,
      derivation: {
        ...second.derivation,
        inputSnapshot: {
          ...second.derivation.inputSnapshot,
          contentHash: sharedInputHash,
        },
      },
    }
    expect(() => validateCrafterPopulationManifest({
      ...manifest,
      profiles: [...manifest.profiles, first, hashAlias],
    }, recipes)).toThrow(/content hash .* assigned to different split families/)
  })

  it('requires a calculator record to reproduce the declared crafter exactly', () => {
    const manifest = population()
    const profile = syntheticCalculatorProfile('synthetic-calculator-mismatch', 400, 773)
    if (profile.derivation.kind !== 'versioned-calculator') throw new Error('unreachable')
    expect(() => validateCrafterPopulationManifest({
      ...manifest,
      profiles: [...manifest.profiles, {
        ...profile,
        derivation: {
          ...profile.derivation,
          calculatedCrafter: { ...profile.crafter, maxCp: profile.crafter.maxCp + 1 },
        },
      }],
    }, recipes)).toThrow(/calculatedCrafter does not equal profile crafter/)
  })

  it('keeps each versioned calculator identity bound to one exact artifact', () => {
    const manifest = population()
    const first = syntheticCalculatorProfile('calculator-artifact-a', 600, 780)
    const second = syntheticCalculatorProfile('calculator-artifact-b', 610, 781)
    if (second.derivation.kind !== 'versioned-calculator') throw new Error('unreachable')

    expect(() => validateCrafterPopulationManifest({
      ...manifest,
      profiles: [...manifest.profiles, first, {
        ...second,
        derivation: {
          ...second.derivation,
          calculatorContentHash: contentHash(902),
        },
      }],
    }, recipes)).toThrow(/calculator .* has conflicting artifact identity/)

    const probe = boundaryProbeProfile()
    if (probe.derivation.kind !== 'boundary-probe') throw new Error('unreachable')
    expect(() => validateCrafterPopulationManifest({
      ...manifest,
      profiles: [...manifest.profiles, probe, {
        ...probe,
        id: 'synthetic-low-cp-boundary-probe-conflicting-generator',
        groupId: 'synthetic-low-cp-boundary-probe-conflicting-generator-group',
        derivation: {
          ...probe.derivation,
          generatorContentHash: contentHash(903),
        },
      }],
    }, recipes)).toThrow(/generator .* has conflicting artifact identity/)
  })

  it('rejects stale or incomplete recipe mechanics signatures', () => {
    const manifest = population()
    const first = manifest.profiles[0]!
    expect(() => validateCrafterPopulationManifest({
      ...manifest,
      profiles: [{
        ...first,
        mechanicsSignatureByRecipe: {
          ...first.mechanicsSignatureByRecipe,
          [COSMIC_TITANIUM_NAILS.profileId]: 'stale-signature',
        },
      }, ...manifest.profiles.slice(1)],
    }, recipes)).toThrow(/invalid mechanics signature/)
  })

  it('keeps the three preparation variants in one regression family and forbids held-out relabeling', () => {
    const manifest = population()
    const groupedSplit = split()
    expect(() => validateCrafterGroupedSplit(groupedSplit, manifest)).not.toThrow()
    expect(crafterSplitRoleByGroupId(groupedSplit, manifest.profiles[2]!.groupId))
      .toBe('regressionSeen')

    const groups = manifest.profiles.map((profile) => profile.groupId)
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      regressionSeenGroupIds: [],
      trainGroupIds: [groups[0]!],
      validationGroupIds: [groups[1]!],
      heldOutInterpolationGroupIds: [groups[2]!],
    }, manifest)).toThrow(/requires population evidence/)

    const populationFamilyA = syntheticCalculatorProfile('family-a', 300, 781)
    const populationFamilyB = {
      ...syntheticCalculatorProfile('family-b', 310, 782),
      splitFamilyId: populationFamilyA.splitFamilyId,
    }
    const familyPopulation = {
      ...manifest,
      profiles: [...manifest.profiles, populationFamilyA, populationFamilyB],
    }
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      trainGroupIds: [populationFamilyA.groupId],
      validationGroupIds: [populationFamilyB.groupId],
    }, familyPopulation)).toThrow(/split family .* leaks across/)
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      trainGroupIds: [populationFamilyA.groupId],
      oodProbeGroupIds: [populationFamilyB.groupId],
    }, familyPopulation)).toThrow(/split family .* leaks across train and oodProbe/)

    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      regressionSeenGroupIds: [],
      heldOutBoundaryGroupIds: groups,
    }, manifest)).toThrow(/requires population evidence/)
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      regressionSeenGroupIds: [],
      reservedFinalGroupIds: groups,
    }, manifest)).toThrow(/requires population evidence/)

    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      heldOutBoundaryGroupIds: [groups[0]!],
    }, manifest)).toThrow(/leaks across/)
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      regressionSeenGroupIds: groups.slice(0, 2),
    }, manifest)).toThrow(/missing from split/)
  })

  it('allows boundary probes only as OOD probes', () => {
    const manifest = population()
    const probe = boundaryProbeProfile()
    const probePopulation = { ...manifest, profiles: [...manifest.profiles, probe] }
    const groupedSplit = split()

    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      heldOutBoundaryGroupIds: [probe.groupId],
    }, probePopulation)).toThrow(/boundary-probe .* only be assigned to oodProbe/)
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      oodProbeGroupIds: [probe.groupId],
    }, probePopulation)).not.toThrow()

    if (probe.derivation.kind !== 'boundary-probe') throw new Error('unreachable')
    expect(() => validateCrafterPopulationManifest({
      ...probePopulation,
      profiles: [...manifest.profiles, {
        ...probe,
        splitFamilyId: 'false-independent-boundary-family',
      }],
    }, recipes)).toThrow(/assigned to different split families|must retain its base split family/)
    expect(() => validateCrafterPopulationManifest({
      ...probePopulation,
      profiles: [...manifest.profiles, {
        ...probe,
        derivation: {
          ...probe.derivation,
          changedFields: ['control'],
        },
      }],
    }, recipes)).toThrow(/changedFields do not match/)
  })

  it.each([
    ['validation', 'validationGroupIds'],
    ['heldOutInterpolation', 'heldOutInterpolationGroupIds'],
    ['heldOutBoundary', 'heldOutBoundaryGroupIds'],
    ['reservedFinal', 'reservedFinalGroupIds'],
  ] as const)('does not derive an OOD boundary probe from a %s evidence group', (_role, field) => {
    const manifest = population()
    const base = syntheticCalculatorProfile(`sensitive-base-${field}`, 850, 850)
    const probe = boundaryProbeProfile(base, `probe-from-${field}`)
    const groupedSplit = {
      ...split(),
      [field]: [base.groupId],
      oodProbeGroupIds: [probe.groupId],
    }

    expect(() => validateCrafterGroupedSplit(groupedSplit, {
      ...manifest,
      profiles: [...manifest.profiles, base, probe],
    })).toThrow(/only regressionSeen or train bases are allowed/)
  })

  it('keeps seed corpora isolated and validates population-only promotion roles', () => {
    const manifest = population()
    const groupedSplit = split()
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      seedCorpusIdsByRole: {
        ...groupedSplit.seedCorpusIdsByRole,
        validation: ['shared-seeds'],
        heldOutInterpolation: ['shared-seeds'],
      },
    }, manifest)).toThrow(/seed corpus .* leaks across/)
    const groupedSeals = corpusSealManifest(groupedSplit)
    expect(() => assertCrafterSplitPromotionReady(
      groupedSplit,
      manifest,
      recipes,
      groupedSeals,
      promotionExpectedContentHashes(manifest, groupedSplit, groupedSeals),
    )).toThrow(/train/)

    const promotionProfiles = [
      syntheticCalculatorProfile('synthetic-train', 500, 770),
      syntheticCalculatorProfile('synthetic-validation', 510, 771),
      syntheticCalculatorProfile('synthetic-interpolation', 520, 772),
      syntheticCalculatorProfile('synthetic-boundary', 530, 773),
      syntheticCalculatorProfile('synthetic-reserved', 540, 774),
    ]
    const probe = boundaryProbeProfile()
    const promotionPopulation: CrafterPopulationManifestV2 = {
      ...manifest,
      profiles: [...manifest.profiles, ...promotionProfiles, probe],
    }
    const initialStateCorpusIdByRecipeAndGroupId = Object.fromEntries(
      recipes.map((recipe, recipeIndex) => {
        const suffix = recipeIndex === 0 ? '' : `-${recipe.profileId}`
        return [recipe.profileId, {
          [promotionProfiles[0]!.groupId]: `train-states${suffix}-v1`,
          [promotionProfiles[1]!.groupId]: `validation-states${suffix}-v1`,
          [promotionProfiles[2]!.groupId]: `interpolation-states${suffix}-v1`,
          [promotionProfiles[3]!.groupId]: `boundary-states${suffix}-v1`,
          [promotionProfiles[4]!.groupId]: `reserved-states${suffix}-v1`,
          [probe.groupId]: `ood-states${suffix}-v1`,
        }]
      }),
    )
    const promotionSplit: CrafterGroupedSplitManifestV4 = {
      ...groupedSplit,
      trainGroupIds: [promotionProfiles[0]!.groupId],
      validationGroupIds: [promotionProfiles[1]!.groupId],
      heldOutInterpolationGroupIds: [promotionProfiles[2]!.groupId],
      heldOutBoundaryGroupIds: [promotionProfiles[3]!.groupId],
      reservedFinalGroupIds: [promotionProfiles[4]!.groupId],
      oodProbeGroupIds: [probe.groupId],
      seedCorpusIdsByRole: {
        ...groupedSplit.seedCorpusIdsByRole,
        train: ['train-seeds-v1'],
        validation: ['validation-seeds-v1'],
        heldOutInterpolation: ['interpolation-seeds-v1'],
        heldOutBoundary: ['boundary-seeds-v1'],
        reservedFinal: ['reserved-seeds-v1'],
        oodProbe: ['ood-seeds-v1'],
      },
      initialStateCorpusIdByRecipeAndGroupId,
    }
    const validPromotionSeals = corpusSealManifest(promotionSplit)
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      validPromotionSeals,
      promotionExpectedContentHashes(promotionPopulation, promotionSplit, validPromotionSeals),
    )).not.toThrow()
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      validPromotionSeals,
      {
        ...promotionExpectedContentHashes(promotionPopulation, promotionSplit, validPromotionSeals),
        expectedPopulationManifestContentHash: `sha256:${'0'.repeat(64)}`,
      },
    )).toThrow(/crafter population manifest trusted hash mismatch/)
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      validPromotionSeals,
      {
        ...promotionExpectedContentHashes(promotionPopulation, promotionSplit, validPromotionSeals),
        expectedSplitManifestContentHash: `sha256:${'0'.repeat(64)}`,
      },
    )).toThrow(/crafter split manifest trusted hash mismatch/)
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      validPromotionSeals,
      {
        ...promotionExpectedContentHashes(promotionPopulation, promotionSplit, validPromotionSeals),
        expectedCorpusSealManifestContentHash: `sha256:${'0'.repeat(64)}`,
      },
    )).toThrow(/corpus seal manifest trusted hash mismatch/)

    const wrongBindingManifest = createEvaluationCorpusSealManifest(
      validPromotionSeals.manifestId,
      validPromotionSeals.entries.map((entry) => (
        entry.corpusId === 'train-states-v1' && entry.kind === 'initial-state'
          ? {
              ...entry,
              binding: {
                recipeProfileId: recipes[0].profileId,
                crafterGroupId: promotionProfiles[1]!.groupId,
              },
            }
          : entry
      )),
    )
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      wrongBindingManifest,
      promotionExpectedContentHashes(promotionPopulation, promotionSplit, wrongBindingManifest),
    )).toThrow(/sealed initial-state corpus train-states-v1 binding mismatch/)

    const firstRecipeId = recipes[0].profileId
    const secondRecipeId = recipes[1].profileId
    const firstRecipeBindings = promotionSplit.initialStateCorpusIdByRecipeAndGroupId![
      firstRecipeId
    ]!
    const { [promotionProfiles[0]!.groupId]: _missingTrainState, ...withoutTrainState } =
      firstRecipeBindings
    const promotionSplitWithoutTrainState: CrafterGroupedSplitManifestV4 = {
      ...promotionSplit,
      initialStateCorpusIdByRecipeAndGroupId: {
        ...promotionSplit.initialStateCorpusIdByRecipeAndGroupId,
        [firstRecipeId]: withoutTrainState,
      },
    }
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplitWithoutTrainState,
      promotionPopulation,
      recipes,
      validPromotionSeals,
      promotionExpectedContentHashes(
        promotionPopulation,
        promotionSplitWithoutTrainState,
        validPromotionSeals,
      ),
    ))
      .toThrow(new RegExp(`initial-state corpus id for ${firstRecipeId}/train group`))

    expect(() => validateCrafterGroupedSplit({
      ...promotionSplit,
      initialStateCorpusIdByRecipeAndGroupId: {
        ...promotionSplit.initialStateCorpusIdByRecipeAndGroupId,
        [secondRecipeId]: {
          ...promotionSplit.initialStateCorpusIdByRecipeAndGroupId![secondRecipeId],
          [promotionProfiles[0]!.groupId]: firstRecipeBindings[promotionProfiles[0]!.groupId]!,
        },
      },
    }, promotionPopulation)).toThrow(/bound to multiple recipe\/group pairs/)

    const duplicateContentSeals = corpusSealManifest(promotionSplit)
    const duplicateContentManifest = createEvaluationCorpusSealManifest(
      duplicateContentSeals.manifestId,
      duplicateContentSeals.entries.map((entry) => (
        entry.corpusId === 'validation-seeds-v1'
          ? sealSeedCorpus('validation-seeds-v1', [2])
          : entry
      )),
    )
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      duplicateContentManifest,
      promotionExpectedContentHashes(promotionPopulation, promotionSplit, duplicateContentManifest),
    )).toThrow(/sealed seed member .* leaks across train and validation/)

    const partialOverlapSeals = corpusSealManifest(promotionSplit)
    const partialOverlapManifest = createEvaluationCorpusSealManifest(
      partialOverlapSeals.manifestId,
      partialOverlapSeals.entries.map((entry) => {
        if (entry.corpusId === 'train-seeds-v1') {
          return sealSeedCorpus(entry.corpusId, [101, 777])
        }
        if (entry.corpusId === 'validation-seeds-v1') {
          return sealSeedCorpus(entry.corpusId, [777, 202])
        }
        return entry
      }),
    )
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      partialOverlapManifest,
      promotionExpectedContentHashes(promotionPopulation, promotionSplit, partialOverlapManifest),
    )).toThrow(/sealed seed member .* leaks across train and validation/)

    const baseState = createInitialCraftState(recipes[0], PLAYER_EQUIPMENT_PROFILES[2]!.crafter)
    const sharedState = { ...baseState, progress: 10 }
    const partialStateOverlapSeals = corpusSealManifest(promotionSplit)
    const partialStateOverlapManifest = createEvaluationCorpusSealManifest(
      partialStateOverlapSeals.manifestId,
      partialStateOverlapSeals.entries.map((entry) => {
        if (entry.corpusId === 'train-states-v1') {
          return sealInitialStateCorpus(entry.corpusId, [baseState, sharedState], {
            recipeProfileId: recipes[0].profileId,
            crafterGroupId: promotionProfiles[0]!.groupId,
          })
        }
        if (entry.corpusId === 'validation-states-v1') {
          return sealInitialStateCorpus(entry.corpusId, [
            sharedState,
            { ...baseState, progress: 20 },
          ], {
            recipeProfileId: recipes[0].profileId,
            crafterGroupId: promotionProfiles[1]!.groupId,
          })
        }
        return entry
      }),
    )
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      partialStateOverlapManifest,
      promotionExpectedContentHashes(
        promotionPopulation,
        promotionSplit,
        partialStateOverlapManifest,
      ),
    )).toThrow(/sealed initial-state member .* leaks across train and validation/)

    const incompleteSeals = corpusSealManifest(promotionSplit)
    const incompleteManifest = createEvaluationCorpusSealManifest(
      incompleteSeals.manifestId,
      incompleteSeals.entries.filter((entry) => entry.corpusId !== 'boundary-seeds-v1'),
    )
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
      incompleteManifest,
      promotionExpectedContentHashes(promotionPopulation, promotionSplit, incompleteManifest),
    )).toThrow(/seed corpus boundary-seeds-v1 is not declared by seal manifest/)
    const leakingRoleSplit: CrafterGroupedSplitManifestV4 = {
      ...promotionSplit,
      heldOutBoundaryGroupIds: [
        ...promotionSplit.heldOutBoundaryGroupIds,
        promotionSplit.trainGroupIds[0]!,
      ],
    }
    expect(() => assertCrafterSplitPromotionReady(
      leakingRoleSplit,
      promotionPopulation,
      recipes,
      validPromotionSeals,
      promotionExpectedContentHashes(promotionPopulation, leakingRoleSplit, validPromotionSeals),
    ))
      .toThrow(/leaks across/)
    const missingReservedSeedSplit: CrafterGroupedSplitManifestV4 = {
      ...promotionSplit,
      seedCorpusIdsByRole: {
        ...promotionSplit.seedCorpusIdsByRole,
        reservedFinal: [],
      },
    }
    expect(() => assertCrafterSplitPromotionReady(
      missingReservedSeedSplit,
      promotionPopulation,
      recipes,
      validPromotionSeals,
      promotionExpectedContentHashes(
        promotionPopulation,
        missingReservedSeedSplit,
        validPromotionSeals,
      ),
    ))
      .toThrow(/reservedFinal seed corpus id/)

    const stalePopulation: CrafterPopulationManifestV2 = {
      ...promotionPopulation,
      profiles: [{
        ...promotionPopulation.profiles[0]!,
        mechanicsSignatureByRecipe: {
          ...promotionPopulation.profiles[0]!.mechanicsSignatureByRecipe,
          [COSMIC_TITANIUM_NAILS.profileId]: 'stale-before-promotion',
        },
      }, ...promotionPopulation.profiles.slice(1)],
    }
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      stalePopulation,
      recipes,
      validPromotionSeals,
      promotionExpectedContentHashes(stalePopulation, promotionSplit, validPromotionSeals),
    )).toThrow(/invalid mechanics signature/)
  })
})
