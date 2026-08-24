import { createHash } from 'node:crypto'
import {
  CRAFT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
  type CraftScenarioDataId,
  type PlayerEquipmentProfileId,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  MATERIAL_CONDITIONS,
  craftScenarioModelContentHash,
  createInitialCraftState,
  type CraftActionId,
  type CraftObjective,
  type CraftState,
  type MaterialCondition,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  ELEVATING_PLATFORMS_SENSITIVITY_PROFILES,
  POC_SENSITIVITY_PROFILES,
  assertConditionProfileCompatible,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  executePreparedNativeRolloutCase,
  nativeRolloutComparableResult,
  type NativeConditionTransitionWeights,
  type NativeRolloutComparableResult,
  type NativeRolloutFixtureCase,
  type NativeRolloutOracleResult,
} from './rolloutBatch'

export const NATIVE_ROOT_PLAN_MATRIX_VERSION = 'native-root-plan-matrix-v2' as const
export const NATIVE_FIXED_CONTINUATION_PLAN_VERSION = 'native-fixed-continuation-plan-v1' as const
export const NATIVE_ROOT_PLAN_MATRIX_MAX_CANDIDATES = 35
export const NATIVE_ROOT_PLAN_MATRIX_MAX_SAMPLES = 65_536
export const NATIVE_ROOT_PLAN_MATRIX_MAX_OPERATIONS = 1_000_000
export const NATIVE_ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS = 100_000_000

export interface NativeRootPlanSample {
  sampleIndex: number
  pairedSeed: number
}

export interface NativeRootPlanCandidate {
  ordinal: number
  candidateId: string
  rootAction: CraftActionId
}

export interface NativeFixedContinuationPlan {
  version: typeof NATIVE_FIXED_CONTINUATION_PLAN_VERSION
  planId: string
  contentFnv1a32: string
  actions: readonly CraftActionId[]
}

export interface NativeRootPlanMatrixFixture {
  caseId: string
  scenarioId: CraftScenarioDataId
  equipmentProfileId: PlayerEquipmentProfileId
  conditionProfileId: string
  maxSteps: number
  conditionDrawOffset?: number
  successDrawOffset?: number
  candidates: readonly NativeRootPlanCandidate[]
  samples: readonly NativeRootPlanSample[]
  continuationActions: readonly CraftActionId[]
}

