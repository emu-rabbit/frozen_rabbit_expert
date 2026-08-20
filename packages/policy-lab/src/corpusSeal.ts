import type { CraftBuffs, CraftState } from '@frozen-rabbit-expert/domain'

export const EVALUATION_CORPUS_SEAL_MANIFEST_VERSION = 'evaluation-corpus-seal-manifest-v4'
export const SEED_CORPUS_CONTENT_SCHEMA = 'seed-corpus-content-v2'
export const SEED_CORPUS_MEMBER_SCHEMA = 'seed-corpus-member-v1'
export const INITIAL_STATE_CORPUS_CONTENT_SCHEMA = 'initial-state-corpus-content-v3'
export const INITIAL_STATE_CORPUS_MEMBER_SCHEMA = 'initial-state-corpus-member-v2'

export const EVALUATION_CORPUS_KINDS = [
  'seed',
  'initial-state',
] as const

export type EvaluationCorpusKind = (typeof EVALUATION_CORPUS_KINDS)[number]
export type Sha256ContentHash = `sha256:${string}`

/** Locale-independent UTF-16 code-unit ordering for canonical evidence identities. */
export function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function exactKeyOrder<T>() {
  return <Keys extends readonly (keyof T)[]>(
    keys: Exclude<keyof T, Keys[number]> extends never ? Keys : never,
  ): Keys => keys
}

/**
 * This order is part of INITIAL_STATE_CORPUS_CONTENT_SCHEMA. The type-level
 * completeness check makes a newly-added CraftState field fail compilation
 * until the canonical corpus encoding is extended and versioned.
 */
export const CANONICAL_CRAFT_STATE_FIELD_ORDER = exactKeyOrder<CraftState>()([
  'step',
  'progress',
  'quality',
  'durability',
  'cp',
  'condition',
  'innerQuiet',
  'buffs',
  'comboFrom',
  'trainedPerfectionAvailable',
  'trainedPerfectionActive',
  'carefulObservationUsesLeft',
  'heartAndSoulAvailable',
  'heartAndSoulActive',
  'quickInnovationAvailable',
  'terminal',
  'failureReason',
] as const)

/** Buff order is independently locked because buffs are nested in CraftState. */
export const CANONICAL_CRAFT_BUFF_FIELD_ORDER = exactKeyOrder<CraftBuffs>()([
  'wasteNot',
  'veneration',
  'greatStrides',
  'innovation',
  'finalAppraisal',
  'manipulation',
  'muscleMemory',
  'expedience',
] as const)

export interface InitialStateCorpusBindingV1 {
  recipeProfileId: string
  crafterGroupId: string
}

export interface EvaluationSeedCorpusSealEntryV4 {
  corpusId: string
  kind: 'seed'
  contentHash: Sha256ContentHash
  memberHashes: readonly Sha256ContentHash[]
  overlapMemberHashes: readonly Sha256ContentHash[]
  binding: null
}

export interface EvaluationInitialStateCorpusSealEntryV4 {
  corpusId: string
  kind: 'initial-state'
  contentHash: Sha256ContentHash
  /** Ordered hashes include the corpus binding and prevent cross-recipe/group swaps. */
  memberHashes: readonly Sha256ContentHash[]
  /** Binding-free member hashes let the split gate reject content overlap across roles. */
  overlapMemberHashes: readonly Sha256ContentHash[]
  /** Explicit metadata lets promotion gates verify recipe x crafter-group routing. */
  binding: Readonly<InitialStateCorpusBindingV1>
}

export type EvaluationCorpusSealEntryV4 =
  | EvaluationSeedCorpusSealEntryV4
  | EvaluationInitialStateCorpusSealEntryV4

export interface EvaluationCorpusSealManifestV4 {
  version: typeof EVALUATION_CORPUS_SEAL_MANIFEST_VERSION
  manifestId: string
  manifestContentHash: Sha256ContentHash
  entries: readonly EvaluationCorpusSealEntryV4[]
}

