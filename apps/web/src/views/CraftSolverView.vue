<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  MATERIAL_CONDITIONS,
  applyObservedOutcome,
  previewAction,
  type CraftActionId,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import CraftActionIcon from '@/components/crafting/CraftActionIcon.vue'
import { isDefaultEquipmentProfile } from '@/composables/useEquipmentProfiles'
import { useActiveCraftSession } from '@/composables/useActiveCraftSession'
import { useRecommendationOutcome } from '@/composables/useRecommendationOutcome'
import type { DataLocale, LocalizedNames } from '@/types/missionData'

const { t, locale } = useI18n()
const router = useRouter()
const craft = useActiveCraftSession()
const reportingAction = ref<CraftActionId | null>(null)
const reportedSuccess = ref<boolean | null>(null)
const isItemDialogOpen = ref(false)
const isActionDialogOpen = ref(false)
const isRestartDialogOpen = ref(false)
const dialogCloseButton = ref<HTMLButtonElement | null>(null)
const sessionDownloadUrl = ref('')
const sessionDownloadFilename = ref('')

const session = computed(() => craft.activeSession.value)
const state = computed(() => craft.state.value)
const recipe = computed(() => session.value?.scenario.recipe ?? null)
const recommendationAction = computed(() => craft.recommendation.value?.action as CraftActionId | null ?? null)
const recommendedSuccess = useRecommendationOutcome(
  craft.recommendation,
  action => craft.actionNeedsSuccess(action),
)
const nextMissionItem = computed(() => {
  const active = session.value
  if (!active || active.mission.items.length < 2) return null
  const currentIndex = active.mission.items.findIndex(item => item.recipeId === active.item.recipeId)
  return active.mission.items[(currentIndex + 1) % active.mission.items.length] ?? null
})

function localizedName(names?: LocalizedNames) {
  if (!names) return ''
  const language = locale.value as DataLocale
  return names[language] || names.en || Object.values(names)[0] || ''
}

const equipmentSummary = computed(() => {
  const active = session.value
  if (!active) return { name: '', details: '' }
  const profile = active.equipmentProfile
  const name = isDefaultEquipmentProfile(profile)
    ? t('equipmentProfiles.defaultName')
    : profile.name || t('equipmentProfiles.unnamed')
  const details = [
    `${active.crafter.craftsmanship.toLocaleString()}/${active.crafter.control.toLocaleString()}/${active.crafter.maxCp.toLocaleString()}`,
  ]
  if (profile.relicToolGoodBonus) details.push(t('missions.equipmentRelicEffect'))
  if (profile.specialist) details.push(t('missions.equipmentSpecialist'))
  return { name, details: details.join(' · ') }
})

const actionPreview = computed(() => {
  const active = session.value
  const current = state.value
  const action = recommendationAction.value
  return active && current && action
    ? previewAction(active.scenario.recipe, active.crafter, current, action)
    : null
})
const needsSuccess = computed(() => reportingAction.value !== null && craft.actionNeedsSuccess(reportingAction.value))
function actionTerminal(action: CraftActionId, success: boolean) {
  const active = session.value
  const current = state.value
  if (!active || !current) return 'none' as const
  return applyObservedOutcome(active.scenario.recipe, active.crafter, current, action, {
    success,
    nextCondition: current.condition,
  }).nextState.terminal
}

function resolutionLabel(terminal: 'none' | 'completed' | 'failed') {
  if (terminal === 'completed') return t('solver.completed')
  if (terminal === 'failed') return t('solver.failed')
  return t('solver.continue')
}

function forcedNextCondition(action: CraftActionId, success: boolean) {
  const active = session.value
  const current = state.value
  if (!active || !current) return null
  const nextState = applyObservedOutcome(active.scenario.recipe, active.crafter, current, action, {
    success,
    nextCondition: current.condition,
  }).nextState
  if (nextState.terminal !== 'none' || nextState.step === current.step) return null
  if (current.condition === 'goodOmen') return 'good' satisfies MaterialCondition
  if (current.condition === 'robust') return 'sturdy' satisfies MaterialCondition
  return null
}

const reportTerminal = computed(() => {
  const action = reportingAction.value
  if (!action || needsSuccess.value && reportedSuccess.value === null) return 'none' as const
  return actionTerminal(action, reportedSuccess.value ?? true)
})
const reportWouldTerminate = computed(() => reportTerminal.value !== 'none')
const needsNextCondition = computed(() => reportingAction.value !== null
  && (!needsSuccess.value || reportedSuccess.value !== null)
  && craft.actionNeedsNextCondition(reportingAction.value)
  && !reportWouldTerminate.value)
const reportForcedCondition = computed(() => {
  const action = reportingAction.value
  if (!action || reportedSuccess.value === null || reportWouldTerminate.value) return null
  return forcedNextCondition(action, reportedSuccess.value)
})
const recommendationNeedsSuccess = computed(() => recommendationAction.value !== null
  && craft.actionNeedsSuccess(recommendationAction.value))
const recommendationTerminal = computed(() => recommendationAction.value !== null
  && recommendedSuccess.value !== null
  ? actionTerminal(recommendationAction.value, recommendedSuccess.value)
  : 'none')
const recommendationWouldTerminate = computed(() => recommendationTerminal.value !== 'none')
const recommendationNeedsCondition = computed(() => recommendationAction.value !== null
  && recommendedSuccess.value !== null
  && craft.actionNeedsNextCondition(recommendationAction.value)
  && !recommendationWouldTerminate.value)
