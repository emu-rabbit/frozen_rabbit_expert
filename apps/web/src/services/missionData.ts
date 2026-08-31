import { readonly, ref, shallowRef } from 'vue'
import { ACTION_IDS } from '@frozen-rabbit-expert/domain'
import { clearMissionDataCache, readMissionDataCache, saveMissionDataCache } from './missionDataCache'
import {
  MISSION_DATA_FORMAT,
  CRAFT_JOBS,
  type CachedMissionData,
  type CraftJob,
  type MissionBundle,
  type MissionDataManifest,
} from '@/types/missionData'

const BASE = `${import.meta.env.BASE_URL}mission-data/`
const HASH = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const missions = shallowRef<MissionBundle['missions']>([])
const consumables = shallowRef<MissionBundle['consumables']>({ food: [], medicine: [] })
const actionIcons = shallowRef<MissionBundle['actionIcons'] | null>(null)
const loading = ref(false)
const error = ref(false)
const cacheAvailable = ref(true)
let initialized: Promise<void> | undefined

async function hash(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('')
}

async function validateManifest(value: MissionDataManifest): Promise<MissionDataManifest> {
  if (!value || value.generator !== 'frozen-rabbit-expert-mission-data'
    || value.formatVersion !== MISSION_DATA_FORMAT || !HASH.test(value.version)
    || value.sources?.teamcraft?.repository !== 'ffxiv-teamcraft/ffxiv-teamcraft'
    || !COMMIT.test(value.sources.teamcraft.commit)
    || value.sources?.missions?.repository !== 'xivapi/ffxiv-datamining'
    || !COMMIT.test(value.sources.missions.commit)
    || value.sources?.missionLocales?.ja?.repository !== 'xivapi/ffxiv-datamining'
    || value.sources.missionLocales.ja.commit !== value.sources.missions.commit
    || value.sources?.missionLocales?.tw?.repository !== 'thewakingsands/ffxiv-datamining-tc'
    || !COMMIT.test(value.sources.missionLocales.tw.commit)
    || value.sources?.missionLocales?.cn?.repository !== 'thewakingsands/ffxiv-datamining-cn'
    || !COMMIT.test(value.sources.missionLocales.cn.commit)
    || value.sources?.jobIcons?.provider !== 'xivapi'
    || value.sources.jobIcons.baseUrl !== 'https://xivapi.com/cj/1/'
    || value.sources?.actionIcons?.provider !== 'xivapi'
    || value.sources.actionIcons.repository !== 'xivapi/ffxiv-datamining'
    || value.sources.actionIcons.commit !== value.sources.missions.commit
    || value.sources.actionIcons.assetBaseUrl !== 'https://v2.xivapi.com/api/asset') {
    throw new Error('invalid mission-data manifest')
  }
  const descriptor = value.bundle
  if (!descriptor || !HASH.test(descriptor.sha256)
    || descriptor.file !== `missions.${descriptor.sha256}.bin`
    || descriptor.encoding !== 'gzip' || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes <= 0
    || !Number.isSafeInteger(descriptor.jsonBytes) || descriptor.jsonBytes <= 0 || descriptor.jsonBytes > 4 * 1024 * 1024
    || !Number.isSafeInteger(descriptor.records) || descriptor.records <= 0) throw new Error('invalid mission bundle descriptor')
  const identity = { formatVersion: value.formatVersion, sources: value.sources, bundle: value.bundle, notice: value.notice }
  if (await hash(new TextEncoder().encode(JSON.stringify(identity)).buffer) !== value.version) throw new Error('mission manifest checksum mismatch')
  return value
}

async function fetchManifest(): Promise<MissionDataManifest> {
  const response = await fetch(`${BASE}manifest.json`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`mission manifest HTTP ${response.status}`)
  return validateManifest(await response.json())
}

async function download(manifest: MissionDataManifest): Promise<ArrayBuffer> {
  const response = await fetch(`${BASE}${manifest.bundle.file}`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`mission bundle HTTP ${response.status}`)
  return response.arrayBuffer()
}