export interface ValidatedEvaluationCorpusSealManifestIndex {
  readonly kind: 'validated-evaluation-corpus-seal-index-v1'
  readonly manifest: Readonly<EvaluationCorpusSealManifestV4>
  readonly entriesById: ReadonlyMap<string, Readonly<EvaluationCorpusSealEntryV4>>
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

function assertCanonicalJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCanonicalJsonValue(entry, `${path}[${index}]`))
    return
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) throw new TypeError(`${path}.${key} must not be undefined`)
      assertCanonicalJsonValue(entry, `${path}.${key}`)
    }
    return
  }
  throw new TypeError(`${path} is not canonical JSON data`)
}

const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

/** Dependency-free synchronous SHA-256 for the offline, synchronous evaluator. */
function sha256Hex(value: string): string {
  const input = new TextEncoder().encode(value)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLengthHigh = Math.floor(input.length / 0x2000_0000)
  const bitLengthLow = (input.length * 8) >>> 0
  view.setUint32(paddedLength - 8, bitLengthHigh)
  view.setUint32(paddedLength - 4, bitLengthLow)

  const hash = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4)
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15]!
      const word2 = words[index - 2]!
      const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3)
      const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10)
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0
    }

    let a = hash[0]!
    let b = hash[1]!
    let c = hash[2]!
    let d = hash[3]!
    let e = hash[4]!
    let f = hash[5]!
    let g = hash[6]!
    let h = hash[7]!
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index]! + words[index]!) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    hash[0] = (hash[0]! + a) >>> 0
    hash[1] = (hash[1]! + b) >>> 0
    hash[2] = (hash[2]! + c) >>> 0
    hash[3] = (hash[3]! + d) >>> 0
    hash[4] = (hash[4]! + e) >>> 0
    hash[5] = (hash[5]! + f) >>> 0
    hash[6] = (hash[6]! + g) >>> 0
    hash[7] = (hash[7]! + h) >>> 0
  }
  return [...hash].map((word) => word.toString(16).padStart(8, '0')).join('')
}

function sha256CanonicalJson(value: unknown): Sha256ContentHash {
  assertCanonicalJsonValue(value, 'corpus')
  return `sha256:${sha256Hex(JSON.stringify(value))}`
}

function sortedCanonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedCanonicalJsonValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Readonly<Record<string, unknown>>)
      .sort()
      .map((key) => [
        key,
        sortedCanonicalJsonValue((value as Readonly<Record<string, unknown>>)[key]),
      ]))
  }
  return value
}

function deepFreezeCanonicalJsonValue(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) deepFreezeCanonicalJsonValue(entry)
    Object.freeze(value)
  }
  return value
}

/** Returns a detached, recursively frozen copy suitable for a durable evidence report. */
export function immutableCanonicalEvidenceSnapshot<T>(value: T): Readonly<T> {
  assertCanonicalJsonValue(value, 'evidence snapshot')
  return deepFreezeCanonicalJsonValue(sortedCanonicalJsonValue(value)) as Readonly<T>
}

/** Stable identity hash for versioned evidence payloads with sorted object keys. */
export function canonicalEvidenceContentHash(value: unknown): Sha256ContentHash {
  return sha256CanonicalJson(sortedCanonicalJsonValue(value))
}

function canonicalCraftBuffTuple(buffs: Readonly<CraftBuffs>): readonly unknown[] {
  const values = {
    wasteNot: buffs.wasteNot,
    veneration: buffs.veneration,
    greatStrides: buffs.greatStrides,
    innovation: buffs.innovation,
    finalAppraisal: buffs.finalAppraisal,
    manipulation: buffs.manipulation,
    muscleMemory: buffs.muscleMemory,
    expedience: buffs.expedience,
  } satisfies { [Field in keyof CraftBuffs]: unknown }
  return CANONICAL_CRAFT_BUFF_FIELD_ORDER.map((field) => values[field])
}

