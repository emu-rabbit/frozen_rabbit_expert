import type {
  CraftObjective,
  CraftQualityTier,
  MaterialCondition,
  RecipeProfile,
  SourceMetadata,
} from '@frozen-rabbit-expert/domain'
import type { CraftScenarioDataEntry } from './craftScenarioData'
import { validateCraftScenarioData } from './craftScenarioData'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from './recipes/cosmicTitaniumIngot'
import {
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
} from './recipes/cosmicTitaniumNails'
import {
  HARDENED_SURVEY_PLANK,
  HARDENED_SURVEY_PLANK_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
} from './recipes/elevatingPlatforms'
import {
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from './recipes/surveyCraftsmansCommandBrew'
import {
  COSMIC_EXPERT_GENERATED_SOURCE,
  GENERATED_COSMIC_EXPERT_RECIPES,
} from './generated/cosmicExpertRecipes.generated'

export const COSMIC_EXPERT_CATALOG_IDENTITY
  = COSMIC_EXPERT_GENERATED_SOURCE.catalogIdentitySha256.slice(0, 16)

export const COSMIC_EXPERT_CATALOG_VERSION
  = `cosmic-expert-catalog-${COSMIC_EXPERT_GENERATED_SOURCE.xivapiVersion}-${COSMIC_EXPERT_CATALOG_IDENTITY}-v2` as const

export type CosmicExpertScenarioId = `cosmic-expert-${number}`
export type CosmicMissionRank = 'A' | 'EX' | 'EX+' | 'Master'

export interface CosmicExpertScenarioDataEntry extends CraftScenarioDataEntry {
  scenarioId: CosmicExpertScenarioId
  /** Canonical WKSMissionRecipe row identities owning this recipe. */
  missionIds: readonly number[]
  /** Displayable English WKSMissionUnit names resolved from the pinned WKS data. */
  missionNamesEn: readonly string[]
}

const CONDITION_FLAG_ENTRIES = [
  [1, 'normal'],
  [2, 'good'],
  [16, 'centered'],
  [32, 'sturdy'],
  [64, 'pliant'],
  [128, 'malleable'],
  [256, 'primed'],
  [512, 'goodOmen'],
  [1024, 'robust'],
] as const satisfies readonly (readonly [number, MaterialCondition])[]

const SUPPORTED_CONDITION_MASK = CONDITION_FLAG_ENTRIES
  .reduce((mask, [flag]) => mask | flag, 0)

interface CuratedRecipeKnowledge {
  displayName: string
  objective: Readonly<CraftObjective>
  objectiveScope: 'recipe' | 'mechanics-family'
}

const CURATED_RECIPE_KNOWLEDGE = new Map<number, CuratedRecipeKnowledge>([
  [COSMIC_TITANIUM_INGOT.canonicalRecipeId, {
    displayName: COSMIC_TITANIUM_INGOT.displayName,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
    objectiveScope: 'recipe',
  }],
  [COSMIC_TITANIUM_NAILS.canonicalRecipeId, {
    displayName: COSMIC_TITANIUM_NAILS.displayName,
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    objectiveScope: 'mechanics-family',
  }],
  [HARDENED_SURVEY_PLANK.canonicalRecipeId, {
    displayName: HARDENED_SURVEY_PLANK.displayName,
    objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
    objectiveScope: 'recipe',
  }],
  [MOBILE_WORK_STAIRS.canonicalRecipeId, {
    displayName: MOBILE_WORK_STAIRS.displayName,
    objective: MOBILE_WORK_STAIRS_OBJECTIVE,
    objectiveScope: 'recipe',
  }],
  [SURVEY_CRAFTSMANS_COMMAND_BREW.canonicalRecipeId, {
    displayName: SURVEY_CRAFTSMANS_COMMAND_BREW.displayName,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    objectiveScope: 'mechanics-family',
  }],
])

interface FamilyObjectiveKnowledge {
  sourceRecipeId: number
  objective: Readonly<CraftObjective>
}

const FAMILY_OBJECTIVE_KNOWLEDGE = new Map<string, FamilyObjectiveKnowledge>()
for (const [recipeId, knowledge] of CURATED_RECIPE_KNOWLEDGE) {
  if (knowledge.objectiveScope !== 'mechanics-family') continue
  const raw = GENERATED_COSMIC_EXPERT_RECIPES.find((recipe) => recipe.recipeId === recipeId)
  if (raw === undefined) throw new Error(`missing generated recipe for family objective ${recipeId}`)
  const previous = FAMILY_OBJECTIVE_KNOWLEDGE.get(raw.mechanicsFamilyId)
  if (previous !== undefined) {
    const previousSignature = JSON.stringify({
      mode: previous.objective.mode,
      qualityTiers: previous.objective.qualityTiers,
    })
    const nextSignature = JSON.stringify({
      mode: knowledge.objective.mode,
      qualityTiers: knowledge.objective.qualityTiers,
    })
    if (previousSignature !== nextSignature) {
      throw new Error(`conflicting objective templates for mechanics family ${raw.mechanicsFamilyId}`)
    }
  } else {
    FAMILY_OBJECTIVE_KNOWLEDGE.set(raw.mechanicsFamilyId, {
      sourceRecipeId: recipeId,
      objective: knowledge.objective,
    })
  }
}

function conditionSets(flags: number): {
  available: readonly MaterialCondition[]
  random: readonly MaterialCondition[]
} {
  const unknownFlags = flags & ~SUPPORTED_CONDITION_MASK
  if (unknownFlags !== 0) {
    throw new Error(`unsupported Cosmic expert condition flags: ${flags} (unknown mask ${unknownFlags})`)
  }
  const random = CONDITION_FLAG_ENTRIES
    .filter(([flag]) => (flags & flag) !== 0)
    .map(([, condition]) => condition)
  const available = [...random]

  // Robust deterministically produces Sturdy on the next advancing step, so
  // Sturdy is reachable mechanics even when it is absent from the random pool.
  if (available.includes('robust') && !available.includes('sturdy')) {
    available.push('sturdy')
  }
  if (!available.includes('normal')) throw new Error(`condition flags ${flags} omit Normal`)
  return {
    available: Object.freeze(available),
    random: Object.freeze(random),
  }
}

function recipeSource(recipeId: number): SourceMetadata {
  return {
    sourceKind: 'datamined',
    sourceUrl: `https://v2.xivapi.com/api/sheet/Recipe/${recipeId}`,
    sourceRevision: [
      `game-data:${COSMIC_EXPERT_GENERATED_SOURCE.xivapiVersion}`,
      `schema:${COSMIC_EXPERT_GENERATED_SOURCE.xivapiSchema}`,
      `wks-mission-recipe:${COSMIC_EXPERT_GENERATED_SOURCE.wksMissionRecipeRevision}`,
      `wks-mission-unit:${COSMIC_EXPERT_GENERATED_SOURCE.wksMissionUnitRevision}`,
      `canonical-content-sha256:${COSMIC_EXPERT_GENERATED_SOURCE.canonicalContentSha256}`,
      `catalog-identity-sha256:${COSMIC_EXPERT_GENERATED_SOURCE.catalogIdentitySha256}`,
    ].join(';'),
    patch: COSMIC_EXPERT_GENERATED_SOURCE.patch,
    verifiedAt: COSMIC_EXPERT_GENERATED_SOURCE.verifiedAt,
    confidence: 'verified',
    notes: [
      '配方必須同時出現在 WKS mission recipe table，且目前 Recipe row 為 level 100 Expert；不是只靠 IsExpert 粗略收錄。',
      '英文任務名稱由固定 WKSMissionUnit revision 經 WKSMissionRecipe row identity 對應，不以成品名稱猜測任務。',
      '英文名稱與 mechanics 來自固定 game-data/schema snapshot；沒有可信繁體中文資料的項目暫用英文顯示，不自行翻譯。',
    ],
  }
}

function objectiveSource(
  recipe: Readonly<RecipeProfile>,
  rank: CosmicMissionRank,
): SourceMetadata {
  if (recipe.requiredQuality > 0) return recipe.source
  return {
    sourceKind: 'assumption',
    sourceRevision: `${COSMIC_EXPERT_CATALOG_VERSION}:quality-utility:${recipe.qualityOutcome}:${rank}`,
    patch: recipe.source.patch,
    verifiedAt: recipe.source.verifiedAt,
    confidence: 'provisional',
    notes: [
      'objective 不保存獨立品質數值；品質上限只讀取 recipe.qualityMax。',
      recipe.qualityOutcome === 'hq-chance'
        ? 'HQ 類以社群 HQ 機率曲線比較已完成成品，不以線性品質比例冒充 HQ 率。'
        : rank === 'Master'
          ? 'Master 收藏品沒有套用一般 A／EX／EX+ 分檔；以完成品品質與滿品質衡量。'
          : '一般收藏品依任務級別使用 100／300／700／滿品質四檔；比例來自四表 evaluator 的社群規則。',
    ],
  }
}

export function cosmicMissionRank(missionNamesEn: readonly string[]): CosmicMissionRank {
  const missionName = missionNamesEn[0] ?? ''
  if (missionName.startsWith('Master:')) return 'Master'
  if (missionName.startsWith('EX+:')) return 'EX+'
  if (missionName.startsWith('EX:')) return 'EX'
  return 'A'
}

function maximumQualityTier(qualityMax: number): CraftQualityTier {
  return {
    id: 'maximum',
    minimumQuality: qualityMax,
    minimumCollectability: Math.floor(qualityMax / 10),
  }
}

function standardCollectabilityTiers(
  qualityMax: number,
  rank: Exclude<CosmicMissionRank, 'Master'>,
): readonly CraftQualityTier[] {
  const ratios = rank === 'EX+'
    ? [0.60, 0.70, 0.90]
    : rank === 'EX' ? [0.50, 0.60, 0.85] : [0.40, 0.55, 0.70]
  const maximumCollectability = Math.floor(qualityMax / 10)
  const ids = ['scored', 'mid', 'high'] as const
  return Object.freeze([
    ...ratios.map((ratio, index) => {
      const minimumCollectability = Math.floor(maximumCollectability * ratio)
      return Object.freeze({
        id: ids[index]!,
        minimumQuality: minimumCollectability * 10,
        minimumCollectability,
      })
    }),
    Object.freeze(maximumQualityTier(qualityMax)),
  ])
}

function createRecipe(
  raw: (typeof GENERATED_COSMIC_EXPERT_RECIPES)[number],
): Readonly<RecipeProfile> {
  const curated = CURATED_RECIPE_KNOWLEDGE.get(raw.recipeId)
  const conditions = conditionSets(raw.conditionsFlag)
  return Object.freeze({
    profileId: `cosmic-expert-recipe-${raw.recipeId}-${COSMIC_EXPERT_CATALOG_IDENTITY}`,
    canonicalRecipeId: raw.recipeId,
    canonicalItemId: raw.itemId,
    itemIconId: raw.itemIconId,
    identityConfidence: 'verified',
    recipeFamilyId: raw.mechanicsFamilyId,
    missionFamily: `cosmic-exploration-wks-${raw.missionIds.join('-')}`,
    displayName: curated?.displayName ?? raw.nameEn,
    displayNameEn: raw.nameEn,
    job: raw.job,
    recipeLevel: raw.recipeLevelTableId,
    progressRequired: raw.progressRequired,
    qualityMax: raw.qualityMax,
    requiredQuality: raw.requiredQuality,
    durabilityMax: raw.durabilityMax,
    progressDivider: raw.progressDivider,
    qualityDivider: raw.qualityDivider,
    progressModifier: raw.progressModifier,
    qualityModifier: raw.qualityModifier,
    recommendedCraftsmanship: raw.recommendedCraftsmanship,
    availableConditions: conditions.available,
    randomConditions: conditions.random,
    qualityOutcome: raw.qualityOutcome,
    conditionProfileId: 'manual-cosmic-expert-condition-selection-v1',
    source: recipeSource(raw.recipeId),
  })
}

function createObjective(
  recipe: Readonly<RecipeProfile>,
  missionNamesEn: readonly string[],
): Readonly<CraftObjective> {
  const exactKnowledge = CURATED_RECIPE_KNOWLEDGE.get(recipe.canonicalRecipeId)
  const familyKnowledge = FAMILY_OBJECTIVE_KNOWLEDGE.get(recipe.recipeFamilyId)
  const curated = exactKnowledge?.objective ?? familyKnowledge?.objective
  if (curated !== undefined) {
    const inheritedFromRecipeId = exactKnowledge === undefined
      ? familyKnowledge?.sourceRecipeId ?? null
      : null
    const source = inheritedFromRecipeId === null
      ? curated.source
      : {
          ...curated.source,
          sourceRevision: [
            curated.source.sourceRevision ?? 'unspecified',
            `family-template-source-recipe:${inheritedFromRecipeId}`,
            `mechanics-family:${recipe.recipeFamilyId}`,
            `wks-mission-unit:${COSMIC_EXPERT_GENERATED_SOURCE.wksMissionUnitRevision}`,
          ].join(';'),
          notes: [
            ...(curated.source.notes ?? []),
            `此 objective 由同 mechanics family 的 Recipe ${inheritedFromRecipeId} 任務表模板沿用；相似任務的單件品質／收藏價值要求相同，recipe identity 與跨件任務狀態仍各自保存。`,
          ],
        }
    return Object.freeze({
      ...curated,
      objectiveId: `cosmic-expert-${recipe.canonicalRecipeId}-${curated.objectiveId}`,
      recipeProfileId: recipe.profileId,
      qualityTiers: Object.freeze([...curated.qualityTiers]),
      source: Object.freeze(source),
    })
  }

  const required = recipe.requiredQuality > 0
  const rank = cosmicMissionRank(missionNamesEn)
  const qualityTiers = recipe.qualityOutcome === 'hq-chance'
    ? []
    : recipe.qualityOutcome === 'collectability' && rank !== 'Master'
      ? standardCollectabilityTiers(recipe.qualityMax, rank)
      : [maximumQualityTier(recipe.qualityMax)]
  return Object.freeze({
    objectiveId: `cosmic-expert-${recipe.canonicalRecipeId}-${required ? 'hard-quality-max' : recipe.qualityOutcome}-v2`,
    recipeProfileId: recipe.profileId,
    mode: required ? 'required-quality' : 'maximize-quality-with-safe-completion',
    qualityTiers: Object.freeze([...qualityTiers]),
    source: objectiveSource(recipe, rank),
  })
}

export const COSMIC_EXPERT_SCENARIO_DATA: readonly CosmicExpertScenarioDataEntry[] = Object.freeze(
  GENERATED_COSMIC_EXPERT_RECIPES.map((raw) => {
    const recipe = createRecipe(raw)
    return Object.freeze({
      scenarioId: `cosmic-expert-${raw.recipeId}` satisfies CosmicExpertScenarioId,
      recipe,
      objective: createObjective(recipe, raw.missionNamesEn),
      missionIds: Object.freeze([...raw.missionIds]),
      missionNamesEn: Object.freeze([...raw.missionNamesEn]),
    })
  }),
)

validateCraftScenarioData(COSMIC_EXPERT_SCENARIO_DATA)

export interface CosmicExpertMechanicsFamily {
  familyId: string
  representativeRecipeId: number
  recipeIds: readonly number[]
}

const recipeIdsByFamily = new Map<string, number[]>()
for (const entry of COSMIC_EXPERT_SCENARIO_DATA) {
  const recipeIds = recipeIdsByFamily.get(entry.recipe.recipeFamilyId) ?? []
  recipeIds.push(entry.recipe.canonicalRecipeId)
  recipeIdsByFamily.set(entry.recipe.recipeFamilyId, recipeIds)
}

export const COSMIC_EXPERT_MECHANICS_FAMILIES: readonly CosmicExpertMechanicsFamily[]
  = Object.freeze([...recipeIdsByFamily.entries()]
    .map(([familyId, recipeIds]) => Object.freeze({
      familyId,
      representativeRecipeId: recipeIds[0]!,
      recipeIds: Object.freeze(recipeIds),
    }))
    .sort((a, b) => a.representativeRecipeId - b.representativeRecipeId))

export function cosmicExpertScenarioDataById(id: string): CosmicExpertScenarioDataEntry | null {
  return COSMIC_EXPERT_SCENARIO_DATA.find((entry) => entry.scenarioId === id) ?? null
}

export function cosmicExpertScenarioDataByRecipeId(recipeId: number): CosmicExpertScenarioDataEntry | null {
  return COSMIC_EXPERT_SCENARIO_DATA.find(
    (entry) => entry.recipe.canonicalRecipeId === recipeId,
  ) ?? null
}

export { COSMIC_EXPERT_GENERATED_SOURCE }
