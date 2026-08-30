<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CRAFTING_JOBS,
  calculateEquipmentStatsAfterConsumables,
  isDefaultEquipmentProfile,
  useEquipmentProfiles,
  type EquipmentProfile,
  type EquipmentProfileJob,
} from '@/composables/useEquipmentProfiles'
import ConsumableAutoComplete from '@/components/equipment/ConsumableAutoComplete.vue'
import { useMissionData } from '@/services/missionData'
import type { CraftingConsumable, DataLocale } from '@/types/missionData'

type DraftProfile = Pick<EquipmentProfile,
  'id' | 'name' | 'jobs' | 'level' | 'craftsmanship' | 'control' | 'maxCp' |
  'food' | 'medicine' | 'relicToolGoodBonus' | 'specialist'>

const { t, locale } = useI18n()
const { orderedProfiles, createProfile, updateProfile, deleteProfile } = useEquipmentProfiles()
const { consumables, loading: consumablesLoading, error: consumablesError, load: loadConsumables } = useMissionData()
const selectedId = ref(orderedProfiles.value[0]?.id ?? null)
const selectedProfile = computed(() => orderedProfiles.value.find(profile => profile.id === selectedId.value) ?? null)
const isEditingDefault = computed(() => !!selectedProfile.value && isDefaultEquipmentProfile(selectedProfile.value))
const draft = ref(createDraft(selectedProfile.value))
const hasSelectedConsumables = computed(() => draft.value.food !== null || draft.value.medicine !== null)
const statsAfterConsumables = computed(() => calculateEquipmentStatsAfterConsumables(draft.value, consumables.value))
const saved = ref(false)
const isJobDialogOpen = ref(false)
const jobPicker = ref<HTMLButtonElement | null>(null)
const jobDialogClose = ref<HTMLButtonElement | null>(null)
let savedTimer: ReturnType<typeof window.setTimeout> | null = null

function createDraft(profile: EquipmentProfile | null): DraftProfile {
  return {
    id: profile?.id ?? '',
    name: profile?.name ?? '',
    jobs: profile ? [...profile.jobs] : ['carpenter'],
    level: profile?.level ?? 100,
    craftsmanship: profile?.craftsmanship ?? 5_408,
    control: profile?.control ?? 5_140,
    maxCp: profile?.maxCp ?? 630,
    food: profile?.food ? { ...profile.food } : null,
    medicine: profile?.medicine ? { ...profile.medicine } : null,
    relicToolGoodBonus: profile?.relicToolGoodBonus ?? true,
    specialist: profile?.specialist ?? false,
  }
}

function clearSaved() {
  saved.value = false
  if (savedTimer) window.clearTimeout(savedTimer)
  savedTimer = null
}

function selectProfile(profile: EquipmentProfile) {
  selectedId.value = profile.id
  draft.value = createDraft(profile)
  clearSaved()
}

async function startNewProfile() {
  const profile = createProfile()
  selectProfile(profile)
  await nextTick()
  document.querySelector<HTMLInputElement>('#equipment-profile-name')?.focus()
}

function toggleJob(job: EquipmentProfileJob) {
  if (isEditingDefault.value) return
  const next = draft.value.jobs.includes(job)
    ? draft.value.jobs.filter(item => item !== job)
    : [...draft.value.jobs, job]
  draft.value.jobs = next.length > 0 ? next : [job]
}

async function saveDraft() {
  updateProfile(draft.value.id, {
    ...draft.value,
    name: draft.value.name.trim(),
    jobs: [...draft.value.jobs],
  })
  const latest = orderedProfiles.value.find(profile => profile.id === draft.value.id) ?? null
  draft.value = createDraft(latest)
  await nextTick()
  clearSaved()
  saved.value = true
  savedTimer = window.setTimeout(() => {
    saved.value = false
    savedTimer = null
  }, 1_800)
}

function removeSelected() {
  if (!selectedProfile.value || isEditingDefault.value) return
  deleteProfile(selectedProfile.value.id)
  const next = orderedProfiles.value[0] ?? null
  selectedId.value = next?.id ?? null
  draft.value = createDraft(next)
  clearSaved()
}

