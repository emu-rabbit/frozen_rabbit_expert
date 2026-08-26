import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  COSMIC_EXPERT_CATALOG_VERSION,
  COSMIC_EXPERT_MECHANICS_FAMILIES,
  COSMIC_EXPERT_SCENARIO_DATA,
  GENERIC_EVALUATION_EQUIPMENT_PROFILES,
  PLAYER_EQUIPMENT_PROFILES,
  cosmicMissionRank,
  cosmicExpertScenarioDataByRecipeId,
  type CosmicExpertMechanicsFamily,
  type CosmicMissionRank,
  type EvaluationEquipmentProfile,
} from '@frozen-rabbit-expert/data'
import {
  ACTIONS,
  CRAFT_MECHANICS_VERSION,
  MATERIAL_CONDITIONS,
  applyObservedOutcome,
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  createEpisodeRandomStream,
  drawSimulatedActionOutcome,
  runEpisodeTrace,
  type EpisodeStopReason,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  recommendAction,
  rebuildGuideIntegratedDecisionMemory,
  objectiveOutcomeUtility,
  resolveObjectivePolicy,
  resolveRiskPreferencePreset,
  SOLVER_POLICY_VERSION,
  type QualityUtilityKind,
  type RiskPreference,
} from '@frozen-rabbit-expert/solver'

export const GENERIC_FAMILY_MATRIX_SCHEMA_VERSION = 'generic-cosmic-family-development-matrix-v4'
export const GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION
  = 'generic-cosmic-family-paired-comparison-v3'
export const MAX_MATRIX_EPISODES = 10_000
export const MAX_MATRIX_STEPS = 100
export const MAX_MATRIX_SEEDS_PER_CELL = 512

export type MatrixPreset = 'small' | 'full'
export type ConditionWorldId =
  | 'balanced-iid'
  | 'normal-heavy-iid'
  | 'opportunity-scarce-iid'
  | 'all-normal'
export type ConditionWorldRole = 'plausible' | 'plausible-stress' | 'adversarial'
export type MatrixArmId = 'baseline' | 'candidate'
export type CompletionContract = 'progress-only' | 'progress-and-required-quality'

export interface ConditionWorldDefinition {
  id: ConditionWorldId
  role: ConditionWorldRole
  evidence: 'assumption'
  description: string
  weights: Readonly<Record<'normal' | 'other', number>>
}

export const CONDITION_WORLDS: Readonly<Record<ConditionWorldId, ConditionWorldDefinition>>
  = Object.freeze({
    'balanced-iid': Object.freeze({
      id: 'balanced-iid',
      role: 'plausible',
      evidence: 'assumption',
      description: 'IID sensitivity world with equal weight for every randomly reachable condition.',
      weights: Object.freeze({ normal: 1, other: 1 }),
    }),
    'normal-heavy-iid': Object.freeze({
      id: 'normal-heavy-iid',
      role: 'plausible',
      evidence: 'assumption',
      description: 'IID sensitivity world with Normal weighted six times each other reachable condition.',
      weights: Object.freeze({ normal: 6, other: 1 }),
    }),
    'opportunity-scarce-iid': Object.freeze({
      id: 'opportunity-scarce-iid',
      role: 'plausible-stress',
      evidence: 'assumption',
      description: 'IID stress sensitivity world with Normal weighted twelve and colored conditions 0.35.',
      weights: Object.freeze({ normal: 12, other: 0.35 }),
    }),
    'all-normal': Object.freeze({
      id: 'all-normal',
      role: 'adversarial',
      evidence: 'assumption',
      description: 'Deterministic all-Normal catastrophe/recovery probe; excluded from plausible averages.',
      weights: Object.freeze({ normal: 1, other: 0 }),
    }),
  })

const PRESET_DEFAULTS = Object.freeze({
  small: Object.freeze({
    worldIds: Object.freeze(['balanced-iid', 'normal-heavy-iid'] as const),
    seedCount: 1,
    maxEpisodes: 1_000,
  }),
  full: Object.freeze({
    worldIds: Object.freeze([
      'balanced-iid',
      'normal-heavy-iid',
      'opportunity-scarce-iid',
      'all-normal',
    ] as const),
    seedCount: 4,
    maxEpisodes: 10_000,
  }),
})

export interface MatrixCliOptions {
  preset: MatrixPreset
  recipeId: number | null
  equipmentIds: readonly string[]
  worldIds: readonly ConditionWorldId[]
  seedCount: number
  baseSeed: number
  maxSteps: number
  maxEpisodes: number
  baselineRisk: RiskPreference | null
  candidateRisk: RiskPreference
  includeTrace: boolean
  compactOutput: boolean
  quiet: boolean
  outputPath: string | null
  baselineReportPath: string | null
  minimumMaterialEffect: number
  lookIndex: number
  maxLooks: number
}

export interface MatrixArm {
  id: MatrixArmId
  risk: RiskPreference
  policyVersion: string
}

export interface MatrixCase {
  caseId: string
  caseFingerprint: string
  evaluationScenarioId: string
  objectiveUtilitySignature: string
  family: Readonly<CosmicExpertMechanicsFamily>
  recipeId: number
  equipment: Readonly<EvaluationEquipmentProfile>
  world: Readonly<ConditionWorldDefinition>
  conditionProfile: Readonly<WeightedConditionProfile>
  equipmentFingerprint: string
  conditionWorldFingerprint: string
  baseSeed: number
  maxSteps: number
  seedIndex: number
  pairedSeed: number
}

export interface MatrixComparisonContract {
  version: typeof GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION
  baseSeed: number
  maxStepsPerEpisode: number
  caseCount: number
  caseSetFingerprint: string
}

export interface EvaluationScenario {
  evaluationScenarioId: string
  family: Readonly<CosmicExpertMechanicsFamily>
  representativeRecipeId: number
  recipeIds: readonly number[]
  objectiveUtilitySignature: string
  objectiveUtilityIdentity: Readonly<{
    mode: string
    tierQualities: readonly number[]
    qualityOutcome: string
    missionRank: CosmicMissionRank
  }>
  objectiveTemplateEvidence: Readonly<{
    sourceConfidence: string
    sourceKind: string
    templateRecipeId: number
    sourceMetadataVariantCount: number
  }>
}

export interface MatrixPlan {
  matrixId: string
  comparisonContract: Readonly<MatrixComparisonContract>
  options: Readonly<MatrixCliOptions>
  arms: readonly Readonly<MatrixArm>[]
  cases: readonly Readonly<MatrixCase>[]
  mechanicsFamilyCount: number
  evaluationScenarioCount: number
  evaluationScenarios: readonly Readonly<EvaluationScenario>[]
  budget: {
    hardEpisodeCap: number
    configuredEpisodeCap: number
    projectedCases: number
    projectedArms: number
    projectedEpisodes: number
    maxStepsPerEpisode: number
    projectedRecommendationCallUpperBound: number
    traceEpisodeCap: number
  }
}

export interface SetupFollowupMetrics {
  setupActionsStarted: number
  immediateConsumers: number
  immediateNormalNonConsumers: number
  immediateColoredNonConsumers: number
  noFollowingAction: number
  eventualConsumersBeforeExpiry: number
}

export interface MatrixEpisodeRow extends SetupFollowupMetrics {
  arm: MatrixArmId
  risk: RiskPreference
  caseId: string
  caseFingerprint: string
  evaluationScenarioId: string
  objectiveUtilitySignature: string
  familyId: string
  recipeId: number
  equipmentId: string
  worldId: ConditionWorldId
  worldRole: ConditionWorldRole
  equipmentFingerprint: string
  conditionWorldFingerprint: string
  baseSeed: number
  maxSteps: number
  seedIndex: number
  pairedSeed: number
  terminal: CraftState['terminal']
  stopReason: EpisodeStopReason
  actions: number
  quality: number
  qualityMaximum: number
  qualityRatio: number
  completedObjectiveUtility: number
  objectiveId: string
  qualityUtilityKind: QualityUtilityKind
  protectedQualityFloor: number
  qualityMilestones: readonly number[]
  hqChanceMilestones: readonly number[]
  protectedHqChanceFloorPercent: number | null
  protectedQualityFloorReached: boolean
  firstQualityTier: number | null
  firstQualityTierReached: boolean | null
  qualityMaximumReached: boolean
  recommendationCalls: number
  recommendationMs: number
  recommendationMeanMs: number
  recommendationMaxMs: number | null
  progress: number
  progressRequired: number
  durability: number
  cp: number
  requiredQuality: number
  completionContract: CompletionContract
  specialistActionUses: Readonly<Record<'carefulObservation' | 'heartAndSoul' | 'quickInnovation', number>>
  trace?: unknown
}

export interface MigrationOracleCursor {
  condition: number
  success: number
}

export interface MigrationOracleStep {
  before: CraftState
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
  after: CraftState
  cursorBefore: MigrationOracleCursor
  cursorAfter: MigrationOracleCursor
  explanationCodes: readonly string[]
  memoryAfter: string
}

export interface MigrationOracleEpisode {
  caseId: string
  risk: RiskPreference
  terminal: CraftState['terminal']
  stopReason: EpisodeStopReason
  actions: readonly CraftActionId[]
  finalState: CraftState
  finalCursor: MigrationOracleCursor
  finalMemory: string
  recommendationCalls: number
  steps: readonly MigrationOracleStep[]
}

interface MeasuredMatrixEpisodeRow extends MatrixEpisodeRow {
  recommendationDurationsMs: readonly number[]
}

export interface DistributionSummary {
  count: number
  minimum: number | null
  p10: number | null
  median: number | null
  p90: number | null
  p95: number | null
  p99: number | null
  maximum: number | null
  mean: number | null
}

export interface AggregateMetrics {
  key: string
  arm: MatrixArmId
  episodes: number
  completed: number
  completionRate: number
  qualityMaximumReached: number
  qualityMaximumRate: number
  protectedQualityFloorReached: number
  protectedQualityFloorRate: number
  qualityTierCases: number
  firstQualityTierReached: number
  stopReasons: Readonly<Record<EpisodeStopReason, number>>
  completedQualityRatio: DistributionSummary
  allEpisodeObjectiveUtility: DistributionSummary
  completedActions: DistributionSummary
  recommendationCalls: number
  recommendationLatencyMs: DistributionSummary
  totalRecommendationMs: number
  specialistActionUses: Readonly<Record<'carefulObservation' | 'heartAndSoul' | 'quickInnovation', number>>
}

