import {
  recipeCrafterMechanicsSignatureKey,
  type CrafterProfile,
  type RecipeProfile,
  type SourceMetadata,
} from '@frozen-rabbit-expert/domain'

export const CRAFTER_POPULATION_MANIFEST_VERSION = 'crafter-population-manifest-v1'
export const CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION = 'crafter-grouped-split-manifest-v1'
export const CRAFTER_MECHANICS_SIGNATURE_VERSION = 'crafter-mechanics-signature-v1'

export const CRAFTER_GROUP_KEY_FIELDS = [
  'level',
  'craftsmanship',
  'control',
  'maxCp',
  'cosmicToolGoodBonus',
  'specialist',
] as const satisfies readonly (keyof NormalizedCrafterProfile)[]

export type CrafterPopulationProvenance =
  | 'empirical'
  | 'loadout-derived'
  | 'boundary-probe'

export interface NormalizedCrafterProfile extends CrafterProfile {
  specialist: boolean
}

export interface CrafterPopulationProfileV1 {
  id: string
  groupId: string
  crafter: Readonly<NormalizedCrafterProfile>
  provenance: CrafterPopulationProvenance
  source: Readonly<SourceMetadata>
  tags: readonly string[]
  mechanicsSignatureByRecipe: Readonly<Record<string, string>>
}

export interface CrafterPopulationManifestV1 {
  version: typeof CRAFTER_POPULATION_MANIFEST_VERSION
  populationId: string
  patch: string
  recipeScope: readonly string[]
  profiles: readonly CrafterPopulationProfileV1[]
}

export const CRAFTER_SPLIT_ROLES = [
  'train',
  'validation',
  'heldOutInterpolation',
  'heldOutBoundary',
  'reservedFinal',
  'oodProbe',
] as const

export type CrafterSplitRole = (typeof CRAFTER_SPLIT_ROLES)[number]

export const PROMOTION_REQUIRED_CRAFTER_SPLIT_ROLES = [
  'train',
  'validation',
  'heldOutInterpolation',
  'heldOutBoundary',
  'reservedFinal',
] as const satisfies readonly CrafterSplitRole[]

export interface CrafterGroupedSplitManifestV1 {
  version: typeof CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION
  splitId: string
  populationId: string
  groupKeyFields: typeof CRAFTER_GROUP_KEY_FIELDS
  trainGroupIds: readonly string[]
  validationGroupIds: readonly string[]
  heldOutInterpolationGroupIds: readonly string[]
  heldOutBoundaryGroupIds: readonly string[]
  reservedFinalGroupIds: readonly string[]
  oodProbeGroupIds: readonly string[]
  seedCorpusIdsByRole?: Readonly<Partial<Record<CrafterSplitRole, readonly string[]>>>
}

const GROUP_IDS_BY_ROLE = {
  train: 'trainGroupIds',
  validation: 'validationGroupIds',
  heldOutInterpolation: 'heldOutInterpolationGroupIds',
  heldOutBoundary: 'heldOutBoundaryGroupIds',
  reservedFinal: 'reservedFinalGroupIds',
  oodProbe: 'oodProbeGroupIds',
} as const satisfies Readonly<Record<CrafterSplitRole, keyof CrafterGroupedSplitManifestV1>>

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

function assertUnique(seen: Set<string>, value: string, label: string): void {
  assertNonEmpty(value, label)
  if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`)
  seen.add(value)
}

function assertFiniteInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a safe integer >= ${minimum}`)
  }
}

export function normalizeCrafterProfile(crafter: Readonly<CrafterProfile>): NormalizedCrafterProfile {
  if (crafter.cosmicToolGoodBonus !== true && crafter.cosmicToolGoodBonus !== false) {
    throw new TypeError('crafter cosmicToolGoodBonus must be an explicit boolean')
  }
  if (
    crafter.specialist !== undefined
    && crafter.specialist !== true
    && crafter.specialist !== false
  ) {
    throw new TypeError('crafter specialist must be a boolean when provided')
  }
  return {
    level: crafter.level,
    craftsmanship: crafter.craftsmanship,
    control: crafter.control,
    maxCp: crafter.maxCp,
    cosmicToolGoodBonus: crafter.cosmicToolGoodBonus,
    specialist: crafter.specialist === true,
  }
}

export function crafterProfileGroupKey(crafter: Readonly<CrafterProfile>): string {
  const normalized = normalizeCrafterProfile(crafter)
  return CRAFTER_GROUP_KEY_FIELDS.map((field) => `${field}=${String(normalized[field])}`).join('|')
}

