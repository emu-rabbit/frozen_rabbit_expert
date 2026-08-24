import { performance } from 'node:perf_hooks'
import {
  COSMIC_EXPERT_CATALOG_VERSION,
  COSMIC_EXPERT_MECHANICS_FAMILIES,
  GENERIC_EVALUATION_EQUIPMENT_PROFILES,
  cosmicExpertScenarioDataByRecipeId,
  type CosmicExpertMechanicsFamily,
  type EvaluationEquipmentProfile,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_MECHANICS_VERSION,
  createInitialCraftState,
  recipeCrafterMechanicsSignatureKey,
} from '@frozen-rabbit-expert/domain'
import {
  OPTIMISTIC_GAIN_BOUND_VERSION,
  calculateOptimisticGainBound,
} from '@frozen-rabbit-expert/policy-lab'

export const GENERIC_CAPABILITY_BOUND_REPORT_VERSION
  = 'generic-cosmic-capability-action-gain-bound-v1'
export const DEFAULT_CAPABILITY_BOUND_HORIZON = 80
export const MAX_CAPABILITY_BOUND_HORIZON = 200
export const DEFAULT_CAPABILITY_BOUND_BUDGET_MS = 30_000
export const MAX_CAPABILITY_BOUND_BUDGET_MS = 300_000
export const MAX_CAPABILITY_BOUND_CELLS = 500
export const MAX_PROJECTED_PROGRESS_STATE_SCANS = 310_000_000

const EQUIPMENT_ALIASES = Object.freeze({
  unbuffed: 'player-unbuffed-cosmic-tool-v1',
  buffed: 'player-food-medicine-cosmic-tool-v1',
  specialist: 'player-food-medicine-specialist-cosmic-tool-v1',
})

export interface CapabilityBoundCliOptions {
  recipeId: number | null
  equipmentId: string | null
  horizon: number
  budgetMs: number
  outputPath: string | null
}

export interface CapabilityBoundCase {
  caseId: string
  family: Readonly<CosmicExpertMechanicsFamily>
  recipeId: number
  equipment: Readonly<EvaluationEquipmentProfile>
}

export interface CapabilityBoundPlan {
  options: Readonly<CapabilityBoundCliOptions>
  cases: readonly Readonly<CapabilityBoundCase>[]
  selectedFamilyCount: number
  selectedEquipmentCount: number
  budget: Readonly<{
    configuredMs: number
    hardMaximumMs: number
    hardCellCap: number
    projectedCells: number
    hardProgressStateScanCap: number
    projectedProgressStateScans: number
  }>
}

export interface CapabilityBoundCell {
  caseId: string
  familyId: string
  familyRecipeCount: number
  representativeRecipeId: number
  recipeId: number
  recipeName: string
  equipmentId: string
  equipmentLabel: string
  crafter: Readonly<EvaluationEquipmentProfile['crafter']>
  crafterMechanicsSignature: string
  objectiveId: string
  objectiveMode: string
  objectiveSourceConfidence: string
  objectiveTarget: number
  qualityMaximum: number
  progressRequired: number
  horizon: number
  maximumQualityUpperBound: number | null
  completionPossibleUnderRelaxation: boolean
  targetProvablyImpossible: boolean
  inconclusive: boolean
  conclusion:
    | 'target-provably-impossible-within-horizon-under-action-gain-relaxation'
    | 'inconclusive-upper-bound-does-not-prove-achievability'
}

