import type { CraftObjective, RecipeProfile } from '@frozen-rabbit-expert/domain'

export const ELEVATING_PLATFORMS_CONDITIONS = [
  'normal',
  'good',
  'goodOmen',
  'sturdy',
  'pliant',
  'malleable',
  'primed',
] as const

const HARDENED_SURVEY_PLANK_SOURCE = {
  sourceKind: 'datamined' as const,
  sourceUrl: 'https://v2.xivapi.com/api/sheet/Recipe/36205',
  sourceRevision: 'game-data:c3f948214b90e498;schema:83e965d091116f895d5b17573cc5d12909a5f407',
  patch: '7.21',
  verifiedAt: '2026-08-12',
  confidence: 'verified' as const,
  notes: [
    'Recipe 36205 與 Item 48263 已由 XIVAPI game data 對上 Hardened Survey Plank、Carpenter、expert flag 與配方數值。',
    'RecipeLevelTable 742、DifficultyFactor 47、DurabilityFactor 25、QualityFactor 149，得到作業 4700、耐久 20、品質上限 14900。',
    'RequiredQuality 14900 等於品質上限；任務資料與玩家球色截圖確認球色為通常、高品質、好兆頭、結實、高效、大進展、長持續。',
  ],
} as const

export const HARDENED_SURVEY_PLANK: RecipeProfile = {
  profileId: 'hardened-survey-plank-36205-v1',
  canonicalRecipeId: 36205,
  canonicalItemId: 48263,
  itemIconId: 22509,
  identityConfidence: 'verified',
  recipeFamilyId: 'sinus-ardorum-explus-elevating-platforms',
  missionFamily: 'sinus-ardorum-explus-elevating-platforms',
  displayName: '宇宙探索用的硬化木板',
  displayNameEn: 'Hardened Survey Plank',
  job: 'carpenter',
  recipeLevel: 742,
  progressRequired: 4700,
  qualityMax: 14900,
  requiredQuality: 14900,
  durabilityMax: 20,
  progressDivider: 180,
  qualityDivider: 180,
  progressModifier: 100,
  qualityModifier: 100,
  recommendedCraftsmanship: 5380,
  availableConditions: ELEVATING_PLATFORMS_CONDITIONS,
  qualityOutcome: 'required-quality',
  conditionProfileId: 'manual-elevating-platforms-condition-selection-v1',
  source: HARDENED_SURVEY_PLANK_SOURCE,
}

export const HARDENED_SURVEY_PLANK_OBJECTIVE: CraftObjective = {
  objectiveId: 'hardened-survey-plank-required-quality-v1',
  recipeProfileId: HARDENED_SURVEY_PLANK.profileId,
  mode: 'required-quality',
  qualityTiers: [
    { id: 'maximum', minimumQuality: 14900, minimumCollectability: 1490 },
  ],
  source: HARDENED_SURVEY_PLANK_SOURCE,
}

const MOBILE_WORK_STAIRS_SOURCE = {
  sourceKind: 'datamined' as const,
  sourceUrl: 'https://v2.xivapi.com/api/sheet/Recipe/36208',
  sourceRevision: 'game-data:c3f948214b90e498;schema:83e965d091116f895d5b17573cc5d12909a5f407',
  patch: '7.21',
  verifiedAt: '2026-08-12',
  confidence: 'verified' as const,
  notes: [
    'Recipe 36208 與 Item 48311 已由 XIVAPI game data 對上 Mobile Work Stairs、Carpenter、expert flag 與配方數值。',
    'RecipeLevelTable 744、DifficultyFactor 93、DurabilityFactor 75、QualityFactor 225，得到作業 9300、耐久 60、品質上限 22500。',
    'RequiredQuality 為 0、CanBeHq 為 true、Item IsCollectable 為 false；任務表為 NQ 200 分、HQ 800 分。',
  ],
} as const

export const MOBILE_WORK_STAIRS: RecipeProfile = {
  profileId: 'mobile-work-stairs-36208-v1',
  canonicalRecipeId: 36208,
  canonicalItemId: 48311,
  itemIconId: 52386,
  identityConfidence: 'verified',
  recipeFamilyId: 'sinus-ardorum-explus-elevating-platforms',
  missionFamily: 'sinus-ardorum-explus-elevating-platforms',
  displayName: '高空作業用的腳手架',
  displayNameEn: 'Mobile Work Stairs',
  job: 'carpenter',
  recipeLevel: 744,
  progressRequired: 9300,
  qualityMax: 22500,
  requiredQuality: 0,
  durabilityMax: 60,
  progressDivider: 180,
  qualityDivider: 180,
  progressModifier: 100,
  qualityModifier: 100,
  recommendedCraftsmanship: 5380,
  availableConditions: ELEVATING_PLATFORMS_CONDITIONS,
  qualityOutcome: 'hq-chance',
  conditionProfileId: 'manual-elevating-platforms-condition-selection-v1',
  source: MOBILE_WORK_STAIRS_SOURCE,
}

export const MOBILE_WORK_STAIRS_OBJECTIVE: CraftObjective = {
  objectiveId: 'mobile-work-stairs-hq-chance-v2',
  recipeProfileId: MOBILE_WORK_STAIRS.profileId,
  mode: 'maximize-quality-with-safe-completion',
  qualityTiers: [],
  source: {
    sourceKind: 'empirical',
    sourceUrl: 'https://ffxiv.consolegameswiki.com/wiki/EX%2B%3A_Elevating_Platforms',
    sourceRevision: 'player-mission-screenshot-and-community-table-2026-08-12',
    patch: '7.21',
    verifiedAt: '2026-08-12',
    confidence: 'provisional',
    notes: [
      '使用者任務截圖與任務表確認此成品不是收藏品，NQ 為 200 分、HQ 為 800 分。',
      'policy 以社群 HQ 曲線比較品質效用並保留完成路線；該曲線仍需遊戲內顯示百分比交叉驗證。',
    ],
  },
}
