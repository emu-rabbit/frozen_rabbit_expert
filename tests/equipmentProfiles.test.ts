import { describe, expect, it } from 'vitest'
import {
  CRAFTING_JOBS,
  calculateEquipmentStatsAfterConsumables,
  isDefaultEquipmentProfile,
  normalizeEquipmentProfile,
  useEquipmentProfiles,
} from '../apps/web/src/composables/useEquipmentProfiles'

describe('equipment profiles', () => {
  it('keeps the default profile locked to every crafting job', () => {
    const profile = normalizeEquipmentProfile({
      id: 'default-crafter',
      kind: 'default',
      name: '不應寫入的名稱',
      jobs: ['weaver'],
    })

    expect(isDefaultEquipmentProfile(profile)).toBe(true)
    expect(profile.name).toBe('')
    expect(profile.jobs).toEqual(CRAFTING_JOBS)
    expect(profile).toMatchObject({
      level: 100,
      craftsmanship: 5_408,
      control: 5_140,
      maxCp: 630,
      food: { itemId: 44_091, quality: 'hq' },
      medicine: { itemId: 44_169, quality: 'hq' },
      relicToolGoodBonus: true,
      specialist: false,
    })
  })

  it('calculates the displayed stats after HQ food and medicine', () => {
    const profile = normalizeEquipmentProfile({
      id: 'custom-buffed',
      kind: 'custom',
      craftsmanship: 5_408,
      control: 5_140,
      maxCp: 630,
      food: { itemId: 44_091, quality: 'hq' },
      medicine: { itemId: 44_169, quality: 'hq' },
    })

    expect(calculateEquipmentStatsAfterConsumables(profile, {
      food: [{
        itemId: 44_091, itemLevel: 684, names: { tw: '犎牛牛排' }, icon: 'test',
        bonuses: [
          { stat: 'control', relative: true, nq: { percent: 4, max: 77 }, hq: { percent: 5, max: 97 } },
          { stat: 'maxCp', relative: true, nq: { percent: 21, max: 73 }, hq: { percent: 26, max: 92 } },
        ],
      }],
      medicine: [{
        itemId: 44_169, itemLevel: 675, names: { tw: '魔匠藥液' }, icon: 'test',
        bonuses: [
          { stat: 'maxCp', relative: true, nq: { percent: 5, max: 21 }, hq: { percent: 6, max: 27 } },
        ],
      }],
    })).toEqual({ craftsmanship: 5_408, control: 5_237, maxCp: 749 })
  })

  it('normalizes player-entered panel values and keeps at least one job', () => {
    const profile = normalizeEquipmentProfile({
      id: 'custom-test',
      kind: 'custom',
      jobs: [],
      level: 120,
      craftsmanship: -1,
      control: 10_500,
      maxCp: 1_500,
      food: { itemId: 46_253, quality: 'hq' },
      medicine: { itemId: 44_169, quality: 'nq' },
      relicToolGoodBonus: true,
      specialist: true,
    })

    expect(profile).toMatchObject({
      id: 'custom-test',
      kind: 'custom',
      jobs: ['carpenter'],
      level: 100,
      craftsmanship: 0,
      control: 9_999,
      maxCp: 999,
      food: { itemId: 46_253, quality: 'hq' },
      medicine: { itemId: 44_169, quality: 'nq' },
      relicToolGoodBonus: true,
      specialist: true,
    })
  })

  it('does not delete the default profile but deletes a custom profile', () => {
    const { orderedProfiles, createProfile, deleteProfile } = useEquipmentProfiles()
    const defaultProfile = orderedProfiles.value.find(isDefaultEquipmentProfile)
    expect(defaultProfile).toBeDefined()

    deleteProfile(defaultProfile!.id)
    expect(orderedProfiles.value.some(isDefaultEquipmentProfile)).toBe(true)

    const custom = createProfile()
    expect(orderedProfiles.value.some(profile => profile.id === custom.id)).toBe(true)
    deleteProfile(custom.id)
    expect(orderedProfiles.value.some(profile => profile.id === custom.id)).toBe(false)
  })
})
