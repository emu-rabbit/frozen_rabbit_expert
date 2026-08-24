import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CRAFT_SCENARIO_DATA,
  COSMIC_EXPERT_CATALOG_IDENTITY,
  COSMIC_EXPERT_CATALOG_VERSION,
  COSMIC_EXPERT_GENERATED_SOURCE,
  COSMIC_EXPERT_MECHANICS_FAMILIES,
  COSMIC_EXPERT_SCENARIO_DATA,
  cosmicExpertScenarioDataByRecipeId,
} from '../src'
import { GENERATED_COSMIC_EXPERT_RECIPES } from '../src/generated/cosmicExpertRecipes.generated'

describe('generated Cosmic Exploration expert recipe catalog', () => {
  it('contains every WKS-owned level-100 expert recipe in the pinned 7.55 snapshot', () => {
    expect(COSMIC_EXPERT_GENERATED_SOURCE.recipeCount).toBe(432)
    expect(COSMIC_EXPERT_SCENARIO_DATA).toHaveLength(432)
    expect(new Set(COSMIC_EXPERT_SCENARIO_DATA.map((entry) => entry.scenarioId)).size).toBe(432)
    expect(new Set(COSMIC_EXPERT_SCENARIO_DATA.map((entry) => entry.recipe.canonicalRecipeId)).size).toBe(432)
  })

  it('binds catalog identity to both WKS sources, XIVAPI schema/version, and canonical content', () => {
    const canonicalContentSha256 = createHash('sha256')
      .update(JSON.stringify(GENERATED_COSMIC_EXPERT_RECIPES))
      .digest('hex')
    expect(canonicalContentSha256).toBe(COSMIC_EXPERT_GENERATED_SOURCE.canonicalContentSha256)

    const catalogIdentitySha256 = createHash('sha256')
      .update(JSON.stringify({
        xivapiVersion: COSMIC_EXPERT_GENERATED_SOURCE.xivapiVersion,
        xivapiSchema: COSMIC_EXPERT_GENERATED_SOURCE.xivapiSchema,
        wksMissionRecipeRevision: COSMIC_EXPERT_GENERATED_SOURCE.wksMissionRecipeRevision,
        wksMissionUnitRevision: COSMIC_EXPERT_GENERATED_SOURCE.wksMissionUnitRevision,
        canonicalContentSha256,
      }))
      .digest('hex')
    expect(catalogIdentitySha256).toBe(COSMIC_EXPERT_GENERATED_SOURCE.catalogIdentitySha256)
    expect(COSMIC_EXPERT_CATALOG_IDENTITY).toBe(catalogIdentitySha256.slice(0, 16))
    expect(COSMIC_EXPERT_CATALOG_VERSION)
      .toBe('cosmic-expert-catalog-284bb7f44b9c0976-3c0ac44a05e9bf29-v2')
    expect(COSMIC_EXPERT_GENERATED_SOURCE).toMatchObject({
      wksMissionRecipePath: 'csv/en/WKSMissionRecipe.csv',
      wksMissionUnitPath: 'csv/en/WKSMissionUnit.csv',
      patch: '7.55',
      verifiedAt: '2026-07-28',
    })
  })

  it('exposes a pinned, displayable mission identity for every recipe', () => {
    for (const entry of COSMIC_EXPERT_SCENARIO_DATA) {
      expect(entry.missionIds.length).toBeGreaterThan(0)
      expect(entry.missionNamesEn.length).toBeGreaterThan(0)
      expect(entry.missionNamesEn).toHaveLength(entry.missionIds.length)
      expect(entry.missionIds.every((id) => Number.isSafeInteger(id) && id > 0)).toBe(true)
      expect(entry.missionNamesEn.every((name) => (
        name.length > 0
        && name === name.trim()
        && !/[\uE000-\uF8FF]/.test(name)
      ))).toBe(true)
      expect(entry.recipe.profileId).toContain(COSMIC_EXPERT_CATALOG_IDENTITY)
      expect(entry.recipe.source.patch).toBe(COSMIC_EXPERT_GENERATED_SOURCE.patch)
      expect(entry.recipe.source.verifiedAt).toBe(COSMIC_EXPERT_GENERATED_SOURCE.verifiedAt)
      expect(entry.recipe.source.sourceRevision).toContain(
        `wks-mission-unit:${COSMIC_EXPERT_GENERATED_SOURCE.wksMissionUnitRevision}`,
      )
      expect(entry.recipe.source.sourceRevision).toContain(
        `canonical-content-sha256:${COSMIC_EXPERT_GENERATED_SOURCE.canonicalContentSha256}`,
      )
    }
  })

  it('disambiguates same-name recipes through their owning mission names', () => {
    const captainSuitExPlus = cosmicExpertScenarioDataByRecipeId(37291)
    const captainSuitMaster = cosmicExpertScenarioDataByRecipeId(38214)
    expect(captainSuitExPlus?.recipe.displayNameEn).toBe("Captain's Survey Suit")
    expect(captainSuitMaster?.recipe.displayNameEn).toBe("Captain's Survey Suit")
    expect(captainSuitExPlus?.missionIds).toEqual([669])
    expect(captainSuitExPlus?.missionNamesEn).toEqual(["EX+: Captain's Suit III"])
    expect(captainSuitMaster?.missionIds).toEqual([1184])
    expect(captainSuitMaster?.missionNamesEn).toEqual(['Master: Improved Captain\'s Suits'])
  })

  it('covers all eight crafting jobs evenly', () => {
    const counts = Object.groupBy(
      COSMIC_EXPERT_SCENARIO_DATA,
      (entry) => entry.recipe.job,
    )
    expect(Object.keys(counts).sort()).toEqual([
      'alchemist',
      'armorer',
      'blacksmith',
      'carpenter',
      'culinarian',
      'goldsmith',
      'leatherworker',
      'weaver',
    ])
    expect(Object.values(counts).map((entries) => entries?.length)).toEqual(Array(8).fill(54))
  })

  it('groups name/job variants into mechanics families without hiding selectable recipes', () => {
    expect(COSMIC_EXPERT_MECHANICS_FAMILIES).toHaveLength(50)
    expect(COSMIC_EXPERT_MECHANICS_FAMILIES.some((family) => family.recipeIds.length >= 8)).toBe(true)
    expect(COSMIC_EXPERT_MECHANICS_FAMILIES.flatMap((family) => family.recipeIds)).toHaveLength(432)
  })

  it('shares verified family-level objective templates without duplicating Craft policy evaluation', () => {
    const objectiveSignature = (recipeId: number) => {
      const objective = cosmicExpertScenarioDataByRecipeId(recipeId)?.objective
      return objective === undefined ? null : {
        mode: objective.mode,
        qualityTarget: objective.qualityTarget,
        qualityTiers: objective.qualityTiers,
        confidence: objective.source.confidence,
      }
    }

    expect(objectiveSignature(36220)).toEqual(objectiveSignature(36283))
    expect(objectiveSignature(36204)).toEqual(objectiveSignature(36582))
    expect(cosmicExpertScenarioDataByRecipeId(36220)?.objective.source.sourceRevision)
      .toContain('family-template-source-recipe:36283')
    expect(cosmicExpertScenarioDataByRecipeId(36204)?.objective.source.sourceRevision)
      .toContain('family-template-source-recipe:36582')

    for (const family of COSMIC_EXPERT_MECHANICS_FAMILIES) {
      const signatures = new Set(family.recipeIds.map((recipeId) => (
        JSON.stringify(objectiveSignature(recipeId))
      )))
      expect(signatures.size, family.familyId).toBe(1)
    }
  })

  it('keeps the five historical recipes as data overlays, not live policy bindings', () => {
    expect(cosmicExpertScenarioDataByRecipeId(36282)?.recipe.displayName).toBe('宇宙鈦鐵錠')
    expect(cosmicExpertScenarioDataByRecipeId(36283)?.objective.qualityTarget).toBe(27100)
    expect(cosmicExpertScenarioDataByRecipeId(36205)?.recipe.requiredQuality).toBe(14900)
    expect(cosmicExpertScenarioDataByRecipeId(36208)?.recipe.qualityOutcome).toBe('hq-chance')
    expect(cosmicExpertScenarioDataByRecipeId(36582)?.objective.qualityTarget).toBe(12000)
  })

  it('preserves the five historical mechanics fixtures as catalog regressions', () => {
    const mechanicsFields = [
      'canonicalItemId',
      'recipeLevel',
      'progressRequired',
      'qualityMax',
      'requiredQuality',
      'durabilityMax',
      'progressDivider',
      'qualityDivider',
      'progressModifier',
      'qualityModifier',
      'recommendedCraftsmanship',
      'qualityOutcome',
    ] as const
    for (const historical of CRAFT_SCENARIO_DATA) {
      const current = cosmicExpertScenarioDataByRecipeId(historical.recipe.canonicalRecipeId)
      expect(current).not.toBeNull()
      for (const field of mechanicsFields) {
        expect(current!.recipe[field], `${historical.scenarioId}.${field}`)
          .toEqual(historical.recipe[field])
      }
      expect(new Set(current!.recipe.availableConditions))
        .toEqual(new Set(historical.recipe.availableConditions))
    }
  })

  it('models Robust as reaching forced Sturdy even when the random flag omits Sturdy', () => {
    // Recipe 37519 has ConditionsFlag 1363: Robust is present but the random
    // Sturdy bit is not. Sturdy must still be reachable through Robust.
    const robustWithoutRandomSturdy = cosmicExpertScenarioDataByRecipeId(37519)
    expect(robustWithoutRandomSturdy).toBeDefined()
    expect(robustWithoutRandomSturdy?.recipe.availableConditions).toContain('sturdy')
    expect(robustWithoutRandomSturdy?.recipe.randomConditions).toContain('robust')
    expect(robustWithoutRandomSturdy?.recipe.randomConditions).not.toContain('sturdy')
  })

  it('does not accidentally include the unrelated 7.55 Crumbling Aqueduct master recipes', () => {
    expect(cosmicExpertScenarioDataByRecipeId(38246)).toBeNull()
    expect(cosmicExpertScenarioDataByRecipeId(38253)).toBeNull()
  })
})