function profileName(profile: EquipmentProfile) {
  if (isDefaultEquipmentProfile(profile)) return t('equipmentProfiles.defaultName')
  return profile.name || t('equipmentProfiles.unnamed')
}

function jobSummary(profile: EquipmentProfile) {
  if (profile.jobs.length === CRAFTING_JOBS.length) return t('equipmentProfiles.allJobs')
  if (profile.jobs.length === 1) return t(`missions.jobs.${profile.jobs[0]}`)
  return t('equipmentProfiles.jobCount', { count: profile.jobs.length })
}

function localizedConsumableName(selection: EquipmentProfile['food'], options: readonly DeepReadonly<CraftingConsumable>[]) {
  if (!selection) return t('equipmentProfiles.noFood')
  const item = options.find(option => option.itemId === selection.itemId)
  if (!item) return `#${selection.itemId}`
  const language = locale.value as DataLocale
  const name = item.names[language] ?? item.names.en ?? Object.values(item.names)[0] ?? `#${item.itemId}`
  return `${name} · ${t(`equipmentProfiles.quality.${selection.quality}`)}`
}

async function openJobDialog() {
  isJobDialogOpen.value = true
  await nextTick()
  jobDialogClose.value?.focus()
}

function closeJobDialog() {
  isJobDialogOpen.value = false
  void nextTick(() => jobPicker.value?.focus())
}

watch(draft, clearSaved, { deep: true })
onBeforeUnmount(clearSaved)
onMounted(() => void loadConsumables().catch(() => undefined))
</script>