export interface PreparedNativeRootPlanMatrix {
  spec: Readonly<NativeRootPlanMatrixFixture>
  scenarioModelIdentityVersion: typeof CRAFT_SCENARIO_MODEL_IDENTITY_VERSION
  scenarioModelContentHash: string
  recipe: Readonly<RecipeProfile>
  objective: Readonly<CraftObjective>
  crafter: Readonly<(typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter']>
  state: Readonly<CraftState>
  conditionProfile: Readonly<WeightedConditionProfile>
  conditionTransitionWeights: NativeConditionTransitionWeights
  continuationPlan: Readonly<NativeFixedContinuationPlan>
}

export interface NativeRootPlanMatrixOutcome {
  caseId: string
  scenarioId: CraftScenarioDataId
  scenarioModelIdentityVersion: typeof CRAFT_SCENARIO_MODEL_IDENTITY_VERSION
  scenarioModelContentHash: string
  conditionProfileId: string
  continuationPlanId: string
  candidateOrdinal: number
  candidateId: string
  rootAction: CraftActionId
  sampleIndex: number
  pairedSeed: number
  rollout: NativeRolloutComparableResult
}

export interface NativeRootPlanMatrixOracleOutcome
  extends Omit<NativeRootPlanMatrixOutcome, 'rollout'> {
  rollout: NativeRolloutOracleResult
}

const ROOT_ACTIONS = [
  { ordinal: 0, candidateId: 'reflect-root', rootAction: 'reflect' },
  { ordinal: 1, candidateId: 'muscle-memory-root', rootAction: 'muscleMemory' },
  { ordinal: 2, candidateId: 'basic-synthesis-root', rootAction: 'basicSynthesis' },
] as const satisfies readonly NativeRootPlanCandidate[]

const CONTINUATIONS: Readonly<Record<CraftScenarioDataId, readonly CraftActionId[]>> = {
  'cosmotized-ilmenite-ingot': [
    'manipulation', 'wasteNot2', 'groundwork', 'innovation', 'basicTouch', 'basicTouch',
  ],
  'cosmotized-ilmenite-nails': [
    'manipulation', 'veneration', 'groundwork', 'wasteNot2', 'basicTouch', 'basicTouch',
  ],
  'hardened-survey-plank': [
    'mastersMend', 'wasteNot', 'prudentTouch', 'basicSynthesis', 'basicSynthesis',
  ],
  'mobile-work-stairs': [
    'manipulation', 'wasteNot2', 'groundwork', 'innovation', 'basicTouch', 'carefulSynthesis',
  ],
  'survey-craftsmans-command-brew': [
    'manipulation', 'wasteNot2', 'preparatoryTouch', 'innovation', 'prudentTouch', 'groundwork',
  ],
}

const EQUIPMENT_BY_SCENARIO: Readonly<Record<CraftScenarioDataId, PlayerEquipmentProfileId>> = {
  'cosmotized-ilmenite-ingot': 'player-unbuffed-cosmic-tool-v1',
  'cosmotized-ilmenite-nails': 'player-food-medicine-cosmic-tool-v1',
  'hardened-survey-plank': 'player-food-medicine-specialist-cosmic-tool-v1',
  'mobile-work-stairs': 'player-unbuffed-cosmic-tool-v1',
  'survey-craftsmans-command-brew': 'player-food-medicine-cosmic-tool-v1',
}

function profilesForRecipe(recipe: Readonly<RecipeProfile>): readonly Readonly<WeightedConditionProfile>[] {
  switch (recipe.missionFamily) {
    case 'sinus-ardorum-explus-equipment-materials-i':
      return POC_SENSITIVITY_PROFILES.slice(0, 2)
    case 'sinus-ardorum-explus-elevating-platforms':
      return ELEVATING_PLATFORMS_SENSITIVITY_PROFILES.slice(0, 2)
    case 'sinus-ardorum-ex-artisans-mixtures':
      return COMMAND_BREW_SENSITIVITY_PROFILES.slice(0, 2)
    default:
      throw new Error(`no native root-plan profiles for ${recipe.profileId}`)
  }
}

function resolvedConditionTransitionWeights(
  profile: Readonly<WeightedConditionProfile>,
): NativeConditionTransitionWeights {
  return Object.fromEntries(MATERIAL_CONDITIONS.map((previous) => {
    const weights = profile.transitionWeights?.[previous] ?? profile.weights
    return [previous, Object.fromEntries(MATERIAL_CONDITIONS.map((next) => [
      next,
      Math.max(0, weights[next] ?? 0),
    ]))]
  })) as NativeConditionTransitionWeights
}

function assertSafeToken(value: string, label: string): void {
  if (value.length === 0 || /[\t\r\n,:;|]/u.test(value)) {
    throw new Error(`${label} is not a safe root-plan token: ${JSON.stringify(value)}`)
  }
}

function assertUint32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be a uint32 integer`)
  }
}

function fnv1a32Bytes(bytes: Uint8Array): string {
  let hash = 0x811c_9dc5
  for (const byte of bytes) hash = Math.imul((hash ^ byte) >>> 0, 0x0100_0193) >>> 0
  return hash.toString(16).padStart(8, '0')
}

export function nativeFixedContinuationPlanContent(
  planId: string,
  actions: readonly CraftActionId[],
): string {
  assertSafeToken(planId, 'planId')
  return [NATIVE_FIXED_CONTINUATION_PLAN_VERSION, planId, ...actions].join('\0')
}

export function nativeFixedContinuationPlanHash(
  planId: string,
  actions: readonly CraftActionId[],
): string {
  return fnv1a32Bytes(new TextEncoder().encode(nativeFixedContinuationPlanContent(planId, actions)))
}

export function assertPreparedNativeRootPlanMatrix(
  prepared: Readonly<PreparedNativeRootPlanMatrix>,
): void {
  const { spec, continuationPlan } = prepared
  assertSafeToken(spec.caseId, `${spec.caseId}.caseId`)
  assertSafeToken(spec.scenarioId, `${spec.caseId}.scenarioId`)
  assertSafeToken(spec.conditionProfileId, `${spec.caseId}.conditionProfileId`)
  if (!Number.isSafeInteger(spec.maxSteps) || spec.maxSteps < 1 || spec.maxSteps > 1_000) {
    throw new RangeError(`${spec.caseId}.maxSteps must be an integer in [1, 1000]`)
  }
  if (spec.candidates.length < 1 || spec.candidates.length > NATIVE_ROOT_PLAN_MATRIX_MAX_CANDIDATES) {
    throw new RangeError(`${spec.caseId}.candidates must contain 1..${NATIVE_ROOT_PLAN_MATRIX_MAX_CANDIDATES} entries`)
  }
  if (spec.samples.length < 1 || spec.samples.length > NATIVE_ROOT_PLAN_MATRIX_MAX_SAMPLES) {
    throw new RangeError(`${spec.caseId}.samples must contain 1..${NATIVE_ROOT_PLAN_MATRIX_MAX_SAMPLES} entries`)
  }
  const candidateIds = new Set<string>()
  const candidateOrdinals = new Set<number>()
  const rootActions = new Set<CraftActionId>()
  for (const candidate of spec.candidates) {
    assertSafeToken(candidate.candidateId, `${spec.caseId}.candidateId`)
    if (!Number.isSafeInteger(candidate.ordinal) || candidate.ordinal < 0) {
      throw new RangeError(`${spec.caseId}.candidate ordinal must be a non-negative safe integer`)
    }
    if (candidateIds.has(candidate.candidateId)) throw new Error(`${spec.caseId} has duplicate candidateId`)
    if (candidateOrdinals.has(candidate.ordinal)) throw new Error(`${spec.caseId} has duplicate candidate ordinal`)
    if (rootActions.has(candidate.rootAction)) throw new Error(`${spec.caseId} has duplicate root action`)
    candidateIds.add(candidate.candidateId)
    candidateOrdinals.add(candidate.ordinal)
    rootActions.add(candidate.rootAction)
  }
  const sampleIndexes = new Set<number>()
  for (const sample of spec.samples) {
    assertUint32(sample.sampleIndex, `${spec.caseId}.sampleIndex`)
    assertUint32(sample.pairedSeed, `${spec.caseId}.pairedSeed`)
    if (sampleIndexes.has(sample.sampleIndex)) throw new Error(`${spec.caseId} has duplicate sampleIndex`)
    sampleIndexes.add(sample.sampleIndex)
  }
  const operations = spec.candidates.length * spec.samples.length
  if (operations > NATIVE_ROOT_PLAN_MATRIX_MAX_OPERATIONS) {
    throw new RangeError(`${spec.caseId} projects ${operations} operations`)
  }
  const actionBound = Math.min(spec.maxSteps, 1 + continuationPlan.actions.length)
  if (operations * actionBound > NATIVE_ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS) {
    throw new RangeError(`${spec.caseId} exceeds the projected transition bound`)
  }
  const expectedPlanHash = nativeFixedContinuationPlanHash(
    continuationPlan.planId,
    continuationPlan.actions,
  )
  if (continuationPlan.contentFnv1a32 !== expectedPlanHash) {
    throw new Error(`${spec.caseId} continuation plan content hash mismatch`)
  }
  if (prepared.scenarioModelIdentityVersion !== CRAFT_SCENARIO_MODEL_IDENTITY_VERSION) {
    throw new Error(`${spec.caseId} scenario model identity version mismatch`)
  }
  const expectedScenarioModelContentHash = craftScenarioModelContentHash(
    prepared.recipe,
    prepared.objective,
  )
  if (prepared.scenarioModelContentHash !== expectedScenarioModelContentHash) {
    throw new Error(`${spec.caseId} scenario model content hash mismatch`)
  }
}

export function prepareNativeRootPlanMatrix(): readonly PreparedNativeRootPlanMatrix[] {
  const samples = Array.from({ length: 4 }, (_, sampleIndex) => ({
    sampleIndex,
    pairedSeed: (0x7200_0000 + Math.imul(sampleIndex + 1, 0x9e37)) >>> 0,
  }))
  const prepared = CRAFT_SCENARIO_DATA.flatMap((scenario) => {
    const equipmentProfileId = EQUIPMENT_BY_SCENARIO[scenario.scenarioId]
    const equipment = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === equipmentProfileId)
    if (equipment === undefined) throw new Error(`unknown equipment ${equipmentProfileId}`)
    const profiles = profilesForRecipe(scenario.recipe)
    return profiles.map((conditionProfile, profileIndex) => {
      assertConditionProfileCompatible(scenario.recipe, conditionProfile)
      const planId = `${scenario.scenarioId}-fixed-continuation-v1`
      const continuationActions = CONTINUATIONS[scenario.scenarioId]
      const spec: NativeRootPlanMatrixFixture = {
        caseId: `${scenario.scenarioId}-matrix-${profileIndex}`,
        scenarioId: scenario.scenarioId,
        equipmentProfileId,
        conditionProfileId: conditionProfile.id,
        maxSteps: 1 + continuationActions.length,
        candidates: ROOT_ACTIONS,
        samples,
        continuationActions,
      }
      const continuationPlan: NativeFixedContinuationPlan = {
        version: NATIVE_FIXED_CONTINUATION_PLAN_VERSION,
        planId,
        contentFnv1a32: nativeFixedContinuationPlanHash(planId, continuationActions),
        actions: continuationActions,
      }
      const entry: PreparedNativeRootPlanMatrix = {
        spec,
        scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
        scenarioModelContentHash: craftScenarioModelContentHash(scenario.recipe, scenario.objective),
        recipe: scenario.recipe,
        objective: scenario.objective,
        crafter: equipment.crafter,
        state: createInitialCraftState(scenario.recipe, equipment.crafter),
        conditionProfile,
        conditionTransitionWeights: resolvedConditionTransitionWeights(conditionProfile),
        continuationPlan,
      }
      assertPreparedNativeRootPlanMatrix(entry)
      return entry
    })
  })
  const caseIds = new Set<string>()
  for (const entry of prepared) {
    if (caseIds.has(entry.spec.caseId)) throw new Error(`duplicate root-plan caseId ${entry.spec.caseId}`)
    caseIds.add(entry.spec.caseId)
  }
  return prepared
}

export function executePreparedNativeRootPlanMatrixOracle(
  prepared: Readonly<PreparedNativeRootPlanMatrix>,
): readonly NativeRootPlanMatrixOracleOutcome[] {
  assertPreparedNativeRootPlanMatrix(prepared)
  const candidates = [...prepared.spec.candidates].sort((left, right) => left.ordinal - right.ordinal)
  const samples = [...prepared.spec.samples].sort((left, right) => left.sampleIndex - right.sampleIndex)
  return candidates.flatMap((candidate) => samples.map((sample) => {
    const pairCaseId = `${prepared.spec.caseId}.${candidate.candidateId}.${sample.sampleIndex}`
    const actions = [candidate.rootAction, ...prepared.continuationPlan.actions]
    const spec: NativeRolloutFixtureCase = {
      caseId: pairCaseId,
      scenarioId: prepared.spec.scenarioId,
      equipmentProfileId: prepared.spec.equipmentProfileId,
      seed: sample.pairedSeed,
      ...(prepared.spec.conditionDrawOffset === undefined
        ? {}
        : { conditionDrawOffset: prepared.spec.conditionDrawOffset }),
      ...(prepared.spec.successDrawOffset === undefined
        ? {}
        : { successDrawOffset: prepared.spec.successDrawOffset }),
      maxSteps: prepared.spec.maxSteps,
      actions,
      tags: ['root-plan-matrix', 'fixed-continuation-only'],
    }
    const oracle = executePreparedNativeRolloutCase({
      spec,
      recipe: prepared.recipe,
      crafter: prepared.crafter,
      state: prepared.state,
      conditionProfile: prepared.conditionProfile,
      conditionTransitionWeights: prepared.conditionTransitionWeights,
    })
    return {
      caseId: prepared.spec.caseId,
      scenarioId: prepared.spec.scenarioId,
      scenarioModelIdentityVersion: prepared.scenarioModelIdentityVersion,
      scenarioModelContentHash: prepared.scenarioModelContentHash,
      conditionProfileId: prepared.spec.conditionProfileId,
      continuationPlanId: prepared.continuationPlan.planId,
      candidateOrdinal: candidate.ordinal,
      candidateId: candidate.candidateId,
      rootAction: candidate.rootAction,
      sampleIndex: sample.sampleIndex,
      pairedSeed: sample.pairedSeed,
      rollout: oracle,
    }
  }))
}

export function executePreparedNativeRootPlanMatrix(
  prepared: Readonly<PreparedNativeRootPlanMatrix>,
): readonly NativeRootPlanMatrixOutcome[] {
  return executePreparedNativeRootPlanMatrixOracle(prepared).map((outcome) => ({
    ...outcome,
    rollout: nativeRolloutComparableResult(outcome.rollout),
  }))
}

export function nativeRootPlanMatrixOracleSha256(
  prepared: readonly PreparedNativeRootPlanMatrix[],
): string {
  const outcomes = prepared.flatMap(executePreparedNativeRootPlanMatrix)
  return nativeRootPlanMatrixOutcomeSha256(outcomes)
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalJsonValue(entry)]))
  }
  return value
}

export function nativeRootPlanMatrixOutcomeSha256(
  outcomes: readonly NativeRootPlanMatrixOutcome[],
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJsonValue(outcomes)))
    .digest('hex')
}

export function materialConditionIndex(condition: MaterialCondition): number {
  return MATERIAL_CONDITIONS.indexOf(condition)
}
