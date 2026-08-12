import type { CraftObjective, RecipeProfile } from '@frozen-rabbit-expert/domain'

export const SURVEY_CRAFTSMANS_COMMAND_BREW_CONDITIONS = [
  'normal',
  'good',
  'malleable',
] as const

const SURVEY_CRAFTSMANS_COMMAND_BREW_SOURCE = {
  sourceKind: 'datamined' as const,
  sourceUrl: 'https://v2.xivapi.com/api/sheet/Recipe/36582',
  sourceRevision: 'game-data:c3f948214b90e498;schema:83e965d091116f895d5b17573cc5d12909a5f407',
  patch: '7.21',
  verifiedAt: '2026-08-12',
  confidence: 'verified' as const,
  notes: [
    'Recipe 36582 與 Item 48570 已由 XIVAPI game data、Teamcraft canonical index 與玩家繁中畫面交叉確認。',
    'RecipeLevelTable 726；DifficultyFactor 100、DurabilityFactor 69、QualityFactor 120，得到作業 10000、耐久 55、品質上限 12000。',
    'RequiredQuality 為 0；作業完成就是 mechanics completion，品質只屬 collectability／任務分數目標。',
    'ConditionsFlag 131 與玩家畫面一致：通常、高品質、大進展。',
  ],
} as const

export const SURVEY_CRAFTSMANS_COMMAND_BREW: RecipeProfile = {
  profileId: 'survey-craftsmans-command-brew-36582-v1',
  canonicalRecipeId: 36582,
  canonicalItemId: 48570,
  itemIconId: 20713,
  identityConfidence: 'verified',
  recipeFamilyId: 'sinus-ardorum-ex-artisans-mixtures-command-brew',
  missionFamily: 'sinus-ardorum-ex-artisans-mixtures',
  displayName: '宇宙探索用的巨匠藥',
  displayNameEn: "Survey Craftsman's Command Brew",
  job: 'alchemist',
  recipeLevel: 726,
  progressRequired: 10000,
  qualityMax: 12000,
  requiredQuality: 0,
  durabilityMax: 55,
  progressDivider: 170,
  qualityDivider: 150,
  progressModifier: 90,
  qualityModifier: 75,
  recommendedCraftsmanship: 4740,
  availableConditions: SURVEY_CRAFTSMANS_COMMAND_BREW_CONDITIONS,
  qualityOutcome: 'collectability',
  conditionProfileId: 'manual-command-brew-condition-selection-v1',
  source: SURVEY_CRAFTSMANS_COMMAND_BREW_SOURCE,
}

export const SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE: CraftObjective = {
  objectiveId: 'survey-craftsmans-command-brew-score-max-v1',
  recipeProfileId: SURVEY_CRAFTSMANS_COMMAND_BREW.profileId,
  mode: 'maximize-quality-with-safe-completion',
  qualityTarget: SURVEY_CRAFTSMANS_COMMAND_BREW.qualityMax,
  qualityTiers: [
    { id: 'scored', minimumQuality: 6000, minimumCollectability: 600 },
    { id: 'mid', minimumQuality: 7200, minimumCollectability: 720 },
    { id: 'high', minimumQuality: 10200, minimumCollectability: 1020 },
    { id: 'maximum', minimumQuality: 12000, minimumCollectability: 1200 },
  ],
  source: {
    sourceKind: 'empirical',
    sourceUrl: 'https://ffxiv.consolegameswiki.com/wiki/EX%3A_Artisan%27s_Mixtures',
    sourceRevision: 'player-ui-and-community-score-table-2026-08-12',
    patch: '7.21',
    verifiedAt: '2026-08-12',
    confidence: 'provisional',
    notes: [
      '任務表確認收藏價值 600–719 為 100 分、720–1019 為 300 分、1020–1200 為 700–1000 分。',
      '本 objective 追求滿品質 12000／收藏價值 1200／1000 分；繼續加工若會失去完工路線，安全規則仍允許收尾。',
      '使用者要求單件至少 800 分；暫以頂段線性內插推定收藏價值 1080／品質 10800 作 evaluator 護欄，待下一張遊戲內區間畫面確認。',
    ],
  },
}

/** 暫定 800 分護欄；並非已驗證的遊戲內精確換算。 */
export const SURVEY_CRAFTSMANS_COMMAND_BREW_PROVISIONAL_800_POINT_QUALITY = 10_800
