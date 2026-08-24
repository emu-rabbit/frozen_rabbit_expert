import { describe, expect, it } from 'vitest'
import {
  GENERIC_EVALUATION_EQUIPMENT_PROFILES,
  GENERIC_EVALUATION_EQUIPMENT_SOURCE,
  PLAYER_EQUIPMENT_PROFILES,
  type CalculatedLoadoutDerivation,
  type EquipmentPanelComponents,
  type EvaluationEquipmentProfile,
} from '../src'

type CalculatedProfile = EvaluationEquipmentProfile & {
  derivation: Readonly<CalculatedLoadoutDerivation>
}

const LEGACY_IDS = [
  'player-unbuffed-cosmic-tool-v1',
  'player-food-medicine-cosmic-tool-v1',
  'player-food-medicine-specialist-cosmic-tool-v1',
] as const

function isCalculated(profile: EvaluationEquipmentProfile): profile is CalculatedProfile {
  return profile.derivation.kind === 'calculated-loadout'
}

function add(
  target: EquipmentPanelComponents,
  contribution: Readonly<EquipmentPanelComponents>,
): void {
  target.craftsmanship += contribution.craftsmanship
  target.control += contribution.control
  target.maxCp += contribution.maxCp
}

function unconsumedPanel(derivation: Readonly<CalculatedLoadoutDerivation>): EquipmentPanelComponents {
  const panel = { ...derivation.basePanel }
  for (const item of derivation.items) {
    add(panel, item.panelContribution)
    for (const materia of item.materia) {
      panel[materia.stat] += materia.appliedValue
    }
  }
  add(panel, derivation.specialistSoulBonus)
  return panel
}

function recomputePanel(derivation: Readonly<CalculatedLoadoutDerivation>): EquipmentPanelComponents {
  const panel = unconsumedPanel(derivation)
  const preConsumablePanel = { ...panel }
  for (const consumable of derivation.consumables) {
    for (const effect of consumable.effects) {
      panel[effect.stat] += Math.min(
        Math.floor(preConsumablePanel[effect.stat] * effect.percent / 100),
        effect.cap,
      )
    }
  }
  return panel
}

function byId(id: string): CalculatedProfile {
  const profile = GENERIC_EVALUATION_EQUIPMENT_PROFILES.find((candidate) => candidate.id === id)
  expect(profile).toBeDefined()
  expect(profile?.derivation.kind).toBe('calculated-loadout')
  return profile as CalculatedProfile
}

