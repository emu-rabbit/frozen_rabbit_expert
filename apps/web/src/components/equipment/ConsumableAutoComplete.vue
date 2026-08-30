<script setup lang="ts">
import { ref, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import AutoComplete from 'primevue/autocomplete'
import type { CraftingConsumable, DataLocale } from '@/types/missionData'
import type { ConsumableSelection } from '@/composables/useEquipmentProfiles'

type ConsumableOption = {
  selection: ConsumableSelection | null
  label: string
  name: string
  summary: string
  icon: string
  quality: 'nq' | 'hq'
  searchText: string
}

const props = defineProps<{
  modelValue: ConsumableSelection | null
  options: readonly DeepReadonly<CraftingConsumable>[]
  placeholder: string
  emptyLabel: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ConsumableSelection | null]
}>()

const { t, locale } = useI18n()
const suggestions = ref<ConsumableOption[]>([])

function itemName(item: DeepReadonly<CraftingConsumable>) {
  const language = locale.value as DataLocale
  return item.names[language] ?? item.names.en ?? Object.values(item.names)[0] ?? `#${item.itemId}`
}

function buildOption(item: DeepReadonly<CraftingConsumable>, quality: 'nq' | 'hq'): ConsumableOption {
  const name = itemName(item)
  const qualityLabel = t(`equipmentProfiles.quality.${quality}`)
  const summary = item.bonuses.map(bonus => {
    const value = bonus[quality]
    return `${t(`equipmentProfiles.bonusStats.${bonus.stat}`)} +${value.percent}% (${t('equipmentProfiles.bonusMax')} ${value.max})`
  }).join(' / ')
  return {
    selection: { itemId: item.itemId, quality },
    label: `${name} · ${qualityLabel}`,
    name,
    summary,
    icon: item.icon,
    quality,
    searchText: `${Object.values(item.names).join(' ')} ${item.itemId} ${quality} ${qualityLabel}`.toLowerCase(),
  }
}

function allOptions() {
  const empty: ConsumableOption = {
    selection: null,
    label: props.emptyLabel,
    name: props.emptyLabel,
    summary: '',
    icon: '',
    quality: 'nq',
    searchText: props.emptyLabel.toLowerCase(),
  }
  const sorted = [...props.options].sort((left, right) => right.itemLevel - left.itemLevel || right.itemId - left.itemId)
  return [empty, ...sorted.flatMap(item => [buildOption(item, 'hq'), buildOption(item, 'nq')])]
}

function selectedOption() {
  if (!props.modelValue) return allOptions()[0] ?? null
  const item = props.options.find(option => option.itemId === props.modelValue?.itemId)
  return item ? buildOption(item, props.modelValue.quality) : null
}

function search(event: { query: string }) {
  const query = event.query.trim().toLowerCase()
  const options = allOptions()
  suggestions.value = (query ? options.filter(option => option.searchText.includes(query)) : options).slice(0, 40)
}

function update(value: ConsumableOption | string | null) {
  emit('update:modelValue', value && typeof value === 'object' ? value.selection : null)
}
</script>

<template>
  <AutoComplete
    class="consumable-autocomplete"
    :model-value="selectedOption()"
    :suggestions="suggestions"
    option-label="label"
    :placeholder="placeholder"
    force-selection
    dropdown
    fluid
    @update:model-value="update"
    @complete="search"
  >
    <template #option="{ option }">
      <div class="consumable-option">
        <span v-if="!option.selection" class="consumable-empty-icon"><i class="pi pi-ban"></i></span>
        <img v-else :src="option.icon" :alt="option.name" />
        <span v-if="option.selection" class="consumable-quality" :class="`consumable-quality--${option.quality}`">{{ t(`equipmentProfiles.quality.${option.quality}`) }}</span>
        <span class="consumable-copy">
          <strong>{{ option.name }}</strong>
          <small v-if="option.summary">{{ option.summary }}</small>
        </span>
      </div>
    </template>
  </AutoComplete>
</template>

<style scoped>
.consumable-autocomplete { width: 100%; }
.consumable-option { display: flex; min-width: 0; align-items: center; gap: .65rem; }
.consumable-option img { width: 2.25rem; height: 2.25rem; flex: 0 0 auto; border-radius: .5rem; background: #eef4f2; object-fit: cover; image-rendering: pixelated; }
.consumable-empty-icon { display: grid; width: 2.25rem; height: 2.25rem; flex: 0 0 auto; place-items: center; border-radius: .5rem; background: #eef4f2; color: #91a29d; }
.consumable-quality { flex: 0 0 auto; border-radius: .35rem; padding: .15rem .42rem; font-size: .65rem; font-weight: 900; }
.consumable-quality--hq { background: #fef3c7; color: #a9560a; }
.consumable-quality--nq { background: #dcfce7; color: #167145; }
.consumable-copy { display: grid; min-width: 0; gap: .12rem; }
.consumable-copy strong, .consumable-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.consumable-copy strong { color: #334155; font-size: .82rem; font-weight: 850; }
.consumable-copy small { color: #84958f; font-size: .68rem; }
:global(html.dark .consumable-option img) { background: #1e293b; }
:global(html.dark .consumable-empty-icon) { background: #1e293b; color: #94a3b8; }
:global(html.dark .consumable-quality--hq) { background: rgba(120,53,15,.42); color: #fde68a; }
:global(html.dark .consumable-quality--nq) { background: rgba(20,83,45,.42); color: #bbf7d0; }
:global(html.dark .consumable-copy strong) { color: #f1f5f9; }
</style>
