import { calculateBaseProgress, calculateBaseQuality } from './formulas'
import { CRAFT_MECHANICS_VERSION } from './mechanicsVersion'
import { empiricalQualityCorrectionProfileId } from './qualityCorrections'
import type { CrafterProfile, RecipeProfile } from './types'

export interface RecipeCrafterMechanicsSignature {
  mechanicsModelVersion: typeof CRAFT_MECHANICS_VERSION
  baseProgress: number
  baseQuality: number
  maxCp: number
  cosmicToolGoodBonus: boolean
  specialist: boolean
  empiricalQualityCorrectionProfileId: string
}

/**
 * Recipe-specific discrete inputs that can change transition gains, resource
 * feasibility, or action access. Matching this signature means mechanics
 * equivalence, not policy-distribution evidence.
 */
export function calculateRecipeCrafterMechanicsSignature(
  recipe: Readonly<RecipeProfile>,
  crafter: Readonly<CrafterProfile>,
): RecipeCrafterMechanicsSignature {
  return {
    mechanicsModelVersion: CRAFT_MECHANICS_VERSION,
    baseProgress: Math.floor(calculateBaseProgress(recipe, crafter)),
    baseQuality: Math.floor(calculateBaseQuality(recipe, crafter)),
    maxCp: crafter.maxCp,
    cosmicToolGoodBonus: crafter.cosmicToolGoodBonus,
    specialist: crafter.specialist === true,
    empiricalQualityCorrectionProfileId: empiricalQualityCorrectionProfileId(recipe, crafter),
  }
}

export function recipeCrafterMechanicsSignatureKey(
  recipe: Readonly<RecipeProfile>,
  crafter: Readonly<CrafterProfile>,
): string {
  const signature = calculateRecipeCrafterMechanicsSignature(recipe, crafter)
  return [
    `mechanics=${signature.mechanicsModelVersion}`,
    `progress=${signature.baseProgress}`,
    `quality=${signature.baseQuality}`,
    `cp=${signature.maxCp}`,
    `cosmicTool=${Number(signature.cosmicToolGoodBonus)}`,
    `specialist=${Number(signature.specialist)}`,
    `qualityCorrection=${signature.empiricalQualityCorrectionProfileId}`,
  ].join('|')
}
