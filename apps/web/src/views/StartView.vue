<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMissionData } from '@/services/missionData'
import {
  calculateEquipmentStatsAfterConsumables,
  findPreferredEquipmentProfileForJob,
  isDefaultEquipmentProfile,
  useEquipmentProfiles,
} from '@/composables/useEquipmentProfiles'
import {
  CRAFT_JOBS, MISSION_PLANETS, MISSION_RANKS, MISSION_TYPES,
  type CosmicMission, type CraftJob, type DataLocale, type LocalizedNames, type MissionItem,
  type MissionPlanet, type MissionRank, type MissionType,
} from '@/types/missionData'

interface MissionFilters {
  jobs: CraftJob[]
  ranks: MissionRank[]
  planets: MissionPlanet[]
  types: MissionType[]
}

const PAGE_SIZE = 36
const { t, locale } = useI18n()
const missionData = useMissionData()
const equipmentProfiles = useEquipmentProfiles()
const query = ref('')
const visibleCount = ref(PAGE_SIZE)
const isFilterOpen = ref(false)
const selectedMission = ref<DeepReadonly<CosmicMission> | null>(null)
const selectedRecipeId = ref<number | null>(null)
const selectedEquipmentProfileId = ref<string | null>(null)
const filterButton = ref<HTMLButtonElement | null>(null)
const filterCloseButton = ref<HTMLButtonElement | null>(null)
const filterShell = ref<HTMLElement | null>(null)
const detailCloseButton = ref<HTMLButtonElement | null>(null)
const applied = reactive<MissionFilters>({ jobs: [], ranks: [], planets: [], types: [] })
const draft = reactive<MissionFilters>({ jobs: [], ranks: [], planets: [], types: [] })

const localizedName = (names: LocalizedNames) => {
  const language = locale.value as DataLocale
  return names[language] || names.en || Object.values(names)[0] || ''
}

const filterIsActive = computed(() => applied.jobs.length + applied.ranks.length + applied.planets.length + applied.types.length > 0)
const filteredMissions = computed(() => {
  const search = query.value.trim().toLocaleLowerCase()
  return missionData.missions.value.filter((mission) => {
    if (applied.jobs.length && !applied.jobs.includes(mission.job)) return false
    if (applied.ranks.length && !applied.ranks.includes(mission.rank)) return false
    if (applied.planets.length && !applied.planets.includes(mission.planet)) return false
    if (applied.types.length && !applied.types.every(type => mission.types.includes(type))) return false
    if (!search) return true
    return [
      ...Object.values(mission.names),
      t(`missions.jobs.${mission.job}`),
      t(`missions.planets.${mission.planet}`),
      ...mission.items.flatMap(item => Object.values(item.names)),
    ].join(' ').toLocaleLowerCase().includes(search)
  })
})
const visibleMissions = computed(() => filteredMissions.value.slice(0, visibleCount.value))
const compatibleEquipmentProfiles = computed(() => selectedMission.value
  ? equipmentProfiles.profilesForJob(selectedMission.value.job)
  : [])
const selectedEquipmentProfile = computed(() => compatibleEquipmentProfiles.value
  .find(profile => profile.id === selectedEquipmentProfileId.value) ?? null)
const selectedEquipmentSummary = computed(() => {
  const profile = selectedEquipmentProfile.value
  if (!profile) return ''

  const stats = calculateEquipmentStatsAfterConsumables(profile, missionData.consumables.value)
  const parts = [
    `${stats.craftsmanship.toLocaleString()}/${stats.control.toLocaleString()}/${stats.maxCp.toLocaleString()}`,
  ]
  if (profile.relicToolGoodBonus) parts.push(t('missions.equipmentRelicEffect'))
  if (profile.specialist) parts.push(t('missions.equipmentSpecialist'))
  return parts.join(' · ')
})

watch([query, () => JSON.stringify(applied)], () => { visibleCount.value = PAGE_SIZE })

const copyFilters = (from: MissionFilters, to: MissionFilters) => {
  to.jobs = [...from.jobs]
  to.ranks = [...from.ranks]
  to.planets = [...from.planets]
  to.types = [...from.types]
}
const emptyFilters = (): MissionFilters => ({ jobs: [], ranks: [], planets: [], types: [] })