function canonicalCraftStateTuple(state: Readonly<CraftState>): readonly unknown[] {
  const values = {
    step: state.step,
    progress: state.progress,
    quality: state.quality,
    durability: state.durability,
    cp: state.cp,
    condition: state.condition,
    innerQuiet: state.innerQuiet,
    buffs: canonicalCraftBuffTuple(state.buffs),
    comboFrom: state.comboFrom,
    trainedPerfectionAvailable: state.trainedPerfectionAvailable,
    trainedPerfectionActive: state.trainedPerfectionActive,
    carefulObservationUsesLeft: state.carefulObservationUsesLeft,
    heartAndSoulAvailable: state.heartAndSoulAvailable,
    heartAndSoulActive: state.heartAndSoulActive,
    quickInnovationAvailable: state.quickInnovationAvailable,
    terminal: state.terminal,
    failureReason: state.failureReason,
  } satisfies { [Field in keyof CraftState]: unknown }
  return CANONICAL_CRAFT_STATE_FIELD_ORDER.map((field) => values[field])
}

function assertCanonicalSeeds(seeds: readonly number[]): void {
  if (seeds.length === 0) throw new RangeError('seed corpus must not be empty')
  const seen = new Set<number>()
  for (const seed of seeds) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new RangeError('seed corpus values must be uint32 integers')
    }
    if (seen.has(seed)) throw new RangeError(`seed corpus contains duplicate seed: ${seed}`)
    seen.add(seed)
  }
}

export function canonicalSeedCorpusMemberHashes(
  seeds: readonly number[],
): readonly Sha256ContentHash[] {
  assertCanonicalSeeds(seeds)
  return seeds.map((seed) => sha256CanonicalJson({
    schema: SEED_CORPUS_MEMBER_SCHEMA,
    seed,
  }))
}

function canonicalCorpusContentHashFromMembers(
  kind: EvaluationCorpusKind,
  memberHashes: readonly Sha256ContentHash[],
): Sha256ContentHash {
  return sha256CanonicalJson({
    schema: kind === 'seed' ? SEED_CORPUS_CONTENT_SCHEMA : INITIAL_STATE_CORPUS_CONTENT_SCHEMA,
    memberHashes,
  })
}

/** The seed order is intentionally significant and sealed exactly as supplied. */
export function canonicalSeedCorpusContentHash(seeds: readonly number[]): Sha256ContentHash {
  return canonicalCorpusContentHashFromMembers('seed', canonicalSeedCorpusMemberHashes(seeds))
}

export function canonicalInitialStateCorpusMemberHashes(
  states: readonly Readonly<CraftState>[],
  binding: Readonly<InitialStateCorpusBindingV1>,
): readonly Sha256ContentHash[] {
  assertNonEmpty(binding.recipeProfileId, 'initial-state corpus recipeProfileId')
  assertNonEmpty(binding.crafterGroupId, 'initial-state corpus crafterGroupId')
  if (states.length === 0) throw new RangeError('initial-state corpus must not be empty')
  const memberHashes = states.map((state) => sha256CanonicalJson({
    schema: INITIAL_STATE_CORPUS_MEMBER_SCHEMA,
    binding: {
      recipeProfileId: binding.recipeProfileId,
      crafterGroupId: binding.crafterGroupId,
    },
    stateFieldOrder: CANONICAL_CRAFT_STATE_FIELD_ORDER,
    buffFieldOrder: CANONICAL_CRAFT_BUFF_FIELD_ORDER,
    state: canonicalCraftStateTuple(state),
  }))
  const seen = new Set<Sha256ContentHash>()
  for (const memberHash of memberHashes) {
    if (seen.has(memberHash)) {
      throw new RangeError(`initial-state corpus contains duplicate state: ${memberHash}`)
    }
    seen.add(memberHash)
  }
  return memberHashes
}

/**
 * Used only for leakage detection. It intentionally excludes crafterGroupId so
 * the same state cannot be relabelled into another split role, while retaining
 * recipe identity so numerically identical states from different recipes do
 * not collide.
 */