export interface PairedComparison {
  key: string
  pairs: number
  protectedFloorComparable: boolean
  completion: Readonly<{ candidateOnly: number; baselineOnly: number; both: number; neither: number }>
  qualityMaximum: Readonly<{ candidateOnly: number; baselineOnly: number; both: number; neither: number }>
  protectedFloor: Readonly<{
    candidateOnly: number
    baselineOnly: number
    both: number
    neither: number
  }> | null
  completedQuality: Readonly<{
    candidateWins: number
    candidateLosses: number
    ties: number
    compared: number
    meanCandidateDelta: number | null
  }>
  objectiveUtility: Readonly<{
    candidateWins: number
    candidateLosses: number
    ties: number
    meanCandidateDelta: number
  }>
  qualityMaximumReachedActions: Readonly<{
    candidateShorter: number
    candidateLonger: number
    ties: number
    compared: number
    meanCandidateDelta: number | null
  }>
  completionRegressionCount: number
  completionRegressionCaseIds: readonly string[]
}

export interface StoppingDecision {
  method: 'fixed-look-bonferroni-empirical-bernstein-v1'
  decision: 'keep' | 'continue' | 'stop-no-material-signal' | 'reject'
  reason:
    | 'candidate-lower-bound-clears-material-effect'
    | 'confidence-interval-contained-inside-immaterial-band'
    | 'more-paired-data-needed'
    | 'completion-regression-veto'
    | 'material-negative-regression'
  pairs: number
  pairedNormalizedObjectiveUtility: {
    meanCandidateDelta: number
    sampleVariance: number
    lowerConfidenceBound: number
    upperConfidenceBound: number
    confidenceFamilywise: number
    perLookAlpha: number
    lookIndex: number
    maximumLooks: number
    minimumMaterialEffect: number
    boundedRange: readonly [-1, 1]
  }
  completionRegressionVeto: {
    triggered: boolean
    count: number
    caseIds: readonly string[]
  }
  dataNeed: {
    estimatedTotalPairsForHalfWidthAtMostMinimumMaterialEffect: number | null
    estimatedAdditionalPairs: number | null
    estimatedAdditionalEpisodes: number | null
    exceedsHardMatrixEpisodeCap: boolean | null
    assumption: string
  }
  interpretation: string
}

const STOP_REASONS: readonly EpisodeStopReason[] = [
  'completed',
  'failed',
  'policy-null',
  'no-legal-action',
  'illegal-action',
  'action-limit',
]

const SPECIALIST_ACTIONS = [
  'carefulObservation',
  'heartAndSoul',
  'quickInnovation',
] as const

const MATRIX_VALUE_OPTION_NAMES = Object.freeze([
  'preset',
  'recipe',
  'equipment',
  'world',
  'candidate-risk',
  'risk',
  'baseline-risk',
  'baseline-report',
  'seed-count',
  'base-seed',
  'max-steps',
  'max-episodes',
  'output',
  'minimum-material-effect',
  'look-index',
  'max-looks',
] as const)

const MATRIX_FLAG_OPTION_NAMES = Object.freeze([
  'no-baseline',
  'trace',
  'compact',
  'quiet',
] as const)

function validateMatrixCliArguments(args: readonly string[]): void {
  const valueNames = new Set<string>(MATRIX_VALUE_OPTION_NAMES)
  const flagNames = new Set<string>(MATRIX_FLAG_OPTION_NAMES)
  const seen = new Set<string>()
  for (const argument of args) {
    if (!argument.startsWith('--')) {
      throw new Error(
        `unexpected positional argument "${argument}"; value options must use --key=value`,
      )
    }
    const equalsIndex = argument.indexOf('=')
    if (equalsIndex < 0) {
      const name = argument.slice(2)
      if (valueNames.has(name)) {
        throw new Error(`--${name} requires --${name}=<value>; space-separated values are not supported`)
      }
      if (!flagNames.has(name)) throw new Error(`unknown matrix option: --${name}`)
      if (seen.has(name)) throw new Error(`duplicate matrix option: --${name}`)
      seen.add(name)
      continue
    }

    const name = argument.slice(2, equalsIndex)
    const value = argument.slice(equalsIndex + 1)
    if (flagNames.has(name)) throw new Error(`--${name} is a flag and must not use =<value>`)
    if (!valueNames.has(name)) throw new Error(`unknown matrix option: --${name}`)
    if (value.length === 0) throw new Error(`--${name} must not be empty`)
    if (seen.has(name)) throw new Error(`duplicate matrix option: --${name}`)
    seen.add(name)
  }
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
  return parsed
}

function parseUint32(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) {
    throw new RangeError(`${label} must be a uint32 integer`)
  }
  return parsed
}

function parseUnitInterval(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    throw new RangeError(`${label} must be greater than 0 and less than 1`)
  }
  return parsed
}

function parseRisk(value: string | undefined, fallback: RiskPreference, label: string): RiskPreference {
  const risk = value ?? fallback
  if (risk !== 'stable' && risk !== 'balanced' && risk !== 'aggressive') {
    throw new RangeError(`${label} must be stable, balanced, or aggressive`)
  }
  return risk
}

function uniqueValues(values: readonly string[], label: string): readonly string[] {
  const unique = [...new Set(values)]
  if (unique.length !== values.length) throw new Error(`${label} must not contain duplicates`)
  if (unique.length === 0) throw new Error(`${label} must not be empty`)
  return unique
}

const EQUIPMENT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  unbuffed: PLAYER_EQUIPMENT_PROFILES[0]!.id,
  buffed: PLAYER_EQUIPMENT_PROFILES[1]!.id,
  specialist: PLAYER_EQUIPMENT_PROFILES[2]!.id,
})

export function parseMatrixCliOptions(args: readonly string[]): MatrixCliOptions {
  validateMatrixCliArguments(args)
  const presetValue = optionValue(args, 'preset') ?? 'small'
  if (presetValue !== 'small' && presetValue !== 'full') {
    throw new RangeError('--preset must be small or full')
  }
  const preset = presetValue satisfies MatrixPreset
  const defaults = PRESET_DEFAULTS[preset]
  const recipeValue = optionValue(args, 'recipe')
  const recipeId = recipeValue === undefined
    ? null
    : parsePositiveInteger(recipeValue, 0, '--recipe')

  const requestedEquipment = optionValue(args, 'equipment')
  const equipmentIds = requestedEquipment === undefined || requestedEquipment === 'all'
    ? GENERIC_EVALUATION_EQUIPMENT_PROFILES.map((profile) => profile.id)
    : uniqueValues(
        requestedEquipment.split(',').map((id) => EQUIPMENT_ALIASES[id] ?? id),
        '--equipment',
      )
  for (const equipmentId of equipmentIds) {
    if (!GENERIC_EVALUATION_EQUIPMENT_PROFILES.some((profile) => profile.id === equipmentId)) {
      throw new Error(`unknown equipment profile: ${equipmentId}`)
    }
  }

  const requestedWorlds = optionValue(args, 'world')
  const worldIds = (requestedWorlds === undefined || requestedWorlds === 'preset'
    ? [...defaults.worldIds]
    : uniqueValues(requestedWorlds.split(','), '--world')) as readonly ConditionWorldId[]
  for (const worldId of worldIds) {
    if (!(worldId in CONDITION_WORLDS)) throw new Error(`unknown condition world: ${worldId}`)
  }

  const candidateRiskValue = optionValue(args, 'candidate-risk')
  const riskAliasValue = optionValue(args, 'risk')
  if (candidateRiskValue !== undefined && riskAliasValue !== undefined) {
    throw new Error('--candidate-risk and --risk cannot be used together')
  }
  const candidateRisk = parseRisk(
    candidateRiskValue ?? riskAliasValue,
    'balanced',
    '--candidate-risk',
  )
  const baselineValue = optionValue(args, 'baseline-risk')
  const baselineReportPath = optionValue(args, 'baseline-report') ?? null
  if (baselineReportPath !== null && baselineReportPath.trim().length === 0) {
    throw new Error('--baseline-report must not be empty')
  }
  if (baselineReportPath !== null && baselineValue !== undefined && baselineValue !== 'none') {
    throw new Error('--baseline-report and --baseline-risk cannot be used together')
  }
  const baselineRisk = args.includes('--no-baseline') || baselineValue === undefined || baselineValue === 'none'
    ? null
    : parseRisk(baselineValue, 'balanced', '--baseline-risk')
  if (args.includes('--no-baseline') && baselineValue !== undefined && baselineValue !== 'none') {
    throw new Error('--no-baseline and --baseline-risk cannot be used together')
  }
  const seedCount = parsePositiveInteger(optionValue(args, 'seed-count'), defaults.seedCount, '--seed-count')
  if (seedCount > MAX_MATRIX_SEEDS_PER_CELL) {
    throw new RangeError(`--seed-count cannot exceed ${MAX_MATRIX_SEEDS_PER_CELL}`)
  }
  const maxSteps = parsePositiveInteger(optionValue(args, 'max-steps'), 80, '--max-steps')
  if (maxSteps > MAX_MATRIX_STEPS) {
    throw new RangeError(`--max-steps cannot exceed ${MAX_MATRIX_STEPS}`)
  }
  const maxEpisodes = parsePositiveInteger(
    optionValue(args, 'max-episodes'),
    defaults.maxEpisodes,
    '--max-episodes',
  )
  if (maxEpisodes > MAX_MATRIX_EPISODES) {
    throw new RangeError(`--max-episodes cannot exceed hard cap ${MAX_MATRIX_EPISODES}`)
  }
  const outputPath = optionValue(args, 'output') ?? null
  if (outputPath !== null && outputPath.trim().length === 0) {
    throw new Error('--output must not be empty')
  }
  const maxLooks = parsePositiveInteger(optionValue(args, 'max-looks'), 8, '--max-looks')
  if (maxLooks > 32) throw new RangeError('--max-looks cannot exceed 32')
  const lookIndex = parsePositiveInteger(optionValue(args, 'look-index'), 1, '--look-index')
  if (lookIndex > maxLooks) throw new RangeError('--look-index cannot exceed --max-looks')

  return Object.freeze({
    preset,
    recipeId,
    equipmentIds: Object.freeze([...equipmentIds]),
    worldIds: Object.freeze([...worldIds]),
    seedCount,
    baseSeed: parseUint32(optionValue(args, 'base-seed'), 20_260_824, '--base-seed'),
    maxSteps,
    maxEpisodes,
    baselineRisk,
    candidateRisk,
    includeTrace: args.includes('--trace'),
    compactOutput: args.includes('--compact'),
    quiet: args.includes('--quiet'),
    outputPath,
    baselineReportPath,
    minimumMaterialEffect: parseUnitInterval(
      optionValue(args, 'minimum-material-effect'),
      0.02,
      '--minimum-material-effect',
    ),
    lookIndex,
    maxLooks,
  })
}

