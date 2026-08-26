import {
  ACTIONS,
  ACTION_IDS,
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  MATERIAL_CONDITIONS,
  applyObservedOutcome,
  assertCraftObjective,
  assertCraftState,
  craftScenarioModelContentHash,
  previewAction,
  type ActionPreview,
  type CraftActionId,
  type CraftObjective,
  type CraftScenarioModelContentHash,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { isPolicyActionSafe } from './policySafety'

export const CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION = 'craft-adaptive-policy-program-v2'
export const CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION = 'craft-adaptive-policy-features-v2'
export const CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION = 'solver-policy-safety-v1'

export type CraftAdaptivePolicyProgramContentHash = `sha256:${string}`
export type CraftAdaptivePolicyRuntimeContentHash = `sha256:${string}`

export const CRAFT_ADAPTIVE_POLICY_INTEGER_FEATURES = [
  'state.step',
  'state.progress',
  'state.progressRemaining',
  'state.progressBps',
  'state.quality',
  'state.qualityRemaining',
  'state.qualityBps',
  'state.durability',
  'state.durabilityBps',
  'state.cp',
  'state.cpBps',
  'state.innerQuiet',
  'state.carefulObservationUsesLeft',
  'state.buffs.wasteNot',
  'state.buffs.veneration',
  'state.buffs.greatStrides',
  'state.buffs.innovation',
  'state.buffs.finalAppraisal',
  'state.buffs.manipulation',
  'state.buffs.muscleMemory',
  'state.buffs.expedience',
  'recipe.progressRequired',
  'recipe.qualityMax',
  'recipe.requiredQuality',
  'recipe.durabilityMax',
  'objective.qualityMaximum',
  'crafter.level',
  'crafter.craftsmanship',
  'crafter.control',
  'crafter.maxCp',
  'memory.totalActionUses',
  'memory.totalNoStepUses',
  'memory.nodeActionUses',
  'memory.nodeNoStepUses',
  'memory.totalObservedTransitions',
] as const

export type CraftAdaptivePolicyFixedIntegerFeature =
  (typeof CRAFT_ADAPTIVE_POLICY_INTEGER_FEATURES)[number]
export type CraftAdaptivePolicyPreviewIntegerField =
  | 'progressGain'
  | 'qualityGain'
  | 'cpCost'
  | 'durabilityCost'
  | 'successRateBps'
  | 'progressAfter'
  | 'qualityAfter'
  | 'progressRemainingAfter'
  | 'qualityRemainingAfter'
export type CraftAdaptivePolicyIntegerFeature =
  | CraftAdaptivePolicyFixedIntegerFeature
  | `memory.actionUses.${CraftActionId}`
  | `preview.${CraftActionId}.${CraftAdaptivePolicyPreviewIntegerField}`

export const CRAFT_ADAPTIVE_POLICY_BOOLEAN_FEATURES = [
  'state.trainedPerfectionAvailable',
  'state.trainedPerfectionActive',
  'state.heartAndSoulAvailable',
  'state.heartAndSoulActive',
  'state.quickInnovationAvailable',
  'crafter.cosmicToolGoodBonus',
  'crafter.specialist',
  'memory.terminated',
] as const

export type CraftAdaptivePolicyFixedBooleanFeature =
  (typeof CRAFT_ADAPTIVE_POLICY_BOOLEAN_FEATURES)[number]
export type CraftAdaptivePolicyPreviewBooleanField =
  | 'legal'
  | 'policySafe'
  | 'wouldCompleteProgress'
  | 'wouldReachRequiredQuality'
  | 'wouldReachQualityMaximum'
  | 'wouldCompleteBelowQualityMaximum'
export type CraftAdaptivePolicyBooleanFeature =
  | CraftAdaptivePolicyFixedBooleanFeature
  | `memory.flags.${string}`
  | `preview.${CraftActionId}.${CraftAdaptivePolicyPreviewBooleanField}`

export const CRAFT_ADAPTIVE_POLICY_ENUM_FEATURES = [
  'state.condition',
  'state.terminal',
  'state.failureReason',
  'state.comboFrom',
  'objective.mode',
  'memory.activeNodeId',
  'memory.resumeNodeId',
  'memory.lastAction',
  'memory.lastActionOutcome',
] as const

export type CraftAdaptivePolicyEnumFeature =
  (typeof CRAFT_ADAPTIVE_POLICY_ENUM_FEATURES)[number]

export type CraftAdaptivePolicyIntegerOperator = 'eq' | 'lt' | 'lte' | 'gte' | 'gt'

export interface CraftAdaptivePolicyIntegerGuardV1 {
  kind: 'integer'
  feature: CraftAdaptivePolicyIntegerFeature
  op: CraftAdaptivePolicyIntegerOperator
  value: number
}

export interface CraftAdaptivePolicyBooleanGuardV1 {
  kind: 'boolean'
  feature: CraftAdaptivePolicyBooleanFeature
  op: 'eq'
  value: boolean
}

export interface CraftAdaptivePolicyEnumGuardV1 {
  kind: 'enum'
  feature: CraftAdaptivePolicyEnumFeature
  op: 'eq'
  value: string
}

export type CraftAdaptivePolicyGuardV1 =
  | CraftAdaptivePolicyIntegerGuardV1
  | CraftAdaptivePolicyBooleanGuardV1
  | CraftAdaptivePolicyEnumGuardV1

export interface CraftAdaptivePolicyFlagMutationV1 {
  flag: string
  value: boolean
}

export type CraftAdaptivePolicyResumeMutationV1 = 'active-node' | 'clear'
export type CraftAdaptivePolicyGotoV1 = string | '$resume'

export interface CraftAdaptivePolicyTransitionV1 {
  id: string
  all: readonly CraftAdaptivePolicyGuardV1[]
  goto: CraftAdaptivePolicyGotoV1
  setResume?: CraftAdaptivePolicyResumeMutationV1
  setFlag?: Readonly<CraftAdaptivePolicyFlagMutationV1>
}

export interface CraftAdaptivePolicyDecisionV1 {
  id: string
  all: readonly CraftAdaptivePolicyGuardV1[]
  actions: readonly CraftActionId[]
  /**
   * Maximize-quality recipes must opt in before an action may finish below
   * their policy objective. This keeps mechanics requiredQuality=0 from
   * silently turning an early low-quality finish into a "safe" action.
   */
  allowBelowObjectiveCompletion?: boolean
}

export type CraftAdaptivePolicyBudgetFallbackV1 =
  | {
      kind: 'goto'
      goto: CraftAdaptivePolicyGotoV1
      setResume?: CraftAdaptivePolicyResumeMutationV1
      setFlag?: Readonly<CraftAdaptivePolicyFlagMutationV1>
    }
  | {
      kind: 'terminate'
      reason: string
    }

export interface CraftAdaptivePolicyNodeV1 {
  ordinal: number
  id: string
  actionBudget: number
  transitions: readonly CraftAdaptivePolicyTransitionV1[]
  decisions: readonly CraftAdaptivePolicyDecisionV1[]
  onBudgetExhausted: Readonly<CraftAdaptivePolicyBudgetFallbackV1>
}

export interface CraftAdaptivePolicyProgramLimitsV1 {
  maxActions: number
  maxSettleHops: number
}

export interface CraftAdaptivePolicyProgramDefinitionV1 {
  version: typeof CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION
  programId: string
  scenarioId: string
  recipeProfileId: string
  scenarioModelIdentityVersion: typeof CRAFT_SCENARIO_MODEL_IDENTITY_VERSION
  scenarioModelContentHash: CraftScenarioModelContentHash
  objectiveId: string
  objectiveMode: CraftObjective['mode']
  qualityMaximum: number
  featureSchemaVersion: typeof CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION
  safetyVersion: typeof CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION
  entryNode: string
  limits: Readonly<CraftAdaptivePolicyProgramLimitsV1>
  nodes: readonly Readonly<CraftAdaptivePolicyNodeV1>[]
}

export interface CraftAdaptivePolicyProgramV1 extends CraftAdaptivePolicyProgramDefinitionV1 {
  contentHash: CraftAdaptivePolicyProgramContentHash
}

export type CraftAdaptivePolicyTerminationReason =
  | 'craft-completed'
  | 'craft-failed'
  | 'max-actions-exhausted'
  | 'settle-hop-limit'
  | 'missing-resume-node'
  | 'no-safe-action'
  | `program:${string}`

export interface SerializableCraftAdaptivePolicyMemoryV1 {
  version: typeof CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION
  programId: string
  programContentHash: CraftAdaptivePolicyProgramContentHash
  contextContentHash: CraftAdaptivePolicyRuntimeContentHash
  lastObservedStateHash: CraftAdaptivePolicyRuntimeContentHash | null
  activeNodeId: string
  resumeNodeId: string | null
  totalActionUses: number
  totalNoStepUses: number
  nodeActionUses: number
  nodeNoStepUses: number
  totalObservedTransitions: number
  actionUses: Record<CraftActionId, number>
  flags: Record<string, boolean>
  lastAction: CraftActionId | null
  lastActionSuccess: boolean | null
  terminated: boolean
  terminationReason: CraftAdaptivePolicyTerminationReason | null
}

export interface ObservedCraftAdaptivePolicyTransitionV1 {
  before: Readonly<CraftState>
  action: CraftActionId
  success: boolean
  after: Readonly<CraftState>
}

export interface CraftAdaptivePolicyDecisionResultV1 {
  action: CraftActionId | null
  nodeId: string
  decisionId: string | null
  status: 'active' | 'terminated'
  terminationReason: CraftAdaptivePolicyTerminationReason | null
  memory: SerializableCraftAdaptivePolicyMemoryV1
}

export interface CraftAdaptivePolicyContextV1 {
  scenarioId: string
  recipe: Readonly<RecipeProfile>
  objective: Readonly<CraftObjective>
  crafter: Readonly<CrafterProfile>
}

export interface CraftAdaptivePolicyControllerV1 {
  readonly context: CraftAdaptivePolicyContextV1
  readonly program: CraftAdaptivePolicyProgramV1
  decide(state: Readonly<CraftState>): CraftAdaptivePolicyDecisionResultV1
  advance(
    observed: Readonly<ObservedCraftAdaptivePolicyTransitionV1>,
  ): SerializableCraftAdaptivePolicyMemoryV1
  snapshot(): SerializableCraftAdaptivePolicyMemoryV1
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
  0x391c0cb3, 0x4ed8aa4, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const PROGRAM_IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/
const MAX_PROGRAM_NODES = 256
const MAX_NODE_TRANSITIONS = 256
const MAX_NODE_DECISIONS = 256
const MAX_PROGRAM_ACTIONS = 1_000
const MAX_SETTLE_HOPS = 128
const fixedIntegerFeatures = new Set<string>(CRAFT_ADAPTIVE_POLICY_INTEGER_FEATURES)
const fixedBooleanFeatures = new Set<string>(CRAFT_ADAPTIVE_POLICY_BOOLEAN_FEATURES)
const enumFeatures = new Set<string>(CRAFT_ADAPTIVE_POLICY_ENUM_FEATURES)
const actionIds = new Set<string>(ACTION_IDS)
const previewIntegerFields = new Set<CraftAdaptivePolicyPreviewIntegerField>([
  'progressGain',
  'qualityGain',
  'cpCost',
  'durabilityCost',
  'successRateBps',
  'progressAfter',
  'qualityAfter',
  'progressRemainingAfter',
  'qualityRemainingAfter',
])
const previewBooleanFields = new Set<CraftAdaptivePolicyPreviewBooleanField>([
  'legal',
  'policySafe',
  'wouldCompleteProgress',
  'wouldReachRequiredQuality',
  'wouldReachQualityMaximum',
  'wouldCompleteBelowQualityMaximum',
])

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

/** Synchronous and browser-safe so artifacts hash identically in web and Node. */
function sha256Hex(value: string): string {
  const input = new TextEncoder().encode(value)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(input.length / 0x2000_0000))
  view.setUint32(paddedLength - 4, (input.length * 8) >>> 0)

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
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

function canonicalJson(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite`)
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') throw new TypeError(`${path} is not canonical JSON data`)
  if (ancestors.has(value)) throw new TypeError(`${path} must not contain a cycle`)
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`, ancestors)).join(',')}]`
    }
    const record = value as Readonly<Record<string, unknown>>
    return `{${Object.keys(record).sort().map((key) => {
      const entry = record[key]
      if (entry === undefined) throw new TypeError(`${path}.${key} must not be undefined`)
      return `${JSON.stringify(key)}:${canonicalJson(entry, `${path}.${key}`, ancestors)}`
    }).join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function asRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

function assertExactKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) throw new Error(`${path}.${key} is not supported`)
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) throw new Error(`${path}.${key} is required`)
  }
}