export function canonicalInitialStateCorpusOverlapMemberHashes(
  states: readonly Readonly<CraftState>[],
  recipeProfileId: string,
): readonly Sha256ContentHash[] {
  assertNonEmpty(recipeProfileId, 'initial-state corpus recipeProfileId')
  if (states.length === 0) throw new RangeError('initial-state corpus must not be empty')
  const memberHashes = states.map((state) => sha256CanonicalJson({
    schema: `${INITIAL_STATE_CORPUS_MEMBER_SCHEMA}-overlap`,
    recipeProfileId,
    stateFieldOrder: CANONICAL_CRAFT_STATE_FIELD_ORDER,
    buffFieldOrder: CANONICAL_CRAFT_BUFF_FIELD_ORDER,
    state: canonicalCraftStateTuple(state),
  }))
  const seen = new Set<Sha256ContentHash>()
  for (const memberHash of memberHashes) {
    if (seen.has(memberHash)) {
      throw new RangeError(`initial-state corpus contains duplicate state: ${memberHash}`)
    }
    seen.add(memberHash)
  }
  return memberHashes
}

/**
 * Seals every field that can affect an episode. Array order is significant;
 * object property insertion order cannot affect the explicit tuple encoding.
 */
export function canonicalInitialStateCorpusContentHash(
  states: readonly Readonly<CraftState>[],
  binding: Readonly<InitialStateCorpusBindingV1>,
): Sha256ContentHash {
  return canonicalCorpusContentHashFromMembers(
    'initial-state',
    canonicalInitialStateCorpusMemberHashes(states, binding),
  )
}

export function sealSeedCorpus(
  corpusId: string,
  seeds: readonly number[],
): EvaluationSeedCorpusSealEntryV4 {
  assertNonEmpty(corpusId, 'seed corpus id')
  const memberHashes = canonicalSeedCorpusMemberHashes(seeds)
  return {
    corpusId,
    kind: 'seed',
    contentHash: canonicalCorpusContentHashFromMembers('seed', memberHashes),
    memberHashes,
    overlapMemberHashes: memberHashes,
    binding: null,
  }
}

export function sealInitialStateCorpus(
  corpusId: string,
  states: readonly Readonly<CraftState>[],
  binding: Readonly<InitialStateCorpusBindingV1>,
): EvaluationInitialStateCorpusSealEntryV4 {
  assertNonEmpty(corpusId, 'initial-state corpus id')
  const memberHashes = canonicalInitialStateCorpusMemberHashes(states, binding)
  return {
    corpusId,
    kind: 'initial-state',
    contentHash: canonicalCorpusContentHashFromMembers('initial-state', memberHashes),
    memberHashes,
    overlapMemberHashes: canonicalInitialStateCorpusOverlapMemberHashes(
      states,
      binding.recipeProfileId,
    ),
    binding: {
      recipeProfileId: binding.recipeProfileId,
      crafterGroupId: binding.crafterGroupId,
    },
  }
}

export function canonicalEvaluationCorpusSealManifestContentHash(
  manifestId: string,
  entries: readonly Readonly<EvaluationCorpusSealEntryV4>[],
): Sha256ContentHash {
  assertNonEmpty(manifestId, 'evaluation corpus seal manifestId')
  return canonicalEvidenceContentHash({
    version: EVALUATION_CORPUS_SEAL_MANIFEST_VERSION,
    manifestId,
    entries: [...entries].sort((left, right) => (
      compareCanonicalStrings(left.corpusId, right.corpusId)
    )),
  })
}

export function createEvaluationCorpusSealManifest(
  manifestId: string,
  entries: readonly Readonly<EvaluationCorpusSealEntryV4>[],
): EvaluationCorpusSealManifestV4 {
  return {
    version: EVALUATION_CORPUS_SEAL_MANIFEST_VERSION,
    manifestId,
    manifestContentHash: canonicalEvaluationCorpusSealManifestContentHash(manifestId, entries),
    entries,
  }
}