describe('generic crafter evaluation equipment registry', () => {
  it('preserves exactly the three historical player profile IDs and empirical boundary', () => {
    expect(PLAYER_EQUIPMENT_PROFILES).toHaveLength(3)
    expect(PLAYER_EQUIPMENT_PROFILES.map(({ id }) => id)).toEqual(LEGACY_IDS)

    for (const profile of PLAYER_EQUIPMENT_PROFILES) {
      expect(profile.label).toContain('720＋690')
      expect(profile.label).toContain('Teamcraft 建議滿禁斷')
      expect(profile.label).toContain('宇宙工具')
      expect(profile.notes).toContain('empirical 最終面板')
      expect(profile.notes).toContain('未保存逐件 item／meld')
      expect(profile.derivation).toMatchObject({
        kind: 'observed-final-panel',
        evidenceKind: 'empirical',
        itemByItemLoadoutKnown: false,
        panelAlreadyIncludesPreparation: true,
      })
    }
  })

  it('orders the old three followed by seven calculated profiles without changing identity', () => {
    expect(GENERIC_EVALUATION_EQUIPMENT_PROFILES).toHaveLength(10)
    expect(new Set(GENERIC_EVALUATION_EQUIPMENT_PROFILES.map(({ id }) => id)).size).toBe(10)

    for (const [index, legacy] of PLAYER_EQUIPMENT_PROFILES.entries()) {
      expect(GENERIC_EVALUATION_EQUIPMENT_PROFILES[index]).toBe(legacy)
    }

    const calculatedProfiles = GENERIC_EVALUATION_EQUIPMENT_PROFILES.filter(isCalculated)
    expect(calculatedProfiles).toHaveLength(7)
    expect(GENERIC_EVALUATION_EQUIPMENT_PROFILES.every(({ crafter }) => (
      crafter.cosmicToolGoodBonus
    ))).toBe(true)
    for (const profile of calculatedProfiles) {
      expect(profile.derivation.panelAlreadyIncludesPreparation).toBe(true)
      expect(profile.crafter.cosmicToolGoodBonus).toBe(true)
      expect(profile.label).toMatch(/Cosmic|Stellar/u)
      expect(profile.notes).toContain('宇宙工具')
      expect(profile.specialistConsumableCost).toBe(
        profile.crafter.specialist ? 'delineation-if-specialist-actions-used' : 'none',
      )
    }
    expect(calculatedProfiles.filter(({ crafter }) => crafter.specialist)).toHaveLength(1)
    expect(calculatedProfiles.filter(({ crafter }) => !crafter.specialist)).toHaveLength(6)
  })

  it('pins the exact calculated profile order and final panels', () => {
    expect(GENERIC_EVALUATION_EQUIPMENT_PROFILES.filter(isCalculated).map((profile) => ({
      id: profile.id,
      craftsmanship: profile.crafter.craftsmanship,
      control: profile.crafter.control,
      maxCp: profile.crafter.maxCp,
      specialist: profile.crafter.specialist,
    }))).toEqual([
      { id: 'generic-mixed-i720-i690-hq-unmelded-v1', craftsmanship: 5078, control: 4485, maxCp: 542, specialist: false },
      { id: 'generic-mixed-i720-i690-hq-unmelded-buffed-v1', craftsmanship: 5078, control: 4600, maxCp: 669, specialist: false },
      { id: 'generic-i750-hq-unmelded-v1', craftsmanship: 5404, control: 4808, maxCp: 558, specialist: false },
      { id: 'generic-i750-hq-unmelded-buffed-v1', craftsmanship: 5404, control: 4923, maxCp: 685, specialist: false },
      { id: 'generic-i750-hq-five-meld-template-v1', craftsmanship: 5811, control: 5385, maxCp: 649, specialist: false },
      { id: 'generic-i750-hq-five-meld-template-buffed-v1', craftsmanship: 5811, control: 5500, maxCp: 776, specialist: false },
      { id: 'generic-i750-hq-five-meld-template-buffed-specialist-v1', craftsmanship: 5831, control: 5520, maxCp: 791, specialist: true },
    ])
  })

  it('recomputes every calculated final panel from its preserved components', () => {
    const calculatedProfiles = GENERIC_EVALUATION_EQUIPMENT_PROFILES.filter(isCalculated)
    for (const profile of calculatedProfiles) {
      expect(profile.derivation.items).toHaveLength(12)
      expect(new Set(profile.derivation.items.map(({ slot }) => slot)).size).toBe(12)
      expect(recomputePanel(profile.derivation)).toEqual({
        craftsmanship: profile.crafter.craftsmanship,
        control: profile.crafter.control,
        maxCp: profile.crafter.maxCp,
      })
    }
  })

  it('pins the mixed boundary probe to six i720 and six i690 items with one fixed relic', () => {
    const profile = byId('generic-mixed-i720-i690-hq-unmelded-v1')
    const itemLevels = Object.groupBy(profile.derivation.items, ({ itemLevel }) => itemLevel)

    expect(itemLevels[720]).toHaveLength(6)
    expect(itemLevels[690]).toHaveLength(6)
    expect(profile.derivation.items.filter(({ quality }) => quality === 'hq')).toHaveLength(11)
    expect(profile.derivation.items.filter(({ quality }) => quality === 'fixed-relic')).toHaveLength(1)
    expect(recomputePanel(profile.derivation)).toEqual({
      craftsmanship: 5078,
      control: 4485,
      maxCp: 542,
    })
  })

  it('uses the real fixed Cosmic and Stellar relic main hands without materia', () => {
    const expectedMainHands = [
      {
        id: 'generic-mixed-i720-i690-hq-unmelded-v1',
        itemId: 45679,
        itemName: 'Cosmic Saw',
        itemLevel: 720,
        panelContribution: { craftsmanship: 1624, control: 842, maxCp: 8 },
        equivalentDoHItemIds: [45679, 45680, 45681, 45682, 45683, 45684, 45685, 45686],
      },
      {
        id: 'generic-i750-hq-unmelded-v1',
        itemId: 49053,
        itemName: 'Stellar Saw',
        itemLevel: 750,
        panelContribution: { craftsmanship: 1720, control: 891, maxCp: 8 },
        equivalentDoHItemIds: [49053, 49054, 49055, 49056, 49057, 49058, 49059, 49060],
      },
    ] as const

    for (const expected of expectedMainHands) {
      const mainHand = byId(expected.id).derivation.items.find(({ slot }) => slot === 'main-hand')
      expect(mainHand).toMatchObject({
        itemId: expected.itemId,
        itemName: expected.itemName,
        itemLevel: expected.itemLevel,
        quality: 'fixed-relic',
        panelContribution: expected.panelContribution,
        materia: [],
        equivalentDoHItemIds: expected.equivalentDoHItemIds,
        descriptionEffect: {
          kind: 'good-condition-quality-multiplier',
          multiplier: 1.75,
          evidence: 'in-game-item-description-and-domain-golden-mechanics',
        },
      })
      expect(mainHand?.equivalentDoHItemIds).toHaveLength(8)
      expect(mainHand?.equivalentDoHItemIds?.[0]).toBe(mainHand?.itemId)
    }
  })

  it('distinguishes zero-materia loadouts from the explicit five-meld-per-slot template', () => {
    const calculatedProfiles = GENERIC_EVALUATION_EQUIPMENT_PROFILES.filter(isCalculated)
    const unmelded = calculatedProfiles.filter(({ derivation }) => (
      derivation.materiaTemplate.kind === 'none'
    ))
    const fiveMeld = calculatedProfiles.filter(({ derivation }) => (
      derivation.materiaTemplate.kind === 'explicit-five-meld-reference-template'
    ))

    expect(unmelded).toHaveLength(4)
    expect(fiveMeld).toHaveLength(3)
    expect(unmelded.every(({ derivation }) => (
      derivation.items.every(({ materia }) => materia.length === 0)
    ))).toBe(true)
    expect(fiveMeld.every(({ derivation }) => {
      const mainHand = derivation.items.find(({ slot }) => slot === 'main-hand')
      const meldableItems = derivation.items.filter(({ slot }) => slot !== 'main-hand')
      return mainHand?.materia.length === 0
        && meldableItems.length === 11
        && meldableItems.every(({ materia }) => materia.length === 5)
        && derivation.materiaTemplate.kind === 'explicit-five-meld-reference-template'
        && derivation.materiaTemplate.meldsPerMeldableSlot === 5
        && derivation.materiaTemplate.fixedRelicMelds === 0
    })).toBe(true)
    expect(fiveMeld.every(({ notes }) => notes.includes('不是官方 BiS'))).toBe(true)

    const melded = byId('generic-i750-hq-five-meld-template-v1')
    const appliedMateria = melded.derivation.items
      .flatMap(({ materia }) => materia)
      .reduce<EquipmentPanelComponents>((total, materia) => {
        total[materia.stat] += materia.appliedValue
        return total
      }, { craftsmanship: 0, control: 0, maxCp: 0 })
    const clippedCp = melded.derivation.items
      .flatMap(({ materia }) => materia)
      .filter(({ stat, nominalValue, appliedValue }) => (
        stat === 'maxCp' && appliedValue < nominalValue
      ))

    expect(appliedMateria).toEqual({ craftsmanship: 407, control: 577, maxCp: 91 })
    expect(clippedCp).toHaveLength(3)
    expect(clippedCp.every(({ nominalValue, appliedValue }) => (
      nominalValue === 8 && appliedValue === 7
    ))).toBe(true)
  })

  it('derives all buffed profiles from the pinned HQ consumables at their caps', () => {
    const buffed = GENERIC_EVALUATION_EQUIPMENT_PROFILES
      .filter(isCalculated)
      .filter(({ derivation }) => derivation.consumables.length > 0)

    expect(buffed).toHaveLength(4)
    for (const profile of buffed) {
      const preConsumable = unconsumedPanel(profile.derivation)
      const consumables = profile.derivation.consumables
      expect(consumables.map(({ itemId, itemFoodRowId }) => ({ itemId, itemFoodRowId }))).toEqual([
        { itemId: 46253, itemFoodRowId: 694 },
        { itemId: 44169, itemFoodRowId: 651 },
      ])
      for (const effect of consumables.flatMap(({ effects }) => effects)) {
        expect(Math.floor(preConsumable[effect.stat] * effect.percent / 100))
          .toBeGreaterThanOrEqual(effect.cap)
      }
      expect(recomputePanel(profile.derivation)).toEqual({
        craftsmanship: profile.crafter.craftsmanship,
        control: profile.crafter.control,
        maxCp: profile.crafter.maxCp,
      })
    }
  })

  it('adds the specialist soul exactly once to the buffed Stellar reference profile', () => {
    const specialist = byId('generic-i750-hq-five-meld-template-buffed-specialist-v1')

    expect(specialist.preparation).toBe('food-medicine-and-specialist')
    expect(specialist.specialistConsumableCost).toBe('delineation-if-specialist-actions-used')
    expect(specialist.crafter).toEqual({
      level: 100,
      craftsmanship: 5831,
      control: 5520,
      maxCp: 791,
      cosmicToolGoodBonus: true,
      specialist: true,
    })
    expect(specialist.derivation.specialistSoulBonus).toEqual({
      craftsmanship: 20,
      control: 20,
      maxCp: 15,
    })
    expect(recomputePanel(specialist.derivation)).toEqual({
      craftsmanship: 5831,
      control: 5520,
      maxCp: 791,
    })
  })

  it('pins the official introduction link and game-data revisions used by each calculation', () => {
    expect(GENERIC_EVALUATION_EQUIPMENT_SOURCE).toEqual({
      snapshotPatch: '7.55h2',
      verifiedAt: '2026-08-24',
      xivapiVersion: '284bb7f44b9c0976',
      xivapiSchema: 'exdschema@2:rev:83e965d091116f895d5b17573cc5d12909a5f407',
      xivapiUrl: 'https://v2.xivapi.com',
      ffxivDataminingRevision: '64ff8a5d2903b429cb9d95066547ce57fc53bfc8',
      ffxivDataminingCommitUrl: 'https://github.com/xivapi/ffxiv-datamining/commit/64ff8a5d2903b429cb9d95066547ce57fc53bfc8',
    })
    for (const profile of GENERIC_EVALUATION_EQUIPMENT_PROFILES.filter(isCalculated)) {
      expect(profile.derivation.source).toBe(GENERIC_EVALUATION_EQUIPMENT_SOURCE)
    }

    expect(byId('generic-mixed-i720-i690-hq-unmelded-v1').derivation.availability).toEqual({
      kind: 'combined-equipment-available-by-snapshot',
      itemLevels: [690, 720],
      availableBySnapshotPatch: '7.55h2',
      componentIntroductions: [{
        component: 'Cosmic Saw',
        patch: '7.21',
        officialPatchNotesUrl: 'https://na.finalfantasyxiv.com/lodestone/topics/detail/5078f41351ca968c3b37382ec8eaa2249ccfd9fc/',
      }],
    })
    expect(byId('generic-i750-hq-unmelded-v1').derivation.availability).toEqual({
      kind: 'combined-equipment-available-by-snapshot',
      itemLevels: [750],
      availableBySnapshotPatch: '7.55h2',
      componentIntroductions: [{
        component: 'Gold Thumb / Crested crafting gear',
        patch: '7.3',
        officialPatchNotesUrl: 'https://na.finalfantasyxiv.com/lodestone/topics/detail/c04405c6cbe8519a0b6c8aa5e4d88a5d447419c9',
      }, {
        component: 'Stellar Saw',
        patch: '7.31',
        officialPatchNotesUrl: 'https://na.finalfantasyxiv.com/lodestone/topics/detail/c04270777c63cabaa29d718eed4be4c1fca86c27?pubDate=20250902',
      }],
    })
  })
})