function assertOptionalExactKeys(
  record: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${path}.${key} is not supported`)
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) throw new Error(`${path}.${key} is required`)
  }
}

function assertIdentifier(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !PROGRAM_IDENTIFIER.test(value)) {
    throw new Error(`${path} must be a lowercase versioned identifier`)
  }
}

function assertSafeIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${path} must be a safe integer from ${minimum} through ${maximum}`)
  }
}

function flagIdFromFeature(feature: string): string | null {
  return feature.startsWith('memory.flags.') ? feature.slice('memory.flags.'.length) : null
}

function actionIdFromUseFeature(feature: string): CraftActionId | null {
  if (!feature.startsWith('memory.actionUses.')) return null
  const action = feature.slice('memory.actionUses.'.length)
  return actionIds.has(action) ? action as CraftActionId : null
}

interface PreviewFeatureReference<Field extends string> {
  action: CraftActionId
  field: Field
}

function previewFeatureReference<Field extends string>(
  feature: string,
  fields: ReadonlySet<Field>,
): PreviewFeatureReference<Field> | null {
  const parts = feature.split('.')
  if (parts.length !== 3 || parts[0] !== 'preview') return null
  const action = parts[1]
  const field = parts[2]
  if (action === undefined || field === undefined || !actionIds.has(action) || !fields.has(field as Field)) {
    return null
  }
  return { action: action as CraftActionId, field: field as Field }
}

function previewIntegerFeatureReference(
  feature: string,
): PreviewFeatureReference<CraftAdaptivePolicyPreviewIntegerField> | null {
  return previewFeatureReference(feature, previewIntegerFields)
}