export function validateEvaluationCorpusSealManifest(
  manifest: Readonly<EvaluationCorpusSealManifestV4>,
): void {
  if (manifest.version !== EVALUATION_CORPUS_SEAL_MANIFEST_VERSION) {
    throw new Error(`evaluation corpus seal manifest version mismatch: ${String(manifest.version)}`)
  }
  assertNonEmpty(manifest.manifestId, 'evaluation corpus seal manifestId')
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.manifestContentHash)) {
    throw new Error('evaluation corpus seal manifestContentHash must be a lowercase sha256 content hash')
  }
  if (manifest.entries.length === 0) {
    throw new Error('evaluation corpus seal manifest must contain entries')
  }
  const corpusIds = new Set<string>()
  for (const entry of manifest.entries) {
    assertNonEmpty(entry.corpusId, 'sealed corpus id')
    if (corpusIds.has(entry.corpusId)) {
      throw new Error(`duplicate sealed corpus id: ${entry.corpusId}`)
    }
    corpusIds.add(entry.corpusId)
    if (!(EVALUATION_CORPUS_KINDS as readonly string[]).includes(entry.kind)) {
      throw new Error(`unknown sealed corpus kind for ${entry.corpusId}: ${String(entry.kind)}`)
    }
    const rawBinding: unknown = (entry as { binding: unknown }).binding
    if (entry.kind === 'seed') {
      if (rawBinding !== null) {
        throw new Error(`sealed seed corpus ${entry.corpusId} must not declare an initial-state binding`)
      }
    } else {
      if (rawBinding === null || typeof rawBinding !== 'object') {
        throw new Error(`sealed initial-state corpus ${entry.corpusId} must declare its recipe/group binding`)
      }
      const bindingKeys = Object.keys(entry.binding).sort(compareCanonicalStrings)
      if (JSON.stringify(bindingKeys) !== JSON.stringify(['crafterGroupId', 'recipeProfileId'])) {
        throw new Error(`sealed initial-state corpus ${entry.corpusId} has invalid binding fields`)
      }
      assertNonEmpty(
        entry.binding.recipeProfileId,
        `sealed initial-state corpus ${entry.corpusId} recipeProfileId`,
      )
      assertNonEmpty(
        entry.binding.crafterGroupId,
        `sealed initial-state corpus ${entry.corpusId} crafterGroupId`,
      )
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(entry.contentHash)) {
      throw new Error(`invalid sha256 content hash for sealed corpus ${entry.corpusId}`)
    }
    if (!Array.isArray(entry.memberHashes) || entry.memberHashes.length === 0) {
      throw new Error(`sealed corpus ${entry.corpusId} must contain member hashes`)
    }
    const uniqueMemberHashes = new Set<string>()
    for (const memberHash of entry.memberHashes) {
      if (!/^sha256:[0-9a-f]{64}$/.test(memberHash)) {
        throw new Error(`invalid sha256 member hash for sealed corpus ${entry.corpusId}`)
      }
      if (uniqueMemberHashes.has(memberHash)) {
        throw new Error(`duplicate member hash in sealed corpus ${entry.corpusId}: ${memberHash}`)
      }
      uniqueMemberHashes.add(memberHash)
    }
    if (
      !Array.isArray(entry.overlapMemberHashes)
      || entry.overlapMemberHashes.length !== entry.memberHashes.length
    ) {
      throw new Error(`sealed corpus ${entry.corpusId} must contain one overlap hash per member`)
    }
    const uniqueOverlapMemberHashes = new Set<string>()
    for (const memberHash of entry.overlapMemberHashes) {
      if (!/^sha256:[0-9a-f]{64}$/.test(memberHash)) {
        throw new Error(`invalid sha256 overlap member hash for sealed corpus ${entry.corpusId}`)
      }
      if (uniqueOverlapMemberHashes.has(memberHash)) {
        throw new Error(`duplicate overlap member hash in sealed corpus ${entry.corpusId}: ${memberHash}`)
      }
      uniqueOverlapMemberHashes.add(memberHash)
    }
    if (
      entry.kind === 'seed'
      && JSON.stringify(entry.overlapMemberHashes) !== JSON.stringify(entry.memberHashes)
    ) {
      throw new Error(`sealed seed corpus ${entry.corpusId} overlap hashes must equal member hashes`)
    }
    const derivedContentHash = canonicalCorpusContentHashFromMembers(entry.kind, entry.memberHashes)
    if (entry.contentHash !== derivedContentHash) {
      throw new Error(`sealed corpus ${entry.corpusId} content hash does not match its members`)
    }
  }
  const derivedManifestContentHash = canonicalEvaluationCorpusSealManifestContentHash(
    manifest.manifestId,
    manifest.entries,
  )
  if (manifest.manifestContentHash !== derivedManifestContentHash) {
    throw new Error('evaluation corpus seal manifestContentHash does not match its entries')
  }
}