const openFilters = async () => {
  copyFilters(applied, draft)
  isFilterOpen.value = true
  await nextTick()
  filterCloseButton.value?.focus()
}
const closeFilters = (restoreFocus = true) => {
  isFilterOpen.value = false
  if (restoreFocus) void nextTick(() => filterButton.value?.focus())
}
const applyFilters = () => { copyFilters(draft, applied); closeFilters() }
const clearFilters = () => { copyFilters(emptyFilters(), draft); copyFilters(draft, applied); closeFilters() }
const openMission = async (mission: DeepReadonly<CosmicMission>) => {
  selectedMission.value = mission
  selectedRecipeId.value = mission.items[0]?.recipeId ?? null
  selectedEquipmentProfileId.value = findPreferredEquipmentProfileForJob(
    equipmentProfiles.orderedProfiles.value,
    mission.job,
  )?.id ?? null
  await nextTick()
  detailCloseButton.value?.focus()
}
const closeMission = () => {
  selectedMission.value = null
  selectedRecipeId.value = null
  selectedEquipmentProfileId.value = null
}
const profileName = (profile: NonNullable<typeof selectedEquipmentProfile.value>) => {
  if (isDefaultEquipmentProfile(profile)) return t('equipmentProfiles.defaultName')
  return profile.name || t('equipmentProfiles.unnamed')
}
const itemInputId = (item: DeepReadonly<MissionItem>) => `mission-item-${item.recipeId}`
const onDocumentPointerDown = (event: PointerEvent) => {
  if (isFilterOpen.value && !filterShell.value?.contains(event.target as Node)) closeFilters(false)
}
const onDocumentKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  if (selectedMission.value) { closeMission(); return }
  if (isFilterOpen.value) closeFilters()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeyDown)
  void missionData.load()
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<template>
  <section class="mission-browser" aria-labelledby="mission-browser-title">
    <header class="mission-browser-header">
      <h1 id="mission-browser-title" class="page-title">{{ t('missions.title') }}</h1>
      <p class="page-description">{{ t('missions.description') }}</p>
    </header>

    <div ref="filterShell" class="mission-search-shell">
      <label class="mission-search">
        <i class="pi pi-search" aria-hidden="true"></i>
        <span class="sr-only">{{ t('missions.searchLabel') }}</span>
        <input v-model="query" type="search" :placeholder="t('missions.searchPlaceholder')" />
      </label>
      <button
        ref="filterButton"
        class="mission-filter-trigger"
        :class="{ 'mission-filter-trigger--active': filterIsActive }"
        type="button"
        :aria-label="t('missions.filters.open')"
        :aria-expanded="isFilterOpen"
        aria-controls="mission-filter-panel"
        @click="isFilterOpen ? closeFilters() : openFilters()"
      >
        <i class="pi pi-filter" aria-hidden="true"></i>
      </button>

      <div v-if="isFilterOpen" id="mission-filter-panel" class="mission-filter-panel" role="dialog" :aria-label="t('missions.filters.title')">
        <div class="mission-filter-heading">
          <strong>{{ t('missions.filters.title') }}</strong>
          <button ref="filterCloseButton" type="button" :aria-label="t('common.close')" @click="closeFilters()">
            <i class="pi pi-times" aria-hidden="true"></i>
          </button>
        </div>
        <fieldset>
          <legend>{{ t('missions.filters.job') }}</legend>
          <div class="filter-chip-grid filter-chip-grid--jobs">
            <label v-for="job in CRAFT_JOBS" :key="job" class="filter-chip">
              <input v-model="draft.jobs" type="checkbox" :value="job" />
              <span>{{ t(`missions.jobs.${job}`) }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{{ t('missions.filters.rank') }}</legend>
          <div class="filter-chip-grid">
            <label v-for="rank in MISSION_RANKS" :key="rank" class="filter-chip">
              <input v-model="draft.ranks" type="checkbox" :value="rank" />
              <span>{{ t(`missions.ranks.${rank}`) }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{{ t('missions.filters.planet') }}</legend>
          <div class="filter-chip-grid">
            <label v-for="planet in MISSION_PLANETS" :key="planet" class="filter-chip">
              <input v-model="draft.planets" type="checkbox" :value="planet" />
              <span>{{ t(`missions.planets.${planet}`) }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{{ t('missions.filters.type') }}</legend>
          <div class="filter-chip-grid">
            <label v-for="type in MISSION_TYPES" :key="type" class="filter-chip">
              <input v-model="draft.types" type="checkbox" :value="type" />
              <span>{{ t(`missions.types.${type}`) }}</span>
            </label>
          </div>
        </fieldset>
        <div class="mission-filter-actions">
          <button type="button" class="filter-clear" @click="clearFilters">{{ t('missions.filters.clear') }}</button>
          <button type="button" class="filter-apply" @click="applyFilters">{{ t('missions.filters.apply') }}</button>
        </div>
      </div>
    </div>

    <div v-if="missionData.loading.value && !missionData.missions.value.length" class="mission-state" aria-live="polite">
      <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
      <span>{{ t('missions.loading') }}</span>
    </div>
    <div v-else-if="missionData.error.value" class="mission-state mission-state--error" role="alert">
      <span>{{ t('missions.loadError') }}</span>
      <button type="button" @click="missionData.retry">{{ t('missions.retry') }}</button>
    </div>
    <template v-else>
      <div class="mission-results-summary" aria-live="polite">{{ t('missions.resultCount', { count: filteredMissions.length }) }}</div>
      <div v-if="visibleMissions.length" class="mission-card-grid">
        <article v-for="mission in visibleMissions" :key="mission.id" class="mission-card">
          <button class="mission-card-main" type="button" @click="openMission(mission)">
            <img class="mission-job-icon" :src="mission.jobIcon" :alt="t(`missions.jobs.${mission.job}`)" />
            <span class="mission-card-copy">
              <span class="mission-card-meta">
                {{ t(`missions.jobs.${mission.job}`) }} · {{ t(`missions.ranks.${mission.rank}`) }} · {{ t(`missions.planets.${mission.planet}`) }}
              </span>
              <strong>{{ localizedName(mission.names) }}</strong>
            </span>
            <span class="mission-item-stack" :aria-label="t('missions.itemCount', { count: mission.items.length })">
              <img v-for="(item, index) in mission.items.slice(0, 3)" :key="item.recipeId" :src="item.icon" :alt="localizedName(item.names)" :style="{ zIndex: mission.items.length - index }" />
            </span>
            <span class="mission-favorite-space" aria-hidden="true"></span>
          </button>
          <span class="mission-favorite-slot" :title="t('missions.favoriteSoon')" aria-hidden="true">
            <i class="pi pi-heart"></i>
          </span>
        </article>
      </div>
      <div v-else class="mission-state">
        <span>{{ t('missions.empty') }}</span>
        <button v-if="filterIsActive" type="button" @click="clearFilters">{{ t('missions.filters.clear') }}</button>
      </div>
      <button v-if="visibleCount < filteredMissions.length" class="mission-load-more" type="button" @click="visibleCount += PAGE_SIZE">
        {{ t('missions.loadMore') }}
      </button>
    </template>
  </section>

  <Teleport to="body">
    <div v-if="selectedMission" class="mission-detail-layer" @click.self="closeMission">
      <section class="mission-detail" role="dialog" aria-modal="true" :aria-labelledby="`mission-${selectedMission.id}-title`">
        <button ref="detailCloseButton" class="mission-detail-close" type="button" :aria-label="t('common.close')" @click="closeMission">
          <i class="pi pi-times" aria-hidden="true"></i>
        </button>
        <div class="mission-detail-heading">
          <img :src="selectedMission.jobIcon" :alt="t(`missions.jobs.${selectedMission.job}`)" />
          <div>
            <span>{{ t(`missions.jobs.${selectedMission.job}`) }} · {{ t(`missions.planets.${selectedMission.planet}`) }}</span>
            <h2 :id="`mission-${selectedMission.id}-title`">{{ localizedName(selectedMission.names) }}</h2>
          </div>
        </div>
        <fieldset class="mission-detail-section">
          <legend>{{ t('missions.chooseItem') }}</legend>
          <div class="mission-detail-items">
            <label v-for="item in selectedMission.items" :key="item.recipeId" class="mission-detail-item" :for="itemInputId(item)">
              <input :id="itemInputId(item)" v-model="selectedRecipeId" type="radio" name="mission-item" :value="item.recipeId" />
              <img :src="item.icon" :alt="localizedName(item.names)" />
              <strong>{{ localizedName(item.names) }}</strong>
              <i class="pi pi-check" aria-hidden="true"></i>
            </label>
          </div>
        </fieldset>
        <fieldset class="mission-detail-section">
          <legend>{{ t('missions.chooseEquipmentProfile') }}</legend>
          <label class="mission-equipment-select">
            <span class="sr-only">{{ t('missions.equipmentProfileLabel') }}</span>
            <select v-model="selectedEquipmentProfileId">
              <option v-for="profile in compatibleEquipmentProfiles" :key="profile.id" :value="profile.id">
                {{ profileName(profile) }}
              </option>
            </select>
            <i class="pi pi-chevron-down" aria-hidden="true"></i>
          </label>
          <p v-if="selectedEquipmentProfile" class="mission-equipment-summary">
            {{ selectedEquipmentSummary }}
          </p>
        </fieldset>
        <button class="mission-detail-start" type="button" :disabled="selectedRecipeId === null || selectedEquipmentProfile === null">
          {{ t('missions.startCrafting') }}
        </button>
      </section>
    </div>
  </Teleport>
</template>