function previewBooleanFeatureReference(
  feature: string,
): PreviewFeatureReference<CraftAdaptivePolicyPreviewBooleanField> | null {
  return previewFeatureReference(feature, previewBooleanFields)
}

function assertGuard(value: unknown, path: string, nodeIds: ReadonlySet<string>): void {
  const guard = asRecord(value, path)
  assertExactKeys(guard, ['kind', 'feature', 'op', 'value'], path)
  if (guard.kind === 'integer') {
    if (typeof guard.feature !== 'string') throw new Error(`${path}.feature must be an integer feature`)
    const validFeature = fixedIntegerFeatures.has(guard.feature)
      || actionIdFromUseFeature(guard.feature) !== null
      || previewIntegerFeatureReference(guard.feature) !== null
    if (!validFeature) throw new Error(`${path}.feature is not a supported integer feature`)
    if (!['eq', 'lt', 'lte', 'gte', 'gt'].includes(String(guard.op))) {
      throw new Error(`${path}.op is not a supported integer operator`)
    }
    assertSafeIntegerInRange(guard.value, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, `${path}.value`)
    return
  }
  if (guard.kind === 'boolean') {
    if (typeof guard.feature !== 'string') throw new Error(`${path}.feature must be a boolean feature`)
    const flagId = flagIdFromFeature(guard.feature)
    if (
      !fixedBooleanFeatures.has(guard.feature)
      && flagId === null
      && previewBooleanFeatureReference(guard.feature) === null
    ) {
      throw new Error(`${path}.feature is not a supported boolean feature`)
    }
    if (flagId !== null) assertIdentifier(flagId, `${path}.feature flag`)
    if (guard.op !== 'eq' || typeof guard.value !== 'boolean') {
      throw new Error(`${path} boolean guards only support eq with a boolean value`)
    }
    return
  }
  if (guard.kind === 'enum') {
    if (typeof guard.feature !== 'string' || !enumFeatures.has(guard.feature)) {
      throw new Error(`${path}.feature is not a supported enum feature`)
    }
    if (guard.op !== 'eq' || typeof guard.value !== 'string') {
      throw new Error(`${path} enum guards only support eq with a string value`)
    }
    const staticAllowed = enumValuesForFeature(guard.feature, nodeIds)
    if (!staticAllowed.has(guard.value)) {
      throw new Error(`${path}.value is not valid for ${guard.feature}`)
    }
    return
  }
  throw new Error(`${path}.kind must be integer, boolean, or enum`)
}

function enumValuesForFeature(feature: string, nodeIds: ReadonlySet<string>): ReadonlySet<string> {
  if (feature === 'state.condition') return new Set(MATERIAL_CONDITIONS)
  if (feature === 'state.terminal') return new Set(['none', 'completed', 'failed'])
  if (feature === 'state.failureReason') return new Set(['none', 'durability', 'required-quality'])
  if (feature === 'state.comboFrom' || feature === 'memory.lastAction') {
    return new Set(['none', ...ACTION_IDS])
  }
  if (feature === 'objective.mode') {
    return new Set(['required-quality', 'maximize-quality-with-safe-completion'])
  }
  if (feature === 'memory.activeNodeId' || feature === 'memory.resumeNodeId') {
    return new Set(['none', ...nodeIds])
  }
  if (feature === 'memory.lastActionOutcome') return new Set(['none', 'success', 'failure'])
  return new Set()
}

function assertFlagMutation(value: unknown, path: string): void {
  const mutation = asRecord(value, path)
  assertExactKeys(mutation, ['flag', 'value'], path)
  assertIdentifier(mutation.flag, `${path}.flag`)
  if (typeof mutation.value !== 'boolean') throw new Error(`${path}.value must be boolean`)
}

function assertRouteEffect(
  value: Readonly<Record<string, unknown>>,
  path: string,
  nodeIds: ReadonlySet<string>,
): void {
  if (typeof value.goto !== 'string' || (value.goto !== '$resume' && !nodeIds.has(value.goto))) {
    throw new Error(`${path}.goto must name a program node or $resume`)
  }
  if (
    value.setResume !== undefined
    && value.setResume !== 'active-node'
    && value.setResume !== 'clear'
  ) throw new Error(`${path}.setResume is invalid`)
  if (value.goto === '$resume' && value.setResume === 'active-node') {
    throw new Error(`${path} cannot replace resume while returning to it`)
  }
  if (value.setFlag !== undefined) assertFlagMutation(value.setFlag, `${path}.setFlag`)
}

