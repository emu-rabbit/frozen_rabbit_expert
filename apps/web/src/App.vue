<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ACTIONS,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import ActionIcon from './components/ActionIcon.vue'
import ActionPanel from './components/ActionPanel.vue'
import ItemIcon from './components/ItemIcon.vue'
import RecommendationCard from './components/RecommendationCard.vue'
import SessionTools from './components/SessionTools.vue'
import StatePanel from './components/StatePanel.vue'
import StatsSetup from './components/StatsSetup.vue'
import { useCraftSession } from './composables/useCraftSession'
import type { CraftScenarioId } from './scenarios'

const { t } = useI18n()
const session = useCraftSession()
const isDark = ref(true)
const pendingSuccess = ref<boolean | null>(null)
const showConditionCorrection = ref(false)
const secondaryPanel = ref<HTMLDetailsElement | null>(null)
const thirdPartyNoticesHref = `${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.md`

const pendingPreview = computed(() => session.pendingAction.value === null
  ? null
  : previewAction(session.recipe.value, session.crafter, session.state.value, session.pendingAction.value))
const pendingNeedsResult = computed(() => (pendingPreview.value?.successRate ?? 1) < 1)
const pendingResolutionSuccess = computed(() => pendingSuccess.value
  ?? (pendingPreview.value?.successRate === 1 ? true : null))
const pendingKeepsCondition = computed(() => session.pendingAction.value !== null
  && ACTIONS[session.pendingAction.value].noStep === true
  && ACTIONS[session.pendingAction.value].rerollsCondition !== true)
const pendingForcesGood = computed(() => session.pendingAction.value !== null
  && session.state.value.condition === 'goodOmen'
  && ACTIONS[session.pendingAction.value].noStep !== true)
const recommendationPreview = computed(() => session.recommendation.value === null
  ? null
  : previewAction(session.recipe.value, session.crafter, session.state.value, session.recommendation.value.action))
const recommendationNeedsResult = computed(() => (recommendationPreview.value?.successRate ?? 1) < 1)
const recommendationResolutionSuccess = computed(() => pendingSuccess.value
  ?? (recommendationPreview.value?.successRate === 1 ? true : null))
const recommendationKeepsCondition = computed(() => session.recommendation.value !== null
  && ACTIONS[session.recommendation.value.action].noStep === true
  && ACTIONS[session.recommendation.value.action].rerollsCondition !== true)
const recommendationForcesGood = computed(() => session.recommendation.value !== null
  && session.state.value.condition === 'goodOmen'
  && ACTIONS[session.recommendation.value.action].noStep !== true)
const terminalMessage = computed(() => {
  if (session.state.value.terminal !== 'completed') {
    return session.state.value.failureReason === 'required-quality'
      ? '作業先完成，但此配方要求品質滿值，因此本場沒有達成。'
      : '耐久已歸零，請保留紀錄供後續調整。'
  }
  if (session.recipe.value.qualityOutcome === 'hq-chance') {
    return `作業已完成；最終品質 ${session.state.value.quality.toLocaleString()} / ${session.recipe.value.qualityMax.toLocaleString()}。遊戲會依此品質進行一次 HQ 判定。`
  }
  if (session.recipe.value.qualityOutcome === 'collectability') {
    return `作業已完成；最終品質 ${session.state.value.quality.toLocaleString()}（可收集價值 ${Math.floor(session.state.value.quality / 10).toLocaleString()}）。`
  }
  return '作業與必要品質都已達成。你可以匯出這場紀錄，或以相同裝備開始下一場。'
})

watch(() => session.recommendation.value?.action, () => {
  pendingSuccess.value = null
})

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
  return rows.reverse().slice(0, 8)
})

