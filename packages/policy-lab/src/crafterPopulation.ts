import {
  recipeCrafterMechanicsSignatureKey,
  type CrafterProfile,
  type RecipeProfile,
  type SourceMetadata,
} from '@frozen-rabbit-expert/domain'
import {
  canonicalEvidenceContentHash,
  createValidatedEvaluationCorpusSealManifestIndex,
  sealedCorpusEntry,
  type EvaluationCorpusSealLookup,
  type EvaluationCorpusSealManifestV4,
  type Sha256ContentHash,
} from './corpusSeal'

export const CRAFTER_POPULATION_MANIFEST_VERSION = 'crafter-population-manifest-v2'
export const CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION = 'crafter-grouped-split-manifest-v4'
export const CRAFTER_MECHANICS_SIGNATURE_VERSION = 'crafter-mechanics-signature-v2'
export const CRAFTER_POPULATION_CONTENT_SCHEMA = 'crafter-population-content-v1'
export const CRAFTER_GROUPED_SPLIT_CONTENT_SCHEMA = 'crafter-grouped-split-content-v1'

function exactKeyOrder<T>() {
  return <Keys extends readonly (keyof T)[]>(
    keys: Exclude<keyof T, Keys[number]> extends never ? Keys : never,
  ): Keys => keys
}

export const CRAFTER_GROUP_KEY_FIELDS = exactKeyOrder<NormalizedCrafterProfile>()([
  'level',
  'craftsmanship',
  'control',
  'maxCp',
  'cosmicToolGoodBonus',
  'specialist',
] as const)

export type CrafterPopulationProvenance =
  | 'empirical'
  | 'loadout-derived'
  | 'boundary-probe'

export const CRAFTER_EVIDENCE_ROLES = [
  'regression-seen',
  'population',
  'adversarial',
] as const

export type CrafterEvidenceRole = (typeof CRAFTER_EVIDENCE_ROLES)[number]

export interface NormalizedCrafterProfile extends CrafterProfile {
  specialist: boolean
}

export interface CrafterEvidenceSnapshotV1 {
  snapshotId: string
  version: string
  sourceId: string
  sourceRevision: string
  contentHash: Sha256ContentHash
}

export interface ObservedPanelCrafterDerivationV1 {
  kind: 'observed-panel'
  snapshot: Readonly<CrafterEvidenceSnapshotV1>
  observationId: string
  observedAt: string
  observedCrafter: Readonly<NormalizedCrafterProfile>
}

export interface VersionedCalculatorCrafterDerivationV1 {
  kind: 'versioned-calculator'
  snapshot: Readonly<CrafterEvidenceSnapshotV1>
  calculatorId: string
  calculatorVersion: string
  calculatorSourceRevision: string
  calculatorContentHash: Sha256ContentHash
  inputSnapshot: Readonly<CrafterEvidenceSnapshotV1>
  gameDataSnapshot: Readonly<CrafterEvidenceSnapshotV1>
  calculatedCrafter: Readonly<NormalizedCrafterProfile>
}

export interface BoundaryProbeCrafterDerivationV1 {
  kind: 'boundary-probe'
  snapshot: Readonly<CrafterEvidenceSnapshotV1>
  generatorId: string
  generatorVersion: string
  generatorSourceRevision: string
  generatorContentHash: Sha256ContentHash
  inputSnapshot: Readonly<CrafterEvidenceSnapshotV1>
  basePopulationId: string
  baseProfileId: string
  changedFields: readonly (typeof CRAFTER_GROUP_KEY_FIELDS)[number][]
  purpose: string
  generatedCrafter: Readonly<NormalizedCrafterProfile>
}

export type CrafterProfileDerivationV1 =
  | ObservedPanelCrafterDerivationV1
  | VersionedCalculatorCrafterDerivationV1
  | BoundaryProbeCrafterDerivationV1