function validateProgramDefinition(value: unknown): asserts value is CraftAdaptivePolicyProgramDefinitionV1 {
  const program = asRecord(value, 'program')
  assertExactKeys(program, [
    'version',
    'programId',
    'scenarioId',
    'recipeProfileId',
    'scenarioModelIdentityVersion',
    'scenarioModelContentHash',
    'objectiveId',
    'objectiveMode',
    'qualityMaximum',
    'featureSchemaVersion',
    'safetyVersion',
    'entryNode',
    'limits',
    'nodes',
  ], 'program')
  if (program.version !== CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION) {
    throw new Error('program version mismatch')
  }
  assertIdentifier(program.programId, 'program.programId')
  assertIdentifier(program.scenarioId, 'program.scenarioId')
  assertIdentifier(program.recipeProfileId, 'program.recipeProfileId')
  if (program.scenarioModelIdentityVersion !== CRAFT_SCENARIO_MODEL_IDENTITY_VERSION) {
    throw new Error('program scenario model identity version mismatch')
  }
  if (typeof program.scenarioModelContentHash !== 'string' || !CONTENT_HASH.test(program.scenarioModelContentHash)) {
    throw new Error('program.scenarioModelContentHash must be a lowercase sha256 hash')
  }
  assertIdentifier(program.objectiveId, 'program.objectiveId')
  if (
    program.objectiveMode !== 'required-quality'
    && program.objectiveMode !== 'maximize-quality-with-safe-completion'
  ) throw new Error('program.objectiveMode is invalid')
  assertSafeIntegerInRange(program.qualityMaximum, 1, Number.MAX_SAFE_INTEGER, 'program.qualityMaximum')
  if (program.featureSchemaVersion !== CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION) {
    throw new Error('program feature schema version mismatch')
  }
  if (program.safetyVersion !== CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION) {
    throw new Error('program safety version mismatch')
  }
  assertIdentifier(program.entryNode, 'program.entryNode')

  const limits = asRecord(program.limits, 'program.limits')
  assertExactKeys(limits, ['maxActions', 'maxSettleHops'], 'program.limits')
  assertSafeIntegerInRange(limits.maxActions, 1, MAX_PROGRAM_ACTIONS, 'program.limits.maxActions')
  assertSafeIntegerInRange(limits.maxSettleHops, 1, MAX_SETTLE_HOPS, 'program.limits.maxSettleHops')

  if (!Array.isArray(program.nodes) || program.nodes.length < 1 || program.nodes.length > MAX_PROGRAM_NODES) {
    throw new Error(`program.nodes must contain from 1 through ${MAX_PROGRAM_NODES} nodes`)
  }
  const nodeIds = new Set<string>()
  program.nodes.forEach((value, index) => {
    const node = asRecord(value, `program.nodes[${index}]`)
    assertOptionalExactKeys(
      node,
      ['ordinal', 'id', 'actionBudget', 'transitions', 'decisions', 'onBudgetExhausted'],
      [],
      `program.nodes[${index}]`,
    )
    if (node.ordinal !== index) throw new Error(`program.nodes[${index}].ordinal must equal its ordered index`)
    assertIdentifier(node.id, `program.nodes[${index}].id`)
    if (nodeIds.has(node.id)) throw new Error(`duplicate program node: ${node.id}`)
    nodeIds.add(node.id)
  })
  if (!nodeIds.has(program.entryNode)) throw new Error('program.entryNode is not a program node')

  program.nodes.forEach((value, nodeIndex) => {
    const node = asRecord(value, `program.nodes[${nodeIndex}]`)
    assertSafeIntegerInRange(
      node.actionBudget,
      0,
      limits.maxActions as number,
      `program.nodes[${nodeIndex}].actionBudget`,
    )
    if (!Array.isArray(node.transitions) || node.transitions.length > MAX_NODE_TRANSITIONS) {
      throw new Error(`program.nodes[${nodeIndex}].transitions exceeds its limit`)
    }
    if (!Array.isArray(node.decisions) || node.decisions.length > MAX_NODE_DECISIONS) {
      throw new Error(`program.nodes[${nodeIndex}].decisions exceeds its limit`)
    }
    const localIds = new Set<string>()
    node.transitions.forEach((transitionValue, transitionIndex) => {
      const path = `program.nodes[${nodeIndex}].transitions[${transitionIndex}]`
      const transition = asRecord(transitionValue, path)
      assertOptionalExactKeys(transition, ['id', 'all', 'goto'], ['setResume', 'setFlag'], path)
      assertIdentifier(transition.id, `${path}.id`)
      if (localIds.has(transition.id)) throw new Error(`duplicate node member id: ${transition.id}`)
      localIds.add(transition.id)
      if (!Array.isArray(transition.all)) throw new Error(`${path}.all must be an array`)
      transition.all.forEach((guard, guardIndex) => assertGuard(guard, `${path}.all[${guardIndex}]`, nodeIds))
      assertRouteEffect(transition, path, nodeIds)
    })
    node.decisions.forEach((decisionValue, decisionIndex) => {
      const path = `program.nodes[${nodeIndex}].decisions[${decisionIndex}]`
      const decision = asRecord(decisionValue, path)
      assertOptionalExactKeys(decision, ['id', 'all', 'actions'], ['allowBelowObjectiveCompletion'], path)
      assertIdentifier(decision.id, `${path}.id`)
      if (localIds.has(decision.id)) throw new Error(`duplicate node member id: ${decision.id}`)
      localIds.add(decision.id)
      if (!Array.isArray(decision.all)) throw new Error(`${path}.all must be an array`)
      decision.all.forEach((guard, guardIndex) => assertGuard(guard, `${path}.all[${guardIndex}]`, nodeIds))
      if (!Array.isArray(decision.actions) || decision.actions.length < 1 || decision.actions.length > ACTION_IDS.length) {
        throw new Error(`${path}.actions must contain an ordered action list`)
      }
      const seenActions = new Set<string>()
      for (const action of decision.actions) {
        if (typeof action !== 'string' || !actionIds.has(action)) throw new Error(`${path}.actions contains an unknown action`)
        if (seenActions.has(action)) throw new Error(`${path}.actions contains duplicate action ${action}`)
        seenActions.add(action)
      }
      if (
        decision.allowBelowObjectiveCompletion !== undefined
        && typeof decision.allowBelowObjectiveCompletion !== 'boolean'
      ) throw new Error(`${path}.allowBelowObjectiveCompletion must be boolean when present`)
    })

    const budget = asRecord(node.onBudgetExhausted, `program.nodes[${nodeIndex}].onBudgetExhausted`)
    if (budget.kind === 'goto') {
      assertOptionalExactKeys(
        budget,
        ['kind', 'goto'],
        ['setResume', 'setFlag'],
        `program.nodes[${nodeIndex}].onBudgetExhausted`,
      )
      assertRouteEffect(budget, `program.nodes[${nodeIndex}].onBudgetExhausted`, nodeIds)
    } else if (budget.kind === 'terminate') {
      assertExactKeys(budget, ['kind', 'reason'], `program.nodes[${nodeIndex}].onBudgetExhausted`)
      assertIdentifier(budget.reason, `program.nodes[${nodeIndex}].onBudgetExhausted.reason`)
    } else {
      throw new Error(`program.nodes[${nodeIndex}].onBudgetExhausted.kind is invalid`)
    }
  })

  // Run the same canonical JSON boundary used by hashing. This rejects
  // callbacks, undefined values, cycles, symbols, and non-finite numbers.
  canonicalJson(program, 'program', new Set())
}

function programDefinitionFromArtifact(
  artifact: Readonly<CraftAdaptivePolicyProgramV1>,
): CraftAdaptivePolicyProgramDefinitionV1 {
  const { contentHash: _contentHash, ...definition } = artifact
  return definition
}

export function craftAdaptivePolicyProgramContentHashV1(
  definition: Readonly<CraftAdaptivePolicyProgramDefinitionV1>,
): CraftAdaptivePolicyProgramContentHash {
  validateProgramDefinition(definition)
  const canonical = canonicalJson({
    hashDomain: CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION,
    program: definition,
  }, 'adaptivePolicyProgram', new Set())
  return `sha256:${sha256Hex(canonical)}`
}

function runtimeContentHash(
  hashDomain: string,
  value: unknown,
): CraftAdaptivePolicyRuntimeContentHash {
  const canonical = canonicalJson({ hashDomain, value }, hashDomain, new Set())
  return `sha256:${sha256Hex(canonical)}`
}

/** Binds persisted policy memory to one exact recipe/objective/crafter context. */
export function craftAdaptivePolicyContextContentHashV1(
  context: Readonly<CraftAdaptivePolicyContextV1>,
): CraftAdaptivePolicyRuntimeContentHash {
  return runtimeContentHash('craft-adaptive-policy-context-v1', context)
}

/** Tracks the last state accepted by advance so stale sessions fail closed. */
export function craftAdaptivePolicyStateContentHashV1(
  state: Readonly<CraftState>,
): CraftAdaptivePolicyRuntimeContentHash {
  return runtimeContentHash('craft-adaptive-policy-state-v1', state)
}

function deepFreeze(value: unknown): void {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry)
    Object.freeze(value)
  }
}

/** Creates a canonical, immutable data-only artifact with a self-verifying hash. */
export function sealCraftAdaptivePolicyProgramV1(
  definition: Readonly<CraftAdaptivePolicyProgramDefinitionV1>,
): CraftAdaptivePolicyProgramV1 {
  const contentHash = craftAdaptivePolicyProgramContentHashV1(definition)
  const canonicalDefinition = JSON.parse(canonicalJson(definition, 'program', new Set())) as CraftAdaptivePolicyProgramDefinitionV1
  const artifact = { ...canonicalDefinition, contentHash } satisfies CraftAdaptivePolicyProgramV1
  deepFreeze(artifact)
  return artifact
}