function toggleTheme(): void {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

function restart(profile: Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'>): void {
  clearPendingFeedback()
  session.restart(profile)
}

function selectScenario(scenarioId: CraftScenarioId): void {
  clearPendingFeedback()
  session.selectScenario(scenarioId)
}

function resync(patch: Partial<CraftState>, reason: string): void {
  clearPendingFeedback()
  session.resync(patch, reason)
}

function chooseCondition(condition: MaterialCondition): void {
  clearPendingFeedback()
  session.chooseCondition(condition)
}

function chooseAction(action: CraftActionId): void {
  if (!session.conditionConfirmed.value || session.pendingAction.value !== null) return
  const preview = previewAction(session.recipe.value, session.crafter, session.state.value, action)
  if (!preview.legal) return
  pendingSuccess.value = preview.successRate === 1 ? true : null
  session.beginAction(action)
  if (secondaryPanel.value) secondaryPanel.value.open = false
}

function resolveWithCondition(condition: MaterialCondition): void {
  if (pendingResolutionSuccess.value === null) return
  session.resolveAction(pendingResolutionSuccess.value, condition)
  clearPendingFeedback()
}

function resolveRecommendationWithCondition(condition: MaterialCondition): void {
  const current = session.recommendation.value
  if (current === null || recommendationResolutionSuccess.value === null) return
  session.completeAction(current.action, recommendationResolutionSuccess.value, condition)
  clearPendingFeedback()
}

function resolvePendingWithoutCondition(): void {
  if (pendingResolutionSuccess.value === null) return
  session.resolveAction(pendingResolutionSuccess.value, session.state.value.condition)
  clearPendingFeedback()
}

function resolvePendingWithForcedGood(): void {
  if (pendingResolutionSuccess.value === null) return
  session.resolveAction(pendingResolutionSuccess.value, 'good')
  clearPendingFeedback()
}

function resolveRecommendationWithoutCondition(): void {
  const current = session.recommendation.value
  if (current === null || recommendationResolutionSuccess.value === null) return
  session.completeAction(
    current.action,
    recommendationResolutionSuccess.value,
    session.state.value.condition,
  )
  clearPendingFeedback()
}

function resolveRecommendationWithForcedGood(): void {
  const current = session.recommendation.value
  if (current === null || recommendationResolutionSuccess.value === null) return
  session.completeAction(current.action, recommendationResolutionSuccess.value, 'good')
  clearPendingFeedback()
}

function clearPendingFeedback(): void {
  pendingSuccess.value = null
  showConditionCorrection.value = false
}

function cancelPending(): void {
  session.undo()
  clearPendingFeedback()
}

function undo(): void {
  clearPendingFeedback()
  session.undo()
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
        <span class="local-pill"><span /> 本機運算</span>
        <button type="button" class="theme-toggle" :aria-label="isDark ? '切換為淺色模式' : '切換為深色模式'" @click="toggleTheme">
          {{ isDark ? '☾' : '☀' }}
        </button>
      </div>
    </header>

    <main>
      <template v-if="!session.configured.value">
        <section class="welcome-copy">
          <p class="section-kicker">宇宙探索 · 高難度製作助手</p>
          <div class="welcome-item">
            <ItemIcon :file-name="session.scenario.value.itemIconFileName" :item-name="session.recipe.value.displayName" size="large" />
            <div><h2>{{ session.recipe.value.displayName }}</h2><small>{{ session.scenario.value.missionLabel }}</small></div>
          </div>
          <p>輸入角色面板數值後，照著每一步的大按鈕回報即可。</p>
        </section>
        <nav class="scenario-picker" aria-label="選擇製作目標">
          <button
            v-for="scenario in session.scenarios"
            :key="scenario.scenarioId"
            type="button"
            :class="{ active: scenario.scenarioId === session.scenarioId.value }"
            :aria-pressed="scenario.scenarioId === session.scenarioId.value"
            @click="selectScenario(scenario.scenarioId)"
          >
            <ItemIcon :file-name="scenario.itemIconFileName" :item-name="scenario.recipe.displayName" size="small" />
            <span><strong>{{ scenario.recipe.displayName }}</strong><small>{{ scenario.recipe.progressRequired }} 作業 · {{ scenario.recipe.durabilityMax }} 耐久</small></span>
          </button>
        </nav>
        <StatsSetup
          :key="session.scenarioId.value"
          :recipe="session.recipe.value"
          :initial="session.savedEquipment.value"
          :default-profile="session.scenario.value.pilotCrafter"
          @start="restart"
        />
      </template>

      <div v-else class="craft-shell">
        <nav class="active-recipe-strip" aria-label="直接切換製作配方">
          <button
            v-for="scenario in session.scenarios"
            :key="scenario.scenarioId"
            type="button"
            :class="{ active: scenario.scenarioId === session.scenarioId.value }"
            :aria-current="scenario.scenarioId === session.scenarioId.value ? 'true' : undefined"
            @click="selectScenario(scenario.scenarioId)"
          >
            <ItemIcon :file-name="scenario.itemIconFileName" :item-name="scenario.recipe.displayName" size="small" />
            <span>{{ scenario.recipe.displayName }}</span>
          </button>
        </nav>
        <div class="craft-context">
          <div class="craft-current-item">
            <ItemIcon :file-name="session.scenario.value.itemIconFileName" :item-name="session.recipe.value.displayName" size="medium" />
            <div><span class="craft-recipe">{{ session.recipe.value.displayName }}</span><small>{{ session.scenario.value.missionLabel }}</small></div>
            <span class="craft-step">第 {{ session.state.value.step }} 步</span>
          </div>
          <button
            type="button"
            class="quiet-action"
            :disabled="session.actionCount.value === 0 && session.pendingAction.value === null"
            @click="undo"
          >
            ↶ 上一步
          </button>
        </div>

        <StatePanel :recipe="session.recipe.value" :state="session.state.value" :quality-target="session.objective.value.qualityTarget" :specialist="session.crafter.specialist === true" />

        <section v-if="session.state.value.terminal !== 'none'" class="decision-stage terminal-stage" aria-live="assertive">
          <p class="section-kicker">本次製作已結束</p>
          <h2>{{ session.state.value.terminal === 'completed' ? '製作完成' : '製作未完成' }}</h2>
          <p>{{ terminalMessage }}</p>
          <button type="button" class="primary-button" @click="restart({ craftsmanship: session.crafter.craftsmanship, control: session.crafter.control, maxCp: session.crafter.maxCp, cosmicToolGoodBonus: session.crafter.cosmicToolGoodBonus, specialist: session.crafter.specialist === true })">
            以相同裝備再試一次
          </button>
          <button
            v-if="session.scenarioId.value === 'cosmotized-ilmenite-ingot' && session.state.value.terminal === 'completed'"
            type="button"
            class="quiet-action"
            @click="selectScenario('cosmotized-ilmenite-nails')"
          >
            接著製作宇宙鈦鐵釘
          </button>
        </section>

        <section v-else-if="session.pendingAction.value" class="decision-stage outcome-stage" aria-live="assertive" aria-labelledby="outcome-title">
          <div class="stage-heading">
            <ActionIcon :action="session.pendingAction.value" size="large" />
            <div>
              <p class="section-kicker">已施放技能</p>
              <h2 id="outcome-title">{{ t(`action.${session.pendingAction.value}`) }}</h2>
              <p>{{ pendingNeedsResult ? '先回報成敗，再點結算後的球色。' : '點結算後的球色，立即取得下一步推薦。' }}</p>
            </div>
          </div>

          <div v-if="pendingNeedsResult" class="result-block">
            <span>技能是否成功？</span>
            <div class="result-buttons">
              <button type="button" :class="{ active: pendingSuccess === true }" :aria-pressed="pendingSuccess === true" @click="pendingSuccess = true">成功</button>
              <button type="button" class="failure" :class="{ active: pendingSuccess === false }" :aria-pressed="pendingSuccess === false" @click="pendingSuccess = false">失敗</button>
            </div>
          </div>

          <div v-if="!pendingKeepsCondition && !pendingForcesGood" class="condition-choice">
            <span>結算後是哪一顆球？</span>
            <div class="condition-grid">
              <button
                v-for="condition in session.recipe.value.availableConditions"
                :key="condition"
                type="button"
                :data-condition="condition"
                :disabled="pendingResolutionSuccess === null"
                :aria-label="`${t(`condition.${condition}`)}，套用並計算下一步`"
                @click="resolveWithCondition(condition)"
              >
                <span class="condition-dot" aria-hidden="true" />
                <strong>{{ t(`condition.${condition}`) }}</strong>
              </button>
            </div>
            <small v-if="pendingResolutionSuccess === null">選擇成功或失敗後即可點球色。</small>
            <small v-else>點球色後會直接前往下一步，不需要再確認。</small>
          </div>

          <button v-else-if="pendingForcesGood" type="button" class="primary-button unchanged-condition-button" :disabled="pendingResolutionSuccess === null" @click="resolvePendingWithForcedGood">
            好兆頭：下一步為高品質，繼續
          </button>

          <button
            v-else
            type="button"
            class="primary-button unchanged-condition-button"
            :disabled="pendingResolutionSuccess === null"
            @click="resolvePendingWithoutCondition"
          >
            球色不變，繼續
          </button>

          <button type="button" class="quiet-action cancel-action" @click="cancelPending">取消，尚未施放這個技能</button>
        </section>

        <section v-else-if="!session.conditionConfirmed.value" class="decision-stage condition-stage" aria-labelledby="initial-condition-title">
          <p class="section-kicker">開始本步</p>
          <h2 id="initial-condition-title">現在是哪一顆球？</h2>
          <p>只需在開始或校正時選一次；之後每步會直接沿用你回報的結算球色。</p>
          <div class="condition-grid condition-grid--initial">
            <button
              v-for="condition in session.recipe.value.availableConditions"
              :key="condition"
              type="button"
              :data-condition="condition"
              @click="chooseCondition(condition)"
            >
              <span class="condition-dot" aria-hidden="true" />
              <strong>{{ t(`condition.${condition}`) }}</strong>
            </button>
          </div>
        </section>

        <template v-else>
          <RecommendationCard
            v-if="session.recommendation.value"
            :recommendation="session.recommendation.value"
            :locked="session.pendingAction.value !== null"
            :planner-status="session.plannerStatus.value"
            :planner-duration-ms="session.plannerDurationMs.value"
            :planner-error="session.plannerError.value"
            :planner-fallback-reason="session.plannerFallbackReason.value"
            @select="chooseAction"
          >
            <template #report>
              <div class="recommendation-report">
                <div v-if="recommendationNeedsResult" class="result-block recommendation-result">
                  <span>這個技能成功了嗎？</span>
                  <div class="result-buttons">
                    <button type="button" :class="{ active: pendingSuccess === true }" :aria-pressed="pendingSuccess === true" @click="pendingSuccess = true">成功</button>
                    <button type="button" class="failure" :class="{ active: pendingSuccess === false }" :aria-pressed="pendingSuccess === false" @click="pendingSuccess = false">失敗</button>
                  </div>
                </div>

                <div v-if="!recommendationKeepsCondition && !recommendationForcesGood" class="condition-choice recommendation-condition-choice">
                  <span>下一顆球是什麼？</span>
                  <div class="condition-grid">
                    <button
                      v-for="condition in session.recipe.value.availableConditions"
                      :key="condition"
                      type="button"
                      :data-condition="condition"
                      :disabled="recommendationResolutionSuccess === null"
                      :aria-label="`${t(`condition.${condition}`)}，套用推薦並計算下一步`"
                      @click="resolveRecommendationWithCondition(condition)"
                    >
                      <span class="condition-dot" aria-hidden="true" />
                      <strong>{{ t(`condition.${condition}`) }}</strong>
                    </button>
                  </div>
                  <small v-if="recommendationResolutionSuccess === null">先選擇成功或失敗，再點下一顆球。</small>
                  <small v-else>在遊戲使用上方推薦後，直接點結算球色。</small>
                </div>
                <button v-else-if="recommendationForcesGood" type="button" class="primary-button unchanged-condition-button" :disabled="recommendationResolutionSuccess === null" @click="resolveRecommendationWithForcedGood">
                  好兆頭：下一步為高品質，繼續
                </button>
                <button
                  v-else
                  type="button"
                  class="primary-button unchanged-condition-button"
                  :disabled="recommendationResolutionSuccess === null"
                  @click="resolveRecommendationWithoutCondition"
                >
                  球色不變，繼續
                </button>
              </div>
            </template>
          </RecommendationCard>

          <section v-else class="decision-stage planner-pending" aria-live="polite">
            <span class="research-spinner" aria-hidden="true" />
            <div>
              <p class="section-kicker">正在判斷路線</p>
              <h2>計算下一步</h2>
              <p>強策略最多計算 3000 ms；只有逾時或立即失敗才會改用快速備援。</p>
            </div>
          </section>

          <button v-if="session.actionCount.value > 0" type="button" class="condition-correction-toggle" @click="showConditionCorrection = !showConditionCorrection">
            目前球色：<span class="condition-inline" :data-condition="session.state.value.condition"><span class="condition-dot" />{{ t(`condition.${session.state.value.condition}`) }}</span>
            · 球色不對？
          </button>
          <div v-if="showConditionCorrection" class="inline-condition-correction">
            <button
              v-for="condition in session.recipe.value.availableConditions"
              :key="condition"
              type="button"
              :data-condition="condition"
              @click="chooseCondition(condition)"
            >
              <span class="condition-dot" aria-hidden="true" />{{ t(`condition.${condition}`) }}
            </button>
          </div>
        </template>

        <details ref="secondaryPanel" class="secondary-panel">
          <summary>其他技能、紀錄與進階修正</summary>
          <div class="secondary-content">
            <section class="history-panel" aria-labelledby="history-title">
              <div class="panel-heading compact">
                <div><p class="section-kicker">本場紀錄</p><h2 id="history-title">最近步驟</h2></div>
                <span>{{ session.actionCount.value }} 次技能</span>
              </div>
              <ol v-if="history.length" class="history-list">
                <li v-for="(row, index) in history" :key="row.id">
                  <span class="history-index">{{ session.actionCount.value - index }}</span>
                  <ActionIcon :action="row.action" size="small" />
                  <div><strong>{{ t(`action.${row.action}`) }}</strong><small>{{ row.success ? '成功' : '失敗' }}</small></div>
                </li>
              </ol>
              <p v-else class="history-empty">尚未施放技能。</p>
            </section>

            <ActionPanel
              :recipe="session.recipe.value"
              :crafter="session.crafter"
              :state="session.state.value"
              :locked="session.pendingAction.value !== null || !session.conditionConfirmed.value"
              :recommended-action="session.recommendation.value?.action"
              @select="chooseAction"
            />

            <SessionTools
              :recipe="session.recipe.value"
              :crafter="session.crafter"
              :state="session.state.value"
              :can-undo="session.actionCount.value > 0 || session.pendingAction.value !== null"
              @undo="undo"
              @export="session.exportSession"
              @restart="restart"
              @resync="resync"
            />
          </div>
        </details>
      </div>
    </main>

    <footer>
      <span>Mechanics {{ MODEL_VERSIONS.mechanics }}</span>
      <span>Policy {{ session.scenario.value.planner.policyVersion }}</span>
      <span>強策略上限 3000 ms</span>
      <span>玩家逐步回報 · 不讀取遊戲資料 · 不自動操作</span>
      <a :href="thirdPartyNoticesHref" target="_blank" rel="noreferrer">FINAL FANTASY XIV © SQUARE ENIX</a>
    </footer>
  </div>
</template>
