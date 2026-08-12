import type { CraftState, CrafterProfile, RecipeProfile } from '@frozen-rabbit-expert/domain'
import { MODEL_VERSIONS, type ExpertSessionExport, type SessionEvent } from './events'

export function createSessionExport(
  scenarioId: string,
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialState: CraftState,
  events: SessionEvent[],
): ExpertSessionExport {
  if (scenarioId.trim().length === 0) throw new Error('scenarioId is required for session export')
  return {
    manifest: {
      schema: MODEL_VERSIONS.sessionCodec,
      scenarioId,
      scenario: recipe.missionFamily,
      createdAt: new Date().toISOString(),
      modelVersions: MODEL_VERSIONS,
    },
    recipe,
    crafter,
    initialState,
    events,
    notes: [
      '此 POC 不包含角色名稱或伺服器資料。',
      '配方與主要數值公式已對照 XIVAPI game data 與 Teamcraft simulator；TW 7.51 已有一筆 scoped empirical quality correction，以及一條完整成功 golden trace，仍待 failure／recovery traces 擴充驗證。',
      'Condition 由使用者逐步選擇；runtime 不會自動抽取 condition。',
    ],
  }
}
