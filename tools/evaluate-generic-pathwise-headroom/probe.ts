import {
  COSMIC_EXPERT_CATALOG_VERSION,
  PLAYER_EQUIPMENT_PROFILES,
  cosmicExpertScenarioDataByRecipeId,
  playerEquipmentProfileById,
  type PlayerEquipmentProfile,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_MECHANICS_VERSION,
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
  FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION,
  assessPathwiseCapabilityHeadroom,
  replayFixedTapeRoute,
  searchFixedTapeClairvoyantRoute,
} from '@frozen-rabbit-expert/policy-lab'
import {
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodeRandomStream,
  type EpisodeStopReason,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  RISK_PREFERENCES,
  SOLVER_POLICY_VERSION,
  recommendAction,
  type RiskPreference,
} from '@frozen-rabbit-expert/solver'

export const GENERIC_PATHWISE_HEADROOM_REPORT_VERSION
  = 'generic-cosmic-pathwise-headroom-probe-v1'
export const DEFAULT_PATHWISE_RECIPE_ID = 36_990
export const DEFAULT_PATHWISE_EQUIPMENT_ID = 'player-food-medicine-cosmic-tool-v1'
export const DEFAULT_PATHWISE_WORLD_ID = 'normal-heavy-iid'
export const DEFAULT_PATHWISE_SEED = 2_888_097_536
export const DEFAULT_PATHWISE_BEAM_WIDTH = 2_048
export const DEFAULT_PATHWISE_MAX_ACTIONS = 45
export const MAX_PATHWISE_CASES = 1
export const MAX_PATHWISE_BEAM_WIDTH = 8_192
export const MAX_PATHWISE_ACTIONS = 60
export const MAX_PATHWISE_BEAM_DEPTH_PRODUCT = 245_760

const EQUIPMENT_ALIASES = Object.freeze({
  unbuffed: 'player-unbuffed-cosmic-tool-v1',
  buffed: 'player-food-medicine-cosmic-tool-v1',
  specialist: 'player-food-medicine-specialist-cosmic-tool-v1',
})

export const PATHWISE_CONDITION_WORLDS = Object.freeze({
  'balanced-iid': Object.freeze({ normal: 1, other: 1 }),
  'normal-heavy-iid': Object.freeze({ normal: 6, other: 1 }),
  'opportunity-scarce-iid': Object.freeze({ normal: 12, other: 0.35 }),
  'all-normal': Object.freeze({ normal: 1, other: 0 }),
})

export type PathwiseConditionWorldId = keyof typeof PATHWISE_CONDITION_WORLDS

export interface PathwiseHeadroomCliOptions {
  recipeId: number
  equipmentId: string
  worldId: PathwiseConditionWorldId
  seed: number
  beamWidth: number
  maxActions: number
  riskPreference: RiskPreference
  outputPath: string | null
}

export interface CausalBaselineResult {
  evidence: 'causal-policy-on-fixed-rng-tape'
  policyVersion: typeof SOLVER_POLICY_VERSION
  riskPreference: RiskPreference
  stopReason: EpisodeStopReason
  terminal: CraftState['terminal']
  actionCount: number
  actions: readonly CraftActionId[]
  finalState: CraftState
  objectiveTargetReached: boolean
  objectiveUtility: number
  successDrawsConsumed: number
  conditionDrawsConsumed: number
  fixedTapeReplayVerified: boolean
  trace: readonly Readonly<{
    step: number
    condition: MaterialCondition
    action: CraftActionId
    success: boolean
    nextCondition: MaterialCondition
  }>[]
}