export function assertCraftAdaptivePolicyProgramV1(
  value: unknown,
): asserts value is CraftAdaptivePolicyProgramV1 {
  const artifact = asRecord(value, 'programArtifact')
  assertExactKeys(artifact, [
    'version',
    'programId',
    'scenarioId',
    'recipeProfileId',
    'scenarioModelIdentityVersion',
    'scenarioModelContentHash',
    'objectiveId',
    'objectiveMode',
    'qualityMaximum',
    'featureSchemaVersion',
    'safetyVersion',
    'entryNode',
    'limits',
    'nodes',
    'contentHash',
  ], 'programArtifact')
  if (typeof artifact.contentHash !== 'string' || !CONTENT_HASH.test(artifact.contentHash)) {
    throw new Error('programArtifact.contentHash must be a lowercase sha256 hash')
  }
  const definition = programDefinitionFromArtifact(artifact as unknown as CraftAdaptivePolicyProgramV1)
  validateProgramDefinition(definition)
  const actual = craftAdaptivePolicyProgramContentHashV1(definition)
  if (artifact.contentHash !== actual) {
    throw new Error(`adaptive policy program content hash mismatch: expected ${artifact.contentHash}, received ${actual}`)
  }
}

function cloneMemory(
  memory: Readonly<SerializableCraftAdaptivePolicyMemoryV1>,
): SerializableCraftAdaptivePolicyMemoryV1 {
  return {
    ...memory,
    actionUses: { ...memory.actionUses },
    flags: { ...memory.flags },
  }
}

function referencedFlagIds(program: Readonly<CraftAdaptivePolicyProgramV1>): readonly string[] {
  const flags = new Set<string>()
  const inspectGuards = (guards: readonly CraftAdaptivePolicyGuardV1[]): void => {
    for (const guard of guards) {
      if (guard.kind !== 'boolean') continue
      const flag = flagIdFromFeature(guard.feature)
      if (flag !== null) flags.add(flag)
    }
  }
  for (const node of program.nodes) {
    for (const transition of node.transitions) {
      inspectGuards(transition.all)
      if (transition.setFlag !== undefined) flags.add(transition.setFlag.flag)
    }
    for (const decision of node.decisions) inspectGuards(decision.all)
    if (node.onBudgetExhausted.kind === 'goto' && node.onBudgetExhausted.setFlag !== undefined) {
      flags.add(node.onBudgetExhausted.setFlag.flag)
    }
  }
  return [...flags].sort()
}

function createInitialMemory(
  program: Readonly<CraftAdaptivePolicyProgramV1>,
  contextContentHash: CraftAdaptivePolicyRuntimeContentHash,
): SerializableCraftAdaptivePolicyMemoryV1 {
  return {
    version: CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION,
    programId: program.programId,
    programContentHash: program.contentHash,
    contextContentHash,
    lastObservedStateHash: null,
    activeNodeId: program.entryNode,
    resumeNodeId: null,
    totalActionUses: 0,
    totalNoStepUses: 0,
    nodeActionUses: 0,
    nodeNoStepUses: 0,
    totalObservedTransitions: 0,
    actionUses: Object.fromEntries(ACTION_IDS.map((action) => [action, 0])) as Record<CraftActionId, number>,
    flags: Object.fromEntries(referencedFlagIds(program).map((flag) => [flag, false])),
    lastAction: null,
    lastActionSuccess: null,
    terminated: false,
    terminationReason: null,
  }
}

function assertMemory(
  value: unknown,
  program: Readonly<CraftAdaptivePolicyProgramV1>,
  contextContentHash: CraftAdaptivePolicyRuntimeContentHash,
): asserts value is SerializableCraftAdaptivePolicyMemoryV1 {
  const memory = asRecord(value, 'adaptivePolicyMemory')
  assertExactKeys(memory, [
    'version',
    'programId',
    'programContentHash',
    'contextContentHash',
    'lastObservedStateHash',
    'activeNodeId',
    'resumeNodeId',
    'totalActionUses',
    'totalNoStepUses',
    'nodeActionUses',
    'nodeNoStepUses',
    'totalObservedTransitions',
    'actionUses',
    'flags',
    'lastAction',
    'lastActionSuccess',
    'terminated',
    'terminationReason',
  ], 'adaptivePolicyMemory')
  if (
    memory.version !== CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION
    || memory.programId !== program.programId
    || memory.programContentHash !== program.contentHash
  ) throw new Error('adaptive policy memory does not belong to this program artifact')
  if (typeof memory.contextContentHash !== 'string' || !CONTENT_HASH.test(memory.contextContentHash)) {
    throw new Error('adaptive policy memory contextContentHash is invalid')
  }
  if (memory.contextContentHash !== contextContentHash) {
    throw new Error('adaptive policy memory does not belong to this crafter context')
  }
  if (
    memory.lastObservedStateHash !== null
    && (typeof memory.lastObservedStateHash !== 'string' || !CONTENT_HASH.test(memory.lastObservedStateHash))
  ) throw new Error('adaptive policy memory lastObservedStateHash is invalid')
  const nodeIds = new Set(program.nodes.map((node) => node.id))
  if (typeof memory.activeNodeId !== 'string' || !nodeIds.has(memory.activeNodeId)) {
    throw new Error('adaptive policy memory activeNodeId is invalid')
  }
  if (memory.resumeNodeId !== null && (typeof memory.resumeNodeId !== 'string' || !nodeIds.has(memory.resumeNodeId))) {
    throw new Error('adaptive policy memory resumeNodeId is invalid')
  }
  for (const key of [
    'totalActionUses',
    'totalNoStepUses',
    'nodeActionUses',
    'nodeNoStepUses',
    'totalObservedTransitions',
  ] as const) assertSafeIntegerInRange(memory[key], 0, program.limits.maxActions, `adaptivePolicyMemory.${key}`)
  const totalActionUses = memory.totalActionUses as number
  const totalNoStepUses = memory.totalNoStepUses as number
  const nodeActionUses = memory.nodeActionUses as number
  const nodeNoStepUses = memory.nodeNoStepUses as number
  const totalObservedTransitions = memory.totalObservedTransitions as number
  if (totalNoStepUses > totalActionUses || nodeNoStepUses > nodeActionUses) {
    throw new Error('adaptive policy memory no-step counts exceed action counts')
  }
  if (nodeActionUses > totalActionUses || totalObservedTransitions !== totalActionUses) {
    throw new Error('adaptive policy memory action counts are inconsistent')
  }
  if ((totalObservedTransitions === 0) !== (memory.lastObservedStateHash === null)) {
    throw new Error('adaptive policy memory last observed state does not match its transition count')
  }

  const uses = asRecord(memory.actionUses, 'adaptivePolicyMemory.actionUses')
  assertExactKeys(uses, ACTION_IDS, 'adaptivePolicyMemory.actionUses')
  let sum = 0
  for (const action of ACTION_IDS) {
    assertSafeIntegerInRange(uses[action], 0, program.limits.maxActions, `adaptivePolicyMemory.actionUses.${action}`)
    sum += uses[action] as number
  }
  if (sum !== totalActionUses) throw new Error('adaptive policy memory per-action counts are inconsistent')

  const expectedFlags = referencedFlagIds(program)
  const flags = asRecord(memory.flags, 'adaptivePolicyMemory.flags')
  assertExactKeys(flags, expectedFlags, 'adaptivePolicyMemory.flags')
  for (const flag of expectedFlags) {
    if (typeof flags[flag] !== 'boolean') throw new Error(`adaptivePolicyMemory.flags.${flag} must be boolean`)
  }
  if (memory.lastAction !== null && (typeof memory.lastAction !== 'string' || !actionIds.has(memory.lastAction))) {
    throw new Error('adaptive policy memory lastAction is invalid')
  }
  if (memory.lastActionSuccess !== null && typeof memory.lastActionSuccess !== 'boolean') {
    throw new Error('adaptive policy memory lastActionSuccess is invalid')
  }
  if ((memory.lastAction === null) !== (memory.lastActionSuccess === null)) {
    throw new Error('adaptive policy memory last action and outcome must both be present or absent')
  }
  if ((totalActionUses === 0) !== (memory.lastAction === null)) {
    throw new Error('adaptive policy memory last action does not match its action count')
  }
  if (typeof memory.terminated !== 'boolean') throw new Error('adaptive policy memory terminated must be boolean')
  if (memory.terminationReason !== null && typeof memory.terminationReason !== 'string') {
    throw new Error('adaptive policy memory terminationReason must be a string or null')
  }
  if (memory.terminated !== (memory.terminationReason !== null)) {
    throw new Error('adaptive policy memory termination state is inconsistent')
  }
}

