export const MATERIAL_CONDITIONS = [
  'normal',
  'good',
  'goodOmen',
  'centered',
  'sturdy',
  'pliant',
  'malleable',
  'primed',
  'robust',
] as const

export type MaterialCondition = (typeof MATERIAL_CONDITIONS)[number]

export type CraftActionId =
  | 'basicSynthesis'
  | 'rapidSynthesis'
  | 'carefulSynthesis'
  | 'groundwork'
  | 'prudentSynthesis'
  | 'intensiveSynthesis'
  | 'muscleMemory'
  | 'basicTouch'
  | 'hastyTouch'
  | 'standardTouch'
  | 'advancedTouch'
  | 'prudentTouch'
  | 'preparatoryTouch'
  | 'preciseTouch'
  | 'byregotsBlessing'
  | 'trainedFinesse'
  | 'refinedTouch'
  | 'daringTouch'
  | 'reflect'
  | 'delicateSynthesis'
  | 'tricksOfTheTrade'
  | 'trainedPerfection'
  | 'mastersMend'
  | 'immaculateMend'
  | 'wasteNot'
  | 'wasteNot2'
  | 'veneration'
  | 'innovation'
  | 'greatStrides'
  | 'manipulation'
  | 'observe'
  | 'finalAppraisal'
  | 'carefulObservation'
  | 'heartAndSoul'
  | 'quickInnovation'

export interface SourceMetadata {
  sourceKind: 'official' | 'datamined' | 'empirical' | 'assumption'
  sourceUrl?: string
  sourceRevision?: string
  patch: string
  verifiedAt: string
  confidence: 'verified' | 'provisional' | 'unknown'
  notes?: readonly string[]
}

/** Data-owned, non-empty mission-family identifier validated at catalog boundaries. */
export type MissionFamilyId = string

export type CraftingJob =
  | 'carpenter'
  | 'blacksmith'
  | 'armorer'
  | 'goldsmith'
  | 'leatherworker'
  | 'weaver'
  | 'alchemist'
  | 'culinarian'
  | 'unknown'

export interface RecipeProfile {
  profileId: string
  canonicalRecipeId: number
  canonicalItemId: number
  itemIconId: number
  identityConfidence: 'verified' | 'provisional' | 'unknown'
  recipeFamilyId: string
  missionFamily: MissionFamilyId
  displayName: string
  displayNameEn: string
  job: CraftingJob
  recipeLevel: number
  progressRequired: number
  qualityMax: number
  requiredQuality: number
  durabilityMax: number
  progressDivider: number
  qualityDivider: number
  progressModifier: number
  qualityModifier: number
  recommendedCraftsmanship: number
  /** Every condition reachable in a manual/live state, including forced transitions. */
  availableConditions: readonly MaterialCondition[]
  /** Conditions sampled by RNG. Omitted when identical to availableConditions. */
  randomConditions?: readonly MaterialCondition[]
  qualityOutcome: 'required-quality' | 'collectability' | 'hq-chance'
  conditionProfileId: string
  source: SourceMetadata
}

export interface CraftQualityTier {
  id: 'scored' | 'mid' | 'high' | 'maximum'
  minimumQuality: number
  minimumCollectability: number
}

/**
 * A policy objective is deliberately separate from RecipeProfile. The recipe's
 * requiredQuality is a mechanics completion rule; qualityTarget describes how
 * much quality the adviser should pursue while preserving a completion route.
 */
export interface CraftObjective {
  objectiveId: string
  recipeProfileId: string
  mode: 'required-quality' | 'maximize-quality-with-safe-completion'
  qualityTarget: number
  qualityTiers: readonly CraftQualityTier[]
  source: SourceMetadata
}

export interface CrafterProfile {
  level: number
  craftsmanship: number
  control: number
  maxCp: number
  cosmicToolGoodBonus: boolean
  specialist?: boolean
}

export interface CraftBuffs {
  wasteNot: number
  veneration: number
  greatStrides: number
  innovation: number
  finalAppraisal: number
  manipulation: number
  muscleMemory: number
  expedience: number
}

export interface CraftState {
  step: number
  progress: number
  quality: number
  durability: number
  cp: number
  condition: MaterialCondition
  innerQuiet: number
  buffs: CraftBuffs
  comboFrom: CraftActionId | null
  trainedPerfectionAvailable: boolean
  trainedPerfectionActive: boolean
  carefulObservationUsesLeft: number
  heartAndSoulAvailable: boolean
  heartAndSoulActive: boolean
  quickInnovationAvailable: boolean
  terminal: 'none' | 'completed' | 'failed'
  failureReason: 'durability' | 'required-quality' | null
}

export interface CraftActionDefinition {
  id: CraftActionId
  category: 'progress' | 'quality' | 'repair' | 'buff' | 'utility'
  cpCost: number
  durabilityCost: number
  successRate: number
  progressPotency?: number
  qualityPotency?: number
  availableOnStep?: number
  requiresCondition?: MaterialCondition[]
  unavailableWithWasteNot?: boolean
  noStep?: boolean
  rerollsCondition?: boolean
  specialistOnly?: boolean
}

export interface ActionPreview {
  action: CraftActionDefinition
  legal: boolean
  reason?: string
  cpCost: number
  durabilityCost: number
  successRate: number
  progressGain: number
  qualityGain: number
}

export interface ObservedActionOutcome {
  success: boolean
  nextCondition: MaterialCondition
}

export interface TransitionResult {
  nextState: CraftState
  explanationCodes: string[]
}

export interface ModelVersions {
  mechanics: string
  plannerPolicy: string
  recipeCatalog: string
  conditionProfiles: string
  sessionCodec: string
}