export interface GenericPathwiseHeadroomReport {
  schemaVersion: typeof GENERIC_PATHWISE_HEADROOM_REPORT_VERSION
  catalogVersion: typeof COSMIC_EXPERT_CATALOG_VERSION
  mechanicsVersion: typeof CRAFT_MECHANICS_VERSION
  solverPolicyVersion: typeof SOLVER_POLICY_VERSION
  searchVersion: typeof FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION
  assessmentVersion: typeof CAPABILITY_HEADROOM_ASSESSMENT_VERSION
  evidence: 'single-case-clairvoyant-fixed-tape-headroom-probe-not-causal-policy'
  interpretation: readonly string[]
  scope: Readonly<{
    caseCount: 1
    hardCaseCap: typeof MAX_PATHWISE_CASES
    recipeId: number
    recipeName: string
    objectiveId: string
    qualityTarget: number
    equipmentId: string
    worldId: PathwiseConditionWorldId
    worldEvidence: 'assumption'
    seed: number
    riskPreference: RiskPreference
  }>
  budget: Readonly<{
    beamWidth: number
    hardBeamWidthCap: typeof MAX_PATHWISE_BEAM_WIDTH
    maxActions: number
    hardActionCap: typeof MAX_PATHWISE_ACTIONS
    beamDepthProduct: number
    hardBeamDepthProductCap: typeof MAX_PATHWISE_BEAM_DEPTH_PRODUCT
  }>
  conditionProfile: Readonly<WeightedConditionProfile>
  baseline: Readonly<CausalBaselineResult>
  clairvoyantReference: ReturnType<typeof searchFixedTapeClairvoyantRoute>
  witnessReplayVerified: boolean | null
  assessment: ReturnType<typeof assessPathwiseCapabilityHeadroom>
}