function pairedSeed(
  baseSeed: number,
  familyId: string,
  equipmentId: string,
  worldId: ConditionWorldId,
  seedIndex: number,
): number {
  const familyIndex = COSMIC_EXPERT_MECHANICS_FAMILIES.findIndex(
    (family) => family.familyId === familyId,
  )
  const equipmentIndex = GENERIC_EVALUATION_EQUIPMENT_PROFILES.findIndex(
    (equipment) => equipment.id === equipmentId,
  )
  const worldIds = Object.keys(CONDITION_WORLDS) as ConditionWorldId[]
  const worldIndex = worldIds.indexOf(worldId)
  if (familyIndex < 0 || equipmentIndex < 0 || worldIndex < 0) {
    throw new Error('paired seed requires canonical family, equipment, and world IDs')
  }
  if (seedIndex < 0 || seedIndex >= MAX_MATRIX_SEEDS_PER_CELL) {
    throw new RangeError(`paired seed index must be below ${MAX_MATRIX_SEEDS_PER_CELL}`)
  }
  const canonicalCounter = (
    (
      familyIndex * GENERIC_EVALUATION_EQUIPMENT_PROFILES.length
      + equipmentIndex
    ) * worldIds.length
    + worldIndex
  ) * MAX_MATRIX_SEEDS_PER_CELL + seedIndex
  return (baseSeed ^ canonicalCounter) >>> 0
}

function contentFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

function conditionWeightsIdentity(
  weights: Readonly<Partial<Record<MaterialCondition, number>>>,
): readonly (readonly [MaterialCondition, number])[] {
  return Object.freeze(MATERIAL_CONDITIONS.flatMap((condition) => {
    const weight = weights[condition]
    return weight === undefined ? [] : [Object.freeze([condition, weight] as const)]
  }))
}

function equipmentProfileFingerprint(equipment: Readonly<EvaluationEquipmentProfile>): string {
  return contentFingerprint({
    id: equipment.id,
    preparation: equipment.preparation,
    specialistConsumableCost: equipment.specialistConsumableCost,
    crafter: {
      level: equipment.crafter.level,
      craftsmanship: equipment.crafter.craftsmanship,
      control: equipment.crafter.control,
      maxCp: equipment.crafter.maxCp,
      cosmicToolGoodBonus: equipment.crafter.cosmicToolGoodBonus,
      specialist: equipment.crafter.specialist ?? false,
    },
  })
}

function conditionWorldProfileFingerprint(
  world: Readonly<ConditionWorldDefinition>,
  profile: Readonly<WeightedConditionProfile>,
): string {
  const transitions = MATERIAL_CONDITIONS.flatMap((previousCondition) => {
    const weights = profile.transitionWeights?.[previousCondition]
    return weights === undefined
      ? []
      : [Object.freeze({
          previousCondition,
          weights: conditionWeightsIdentity(weights),
        })]
  })
  return contentFingerprint({
    world: {
      id: world.id,
      role: world.role,
      evidence: world.evidence,
      weights: [
        ['normal', world.weights.normal],
        ['other', world.weights.other],
      ],
    },
    conditionProfile: {
      id: profile.id,
      evidence: profile.evidence,
      weights: conditionWeightsIdentity(profile.weights),
      transitionWeights: transitions,
    },
  })
}

function worldProfile(
  world: Readonly<ConditionWorldDefinition>,
  randomConditions: readonly MaterialCondition[],
): Readonly<WeightedConditionProfile> {
  const conditionIdentity = randomConditions.join('-')
  return Object.freeze({
    id: `generic-cosmic-${world.id}-${conditionIdentity}-v1`,
    evidence: world.evidence,
    weights: Object.freeze(Object.fromEntries(randomConditions.map((condition) => [
      condition,
      condition === 'normal' ? world.weights.normal : world.weights.other,
    ]))),
  })
}

function objectiveUtilityIdentity(
  scenario: (typeof COSMIC_EXPERT_SCENARIO_DATA)[number],
): EvaluationScenario['objectiveUtilityIdentity'] {
  return Object.freeze({
    mode: scenario.objective.mode,
    tierQualities: Object.freeze(scenario.objective.qualityTiers.map((tier) => tier.minimumQuality)),
    qualityOutcome: scenario.recipe.qualityOutcome,
    missionRank: cosmicMissionRank(scenario.missionNamesEn),
  })
}

function objectiveUtilitySignature(identity: EvaluationScenario['objectiveUtilityIdentity']): string {
  return contentFingerprint(identity)
}

export interface PolicyEffectiveObjectiveCandidate<T> {
  signature: string
  evidenceScore: number
  stableId: number
  value: T
}

export function selectPolicyEffectiveObjectiveTemplate<T>(
  familyId: string,
  candidates: readonly Readonly<PolicyEffectiveObjectiveCandidate<T>>[],
): {
  selected: Readonly<PolicyEffectiveObjectiveCandidate<T>>
} {
  if (candidates.length === 0) throw new Error(`no objective candidates for ${familyId}`)
  const signatures = new Set(candidates.map((candidate) => candidate.signature))
  if (signatures.size !== 1) {
    throw new Error(
      `conflicting policy-effective objectives for mechanics family ${familyId}: ${[...signatures].join(',')}`,
    )
  }
  const matching = [...candidates].sort((left, right) => (
      right.evidenceScore - left.evidenceScore
      || left.stableId - right.stableId
    ))
  return {
    selected: matching[0]!,
  }
}

export function cosmicEvaluationScenarios(recipeId: number | null): readonly EvaluationScenario[] {
  if (recipeId !== null && cosmicExpertScenarioDataByRecipeId(recipeId) === null) {
    throw new Error(`unknown Cosmic expert recipe ${recipeId}`)
  }
  const scenariosByFamily = new Map<
    string,
    (typeof COSMIC_EXPERT_SCENARIO_DATA)[number][]
  >()
  for (const scenario of COSMIC_EXPERT_SCENARIO_DATA) {
    const values = scenariosByFamily.get(scenario.recipe.recipeFamilyId) ?? []
    values.push(scenario)
    scenariosByFamily.set(scenario.recipe.recipeFamilyId, values)
  }

  const evidenceScore = (
    scenario: (typeof COSMIC_EXPERT_SCENARIO_DATA)[number],
  ): number => {
    const confidence = scenario.objective.source.confidence === 'verified'
      ? 300
      : scenario.objective.source.confidence === 'provisional' ? 200 : 100
    const source = scenario.objective.source.sourceKind === 'official'
      ? 50
      : scenario.objective.source.sourceKind === 'empirical'
        ? 40
        : scenario.objective.source.sourceKind === 'datamined' ? 20 : 0
    return confidence + source + scenario.objective.qualityTiers.length
  }

  const scenarios = COSMIC_EXPERT_MECHANICS_FAMILIES.map((family) => {
    const familyScenarios = scenariosByFamily.get(family.familyId)
    if (familyScenarios === undefined || familyScenarios.length !== family.recipeIds.length) {
      throw new Error(`incomplete objective coverage for mechanics family ${family.familyId}`)
    }
    const candidates = familyScenarios.map((scenario) => {
      const identity = objectiveUtilityIdentity(scenario)
      return {
        signature: objectiveUtilitySignature(identity),
        evidenceScore: evidenceScore(scenario),
        stableId: scenario.recipe.canonicalRecipeId,
        value: { scenario, identity },
      }
    })
    const selection = selectPolicyEffectiveObjectiveTemplate(family.familyId, candidates)
    const selectedSignature = selection.selected.signature
    const template = selection.selected.value.scenario
    const selectedIdentity = selection.selected.value.identity
    const sourceMetadataVariantCount = new Set(familyScenarios.map((scenario) => [
      scenario.objective.source.sourceKind,
      scenario.objective.source.confidence,
    ].join(':'))).size
    return Object.freeze({
      evaluationScenarioId: `${family.familyId}|objective:${selectedSignature}`,
      family,
      representativeRecipeId: template.recipe.canonicalRecipeId,
      recipeIds: Object.freeze([...family.recipeIds]),
      objectiveUtilitySignature: selectedSignature,
      objectiveUtilityIdentity: selectedIdentity,
      objectiveTemplateEvidence: Object.freeze({
        sourceConfidence: template.objective.source.confidence,
        sourceKind: template.objective.source.sourceKind,
        templateRecipeId: template.recipe.canonicalRecipeId,
        sourceMetadataVariantCount,
      }),
    })
  })
  if (recipeId === null) return Object.freeze(scenarios)
  const selected = scenarios.find((scenario) => scenario.recipeIds.includes(recipeId))
  if (selected === undefined) throw new Error(`missing evaluation scenario for recipe ${recipeId}`)
  return Object.freeze([selected])
}

export function describeGenericCosmicFamilyEvaluator() {
  return Object.freeze({
    matrixSchemaVersion: GENERIC_FAMILY_MATRIX_SCHEMA_VERSION,
    pairedComparisonContractVersion: GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION,
    catalogVersion: COSMIC_EXPERT_CATALOG_VERSION,
    mechanicsVersion: CRAFT_MECHANICS_VERSION,
    policyVersion: SOLVER_POLICY_VERSION,
    maxSeedsPerCell: MAX_MATRIX_SEEDS_PER_CELL,
    equipmentIds: Object.freeze(
      GENERIC_EVALUATION_EQUIPMENT_PROFILES.map((profile) => profile.id),
    ),
    worldIds: Object.freeze(Object.keys(CONDITION_WORLDS)),
    families: Object.freeze(cosmicEvaluationScenarios(null).map((scenario) => Object.freeze({
      familyId: scenario.family.familyId,
      representativeRecipeId: scenario.representativeRecipeId,
      recipeCount: scenario.recipeIds.length,
      evaluationScenarioId: scenario.evaluationScenarioId,
    }))),
  })
}

