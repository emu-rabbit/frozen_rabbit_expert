import type {
  CraftObjective,
  CraftState,
  CrafterProfile,
  ModelVersions,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  MODEL_VERSIONS,
  type ExpertSessionExport,
  type SessionEvent,
  type SessionRiskPreference,
} from './events'

export function createSessionExport(
  scenarioId: string,
  recipe: RecipeProfile,
  objective: CraftObjective,
  crafter: CrafterProfile,
  riskPreference: SessionRiskPreference,
  initialState: CraftState,
  events: SessionEvent[],
  modelVersions: ModelVersions = MODEL_VERSIONS,
): ExpertSessionExport {
  if (scenarioId.trim().length === 0) throw new Error('scenarioId is required for session export')
  if (objective.recipeProfileId !== recipe.profileId) {
    throw new Error('session export objective does not belong to recipe')
  }
  return {
    manifest: {
      schema: modelVersions.sessionCodec,
      scenarioId,
      scenario: recipe.missionFamily,
      createdAt: new Date().toISOString(),
      modelVersions: { ...modelVersions },
    },
    recipe,
    objective,
    crafter,
    riskPreference,
    initialState,
    events,
    notes: [
      '匯出資料不包含角色名稱或伺服器資料。',
      '配方 catalog、mechanics 與 generic planner 各自保存版本；舊五配方 guide 只作歷史 regression，不是此場 live policy。',
      'Policy objective 與風險偏好一併保存，讓推薦輸入可重播。',
      'Condition 由使用者逐步回報；runtime 不讀取遊戲記憶體、封包，也不自動按鍵。',
    ],
  }
}
