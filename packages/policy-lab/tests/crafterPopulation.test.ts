import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  HARDENED_SURVEY_PLANK,
  MOBILE_WORK_STAIRS,
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
} from '@frozen-rabbit-expert/data'
import type { CrafterProfile, RecipeProfile, SourceMetadata } from '@frozen-rabbit-expert/domain'
import {
  CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
  CRAFTER_GROUP_KEY_FIELDS,
  CRAFTER_POPULATION_MANIFEST_VERSION,
  assertCrafterSplitPromotionReady,
  crafterMechanicsSignature,
  crafterProfileGroupKey,
  crafterSplitRoleByGroupId,
  normalizeCrafterProfile,
  validateCrafterGroupedSplit,
  validateCrafterPopulationManifest,
  type CrafterGroupedSplitManifestV1,
  type CrafterPopulationManifestV1,
} from '../src'

const recipes = [
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_NAILS,
  HARDENED_SURVEY_PLANK,
  MOBILE_WORK_STAIRS,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
] as const satisfies readonly RecipeProfile[]

const source: SourceMetadata = {
  sourceKind: 'empirical',
  patch: '7.51',
  verifiedAt: '2026-08-12',
  confidence: 'verified',
}

function mechanicsSignatures(crafter: Readonly<CrafterProfile>): Record<string, string> {
  return Object.fromEntries(recipes.map((recipe) => [
    recipe.profileId,
    crafterMechanicsSignature(recipe, crafter),
  ]))
}

function population(): CrafterPopulationManifestV1 {
  return {
    version: CRAFTER_POPULATION_MANIFEST_VERSION,
    populationId: 'player-regression-seen-v1',
    patch: '7.51',
    recipeScope: recipes.map((recipe) => recipe.profileId),
    profiles: PLAYER_EQUIPMENT_PROFILES.map((profile) => {
      const crafter = normalizeCrafterProfile(profile.crafter)
      return {
        id: profile.id,
        groupId: profile.id,
        crafter,
        provenance: 'empirical',
        source,
        tags: ['regression-seen'],
        mechanicsSignatureByRecipe: mechanicsSignatures(crafter),
      }
    }),
  }
}

function split(): CrafterGroupedSplitManifestV1 {
  const groups = population().profiles.map((profile) => profile.groupId)
  return {
    version: CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION,
    splitId: 'structural-test-split-v1',
    populationId: 'player-regression-seen-v1',
    groupKeyFields: CRAFTER_GROUP_KEY_FIELDS,
    trainGroupIds: [groups[0]!],
    validationGroupIds: [groups[1]!],
    heldOutInterpolationGroupIds: [groups[2]!],
    heldOutBoundaryGroupIds: [],
    reservedFinalGroupIds: [],
    oodProbeGroupIds: [],
    seedCorpusIdsByRole: {
      train: ['train-seeds-v1'],
      validation: ['validation-seeds-v1'],
      heldOutInterpolation: ['interpolation-seeds-v1'],
    },
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
      expect(Object.keys(profile.mechanicsSignatureByRecipe)).toHaveLength(recipes.length)
      expect(Object.values(profile.mechanicsSignatureByRecipe).every((value) => (
        value.includes('progress=') && value.includes('quality=')
      ))).toBe(true)
    }
  })

  it('rejects aliases that could leak an equivalent profile across groups', () => {
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

  it('assigns each complete equipment group to exactly one split role', () => {
    const manifest = population()
    const groupedSplit = split()
    expect(() => validateCrafterGroupedSplit(groupedSplit, manifest)).not.toThrow()
    expect(crafterSplitRoleByGroupId(groupedSplit, manifest.profiles[2]!.groupId))
      .toBe('heldOutInterpolation')

    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      heldOutBoundaryGroupIds: [manifest.profiles[0]!.groupId],
    }, manifest)).toThrow(/leaks across/)
    expect(() => validateCrafterGroupedSplit({
      ...groupedSplit,
      heldOutInterpolationGroupIds: [],
    }, manifest)).toThrow(/missing from split/)
  })

  it('keeps seed corpora isolated and validates manifests before a promotion-ready decision', () => {
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
    expect(() => assertCrafterSplitPromotionReady(groupedSplit, manifest, recipes))
      .toThrow(/heldOutBoundary/)

    const extraProfiles = [
      {
        id: 'boundary-profile',
        groupId: 'boundary-group',
        crafter: normalizeCrafterProfile({
          ...PLAYER_EQUIPMENT_PROFILES[2]!.crafter,
          maxCp: PLAYER_EQUIPMENT_PROFILES[2]!.crafter.maxCp + 1,
        }),
      },
      {
        id: 'reserved-profile',
        groupId: 'reserved-group',
        crafter: normalizeCrafterProfile({
          ...PLAYER_EQUIPMENT_PROFILES[2]!.crafter,
          maxCp: PLAYER_EQUIPMENT_PROFILES[2]!.crafter.maxCp + 2,
        }),
      },
    ].map(({ id, groupId, crafter }) => ({
      id,
      groupId,
      crafter,
      provenance: 'boundary-probe' as const,
      source,
      tags: ['promotion-evidence'],
      mechanicsSignatureByRecipe: mechanicsSignatures(crafter),
    }))
    const promotionPopulation: CrafterPopulationManifestV1 = {
      ...manifest,
      profiles: [...manifest.profiles, ...extraProfiles],
    }
    const promotionSplit: CrafterGroupedSplitManifestV1 = {
      ...groupedSplit,
      heldOutBoundaryGroupIds: ['boundary-group'],
      reservedFinalGroupIds: ['reserved-group'],
      seedCorpusIdsByRole: {
        ...groupedSplit.seedCorpusIdsByRole,
        heldOutBoundary: ['boundary-seeds-v1'],
        reservedFinal: ['reserved-seeds-v1'],
      },
    }
    expect(() => assertCrafterSplitPromotionReady(
      promotionSplit,
      promotionPopulation,
      recipes,
    )).not.toThrow()
    expect(() => assertCrafterSplitPromotionReady({
      ...promotionSplit,
      heldOutBoundaryGroupIds: [
        ...promotionSplit.heldOutBoundaryGroupIds,
        promotionSplit.trainGroupIds[0]!,
      ],
    }, promotionPopulation, recipes)).toThrow(/leaks across/)
    expect(() => assertCrafterSplitPromotionReady({
      ...promotionSplit,
      seedCorpusIdsByRole: {
        ...promotionSplit.seedCorpusIdsByRole,
        reservedFinal: [],
      },
    }, promotionPopulation, recipes)).toThrow(/reservedFinal seed corpus id/)

    const stalePopulation: CrafterPopulationManifestV1 = {
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
      { ...promotionSplit, heldOutBoundaryGroupIds: [] },
      stalePopulation,
      recipes,
    )).toThrow(/invalid mechanics signature/)
  })
})
