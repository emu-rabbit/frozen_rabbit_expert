import type {
  CraftObjective,
  CraftState,
  CrafterProfile,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  MODEL_VERSIONS,
  type ExpertSessionExport,
  type SessionEvent,
  type SessionRiskPreference,
  type SessionSupportSnapshot,
} from './events'

export function createSessionExport(
  scenarioId: string,
  recipe: RecipeProfile,
  objective: CraftObjective,
  crafter: CrafterProfile,
  riskPreference: SessionRiskPreference,
  support: SessionSupportSnapshot,
  initialState: CraftState,
  events: SessionEvent[],
): ExpertSessionExport {
  if (scenarioId.trim().length === 0) throw new Error('scenarioId is required for session export')
  if (objective.recipeProfileId !== recipe.profileId) {
    throw new Error('session export objective does not belong to recipe')
  }
  return {
    manifest: {
      schema: MODEL_VERSIONS.sessionCodec,
      scenarioId,
      scenario: recipe.missionFamily,
      createdAt: new Date().toISOString(),
      modelVersions: MODEL_VERSIONS,
    },
    recipe,
    objective,
    crafter,
    riskPreference,
    support,
    initialState,
    events,
    notes: [
      '匯出資料不包含角色名稱或伺服器資料。',
      '配方 catalog、mechanics 與 generic planner 各自保存版本；舊五配方 guide 只作歷史 regression，不是此場 live policy。',
      'Policy objective、風險偏好與當次支援／coverage 層級一併保存，讓推薦輸入與信心邊界可重播。',
      'Condition 由使用者逐步回報；runtime 不讀取遊戲記憶體、封包，也不自動按鍵。',
    ],
  }
}
