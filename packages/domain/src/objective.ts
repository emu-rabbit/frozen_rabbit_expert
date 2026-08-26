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
 * completion and the quality ceiling remain on RecipeProfile; this validates
 * only the independent utility shape used by planners and evaluators.
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
  if (objective.mode === 'required-quality' && recipe.requiredQuality <= 0) {
    throw new Error(`required-quality objective ${objective.objectiveId} requires mechanics requiredQuality`)
  }
  if (objective.mode === 'maximize-quality-with-safe-completion' && recipe.requiredQuality > 0) {
    throw new Error(
      `safe-completion objective ${objective.objectiveId} requires mechanics requiredQuality zero`,
    )
  }

  if (recipe.qualityOutcome === 'hq-chance') {
    if (objective.qualityTiers.length !== 0) {
      throw new Error(`HQ objective ${objective.objectiveId} must use the HQ chance curve, not quality tiers`)
    }
    return
  }

  const expectedTierIds = objective.qualityTiers.length === 4
    ? ['scored', 'mid', 'high', 'maximum']
    : ['maximum']
  if (
    objective.qualityTiers.length !== expectedTierIds.length
    || objective.qualityTiers.some((tier, index) => tier.id !== expectedTierIds[index])
  ) {
    throw new Error(
      `objective ${objective.objectiveId} must declare either maximum only or scored/mid/high/maximum tiers`,
    )
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
      || tier.minimumQuality > recipe.qualityMax
    ) {
      throw new RangeError(
        `objective ${objective.objectiveId} quality tiers must be strictly increasing within recipe qualityMax`,
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
  if (objective.qualityTiers.at(-1)?.minimumQuality !== recipe.qualityMax) {
    throw new Error(`objective ${objective.objectiveId} maximum tier must equal recipe qualityMax`)
  }
}