const recommendationForcedCondition = computed(() => {
  const action = recommendationAction.value
  if (!action || recommendedSuccess.value === null || recommendationWouldTerminate.value) return null
  return forcedNextCondition(action, recommendedSuccess.value)
})
const selectableConditions = computed(() => {
  const available = recipe.value?.randomConditions ?? recipe.value?.availableConditions ?? MATERIAL_CONDITIONS
  return MATERIAL_CONDITIONS.filter(condition => available.includes(condition))
})
const conditionGridStyle = computed(() => {
  const count = selectableConditions.value.length
  const optionWidth = (singleRowLimit: number) => {
    const columns = count <= singleRowLimit ? count : Math.ceil(count / 2)
    const gapShare = 0.55 * (columns - 1) / columns
    return `calc(${100 / columns}% - ${gapShare}rem)`
  }
  return {
    '--condition-option-width': optionWidth(4),
    '--condition-option-width-narrow': optionWidth(3),
  }
})

const progressPercent = computed(() => percent(state.value?.progress ?? 0, recipe.value?.progressRequired ?? 1))
const qualityPercent = computed(() => percent(state.value?.quality ?? 0, recipe.value?.qualityMax ?? 1))
const durabilityPercent = computed(() => percent(state.value?.durability ?? 0, recipe.value?.durabilityMax ?? 1))
const cpPercent = computed(() => percent(state.value?.cp ?? 0, session.value?.crafter.maxCp ?? 1))

function percent(value: number, maximum: number) {
  return Math.max(0, Math.min(100, maximum > 0 ? value / maximum * 100 : 0))
}

function openDialog(dialog: 'item' | 'action' | 'restart') {
  if (dialog === 'item') isItemDialogOpen.value = true
  if (dialog === 'action') isActionDialogOpen.value = true
  if (dialog === 'restart') isRestartDialogOpen.value = true
  void nextTick(() => dialogCloseButton.value?.focus())
}

function closeDialogs() {
  isItemDialogOpen.value = false
  isActionDialogOpen.value = false
  isRestartDialogOpen.value = false
}

function beginReport(action: CraftActionId) {
  reportingAction.value = action
  reportedSuccess.value = craft.actionNeedsSuccess(action) ? null : true
}

function chooseAlternative(action: CraftActionId) {
  closeDialogs()
  beginReport(action)
}

async function submitReport(nextCondition?: MaterialCondition) {
  const action = reportingAction.value
  const current = state.value
  if (!action || !current || needsSuccess.value && reportedSuccess.value === null) return
  const success = reportedSuccess.value ?? true
  const resolvedCondition = nextCondition ?? current.condition
  reportingAction.value = null
  reportedSuccess.value = null
  await craft.resolveAction(action, success, resolvedCondition)
}

async function advanceRecommendation(nextCondition?: MaterialCondition) {
  const action = recommendationAction.value
  const current = state.value
  if (!action || !current || recommendedSuccess.value === null) return
  const success = recommendedSuccess.value
  const resolvedCondition = nextCondition ?? current.condition
  recommendedSuccess.value = null
  await craft.resolveAction(action, success, resolvedCondition)
}

function replaceItem(recipeId: number) {
  const item = session.value?.mission.items.find(candidate => candidate.recipeId === recipeId)
  if (!item) return
  closeDialogs()
  reportingAction.value = null
  recommendedSuccess.value = null
  craft.replaceItem(item)
}

function restart() {
  closeDialogs()
  reportingAction.value = null
  recommendedSuccess.value = null
  craft.restart()
}

function clearSessionDownload() {
  if (sessionDownloadUrl.value) URL.revokeObjectURL(sessionDownloadUrl.value)
  sessionDownloadUrl.value = ''
  sessionDownloadFilename.value = ''
}

function cancelReport() {
  reportingAction.value = null
  reportedSuccess.value = null
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (isItemDialogOpen.value || isActionDialogOpen.value || isRestartDialogOpen.value) closeDialogs()
  else if (reportingAction.value) cancelReport()
}

watch(session, active => {
  if (!active) void router.replace({ name: 'start' })
}, { immediate: true })
watch(() => state.value?.terminal, (terminal) => {
  clearSessionDownload()
  if (!terminal || terminal === 'none') return
  const exported = craft.exportSession()
  if (!exported) return
  const payload = JSON.stringify(exported, null, 2)
  const timestamp = exported.manifest.createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  sessionDownloadUrl.value = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  sessionDownloadFilename.value = `frozen-rabbit-craft-${exported.recipe.canonicalRecipeId}-${timestamp}.json`
}, { immediate: true })

onMounted(() => document.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  clearSessionDownload()
})
</script>