export function buildMatrixPlan(options: Readonly<MatrixCliOptions>): MatrixPlan {
  const arms: readonly Readonly<MatrixArm>[] = Object.freeze([
    ...(options.baselineRisk === null ? [] : [{
      id: 'baseline' as const,
      risk: options.baselineRisk,
      policyVersion: SOLVER_POLICY_VERSION,
    }]),
    {
      id: 'candidate' as const,
      risk: options.candidateRisk,
      policyVersion: SOLVER_POLICY_VERSION,
    },
  ].map((arm) => Object.freeze(arm)))
  const equipmentProfiles = options.equipmentIds.map((equipmentId) => {
    const equipment = GENERIC_EVALUATION_EQUIPMENT_PROFILES.find(
      (profile) => profile.id === equipmentId,
    )
    if (equipment === undefined) throw new Error(`unknown equipment profile: ${equipmentId}`)
    return equipment
  })
  const worlds = options.worldIds.map((worldId) => CONDITION_WORLDS[worldId])
  const evaluationScenarios = cosmicEvaluationScenarios(options.recipeId)
  const cases: MatrixCase[] = []
  for (const evaluationScenario of evaluationScenarios) {
    const { family, representativeRecipeId: recipeId } = evaluationScenario
    const scenario = cosmicExpertScenarioDataByRecipeId(recipeId)
    if (scenario === null) throw new Error(`missing recipe ${recipeId}`)
    const randomConditions = scenario.recipe.randomConditions ?? scenario.recipe.availableConditions
    for (const equipment of equipmentProfiles) {
      const equipmentFingerprint = equipmentProfileFingerprint(equipment)
      for (const world of worlds) {
        const conditionProfile = worldProfile(world, randomConditions)
        const conditionWorldFingerprint = conditionWorldProfileFingerprint(world, conditionProfile)
        for (let seedIndex = 0; seedIndex < options.seedCount; seedIndex += 1) {
          const resolvedPairedSeed = pairedSeed(
            options.baseSeed,
            family.familyId,
            equipment.id,
            world.id,
            seedIndex,
          )
          const caseFingerprint = contentFingerprint({
            comparisonContractVersion: GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION,
            evaluationScenarioId: evaluationScenario.evaluationScenarioId,
            objectiveUtilitySignature: evaluationScenario.objectiveUtilitySignature,
            recipeId,
            equipmentId: equipment.id,
            equipmentFingerprint,
            worldId: world.id,
            conditionWorldFingerprint,
            baseSeed: options.baseSeed,
            seedIndex,
            maxSteps: options.maxSteps,
            pairedSeed: resolvedPairedSeed,
          })
          const caseId = [
            evaluationScenario.evaluationScenarioId,
            `recipe:${recipeId}`,
            `equipment:${equipment.id}@${equipmentFingerprint}`,
            `world:${world.id}@${conditionWorldFingerprint}`,
            `base-seed:${options.baseSeed}`,
            `sample:${seedIndex}`,
            `max-steps:${options.maxSteps}`,
            `case:${caseFingerprint}`,
          ].join('|')
          cases.push(Object.freeze({
            caseId,
            caseFingerprint,
            evaluationScenarioId: evaluationScenario.evaluationScenarioId,
            objectiveUtilitySignature: evaluationScenario.objectiveUtilitySignature,
            family,
            recipeId,
            equipment,
            world,
            conditionProfile,
            equipmentFingerprint,
            conditionWorldFingerprint,
            baseSeed: options.baseSeed,
            maxSteps: options.maxSteps,
            seedIndex,
            pairedSeed: resolvedPairedSeed,
          }))
        }
      }
    }
  }
  if (new Set(cases.map((evaluationCase) => evaluationCase.pairedSeed)).size !== cases.length) {
    throw new Error('paired seed schedule produced a duplicate within the matrix plan')
  }
  const projectedEpisodes = cases.length * arms.length
  if (projectedEpisodes > options.maxEpisodes) {
    throw new RangeError(
      `matrix projects ${projectedEpisodes} episodes, exceeding configured --max-episodes=${options.maxEpisodes}`,
    )
  }
  if (projectedEpisodes > MAX_MATRIX_EPISODES) {
    throw new RangeError(`matrix projects ${projectedEpisodes} episodes, exceeding hard cap ${MAX_MATRIX_EPISODES}`)
  }
  const traceEpisodeCap = 16
  if (options.includeTrace && projectedEpisodes > traceEpisodeCap) {
    throw new RangeError(
      `--trace is limited to ${traceEpisodeCap} episodes; filter --recipe/--equipment/--world/--seed-count`,
    )
  }
  const comparisonContract: Readonly<MatrixComparisonContract> = Object.freeze({
    version: GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION,
    baseSeed: options.baseSeed,
    maxStepsPerEpisode: options.maxSteps,
    caseCount: cases.length,
    caseSetFingerprint: contentFingerprint(cases
      .map((evaluationCase) => ({
        caseId: evaluationCase.caseId,
        caseFingerprint: evaluationCase.caseFingerprint,
        pairedSeed: evaluationCase.pairedSeed,
      }))
      .sort((left, right) => left.caseId.localeCompare(right.caseId))),
  })
  const identityPayload = {
    schemaVersion: GENERIC_FAMILY_MATRIX_SCHEMA_VERSION,
    catalogVersion: COSMIC_EXPERT_CATALOG_VERSION,
    mechanicsVersion: CRAFT_MECHANICS_VERSION,
    policyVersion: SOLVER_POLICY_VERSION,
    recipeId: options.recipeId,
    equipmentIds: options.equipmentIds,
    worldIds: options.worldIds,
    seedCount: options.seedCount,
    baseSeed: options.baseSeed,
    maxSteps: options.maxSteps,
    minimumMaterialEffect: options.minimumMaterialEffect,
    lookIndex: options.lookIndex,
    maxLooks: options.maxLooks,
    arms,
    comparisonContract,
  }
  const hash = createHash('sha256').update(JSON.stringify(identityPayload)).digest('hex').slice(0, 16)
  return Object.freeze({
    matrixId: `${GENERIC_FAMILY_MATRIX_SCHEMA_VERSION}-${hash}`,
    comparisonContract,
    options,
    arms,
    cases: Object.freeze(cases),
    mechanicsFamilyCount: new Set(evaluationScenarios.map((scenario) => scenario.family.familyId)).size,
    evaluationScenarioCount: evaluationScenarios.length,
    evaluationScenarios: Object.freeze(evaluationScenarios),
    budget: Object.freeze({
      hardEpisodeCap: MAX_MATRIX_EPISODES,
      configuredEpisodeCap: options.maxEpisodes,
      projectedCases: cases.length,
      projectedArms: arms.length,
      projectedEpisodes,
      maxStepsPerEpisode: options.maxSteps,
      projectedRecommendationCallUpperBound: projectedEpisodes * options.maxSteps,
      traceEpisodeCap,
    }),
  })
}

export function setupFollowupMetrics(steps: readonly {
  action: CraftActionId
  before: {
    condition: MaterialCondition
    buffs: { innovation: number; veneration: number; greatStrides: number; muscleMemory: number }
  }
  after: { terminal: string }
}[]): SetupFollowupMetrics {
  let setupActionsStarted = 0
  let immediateConsumers = 0
  let immediateNormalNonConsumers = 0
  let immediateColoredNonConsumers = 0
  let noFollowingAction = 0
  let eventualConsumersBeforeExpiry = 0
  for (let index = 0; index < steps.length; index += 1) {
    const setup = steps[index]!
    const intent = setup.action === 'innovation' || setup.action === 'greatStrides'
      ? 'quality'
      : setup.action === 'veneration' || setup.action === 'muscleMemory'
        ? 'progress'
        : setup.action === 'observe' ? 'observe' : null
    if (intent === null || setup.after.terminal !== 'none') continue
    setupActionsStarted += 1
    const immediate = steps[index + 1]
    if (immediate === undefined) {
      noFollowingAction += 1
      continue
    }
    const consumesIntent = (next: typeof immediate): boolean => intent === 'quality'
      ? ACTIONS[next.action].category === 'quality'
      : intent === 'progress'
        ? ACTIONS[next.action].category === 'progress'
        : next.action === 'advancedTouch'
          || (next.before.condition === 'good' && next.action === 'preciseTouch')
    if (consumesIntent(immediate)) immediateConsumers += 1
    else if (immediate.before.condition === 'normal') immediateNormalNonConsumers += 1
    else immediateColoredNonConsumers += 1

    let consumed = false
    for (let cursor = index + 1; cursor < steps.length; cursor += 1) {
      const next = steps[cursor]!
      const buffStillActive = setup.action === 'innovation'
        ? next.before.buffs.innovation > 0
        : setup.action === 'greatStrides'
          ? next.before.buffs.greatStrides > 0
          : setup.action === 'veneration'
            ? next.before.buffs.veneration > 0
            : setup.action === 'muscleMemory'
              ? next.before.buffs.muscleMemory > 0
              : cursor === index + 1
      if (!buffStillActive) break
      consumed = consumesIntent(next)
      if (consumed) break
      if (intent === 'observe') break
    }
    if (consumed) eventualConsumersBeforeExpiry += 1
  }
  return {
    setupActionsStarted,
    immediateConsumers,
    immediateNormalNonConsumers,
    immediateColoredNonConsumers,
    noFollowingAction,
    eventualConsumersBeforeExpiry,
  }
}

function emptySetupMetrics(): SetupFollowupMetrics {
  return {
    setupActionsStarted: 0,
    immediateConsumers: 0,
    immediateNormalNonConsumers: 0,
    immediateColoredNonConsumers: 0,
    noFollowingAction: 0,
    eventualConsumersBeforeExpiry: 0,
  }
}

function specialistActionUses(actions: readonly CraftActionId[]) {
  return Object.freeze({
    carefulObservation: actions.filter((action) => action === 'carefulObservation').length,
    heartAndSoul: actions.filter((action) => action === 'heartAndSoul').length,
    quickInnovation: actions.filter((action) => action === 'quickInnovation').length,
  })
}

export function completionContractForRequiredQuality(requiredQuality: number): CompletionContract {
  if (!Number.isSafeInteger(requiredQuality) || requiredQuality < 0) {
    throw new RangeError('requiredQuality must be a non-negative safe integer')
  }
  return requiredQuality === 0 ? 'progress-only' : 'progress-and-required-quality'
}

function migrationOracleMemoryFingerprint(history: readonly CraftActionId[]): string {
  const memory = rebuildGuideIntegratedDecisionMemory(history)
  return [
    memory.version,
    memory.actionUses,
    memory.lastQualityActionUse,
    memory.lastPreciseTouchActionUse,
    memory.wasteNotUses,
    memory.manipulationUses,
    memory.innovationUses,
    memory.greatStridesUses,
    memory.reliableQualityFirstRouteIndex,
    memory.lastAction ?? '-',
  ].join(':')
}

/**
 * Sealed, step-level TS migration reference. Timing is deliberately absent.
 * Shared-action mechanics fields remain exact; policy behavior is compared by
 * bounded similarity and is not a permanent Rust action-by-action contract.
 */
