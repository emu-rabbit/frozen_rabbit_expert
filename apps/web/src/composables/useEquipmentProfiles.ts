import { computed, ref, watch, type DeepReadonly } from 'vue'
import type { CraftingJob } from '@frozen-rabbit-expert/domain'
import type { CraftingConsumable } from '@/types/missionData'

export const CRAFTING_JOBS = [
  'carpenter',
  'blacksmith',
  'armorer',
  'goldsmith',
  'leatherworker',
  'weaver',
  'alchemist',
  'culinarian',
] as const satisfies readonly Exclude<CraftingJob, 'unknown'>[]

export type EquipmentProfileJob = (typeof CRAFTING_JOBS)[number]
export interface ConsumableSelection {
  itemId: number
  quality: 'nq' | 'hq'
}

export interface EquipmentProfile {
  id: string
  kind: 'default' | 'custom'
  name: string
  jobs: EquipmentProfileJob[]
  level: number
  craftsmanship: number
  control: number
  maxCp: number
  food: ConsumableSelection | null
  medicine: ConsumableSelection | null
  relicToolGoodBonus: boolean
  specialist: boolean
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'frozen-rabbit-cosmic-equipment-profiles-v1'
const DEFAULT_PROFILE_ID = 'default-crafter'

const limits = {
  level: { min: 1, max: 100 },
  craftsmanship: { min: 0, max: 9_999 },
  control: { min: 0, max: 9_999 },
  maxCp: { min: 0, max: 999 },
} as const

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  const value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `equipment-${value}`
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function createDefaultProfile(): EquipmentProfile {
  const timestamp = nowIso()
  return {
    id: DEFAULT_PROFILE_ID,
    kind: 'default',
    name: '',
    jobs: [...CRAFTING_JOBS],
    level: 100,
    craftsmanship: 5_408,
    control: 5_140,
    maxCp: 630,
    food: { itemId: 44_091, quality: 'hq' },
    medicine: { itemId: 44_169, quality: 'hq' },
    relicToolGoodBonus: true,
    specialist: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function normalizeEquipmentProfile(
  input: Partial<EquipmentProfile>,
  fallback: EquipmentProfile = createDefaultProfile(),
): EquipmentProfile {
  const kind = input.id === DEFAULT_PROFILE_ID || input.kind === 'default' ? 'default' : 'custom'
  const rawJobs = kind === 'default' ? CRAFTING_JOBS : Array.isArray(input.jobs) ? input.jobs : fallback.jobs
  const jobs = CRAFTING_JOBS.filter(job => rawJobs.includes(job))
  const timestamp = nowIso()
  const legacyPreparation = (input as Partial<EquipmentProfile> & { preparation?: string }).preparation

  const normalizeConsumable = (
    value: ConsumableSelection | null | undefined,
    legacyDefault: ConsumableSelection,
    fallbackValue: ConsumableSelection | null,
  ): ConsumableSelection | null => {
    if (value === null) return null
    if (value && Number.isSafeInteger(value.itemId) && value.itemId > 0) {
      return { itemId: value.itemId, quality: value.quality === 'nq' ? 'nq' : 'hq' }
    }
    if (legacyPreparation === 'unbuffed') return null
    if (legacyPreparation === 'food-and-medicine') return legacyDefault
    return fallbackValue === null ? null : { ...fallbackValue }
  }

  return {
    id: kind === 'default' ? DEFAULT_PROFILE_ID : input.id || newId(),
    kind,
    name: kind === 'default' ? '' : typeof input.name === 'string' ? input.name.slice(0, 60) : fallback.name,
    jobs: jobs.length > 0 ? [...jobs] : [fallback.jobs[0] ?? 'carpenter'],
    level: clampInteger(input.level, limits.level.min, limits.level.max, fallback.level),
    craftsmanship: clampInteger(input.craftsmanship, limits.craftsmanship.min, limits.craftsmanship.max, fallback.craftsmanship),
    control: clampInteger(input.control, limits.control.min, limits.control.max, fallback.control),
    maxCp: clampInteger(input.maxCp, limits.maxCp.min, limits.maxCp.max, fallback.maxCp),
    food: normalizeConsumable(input.food, { itemId: 44_091, quality: 'hq' }, fallback.food),
    medicine: normalizeConsumable(input.medicine, { itemId: 44_169, quality: 'hq' }, fallback.medicine),
    relicToolGoodBonus: input.relicToolGoodBonus === undefined ? fallback.relicToolGoodBonus : input.relicToolGoodBonus === true,
    specialist: input.specialist === undefined ? fallback.specialist : input.specialist === true,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : timestamp,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : timestamp,
  }
}

function readProfiles(): EquipmentProfile[] {
  const fallback = createDefaultProfile()
  if (typeof window === 'undefined') return [fallback]

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return [fallback]
    const normalized = parsed
      .filter((profile): profile is Partial<EquipmentProfile> => !!profile && typeof profile === 'object')
      .map(profile => {
        const isLegacyDefault = profile.id === DEFAULT_PROFILE_ID
          && profile.level === 100
          && profile.craftsmanship === 5_408
          && profile.control === 5_237
          && profile.maxCp === 749
          && profile.food?.itemId === 46_253
          && profile.food.quality === 'hq'
          && profile.medicine?.itemId === 44_169
          && profile.medicine.quality === 'hq'
        return normalizeEquipmentProfile(isLegacyDefault ? {
          ...profile,
          control: 5_140,
          maxCp: 630,
          food: { itemId: 44_091, quality: 'hq' },
        } : profile, fallback)
      })
    const custom = normalized.filter(profile => profile.kind === 'custom')
    const storedDefault = normalized.find(profile => profile.kind === 'default')
    return [storedDefault ?? fallback, ...custom]
  } catch {
    return [fallback]
  }
}

const profiles = ref<EquipmentProfile[]>(readProfiles())

if (typeof window !== 'undefined') {
  watch(profiles, value => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }, { deep: true })
}

export function isDefaultEquipmentProfile(profile: EquipmentProfile) {
  return profile.id === DEFAULT_PROFILE_ID
}

export function calculateEquipmentStatsAfterConsumables(
  profile: Pick<EquipmentProfile, 'craftsmanship' | 'control' | 'maxCp' | 'food' | 'medicine'>,
  catalog: {
    food: readonly DeepReadonly<CraftingConsumable>[]
    medicine: readonly DeepReadonly<CraftingConsumable>[]
  },
) {
  const base = {
    craftsmanship: profile.craftsmanship,
    control: profile.control,
    maxCp: profile.maxCp,
  }
  const result = { ...base }

  for (const [selection, options] of [
    [profile.food, catalog.food],
    [profile.medicine, catalog.medicine],
  ] as const) {
    if (!selection) continue
    const item = options.find(option => option.itemId === selection.itemId)
    if (!item) continue
    for (const bonus of item.bonuses) {
      const value = bonus[selection.quality]
      result[bonus.stat] += Math.min(Math.floor(base[bonus.stat] * value.percent / 100), value.max)
    }
  }

  return result
}

export function useEquipmentProfiles() {
  const orderedProfiles = computed(() => [
    ...profiles.value.filter(isDefaultEquipmentProfile),
    ...profiles.value.filter(profile => !isDefaultEquipmentProfile(profile)),
  ])

  function createProfile() {
    const base = profiles.value.find(isDefaultEquipmentProfile) ?? createDefaultProfile()
    const timestamp = nowIso()
    const profile = normalizeEquipmentProfile({
      ...base,
      id: newId(),
      kind: 'custom',
      name: '',
      jobs: ['carpenter'],
      createdAt: timestamp,
      updatedAt: timestamp,
    }, base)
    profiles.value = [...profiles.value, profile]
    return profile
  }

  function updateProfile(id: string, patch: Partial<EquipmentProfile>) {
    profiles.value = profiles.value.map(profile => {
      if (profile.id !== id) return profile
      return normalizeEquipmentProfile({
        ...profile,
        ...patch,
        id: profile.id,
        kind: profile.kind,
        jobs: isDefaultEquipmentProfile(profile) ? [...CRAFTING_JOBS] : patch.jobs ?? profile.jobs,
        updatedAt: nowIso(),
      }, profile)
    })
  }

  function deleteProfile(id: string) {
    if (id === DEFAULT_PROFILE_ID) return
    profiles.value = profiles.value.filter(profile => profile.id !== id)
  }

  function profilesForJob(job: EquipmentProfileJob) {
    return orderedProfiles.value.filter(profile => profile.jobs.includes(job))
  }

  return { orderedProfiles, createProfile, updateProfile, deleteProfile, profilesForJob }
}