/**
 * Profiles with this signature have the same recipe-specific base gains and
 * discrete access flags. It is an equivalence key, not evidence of policy
 * coverage; unseen signatures still require boundary/OOD evaluation.
 */
export function crafterMechanicsSignature(
  recipe: Readonly<RecipeProfile>,
  crafter: Readonly<CrafterProfile>,
): string {
  const normalized = normalizeCrafterProfile(crafter)
  return [
    CRAFTER_MECHANICS_SIGNATURE_VERSION,
    recipe.profileId,
    recipeCrafterMechanicsSignatureKey(recipe, normalized),
  ].join('|')
}

export function validateCrafterPopulationManifest(
  manifest: Readonly<CrafterPopulationManifestV1>,
  recipes: readonly Readonly<RecipeProfile>[],
): void {
  if (manifest.version !== CRAFTER_POPULATION_MANIFEST_VERSION) {
    throw new Error(`crafter population version mismatch: ${String(manifest.version)}`)
  }
  assertNonEmpty(manifest.populationId, 'populationId')
  assertNonEmpty(manifest.patch, 'population patch')
  if (manifest.profiles.length === 0) throw new Error('crafter population must contain profiles')

  const recipeIds = new Set<string>()
  for (const recipeId of manifest.recipeScope) assertUnique(recipeIds, recipeId, 'recipe scope id')
  if (recipeIds.size === 0) throw new Error('crafter population recipeScope must not be empty')
  const recipesById = new Map(recipes.map((recipe) => [recipe.profileId, recipe]))
  if (recipesById.size !== recipes.length) throw new Error('recipe inputs contain duplicate profileId')
  for (const recipeId of recipeIds) {
    if (!recipesById.has(recipeId)) throw new Error(`recipe scope is missing recipe input: ${recipeId}`)
  }
  for (const recipeId of recipesById.keys()) {
    if (!recipeIds.has(recipeId)) throw new Error(`recipe input is outside population scope: ${recipeId}`)
  }

  const profileIds = new Set<string>()
  const keyByGroupId = new Map<string, string>()
  const groupIdByKey = new Map<string, string>()
  for (const profile of manifest.profiles) {
    assertUnique(profileIds, profile.id, 'crafter profile id')
    assertNonEmpty(profile.groupId, `groupId for ${profile.id}`)
    if (profile.crafter.specialist !== true && profile.crafter.specialist !== false) {
      throw new Error(`crafter ${profile.id} must normalize specialist to an explicit boolean`)
    }
    if (
      profile.crafter.cosmicToolGoodBonus !== true
      && profile.crafter.cosmicToolGoodBonus !== false
    ) {
      throw new Error(`crafter ${profile.id} must normalize cosmicToolGoodBonus to an explicit boolean`)
    }
    assertFiniteInteger(profile.crafter.level, `level for ${profile.id}`, 1)
    assertFiniteInteger(profile.crafter.craftsmanship, `craftsmanship for ${profile.id}`, 0)
    assertFiniteInteger(profile.crafter.control, `control for ${profile.id}`, 0)
    assertFiniteInteger(profile.crafter.maxCp, `maxCp for ${profile.id}`, 1)
    if (profile.source.patch !== manifest.patch) {
      throw new Error(`crafter ${profile.id} source patch does not match population patch`)
    }

    const tags = new Set<string>()
    for (const tag of profile.tags) assertUnique(tags, tag, `tag for ${profile.id}`)

    const groupKey = crafterProfileGroupKey(profile.crafter)
    const previousKey = keyByGroupId.get(profile.groupId)
    if (previousKey !== undefined && previousKey !== groupKey) {
      throw new Error(`crafter group ${profile.groupId} contains different normalized profiles`)
    }
    const previousGroupId = groupIdByKey.get(groupKey)
    if (previousGroupId !== undefined && previousGroupId !== profile.groupId) {
      throw new Error(`equivalent crafter profiles use different groupIds: ${previousGroupId}, ${profile.groupId}`)
    }
    keyByGroupId.set(profile.groupId, groupKey)
    groupIdByKey.set(groupKey, profile.groupId)

    const signatureRecipeIds = Object.keys(profile.mechanicsSignatureByRecipe)
    if (signatureRecipeIds.length !== recipeIds.size) {
      throw new Error(`crafter ${profile.id} must provide one mechanics signature per recipe`)
    }
    for (const recipeId of recipeIds) {
      const recipe = recipesById.get(recipeId)!
      const expected = crafterMechanicsSignature(recipe, profile.crafter)
      if (profile.mechanicsSignatureByRecipe[recipeId] !== expected) {
        throw new Error(`crafter ${profile.id} has invalid mechanics signature for ${recipeId}`)
      }
    }
    for (const recipeId of signatureRecipeIds) {
      if (!recipeIds.has(recipeId)) {
        throw new Error(`crafter ${profile.id} has mechanics signature outside recipe scope: ${recipeId}`)
      }
    }
  }
}