export function runMigrationOracleEpisode(
  evaluationCase: Readonly<MatrixCase>,
  risk: RiskPreference,
  maxSteps = evaluationCase.maxSteps,
): MigrationOracleEpisode {
  const scenario = cosmicExpertScenarioDataByRecipeId(evaluationCase.recipeId)
  if (scenario === null) throw new Error(`missing recipe ${evaluationCase.recipeId}`)
  if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0 || maxSteps > MAX_MATRIX_STEPS) {
    throw new RangeError(`maxSteps must be between 1 and ${MAX_MATRIX_STEPS}`)
  }
  const sourceRandom = createEpisodeRandomStream(evaluationCase.pairedSeed)
  const cursor: MigrationOracleCursor = { condition: 0, success: 0 }
  const random = {
    nextCondition: () => {
      cursor.condition += 1
      return sourceRandom.nextCondition()
    },
    nextSuccess: () => {
      cursor.success += 1
      return sourceRandom.nextSuccess()
    },
  }
  const actions: CraftActionId[] = []
  const steps: MigrationOracleStep[] = []
  let state = createInitialCraftState(scenario.recipe, evaluationCase.equipment.crafter)
  let stopReason: EpisodeStopReason | null = null
  let recommendationCalls = 0

  while (state.terminal === 'none' && actions.length < maxSteps) {
    const recommendation = recommendAction(
      scenario.recipe,
      evaluationCase.equipment.crafter,
      state,
      {
        mechanicsVersion: CRAFT_MECHANICS_VERSION,
        objective: scenario.objective,
        riskPreference: risk,
        policyCoverage: 'out-of-distribution',
        actualActionHistory: actions,
      },
    )
    recommendationCalls += 1
    if (recommendation === null) {
      stopReason = legalActions(scenario.recipe, evaluationCase.equipment.crafter, state).length === 0
        ? 'no-legal-action'
        : 'policy-null'
      break
    }
    const preview = previewAction(
      scenario.recipe,
      evaluationCase.equipment.crafter,
      state,
      recommendation.action,
    )
    if (!preview.legal) {
      stopReason = 'illegal-action'
      break
    }
    const cursorBefore = { ...cursor }
    const observed = drawSimulatedActionOutcome(
      preview,
      state,
      evaluationCase.conditionProfile,
      random,
    )
    const cursorAfter = { ...cursor }
    const before = state
    const transition = applyObservedOutcome(
      scenario.recipe,
      evaluationCase.equipment.crafter,
      state,
      recommendation.action,
      observed,
    )
    state = transition.nextState
    actions.push(recommendation.action)
    steps.push({
      before,
      action: recommendation.action,
      success: observed.success,
      nextCondition: observed.nextCondition,
      after: state,
      cursorBefore,
      cursorAfter,
      explanationCodes: transition.explanationCodes,
      memoryAfter: migrationOracleMemoryFingerprint(actions),
    })
    if (state.terminal !== 'none') {
      stopReason = state.terminal
      break
    }
    if (actions.length >= maxSteps) {
      stopReason = 'action-limit'
      break
    }
  }

  stopReason ??= state.terminal === 'completed'
    ? 'completed'
    : state.terminal === 'failed'
      ? 'failed'
      : actions.length >= maxSteps
        ? 'action-limit'
        : 'policy-null'
  return {
    caseId: evaluationCase.caseId,
    risk,
    terminal: state.terminal,
    stopReason,
    actions,
    finalState: state,
    finalCursor: { ...cursor },
    finalMemory: migrationOracleMemoryFingerprint(actions),
    recommendationCalls,
    steps,
  }
}

function runMatrixEpisode(
  evaluationCase: Readonly<MatrixCase>,
  arm: Readonly<MatrixArm>,
  includeTrace: boolean,
  maxSteps: number,
): MeasuredMatrixEpisodeRow {
  const scenario = cosmicExpertScenarioDataByRecipeId(evaluationCase.recipeId)
  if (scenario === null) throw new Error(`missing recipe ${evaluationCase.recipeId}`)
  const riskPreset = resolveRiskPreferencePreset(arm.risk)
  const objectivePolicy = resolveObjectivePolicy(scenario.recipe, {
    objective: scenario.objective,
    riskPreset,
  })
  const firstQualityTier = objectivePolicy.qualityUtilityKind === 'collectability-tiers'
    ? scenario.objective.qualityTiers[0]!.minimumQuality
    : null
  const recommendationDurationsMs: number[] = []
  const actualActionHistory: CraftActionId[] = []
  const decide = (state: CraftState) => {
    const startedAt = performance.now()
    const recommendation = recommendAction(scenario.recipe, evaluationCase.equipment.crafter, state, {
      mechanicsVersion: CRAFT_MECHANICS_VERSION,
      objective: scenario.objective,
      riskPreference: arm.risk,
      policyCoverage: 'out-of-distribution',
      actualActionHistory,
    })
    recommendationDurationsMs.push(performance.now() - startedAt)
    return recommendation?.action ?? null
  }
  const initialState = createInitialCraftState(scenario.recipe, evaluationCase.equipment.crafter)
  const firstAction = decide(initialState)
  const base = {
    arm: arm.id,
    risk: arm.risk,
    caseId: evaluationCase.caseId,
    caseFingerprint: evaluationCase.caseFingerprint,
    evaluationScenarioId: evaluationCase.evaluationScenarioId,
    objectiveUtilitySignature: evaluationCase.objectiveUtilitySignature,
    familyId: evaluationCase.family.familyId,
    recipeId: evaluationCase.recipeId,
    equipmentId: evaluationCase.equipment.id,
    worldId: evaluationCase.world.id,
    worldRole: evaluationCase.world.role,
    equipmentFingerprint: evaluationCase.equipmentFingerprint,
    conditionWorldFingerprint: evaluationCase.conditionWorldFingerprint,
    baseSeed: evaluationCase.baseSeed,
    maxSteps: evaluationCase.maxSteps,
    seedIndex: evaluationCase.seedIndex,
    pairedSeed: evaluationCase.pairedSeed,
    qualityMaximum: scenario.recipe.qualityMax,
    objectiveId: scenario.objective.objectiveId,
    qualityUtilityKind: objectivePolicy.qualityUtilityKind,
    protectedQualityFloor: objectivePolicy.protectedQualityFloor,
    qualityMilestones: objectivePolicy.qualityMilestones,
    hqChanceMilestones: objectivePolicy.hqChanceMilestones,
    protectedHqChanceFloorPercent: objectivePolicy.protectedHqChanceFloorPercent,
    firstQualityTier,
    progressRequired: scenario.recipe.progressRequired,
    requiredQuality: scenario.recipe.requiredQuality,
    completionContract: completionContractForRequiredQuality(scenario.recipe.requiredQuality),
  } as const

  if (firstAction === null) {
    const recommendationMs = recommendationDurationsMs.reduce((sum, value) => sum + value, 0)
    return {
      ...base,
      terminal: initialState.terminal,
      stopReason: 'policy-null',
      actions: 0,
      quality: 0,
      qualityRatio: 0,
      completedObjectiveUtility: 0,
      protectedQualityFloorReached: false,
      firstQualityTierReached: firstQualityTier === null ? null : false,
      qualityMaximumReached: false,
      recommendationCalls: recommendationDurationsMs.length,
      recommendationMs,
      recommendationMeanMs: recommendationMs / recommendationDurationsMs.length,
      recommendationMaxMs: recommendationDurationsMs.at(-1) ?? null,
      recommendationDurationsMs,
      progress: 0,
      durability: initialState.durability,
      cp: initialState.cp,
      specialistActionUses: specialistActionUses([]),
      ...emptySetupMetrics(),
    }
  }

  actualActionHistory.push(firstAction)
  const result = runEpisodeTrace({
    recipe: scenario.recipe,
    crafter: evaluationCase.equipment.crafter,
    initialState,
    firstAction,
    policy: (_recipe, _crafter, state) => {
      const action = decide(state)
      if (action !== null) actualActionHistory.push(action)
      return action
    },
    random: createEpisodeRandomStream(evaluationCase.pairedSeed),
    conditionProfile: evaluationCase.conditionProfile,
    maxSteps,
  })
  const validCompletion = result.terminal === 'completed'
  const recommendationMs = recommendationDurationsMs.reduce((sum, value) => sum + value, 0)
  const followups = setupFollowupMetrics(result.steps)
  return {
    ...base,
    terminal: result.terminal,
    stopReason: result.stopReason,
    actions: result.actions.length,
    quality: result.finalState.quality,
    qualityRatio: result.finalState.quality / scenario.recipe.qualityMax,
    // Fixed outcome scale. Risk-specific floors are reported separately and
    // are intentionally not folded into paired utility.
    completedObjectiveUtility: validCompletion
      ? objectiveOutcomeUtility(scenario.recipe, scenario.objective, result.finalState.quality)
      : 0,
    protectedQualityFloorReached: validCompletion
      && result.finalState.quality >= objectivePolicy.protectedQualityFloor,
    firstQualityTierReached: firstQualityTier === null
      ? null
      : validCompletion && result.finalState.quality >= firstQualityTier,
    qualityMaximumReached: validCompletion
      && result.finalState.quality >= scenario.recipe.qualityMax,
    recommendationCalls: recommendationDurationsMs.length,
    recommendationMs,
    recommendationMeanMs: recommendationMs / recommendationDurationsMs.length,
    recommendationMaxMs: recommendationDurationsMs.length === 0
      ? null
      : Math.max(...recommendationDurationsMs),
    recommendationDurationsMs,
    progress: result.finalState.progress,
    durability: result.finalState.durability,
    cp: result.finalState.cp,
    specialistActionUses: specialistActionUses(result.actions),
    ...followups,
    ...(includeTrace ? { trace: result.steps.map((step) => ({
      step: step.before.step,
      condition: step.before.condition,
      progress: step.before.progress,
      quality: step.before.quality,
      durability: step.before.durability,
      cp: step.before.cp,
      innerQuiet: step.before.innerQuiet,
      trainedPerfectionAvailable: step.before.trainedPerfectionAvailable,
      trainedPerfectionActive: step.before.trainedPerfectionActive,
      buffs: step.before.buffs,
      action: step.action,
      success: step.success,
      afterProgress: step.after.progress,
      afterQuality: step.after.quality,
      afterDurability: step.after.durability,
      afterCp: step.after.cp,
      afterInnerQuiet: step.after.innerQuiet,
    })) } : {}),
  }
}

export function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('percentile fraction must be between 0 and 1')
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!
}

export function distribution(values: readonly number[]): DistributionSummary {
  if (values.length === 0) {
    return {
      count: 0,
      minimum: null,
      p10: null,
      median: null,
      p90: null,
      p95: null,
      p99: null,
      maximum: null,
      mean: null,
    }
  }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    minimum: sorted[0]!,
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    maximum: sorted.at(-1)!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  }
}

function zeroStopReasons(): Record<EpisodeStopReason, number> {
  return Object.fromEntries(STOP_REASONS.map((reason) => [reason, 0])) as Record<EpisodeStopReason, number>
}

export function aggregateRows(
  key: string,
  arm: MatrixArmId,
  rows: readonly MeasuredMatrixEpisodeRow[],
): AggregateMetrics {
  const stopReasons = zeroStopReasons()
  for (const row of rows) stopReasons[row.stopReason] += 1
  const completed = rows.filter((row) => row.terminal === 'completed')
  const recommendationDurations = rows.flatMap((row) => row.recommendationDurationsMs)
  const specialistUses = Object.fromEntries(SPECIALIST_ACTIONS.map((action) => [
    action,
    rows.reduce((sum, row) => sum + row.specialistActionUses[action], 0),
  ])) as Record<(typeof SPECIALIST_ACTIONS)[number], number>
  const qualityTierCases = rows.filter((row) => row.firstQualityTier !== null)
  return {
    key,
    arm,
    episodes: rows.length,
    completed: completed.length,
    completionRate: rows.length === 0 ? 0 : completed.length / rows.length,
    qualityMaximumReached: rows.filter((row) => row.qualityMaximumReached).length,
    qualityMaximumRate: rows.length === 0
      ? 0
      : rows.filter((row) => row.qualityMaximumReached).length / rows.length,
    protectedQualityFloorReached: rows.filter((row) => row.protectedQualityFloorReached).length,
    protectedQualityFloorRate: rows.length === 0
      ? 0
      : rows.filter((row) => row.protectedQualityFloorReached).length / rows.length,
    qualityTierCases: qualityTierCases.length,
    firstQualityTierReached: qualityTierCases.filter((row) => row.firstQualityTierReached).length,
    stopReasons: Object.freeze(stopReasons),
    completedQualityRatio: distribution(completed.map((row) => row.qualityRatio)),
    allEpisodeObjectiveUtility: distribution(rows.map((row) => row.completedObjectiveUtility)),
    completedActions: distribution(completed.map((row) => row.actions)),
    recommendationCalls: recommendationDurations.length,
    recommendationLatencyMs: distribution(recommendationDurations),
    totalRecommendationMs: rows.reduce((sum, row) => sum + row.recommendationMs, 0),
    specialistActionUses: Object.freeze(specialistUses),
  }
}

