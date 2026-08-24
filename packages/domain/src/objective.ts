import type { CraftObjective, RecipeProfile } from './types'

const SUPPORTED_CRAFT_OBJECTIVE_MODES = new Set<CraftObjective['mode']>([
  'required-quality',
  'maximize-quality-with-safe-completion',
])

function assertNonEmptyIdentity(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

/**
 * Runtime boundary for every recipe-owned policy objective. Mechanics
 * completion remains on RecipeProfile; this only validates the independent
 * quality goal used by planners, datasets, and policy artifacts.
 */
export function assertCraftObjective(
  recipe: Readonly<RecipeProfile>,
  objective: Readonly<CraftObjective>,
): void {
  assertNonEmptyIdentity(objective.objectiveId, 'objectiveId')
  assertNonEmptyIdentity(objective.recipeProfileId, 'objective recipeProfileId')
  if (objective.recipeProfileId !== recipe.profileId) {
    throw new Error(`objective ${objective.objectiveId} does not belong to recipe ${recipe.profileId}`)
  }
  if (!SUPPORTED_CRAFT_OBJECTIVE_MODES.has(objective.mode)) {
    throw new Error(`objective ${objective.objectiveId} has an unsupported mode: ${String(objective.mode)}`)
  }
  if (
    !Number.isSafeInteger(objective.qualityTarget)
    || objective.qualityTarget <= 0
    || objective.qualityTarget < recipe.requiredQuality
    || objective.qualityTarget > recipe.qualityMax
  ) {
    throw new RangeError(
      `objective ${objective.objectiveId} qualityTarget must be a positive safe integer within recipe quality bounds`,
    )
  }
  if (
    objective.mode === 'required-quality'
    && objective.qualityTarget !== recipe.requiredQuality
  ) {
    throw new Error(
      `required-quality objective ${objective.objectiveId} must target recipe.requiredQuality`,
    )
  }

  if (objective.qualityTiers.length === 0) {
    throw new Error(`objective ${objective.objectiveId} must declare at least one quality tier`)
  }
  const tierIds = new Set<string>()
  let previousMinimumQuality = 0
  let previousMinimumCollectability = -1
  for (const tier of objective.qualityTiers) {
    if (tierIds.has(tier.id)) {
      throw new Error(`objective ${objective.objectiveId} has duplicate quality tier ${tier.id}`)
    }
    tierIds.add(tier.id)
    if (
      !Number.isSafeInteger(tier.minimumQuality)
      || tier.minimumQuality <= previousMinimumQuality
      || tier.minimumQuality > objective.qualityTarget
    ) {
      throw new RangeError(
        `objective ${objective.objectiveId} quality tiers must be strictly increasing within qualityTarget`,
      )
    }
    if (
      !Number.isSafeInteger(tier.minimumCollectability)
      || tier.minimumCollectability <= previousMinimumCollectability
      || tier.minimumCollectability < 0
    ) {
      throw new RangeError(
        `objective ${objective.objectiveId} collectability tiers must be non-negative and strictly increasing`,
      )
    }
    previousMinimumQuality = tier.minimumQuality
    previousMinimumCollectability = tier.minimumCollectability
  }
}