<template>
  <div class="equipment-profiles-view">
    <header class="equipment-page-header">
      <h1>{{ t('equipmentProfiles.title') }}</h1>
      <p>{{ t('equipmentProfiles.description') }}</p>
    </header>

    <div class="equipment-layout">
      <section class="equipment-panel equipment-list-panel">
        <div class="equipment-panel-heading">
          <h2>{{ t('equipmentProfiles.listTitle') }}</h2>
          <button type="button" class="equipment-add" @click="startNewProfile">
            <i class="pi pi-plus"></i>
            <span>{{ t('equipmentProfiles.add') }}</span>
          </button>
        </div>

        <div class="equipment-profile-list">
          <button
            v-for="profile in orderedProfiles"
            :key="profile.id"
            type="button"
            class="equipment-profile-card"
            :class="{ 'equipment-profile-card--active': selectedId === profile.id }"
            @click="selectProfile(profile)"
          >
            <span class="equipment-card-title">
              <strong>{{ profileName(profile) }}</strong>
              <span v-if="isDefaultEquipmentProfile(profile)" class="equipment-default-badge">{{ t('equipmentProfiles.defaultBadge') }}</span>
            </span>
            <span>{{ jobSummary(profile) }} · Lv {{ profile.level }} · CP {{ profile.maxCp }}</span>
            <span>{{ profile.craftsmanship.toLocaleString() }} / {{ profile.control.toLocaleString() }} · {{ localizedConsumableName(profile.food, consumables.food) }}</span>
          </button>
        </div>
      </section>

      <section class="equipment-panel equipment-editor-panel">
        <div class="equipment-panel-heading equipment-editor-heading">
          <h2>{{ t('equipmentProfiles.editTitle') }}</h2>
          <span v-if="isEditingDefault">{{ t('equipmentProfiles.defaultLocked') }}</span>
        </div>

        <form class="equipment-editor" @submit.prevent="saveDraft">
          <label class="equipment-field">
            <strong>{{ t('equipmentProfiles.name') }}</strong>
            <input
              id="equipment-profile-name"
              v-model="draft.name"
              type="text"
              maxlength="60"
              :placeholder="profileName(selectedProfile!)"
              :disabled="isEditingDefault"
            />
          </label>

          <div class="equipment-field equipment-job-field">
            <strong>{{ t('equipmentProfiles.jobs') }}</strong>
            <button ref="jobPicker" type="button" class="equipment-job-picker" :disabled="isEditingDefault" @click="openJobDialog">
              <span>{{ t('equipmentProfiles.applyToJobs', { count: draft.jobs.length }) }}</span>
              <i class="pi pi-chevron-right"></i>
            </button>
          </div>

          <label class="equipment-field">
            <strong>{{ t('equipmentProfiles.level') }}</strong>
            <input v-model.number="draft.level" type="number" min="1" max="100" inputmode="numeric" />
          </label>
          <label class="equipment-field">
            <strong>
              {{ t('equipmentProfiles.craftsmanship') }}
              <span v-if="hasSelectedConsumables">{{ t('equipmentProfiles.afterConsumables', { value: statsAfterConsumables.craftsmanship.toLocaleString() }) }}</span>
            </strong>
            <input v-model.number="draft.craftsmanship" type="number" min="0" max="9999" inputmode="numeric" />
          </label>
          <label class="equipment-field">
            <strong>
              {{ t('equipmentProfiles.control') }}
              <span v-if="hasSelectedConsumables">{{ t('equipmentProfiles.afterConsumables', { value: statsAfterConsumables.control.toLocaleString() }) }}</span>
            </strong>
            <input v-model.number="draft.control" type="number" min="0" max="9999" inputmode="numeric" />
          </label>
          <label class="equipment-field">
            <strong>
              {{ t('equipmentProfiles.cp') }}
              <span v-if="hasSelectedConsumables">{{ t('equipmentProfiles.afterConsumables', { value: statsAfterConsumables.maxCp.toLocaleString() }) }}</span>
            </strong>
            <input v-model.number="draft.maxCp" type="number" min="0" max="999" inputmode="numeric" />
          </label>

          <label class="equipment-field">
            <strong>{{ t('equipmentProfiles.food') }}</strong>
            <ConsumableAutoComplete
              v-model="draft.food"
              :options="consumables.food"
              :placeholder="consumablesLoading ? t('equipmentProfiles.consumablesLoading') : t('equipmentProfiles.searchFood')"
              :empty-label="t('equipmentProfiles.noFood')"
            />
          </label>
          <label class="equipment-field">
            <strong>{{ t('equipmentProfiles.medicine') }}</strong>
            <ConsumableAutoComplete
              v-model="draft.medicine"
              :options="consumables.medicine"
              :placeholder="consumablesLoading ? t('equipmentProfiles.consumablesLoading') : t('equipmentProfiles.searchMedicine')"
              :empty-label="t('equipmentProfiles.noMedicine')"
            />
          </label>
          <p v-if="consumablesError" class="equipment-consumables-error">{{ t('equipmentProfiles.consumablesError') }}</p>

          <div class="equipment-field equipment-capability-field">
            <strong>{{ t('equipmentProfiles.relicTool') }}</strong>
            <button
              type="button"
              class="equipment-capability-toggle"
              :class="{ active: draft.relicToolGoodBonus }"
              :aria-pressed="draft.relicToolGoodBonus"
              @click="draft.relicToolGoodBonus = !draft.relicToolGoodBonus"
            >
              <span>{{ t('equipmentProfiles.relicToolOption') }}</span>
              <i class="pi" :class="draft.relicToolGoodBonus ? 'pi-check-circle' : 'pi-circle'"></i>
            </button>
          </div>

          <div class="equipment-field equipment-capability-field">
            <strong>{{ t('equipmentProfiles.specialist') }}</strong>
            <button
              type="button"
              class="equipment-capability-toggle"
              :class="{ active: draft.specialist }"
              :aria-pressed="draft.specialist"
              @click="draft.specialist = !draft.specialist"
            >
              <span>{{ t('equipmentProfiles.specialistOption') }}</span>
              <i class="pi" :class="draft.specialist ? 'pi-check-circle' : 'pi-circle'"></i>
            </button>
          </div>

          <div class="equipment-actions">
            <button v-if="!isEditingDefault" type="button" class="equipment-delete" @click="removeSelected">
              <i class="pi pi-trash"></i>
              {{ t('equipmentProfiles.delete') }}
            </button>
            <button type="submit" class="equipment-save" :class="{ saved }">
              <i class="pi" :class="saved ? 'pi-check' : 'pi-save'"></i>
              {{ saved ? t('equipmentProfiles.saved') : t('equipmentProfiles.save') }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="isJobDialogOpen" class="equipment-dialog-layer" @keydown.esc="closeJobDialog">
        <button type="button" class="equipment-dialog-backdrop" :aria-label="t('common.close')" @click="closeJobDialog"></button>
        <section class="equipment-job-dialog" role="dialog" aria-modal="true" :aria-labelledby="'equipment-job-dialog-title'">
          <header>
            <div>
              <h2 id="equipment-job-dialog-title">{{ t('equipmentProfiles.jobDialogTitle') }}</h2>
              <p>{{ t('equipmentProfiles.jobDialogDescription') }}</p>
            </div>
            <button ref="jobDialogClose" type="button" :aria-label="t('common.close')" @click="closeJobDialog"><i class="pi pi-times"></i></button>
          </header>
          <div class="equipment-dialog-jobs">
            <label v-for="job in CRAFTING_JOBS" :key="job">
              <input
                type="checkbox"
                :checked="draft.jobs.includes(job)"
                :disabled="draft.jobs.length === 1 && draft.jobs.includes(job)"
                @change="toggleJob(job)"
              />
              <span>{{ t(`missions.jobs.${job}`) }}</span>
            </label>
          </div>
          <button type="button" class="equipment-dialog-done" @click="closeJobDialog">{{ t('equipmentProfiles.jobDialogDone') }}</button>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.equipment-profiles-view { width: min(74rem, 100%); margin: 0 auto; padding: 2rem 2.25rem 6rem; }
.equipment-page-header { margin-bottom: 1.5rem; }
.equipment-page-header h1 { margin: 0; color: #176a50; font-size: clamp(1.75rem, 3vw, 2.2rem); font-weight: 900; line-height: 1.2; }
.equipment-page-header p { margin: .6rem 0 0; color: #557a70; }
.equipment-layout { display: grid; grid-template-columns: minmax(17rem, .72fr) minmax(0, 1.3fr); align-items: start; gap: 1rem; }
.equipment-panel { border: 1px solid #e1eee9; border-radius: 1.15rem; background: rgba(255,255,255,.94); box-shadow: 0 6px 20px rgba(31,73,63,.07); }
.equipment-list-panel { min-height: 35rem; padding: 1rem; }
.equipment-editor-panel { padding: 1rem; }
.equipment-panel-heading { display: flex; min-height: 2.75rem; align-items: center; justify-content: space-between; gap: 1rem; }
.equipment-panel-heading h2 { margin: 0; color: #243c36; font-size: .95rem; font-weight: 900; }
.equipment-editor-heading > span { color: #657d77; font-size: .7rem; }
.equipment-add, .equipment-save { display: inline-flex; min-height: 2.65rem; align-items: center; justify-content: center; gap: .45rem; border: 0; border-radius: .65rem; background: #18b885; padding: .55rem .9rem; color: #fff; font-weight: 800; cursor: pointer; }
.equipment-profile-list { display: grid; gap: .65rem; margin-top: .75rem; }
.equipment-profile-card { display: grid; width: 100%; min-height: 6rem; gap: .35rem; border: 1px solid #dce7e4; border-radius: .9rem; background: #f8fafb; padding: .9rem; color: #547069; text-align: left; cursor: pointer; }
.equipment-profile-card > span:not(.equipment-card-title) { font-size: .75rem; }
.equipment-profile-card--active { border-color: #43ad90; background: #fbfefd; box-shadow: 0 2px 7px rgba(42,133,107,.12); }
.equipment-card-title { display: flex; align-items: center; justify-content: space-between; gap: .75rem; color: #183e34; }
.equipment-card-title strong { font-weight: 900; }
.equipment-default-badge { border-radius: 999px; background: #d8f8e9; padding: .2rem .45rem; color: #15805e; font-size: .62rem; font-weight: 800; }
.equipment-editor { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: .85rem; margin-top: .75rem; }
.equipment-field { display: grid; min-width: 0; gap: .4rem; margin: 0; border: 0; padding: 0; color: #263e38; font-size: .75rem; }
.equipment-field > strong { font-weight: 900; }
.equipment-field > strong > span { margin-left: .35rem; color: #3f8e78; font-size: .68rem; font-weight: 800; white-space: nowrap; }
.equipment-field input { width: 100%; min-height: 2.75rem; border: 1px solid #ccdcd8; border-radius: .45rem; background: #fff; padding: .65rem .75rem; color: #21332f; font: inherit; font-size: .95rem; font-weight: 500; }
.equipment-field input:focus { border-color: #43ad90; outline: 3px solid rgba(67,173,144,.18); }
.equipment-field input:disabled { border-color: #dce5e2; background: #f1f5f4; color: #7b8c87; cursor: not-allowed; opacity: 1; }
.equipment-field input:disabled::placeholder { color: #657872; opacity: 1; }
.equipment-job-picker { display: flex; min-height: 2.8rem; align-items: center; justify-content: space-between; border: 1px solid #c9ddd7; border-radius: .55rem; background: #fff; padding: .65rem .8rem; color: #2d6a5a; font-weight: 850; cursor: pointer; }
.equipment-job-picker:hover:not(:disabled) { border-color: #65bba4; background: #f1faf7; }
.equipment-job-picker:disabled { cursor: not-allowed; opacity: .72; }
.equipment-consumables-error { grid-column: 1 / -1; margin: -.25rem 0 0; color: #a33d4d; font-size: .72rem; font-weight: 750; }
:deep(.consumable-autocomplete .p-autocomplete-input) { min-height: 2.75rem; border-color: #ccdcd8; font-size: .88rem; }
:deep(.consumable-autocomplete .p-autocomplete-dropdown) { min-width: 2.75rem; border-color: #ccdcd8; background: #f4faf7; color: #3e8f7a; }
:global(html.dark) :deep(.consumable-autocomplete .p-autocomplete-input) { border-color: #334155; background: #131f31; color: #f1f5f9; }
:global(html.dark) :deep(.consumable-autocomplete .p-autocomplete-dropdown) { border-color: #334155; background: #1e293b; color: #75bfa9; }
.equipment-capability-toggle { display: flex; min-height: 3rem; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid #dce7e4; border-radius: .75rem; background: #f8fafb; padding: .7rem .85rem; color: #60736e; text-align: left; cursor: pointer; }
.equipment-capability-toggle span { display: block; color: #2c4941; font-size: .8rem; font-weight: 800; }
.equipment-capability-toggle > i { color: #93a8a2; font-size: 1.55rem; }
.equipment-capability-toggle.active { border-color: #43ad90; background: #eafaf4; }
.equipment-capability-toggle.active > i { color: #43ad90; }
.equipment-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: .65rem; margin-top: .1rem; }
.equipment-delete { min-height: 2.75rem; border: 1px solid #f1b8be; border-radius: .65rem; background: #fff6f6; padding: .55rem .9rem; color: #b84955; font-weight: 800; cursor: pointer; }
.equipment-save { position: relative; min-width: 8.2rem; overflow: hidden; }
.equipment-save.saved { background: #2f8e74; animation: equipment-save-confirm .42s cubic-bezier(.2,.85,.35,1.25); }
.equipment-save.saved > i { animation: equipment-save-check .42s ease-out; }
.equipment-save.saved::after { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 28%, rgba(255,255,255,.32) 48%, transparent 68%); content: ''; transform: translateX(110%); animation: equipment-save-shine .62s ease-out; pointer-events: none; }
@keyframes equipment-save-confirm { 0% { transform: scale(1); } 45% { transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes equipment-save-check { 0% { opacity: 0; transform: scale(.45) rotate(-18deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes equipment-save-shine { from { transform: translateX(-110%); } to { transform: translateX(110%); } }
.equipment-dialog-layer { position: fixed; z-index: 120; inset: 0; display: grid; place-items: center; padding: 1rem; }
.equipment-dialog-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(15,23,42,.42); backdrop-filter: blur(4px); cursor: default; }
.equipment-job-dialog { position: relative; width: min(28rem, 100%); border: 1px solid #dcece7; border-radius: 1rem; background: #fff; padding: 1.25rem; box-shadow: 0 24px 70px rgba(15,23,42,.28); }
.equipment-job-dialog header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.equipment-job-dialog h2 { margin: 0; color: #234f44; font-size: 1.1rem; font-weight: 900; }
.equipment-job-dialog p { margin: .35rem 0 0; color: #73847f; font-size: .75rem; line-height: 1.5; }
.equipment-job-dialog header > button { display: grid; width: 2.75rem; height: 2.75rem; flex: 0 0 auto; place-items: center; border: 0; border-radius: 999px; background: #eff8f5; color: #3e8f7a; cursor: pointer; }
.equipment-dialog-jobs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .55rem; margin-top: 1rem; }
.equipment-dialog-jobs label { position: relative; cursor: pointer; }
.equipment-dialog-jobs input { position: absolute; opacity: 0; pointer-events: none; }
.equipment-dialog-jobs span { display: flex; min-height: 2.8rem; align-items: center; border: 1px solid #dce7e4; border-radius: .65rem; background: #f8fafb; padding: .65rem .8rem; color: #566b65; font-size: .8rem; font-weight: 800; }
.equipment-dialog-jobs input:checked + span { border-color: #52a890; background: #eafaf4; color: #246b58; }
.equipment-dialog-jobs input:focus-visible + span { outline: 3px solid rgba(82,168,144,.35); outline-offset: 2px; }
.equipment-dialog-jobs input:disabled + span { cursor: not-allowed; opacity: .72; }
.equipment-dialog-done { width: 100%; min-height: 2.8rem; margin-top: 1rem; border: 0; border-radius: .65rem; background: #18b885; color: #fff; font-weight: 900; cursor: pointer; }
html.dark .equipment-panel { border-color: #29483f; background: #0f172a; }
html.dark .equipment-page-header h1 { color: #86d0b9; }
html.dark .equipment-page-header p { color: #9ec9bc; }
html.dark .equipment-panel-heading h2, html.dark .equipment-card-title, html.dark .equipment-field, html.dark .equipment-capability-toggle span { color: #d9f3e9; }
html.dark .equipment-profile-card, html.dark .equipment-field input, html.dark .equipment-job-toggle, html.dark .equipment-segmented button, html.dark .equipment-capability-toggle { border-color: #334155; background: #131f31; color: #b4c4bf; }
html.dark .equipment-profile-card--active, html.dark .equipment-job-toggle--active, html.dark .equipment-segmented button.active, html.dark .equipment-capability-toggle.active { border-color: #52a890; background: #173a31; color: #bde5d8; }
html.dark .equipment-field input { color: #f1f5f9; }
html.dark .equipment-field > strong > span { color: #75bfa9; }
html.dark .equipment-field input:disabled { border-color: #334155; background: #1b2638; color: #82928f; }
html.dark .equipment-field input:disabled::placeholder { color: #82928f; }
html.dark .equipment-delete { border-color: #7f3540; background: #331a20; color: #f4a8b1; }
html.dark .equipment-job-picker { border-color: #334155; background: #131f31; color: #bde5d8; }
html.dark .equipment-job-dialog { border-color: #334155; background: #0f172a; }
html.dark .equipment-job-dialog h2 { color: #d9f3e9; }
html.dark .equipment-job-dialog p { color: #94a3b8; }
html.dark .equipment-job-dialog header > button { background: #1e293b; color: #75bfa9; }
html.dark .equipment-dialog-jobs span { border-color: #334155; background: #131f31; color: #cbd5e1; }
html.dark .equipment-dialog-jobs input:checked + span { border-color: #52a890; background: #173a31; color: #bde5d8; }
@media (prefers-reduced-motion: reduce) {
  .equipment-save.saved, .equipment-save.saved > i, .equipment-save.saved::after { animation: none; }
}
@media (max-width: 900px) { .equipment-layout { grid-template-columns: 1fr; } .equipment-list-panel { min-height: auto; } .equipment-profile-list { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 640px) { .equipment-profiles-view { padding: 1.5rem 1rem 5rem; } .equipment-profile-list { grid-template-columns: 1fr; } .equipment-editor { grid-template-columns: 1fr; } .equipment-field, .equipment-job-field { grid-column: 1; } .equipment-capability-toggle, .equipment-actions { grid-column: 1; } .equipment-actions { flex-direction: column-reverse; } .equipment-actions button { width: 100%; } .equipment-job-dialog { align-self: end; border-radius: 1rem 1rem 0 0; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