function assertContext(
  context: Readonly<CraftAdaptivePolicyContextV1>,
  program: Readonly<CraftAdaptivePolicyProgramV1>,
): void {
  assertCraftObjective(context.recipe, context.objective)
  if (context.scenarioId !== program.scenarioId) throw new Error('adaptive policy scenario binding mismatch')
  if (context.recipe.profileId !== program.recipeProfileId) throw new Error('adaptive policy recipe binding mismatch')
  if (context.objective.objectiveId !== program.objectiveId) throw new Error('adaptive policy objective binding mismatch')
  if (context.objective.mode !== program.objectiveMode) throw new Error('adaptive policy objective mode mismatch')
  if (context.recipe.qualityMax !== program.qualityMaximum) throw new Error('adaptive policy quality maximum mismatch')
  const scenarioHash = craftScenarioModelContentHash(context.recipe, context.objective)
  if (scenarioHash !== program.scenarioModelContentHash) {
    throw new Error('adaptive policy scenario model content hash mismatch')
  }
  for (const [key, value] of Object.entries({
    level: context.crafter.level,
    craftsmanship: context.crafter.craftsmanship,
    control: context.crafter.control,
    maxCp: context.crafter.maxCp,
  })) assertSafeIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER, `crafter.${key}`)
  if (typeof context.crafter.cosmicToolGoodBonus !== 'boolean') {
    throw new Error('crafter.cosmicToolGoodBonus must be boolean')
  }
  if (context.crafter.specialist !== undefined && typeof context.crafter.specialist !== 'boolean') {
    throw new Error('crafter.specialist must be boolean when present')
  }
}

function assertStateForProgram(
  context: Readonly<CraftAdaptivePolicyContextV1>,
  state: Readonly<CraftState>,
): void {
  assertCraftState(context.recipe, context.crafter, state)
  for (const [key, value] of Object.entries({
    step: state.step,
    progress: state.progress,
    quality: state.quality,
    durability: state.durability,
    cp: state.cp,
    innerQuiet: state.innerQuiet,
  })) {
    if (!Number.isSafeInteger(value)) throw new Error(`craft state ${key} must be a safe integer`)
  }
  if (!MATERIAL_CONDITIONS.includes(state.condition)) throw new Error('craft state condition is invalid')
  if (!['none', 'completed', 'failed'].includes(state.terminal)) throw new Error('craft state terminal is invalid')
  if (state.comboFrom !== null && !actionIds.has(state.comboFrom)) throw new Error('craft state comboFrom is invalid')
  for (const key of [
    'trainedPerfectionAvailable',
    'trainedPerfectionActive',
    'heartAndSoulAvailable',
    'heartAndSoulActive',
    'quickInnovationAvailable',
  ] as const) {
    if (typeof state[key] !== 'boolean') throw new Error(`craft state ${key} must be boolean`)
  }
}

function basisPoints(numerator: number, denominator: number): number {
  return Math.floor((numerator * 10_000) / denominator)
}

interface GuardEvaluationContext {
  context: Readonly<CraftAdaptivePolicyContextV1>
  state: Readonly<CraftState>
  memory: Readonly<SerializableCraftAdaptivePolicyMemoryV1>
  previews: Map<CraftActionId, ActionPreview>
  projectedStates: Map<CraftActionId, CraftState | null>
}

function cachedPreview(
  evaluation: Readonly<GuardEvaluationContext>,
  action: CraftActionId,
): ActionPreview {
  const existing = evaluation.previews.get(action)
  if (existing !== undefined) return existing
  const created = previewAction(
    evaluation.context.recipe,
    evaluation.context.crafter,
    evaluation.state,
    action,
  )
  evaluation.previews.set(action, created)
  return created
}

function cachedProjectedSuccessfulState(
  evaluation: Readonly<GuardEvaluationContext>,
  action: CraftActionId,
): CraftState | null {
  if (evaluation.projectedStates.has(action)) return evaluation.projectedStates.get(action) ?? null
  const preview = cachedPreview(evaluation, action)
  const projected = preview.legal
    ? applyObservedOutcome(
        evaluation.context.recipe,
        evaluation.context.crafter,
        evaluation.state,
        action,
        { success: true, nextCondition: evaluation.state.condition },
      ).nextState
    : null
  evaluation.projectedStates.set(action, projected)
  return projected
}

function integerFeatureValue(
  feature: CraftAdaptivePolicyIntegerFeature,
  evaluation: Readonly<GuardEvaluationContext>,
): number {
  const { context, state, memory } = evaluation
  const action = actionIdFromUseFeature(feature)
  if (action !== null) return memory.actionUses[action]
  const previewReference = previewIntegerFeatureReference(feature)
  if (previewReference !== null) {
    const preview = cachedPreview(evaluation, previewReference.action)
    const projected = cachedProjectedSuccessfulState(evaluation, previewReference.action)
    switch (previewReference.field) {
      case 'progressGain': return preview.progressGain
      case 'qualityGain': return preview.qualityGain
      case 'cpCost': return preview.cpCost
      case 'durabilityCost': return preview.durabilityCost
      case 'successRateBps': return Math.round(preview.successRate * 10_000)
      case 'progressAfter': return projected?.progress ?? state.progress
      case 'qualityAfter': return projected?.quality ?? state.quality
      case 'progressRemainingAfter': return context.recipe.progressRequired - (projected?.progress ?? state.progress)
      case 'qualityRemainingAfter': return context.recipe.qualityMax - (projected?.quality ?? state.quality)
    }
  }
  switch (feature) {
    case 'state.step': return state.step
    case 'state.progress': return state.progress
    case 'state.progressRemaining': return context.recipe.progressRequired - state.progress
    case 'state.progressBps': return basisPoints(state.progress, context.recipe.progressRequired)
    case 'state.quality': return state.quality
    case 'state.qualityRemaining': return context.recipe.qualityMax - state.quality
    case 'state.qualityBps': return basisPoints(state.quality, context.recipe.qualityMax)
    case 'state.durability': return state.durability
    case 'state.durabilityBps': return basisPoints(state.durability, context.recipe.durabilityMax)
    case 'state.cp': return state.cp
    case 'state.cpBps': return basisPoints(state.cp, context.crafter.maxCp)
    case 'state.innerQuiet': return state.innerQuiet
    case 'state.carefulObservationUsesLeft': return state.carefulObservationUsesLeft
    case 'state.buffs.wasteNot': return state.buffs.wasteNot
    case 'state.buffs.veneration': return state.buffs.veneration
    case 'state.buffs.greatStrides': return state.buffs.greatStrides
    case 'state.buffs.innovation': return state.buffs.innovation
    case 'state.buffs.finalAppraisal': return state.buffs.finalAppraisal
    case 'state.buffs.manipulation': return state.buffs.manipulation
    case 'state.buffs.muscleMemory': return state.buffs.muscleMemory
    case 'state.buffs.expedience': return state.buffs.expedience
    case 'recipe.progressRequired': return context.recipe.progressRequired
    case 'recipe.qualityMax': return context.recipe.qualityMax
    case 'recipe.requiredQuality': return context.recipe.requiredQuality
    case 'recipe.durabilityMax': return context.recipe.durabilityMax
    case 'objective.qualityMaximum': return context.recipe.qualityMax
    case 'crafter.level': return context.crafter.level
    case 'crafter.craftsmanship': return context.crafter.craftsmanship
    case 'crafter.control': return context.crafter.control
    case 'crafter.maxCp': return context.crafter.maxCp
    case 'memory.totalActionUses': return memory.totalActionUses
    case 'memory.totalNoStepUses': return memory.totalNoStepUses
    case 'memory.nodeActionUses': return memory.nodeActionUses
    case 'memory.nodeNoStepUses': return memory.nodeNoStepUses
    case 'memory.totalObservedTransitions': return memory.totalObservedTransitions
  }
  throw new Error(`unsupported integer feature at runtime: ${feature}`)
}

