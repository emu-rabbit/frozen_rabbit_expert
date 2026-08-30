import {
  MATERIAL_CONDITIONS,
  minimumQualityForHqChancePercent,
  type CraftState,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import type { CosmicExpertScenarioDataEntry } from '@frozen-rabbit-expert/data'
import { WEB_PLANNER_POLICY } from './protocol'

const PROTOCOL = 'native-generic-episode-batch-v7'
const ACTION_LIMIT = 80

function booleanCell(value: boolean | undefined) {
  return value === true ? '1' : '0'
}

function conditionMask(conditions: readonly MaterialCondition[]) {
  return conditions.reduce((mask, condition) => {
    const index = MATERIAL_CONDITIONS.indexOf(condition)
    if (index < 0) throw new Error(`Unknown material condition: ${condition}`)
    return mask | (1 << index)
  }, 0)
}

function encodeState(state: Readonly<CraftState>): readonly string[] {
  return [
    state.step,
    state.progress,
    state.quality,
    state.durability,
    state.cp,
    state.condition,
    state.innerQuiet,
    state.buffs.wasteNot,
    state.buffs.veneration,
    state.buffs.greatStrides,
    state.buffs.innovation,
    state.buffs.finalAppraisal,
    state.buffs.manipulation,
    state.buffs.muscleMemory,
    state.buffs.expedience,
    state.comboFrom ?? '-',
    booleanCell(state.trainedPerfectionAvailable),
    booleanCell(state.trainedPerfectionActive),
    state.carefulObservationUsesLeft,
    booleanCell(state.heartAndSoulAvailable),
    booleanCell(state.heartAndSoulActive),
    booleanCell(state.quickInnovationAvailable),
    state.terminal,
    state.failureReason ?? '-',
  ].map(String)
}

function objectiveCells(scenario: Readonly<CosmicExpertScenarioDataEntry>) {
  const { recipe, objective } = scenario
  if (objective.mode === 'required-quality' || recipe.requiredQuality > 0) {
    return {
      adaptiveCompletion: false,
      kind: 'hard-quality-max',
      protectedFloor: recipe.qualityMax,
      milestones: [recipe.qualityMax],
    }
  }

  if (recipe.qualityOutcome === 'collectability' && objective.qualityTiers.length === 4) {
    const milestones = objective.qualityTiers.map(tier => tier.minimumQuality)
    return {
      adaptiveCompletion: true,
      kind: 'collectability-tiers',
      protectedFloor: milestones[Math.max(0, milestones.length - 2)]!,
      milestones,
    }
  }

  if (recipe.qualityOutcome === 'hq-chance') {
    const milestones = [50, 75, 100].map(chance => (
      minimumQualityForHqChancePercent(chance, recipe.qualityMax)
    ))
    return {
      adaptiveCompletion: true,
      kind: 'hq-chance',
      protectedFloor: milestones[1]!,
      milestones,
    }
  }

  return {
    adaptiveCompletion: true,
    kind: 'continuous-collectability',
    protectedFloor: Math.max(recipe.requiredQuality, Math.ceil(recipe.qualityMax * 0.55)),
    milestones: [recipe.qualityMax],
  }
}

/**
 * The Web planner consumes the same versioned, fixed-width episode row as the
 * native evaluator. Live play supplies observed conditions; equal reachable
 * condition weights are an explicit planning assumption, not an RNG oracle.
 */
export function createPlannerEpisode(
  scenario: Readonly<CosmicExpertScenarioDataEntry>,
  crafter: Readonly<CrafterProfile>,
  state: Readonly<CraftState>,
): string {
  const { recipe } = scenario
  const objective = objectiveCells(scenario)
  const milestones = [...objective.milestones]
  if (milestones.length < 1 || milestones.length > 4) {
    throw new Error('Web planner objective must declare between one and four milestones')
  }
  const milestoneCount = milestones.length
  while (milestones.length < 4) milestones.push(0)

  const reachable = new Set(recipe.randomConditions ?? recipe.availableConditions)
  const transitionWeights = MATERIAL_CONDITIONS.flatMap(() => (
    MATERIAL_CONDITIONS.map(condition => reachable.has(condition) ? 1 : 0)
  ))
  const caseId = `web-recipe-${recipe.canonicalRecipeId}`
  const cells = [
    PROTOCOL,
    caseId,
    'episode',
    WEB_PLANNER_POLICY,
    'balanced',
    recipe.qualityMax,
    objective.protectedFloor,
    booleanCell(objective.adaptiveCompletion),
    objective.kind,
    milestoneCount,
    ...milestones,
    conditionMask([...reachable]),
    'none',
    recipe.canonicalRecipeId,
    recipe.recipeLevel,
    recipe.progressRequired,
    recipe.qualityMax,
    recipe.requiredQuality,
    recipe.durabilityMax,
    recipe.progressDivider,
    recipe.qualityDivider,
    recipe.progressModifier,
    recipe.qualityModifier,
    crafter.level,
    crafter.craftsmanship,
    crafter.control,
    crafter.maxCp,
    booleanCell(crafter.cosmicToolGoodBonus),
    booleanCell(crafter.specialist),
    ...encodeState(state),
    0,
    0,
    0,
    ACTION_LIMIT,
    ...transitionWeights,
  ].map(String)

  if (cells.length !== 141) {
    throw new Error(`Web planner episode must have 141 cells, got ${cells.length}`)
  }
  return cells.join('\t')
}
