<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MATERIAL_CONDITIONS, previewAction, type CraftActionId, type CrafterProfile, type CraftState, type MaterialCondition } from '@frozen-rabbit-expert/domain'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import ActionIcon from './components/ActionIcon.vue'
import ActionPanel from './components/ActionPanel.vue'
import RecommendationCard from './components/RecommendationCard.vue'
import SessionTools from './components/SessionTools.vue'
import StatePanel from './components/StatePanel.vue'
import StatsSetup from './components/StatsSetup.vue'
import { useCraftSession } from './composables/useCraftSession'

const { t } = useI18n()
const session = useCraftSession()
const isDark = ref(true)
const pendingSuccess = ref<boolean | null>(null)
const pendingNextCondition = ref<MaterialCondition | null>(null)

const history = computed(() => {
  const rows: Array<{ id: string; action: CraftActionId; success: boolean }> = []
  for (let index = 0; index < session.events.value.length; index += 1) {
    const used = session.events.value[index]
    const resolved = session.events.value[index + 1]
    if (used?.type === 'craftActionUsed' && resolved?.type === 'craftActionResolved') {
      rows.push({ id: resolved.id, action: used.action, success: resolved.success })
      index += 1
    }
  }
  return rows.reverse().slice(0, 6)
})

function toggleTheme(): void {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

function restart(profile: Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus'>): void {
  clearPendingFeedback()
  session.restart(profile)
}

function resync(patch: Partial<CraftState>, reason: string): void {
  clearPendingFeedback()
  session.resync(patch, reason)
}

function chooseCondition(condition: MaterialCondition): void {
  session.chooseCondition(condition)
}

function chooseAction(action: CraftActionId): void {
  if (!session.conditionConfirmed.value || session.pendingAction.value !== null) return
  const preview = previewAction(session.recipe, session.crafter, session.state.value, action)
  if (!preview.legal) return
  pendingSuccess.value = preview.successRate === 1 ? true : null
  pendingNextCondition.value = null
  session.beginAction(action)
}

function clearPendingFeedback(): void {
  pendingSuccess.value = null
  pendingNextCondition.value = null
}

function cancelPending(): void {
  session.undo()
  clearPendingFeedback()
}

function resolvePending(): void {
  if (pendingSuccess.value === null || pendingNextCondition.value === null) return
  session.resolveAction(pendingSuccess.value, pendingNextCondition.value)
  clearPendingFeedback()
}

document.documentElement.classList.toggle('dark', isDark.value)
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"><span>◇</span></span>
        <div>
          <p>{{ t('app.eyebrow') }}</p>
          <h1>{{ t('app.title') }}</h1>
        </div>
      </div>
      <div class="header-actions">
        <span class="local-pill"><span /> LOCAL ONLY</span>
        <button type="button" class="theme-toggle" :aria-label="isDark ? '切換為淺色模式' : '切換為深色模式'" @click="toggleTheme">
          {{ isDark ? '☾' : '☀' }}
        </button>
      </div>
    </header>

    <main>
      <section class="recipe-hero">
        <div>
          <p class="section-kicker">BLACKSMITH · LEVEL 100 · EXPERT RECIPE</p>
          <h2>{{ session.recipe.displayName }}</h2>
          <p>{{ session.recipe.displayNameEn }} · 固定配方 POC。輸入裝備三圍後，由玩家選擇每一步球色與技能。</p>
        </div>
        <dl class="recipe-facts">
          <div><dt>難度</dt><dd>{{ session.recipe.progressRequired.toLocaleString() }}</dd></div>
          <div><dt>耐久</dt><dd>{{ session.recipe.durabilityMax }}</dd></div>
          <div><dt>品質上限</dt><dd>{{ session.recipe.qualityMax.toLocaleString() }}</dd></div>
        </dl>
      </section>

      <aside class="evidence-banner">
        <span class="evidence-icon" aria-hidden="true">!</span>
        <div><strong>已接上遊戲資料與 Teamcraft 數值公式</strong><p>配方 ID、recipe level 參數與 action 計算已有來源；本版不抽 condition，球色完全由使用者選擇。</p></div>
      </aside>

      <StatsSetup v-if="!session.configured.value" :recipe="session.recipe" :initial="session.savedEquipment.value" @start="restart" />

      <div v-else class="simulation-shell">
        <section v-if="session.pendingAction.value" class="feedback-gate" aria-live="assertive" aria-labelledby="feedback-title">
          <div class="feedback-heading">
            <ActionIcon :action="session.pendingAction.value" size="large" />
            <div>
              <p class="section-kicker">完成本步回報後才會計算下一技能</p>
              <h2 id="feedback-title">{{ t(`action.${session.pendingAction.value}`) }}</h2>
              <p>請依遊戲畫面回報技能結果與結算後的新球色。資料不完整時，推薦會保持鎖定。</p>
            </div>
          </div>

          <div class="feedback-section">
            <strong class="feedback-label">1. 本次技能結果</strong>
            <p v-if="pendingSuccess === true && previewAction(session.recipe, session.crafter, session.state.value, session.pendingAction.value).successRate === 1" class="deterministic-result">此技能必定成功，已自動記為成功。</p>
            <div v-else class="result-buttons">
              <button type="button" :class="{ active: pendingSuccess === true }" :aria-pressed="pendingSuccess === true" @click="pendingSuccess = true">成功</button>
              <button type="button" class="failure" :class="{ active: pendingSuccess === false }" :aria-pressed="pendingSuccess === false" @click="pendingSuccess = false">失敗</button>
            </div>
          </div>

          <div class="feedback-section">
            <strong class="feedback-label">2. 結算後的新球色</strong>
            <div class="condition-gate-grid">
              <button
                v-for="condition in MATERIAL_CONDITIONS"
                :key="condition"
                type="button"
                :data-condition="condition"
                :class="{ active: pendingNextCondition === condition }"
                :aria-pressed="pendingNextCondition === condition"
                @click="pendingNextCondition = condition"
              >
                <span class="condition-dot" aria-hidden="true" />
                {{ t(`condition.${condition}`) }}
              </button>
            </div>
          </div>

          <div class="feedback-actions">
            <button type="button" class="ghost-button" @click="cancelPending">取消本次技能</button>
            <button type="button" class="primary-button" :disabled="pendingSuccess === null || pendingNextCondition === null" @click="resolvePending">套用回報並計算下一步</button>
          </div>
        </section>

        <section v-else class="condition-gate" :class="{ 'condition-gate--required': !session.conditionConfirmed.value }" aria-labelledby="condition-gate-title">
          <div class="condition-gate-copy">
            <p class="section-kicker">{{ session.conditionConfirmed.value ? `STEP ${session.state.value.step} · CONDITION 已回報` : `STEP ${session.state.value.step} · 必填` }}</p>
            <h2 id="condition-gate-title">{{ session.conditionConfirmed.value ? '確認本步球色' : '先選擇本步球色' }}</h2>
            <p>{{ session.conditionConfirmed.value ? '若遊戲畫面不同，請在施放技能前修正。' : '球色會改變技能成本、成功率與收益；未回報前不會顯示或允許施放推薦技能。' }}</p>
          </div>
          <div class="condition-gate-grid">
            <button
              v-for="condition in MATERIAL_CONDITIONS"
              :key="condition"
              type="button"
              :data-condition="condition"
              :class="{ active: session.conditionConfirmed.value && session.state.value.condition === condition }"
              :aria-pressed="session.conditionConfirmed.value && session.state.value.condition === condition"
              @click="chooseCondition(condition)"
            >
              <span class="condition-dot" aria-hidden="true" />
              {{ t(`condition.${condition}`) }}
            </button>
          </div>
        </section>

        <div class="stats-summary" aria-label="目前裝備三圍">
          <span>作業精度 <strong>{{ session.crafter.craftsmanship.toLocaleString() }}</strong></span>
          <span>加工精度 <strong>{{ session.crafter.control.toLocaleString() }}</strong></span>
          <span>CP <strong>{{ session.crafter.maxCp.toLocaleString() }}</strong></span>
          <span>宇宙工具 <strong>{{ session.crafter.cosmicToolGoodBonus ? 'ON' : 'OFF' }}</strong></span>
        </div>

        <RecommendationCard
          v-if="session.recommendation.value"
          :recommendation="session.recommendation.value"
          :locked="session.pendingAction.value !== null || !session.conditionConfirmed.value"
          :research-status="session.researchStatus.value"
          :research-analysis="session.researchAnalysis.value"
          :research-error="session.researchError.value"
          @select="chooseAction"
        />

        <section
          v-else-if="session.conditionConfirmed.value && session.researchStatus.value === 'analyzing'"
          class="recommendation-card recommendation-pending"
          aria-live="polite"
          aria-labelledby="research-pending-title"
        >
          <div class="recommendation-main recommendation-main--pending">
            <span class="research-spinner" aria-hidden="true" />
            <div class="recommendation-copy">
              <div class="recommendation-kicker">
                <span>RESEARCH TEACHER</span>
                <span class="recommendation-model">48 PAIRED ROLLOUTS</span>
              </div>
              <h2 id="research-pending-title">正在計算本步推薦</h2>
              <p>比較完整 episode、combo、改革視窗與資源收尾後，才會一次顯示最終技能。</p>
            </div>
          </div>
        </section>

        <div class="workspace-grid">
        <div class="left-column">
          <StatePanel :recipe="session.recipe" :state="session.state.value" />

          <section class="panel history-panel" aria-labelledby="history-title">
            <div class="panel-heading compact">
              <div><p class="section-kicker">SESSION PATH</p><h2 id="history-title">最近步驟</h2></div>
              <span>{{ session.actionCount.value }} ACTIONS</span>
            </div>
            <ol v-if="history.length" class="history-list">
              <li v-for="(row, index) in history" :key="row.id">
                <span class="history-index">{{ session.actionCount.value - index }}</span>
                <ActionIcon :action="row.action" size="small" />
                <div><strong>{{ t(`action.${row.action}`) }}</strong><small>{{ row.success ? '成功' : '失敗' }}</small></div>
              </li>
            </ol>
            <p v-else class="history-empty">先選擇本步球色，再點擊技能。非 100% 技能會請你選擇成功或失敗。</p>
          </section>
        </div>

          <ActionPanel
            :recipe="session.recipe"
            :crafter="session.crafter"
            :state="session.state.value"
            :locked="session.pendingAction.value !== null || !session.conditionConfirmed.value"
            :recommended-action="session.recommendation.value?.action"
            @select="chooseAction"
          />
        </div>

        <SessionTools
          :recipe="session.recipe"
          :crafter="session.crafter"
          :state="session.state.value"
          :can-undo="session.actionCount.value > 0 || session.pendingAction.value !== null"
          @undo="clearPendingFeedback(); session.undo()"
          @export="session.exportSession"
          @restart="restart"
          @resync="resync"
        />
      </div>
    </main>

    <footer>
      <span>Mechanics {{ MODEL_VERSIONS.mechanics }}</span>
      <span>Policy {{ MODEL_VERSIONS.cosmicTitaniumPolicy }}</span>
      <span>Condition {{ MODEL_VERSIONS.conditionProfiles }}</span>
      <span>FINAL FANTASY XIV © SQUARE ENIX</span>
    </footer>
  </div>
</template>