function groupIdsForRole(
  manifest: Readonly<CrafterGroupedSplitManifestV1>,
  role: CrafterSplitRole,
): readonly string[] {
  return manifest[GROUP_IDS_BY_ROLE[role]] as readonly string[]
}

export function crafterSplitRoleByGroupId(
  manifest: Readonly<CrafterGroupedSplitManifestV1>,
  groupId: string,
): CrafterSplitRole | null {
  return CRAFTER_SPLIT_ROLES.find((role) => groupIdsForRole(manifest, role).includes(groupId)) ?? null
}

export function validateCrafterGroupedSplit(
  split: Readonly<CrafterGroupedSplitManifestV1>,
  population: Readonly<CrafterPopulationManifestV1>,
): void {
  if (split.version !== CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION) {
    throw new Error(`crafter split version mismatch: ${String(split.version)}`)
  }
  assertNonEmpty(split.splitId, 'splitId')
  if (split.populationId !== population.populationId) {
    throw new Error(`split population mismatch: ${split.populationId}`)
  }
  if (JSON.stringify(split.groupKeyFields) !== JSON.stringify(CRAFTER_GROUP_KEY_FIELDS)) {
    throw new Error('crafter split groupKeyFields mismatch')
  }

  const knownGroupIds = new Set(population.profiles.map((profile) => profile.groupId))
  const assignedGroupIds = new Map<string, CrafterSplitRole>()
  for (const role of CRAFTER_SPLIT_ROLES) {
    const roleGroupIds = new Set<string>()
    for (const groupId of groupIdsForRole(split, role)) {
      assertUnique(roleGroupIds, groupId, `${role} groupId`)
      if (!knownGroupIds.has(groupId)) throw new Error(`unknown ${role} groupId: ${groupId}`)
      const previousRole = assignedGroupIds.get(groupId)
      if (previousRole !== undefined) {
        throw new Error(`crafter group ${groupId} leaks across ${previousRole} and ${role}`)
      }
      assignedGroupIds.set(groupId, role)
    }
  }
  for (const groupId of knownGroupIds) {
    if (!assignedGroupIds.has(groupId)) throw new Error(`crafter group is missing from split: ${groupId}`)
  }

  const corpusRoleById = new Map<string, CrafterSplitRole>()
  for (const role of CRAFTER_SPLIT_ROLES) {
    const roleCorpusIds = new Set<string>()
    for (const corpusId of split.seedCorpusIdsByRole?.[role] ?? []) {
      assertUnique(roleCorpusIds, corpusId, `${role} seed corpus id`)
      const previousRole = corpusRoleById.get(corpusId)
      if (previousRole !== undefined) {
        throw new Error(`seed corpus ${corpusId} leaks across ${previousRole} and ${role}`)
      }
      corpusRoleById.set(corpusId, role)
    }
  }
}

export function assertCrafterSplitPromotionReady(
  split: Readonly<CrafterGroupedSplitManifestV1>,
  population: Readonly<CrafterPopulationManifestV1>,
  recipes: readonly Readonly<RecipeProfile>[],
): void {
  // A promotion check is an evidence gate, so structural validation cannot be
  // left to a caller that may accidentally pass stale or leaking manifests.
  validateCrafterPopulationManifest(population, recipes)
  validateCrafterGroupedSplit(split, population)

  for (const role of PROMOTION_REQUIRED_CRAFTER_SPLIT_ROLES) {
    if (groupIdsForRole(split, role).length === 0) {
      throw new Error(`promotion split requires at least one ${role} group`)
    }
    if ((split.seedCorpusIdsByRole?.[role]?.length ?? 0) === 0) {
      throw new Error(`promotion split requires at least one ${role} seed corpus id`)
    }
  }
  if (
    split.oodProbeGroupIds.length > 0
    && (split.seedCorpusIdsByRole?.oodProbe?.length ?? 0) === 0
  ) {
    throw new Error('promotion split with oodProbe groups requires an oodProbe seed corpus id')
  }
}