export interface GenericCapabilityBoundReport {
  schemaVersion: typeof GENERIC_CAPABILITY_BOUND_REPORT_VERSION
  catalogVersion: typeof COSMIC_EXPERT_CATALOG_VERSION
  mechanicsVersion: typeof CRAFT_MECHANICS_VERSION
  boundVersion: typeof OPTIMISTIC_GAIN_BOUND_VERSION
  evidence: 'negative-only-action-gain-mechanics-relaxation-not-causal-policy-bound'
  interpretation: string
  scope: Readonly<{
    recipeId: number | null
    equipmentId: string | null
    horizon: number
    familyRepresentativesOnly: boolean
  }>
  budget: CapabilityBoundPlan['budget']
  relaxation: readonly string[]
  summary: Readonly<{
    evaluatedCells: number
    evaluatedFamilies: number
    evaluatedEquipmentProfiles: number
    targetProvablyImpossible: number
    inconclusive: number
    completionImpossibleUnderRelaxation: number
  }>
  cells: readonly Readonly<CapabilityBoundCell>[]
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

function resolveEquipmentId(value: string | null): string | null {
  if (value === null) return null
  return EQUIPMENT_ALIASES[value as keyof typeof EQUIPMENT_ALIASES] ?? value
}

export function parseCapabilityBoundCliOptions(
  args: readonly string[],
): CapabilityBoundCliOptions {
  const known = new Set(['recipe', 'equipment', 'horizon', 'budget-ms', 'output'])
  for (const argument of args) {
    if (!argument.startsWith('--')) continue
    const name = argument.slice(2).split('=', 1)[0]!
    if (!known.has(name)) throw new Error(`unknown option --${name}`)
  }

  const recipeValue = optionValue(args, 'recipe')
  const recipeId = recipeValue === null ? null : positiveInteger(recipeValue, 0, 'recipe')
  const horizon = positiveInteger(
    optionValue(args, 'horizon'),
    DEFAULT_CAPABILITY_BOUND_HORIZON,
    'horizon',
  )
  if (horizon > MAX_CAPABILITY_BOUND_HORIZON) {
    throw new RangeError(`--horizon may not exceed ${MAX_CAPABILITY_BOUND_HORIZON}`)
  }
  const budgetMs = positiveInteger(
    optionValue(args, 'budget-ms'),
    DEFAULT_CAPABILITY_BOUND_BUDGET_MS,
    'budget-ms',
  )
  if (budgetMs > MAX_CAPABILITY_BOUND_BUDGET_MS) {
    throw new RangeError(`--budget-ms may not exceed ${MAX_CAPABILITY_BOUND_BUDGET_MS}`)
  }
  const outputPath = optionValue(args, 'output')
  if (outputPath !== null && outputPath.trim().length === 0) {
    throw new Error('--output must not be empty')
  }
  return {
    recipeId,
    equipmentId: resolveEquipmentId(optionValue(args, 'equipment')),
    horizon,
    budgetMs,
    outputPath,
  }
}

function selectedFamiliesAndRecipes(
  recipeId: number | null,
): Array<{ family: Readonly<CosmicExpertMechanicsFamily>; recipeId: number }> {
  if (recipeId === null) {
    return COSMIC_EXPERT_MECHANICS_FAMILIES.map((family) => ({
      family,
      recipeId: family.representativeRecipeId,
    }))
  }
  const scenario = cosmicExpertScenarioDataByRecipeId(recipeId)
  if (scenario === null) throw new Error(`unknown Cosmic expert recipe ${recipeId}`)
  const family = COSMIC_EXPERT_MECHANICS_FAMILIES.find(
    (candidate) => candidate.recipeIds.includes(recipeId),
  )
  if (family === undefined) throw new Error(`recipe ${recipeId} has no mechanics family`)
  return [{ family, recipeId }]
}

function selectedEquipment(equipmentId: string | null): readonly EvaluationEquipmentProfile[] {
  if (equipmentId === null) return GENERIC_EVALUATION_EQUIPMENT_PROFILES
  const equipment = GENERIC_EVALUATION_EQUIPMENT_PROFILES.find(
    (candidate) => candidate.id === equipmentId,
  )
  if (equipment === undefined) {
    throw new Error([
      `unknown equipment ${equipmentId}`,
      `expected one of ${GENERIC_EVALUATION_EQUIPMENT_PROFILES.map((profile) => profile.id).join(', ')}`,
      `or aliases ${Object.keys(EQUIPMENT_ALIASES).join(', ')}`,
    ].join('; '))
  }
  return [equipment]
}

export function buildCapabilityBoundPlan(
  options: Readonly<CapabilityBoundCliOptions>,
): CapabilityBoundPlan {
  const selected = selectedFamiliesAndRecipes(options.recipeId)
  const equipment = selectedEquipment(options.equipmentId)
  const cases = selected.flatMap(({ family, recipeId }) => equipment.map((profile) => ({
    caseId: `${family.familyId}:recipe-${recipeId}:${profile.id}:h${options.horizon}`,
    family,
    recipeId,
    equipment: profile,
  })))
  if (cases.length > MAX_CAPABILITY_BOUND_CELLS) {
    throw new RangeError(
      `capability-bound plan projects ${cases.length} cells, exceeding hard cap ${MAX_CAPABILITY_BOUND_CELLS}`,
    )
  }
  const projectedProgressStateScans = cases.reduce((total, entry) => {
    const scenario = cosmicExpertScenarioDataByRecipeId(entry.recipeId)
    if (scenario === null) throw new Error(`missing catalog recipe ${entry.recipeId}`)
    return total + options.horizon * (scenario.recipe.progressRequired + 1)
  }, 0)
  if (projectedProgressStateScans > MAX_PROJECTED_PROGRESS_STATE_SCANS) {
    throw new RangeError(
      `capability-bound plan projects ${projectedProgressStateScans} progress-state scans, exceeding hard cap ${MAX_PROJECTED_PROGRESS_STATE_SCANS}`,
    )
  }
  return {
    options: { ...options },
    cases,
    selectedFamilyCount: new Set(cases.map((entry) => entry.family.familyId)).size,
    selectedEquipmentCount: new Set(cases.map((entry) => entry.equipment.id)).size,
    budget: {
      configuredMs: options.budgetMs,
      hardMaximumMs: MAX_CAPABILITY_BOUND_BUDGET_MS,
      hardCellCap: MAX_CAPABILITY_BOUND_CELLS,
      projectedCells: cases.length,
      hardProgressStateScanCap: MAX_PROJECTED_PROGRESS_STATE_SCANS,
      projectedProgressStateScans,
    },
  }
}

export interface CapabilityBoundExecutionOptions {
  now?: () => number
}

export function evaluateCapabilityBoundPlan(
  plan: Readonly<CapabilityBoundPlan>,
  execution: CapabilityBoundExecutionOptions = {},
): GenericCapabilityBoundReport {
  const now = execution.now ?? performance.now.bind(performance)
  const startedAt = now()
  const deadline = startedAt + plan.options.budgetMs
  const cells: CapabilityBoundCell[] = []
  let relaxation: readonly string[] | null = null

  for (const [index, evaluationCase] of plan.cases.entries()) {
    if (now() > deadline) {
      throw new Error(
        `capability-bound hard budget exhausted before cell ${index + 1}/${plan.cases.length}; no partial report emitted`,
      )
    }
    const scenario = cosmicExpertScenarioDataByRecipeId(evaluationCase.recipeId)
    if (scenario === null) throw new Error(`missing catalog recipe ${evaluationCase.recipeId}`)
    const context = {
      recipe: scenario.recipe,
      objective: scenario.objective,
      crafter: evaluationCase.equipment.crafter,
    }
    const initialState = createInitialCraftState(context.recipe, context.crafter)
    const bound = calculateOptimisticGainBound(context, initialState, plan.options.horizon)
    relaxation ??= bound.relaxation
    const targetProvablyImpossible
      = bound.targetStatus === 'provably-unreachable-under-relaxation'
    cells.push({
      caseId: evaluationCase.caseId,
      familyId: evaluationCase.family.familyId,
      familyRecipeCount: evaluationCase.family.recipeIds.length,
      representativeRecipeId: evaluationCase.family.representativeRecipeId,
      recipeId: evaluationCase.recipeId,
      recipeName: scenario.recipe.displayName,
      equipmentId: evaluationCase.equipment.id,
      equipmentLabel: evaluationCase.equipment.label,
      crafter: evaluationCase.equipment.crafter,
      crafterMechanicsSignature: recipeCrafterMechanicsSignatureKey(
        scenario.recipe,
        evaluationCase.equipment.crafter,
      ),
      objectiveId: scenario.objective.objectiveId,
      objectiveMode: scenario.objective.mode,
      objectiveSourceConfidence: scenario.objective.source.confidence,
      objectiveTarget: scenario.objective.qualityTarget,
      qualityMaximum: scenario.recipe.qualityMax,
      progressRequired: scenario.recipe.progressRequired,
      horizon: plan.options.horizon,
      maximumQualityUpperBound: bound.maximumQualityUpperBound,
      completionPossibleUnderRelaxation: bound.completionPossibleUnderRelaxation,
      targetProvablyImpossible,
      inconclusive: !targetProvablyImpossible,
      conclusion: targetProvablyImpossible
        ? 'target-provably-impossible-within-horizon-under-action-gain-relaxation'
        : 'inconclusive-upper-bound-does-not-prove-achievability',
    })
    if (now() > deadline) {
      throw new Error(
        `capability-bound hard budget exhausted after cell ${index + 1}/${plan.cases.length}; no partial report emitted`,
      )
    }
  }

  const familyIds = new Set(cells.map((cell) => cell.familyId))
  const equipmentIds = new Set(cells.map((cell) => cell.equipmentId))
  return {
    schemaVersion: GENERIC_CAPABILITY_BOUND_REPORT_VERSION,
    catalogVersion: COSMIC_EXPERT_CATALOG_VERSION,
    mechanicsVersion: CRAFT_MECHANICS_VERSION,
    boundVersion: OPTIMISTIC_GAIN_BOUND_VERSION,
    evidence: 'negative-only-action-gain-mechanics-relaxation-not-causal-policy-bound',
    interpretation: [
      'The upper bound ignores CP, durability, setup, one-use, success, and condition-order limits.',
      'The target means completing the craft at or above objectiveTarget within the declared action horizon.',
      'A target above it is impossible within the declared action horizon under the current mechanics model.',
      'A target at or below it remains inconclusive: this report proves neither achievability nor causal-policy performance.',
    ].join(' '),
    scope: {
      recipeId: plan.options.recipeId,
      equipmentId: plan.options.equipmentId,
      horizon: plan.options.horizon,
      familyRepresentativesOnly: plan.options.recipeId === null,
    },
    budget: plan.budget,
    relaxation: relaxation ?? [],
    summary: {
      evaluatedCells: cells.length,
      evaluatedFamilies: familyIds.size,
      evaluatedEquipmentProfiles: equipmentIds.size,
      targetProvablyImpossible: cells.filter((cell) => cell.targetProvablyImpossible).length,
      inconclusive: cells.filter((cell) => cell.inconclusive).length,
      completionImpossibleUnderRelaxation: cells.filter(
        (cell) => !cell.completionPossibleUnderRelaxation,
      ).length,
    },
    cells,
  }
}

export function runCapabilityBoundEvaluation(
  args: readonly string[],
  execution: CapabilityBoundExecutionOptions = {},
): GenericCapabilityBoundReport {
  return evaluateCapabilityBoundPlan(
    buildCapabilityBoundPlan(parseCapabilityBoundCliOptions(args)),
    execution,
  )
}
