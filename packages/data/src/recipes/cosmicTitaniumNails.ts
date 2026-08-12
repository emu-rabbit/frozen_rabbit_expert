import type { CraftObjective, RecipeProfile } from '@frozen-rabbit-expert/domain'

export const COSMIC_TITANIUM_NAILS: RecipeProfile = {
  profileId: 'cosmotized-ilmenite-nails-36283-v1',
  canonicalRecipeId: 36283,
  canonicalItemId: 48361,
  identityConfidence: 'verified',
  recipeFamilyId: 'sinus-ardorum-explus-equipment-materials-i',
  missionFamily: 'sinus-ardorum-explus-equipment-materials-i',
  displayName: '宇宙鈦鐵釘',
  displayNameEn: 'Cosmotized Ilmenite Nails',
  job: 'blacksmith',
  recipeLevel: 746,
  progressRequired: 10000,
  qualityMax: 27400,
  requiredQuality: 0,
  durabilityMax: 55,
  progressDivider: 180,
  qualityDivider: 180,
  progressModifier: 100,
  qualityModifier: 100,
  recommendedCraftsmanship: 5380,
  conditionProfileId: 'manual-condition-selection-v1',
  source: {
    sourceKind: 'datamined',
    sourceUrl: 'https://v2.xivapi.com/api/sheet/Recipe/36283',
    sourceRevision: 'game-data:c3f948214b90e498;schema:83e965d091116f895d5b17573cc5d12909a5f407',
    patch: '7.55',
    verifiedAt: '2026-08-12',
    confidence: 'verified',
    notes: [
      'Recipe 36283 與 Item 48361 已由 XIVAPI game data 對上英文名稱、配方數值、collectable 與 expert flag。',
      'RecipeLevelTable 746；DifficultyFactor 100、DurabilityFactor 69、QualityFactor 274，得到作業 10000、耐久 55、品質上限 27400。',
      'RequiredQuality 為 0；作業完成就是 mechanics completion，品質只屬 policy／任務分數目標。',
    ],
  },
}

export const COSMIC_TITANIUM_NAILS_OBJECTIVE: CraftObjective = {
  objectiveId: 'cosmotized-ilmenite-nails-score-max-v1',
  recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
  mode: 'maximize-quality-with-safe-completion',
  qualityTarget: COSMIC_TITANIUM_NAILS.qualityMax,
  qualityTiers: [
    { id: 'scored', minimumQuality: 16440, minimumCollectability: 1644 },
    { id: 'mid', minimumQuality: 19180, minimumCollectability: 1918 },
    { id: 'high', minimumQuality: 24660, minimumCollectability: 2466 },
    { id: 'maximum', minimumQuality: 27400, minimumCollectability: 2740 },
  ],
  source: {
    sourceKind: 'datamined',
    sourceUrl: 'https://v2.xivapi.com/api/sheet/Recipe/36283',
    sourceRevision: 'game-data:c3f948214b90e498;schema:83e965d091116f895d5b17573cc5d12909a5f407',
    patch: '7.55',
    verifiedAt: '2026-08-12',
    confidence: 'verified',
    notes: [
      'WKSMissionToDoEvalutionRefin row 59 defines 60%／70%／90% quality thresholds；collectability is displayed quality divided by 10.',
      '本 objective 追求滿品質，但安全規則允許在繼續加工會失去完工路線時，以目前品質收尾。',
      '精確任務點數內插仍待不同品質的遊戲內結算證據，不在此 objective 推測。',
    ],
  },
}