export function createValidatedEvaluationCorpusSealManifestIndex(
  manifest: Readonly<EvaluationCorpusSealManifestV4>,
): ValidatedEvaluationCorpusSealManifestIndex {
  validateEvaluationCorpusSealManifest(manifest)
  return Object.freeze({
    kind: 'validated-evaluation-corpus-seal-index-v1' as const,
    manifest,
    entriesById: new Map(manifest.entries.map((entry) => [entry.corpusId, entry])),
  })
}

export type EvaluationCorpusSealLookup =
  | Readonly<EvaluationCorpusSealManifestV4>
  | Readonly<ValidatedEvaluationCorpusSealManifestIndex>

function validatedCorpusSealIndex(
  lookup: EvaluationCorpusSealLookup,
): Readonly<ValidatedEvaluationCorpusSealManifestIndex> {
  return 'entriesById' in lookup
    ? lookup
    : createValidatedEvaluationCorpusSealManifestIndex(lookup)
}

export function sealedCorpusEntry(
  lookup: EvaluationCorpusSealLookup,
  corpusId: string,
  kind: EvaluationCorpusKind,
): Readonly<EvaluationCorpusSealEntryV4> {
  const index = validatedCorpusSealIndex(lookup)
  assertNonEmpty(corpusId, `${kind} corpus id`)
  const entry = index.entriesById.get(corpusId)
  if (entry === undefined) {
    throw new Error(
      `${kind} corpus ${corpusId} is not declared by seal manifest ${index.manifest.manifestId}`,
    )
  }
  if (entry.kind !== kind) {
    throw new Error(`sealed corpus ${corpusId} has kind ${entry.kind}, expected ${kind}`)
  }
  return entry
}

export function assertSealedCorpusContent(
  lookup: EvaluationCorpusSealLookup,
  actual: Readonly<EvaluationCorpusSealEntryV4>,
): Sha256ContentHash {
  const entry = sealedCorpusEntry(lookup, actual.corpusId, actual.kind)
  if (entry.contentHash !== actual.contentHash) {
    throw new Error(
      `${actual.kind} corpus ${actual.corpusId} content hash mismatch: expected ${entry.contentHash}, received ${actual.contentHash}`,
    )
  }
  if (JSON.stringify(entry.memberHashes) !== JSON.stringify(actual.memberHashes)) {
    throw new Error(`${actual.kind} corpus ${actual.corpusId} member hashes mismatch`)
  }
  if (JSON.stringify(entry.overlapMemberHashes) !== JSON.stringify(actual.overlapMemberHashes)) {
    throw new Error(`${actual.kind} corpus ${actual.corpusId} overlap member hashes mismatch`)
  }
  if (entry.kind === 'initial-state' && actual.kind === 'initial-state' && (
    entry.binding.recipeProfileId !== actual.binding.recipeProfileId
    || entry.binding.crafterGroupId !== actual.binding.crafterGroupId
  )) throw new Error(`${actual.kind} corpus ${actual.corpusId} binding mismatch`)
  return entry.contentHash
}
