<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import type { CraftScenarioDefinition, CraftScenarioId } from '../scenarios'
import ItemIcon from './ItemIcon.vue'

const props = defineProps<{
  scenarios: readonly CraftScenarioDefinition[]
  currentScenario: CraftScenarioDefinition
}>()

const emit = defineEmits<{
  select: [scenarioId: CraftScenarioId]
}>()

const instanceId = useId()
const dialogId = `recipe-switcher-dialog-${instanceId}`
const titleId = `recipe-switcher-title-${instanceId}`
const descriptionId = `recipe-switcher-description-${instanceId}`
const searchId = `recipe-switcher-search-${instanceId}`
const dialog = ref<HTMLDialogElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const query = ref('')

const filteredScenarios = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  if (!term) return props.scenarios
  return props.scenarios.filter((scenario) => (
    `${scenario.recipe.displayName}\n${scenario.missionLabel}`.toLocaleLowerCase().includes(term)
  ))
})

function selectionLabel(scenario: CraftScenarioDefinition): string {
  return scenario.scenarioId === props.currentScenario.scenarioId
    ? `重新開始「${scenario.recipe.displayName}」`
    : `切換至「${scenario.recipe.displayName}」並從第一步開始`
}

function openDialog(): void {
  if (!dialog.value || dialog.value.open) return
  dialog.value.showModal()
  isOpen.value = true
  void nextTick(() => searchInput.value?.focus())
}

function closeDialog(): void {
  if (dialog.value?.open) dialog.value.close()
}

function handleClosed(): void {
  isOpen.value = false
  query.value = ''
  void nextTick(() => trigger.value?.focus())
}

function handleBackdropClick(event: MouseEvent): void {
  if (event.target === dialog.value) closeDialog()
}

function chooseScenario(scenario: CraftScenarioDefinition): void {
  closeDialog()
  emit('select', scenario.scenarioId as CraftScenarioId)
}
</script>

<template>
  <div class="recipe-switcher">
    <button
      ref="trigger"
      type="button"
      class="recipe-switcher-trigger"
      aria-haspopup="dialog"
      :aria-controls="dialogId"
      :aria-expanded="isOpen"
      @click="openDialog"
    >
      <ItemIcon
        :file-name="currentScenario.itemIconFileName"
        :item-name="currentScenario.recipe.displayName"
        size="small"
      />
      <span class="recipe-switcher-current">
        <small>目前配方</small>
        <strong>{{ currentScenario.recipe.displayName }}</strong>
        <span>{{ currentScenario.missionLabel }}</span>
      </span>
      <span class="recipe-switcher-call-to-action">
        切換配方
        <span aria-hidden="true">⌄</span>
      </span>
    </button>

    <dialog
      :id="dialogId"
      ref="dialog"
      class="recipe-switcher-dialog"
      :aria-labelledby="titleId"
      :aria-describedby="descriptionId"
      @click="handleBackdropClick"
      @close="handleClosed"
      @keydown.esc.prevent="closeDialog"
    >
      <div class="recipe-switcher-sheet">
        <header class="recipe-switcher-dialog-header">
          <div>
            <p class="section-kicker">製作目標</p>
            <h2 :id="titleId">選擇製作配方</h2>
            <p :id="descriptionId">選擇後會從第一步重新開始；目前配方也可以重新選擇。</p>
          </div>
          <button type="button" class="recipe-switcher-close" aria-label="關閉配方選擇" @click="closeDialog">×</button>
        </header>

        <div class="recipe-switcher-search">
          <div class="recipe-switcher-search-heading">
            <label :for="searchId">搜尋配方</label>
            <span role="status">{{ filteredScenarios.length }} 個結果</span>
          </div>
          <input
            :id="searchId"
            ref="searchInput"
            v-model="query"
            type="search"
            inputmode="search"
            autocomplete="off"
            placeholder="搜尋配方名稱或任務"
          />
        </div>

        <div class="recipe-switcher-list">
          <button
            v-for="scenario in filteredScenarios"
            :key="scenario.scenarioId"
            type="button"
            class="recipe-switcher-option"
            :class="{ active: scenario.scenarioId === currentScenario.scenarioId }"
            :aria-current="scenario.scenarioId === currentScenario.scenarioId ? 'true' : undefined"
            :aria-label="selectionLabel(scenario)"
            @click="chooseScenario(scenario)"
          >
            <ItemIcon
              :file-name="scenario.itemIconFileName"
              :item-name="scenario.recipe.displayName"
              size="small"
            />
            <span class="recipe-switcher-option-copy">
              <strong>{{ scenario.recipe.displayName }}</strong>
              <small>{{ scenario.missionLabel }}</small>
              <span>{{ scenario.recipe.progressRequired.toLocaleString() }} 作業 · {{ scenario.recipe.durabilityMax }} 耐久</span>
            </span>
            <span v-if="scenario.scenarioId === currentScenario.scenarioId" class="recipe-switcher-current-badge">重新開始</span>
            <span v-else class="recipe-switcher-option-arrow" aria-hidden="true">›</span>
          </button>
          <p v-if="filteredScenarios.length === 0" class="recipe-switcher-empty">找不到符合「{{ query.trim() }}」的配方。</p>
        </div>

        <footer class="recipe-switcher-dialog-footer">
          <button type="button" class="ghost-button" @click="closeDialog">取消</button>
        </footer>
      </div>
    </dialog>
  </div>
</template>