function groupedAggregates(
  rows: readonly MeasuredMatrixEpisodeRow[],
  keyOf: (row: Readonly<MeasuredMatrixEpisodeRow>) => string,
): readonly AggregateMetrics[] {
  const groups = new Map<string, MeasuredMatrixEpisodeRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const values = groups.get(key) ?? []
    values.push(row)
    groups.set(key, values)
  }
  return [...groups.entries()].map(([key, values]) => aggregateRows(key, values[0]!.arm, values))
}

function compareBoolean(
  pairs: readonly { baseline: MatrixEpisodeRow; candidate: MatrixEpisodeRow }[],
  select: (row: Readonly<MatrixEpisodeRow>) => boolean,
) {
  let candidateOnly = 0
  let baselineOnly = 0
  let both = 0
  let neither = 0
  for (const pair of pairs) {
    const baseline = select(pair.baseline)
    const candidate = select(pair.candidate)
    if (candidate && !baseline) candidateOnly += 1
    else if (!candidate && baseline) baselineOnly += 1
    else if (candidate) both += 1
    else neither += 1
  }
  return Object.freeze({ candidateOnly, baselineOnly, both, neither })
}

function compareNumeric(
  pairs: readonly { baseline: MatrixEpisodeRow; candidate: MatrixEpisodeRow }[],
  select: (row: Readonly<MatrixEpisodeRow>) => number,
) {
  let candidateWins = 0
  let candidateLosses = 0
  let ties = 0
  let delta = 0
  for (const pair of pairs) {
    const difference = select(pair.candidate) - select(pair.baseline)
    delta += difference
    if (difference > 0) candidateWins += 1
    else if (difference < 0) candidateLosses += 1
    else ties += 1
  }
  return Object.freeze({
    candidateWins,
    candidateLosses,
    ties,
    meanCandidateDelta: pairs.length === 0 ? null : delta / pairs.length,
  })
}

export function comparePairedRows(
  key: string,
  rows: readonly MatrixEpisodeRow[],
): PairedComparison {
  const baseline = new Map(rows.filter((row) => row.arm === 'baseline').map((row) => [row.caseId, row]))
  const candidate = new Map(rows.filter((row) => row.arm === 'candidate').map((row) => [row.caseId, row]))
  if (baseline.size !== candidate.size) {
    throw new Error(`${key} baseline/candidate case count mismatch`)
  }
  const pairs = [...baseline.entries()].map(([caseId, baselineRow]) => {
    const candidateRow = candidate.get(caseId)
    if (candidateRow === undefined) throw new Error(`${key} candidate is missing ${caseId}`)
    return { baseline: baselineRow, candidate: candidateRow }
  })
  if ([...candidate.keys()].some((caseId) => !baseline.has(caseId))) {
    throw new Error(`${key} baseline is missing candidate cases`)
  }
  const baselineRisk = pairs[0]?.baseline.risk
  const candidateRisk = pairs[0]?.candidate.risk
  const protectedFloorComparable = baselineRisk === candidateRisk
  const bothCompleted = pairs.filter(
    (pair) => pair.baseline.terminal === 'completed' && pair.candidate.terminal === 'completed',
  )
  const qualityComparison = compareNumeric(bothCompleted, (row) => row.quality)
  const bothReachedMaximum = pairs.filter(
    (pair) => pair.baseline.qualityMaximumReached && pair.candidate.qualityMaximumReached,
  )
  let candidateShorter = 0
  let candidateLonger = 0
  let actionTies = 0
  let actionDelta = 0
  for (const pair of bothReachedMaximum) {
    const difference = pair.candidate.actions - pair.baseline.actions
    actionDelta += difference
    if (difference < 0) candidateShorter += 1
    else if (difference > 0) candidateLonger += 1
    else actionTies += 1
  }
  const completionRegressions = pairs
    .filter((pair) => pair.baseline.terminal === 'completed' && pair.candidate.terminal !== 'completed')
    .map((pair) => pair.baseline.caseId)
  const utility = compareNumeric(pairs, (row) => row.completedObjectiveUtility)
  return {
    key,
    pairs: pairs.length,
    protectedFloorComparable,
    completion: compareBoolean(pairs, (row) => row.terminal === 'completed'),
    qualityMaximum: compareBoolean(pairs, (row) => row.qualityMaximumReached),
    protectedFloor: protectedFloorComparable
      ? compareBoolean(pairs, (row) => row.protectedQualityFloorReached)
      : null,
    completedQuality: Object.freeze({
      candidateWins: qualityComparison.candidateWins,
      candidateLosses: qualityComparison.candidateLosses,
      ties: qualityComparison.ties,
      compared: bothCompleted.length,
      meanCandidateDelta: qualityComparison.meanCandidateDelta,
    }),
    objectiveUtility: Object.freeze({
      candidateWins: utility.candidateWins,
      candidateLosses: utility.candidateLosses,
      ties: utility.ties,
      meanCandidateDelta: utility.meanCandidateDelta ?? 0,
    }),
    qualityMaximumReachedActions: Object.freeze({
      candidateShorter,
      candidateLonger,
      ties: actionTies,
      compared: bothReachedMaximum.length,
      meanCandidateDelta: bothReachedMaximum.length === 0 ? null : actionDelta / bothReachedMaximum.length,
    }),
    completionRegressionCount: completionRegressions.length,
    completionRegressionCaseIds: Object.freeze(completionRegressions.slice(0, 50)),
  }
}

function empiricalBernsteinRadius(
  pairs: number,
  sampleVariance: number,
  perLookAlpha: number,
): number {
  if (pairs < 2) return 1
  const rangeWidth = 2
  const logTerm = Math.log(2 / perLookAlpha)
  return Math.min(
    1,
    Math.sqrt((2 * sampleVariance * logTerm) / pairs)
      + (7 * rangeWidth * logTerm) / (3 * (pairs - 1)),
  )
}

function estimatedPairsForRadius(
  currentPairs: number,
  sampleVariance: number,
  perLookAlpha: number,
  targetRadius: number,
): number | null {
  const initial = Math.max(2, currentPairs)
  if (empiricalBernsteinRadius(initial, sampleVariance, perLookAlpha) <= targetRadius) {
    return initial
  }
  const maximumEstimate = 100_000_000
  let upper = initial
  while (
    upper < maximumEstimate
    && empiricalBernsteinRadius(upper, sampleVariance, perLookAlpha) > targetRadius
  ) upper = Math.min(maximumEstimate, upper * 2)
  if (empiricalBernsteinRadius(upper, sampleVariance, perLookAlpha) > targetRadius) return null
  let lower = initial
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2)
    if (empiricalBernsteinRadius(middle, sampleVariance, perLookAlpha) <= targetRadius) upper = middle
    else lower = middle
  }
  return upper
}

/**
 * Fixed-look planning aid for bounded iteration. This does not estimate a
 * recipe/equipment theoretical optimum. It only tests whether the paired
 * candidate signal is materially positive, materially absent, or unresolved
 * within a predeclared maximum number of report inspections.
 */
export function decidePairedStopping(
  rows: readonly MatrixEpisodeRow[],
  options: Readonly<Pick<
    MatrixCliOptions,
    'minimumMaterialEffect' | 'lookIndex' | 'maxLooks'
  >>,
): StoppingDecision {
  const baseline = new Map(rows.filter((row) => row.arm === 'baseline').map((row) => [row.caseId, row]))
  const candidate = new Map(rows.filter((row) => row.arm === 'candidate').map((row) => [row.caseId, row]))
  if (baseline.size === 0 || candidate.size === 0) {
    throw new Error('stopping decision requires both baseline and candidate rows')
  }
  if (baseline.size !== candidate.size) throw new Error('stopping decision case count mismatch')
  const deltas: number[] = []
  const completionRegressionCaseIds: string[] = []
  for (const [caseId, baselineRow] of baseline) {
    const candidateRow = candidate.get(caseId)
    if (candidateRow === undefined) throw new Error(`stopping decision candidate is missing ${caseId}`)
    deltas.push(candidateRow.completedObjectiveUtility - baselineRow.completedObjectiveUtility)
    if (baselineRow.terminal === 'completed' && candidateRow.terminal !== 'completed') {
      completionRegressionCaseIds.push(caseId)
    }
  }
  const pairs = deltas.length
  const mean = deltas.reduce((sum, value) => sum + value, 0) / pairs
  const sampleVariance = pairs < 2
    ? 1
    : deltas.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (pairs - 1)
  const familywiseAlpha = 0.05
  const perLookAlpha = familywiseAlpha / options.maxLooks
  const radius = empiricalBernsteinRadius(pairs, sampleVariance, perLookAlpha)
  const lowerConfidenceBound = Math.max(-1, mean - radius)
  const upperConfidenceBound = Math.min(1, mean + radius)
  const material = options.minimumMaterialEffect

  let decision: StoppingDecision['decision']
  let reason: StoppingDecision['reason']
  if (completionRegressionCaseIds.length > 0) {
    decision = 'reject'
    reason = 'completion-regression-veto'
  } else if (upperConfidenceBound <= -material) {
    decision = 'reject'
    reason = 'material-negative-regression'
  } else if (lowerConfidenceBound >= material) {
    decision = 'keep'
    reason = 'candidate-lower-bound-clears-material-effect'
  } else if (lowerConfidenceBound > -material && upperConfidenceBound < material) {
    decision = 'stop-no-material-signal'
    reason = 'confidence-interval-contained-inside-immaterial-band'
  } else {
    decision = 'continue'
    reason = 'more-paired-data-needed'
  }

  const estimatedTotalPairs = estimatedPairsForRadius(
    pairs,
    sampleVariance,
    perLookAlpha,
    material,
  )
  const estimatedAdditionalPairs = estimatedTotalPairs === null
    ? null
    : Math.max(0, estimatedTotalPairs - pairs)
  const interpretation = decision === 'keep'
    ? 'Keep the candidate for the next gate: the lower confidence bound clears the predeclared material effect and no completion veto fired.'
    : decision === 'stop-no-material-signal'
      ? 'Stop this iteration: the whole confidence interval lies inside the predeclared immaterial band.'
      : decision === 'reject'
        ? 'Reject this candidate at this gate: a completion veto or materially negative bound fired.'
        : 'Continue only with the reported paired-data need or a stronger hypothesis; the current fixed look is unresolved.'
  return {
    method: 'fixed-look-bonferroni-empirical-bernstein-v1',
    decision,
    reason,
    pairs,
    pairedNormalizedObjectiveUtility: {
      meanCandidateDelta: mean,
      sampleVariance,
      lowerConfidenceBound,
      upperConfidenceBound,
      confidenceFamilywise: 1 - familywiseAlpha,
      perLookAlpha,
      lookIndex: options.lookIndex,
      maximumLooks: options.maxLooks,
      minimumMaterialEffect: material,
      boundedRange: Object.freeze([-1, 1] as const),
    },
    completionRegressionVeto: {
      triggered: completionRegressionCaseIds.length > 0,
      count: completionRegressionCaseIds.length,
      caseIds: Object.freeze(completionRegressionCaseIds.slice(0, 50)),
    },
    dataNeed: {
      estimatedTotalPairsForHalfWidthAtMostMinimumMaterialEffect: estimatedTotalPairs,
      estimatedAdditionalPairs,
      estimatedAdditionalEpisodes: estimatedAdditionalPairs === null
        ? null
        : estimatedAdditionalPairs * 2,
      exceedsHardMatrixEpisodeCap: estimatedTotalPairs === null
        ? null
        : estimatedTotalPairs * 2 > MAX_MATRIX_EPISODES,
      assumption: 'Planning estimate holds the observed paired-difference variance fixed; it is not a guarantee and does not prove the equipment ceiling.',
    },
    interpretation,
  }
}