function booleanFeatureValue(
  feature: CraftAdaptivePolicyBooleanFeature,
  evaluation: Readonly<GuardEvaluationContext>,
): boolean {
  const { context, state, memory } = evaluation
  const flag = flagIdFromFeature(feature)
  if (flag !== null) return memory.flags[flag] ?? false
  const previewReference = previewBooleanFeatureReference(feature)
  if (previewReference !== null) {
    const preview = cachedPreview(evaluation, previewReference.action)
    const projected = cachedProjectedSuccessfulState(evaluation, previewReference.action)
    const completesProgress = projected?.progress === context.recipe.progressRequired
      && projected.terminal === 'completed'
    const reachesRequiredQuality = (projected?.quality ?? state.quality) >= context.recipe.requiredQuality
    const reachesQualityMaximum = (projected?.quality ?? state.quality) >= context.recipe.qualityMax
    switch (previewReference.field) {
      case 'legal': return preview.legal
      case 'policySafe': return isPolicyActionSafe(
        context.recipe,
        context.crafter,
        state,
        previewReference.action,
        preview,
      )
      case 'wouldCompleteProgress': return completesProgress
      case 'wouldReachRequiredQuality': return reachesRequiredQuality
      case 'wouldReachQualityMaximum': return reachesQualityMaximum
      case 'wouldCompleteBelowQualityMaximum': return completesProgress && !reachesQualityMaximum
    }
  }
  switch (feature) {
    case 'state.trainedPerfectionAvailable': return state.trainedPerfectionAvailable
    case 'state.trainedPerfectionActive': return state.trainedPerfectionActive
    case 'state.heartAndSoulAvailable': return state.heartAndSoulAvailable
    case 'state.heartAndSoulActive': return state.heartAndSoulActive
    case 'state.quickInnovationAvailable': return state.quickInnovationAvailable
    case 'crafter.cosmicToolGoodBonus': return context.crafter.cosmicToolGoodBonus
    case 'crafter.specialist': return context.crafter.specialist === true
    case 'memory.terminated': return memory.terminated
  }
  throw new Error(`unsupported boolean feature at runtime: ${feature}`)
}

function enumFeatureValue(
  feature: CraftAdaptivePolicyEnumFeature,
  evaluation: Readonly<GuardEvaluationContext>,
): string {
  const { context, state, memory } = evaluation
  switch (feature) {
    case 'state.condition': return state.condition
    case 'state.terminal': return state.terminal
    case 'state.failureReason': return state.failureReason ?? 'none'
    case 'state.comboFrom': return state.comboFrom ?? 'none'
    case 'objective.mode': return context.objective.mode
    case 'memory.activeNodeId': return memory.activeNodeId
    case 'memory.resumeNodeId': return memory.resumeNodeId ?? 'none'
    case 'memory.lastAction': return memory.lastAction ?? 'none'
    case 'memory.lastActionOutcome': return memory.lastActionSuccess === null
      ? 'none'
      : memory.lastActionSuccess ? 'success' : 'failure'
  }
}

function guardMatches(
  guard: Readonly<CraftAdaptivePolicyGuardV1>,
  evaluation: Readonly<GuardEvaluationContext>,
): boolean {
  if (guard.kind === 'boolean') return booleanFeatureValue(guard.feature, evaluation) === guard.value
  if (guard.kind === 'enum') return enumFeatureValue(guard.feature, evaluation) === guard.value
  const actual = integerFeatureValue(guard.feature, evaluation)
  switch (guard.op) {
    case 'eq': return actual === guard.value
    case 'lt': return actual < guard.value
    case 'lte': return actual <= guard.value
    case 'gte': return actual >= guard.value
    case 'gt': return actual > guard.value
  }
}

function allGuardsMatch(
  guards: readonly CraftAdaptivePolicyGuardV1[],
  evaluation: Readonly<GuardEvaluationContext>,
): boolean {
  return guards.every((guard) => guardMatches(guard, evaluation))
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left, 'left', new Set()) === canonicalJson(right, 'right', new Set())
}

export interface CreateCraftAdaptivePolicyControllerOptionsV1 {
  initialMemory?: Readonly<SerializableCraftAdaptivePolicyMemoryV1>
}