function optionValues(args: readonly string[], name: string): string[] {
  const values: string[] = []
  const inlinePrefix = `--${name}=`
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument.startsWith(inlinePrefix)) {
      values.push(argument.slice(inlinePrefix.length))
      continue
    }
    if (argument !== `--${name}`) continue
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--${name} requires a value`)
    }
    values.push(value)
    index += 1
  }
  if (values.length > 1) throw new Error(`--${name} may be supplied only once`)
  return values
}

function optionValue(args: readonly string[], name: string): string | null {
  return optionValues(args, name)[0] ?? null
}

function positiveInteger(value: string | null, fallback: number, name: string): number {
  if (value === null) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError(`--${name} must be a positive safe integer`)
  }
  return parsed
}

function uint32(value: string | null, fallback: number, name: string): number {
  if (value === null) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) {
    throw new RangeError(`--${name} must be an unsigned 32-bit integer`)
  }
  return parsed
}

function resolveEquipmentId(value: string | null): string {
  if (value === null) return DEFAULT_PATHWISE_EQUIPMENT_ID
  return EQUIPMENT_ALIASES[value as keyof typeof EQUIPMENT_ALIASES] ?? value
}

function parseWorldId(value: string | null): PathwiseConditionWorldId {
  const worldId = value ?? DEFAULT_PATHWISE_WORLD_ID
  if (!(worldId in PATHWISE_CONDITION_WORLDS)) {
    throw new Error(
      `unknown world ${worldId}; expected ${Object.keys(PATHWISE_CONDITION_WORLDS).join(', ')}`,
    )
  }
  return worldId as PathwiseConditionWorldId
}

function parseRiskPreference(value: string | null): RiskPreference {
  const risk = value ?? 'balanced'
  if (!RISK_PREFERENCES.includes(risk as RiskPreference)) {
    throw new Error(`unknown risk ${risk}; expected ${RISK_PREFERENCES.join(', ')}`)
  }
  return risk as RiskPreference
}

export function parsePathwiseHeadroomCliOptions(
  args: readonly string[],
): PathwiseHeadroomCliOptions {
  const known = new Set([
    'recipe', 'equipment', 'world', 'seed', 'beam-width', 'max-actions', 'risk', 'output',
  ])
  for (const argument of args) {
    if (!argument.startsWith('--')) continue
    const name = argument.slice(2).split('=', 1)[0]!
    if (!known.has(name)) throw new Error(`unknown option --${name}`)
  }

  const beamWidth = positiveInteger(
    optionValue(args, 'beam-width'),
    DEFAULT_PATHWISE_BEAM_WIDTH,
    'beam-width',
  )
  if (beamWidth > MAX_PATHWISE_BEAM_WIDTH) {
    throw new RangeError(`--beam-width may not exceed ${MAX_PATHWISE_BEAM_WIDTH}`)
  }
  const maxActions = positiveInteger(
    optionValue(args, 'max-actions'),
    DEFAULT_PATHWISE_MAX_ACTIONS,
    'max-actions',
  )
  if (maxActions > MAX_PATHWISE_ACTIONS) {
    throw new RangeError(`--max-actions may not exceed ${MAX_PATHWISE_ACTIONS}`)
  }
  if (beamWidth * maxActions > MAX_PATHWISE_BEAM_DEPTH_PRODUCT) {
    throw new RangeError(
      `beam-width × max-actions may not exceed ${MAX_PATHWISE_BEAM_DEPTH_PRODUCT}`,
    )
  }
  const outputPath = optionValue(args, 'output')
  if (outputPath !== null && outputPath.trim().length === 0) {
    throw new Error('--output must not be empty')
  }

  return {
    recipeId: positiveInteger(
      optionValue(args, 'recipe'),
      DEFAULT_PATHWISE_RECIPE_ID,
      'recipe',
    ),
    equipmentId: resolveEquipmentId(optionValue(args, 'equipment')),
    worldId: parseWorldId(optionValue(args, 'world')),
    seed: uint32(optionValue(args, 'seed'), DEFAULT_PATHWISE_SEED, 'seed'),
    beamWidth,
    maxActions,
    riskPreference: parseRiskPreference(optionValue(args, 'risk')),
    outputPath,
  }
}

function resolveEquipment(id: string): Readonly<PlayerEquipmentProfile> {
  const equipment = playerEquipmentProfileById(id)
  if (equipment !== null) return equipment
  throw new Error([
    `unknown equipment ${id}`,
    `expected one of ${PLAYER_EQUIPMENT_PROFILES.map((profile) => profile.id).join(', ')}`,
    `or aliases ${Object.keys(EQUIPMENT_ALIASES).join(', ')}`,
  ].join('; '))
}

function createConditionProfile(
  worldId: PathwiseConditionWorldId,
  randomConditions: readonly MaterialCondition[],
): Readonly<WeightedConditionProfile> {
  const world = PATHWISE_CONDITION_WORLDS[worldId]
  return Object.freeze({
    id: `generic-pathwise-${worldId}-${randomConditions.join('-')}-v1`,
    evidence: 'assumption',
    weights: Object.freeze(Object.fromEntries(randomConditions.map((condition) => [
      condition,
      condition === 'normal' ? world.normal : world.other,
    ]))),
  })
}

function stateMatches(left: Readonly<CraftState>, right: Readonly<CraftState>): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function completedObjectiveUtility(
  state: Readonly<CraftState>,
  qualityTarget: number,
): number {
  return state.terminal === 'completed'
    ? Math.max(0, Math.min(1, state.quality / qualityTarget))
    : 0
}

function baselineFromEpisode(
  result: Readonly<EpisodeTraceResult>,
  qualityTarget: number,
  riskPreference: RiskPreference,
  successDrawsConsumed: number,
  conditionDrawsConsumed: number,
  fixedTapeReplayVerified: boolean,
): CausalBaselineResult {
  return {
    evidence: 'causal-policy-on-fixed-rng-tape',
    policyVersion: SOLVER_POLICY_VERSION,
    riskPreference,
    stopReason: result.stopReason,
    terminal: result.terminal,
    actionCount: result.actions.length,
    actions: result.actions,
    finalState: result.finalState,
    objectiveTargetReached: result.terminal === 'completed'
      && result.finalState.quality >= qualityTarget,
    objectiveUtility: completedObjectiveUtility(result.finalState, qualityTarget),
    successDrawsConsumed,
    conditionDrawsConsumed,
    fixedTapeReplayVerified,
    trace: result.steps.map((step) => ({
      step: step.before.step,
      condition: step.before.condition,
      action: step.action,
      success: step.success,
      nextCondition: step.nextCondition,
    })),
  }
}

function runCausalBaseline(
  recipe: Parameters<typeof recommendAction>[0],
  objective: NonNullable<Parameters<typeof recommendAction>[3]['objective']>,
  crafter: Parameters<typeof recommendAction>[1],
  conditionProfile: Readonly<WeightedConditionProfile>,
  options: Readonly<PathwiseHeadroomCliOptions>,
): {
  result: EpisodeTraceResult
  successDrawsConsumed: number
  conditionDrawsConsumed: number
} {
  const initialState = createInitialCraftState(recipe, crafter)
  const actualActionHistory: CraftActionId[] = []
  const decide = (state: CraftState): CraftActionId | null => recommendAction(
    recipe,
    crafter,
    state,
    {
      mechanicsVersion: CRAFT_MECHANICS_VERSION,
      objective,
      riskPreference: options.riskPreference,
      policyCoverage: 'out-of-distribution',
      actualActionHistory,
    },
  )?.action ?? null
  const firstAction = decide(initialState)
  if (firstAction === null) {
    return {
      result: {
        terminal: initialState.terminal,
        finalState: initialState,
        actions: [],
        stoppedByLimit: false,
        stopReason: legalActions(recipe, crafter, initialState).length === 0
          ? 'no-legal-action'
          : 'policy-null',
        steps: [],
      },
      successDrawsConsumed: 0,
      conditionDrawsConsumed: 0,
    }
  }
  const random = createEpisodeRandomStream(options.seed)
  let successDrawsConsumed = 0
  let conditionDrawsConsumed = 0
  const countedRandom: EpisodeRandomStream = {
    nextSuccess: () => {
      successDrawsConsumed += 1
      return random.nextSuccess()
    },
    nextCondition: () => {
      conditionDrawsConsumed += 1
      return random.nextCondition()
    },
  }
  actualActionHistory.push(firstAction)
  const result = runEpisodeTrace({
    recipe,
    crafter,
    initialState,
    firstAction,
    policy: (_recipe, _crafter, state) => {
      const action = decide(state)
      if (action !== null) actualActionHistory.push(action)
      return action
    },
    random: countedRandom,
    conditionProfile,
    maxSteps: options.maxActions,
  })
  return { result, successDrawsConsumed, conditionDrawsConsumed }
}

export function evaluateGenericPathwiseHeadroom(
  options: Readonly<PathwiseHeadroomCliOptions>,
): GenericPathwiseHeadroomReport {
  const scenario = cosmicExpertScenarioDataByRecipeId(options.recipeId)
  if (scenario === null) throw new Error(`unknown Cosmic expert recipe ${options.recipeId}`)
  const equipment = resolveEquipment(options.equipmentId)
  const conditionProfile = createConditionProfile(
    options.worldId,
    scenario.recipe.randomConditions ?? scenario.recipe.availableConditions,
  )
  const context = {
    recipe: scenario.recipe,
    objective: scenario.objective,
    crafter: equipment.crafter,
  }
  const initialState = createInitialCraftState(context.recipe, context.crafter)
  const causalRun = runCausalBaseline(
    context.recipe,
    context.objective,
    context.crafter,
    conditionProfile,
    options,
  )
  const causalReplay = replayFixedTapeRoute(
    context,
    initialState,
    conditionProfile,
    options.seed,
    causalRun.result.actions,
  )
  if (
    !stateMatches(causalRun.result.finalState, causalReplay.finalState)
    || causalRun.successDrawsConsumed !== causalReplay.successDrawsConsumed
    || causalRun.conditionDrawsConsumed !== causalReplay.conditionDrawsConsumed
  ) {
    throw new Error('causal baseline replay diverged from the fixed RNG tape')
  }
  const baseline = baselineFromEpisode(
    causalRun.result,
    context.objective.qualityTarget,
    options.riskPreference,
    causalRun.successDrawsConsumed,
    causalRun.conditionDrawsConsumed,
    true,
  )
  const clairvoyantReference = searchFixedTapeClairvoyantRoute(
    context,
    initialState,
    {
      conditionProfile,
      seed: options.seed,
      beamWidth: options.beamWidth,
      maxActions: options.maxActions,
      incumbentActions: baseline.actions,
    },
  )
  const witnessReplayVerified = clairvoyantReference.witness === null
    ? null
    : (() => {
        const replay = replayFixedTapeRoute(
          context,
          initialState,
          conditionProfile,
          options.seed,
          clairvoyantReference.witness.actions,
        )
        if (
          !stateMatches(clairvoyantReference.witness.finalState, replay.finalState)
          || clairvoyantReference.witness.successDrawsConsumed !== replay.successDrawsConsumed
          || clairvoyantReference.witness.conditionDrawsConsumed !== replay.conditionDrawsConsumed
        ) {
          throw new Error('clairvoyant witness replay diverged from the fixed RNG tape')
        }
        return true
      })()
  const assessment = assessPathwiseCapabilityHeadroom(
    {
      terminal: baseline.terminal,
      quality: baseline.finalState.quality,
    },
    context.objective.qualityTarget,
    clairvoyantReference,
  )

  return {
    schemaVersion: GENERIC_PATHWISE_HEADROOM_REPORT_VERSION,
    catalogVersion: COSMIC_EXPERT_CATALOG_VERSION,
    mechanicsVersion: CRAFT_MECHANICS_VERSION,
    solverPolicyVersion: SOLVER_POLICY_VERSION,
    searchVersion: FIXED_TAPE_CLAIRVOYANT_SEARCH_VERSION,
    assessmentVersion: CAPABILITY_HEADROOM_ASSESSMENT_VERSION,
    evidence: 'single-case-clairvoyant-fixed-tape-headroom-probe-not-causal-policy',
    interpretation: Object.freeze([
      'The causal baseline and search use the same independent success and condition RNG tape.',
      'The search can inspect that future tape, so its witness is clairvoyant and not a causal policy.',
      'A witness proves route existence only for this recipe, equipment, initial state, tape, and action horizon.',
      'A truncated frontier cannot establish an equipment limit or absence of headroom.',
    ]),
    scope: {
      caseCount: 1,
      hardCaseCap: MAX_PATHWISE_CASES,
      recipeId: options.recipeId,
      recipeName: scenario.recipe.displayName,
      objectiveId: scenario.objective.objectiveId,
      qualityTarget: scenario.objective.qualityTarget,
      equipmentId: equipment.id,
      worldId: options.worldId,
      worldEvidence: 'assumption',
      seed: options.seed,
      riskPreference: options.riskPreference,
    },
    budget: {
      beamWidth: options.beamWidth,
      hardBeamWidthCap: MAX_PATHWISE_BEAM_WIDTH,
      maxActions: options.maxActions,
      hardActionCap: MAX_PATHWISE_ACTIONS,
      beamDepthProduct: options.beamWidth * options.maxActions,
      hardBeamDepthProductCap: MAX_PATHWISE_BEAM_DEPTH_PRODUCT,
    },
    conditionProfile,
    baseline,
    clairvoyantReference,
    witnessReplayVerified,
    assessment,
  }
}

export function runGenericPathwiseHeadroom(
  args: readonly string[],
): GenericPathwiseHeadroomReport {
  return evaluateGenericPathwiseHeadroom(parsePathwiseHeadroomCliOptions(args))
}