function pairedGroups(
  rows: readonly MatrixEpisodeRow[],
  keyOf: (row: Readonly<MatrixEpisodeRow>) => string,
): readonly PairedComparison[] {
  const groups = new Map<string, MatrixEpisodeRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const values = groups.get(key) ?? []
    values.push(row)
    groups.set(key, values)
  }
  return [...groups.entries()].map(([key, values]) => comparePairedRows(key, values))
}

function publicRow(row: Readonly<MeasuredMatrixEpisodeRow>): MatrixEpisodeRow {
  const { recommendationDurationsMs: _durations, ...serializable } = row
  return serializable
}

function worstTailByArm(rows: readonly MeasuredMatrixEpisodeRow[]) {
  return (['baseline', 'candidate'] as const).flatMap((arm) => {
    const armRows = rows.filter((row) => row.arm === arm)
    if (armRows.length === 0) return []
    const plausible = armRows.filter((row) => row.worldRole === 'plausible')
    const sorted = [...plausible].sort((a, b) => (
      a.completedObjectiveUtility - b.completedObjectiveUtility
      || Number(a.terminal === 'completed') - Number(b.terminal === 'completed')
      || a.qualityRatio - b.qualityRatio
      || a.caseId.localeCompare(b.caseId)
    ))
    const tailCount = sorted.length === 0 ? 0 : Math.max(1, Math.ceil(sorted.length * 0.1))
    const tail = sorted.slice(0, tailCount)
    const plausibleCells = [...groupedAggregates(
      plausible,
      (row) => `${row.arm}|${row.evaluationScenarioId}|${row.equipmentId}|${row.worldId}`,
    )].sort((a, b) => (
      a.completionRate - b.completionRate
      || a.protectedQualityFloorRate - b.protectedQualityFloorRate
      || (a.allEpisodeObjectiveUtility.p10 ?? 0) - (b.allEpisodeObjectiveUtility.p10 ?? 0)
      || a.key.localeCompare(b.key)
    ))
    const cellTailCount = plausibleCells.length === 0
      ? 0
      : Math.max(1, Math.ceil(plausibleCells.length * 0.1))
    return [{
      arm,
      plausibleEpisodeCount: plausible.length,
      plausibleWorstDecile: {
        episodes: tail.length,
        completed: tail.filter((row) => row.terminal === 'completed').length,
        objectiveUtility: distribution(tail.map((row) => row.completedObjectiveUtility)),
        qualityRatio: distribution(tail.map((row) => row.qualityRatio)),
        exampleCaseIds: tail.slice(0, 50).map((row) => row.caseId),
      },
      worstPlausibleCells: plausibleCells.slice(0, cellTailCount),
      plausibleStress: aggregateRows(
        `${arm}|plausible-stress`,
        arm,
        armRows.filter((row) => row.worldRole === 'plausible-stress'),
      ),
      adversarial: aggregateRows(
        `${arm}|adversarial`,
        arm,
        armRows.filter((row) => row.worldRole === 'adversarial'),
      ),
    }]
  })
}

export function runGenericCosmicFamilyMatrix(
  plan: Readonly<MatrixPlan>,
  onProgress?: (completedEpisodes: number, totalEpisodes: number) => void,
) {
  const startedAt = performance.now()
  const rows: MeasuredMatrixEpisodeRow[] = []
  let completedEpisodes = 0
  for (const evaluationCase of plan.cases) {
    // Counterbalance warm/JIT ordering across paired cases. Latency remains a
    // development-machine measurement, not a paired product-quality metric.
    const orderedArms = evaluationCase.pairedSeed % 2 === 0
      ? plan.arms
      : [...plan.arms].reverse()
    for (const arm of orderedArms) {
      rows.push(runMatrixEpisode(
        evaluationCase,
        arm,
        plan.options.includeTrace,
        plan.options.maxSteps,
      ))
      completedEpisodes += 1
      onProgress?.(completedEpisodes, plan.budget.projectedEpisodes)
    }
  }
  const wallClockMs = performance.now() - startedAt
  const publicRows = rows.map(publicRow)
  const hasBaseline = plan.arms.some((arm) => arm.id === 'baseline')
  const report = {
    schemaVersion: GENERIC_FAMILY_MATRIX_SCHEMA_VERSION,
    matrixId: plan.matrixId,
    comparisonContract: plan.comparisonContract,
    catalogVersion: COSMIC_EXPERT_CATALOG_VERSION,
    mechanicsVersion: CRAFT_MECHANICS_VERSION,
    policyVersion: SOLVER_POLICY_VERSION,
    evidence: {
      level: 'development-assumption',
      statement: 'Assumed IID sensitivity worlds plus separately reported adversarial worlds; not a game success rate or promotion corpus.',
      commonRandomNumbers: 'baseline and candidate use the same pairedSeed per case',
      forcedTransitions: 'Good Omen and Robust forced transitions remain mechanics-owned',
      completionSemantics: {
        completed: 'Mechanics terminal completion. For progress-only recipes this means deliverable progress completion; for required-quality recipes both progress and requiredQuality must be satisfied.',
        qualityMaximumReached: 'Completed and reached recipe.qualityMax; never synonymous with mechanics completion.',
        deliveryFloorFailure: 'A progress-only recipe that did not complete progress. This is a generic policy floor failure, not an equipment-quality-ceiling result.',
      },
    },
    preset: plan.options.preset,
    mechanicsFamilyCount: plan.mechanicsFamilyCount,
    evaluationScenarioCount: plan.evaluationScenarioCount,
    evaluationScenarios: plan.evaluationScenarios.map((scenario) => ({
      evaluationScenarioId: scenario.evaluationScenarioId,
      familyId: scenario.family.familyId,
      representativeRecipeId: scenario.representativeRecipeId,
      recipeCount: scenario.recipeIds.length,
      objectiveUtilitySignature: scenario.objectiveUtilitySignature,
      objectiveUtilityIdentity: scenario.objectiveUtilityIdentity,
      objectiveTemplateEvidence: scenario.objectiveTemplateEvidence,
    })),
    arms: plan.arms,
    requestedRecipeId: plan.options.recipeId,
    equipmentProfiles: plan.options.equipmentIds.map((id) => {
      const profile = GENERIC_EVALUATION_EQUIPMENT_PROFILES.find(
        (candidate) => candidate.id === id,
      )!
      return {
        id: profile.id,
        label: profile.label,
        preparation: profile.preparation,
        specialistConsumableCost: profile.specialistConsumableCost,
        crafter: profile.crafter,
      }
    }),
    conditionWorlds: plan.options.worldIds.map((id) => CONDITION_WORLDS[id]),
    seed: {
      baseSeed: plan.options.baseSeed,
      seedCountPerCell: plan.options.seedCount,
      derivation: 'uint32(baseSeed XOR canonical(familyIndex,equipmentIndex,worldIndex,seedIndex))',
    },
    budget: {
      ...plan.budget,
      completedEpisodes,
      completedRecommendationCalls: rows.reduce((sum, row) => sum + row.recommendationCalls, 0),
      wallClockMs,
      bounded: completedEpisodes <= plan.budget.configuredEpisodeCap,
    },
    runtimeEnvironment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      latencyScope: 'in-process policy callback on this development machine; not target-device UI latency',
    },
    summaryByArm: (['baseline', 'candidate'] as const).flatMap((arm) => {
      const armRows = rows.filter((row) => row.arm === arm)
      return armRows.length === 0 ? [] : [aggregateRows(`${arm}|overall`, arm, armRows)]
    }),
    perFamily: groupedAggregates(rows, (row) => `${row.arm}|${row.familyId}`),
    perEvaluationScenario: groupedAggregates(
      rows,
      (row) => `${row.arm}|${row.evaluationScenarioId}`,
    ),
    perEquipment: groupedAggregates(rows, (row) => `${row.arm}|${row.equipmentId}`),
    perWorld: groupedAggregates(rows, (row) => `${row.arm}|${row.worldId}`),
    perCompletionContract: groupedAggregates(
      rows,
      (row) => `${row.arm}|${row.completionContract}`,
    ),
    perCompletionContractAndEquipment: groupedAggregates(
      rows,
      (row) => `${row.arm}|${row.completionContract}|${row.equipmentId}`,
    ),
    perCompletionContractAndWorld: groupedAggregates(
      rows,
      (row) => `${row.arm}|${row.completionContract}|${row.worldId}`,
    ),
    worstTailByArm: worstTailByArm(rows),
    comparisonKind: hasBaseline
      ? plan.arms[0]!.risk === plan.arms.at(-1)!.risk
        ? 'same-policy-determinism-check'
        : 'risk-preference-sensitivity'
      : 'candidate-only',
    pairedComparison: hasBaseline ? comparePairedRows('overall', publicRows) : null,
    // In-process arms call the same solver build. They can check determinism or
    // risk sensitivity, but are not a solver-version A/B and cannot drive the
    // bounded stopping rule. Use --baseline-report from a frozen earlier run.
    stoppingDecision: null,
    pairedByFamily: hasBaseline
      ? pairedGroups(publicRows, (row) => row.familyId)
      : [],
    pairedByEvaluationScenario: hasBaseline
      ? pairedGroups(publicRows, (row) => row.evaluationScenarioId)
      : [],
    pairedByEquipment: hasBaseline
      ? pairedGroups(publicRows, (row) => row.equipmentId)
      : [],
    routeFailures: publicRows.filter((row) => row.terminal !== 'completed'),
    deliveryFloorFailures: publicRows.filter(
      (row) => row.completionContract === 'progress-only' && row.terminal !== 'completed',
    ),
    comparisonRows: publicRows,
    ...(!plan.options.compactOutput ? {
      qualityMaximumMisses: publicRows.filter((row) => !row.qualityMaximumReached),
      rows: publicRows,
    } : {}),
  }
  return report
}

function reportRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function isUint32(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 0xffff_ffff
}

function isFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value)
}

function comparableContract(value: unknown, label: string): MatrixComparisonContract {
  if (value === undefined) {
    throw new Error(
      `${label}.comparisonContract is missing; legacy reports must be rerun with ${GENERIC_FAMILY_MATRIX_SCHEMA_VERSION}`,
    )
  }
  const contract = reportRecord(value, `${label}.comparisonContract`)
  if (
    contract.version !== GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION
    || !isUint32(contract.baseSeed)
    || typeof contract.maxStepsPerEpisode !== 'number'
    || !Number.isSafeInteger(contract.maxStepsPerEpisode)
    || contract.maxStepsPerEpisode <= 0
    || typeof contract.caseCount !== 'number'
    || !Number.isSafeInteger(contract.caseCount)
    || contract.caseCount <= 0
    || !isFingerprint(contract.caseSetFingerprint)
  ) {
    throw new Error(
      `${label}.comparisonContract is incompatible; rerun the baseline with ${GENERIC_FAMILY_MATRIX_SCHEMA_VERSION}`,
    )
  }
  return contract as unknown as MatrixComparisonContract
}

function comparableRows(value: unknown, label: string): readonly MatrixEpisodeRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}.comparisonRows must be a non-empty array`)
  }
  const rows = value.map((raw, index) => {
    const row = reportRecord(raw, `${label}.comparisonRows[${index}]`)
    if (
      !isUint32(row.baseSeed)
      || !isUint32(row.pairedSeed)
      || typeof row.maxSteps !== 'number'
      || !Number.isSafeInteger(row.maxSteps)
      || row.maxSteps <= 0
      || !isFingerprint(row.caseFingerprint)
      || !isFingerprint(row.equipmentFingerprint)
      || !isFingerprint(row.conditionWorldFingerprint)
    ) {
      throw new Error(
        `${label}.comparisonRows[${index}] is missing the v2 paired identity; rerun the baseline with ${GENERIC_FAMILY_MATRIX_SCHEMA_VERSION}`,
      )
    }
    if (
      row.arm !== 'baseline' && row.arm !== 'candidate'
      || typeof row.caseId !== 'string'
      || typeof row.risk !== 'string'
      || typeof row.completedObjectiveUtility !== 'number'
      || !Number.isFinite(row.completedObjectiveUtility)
      || row.completedObjectiveUtility < 0
      || row.completedObjectiveUtility > 1
      || typeof row.evaluationScenarioId !== 'string'
      || typeof row.objectiveUtilitySignature !== 'string'
      || typeof row.familyId !== 'string'
      || typeof row.recipeId !== 'number'
      || !Number.isSafeInteger(row.recipeId)
      || row.recipeId <= 0
      || typeof row.equipmentId !== 'string'
      || typeof row.worldId !== 'string'
      || typeof row.seedIndex !== 'number'
      || !Number.isSafeInteger(row.seedIndex)
      || row.seedIndex < 0
    ) {
      throw new Error(`${label}.comparisonRows[${index}] has an invalid comparison contract`)
    }
    if (row.pairedSeed !== pairedSeed(
      row.baseSeed,
      row.familyId,
      row.equipmentId,
      row.worldId as ConditionWorldId,
      row.seedIndex,
    )) {
      throw new Error(`${label}.comparisonRows[${index}] pairedSeed does not match the canonical schedule`)
    }
    const expectedCaseFingerprint = contentFingerprint({
      comparisonContractVersion: GENERIC_FAMILY_PAIRED_COMPARISON_CONTRACT_VERSION,
      evaluationScenarioId: row.evaluationScenarioId,
      objectiveUtilitySignature: row.objectiveUtilitySignature,
      recipeId: row.recipeId,
      equipmentId: row.equipmentId,
      equipmentFingerprint: row.equipmentFingerprint,
      worldId: row.worldId,
      conditionWorldFingerprint: row.conditionWorldFingerprint,
      baseSeed: row.baseSeed,
      seedIndex: row.seedIndex,
      maxSteps: row.maxSteps,
      pairedSeed: row.pairedSeed,
    })
    if (row.caseFingerprint !== expectedCaseFingerprint) {
      throw new Error(`${label}.comparisonRows[${index}] caseFingerprint does not match row identity`)
    }
    return row as unknown as MatrixEpisodeRow
  })
  const candidateRows = rows.filter((row) => row.arm === 'candidate')
  if (candidateRows.length === 0) throw new Error(`${label} contains no candidate arm rows`)
  if (new Set(candidateRows.map((row) => row.caseId)).size !== candidateRows.length) {
    throw new Error(`${label} candidate arm contains duplicate case IDs`)
  }
  return candidateRows
}

function assertRowsMatchComparisonContract(
  rows: readonly MatrixEpisodeRow[],
  contract: Readonly<MatrixComparisonContract>,
  label: string,
): void {
  if (rows.length !== contract.caseCount) {
    throw new Error(`${label}.comparisonContract caseCount does not match comparisonRows`)
  }
  for (const row of rows) {
    if (row.baseSeed !== contract.baseSeed) {
      throw new Error(`${label} row baseSeed does not match comparisonContract for ${row.caseId}`)
    }
    if (row.maxSteps !== contract.maxStepsPerEpisode) {
      throw new Error(`${label} row maxSteps does not match comparisonContract for ${row.caseId}`)
    }
  }
  const derivedCaseSetFingerprint = contentFingerprint(rows
    .map((row) => ({
      caseId: row.caseId,
      caseFingerprint: row.caseFingerprint,
      pairedSeed: row.pairedSeed,
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId)))
  if (derivedCaseSetFingerprint !== contract.caseSetFingerprint) {
    throw new Error(`${label}.comparisonContract caseSetFingerprint does not match comparisonRows`)
  }
}

/**
 * Attaches a previous frozen candidate-only report as the baseline for a
 * solver-version A/B. The evaluator schema/mechanics/catalog, complete paired
 * case identity, seed/config contract, and risk must match; policyVersion is
 * intentionally allowed to differ.
 */
export function attachExternalBaselineReport(
  currentValue: unknown,
  baselineValue: unknown,
  options: Readonly<Pick<
    MatrixCliOptions,
    'minimumMaterialEffect' | 'lookIndex' | 'maxLooks'
  >>,
): Record<string, unknown> {
  const current = reportRecord(currentValue, 'current report')
  const baseline = reportRecord(baselineValue, 'baseline report')
  if (current.schemaVersion !== GENERIC_FAMILY_MATRIX_SCHEMA_VERSION) {
    throw new Error(`current report must use ${GENERIC_FAMILY_MATRIX_SCHEMA_VERSION}`)
  }
  if (baseline.schemaVersion !== GENERIC_FAMILY_MATRIX_SCHEMA_VERSION) {
    throw new Error(
      `external baseline schemaVersion mismatch; rerun the baseline with ${GENERIC_FAMILY_MATRIX_SCHEMA_VERSION}`,
    )
  }
  for (const field of ['catalogVersion', 'mechanicsVersion'] as const) {
    if (current[field] !== baseline[field]) {
      throw new Error(`external baseline ${field} mismatch`)
    }
  }
  const currentContract = comparableContract(current.comparisonContract, 'current report')
  const baselineContract = comparableContract(baseline.comparisonContract, 'baseline report')
  for (const field of ['version', 'baseSeed', 'maxStepsPerEpisode', 'caseCount'] as const) {
    if (currentContract[field] !== baselineContract[field]) {
      throw new Error(`external baseline comparisonContract.${field} mismatch`)
    }
  }
  const currentRows = comparableRows(current.comparisonRows, 'current report')
  const baselineRows = comparableRows(baseline.comparisonRows, 'baseline report')
  assertRowsMatchComparisonContract(currentRows, currentContract, 'current report')
  assertRowsMatchComparisonContract(baselineRows, baselineContract, 'baseline report')
  const normalizedBaselineRows = baselineRows.map((row) => ({
    ...row,
    arm: 'baseline' as const,
  }))
  const currentRisk = new Set(currentRows.map((row) => row.risk))
  const baselineRisk = new Set(normalizedBaselineRows.map((row) => row.risk))
  if (
    currentRisk.size !== 1
    || baselineRisk.size !== 1
    || [...currentRisk][0] !== [...baselineRisk][0]
  ) {
    throw new Error('external solver-version A/B requires the same single risk preference')
  }
  const currentCaseIds = [...currentRows.map((row) => row.caseId)].sort()
  const baselineCaseIds = [...normalizedBaselineRows.map((row) => row.caseId)].sort()
  if (
    currentCaseIds.length !== baselineCaseIds.length
    || currentCaseIds.some((caseId, index) => caseId !== baselineCaseIds[index])
  ) {
    throw new Error('external baseline case IDs do not exactly match the current matrix')
  }
  const baselineByCaseId = new Map(normalizedBaselineRows.map((row) => [row.caseId, row]))
  for (const currentRow of currentRows) {
    const baselineRow = baselineByCaseId.get(currentRow.caseId)!
    for (const field of [
      'baseSeed',
      'pairedSeed',
      'maxSteps',
      'equipmentFingerprint',
      'conditionWorldFingerprint',
      'caseFingerprint',
    ] as const) {
      if (currentRow[field] !== baselineRow[field]) {
        throw new Error(`external baseline ${field} mismatch for ${currentRow.caseId}`)
      }
    }
  }
  if (currentContract.caseSetFingerprint !== baselineContract.caseSetFingerprint) {
    throw new Error('external baseline comparisonContract.caseSetFingerprint mismatch')
  }
  const pairedRows = [...normalizedBaselineRows, ...currentRows]
  return {
    ...current,
    comparisonKind: 'solver-version-ab',
    externalBaseline: {
      matrixId: baseline.matrixId,
      policyVersion: baseline.policyVersion,
      candidatePolicyVersion: current.policyVersion,
      risk: [...currentRisk][0],
      exactCaseIdentityMatch: true,
      comparisonContractVersion: currentContract.version,
      baseSeed: currentContract.baseSeed,
      caseSetFingerprint: currentContract.caseSetFingerprint,
    },
    pairedComparison: comparePairedRows('overall', pairedRows),
    stoppingDecision: decidePairedStopping(pairedRows, options),
    pairedByFamily: pairedGroups(pairedRows, (row) => row.familyId),
    pairedByEvaluationScenario: pairedGroups(
      pairedRows,
      (row) => row.evaluationScenarioId,
    ),
    pairedByEquipment: pairedGroups(pairedRows, (row) => row.equipmentId),
  }
}
