<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { previewAction, type CraftActionId, type CrafterProfile, type CraftState, type MaterialCondition } from '@frozen-rabbit-expert/domain'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import ActionPanel from './components/ActionPanel.vue'
import SessionTools from './components/SessionTools.vue'
import StatePanel from './components/StatePanel.vue'
import StatsSetup from './components/StatsSetup.vue'
import { useCraftSession } from './composables/useCraftSession'

const { t } = useI18n()
const session = useCraftSession()
const isDark = ref(true)
const pendingAction = ref<CraftActionId | null>(null)

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
  pendingAction.value = null
  session.restart(profile)
}

function resync(patch: Partial<CraftState>, reason: string): void {
  pendingAction.value = null
  session.resync(patch, reason)
}

function chooseCondition(condition: MaterialCondition): void {
  pendingAction.value = null
  session.chooseCondition(condition)
}

function chooseAction(action: CraftActionId): void {
  const preview = previewAction(session.recipe, session.crafter, session.state.value, action)
  if (preview.successRate < 1) pendingAction.value = action
  else session.executeAction(action, true)
}

function resolvePending(success: boolean): void {
  if (!pendingAction.value) return
  session.executeAction(pendingAction.value, success)
  pendingAction.value = null
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
        <aside v-if="pendingAction" class="outcome-flash pending-outcome" aria-live="polite">
          <span><strong>{{ t(`action.${pendingAction}`) }}</strong> 不是必定成功，請選擇本次結果。</span>
          <span class="outcome-choice">
            <button type="button" class="primary-button" @click="resolvePending(true)">成功</button>
            <button type="button" class="ghost-button" @click="resolvePending(false)">失敗</button>
          </span>
        </aside>

        <div class="stats-summary" aria-label="目前裝備三圍">
          <span>作業精度 <strong>{{ session.crafter.craftsmanship.toLocaleString() }}</strong></span>
          <span>加工精度 <strong>{{ session.crafter.control.toLocaleString() }}</strong></span>
          <span>CP <strong>{{ session.crafter.maxCp.toLocaleString() }}</strong></span>
          <span>宇宙工具 <strong>{{ session.crafter.cosmicToolGoodBonus ? 'ON' : 'OFF' }}</strong></span>
        </div>

        <div class="workspace-grid">
        <div class="left-column">
          <StatePanel :recipe="session.recipe" :state="session.state.value" @select-condition="chooseCondition" />

          <section class="panel history-panel" aria-labelledby="history-title">
            <div class="panel-heading compact">
              <div><p class="section-kicker">SESSION PATH</p><h2 id="history-title">最近步驟</h2></div>
              <span>{{ session.actionCount.value }} ACTIONS</span>
            </div>
            <ol v-if="history.length" class="history-list">
              <li v-for="(row, index) in history" :key="row.id">
                <span class="history-index">{{ session.actionCount.value - index }}</span>
                <div><strong>{{ t(`action.${row.action}`) }}</strong><small>{{ row.success ? '成功' : '失敗' }}</small></div>
              </li>
            </ol>
            <p v-else class="history-empty">先選擇本步球色，再點擊技能。非 100% 技能會請你選擇成功或失敗。</p>
          </section>
        </div>

          <ActionPanel :recipe="session.recipe" :crafter="session.crafter" :state="session.state.value" :locked="pendingAction !== null" @select="chooseAction" />
        </div>

        <SessionTools
          :recipe="session.recipe"
          :crafter="session.crafter"
          :state="session.state.value"
          :can-undo="session.actionCount.value > 0"
          @undo="pendingAction = null; session.undo()"
          @export="session.exportSession"
          @restart="restart"
          @resync="resync"
        />
      </div>
    </main>

    <footer>
      <span>Mechanics {{ MODEL_VERSIONS.mechanics }}</span>
      <span>Condition {{ MODEL_VERSIONS.conditionProfiles }}</span>
    </footer>
  </div>
</template>