export interface CrafterPopulationProfileV2 {
  id: string
  groupId: string
  /** Underlying gear/loadout family before food, medicine, or specialist preparation. */
  splitFamilyId: string
  crafter: Readonly<NormalizedCrafterProfile>
  provenance: CrafterPopulationProvenance
  evidenceRole: CrafterEvidenceRole
  derivation: Readonly<CrafterProfileDerivationV1>
  source: Readonly<SourceMetadata>
  tags: readonly string[]
  mechanicsSignatureByRecipe: Readonly<Record<string, string>>
}

export interface CrafterPopulationManifestV2 {
  version: typeof CRAFTER_POPULATION_MANIFEST_VERSION
  populationId: string
  patch: string
  recipeScope: readonly string[]
  profiles: readonly CrafterPopulationProfileV2[]
}

export const CRAFTER_SPLIT_ROLES = [
  'regressionSeen',
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

export interface CrafterGroupedSplitManifestV4 {
  version: typeof CRAFTER_GROUPED_SPLIT_MANIFEST_VERSION
  splitId: string
  populationId: string
  groupKeyFields: typeof CRAFTER_GROUP_KEY_FIELDS
  regressionSeenGroupIds: readonly string[]
  trainGroupIds: readonly string[]
  validationGroupIds: readonly string[]
  heldOutInterpolationGroupIds: readonly string[]
  heldOutBoundaryGroupIds: readonly string[]
  reservedFinalGroupIds: readonly string[]
  oodProbeGroupIds: readonly string[]
  seedCorpusIdsByRole?: Readonly<Partial<Record<CrafterSplitRole, readonly string[]>>>
  /**
   * Exact recipe-and-group binding prevents a valid state corpus from being
   * swapped between either equipment profiles or recipes.
   */
  initialStateCorpusIdByRecipeAndGroupId?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >
}

export function canonicalCrafterPopulationManifestContentHash(
  manifest: Readonly<CrafterPopulationManifestV2>,
): Sha256ContentHash {
  return canonicalEvidenceContentHash({
    schema: CRAFTER_POPULATION_CONTENT_SCHEMA,
    manifest,
  })
}

export function canonicalCrafterGroupedSplitManifestContentHash(
  split: Readonly<CrafterGroupedSplitManifestV4>,
): Sha256ContentHash {
  return canonicalEvidenceContentHash({
    schema: CRAFTER_GROUPED_SPLIT_CONTENT_SCHEMA,
    split,
  })
}

export interface CrafterSplitPromotionExpectedContentHashes {
  expectedPopulationManifestContentHash: Sha256ContentHash
  expectedSplitManifestContentHash: Sha256ContentHash
  expectedCorpusSealManifestContentHash: Sha256ContentHash
}

const GROUP_IDS_BY_ROLE = {
  regressionSeen: 'regressionSeenGroupIds',
  train: 'trainGroupIds',
  validation: 'validationGroupIds',
  heldOutInterpolation: 'heldOutInterpolationGroupIds',
  heldOutBoundary: 'heldOutBoundaryGroupIds',
  reservedFinal: 'reservedFinalGroupIds',
  oodProbe: 'oodProbeGroupIds',
} as const satisfies Readonly<Record<CrafterSplitRole, keyof CrafterGroupedSplitManifestV4>>

const SHA256_CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/

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

function assertSha256ContentHash(value: string, label: string): asserts value is Sha256ContentHash {
  if (!SHA256_CONTENT_HASH_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase sha256 content hash`)
  }
}

function assertExpectedContentHash(
  actual: Sha256ContentHash,
  expected: Sha256ContentHash,
  label: string,
): void {
  assertSha256ContentHash(expected, `expected ${label} content hash`)
  if (actual !== expected) {
    throw new Error(`${label} trusted hash mismatch: expected ${expected}, received ${actual}`)
  }
}

function validateEvidenceSnapshot(
  snapshot: Readonly<CrafterEvidenceSnapshotV1>,
  label: string,
): void {
  assertNonEmpty(snapshot.snapshotId, `${label} snapshotId`)
  assertNonEmpty(snapshot.version, `${label} version`)
  assertNonEmpty(snapshot.sourceId, `${label} sourceId`)
  assertNonEmpty(snapshot.sourceRevision, `${label} sourceRevision`)
  assertSha256ContentHash(snapshot.contentHash, `${label} contentHash`)
}

function assertNormalizedCrafter(
  crafter: Readonly<NormalizedCrafterProfile>,
  label: string,
): void {
  if (crafter.specialist !== true && crafter.specialist !== false) {
    throw new Error(`${label} must normalize specialist to an explicit boolean`)
  }
  if (crafter.cosmicToolGoodBonus !== true && crafter.cosmicToolGoodBonus !== false) {
    throw new Error(`${label} must normalize cosmicToolGoodBonus to an explicit boolean`)
  }
  assertFiniteInteger(crafter.level, `${label} level`, 1)
  assertFiniteInteger(crafter.craftsmanship, `${label} craftsmanship`, 0)
  assertFiniteInteger(crafter.control, `${label} control`, 0)
  assertFiniteInteger(crafter.maxCp, `${label} maxCp`, 1)
}

function assertDerivedCrafterMatchesProfile(
  profile: Readonly<CrafterPopulationProfileV2>,
  derivedCrafter: Readonly<NormalizedCrafterProfile>,
  label: string,
): void {
  assertNormalizedCrafter(derivedCrafter, label)
  if (crafterProfileGroupKey(derivedCrafter) !== crafterProfileGroupKey(profile.crafter)) {
    throw new Error(`crafter ${profile.id} ${label} does not equal profile crafter`)
  }
}

interface EvidenceSnapshotReference {
  label: string
  snapshot: Readonly<CrafterEvidenceSnapshotV1>
  familyBound: boolean
}

function validateCrafterDerivation(
  profile: Readonly<CrafterPopulationProfileV2>,
): readonly EvidenceSnapshotReference[] {
  const { derivation } = profile
  validateEvidenceSnapshot(derivation.snapshot, `crafter ${profile.id} derivation`)
  if (profile.source.sourceRevision !== derivation.snapshot.sourceRevision) {
    throw new Error(`crafter ${profile.id} source revision does not match derivation snapshot`)
  }

  switch (derivation.kind) {
    case 'observed-panel':
      if (profile.provenance !== 'empirical' || profile.source.sourceKind !== 'empirical') {
        throw new Error(`crafter ${profile.id} observed-panel derivation requires empirical provenance and source`)
      }
      if (profile.evidenceRole === 'adversarial') {
        throw new Error(`crafter ${profile.id} adversarial evidence requires a boundary-probe derivation`)
      }
      assertNonEmpty(derivation.observationId, `observationId for ${profile.id}`)
      assertNonEmpty(derivation.observedAt, `observedAt for ${profile.id}`)
      assertDerivedCrafterMatchesProfile(profile, derivation.observedCrafter, 'observedCrafter')
      return [{ label: 'observed snapshot', snapshot: derivation.snapshot, familyBound: true }]
    case 'versioned-calculator':
      if (profile.provenance !== 'loadout-derived' || profile.source.sourceKind === 'assumption') {
        throw new Error(`crafter ${profile.id} versioned-calculator derivation requires non-assumption loadout-derived evidence`)
      }
      if (profile.evidenceRole === 'adversarial') {
        throw new Error(`crafter ${profile.id} adversarial evidence requires a boundary-probe derivation`)
      }
      assertNonEmpty(derivation.calculatorId, `calculatorId for ${profile.id}`)
      assertNonEmpty(derivation.calculatorVersion, `calculatorVersion for ${profile.id}`)
      assertNonEmpty(derivation.calculatorSourceRevision, `calculatorSourceRevision for ${profile.id}`)
      assertSha256ContentHash(
        derivation.calculatorContentHash,
        `calculatorContentHash for ${profile.id}`,
      )
      validateEvidenceSnapshot(derivation.inputSnapshot, `crafter ${profile.id} calculator input`)
      validateEvidenceSnapshot(derivation.gameDataSnapshot, `crafter ${profile.id} game data`)
      assertDerivedCrafterMatchesProfile(profile, derivation.calculatedCrafter, 'calculatedCrafter')
      return [
        { label: 'calculator result snapshot', snapshot: derivation.snapshot, familyBound: true },
        { label: 'calculator input snapshot', snapshot: derivation.inputSnapshot, familyBound: true },
        { label: 'game data snapshot', snapshot: derivation.gameDataSnapshot, familyBound: false },
      ]
    case 'boundary-probe': {
      if (
        profile.provenance !== 'boundary-probe'
        || profile.evidenceRole !== 'adversarial'
        || profile.source.sourceKind !== 'assumption'
      ) {
        throw new Error(`crafter ${profile.id} boundary-probe derivation requires adversarial assumption evidence`)
      }
      assertNonEmpty(derivation.generatorId, `generatorId for ${profile.id}`)
      assertNonEmpty(derivation.generatorVersion, `generatorVersion for ${profile.id}`)
      assertNonEmpty(derivation.generatorSourceRevision, `generatorSourceRevision for ${profile.id}`)
      assertSha256ContentHash(
        derivation.generatorContentHash,
        `generatorContentHash for ${profile.id}`,
      )
      validateEvidenceSnapshot(derivation.inputSnapshot, `crafter ${profile.id} boundary input`)
      assertNonEmpty(derivation.basePopulationId, `basePopulationId for ${profile.id}`)
      assertNonEmpty(derivation.baseProfileId, `baseProfileId for ${profile.id}`)
      assertNonEmpty(derivation.purpose, `boundary purpose for ${profile.id}`)
      if (derivation.changedFields.length === 0) {
        throw new Error(`crafter ${profile.id} boundary-probe changedFields must not be empty`)
      }
      const changedFields = new Set<string>()
      for (const field of derivation.changedFields) {
        if (!CRAFTER_GROUP_KEY_FIELDS.includes(field)) {
          throw new Error(`crafter ${profile.id} boundary-probe has unknown changed field: ${String(field)}`)
        }
        assertUnique(changedFields, field, `changed field for ${profile.id}`)
      }
      assertDerivedCrafterMatchesProfile(profile, derivation.generatedCrafter, 'generatedCrafter')
      return [
        { label: 'boundary result snapshot', snapshot: derivation.snapshot, familyBound: true },
        { label: 'boundary input snapshot', snapshot: derivation.inputSnapshot, familyBound: true },
      ]
    }
    default:
      throw new Error(`crafter ${profile.id} has unknown derivation kind`)
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
  manifest: Readonly<CrafterPopulationManifestV2>,
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
  const snapshotByIdentity = new Map<string, Readonly<CrafterEvidenceSnapshotV1>>()
  const splitFamilyByEvidenceHash = new Map<Sha256ContentHash, string>()
  const calculatorArtifactByIdentity = new Map<string, string>()
  const generatorArtifactByIdentity = new Map<string, string>()
  for (const profile of manifest.profiles) {
    assertUnique(profileIds, profile.id, 'crafter profile id')
    assertNonEmpty(profile.groupId, `groupId for ${profile.id}`)
    assertNonEmpty(profile.splitFamilyId, `splitFamilyId for ${profile.id}`)
    if (!(CRAFTER_EVIDENCE_ROLES as readonly string[]).includes(profile.evidenceRole)) {
      throw new Error(`crafter ${profile.id} has unknown evidenceRole: ${String(profile.evidenceRole)}`)
    }
    assertNormalizedCrafter(profile.crafter, `crafter ${profile.id}`)
    if (profile.source.patch !== manifest.patch) {
      throw new Error(`crafter ${profile.id} source patch does not match population patch`)
    }
    assertNonEmpty(profile.source.sourceRevision ?? '', `sourceRevision for ${profile.id}`)
    assertNonEmpty(profile.source.verifiedAt, `source verifiedAt for ${profile.id}`)

    const evidenceSnapshots = validateCrafterDerivation(profile)
    if (profile.derivation.kind === 'versioned-calculator') {
      const identity = `${profile.derivation.calculatorId}\u0000${profile.derivation.calculatorVersion}`
      const artifact = `${profile.derivation.calculatorSourceRevision}\u0000${profile.derivation.calculatorContentHash}`
      const previousArtifact = calculatorArtifactByIdentity.get(identity)
      if (previousArtifact !== undefined && previousArtifact !== artifact) {
        throw new Error(
          `calculator ${profile.derivation.calculatorId}@${profile.derivation.calculatorVersion} has conflicting artifact identity`,
        )
      }
      calculatorArtifactByIdentity.set(identity, artifact)
    }
    if (profile.derivation.kind === 'boundary-probe') {
      const identity = `${profile.derivation.generatorId}\u0000${profile.derivation.generatorVersion}`
      const artifact = `${profile.derivation.generatorSourceRevision}\u0000${profile.derivation.generatorContentHash}`
      const previousArtifact = generatorArtifactByIdentity.get(identity)
      if (previousArtifact !== undefined && previousArtifact !== artifact) {
        throw new Error(
          `generator ${profile.derivation.generatorId}@${profile.derivation.generatorVersion} has conflicting artifact identity`,
        )
      }
      generatorArtifactByIdentity.set(identity, artifact)
    }

    for (const { label, snapshot, familyBound } of evidenceSnapshots) {
      const snapshotIdentity = `${snapshot.sourceId}\u0000${snapshot.snapshotId}`
      const previousSnapshot = snapshotByIdentity.get(snapshotIdentity)
      if (previousSnapshot !== undefined && (
        previousSnapshot.contentHash !== snapshot.contentHash
        || previousSnapshot.version !== snapshot.version
        || previousSnapshot.sourceRevision !== snapshot.sourceRevision
      )) {
        throw new Error(`evidence snapshot ${snapshot.sourceId}/${snapshot.snapshotId} has conflicting identity metadata`)
      }
      snapshotByIdentity.set(snapshotIdentity, snapshot)

      if (familyBound) {
        const previousFamily = splitFamilyByEvidenceHash.get(snapshot.contentHash)
        if (previousFamily !== undefined && previousFamily !== profile.splitFamilyId) {
          throw new Error(
            `${label} content hash ${snapshot.contentHash} is assigned to different split families: ${previousFamily}, ${profile.splitFamilyId}`,
          )
        }
        splitFamilyByEvidenceHash.set(snapshot.contentHash, profile.splitFamilyId)
      }
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

  const profilesById = new Map(manifest.profiles.map((profile) => [profile.id, profile]))
  for (const profile of manifest.profiles) {
    if (profile.derivation.kind !== 'boundary-probe') continue
    const { derivation } = profile
    if (derivation.basePopulationId !== manifest.populationId) {
      throw new Error(
        `crafter ${profile.id} boundary basePopulationId does not match populationId`,
      )
    }
    const baseProfile = profilesById.get(derivation.baseProfileId)
    if (baseProfile === undefined) {
      throw new Error(`crafter ${profile.id} boundary base profile is missing: ${derivation.baseProfileId}`)
    }
    if (baseProfile.derivation.kind === 'boundary-probe') {
      throw new Error(`crafter ${profile.id} boundary base profile must not be another boundary probe`)
    }
    if (baseProfile.splitFamilyId !== profile.splitFamilyId) {
      throw new Error(`crafter ${profile.id} boundary probe must retain its base split family`)
    }
    const baseSnapshot = baseProfile.derivation.snapshot
    const inputSnapshot = derivation.inputSnapshot
    if (
      inputSnapshot.snapshotId !== baseSnapshot.snapshotId
      || inputSnapshot.version !== baseSnapshot.version
      || inputSnapshot.sourceId !== baseSnapshot.sourceId
      || inputSnapshot.sourceRevision !== baseSnapshot.sourceRevision
      || inputSnapshot.contentHash !== baseSnapshot.contentHash
    ) {
      throw new Error(`crafter ${profile.id} boundary input snapshot does not match its base profile`)
    }
    const actualChangedFields = CRAFTER_GROUP_KEY_FIELDS.filter((field) => (
      baseProfile.crafter[field] !== profile.crafter[field]
    ))
    const declaredChangedFields = new Set(derivation.changedFields)
    if (
      actualChangedFields.length !== declaredChangedFields.size
      || actualChangedFields.some((field) => !declaredChangedFields.has(field))
    ) {
      throw new Error(`crafter ${profile.id} boundary changedFields do not match the generated profile`)
    }
  }
}

function groupIdsForRole(
  manifest: Readonly<CrafterGroupedSplitManifestV4>,
  role: CrafterSplitRole,
): readonly string[] {
  return manifest[GROUP_IDS_BY_ROLE[role]] as readonly string[]
}

export function crafterSplitRoleByGroupId(
  manifest: Readonly<CrafterGroupedSplitManifestV4>,
  groupId: string,
): CrafterSplitRole | null {
  return CRAFTER_SPLIT_ROLES.find((role) => groupIdsForRole(manifest, role).includes(groupId)) ?? null
}

export function validateCrafterGroupedSplit(
  split: Readonly<CrafterGroupedSplitManifestV4>,
  population: Readonly<CrafterPopulationManifestV2>,
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

  const knownRecipeIds = new Set(population.recipeScope)
  const initialStateCorpusBindingById = new Map<string, string>()
  for (const [recipeProfileId, idsByGroupId] of Object.entries(
    split.initialStateCorpusIdByRecipeAndGroupId ?? {},
  )) {
    if (!knownRecipeIds.has(recipeProfileId)) {
      throw new Error(`unknown initial-state corpus recipe profileId: ${recipeProfileId}`)
    }
    for (const [groupId, corpusId] of Object.entries(idsByGroupId)) {
      if (!knownGroupIds.has(groupId)) {
        throw new Error(`unknown initial-state corpus groupId: ${groupId}`)
      }
      assertNonEmpty(corpusId, `initial-state corpus id for ${recipeProfileId}/${groupId}`)
      const binding = `${recipeProfileId}/${groupId}`
      const previousBinding = initialStateCorpusBindingById.get(corpusId)
      if (previousBinding !== undefined) {
        throw new Error(
          `initial-state corpus ${corpusId} is bound to multiple recipe/group pairs: ${previousBinding}, ${binding}`,
        )
      }
      initialStateCorpusBindingById.set(corpusId, binding)
    }
  }

  const promotionRequiredRoles = new Set<CrafterSplitRole>(
    PROMOTION_REQUIRED_CRAFTER_SPLIT_ROLES,
  )
  for (const profile of population.profiles) {
    const role = assignedGroupIds.get(profile.groupId)!
    if (profile.derivation.kind === 'boundary-probe' && role !== 'oodProbe') {
      throw new Error(`boundary-probe crafter ${profile.id} may only be assigned to oodProbe`)
    }
    if (promotionRequiredRoles.has(role) && profile.evidenceRole !== 'population') {
      throw new Error(`${role} crafter ${profile.id} requires population evidence`)
    }
    if (role === 'regressionSeen' && profile.evidenceRole !== 'regression-seen') {
      throw new Error(`regressionSeen crafter ${profile.id} requires regression-seen evidence`)
    }
    if (profile.evidenceRole === 'regression-seen' && role !== 'regressionSeen') {
      throw new Error(`regression-seen crafter ${profile.id} may only be assigned to regressionSeen`)
    }
    if (profile.evidenceRole === 'adversarial' && role !== 'oodProbe') {
      throw new Error(`adversarial crafter ${profile.id} may only be assigned to oodProbe`)
    }
  }

  const profilesById = new Map(population.profiles.map((profile) => [profile.id, profile]))
  for (const profile of population.profiles) {
    if (profile.derivation.kind !== 'boundary-probe') continue
    const baseProfile = profilesById.get(profile.derivation.baseProfileId)
    if (baseProfile === undefined) {
      throw new Error(`boundary-probe crafter ${profile.id} has unknown base profile`)
    }
    const baseRole = assignedGroupIds.get(baseProfile.groupId)
    if (baseRole !== 'regressionSeen' && baseRole !== 'train') {
      throw new Error(
        `boundary-probe crafter ${profile.id} base profile ${baseProfile.id} is assigned to ${String(baseRole)}; only regressionSeen or train bases are allowed`,
      )
    }
  }

  const roleBySplitFamilyId = new Map<string, CrafterSplitRole>()
  for (const profile of population.profiles) {
    const role = assignedGroupIds.get(profile.groupId)!
    // Adversarial probes may deliberately derive from a seen family. They do
    // not count as population evidence and therefore do not make that family
    // an independent OOD/held-out family.
    if (
      role === 'oodProbe'
      && profile.evidenceRole === 'adversarial'
      && profile.derivation.kind === 'boundary-probe'
    ) continue
    const previousRole = roleBySplitFamilyId.get(profile.splitFamilyId)
    if (previousRole !== undefined && previousRole !== role) {
      throw new Error(
        `crafter split family ${profile.splitFamilyId} leaks across ${previousRole} and ${role}`,
      )
    }
    roleBySplitFamilyId.set(profile.splitFamilyId, role)
  }

  for (const [kind, idsByRole] of [
    ['seed', split.seedCorpusIdsByRole],
    ['initial-state', Object.fromEntries(CRAFTER_SPLIT_ROLES.map((role) => [
      role,
      Object.values(split.initialStateCorpusIdByRecipeAndGroupId ?? {}).flatMap(
        (idsByGroupId) => groupIdsForRole(split, role).flatMap((groupId) => {
          const corpusId = idsByGroupId[groupId]
          return corpusId === undefined ? [] : [corpusId]
        }),
      ),
    ]))],
  ] as const) {
    const corpusRoleById = new Map<string, CrafterSplitRole>()
    for (const role of CRAFTER_SPLIT_ROLES) {
      const roleCorpusIds = new Set<string>()
      for (const corpusId of idsByRole?.[role] ?? []) {
        assertUnique(roleCorpusIds, corpusId, `${role} ${kind} corpus id`)
        const previousRole = corpusRoleById.get(corpusId)
        if (previousRole !== undefined) {
          throw new Error(`${kind} corpus ${corpusId} leaks across ${previousRole} and ${role}`)
        }
        corpusRoleById.set(corpusId, role)
      }
    }
  }
}

export function assertCrafterSplitPromotionReady(
  split: Readonly<CrafterGroupedSplitManifestV4>,
  population: Readonly<CrafterPopulationManifestV2>,
  recipes: readonly Readonly<RecipeProfile>[],
  corpusSealManifest: Readonly<EvaluationCorpusSealManifestV4>,
  expectedContentHashes: Readonly<CrafterSplitPromotionExpectedContentHashes>,
): void {
  // A promotion check is an evidence gate, so structural validation cannot be
  // left to a caller that may accidentally pass stale or leaking manifests.
  validateCrafterPopulationManifest(population, recipes)
  validateCrafterGroupedSplit(split, population)
  assertExpectedContentHash(
    canonicalCrafterPopulationManifestContentHash(population),
    expectedContentHashes.expectedPopulationManifestContentHash,
    'crafter population manifest',
  )
  assertExpectedContentHash(
    canonicalCrafterGroupedSplitManifestContentHash(split),
    expectedContentHashes.expectedSplitManifestContentHash,
    'crafter split manifest',
  )
  const corpusSealIndex = createValidatedEvaluationCorpusSealManifestIndex(corpusSealManifest)
  assertExpectedContentHash(
    corpusSealManifest.manifestContentHash,
    expectedContentHashes.expectedCorpusSealManifestContentHash,
    'corpus seal manifest',
  )
  assertCrafterSplitCorporaSealedAndIsolated(split, corpusSealIndex)

  for (const role of PROMOTION_REQUIRED_CRAFTER_SPLIT_ROLES) {
    if (groupIdsForRole(split, role).length === 0) {
      throw new Error(`promotion split requires at least one ${role} group`)
    }
    if ((split.seedCorpusIdsByRole?.[role]?.length ?? 0) !== 1) {
      throw new Error(`promotion split requires exactly one ${role} seed corpus id`)
    }
    for (const recipeProfileId of population.recipeScope) {
      for (const groupId of groupIdsForRole(split, role)) {
        if (
          split.initialStateCorpusIdByRecipeAndGroupId?.[recipeProfileId]?.[groupId]
          === undefined
        ) {
          throw new Error(
            `promotion split requires an initial-state corpus id for ${recipeProfileId}/${role} group ${groupId}`,
          )
        }
      }
    }
  }
  if (
    split.oodProbeGroupIds.length > 0
    && (split.seedCorpusIdsByRole?.oodProbe?.length ?? 0) !== 1
  ) {
    throw new Error('promotion split with oodProbe groups requires exactly one oodProbe seed corpus id')
  }
  if (
    split.oodProbeGroupIds.length > 0
    && population.recipeScope.some((recipeProfileId) => (
      split.oodProbeGroupIds.some((groupId) => (
        split.initialStateCorpusIdByRecipeAndGroupId?.[recipeProfileId]?.[groupId] === undefined
      ))
    ))
  ) {
    throw new Error('promotion split with oodProbe groups requires an initial-state corpus id per group')
  }
}

/**
 * Verifies every split-declared corpus against the sealed manifest and rejects
 * even partial member overlap across evidence roles.
 */
export function assertCrafterSplitCorporaSealedAndIsolated(
  split: Readonly<CrafterGroupedSplitManifestV4>,
  corpusSealLookup: EvaluationCorpusSealLookup,
): void {
  const corpusSealIndex = 'entriesById' in corpusSealLookup
    ? corpusSealLookup
    : createValidatedEvaluationCorpusSealManifestIndex(corpusSealLookup)

  for (const [recipeProfileId, idsByGroupId] of Object.entries(
    split.initialStateCorpusIdByRecipeAndGroupId ?? {},
  )) {
    for (const [groupId, corpusId] of Object.entries(idsByGroupId)) {
      const entry = sealedCorpusEntry(corpusSealIndex, corpusId, 'initial-state')
      if (entry.kind !== 'initial-state') throw new Error('unreachable initial-state corpus kind')
      if (
        entry.binding.recipeProfileId !== recipeProfileId
        || entry.binding.crafterGroupId !== groupId
      ) {
        throw new Error(
          `sealed initial-state corpus ${corpusId} binding mismatch: expected ${recipeProfileId}/${groupId}, received ${entry.binding.recipeProfileId}/${entry.binding.crafterGroupId}`,
        )
      }
    }
  }

  for (const [kind, idsByRole] of [
    ['seed', split.seedCorpusIdsByRole],
    ['initial-state', Object.fromEntries(CRAFTER_SPLIT_ROLES.map((role) => [
      role,
      Object.values(split.initialStateCorpusIdByRecipeAndGroupId ?? {}).flatMap(
        (idsByGroupId) => groupIdsForRole(split, role).flatMap((groupId) => {
          const corpusId = idsByGroupId[groupId]
          return corpusId === undefined ? [] : [corpusId]
        }),
      ),
    ]))],
  ] as const) {
    const roleByMemberHash = new Map<Sha256ContentHash, CrafterSplitRole>()
    for (const role of CRAFTER_SPLIT_ROLES) {
      for (const corpusId of idsByRole?.[role] ?? []) {
        const entry = sealedCorpusEntry(corpusSealIndex, corpusId, kind)
        for (const memberHash of entry.overlapMemberHashes) {
          const previousRole = roleByMemberHash.get(memberHash)
          if (previousRole !== undefined && previousRole !== role) {
            throw new Error(
              `sealed ${kind} member ${memberHash} leaks across ${previousRole} and ${role}`,
            )
          }
          roleByMemberHash.set(memberHash, role)
        }
      }
    }
  }
}
