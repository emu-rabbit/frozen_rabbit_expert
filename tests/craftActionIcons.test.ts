import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ACTION_IDS } from '../packages/domain/src/actions'
import { CRAFT_JOBS, MISSION_DATA_FORMAT, type MissionBundle } from '../apps/web/src/types/missionData'

const missionDataDirectory = resolve('apps/web/public/mission-data')
const manifest = JSON.parse(readFileSync(resolve(missionDataDirectory, 'manifest.json'), 'utf8'))
const bundle = JSON.parse(gunzipSync(readFileSync(
  resolve(missionDataDirectory, manifest.bundle.file),
)).toString('utf8')) as MissionBundle

describe('bundled craft action icons', () => {
  it('covers every supported job and action with an XIVAPI asset URL', () => {
    expect(bundle.formatVersion).toBe(MISSION_DATA_FORMAT)
    const urls = CRAFT_JOBS.flatMap(job => ACTION_IDS.map(action => bundle.actionIcons[job][action]))
    expect(urls).toHaveLength(CRAFT_JOBS.length * ACTION_IDS.length)
    for (const value of urls) {
      const url = new URL(value)
      expect(url.origin).toBe('https://v2.xivapi.com')
      expect(url.pathname).toBe('/api/asset')
      expect(url.searchParams.get('format')).toBe('png')
      expect(url.searchParams.get('path')).toMatch(/^ui\/icon\/\d{6}\/\d{6}_hr1\.tex$/)
    }
  })

  it('uses each profession relation instead of one shared icon set', () => {
    const basicSynthesis = CRAFT_JOBS.map(job => bundle.actionIcons[job].basicSynthesis)
    expect(new Set(basicSynthesis).size).toBe(CRAFT_JOBS.length)
  })
})