export function createCraftAdaptivePolicyControllerV1(
  context: Readonly<CraftAdaptivePolicyContextV1>,
  artifact: Readonly<CraftAdaptivePolicyProgramV1>,
  options: Readonly<CreateCraftAdaptivePolicyControllerOptionsV1> = {},
): CraftAdaptivePolicyControllerV1 {
  assertCraftAdaptivePolicyProgramV1(artifact)
  assertContext(context, artifact)
  const program = sealCraftAdaptivePolicyProgramV1(programDefinitionFromArtifact(artifact))
  const boundContext = JSON.parse(canonicalJson({
    scenarioId: context.scenarioId,
    recipe: context.recipe,
    objective: context.objective,
    crafter: {
      level: context.crafter.level,
      craftsmanship: context.crafter.craftsmanship,
      control: context.crafter.control,
      maxCp: context.crafter.maxCp,
      cosmicToolGoodBonus: context.crafter.cosmicToolGoodBonus,
      specialist: context.crafter.specialist === true,
    },
  }, 'adaptivePolicyContext', new Set())) as CraftAdaptivePolicyContextV1
  deepFreeze(boundContext)
  const nodes = new Map(program.nodes.map((node) => [node.id, node]))
  const contextContentHash = craftAdaptivePolicyContextContentHashV1(boundContext)
  let memory = options.initialMemory === undefined
    ? createInitialMemory(program, contextContentHash)
    : cloneMemory(options.initialMemory)
  assertMemory(memory, program, contextContentHash)

  const terminateMemory = (
    current: Readonly<SerializableCraftAdaptivePolicyMemoryV1>,
    reason: CraftAdaptivePolicyTerminationReason,
  ): SerializableCraftAdaptivePolicyMemoryV1 => ({
    ...current,
    terminated: true,
    terminationReason: reason,
  })

  const applyRouteEffect = (effect: {
    goto: CraftAdaptivePolicyGotoV1
    setResume?: CraftAdaptivePolicyResumeMutationV1
    setFlag?: Readonly<CraftAdaptivePolicyFlagMutationV1>
  }, current: Readonly<SerializableCraftAdaptivePolicyMemoryV1>): SerializableCraftAdaptivePolicyMemoryV1 => {
    const previousActive = current.activeNodeId
    const target = effect.goto === '$resume' ? current.resumeNodeId : effect.goto
    if (target === null || !nodes.has(target)) {
      return terminateMemory(current, 'missing-resume-node')
    }
    const resumeNodeId = effect.setResume === 'active-node'
      ? previousActive
      : effect.setResume === 'clear'
        ? null
        : current.resumeNodeId
    const flags = effect.setFlag === undefined
      ? current.flags
      : { ...current.flags, [effect.setFlag.flag]: effect.setFlag.value }
    return {
      ...current,
      activeNodeId: target,
      resumeNodeId,
      nodeActionUses: 0,
      nodeNoStepUses: 0,
      flags,
    }
  }

  const settleMemory = (
    current: Readonly<SerializableCraftAdaptivePolicyMemoryV1>,
    state: Readonly<CraftState>,
  ): SerializableCraftAdaptivePolicyMemoryV1 => {
    let settled = cloneMemory(current)
    if (settled.terminated) return settled
    if (state.terminal === 'completed') {
      return terminateMemory(settled, 'craft-completed')
    }
    if (state.terminal === 'failed') {
      return terminateMemory(settled, 'craft-failed')
    }
    if (settled.totalActionUses >= program.limits.maxActions) {
      return terminateMemory(settled, 'max-actions-exhausted')
    }

    let hops = 0
    while (!settled.terminated) {
      const node = nodes.get(settled.activeNodeId)!
      const evaluation: GuardEvaluationContext = {
        context: boundContext,
        state,
        memory: settled,
        previews: new Map(),
        projectedStates: new Map(),
      }
      const transition = node.transitions.find((candidate) => allGuardsMatch(candidate.all, evaluation))
      if (transition !== undefined) {
        if (hops >= program.limits.maxSettleHops) {
          return terminateMemory(settled, 'settle-hop-limit')
        }
        hops += 1
        settled = applyRouteEffect(transition, settled)
        continue
      }
      if (settled.nodeActionUses < node.actionBudget) return settled
      if (node.onBudgetExhausted.kind === 'terminate') {
        return terminateMemory(settled, `program:${node.onBudgetExhausted.reason}`)
      }
      if (hops >= program.limits.maxSettleHops) {
        return terminateMemory(settled, 'settle-hop-limit')
      }
      hops += 1
      settled = applyRouteEffect(node.onBudgetExhausted, settled)
    }
    return settled
  }

  const snapshot = (): SerializableCraftAdaptivePolicyMemoryV1 => cloneMemory(memory)

  const assertStateContinuity = (state: Readonly<CraftState>): void => {
    if (
      memory.lastObservedStateHash !== null
      && craftAdaptivePolicyStateContentHashV1(state) !== memory.lastObservedStateHash
    ) throw new Error('adaptive policy state is not continuous with the last observed transition')
  }

  return {
    context: boundContext,
    program,
    snapshot,
    decide: (state) => {
      assertStateForProgram(boundContext, state)
      assertStateContinuity(state)
      const settled = settleMemory(memory, state)
      if (settled.terminated) {
        return {
          action: null,
          nodeId: settled.activeNodeId,
          decisionId: null,
          status: 'terminated',
          terminationReason: settled.terminationReason,
          memory: cloneMemory(settled),
        }
      }
      const node = nodes.get(settled.activeNodeId)!
      const evaluation: GuardEvaluationContext = {
        context: boundContext,
        state,
        memory: settled,
        previews: new Map(),
        projectedStates: new Map(),
      }
      for (const decision of node.decisions) {
        if (!allGuardsMatch(decision.all, evaluation)) continue
        for (const action of decision.actions) {
          const preview = cachedPreview(evaluation, action)
          const projected = cachedProjectedSuccessfulState(evaluation, action)
          const wouldCompleteBelowObjective = projected?.terminal === 'completed'
            && projected.quality < boundContext.recipe.qualityMax
          if (
            preview.legal
            && isPolicyActionSafe(boundContext.recipe, boundContext.crafter, state, action, preview)
            && (!wouldCompleteBelowObjective || decision.allowBelowObjectiveCompletion === true)
          ) {
            return {
              action,
              nodeId: node.id,
              decisionId: decision.id,
              status: 'active',
              terminationReason: null,
              memory: cloneMemory(settled),
            }
          }
        }
      }
      const terminated = terminateMemory(settled, 'no-safe-action')
      return {
        action: null,
        nodeId: node.id,
        decisionId: null,
        status: 'terminated',
        terminationReason: terminated.terminationReason,
        memory: cloneMemory(terminated),
      }
    },
    advance: (observed) => {
      if (memory.terminated) throw new Error('cannot advance a terminated adaptive policy controller')
      assertStateForProgram(boundContext, observed.before)
      assertStateForProgram(boundContext, observed.after)
      if (typeof observed.success !== 'boolean' || !actionIds.has(observed.action)) {
        throw new Error('observed adaptive policy transition is invalid')
      }
      assertStateContinuity(observed.before)
      const expectedAfter = applyObservedOutcome(
        boundContext.recipe,
        boundContext.crafter,
        observed.before,
        observed.action,
        { success: observed.success, nextCondition: observed.after.condition },
      ).nextState
      if (!structurallyEqual(expectedAfter, observed.after)) {
        throw new Error('observed adaptive policy transition does not match the mechanics result')
      }

      const settledBefore = settleMemory(memory, observed.before)
      if (settledBefore.terminated) {
        throw new Error('cannot advance after adaptive policy settled as terminated')
      }
      const noStep = ACTIONS[observed.action].noStep === true
      const advanced: SerializableCraftAdaptivePolicyMemoryV1 = {
        ...settledBefore,
        totalActionUses: settledBefore.totalActionUses + 1,
        totalNoStepUses: settledBefore.totalNoStepUses + (noStep ? 1 : 0),
        nodeActionUses: settledBefore.nodeActionUses + 1,
        nodeNoStepUses: settledBefore.nodeNoStepUses + (noStep ? 1 : 0),
        totalObservedTransitions: settledBefore.totalObservedTransitions + 1,
        actionUses: {
          ...settledBefore.actionUses,
          [observed.action]: settledBefore.actionUses[observed.action] + 1,
        },
        lastAction: observed.action,
        lastActionSuccess: observed.success,
        lastObservedStateHash: craftAdaptivePolicyStateContentHashV1(observed.after),
      }
      const committed = settleMemory(advanced, observed.after)
      assertMemory(committed, program, contextContentHash)
      memory = committed
      return snapshot()
    },
  }
}
