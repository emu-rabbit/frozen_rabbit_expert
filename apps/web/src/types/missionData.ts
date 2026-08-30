export type DataLocale = 'tw' | 'cn' | 'en' | 'ja'
export type LocalizedNames = Partial<Record<DataLocale, string>>
export type CraftJob = 'carpenter' | 'blacksmith' | 'armorer' | 'goldsmith' | 'leatherworker' | 'weaver' | 'alchemist' | 'culinarian'
export type MissionRank = 'a' | 'ex' | 'ex-plus' | 'master'
export type MissionPlanet = 'sinus-ardorum' | 'phaenna' | 'oizys' | 'auxesia'
export type MissionType = 'timed' | 'weather'

export const MISSION_DATA_FORMAT = 1
export const CRAFT_JOBS: CraftJob[] = [
  'carpenter', 'blacksmith', 'armorer', 'goldsmith',
  'leatherworker', 'weaver', 'alchemist', 'culinarian',
]
export const MISSION_RANKS: MissionRank[] = ['a', 'ex', 'ex-plus', 'master']
export const MISSION_PLANETS: MissionPlanet[] = ['sinus-ardorum', 'phaenna', 'oizys', 'auxesia']
export const MISSION_TYPES: MissionType[] = ['timed', 'weather']

export interface AssetDescriptor {
  file: string
  sha256: string
  bytes: number
}

export interface BundleDescriptor extends AssetDescriptor {
  jsonBytes: number
  encoding: 'gzip'
  records: number
}

export interface MissionDataManifest {
  generator: string
  formatVersion: number
  version: string
  sources: {
    teamcraft: { repository: string; commit: string }
    missions: { repository: string; commit: string }
    missionLocales: Record<Exclude<DataLocale, 'en'>, { repository: string; commit: string }>
    jobIcons: { provider: 'xivapi'; baseUrl: string }
    catalog: { identity: string; xivapiVersion: string }
  }
  bundle: BundleDescriptor
  notice: AssetDescriptor
}

export interface MissionItem {
  recipeId: number
  itemId: number
  names: LocalizedNames
  icon: string
}

export interface CosmicMission {
  id: number
  names: LocalizedNames
  job: CraftJob
  jobId: number
  jobIcon: string
  rank: MissionRank
  planet: MissionPlanet
  types: MissionType[]
  items: MissionItem[]
}

export interface MissionBundle {
  formatVersion: number
  catalogIdentity: string
  missions: CosmicMission[]
  consumables: {
    food: CraftingConsumable[]
    medicine: CraftingConsumable[]
  }
}

export interface CraftingConsumableBonus {
  stat: 'craftsmanship' | 'control' | 'maxCp'
  relative: true
  nq: { percent: number; max: number }
  hq: { percent: number; max: number }
}

export interface CraftingConsumable {
  itemId: number
  itemLevel: number
  names: LocalizedNames
  icon: string
  bonuses: CraftingConsumableBonus[]
}

export interface CachedMissionData {
  manifest: MissionDataManifest
  bytes: ArrayBuffer
}