async function decode(manifest: MissionDataManifest, bytes: ArrayBuffer): Promise<MissionBundle> {
  if (bytes.byteLength !== manifest.bundle.bytes || await hash(bytes) !== manifest.bundle.sha256) throw new Error('mission bundle checksum mismatch')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const json = await new Response(stream).arrayBuffer()
  if (json.byteLength !== manifest.bundle.jsonBytes) throw new Error('mission bundle size mismatch')
  const value = JSON.parse(new TextDecoder().decode(json)) as MissionBundle
  if (value.formatVersion !== MISSION_DATA_FORMAT || !Array.isArray(value.missions)
    || value.missions.length !== manifest.bundle.records) throw new Error('invalid mission bundle')
  const consumables = value.consumables
  if (!consumables || !Array.isArray(consumables.food) || !Array.isArray(consumables.medicine)
    || [...consumables.food, ...consumables.medicine].some(item => !Number.isSafeInteger(item.itemId)
      || item.itemId <= 0 || !Number.isSafeInteger(item.itemLevel) || item.itemLevel < 0
      || typeof item.icon !== 'string' || !item.icon.startsWith('https://v2.xivapi.com/')
      || !Array.isArray(item.bonuses) || item.bonuses.length === 0
      || item.bonuses.some(bonus => !['craftsmanship', 'control', 'maxCp'].includes(bonus.stat)
        || bonus.relative !== true || !Number.isFinite(bonus.nq?.percent) || !Number.isFinite(bonus.nq?.max)
        || !Number.isFinite(bonus.hq?.percent) || !Number.isFinite(bonus.hq?.max)))) {
    throw new Error('invalid crafting consumables')
  }
  if (!CRAFT_JOBS.every(job => ACTION_IDS.every((action) => {
    const icon = value.actionIcons?.[job]?.[action]
    if (typeof icon !== 'string') return false
    try {
      const url = new URL(icon)
      return url.origin === 'https://v2.xivapi.com'
        && url.pathname === '/api/asset'
        && url.searchParams.get('format') === 'png'
        && /^ui\/icon\/\d{6}\/\d{6}_hr1\.tex$/.test(url.searchParams.get('path') ?? '')
    } catch { return false }
  }))) throw new Error('invalid crafting action icons')
  return value
}

async function usable(candidate?: CachedMissionData): Promise<{ data: CachedMissionData; bundle: MissionBundle } | null> {
  if (!candidate || !(candidate.bytes instanceof ArrayBuffer)) return null
  try {
    await validateManifest(candidate.manifest)
    return { data: candidate, bundle: await decode(candidate.manifest, candidate.bytes) }
  } catch { return null }
}

async function initialize(): Promise<void> {
  loading.value = true
  error.value = false
  try {
    const stored = await readMissionDataCache()
    const pending = await usable(stored?.pending)
    const active = pending ?? await usable(stored?.active)
    const latestPromise = fetchManifest().catch(() => null)
    if (active) {
      missions.value = active.bundle.missions
      consumables.value = active.bundle.consumables
      actionIcons.value = active.bundle.actionIcons
      cacheAvailable.value = await saveMissionDataCache('active', active.data, stored?.active?.manifest.version)
      void latestPromise.then(async (manifest) => {
        if (!manifest || manifest.version === active.data.manifest.version) return
        try {
          const bytes = await download(manifest)
          await decode(manifest, bytes)
          cacheAvailable.value = await saveMissionDataCache('pending', { manifest, bytes }, active.data.manifest.version)
        } catch (cause) { console.warn('[MissionData] Background update failed', cause) }
      })
      return
    }
    const manifest = await latestPromise
    if (!manifest) throw new Error('no usable mission data')
    const bytes = await download(manifest)
    const bundle = await decode(manifest, bytes)
    missions.value = bundle.missions
    consumables.value = bundle.consumables
    actionIcons.value = bundle.actionIcons
    cacheAvailable.value = await saveMissionDataCache('active', { manifest, bytes })
  } catch (cause) {
    error.value = true
    console.warn('[MissionData] Load failed', cause)
    throw cause
  } finally { loading.value = false }
}

export function useMissionData() {
  const load = async () => {
    if (!initialized) initialized = initialize().catch((cause) => { initialized = undefined; throw cause })
    return initialized
  }
  const retry = async () => { await clearMissionDataCache(); initialized = undefined; await load() }
  return {
    missions: readonly(missions),
    consumables: readonly(consumables),
    actionIcons: readonly(actionIcons),
    loading: readonly(loading),
    error: readonly(error),
    cacheAvailable: readonly(cacheAvailable),
    load,
    retry,
  }
}