<template>
  <section v-if="session && state && recipe" class="craft-solver" aria-labelledby="craft-solver-title">
    <header class="solver-context">
      <div class="solver-heading">
        <p>{{ localizedName(session.mission.names) }} · {{ t(`missions.jobs.${session.mission.job}`) }}</p>
        <button
          class="solver-item-switch"
          type="button"
          :disabled="session.mission.items.length < 2"
          :aria-label="t('solver.changeItem')"
          @click="openDialog('item')"
        >
          <img :src="session.item.icon" alt="" />
          <span id="craft-solver-title">{{ localizedName(session.item.names) }}</span>
          <i v-if="session.mission.items.length > 1" class="pi pi-angle-down" aria-hidden="true"></i>
        </button>
      </div>
      <p class="solver-equipment">
        <i class="pi pi-id-card" aria-hidden="true"></i>
        <span><strong>{{ equipmentSummary.name }}</strong><small>{{ equipmentSummary.details }}</small></span>
      </p>
    </header>

    <section class="craft-dashboard" :aria-label="t('solver.dashboard')">
      <div class="craft-meter craft-meter--progress">
        <span>{{ t('solver.progress') }}</span>
        <strong>{{ state.progress.toLocaleString() }} <small>/ {{ recipe.progressRequired.toLocaleString() }}</small></strong>
        <i><span :style="{ width: `${progressPercent}%` }"></span></i>
      </div>
      <div class="craft-meter craft-meter--quality">
        <span>{{ t('solver.quality') }}</span>
        <strong>{{ state.quality.toLocaleString() }} <small>/ {{ recipe.qualityMax.toLocaleString() }}</small></strong>
        <i><span :style="{ width: `${qualityPercent}%` }"></span></i>
      </div>
      <div class="craft-meter craft-meter--durability">
        <span>{{ t('solver.durability') }}</span>
        <strong>{{ state.durability }} <small>/ {{ recipe.durabilityMax }}</small></strong>
        <i><span :style="{ width: `${durabilityPercent}%` }"></span></i>
      </div>
      <div class="craft-meter craft-meter--cp">
        <span>CP</span>
        <strong>{{ state.cp }} <small>/ {{ session.crafter.maxCp }}</small></strong>
        <i><span :style="{ width: `${cpPercent}%` }"></span></i>
      </div>
    </section>

    <main class="solver-primary" :class="{ 'solver-primary--terminal': state.terminal !== 'none' }" aria-live="polite">
      <section v-if="state.terminal !== 'none'" class="solver-terminal" :class="`solver-terminal--${state.terminal}`">
        <i :class="state.terminal === 'completed' ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'" aria-hidden="true"></i>
        <div>
          <h2>{{ t(state.terminal === 'completed' ? 'solver.completed' : 'solver.failed') }}</h2>
          <p>{{ t(state.terminal === 'completed' && nextMissionItem ? 'solver.completedNextDescription' : state.terminal === 'completed' ? 'solver.completedDescription' : 'solver.failedDescription') }}</p>
        </div>
        <button
          v-if="state.terminal === 'completed' && nextMissionItem"
          class="solver-terminal-next"
          type="button"
          @click="replaceItem(nextMissionItem.recipeId)"
        >
          <img :src="nextMissionItem.icon" alt="" />
          <span>{{ t('solver.nextItem') }}</span>
          <strong>{{ localizedName(nextMissionItem.names) }}</strong>
          <i class="pi pi-arrow-right" aria-hidden="true"></i>
        </button>
        <a
          v-if="sessionDownloadUrl"
          class="solver-terminal-export"
          :href="sessionDownloadUrl"
          :download="sessionDownloadFilename"
        >
          <i class="pi pi-download" aria-hidden="true"></i>{{ t('solver.downloadSession') }}
        </a>
      </section>

      <section v-else-if="reportingAction" class="report-card" aria-labelledby="report-title">
        <header>
          <button type="button" :aria-label="t('common.close')" @click="cancelReport"><i class="pi pi-times" aria-hidden="true"></i></button>
          <p>{{ t('solver.reportEyebrow') }}</p>
          <h2 id="report-title">{{ t(`solver.actions.${reportingAction}`) }}</h2>
        </header>
        <div v-if="needsSuccess" class="report-group">
          <span>{{ t('solver.actionSucceeded') }}</span>
          <div class="report-segmented">
            <button type="button" :class="{ active: reportedSuccess === true }" :aria-pressed="reportedSuccess === true" @click="reportedSuccess = true">
              <i class="pi pi-check" aria-hidden="true"></i>{{ t('solver.success') }}
            </button>
            <button type="button" :class="{ active: reportedSuccess === false }" :aria-pressed="reportedSuccess === false" @click="reportedSuccess = false">
              <i class="pi pi-times" aria-hidden="true"></i>{{ t('solver.failure') }}
            </button>
          </div>
        </div>
        <fieldset v-if="needsNextCondition" class="report-group condition-report">
          <legend>{{ t('solver.nextCondition') }}</legend>
          <div class="condition-grid" :style="conditionGridStyle">
            <button
              v-for="condition in selectableConditions"
              :key="condition"
              type="button"
              :class="`condition-option condition-option--${condition}`"
              :disabled="craft.inputLocked.value"
              @click="submitReport(condition)"
            >
              <i aria-hidden="true"></i><span>{{ t(`solver.conditions.${condition}`) }}</span>
            </button>
          </div>
        </fieldset>
        <fieldset v-else-if="reportForcedCondition" class="report-group condition-report">
          <legend>{{ t('solver.nextCondition') }}</legend>
          <div class="condition-grid condition-grid--forced">
            <button
              type="button"
              :class="`condition-option condition-option--${reportForcedCondition}`"
              :disabled="craft.inputLocked.value"
              @click="submitReport(reportForcedCondition)"
            >
              <i aria-hidden="true"></i><span>{{ t(`solver.conditions.${reportForcedCondition}`) }}</span>
            </button>
          </div>
        </fieldset>
        <button
          v-else-if="!needsSuccess || reportedSuccess !== null"
          class="report-submit"
          type="button"
          :disabled="craft.inputLocked.value"
          @click="submitReport()"
        >{{ resolutionLabel(reportTerminal) }}</button>
      </section>

      <section v-else-if="craft.recommendationLoading.value" class="recommendation-card recommendation-card--loading">
        <span class="recommendation-status"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i>{{ t('solver.analyzing') }}</span>
        <div class="recommendation-skeleton"></div>
      </section>

      <section v-else-if="craft.recommendationError.value || !recommendationAction" class="recommendation-error" role="alert">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        <div><strong>{{ t('solver.noRecommendation') }}</strong><p>{{ t('solver.noRecommendationDescription') }}</p></div>
        <button type="button" @click="craft.restart">{{ t('solver.retryFromStart') }}</button>
      </section>

      <section v-else class="recommendation-card">
        <div class="recommendation-topline">
          <span class="recommendation-label">{{ t(craft.actionCount.value === 0 ? 'solver.firstAction' : 'solver.nextAction') }}</span>
          <span class="condition-badge" :class="`condition-badge--${state.condition}`">
            <i aria-hidden="true"></i>{{ t(`solver.conditions.${state.condition}`) }}
          </span>
        </div>
        <div class="recommendation-action">
          <CraftActionIcon :action="recommendationAction" :job="session.mission.job" />
          <div>
            <h2>{{ t(`solver.actions.${recommendationAction}`) }}</h2>
            <p v-if="actionPreview">
              <span v-if="actionPreview.cpCost">CP −{{ actionPreview.cpCost }}</span>
              <span v-if="actionPreview.durabilityCost">{{ t('solver.durability') }} −{{ actionPreview.durabilityCost }}</span>
              <span v-if="actionPreview.successRate < 1">{{ t('solver.successRate', { value: Math.round(actionPreview.successRate * 100) }) }}</span>
            </p>
          </div>
        </div>
        <div v-if="recommendationNeedsSuccess" class="recommendation-success">
          <span>{{ t('solver.actionSucceeded') }}</span>
          <div class="report-segmented">
            <button type="button" :class="{ active: recommendedSuccess === true }" :aria-pressed="recommendedSuccess === true" @click="recommendedSuccess = true">
              <i class="pi pi-check" aria-hidden="true"></i>{{ t('solver.success') }}
            </button>
            <button type="button" :class="{ active: recommendedSuccess === false }" :aria-pressed="recommendedSuccess === false" @click="recommendedSuccess = false">
              <i class="pi pi-times" aria-hidden="true"></i>{{ t('solver.failure') }}
            </button>
          </div>
        </div>
        <fieldset v-if="recommendationNeedsCondition" class="recommendation-conditions condition-report">
          <legend>{{ t('solver.tapConditionToContinue') }}</legend>
          <div class="condition-grid" :style="conditionGridStyle">
            <button
              v-for="condition in selectableConditions"
              :key="condition"
              type="button"
              :class="`condition-option condition-option--${condition}`"
              :disabled="craft.inputLocked.value"
              @click="advanceRecommendation(condition)"
            >
              <i aria-hidden="true"></i><span>{{ t(`solver.conditions.${condition}`) }}</span>
            </button>
          </div>
        </fieldset>
        <fieldset v-else-if="recommendationForcedCondition" class="recommendation-conditions condition-report">
          <legend>{{ t('solver.tapConditionToContinue') }}</legend>
          <div class="condition-grid condition-grid--forced">
            <button
              type="button"
              :class="`condition-option condition-option--${recommendationForcedCondition}`"
              :disabled="craft.inputLocked.value"
              @click="advanceRecommendation(recommendationForcedCondition)"
            >
              <i aria-hidden="true"></i><span>{{ t(`solver.conditions.${recommendationForcedCondition}`) }}</span>
            </button>
          </div>
        </fieldset>
        <button
          v-else-if="recommendedSuccess !== null"
          class="recommendation-use"
          type="button"
          :disabled="craft.inputLocked.value"
          @click="advanceRecommendation()"
        >{{ resolutionLabel(recommendationTerminal) }}</button>
        <button class="recommendation-deviate" type="button" @click="openDialog('action')">{{ t('solver.usedDifferentAction') }}</button>
      </section>
    </main>

    <footer class="solver-tools" :aria-label="t('solver.tools')">
      <button type="button" :disabled="craft.actionCount.value === 0 || craft.recommendationLoading.value" @click="craft.undo">
        <i class="pi pi-undo" aria-hidden="true"></i>{{ t('solver.undo') }}
      </button>
      <button type="button" @click="openDialog('restart')">
        <i class="pi pi-refresh" aria-hidden="true"></i>{{ t('solver.restart') }}
      </button>
    </footer>
  </section>

  <Teleport to="body">
    <div v-if="isItemDialogOpen && session" class="solver-dialog-layer" @click.self="closeDialogs">
      <section class="solver-dialog" role="dialog" aria-modal="true" :aria-labelledby="'item-dialog-title'">
        <button ref="dialogCloseButton" class="solver-dialog-close" type="button" :aria-label="t('common.close')" @click="closeDialogs"><i class="pi pi-times" aria-hidden="true"></i></button>
        <h2 id="item-dialog-title">{{ t('solver.changeItemTitle') }}</h2>
        <p>{{ t('solver.changeItemDescription') }}</p>
        <div class="solver-dialog-list">
          <button v-for="item in session.mission.items" :key="item.recipeId" type="button" :disabled="item.recipeId === session.item.recipeId" @click="replaceItem(item.recipeId)">
            <img :src="item.icon" alt="" /><span>{{ localizedName(item.names) }}</span><i v-if="item.recipeId === session.item.recipeId" class="pi pi-check" aria-hidden="true"></i>
          </button>
        </div>
      </section>
    </div>

    <div v-if="isActionDialogOpen && session" class="solver-dialog-layer" @click.self="closeDialogs">
      <section class="solver-dialog solver-dialog--actions" role="dialog" aria-modal="true" :aria-labelledby="'action-dialog-title'">
        <button ref="dialogCloseButton" class="solver-dialog-close" type="button" :aria-label="t('common.close')" @click="closeDialogs"><i class="pi pi-times" aria-hidden="true"></i></button>
        <h2 id="action-dialog-title">{{ t('solver.chooseActualAction') }}</h2>
        <p>{{ t('solver.chooseActualActionDescription') }}</p>
        <div class="action-choice-grid">
          <button v-for="action in craft.availableActions.value" :key="action" type="button" @click="chooseAlternative(action)">
            <CraftActionIcon :action="action" :job="session.mission.job" size="small" />
            <span>{{ t(`solver.actions.${action}`) }}</span>
          </button>
        </div>
      </section>
    </div>

    <div v-if="isRestartDialogOpen" class="solver-dialog-layer" @click.self="closeDialogs">
      <section class="solver-dialog solver-dialog--confirm" role="alertdialog" aria-modal="true" :aria-labelledby="'restart-dialog-title'">
        <button ref="dialogCloseButton" class="solver-dialog-close" type="button" :aria-label="t('common.close')" @click="closeDialogs"><i class="pi pi-times" aria-hidden="true"></i></button>
        <h2 id="restart-dialog-title">{{ t('solver.restartTitle') }}</h2>
        <p>{{ t('solver.restartDescription') }}</p>
        <div class="solver-dialog-actions">
          <button type="button" @click="closeDialogs">{{ t('solver.keepCrafting') }}</button>
          <button class="danger" type="button" @click="restart">{{ t('solver.confirmRestart') }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.craft-solver { width: min(66rem, 100%); min-height: 100%; margin: 0 auto; padding: 2.25rem 2rem 4rem; }
.solver-context { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 1rem 1.5rem; }
.solver-heading { flex: 1 1 24rem; min-width: 0; }
.solver-heading > p { margin: 0 0 0.45rem; color: #78948c; font-size: 0.75rem; font-weight: 750; }
.solver-item-switch { display: flex; min-width: 0; align-items: center; gap: 0.7rem; border: 0; background: transparent; padding: 0; color: #234f44; text-align: left; cursor: pointer; }
.solver-item-switch:disabled { cursor: default; }
.solver-item-switch img { width: 2.7rem; height: 2.7rem; flex: 0 0 auto; border-radius: 0.65rem; background: #e8f1ef; object-fit: cover; }
.solver-item-switch span { overflow: hidden; font-size: clamp(1.45rem, 3vw, 2rem); font-weight: 850; letter-spacing: -0.025em; text-overflow: ellipsis; white-space: nowrap; }
.solver-item-switch i { color: #75a99a; font-size: 0.9rem; }
.solver-equipment { display: flex; min-width: 13rem; max-width: 25rem; flex: 0 1 auto; align-items: center; gap: .7rem; margin: 0 0 .15rem auto; border: 1px solid #dcece7; border-radius: .8rem; background: rgba(255,255,255,.68); padding: .62rem .75rem; color: #627b74; line-height: 1.35; text-align: left; white-space: nowrap; }
.solver-equipment > i { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border-radius: .6rem; background: #eaf5f1; color: #57907f; font-size: 1rem; }
.solver-equipment span { display: grid; min-width: 0; justify-items: start; gap: .12rem; }
.solver-equipment strong, .solver-equipment small { overflow: hidden; max-width: 100%; text-overflow: ellipsis; }
.solver-equipment strong { color: #405f57; font-size: .82rem; font-weight: 850; }
.solver-equipment small { font-size: .72rem; font-weight: 700; }
html.dark .solver-item-switch { color: #d9f3e9; }
html.dark .solver-heading > p, html.dark .solver-equipment { color: #94a3b8; }
html.dark .solver-equipment { border-color: #294039; background: rgba(15,23,42,.72); }
html.dark .solver-equipment > i { background: #173a31; color: #75bfa9; }
html.dark .solver-equipment strong { color: #c7ddd6; }

.craft-dashboard { display: grid; grid-template-columns: 1.5fr 1.5fr 1fr 1fr; gap: 0.65rem; margin-top: 1.4rem; }
.craft-meter { min-width: 0; border: 1px solid #dcece7; border-radius: 0.85rem; background: rgba(255,255,255,.76); padding: 0.75rem 0.8rem; }
.craft-meter > span { display: block; color: #78948c; font-size: 0.68rem; font-weight: 800; }
.craft-meter strong { display: block; overflow: hidden; margin-top: 0.18rem; color: #2f5048; font-size: 1rem; text-overflow: ellipsis; white-space: nowrap; }
.craft-meter small { color: #8da19c; font-size: 0.68rem; font-weight: 650; }
.craft-meter > i { display: block; height: 0.25rem; margin-top: 0.55rem; overflow: hidden; border-radius: 999px; background: #e9f0ee; }
.craft-meter > i > span { display: block; height: 100%; border-radius: inherit; background: #6bb59f; transition: width 240ms ease; }
.craft-meter--quality > i > span { background: #d6a85f; }
.craft-meter--durability > i > span { background: #8c9fd0; }
.craft-meter--cp > i > span { background: #a385c5; }
html.dark .craft-meter { border-color: #294039; background: rgba(15,23,42,.72); }
html.dark .craft-meter strong { color: #d9f3e9; }
html.dark .craft-meter > i { background: #22332f; }

.solver-primary { display: grid; min-height: 25rem; place-items: start center; margin-top: 2rem; }
.solver-primary.solver-primary--terminal { min-height: 0; }
.recommendation-card, .report-card, .recommendation-error, .solver-terminal { width: 100%; border: 1px solid #cfe8e0; border-radius: 1.35rem; background: #fff; padding: 1.4rem; box-shadow: 0 18px 45px rgba(31,73,63,.1); }
.recommendation-topline { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.recommendation-label { color: #3e8f7a; font-size: 0.76rem; font-weight: 850; letter-spacing: .08em; }
.condition-badge { display: inline-flex; min-height: 2.5rem; align-items: center; gap: .55rem; border: 1px solid #d9e8e4; border-radius: 999px; padding: .35rem .8rem; color: #40534e; font-size: .95rem; font-weight: 850; }
.condition-badge i, .condition-option > i { width: 1.25rem; height: 1.25rem; flex: 0 0 auto; border: 1px solid var(--condition-edge,rgba(15,23,42,.22)); border-radius: 50%; background: var(--condition-color); box-shadow: 0 1px 3px rgba(15,23,42,.22); }
.condition-badge--normal, .condition-option--normal { --condition-color: #f4f4f4; --condition-edge: #aeb5bc; }
.condition-badge--good, .condition-option--good { --condition-color: #ef4f9f; --condition-edge: #c83981; }
.condition-badge--goodOmen, .condition-option--goodOmen { --condition-color: #ffb5a1; --condition-edge: #e18470; }
.condition-badge--centered, .condition-option--centered { --condition-color: #dbdb4d; --condition-edge: #a6a62c; }
.condition-badge--sturdy, .condition-option--sturdy,
.condition-badge--robust, .condition-option--robust { --condition-color: #3dceff; --condition-edge: #2097bf; }
.condition-badge--pliant, .condition-option--pliant { --condition-color: #04d504; --condition-edge: #079507; }
.condition-badge--malleable, .condition-option--malleable { --condition-color: #5179ff; --condition-edge: #3452bd; }
.condition-badge--primed, .condition-option--primed { --condition-color: #b11dff; --condition-edge: #7911ad; }
.recommendation-action { display: flex; max-width: 35rem; align-items: center; gap: 1.15rem; margin: 1.25rem auto 1.35rem; }
.recommendation-action h2 { margin: 0; color: #234f44; font-size: clamp(1.55rem, 4vw, 2.15rem); font-weight: 850; letter-spacing: -.025em; }
.recommendation-action p { display: flex; flex-wrap: wrap; gap: .7rem; margin: .45rem 0 0; color: #7b8f89; font-size: .72rem; font-weight: 700; }
.recommendation-use, .report-submit { width: 100%; min-height: 3.35rem; border: 0; border-radius: .85rem; background: #3e8f7a; color: #fff; font-weight: 850; cursor: pointer; }
.recommendation-success + .recommendation-use { margin-top: 1rem; }
.recommendation-use:hover, .report-submit:hover { background: #2d6a5a; }
.recommendation-use:disabled, .report-submit:disabled { background: #b5c3bf; cursor: wait; }
.recommendation-deviate { display: block; min-height: 2.75rem; margin: .35rem auto 0; border: 0; background: transparent; color: #64817a; font-size: .78rem; font-weight: 750; cursor: pointer; }
.recommendation-deviate:hover { color: #2e7d68; text-decoration: underline; text-underline-offset: 3px; }
html.dark .recommendation-card, html.dark .report-card, html.dark .recommendation-error, html.dark .solver-terminal { border-color: #294039; background: #0f172a; box-shadow: 0 18px 48px rgba(2,6,23,.35); }
html.dark .recommendation-action h2 { color: #d9f3e9; }
html.dark .condition-badge { border-color: #334155; }
html.dark .recommendation-use, html.dark .report-submit { background: #52a890; color: #071b16; }

.recommendation-card--loading { min-height: 14rem; }
.recommendation-status { display: flex; align-items: center; gap: .5rem; color: #4f7e72; font-size: .8rem; font-weight: 800; }
.recommendation-skeleton { width: 72%; height: 3rem; margin: 2.7rem auto 0; border-radius: .8rem; background: linear-gradient(90deg,#edf5f2,#f9fcfb,#edf5f2); background-size: 200% 100%; animation: solver-shimmer 1.3s linear infinite; }
@keyframes solver-shimmer { to { background-position: -200% 0; } }

.report-card { position: relative; }
.report-card header > button { position: absolute; top: .8rem; right: .8rem; display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 0; border-radius: 999px; background: transparent; color: #71837e; cursor: pointer; }
.report-card header > button:hover { background: #eef7f4; }
.report-card header p { margin: 0; color: #78948c; font-size: .72rem; font-weight: 800; }
.report-card header h2 { margin: .25rem 2.5rem 0 0; color: #234f44; font-size: 1.35rem; }
.report-group, .recommendation-success { margin-top: 1.3rem; }
.report-group > span, .report-group legend { display: block; margin-bottom: .6rem; color: #4c655e; font-size: .78rem; font-weight: 800; }
.recommendation-success > span { display: block; margin-bottom: .6rem; color: #4c655e; font-size: .78rem; font-weight: 800; }
.report-segmented { display: grid; grid-template-columns: 1fr 1fr; gap: .55rem; }
.report-segmented button { min-height: 3rem; border: 1px solid #dce8e5; border-radius: .75rem; background: #f9fbfa; color: #5d706b; font-weight: 800; cursor: pointer; }
.report-segmented button i { margin-right: .35rem; }
.report-segmented button.active { border-color: #52a890; background: #eaf7f2; color: #276e5b; }
.condition-report { border: 0; padding: 0; }
.recommendation-conditions { margin: .2rem 0 0; }
.condition-report legend { display: block; width: 100%; margin-bottom: .75rem; color: #405f57; font-size: .86rem; font-weight: 850; text-align: center; }
.condition-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: .55rem; }
.condition-option { display: flex; min-width: 0; min-height: 4rem; flex: 0 0 var(--condition-option-width, min(16rem,100%)); align-items: center; justify-content: center; gap: .55rem; border: 1px solid #dce8e5; border-radius: .8rem; background: #fafcfb; padding: .55rem; color: #3f534d; font: inherit; text-align: center; cursor: pointer; }
.condition-option > span { overflow: hidden; font-size: .9rem; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.condition-option:hover { border-color: var(--condition-edge); background: #f4f8f7; box-shadow: 0 0 0 1px var(--condition-edge); }
.condition-option:focus-visible { outline: 3px solid color-mix(in srgb,var(--condition-color) 42%,transparent); outline-offset: 2px; }
.condition-option:disabled { opacity: .58; cursor: wait; }
.report-submit { margin-top: 1.2rem; }
html.dark .report-card header h2 { color: #d9f3e9; }
html.dark .report-segmented button, html.dark .condition-option { border-color: #334155; background: #131f31; color: #e2e8f0; }
html.dark .report-segmented button.active { border-color: #52a890; background: #173a31; color: #bde5d8; }
html.dark .condition-report legend, html.dark .recommendation-success > span { color: #c7ddd6; }
html.dark .condition-option:hover { border-color: var(--condition-color); background: #19283a; }

.solver-tools { display: flex; width: 100%; justify-content: space-between; gap: .6rem; margin-top: .75rem; }
.solver-tools button { min-height: 2.75rem; border: 1px solid #d6e7e2; border-radius: .75rem; background: rgba(255,255,255,.6); padding: .55rem .85rem; color: #647b74; font-size: .75rem; font-weight: 750; cursor: pointer; }
.solver-tools button i { margin-right: .4rem; }
.solver-tools button:disabled { opacity: .45; cursor: not-allowed; }
html.dark .solver-tools button { border-color: #334155; background: rgba(15,23,42,.65); color: #a8b9b4; }

.recommendation-error, .solver-terminal { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: .9rem; }
.recommendation-error > i, .solver-terminal > i { color: #b77c2c; font-size: 1.5rem; }
.recommendation-error strong, .solver-terminal h2 { color: #4d625c; }
.recommendation-error p, .solver-terminal p { margin: .25rem 0 0; color: #7a8c87; font-size: .78rem; line-height: 1.5; }
.recommendation-error button { grid-column: 2; justify-self: start; border: 0; background: transparent; padding: .4rem 0; color: #3e8f7a; font-size: .78rem; font-weight: 800; cursor: pointer; }
.solver-terminal h2 { margin: 0; font-size: clamp(1.7rem,3vw,2.25rem); font-weight: 950; letter-spacing: -.025em; }
.solver-terminal--completed { border-color: #9ed8c5; background: linear-gradient(135deg,#fff 0%,#f3fbf7 100%); }
.solver-terminal--completed > i { color: #3e9d79; font-size: 2.4rem; }
.solver-terminal-next { grid-column: 2; display: grid; grid-template-columns: auto 1fr auto; justify-self: stretch; align-items: center; gap: .15rem .8rem; min-height: 3.8rem; margin-top: .55rem; border: 1px solid #aedccb; border-radius: .85rem; background: #eaf8f2; padding: .55rem .85rem; color: #245f50; text-align: left; cursor: pointer; }
.solver-terminal-next img { grid-column: 1; grid-row: 1 / span 2; width: 2.8rem; height: 2.8rem; border-radius: .6rem; object-fit: cover; }
.solver-terminal-next span { grid-column: 2; font-size: .72rem; font-weight: 750; }
.solver-terminal-next strong { grid-column: 2; color: #194b3f; font-size: .95rem; font-weight: 900; }
.solver-terminal-next > i { grid-column: 3; grid-row: 1 / span 2; color: #398c72; }
.solver-terminal-export { grid-column: 2; display: inline-flex; min-height: 2.75rem; justify-self: start; align-items: center; border: 0; background: transparent; padding: .45rem .15rem; color: #78948c; font-size: .72rem; font-weight: 750; text-decoration: none; cursor: pointer; }
.solver-terminal-export i { margin-right: .4rem; }
.solver-terminal-export:hover { color: #3e8f7a; }
.solver-terminal-export:focus-visible { border-radius: .45rem; outline: 2px solid #4a9f88; outline-offset: 2px; }
html.dark .solver-terminal--completed { border-color: #356a5a; background: linear-gradient(135deg,#0f172a 0%,#10271f 100%); }
html.dark .solver-terminal--completed h2 { color: #d8f4ea; }
html.dark .solver-terminal--completed p { color: #a9c5bc; }
html.dark .solver-terminal-next { border-color: #356a5a; background: #15372d; color: #a9d8c9; }
html.dark .solver-terminal-next strong { color: #d8f4ea; }
html.dark .solver-terminal-export { color: #94a3b8; }
html.dark .solver-terminal-export:hover { color: #bde5d8; }

.solver-dialog-layer { position: fixed; z-index: 120; inset: 0; display: grid; place-items: center; background: rgba(15,23,42,.46); padding: 1rem; backdrop-filter: blur(5px); }
.solver-dialog { position: relative; width: min(30rem,100%); max-height: calc(100dvh - 2rem); overflow-y: auto; border: 1px solid #d8eee7; border-radius: 1.15rem; background: #fff; padding: 1.4rem; box-shadow: 0 25px 70px rgba(15,23,42,.28); }
.solver-dialog--actions { width: min(42rem,100%); }
.solver-dialog-close { position: absolute; top: .7rem; right: .7rem; display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 0; border-radius: 999px; background: transparent; color: #64748b; cursor: pointer; }
.solver-dialog-close:hover { background: #edf8f4; color: #285c50; }
.solver-dialog h2 { margin: 0 2.8rem 0 0; color: #234f44; font-size: 1.2rem; }
.solver-dialog > p { margin: .45rem 2.8rem 1.1rem 0; color: #72847f; font-size: .78rem; line-height: 1.5; }
.solver-dialog-list { display: grid; gap: .5rem; }
.solver-dialog-list button { display: flex; min-height: 4rem; align-items: center; gap: .75rem; border: 1px solid #dfece8; border-radius: .8rem; background: #fff; padding: .55rem; color: #334155; text-align: left; cursor: pointer; }
.solver-dialog-list button:disabled { background: #f1f8f5; color: #33715f; cursor: default; }
.solver-dialog-list img { width: 3rem; height: 3rem; border-radius: .6rem; object-fit: cover; }
.solver-dialog-list span { flex: 1; font-weight: 800; }
.solver-dialog-list i { margin-right: .5rem; color: #3e8f7a; }
.action-choice-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .5rem; }
.action-choice-grid button { display: flex; min-width: 0; min-height: 3.6rem; align-items: center; gap: .65rem; border: 1px solid #dfece8; border-radius: .75rem; background: #fff; padding: .45rem; color: #3f5751; text-align: left; cursor: pointer; }
.action-choice-grid button:hover { border-color: #75bfa9; background: #f4fbf8; }
.action-choice-grid button > span:last-child { overflow: hidden; font-size: .78rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.solver-dialog-actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.2rem; }
.solver-dialog-actions button { min-height: 2.8rem; border: 1px solid #d8e7e3; border-radius: .7rem; background: #fff; padding: .55rem .85rem; color: #60756f; font-weight: 800; cursor: pointer; }
.solver-dialog-actions .danger { border-color: #b04e5d; background: #b04e5d; color: #fff; }
html.dark .solver-dialog { border-color: #334155; background: #0f172a; }
html.dark .solver-dialog h2 { color: #d9f3e9; }
html.dark .solver-dialog-list button, html.dark .action-choice-grid button, html.dark .solver-dialog-actions button { border-color: #334155; background: #131f31; color: #d4dedb; }
html.dark .solver-dialog-list button:disabled { border-color: #3e8f7a; background: #173a31; color: #bde5d8; }

@media (max-width: 760px) {
  .craft-solver { padding: 1.5rem 1rem 5rem; }
  .solver-context { display: block; }
  .solver-equipment { width: 100%; max-width: none; margin: .8rem 0 0; white-space: normal; }
  .craft-dashboard { grid-template-columns: 1fr 1fr; }
  .solver-primary { min-height: 23rem; margin-top: 1.2rem; }
  .condition-option { flex-basis: var(--condition-option-width-narrow,var(--condition-option-width)); }
}

@media (max-width: 520px) {
  .solver-item-switch span { white-space: normal; }
  .craft-dashboard { gap: .5rem; }
  .craft-meter { padding: .65rem; }
  .recommendation-card, .report-card, .recommendation-error, .solver-terminal { padding: 1.1rem; border-radius: 1rem; }
  .recommendation-action { gap: .85rem; }
  .condition-option { flex-direction: column; gap: .35rem; padding: .4rem .2rem; }
  .condition-option > span { width: 100%; text-align: center; }
  .solver-dialog-layer { align-items: end; padding: 0; }
  .solver-dialog { width: 100%; max-height: 82dvh; border-radius: 1.15rem 1.15rem 0 0; padding-bottom: calc(1.4rem + env(safe-area-inset-bottom)); }
  .action-choice-grid { grid-template-columns: 1fr; }
}
</style>
