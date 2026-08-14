import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  calculateBaseProgress,
  calculateBaseQuality,
  type CrafterProfile,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { createEpisodeRandomStream } from '@frozen-rabbit-expert/simulator'

const UINT32_RANGE = 4_294_967_296

function fixtureRows(name: string): string[][] {
  const path = fileURLToPath(new URL(`./fixtures/native-parity/v1/${name}`, import.meta.url))
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
  return lines.slice(1).map((line) => line.split('\t'))
}

function rawU32(draw: () => number): number {
  const raw = draw() * UINT32_RANGE
  expect(Number.isSafeInteger(raw)).toBe(true)
  return raw
}

function f32Bits(value: number): number {
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setFloat32(0, value, true)
  return view.getUint32(0, true)
}

function formulaRecipe(
  caseId: string,
  recipeLevel: number,
  progressDivider: number,
  qualityDivider: number,
  progressModifier: number,
  qualityModifier: number,
): RecipeProfile {
  return {
    profileId: `native-parity-${caseId}`,
    canonicalRecipeId: 0,
    canonicalItemId: 0,
    itemIconId: 0,
    identityConfidence: 'unknown',
    recipeFamilyId: 'native-parity-v1',
    missionFamily: 'auxesia-doh-wr01',
    displayName: caseId,
    displayNameEn: caseId,
    job: 'unknown',
    recipeLevel,
    progressRequired: 1,
    qualityMax: 1,
    requiredQuality: 0,
    durabilityMax: 1,
    progressDivider,
    qualityDivider,
    progressModifier,
    qualityModifier,
    recommendedCraftsmanship: 0,
    availableConditions: ['normal'],
    qualityOutcome: 'collectability',
    conditionProfileId: 'native-parity-v1',
    source: {
      sourceKind: 'assumption',
      patch: 'parity-fixture',
      verifiedAt: '2026-08-14',
      confidence: 'unknown',
    },
  }
}

describe('native oracle parity v0.1 fixtures', () => {
  it('recomputes raw condition and success u32 draws with the production TS stream', () => {
    for (const cells of fixtureRows('rng.tsv')) {
      expect(cells).toHaveLength(11)
      const seed = Number(cells[0])
      const random = createEpisodeRandomStream(seed)

      for (let drawIndex = 0; drawIndex < 5; drawIndex += 1) {
        expect(rawU32(random.nextCondition)).toBe(Number(cells[drawIndex + 1]))
      }
      for (let drawIndex = 0; drawIndex < 5; drawIndex += 1) {
        expect(rawU32(random.nextSuccess)).toBe(Number(cells[drawIndex + 6]))
      }
    }
  })

  it('recomputes exact f32 bits from the production TS base-gain pipeline', () => {
    for (const cells of fixtureRows('base-gains.tsv')) {
      expect(cells).toHaveLength(10)
      const [
        caseId,
        recipeLevel,
        craftsmanship,
        control,
        progressDivider,
        qualityDivider,
        progressModifier,
        qualityModifier,
        expectedProgressBits,
        expectedQualityBits,
      ] = cells
      const recipe = formulaRecipe(
        caseId!,
        Number(recipeLevel),
        Number(progressDivider),
        Number(qualityDivider),
        Number(progressModifier),
        Number(qualityModifier),
      )
      const crafter: CrafterProfile = {
        level: 100,
        craftsmanship: Number(craftsmanship),
        control: Number(control),
        maxCp: 0,
        cosmicToolGoodBonus: false,
      }

      expect(f32Bits(calculateBaseProgress(recipe, crafter))).toBe(
        Number.parseInt(expectedProgressBits!, 16),
      )
      expect(f32Bits(calculateBaseQuality(recipe, crafter))).toBe(
        Number.parseInt(expectedQualityBits!, 16),
      )
    }
  })
})
