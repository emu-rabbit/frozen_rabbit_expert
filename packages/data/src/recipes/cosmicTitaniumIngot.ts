import type { CraftObjective, RecipeProfile } from '@frozen-rabbit-expert/domain'

export const COSMIC_TITANIUM_INGOT: RecipeProfile = {
  profileId: 'cosmotized-ilmenite-ingot-36282-v1',
  canonicalRecipeId: 36282,
  canonicalItemId: 48360,
  itemIconId: 21020,
  identityConfidence: 'verified',
  recipeFamilyId: 'sinus-ardorum-explus-equipment-materials-i',
  missionFamily: 'sinus-ardorum-explus-equipment-materials-i',
  displayName: '宇宙鈦鐵錠',
  displayNameEn: 'Cosmotized Ilmenite Ingot',
  job: 'blacksmith',
  recipeLevel: 746,
  progressRequired: 7300,
  qualityMax: 18900,
  requiredQuality: 18900,
  durabilityMax: 30,
  progressDivider: 180,
  qualityDivider: 180,
  progressModifier: 100,
  qualityModifier: 100,
  recommendedCraftsmanship: 5380,
  availableConditions: ['normal', 'good', 'centered', 'sturdy', 'pliant', 'malleable'],
  qualityOutcome: 'required-quality',
  conditionProfileId: 'manual-condition-selection-v1',
  source: {
    sourceKind: 'datamined',
    sourceUrl: 'https://v2.xivapi.com/api/sheet/Recipe/36282',
    sourceRevision: 'game-data:c3f948214b90e498;schema:cf037c37eff351db4d1ca5952e10cc08c131b828',
    patch: '7.51',
    verifiedAt: '2026-08-11',
    confidence: 'verified',
    notes: [
      'Recipe 36282 與 Item 48360 已由 XIVAPI game data 對上英文名稱、配方數值與 expert flag。',
      '遊戲內繁中名稱與使用者提供的截圖一致。',
      'RecipeLevelTable 746：progress/quality divider 180、modifier 100、建議作業精度 5380。',
    ],
  },
}

export const COSMIC_TITANIUM_INGOT_OBJECTIVE: CraftObjective = {
  objectiveId: 'cosmotized-ilmenite-ingot-required-quality-v1',
  recipeProfileId: COSMIC_TITANIUM_INGOT.profileId,
  mode: 'required-quality',
  qualityTarget: COSMIC_TITANIUM_INGOT.requiredQuality,
  qualityTiers: [
    { id: 'maximum', minimumQuality: 18900, minimumCollectability: 1890 },
  ],
  source: COSMIC_TITANIUM_INGOT.source,
}
