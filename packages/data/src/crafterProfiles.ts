import type { CrafterProfile } from '@frozen-rabbit-expert/domain'

export type PlayerEquipmentProfileId =
  | 'player-unbuffed-cosmic-tool-v1'
  | 'player-food-medicine-cosmic-tool-v1'
  | 'player-food-medicine-specialist-cosmic-tool-v1'

export type GenericEvaluationEquipmentProfileId =
  | PlayerEquipmentProfileId
  | 'generic-mixed-i720-i690-hq-unmelded-v1'
  | 'generic-mixed-i720-i690-hq-unmelded-buffed-v1'
  | 'generic-i750-hq-unmelded-v1'
  | 'generic-i750-hq-unmelded-buffed-v1'
  | 'generic-i750-hq-five-meld-template-v1'
  | 'generic-i750-hq-five-meld-template-buffed-v1'
  | 'generic-i750-hq-five-meld-template-buffed-specialist-v1'

export type EquipmentPreparation =
  | 'unbuffed'
  | 'food-and-medicine'
  | 'food-medicine-and-specialist'

export type EquipmentPanelStat = 'craftsmanship' | 'control' | 'maxCp'

export interface EquipmentPanelComponents {
  craftsmanship: number
  control: number
  maxCp: number
}

export type CrafterEquipmentSlot =
  | 'main-hand'
  | 'off-hand'
  | 'head'
  | 'body'
  | 'hands'
  | 'legs'
  | 'feet'
  | 'ears'
  | 'neck'
  | 'wrists'
  | 'left-ring'
  | 'right-ring'

export interface MateriaMeldComponent {
  itemId: number
  itemName: string
  stat: EquipmentPanelStat
  nominalValue: number
  appliedValue: number
}

export interface EquipmentItemComponent {
  slot: CrafterEquipmentSlot
  itemId: number
  itemName: string
  itemLevel: 690 | 720 | 750
  quality: 'hq' | 'fixed-relic'
  panelContribution: Readonly<EquipmentPanelComponents>
  materia: readonly MateriaMeldComponent[]
  equivalentDoHItemIds?: readonly number[]
  /** Description-derived effect; this is not an ItemSpecialBonus sheet ID. */
  descriptionEffect?: Readonly<{
    kind: 'good-condition-quality-multiplier'
    multiplier: 1.75
    evidence: 'in-game-item-description-and-domain-golden-mechanics'
  }>
}

export interface ConsumableEffectComponent {
  stat: 'control' | 'maxCp'
  percent: number
  cap: number
}

export interface ConsumableComponent {
  itemId: number
  itemName: string
  itemFoodRowId: number
  quality: 'hq'
  effects: readonly ConsumableEffectComponent[]
}

export interface EquipmentDataSnapshot {
  snapshotPatch: '7.55h2'
  verifiedAt: '2026-08-24'
  xivapiVersion: string
  xivapiSchema: string
  xivapiUrl: string
  ffxivDataminingRevision: string
  ffxivDataminingCommitUrl: string
}

export interface EquipmentAvailability {
  kind: 'combined-equipment-available-by-snapshot'
  itemLevels: readonly (690 | 720 | 750)[]
  availableBySnapshotPatch: '7.55h2'
  componentIntroductions: readonly Readonly<{
    component: string
    patch: '7.21' | '7.3' | '7.31'
    officialPatchNotesUrl: string
  }>[]
}

export interface ObservedFinalPanelDerivation {
  kind: 'observed-final-panel'
  evidenceKind: 'empirical'
  describedLoadout: string
  itemByItemLoadoutKnown: false
  panelAlreadyIncludesPreparation: true
}

export type MateriaTemplateProvenance =
  | {
      kind: 'none'
      meldsPerSlot: 0
    }
  | {
      kind: 'explicit-five-meld-reference-template'
      meldsPerMeldableSlot: 5
      fixedRelicMelds: 0
      sourceUrl: string
      interpretation: 'reference-template-not-official-bis'
    }

export interface CalculatedLoadoutDerivation {
  kind: 'calculated-loadout'
  panelAlreadyIncludesPreparation: true
  source: Readonly<EquipmentDataSnapshot>
  availability: Readonly<EquipmentAvailability>
  basePanel: Readonly<EquipmentPanelComponents>
  items: readonly EquipmentItemComponent[]
  materiaTemplate: Readonly<MateriaTemplateProvenance>
  consumables: readonly ConsumableComponent[]
  specialistSoulBonus: Readonly<EquipmentPanelComponents>
}

export interface EvaluationEquipmentProfile {
  id: GenericEvaluationEquipmentProfileId
  label: string
  notes: string
  preparation: EquipmentPreparation
  specialistConsumableCost: 'none' | 'delineation-if-specialist-actions-used'
  crafter: Readonly<CrafterProfile>
  derivation: Readonly<ObservedFinalPanelDerivation | CalculatedLoadoutDerivation>
}

export interface PlayerEquipmentProfile extends EvaluationEquipmentProfile {
  id: PlayerEquipmentProfileId
  derivation: Readonly<ObservedFinalPanelDerivation>
}

/**
 * Player-observed final panel values for a player-described i720 + i690
 * Teamcraft-recommended pentameld setup using a cosmic tool. Food, medicine,
 * specialist soul, and cosmic-tool effects are already reflected where
 * applicable; consumers must not add those bonuses a second time. The
 * item-by-item equipment and meld list was not preserved, so these profiles
 * are empirical panels rather than calculated loadout artifacts.
 */
export const PLAYER_EQUIPMENT_PROFILES: readonly PlayerEquipmentProfile[] = [
  {
    id: 'player-unbuffed-cosmic-tool-v1',
    label: '玩家 720＋690 Teamcraft 建議滿禁斷／無 buff／宇宙工具（實測）',
    notes: '玩家提供的 i720＋i690 Teamcraft 建議滿禁斷配置與宇宙工具之 empirical 最終面板；未保存逐件 item／meld，不能由此 profile 推回逐件配置。',
    preparation: 'unbuffed',
    specialistConsumableCost: 'none',
    crafter: {
      level: 100,
      craftsmanship: 5408,
      control: 5140,
      maxCp: 630,
      cosmicToolGoodBonus: true,
      specialist: false,
    },
    derivation: {
      kind: 'observed-final-panel',
      evidenceKind: 'empirical',
      describedLoadout: 'i720＋i690 Teamcraft 建議滿禁斷配置與宇宙工具',
      itemByItemLoadoutKnown: false,
      panelAlreadyIncludesPreparation: true,
    },
  },
  {
    id: 'player-food-medicine-cosmic-tool-v1',
    label: '玩家 720＋690 Teamcraft 建議滿禁斷／食物＋藥水／宇宙工具（實測）',
    notes: '玩家提供的 i720＋i690 Teamcraft 建議滿禁斷配置、食物、藥水與宇宙工具之 empirical 最終面板；未保存逐件 item／meld，不能由此 profile 推回逐件配置。',
    preparation: 'food-and-medicine',
    specialistConsumableCost: 'none',
    crafter: {
      level: 100,
      craftsmanship: 5408,
      control: 5237,
      maxCp: 749,
      cosmicToolGoodBonus: true,
      specialist: false,
    },
    derivation: {
      kind: 'observed-final-panel',
      evidenceKind: 'empirical',
      describedLoadout: 'i720＋i690 Teamcraft 建議滿禁斷配置、食物、藥水與宇宙工具',
      itemByItemLoadoutKnown: false,
      panelAlreadyIncludesPreparation: true,
    },
  },
  {
    id: 'player-food-medicine-specialist-cosmic-tool-v1',
    label: '玩家 720＋690 Teamcraft 建議滿禁斷／食藥＋專家／宇宙工具（實測）',
    notes: '玩家提供的 i720＋i690 Teamcraft 建議滿禁斷配置、食藥、專家之證與宇宙工具之 empirical 最終面板；未保存逐件 item／meld，不能由此 profile 推回逐件配置。',
    preparation: 'food-medicine-and-specialist',
    specialistConsumableCost: 'delineation-if-specialist-actions-used',
    crafter: {
      level: 100,
      craftsmanship: 5428,
      control: 5257,
      maxCp: 764,
      cosmicToolGoodBonus: true,
      specialist: true,
    },
    derivation: {
      kind: 'observed-final-panel',
      evidenceKind: 'empirical',
      describedLoadout: 'i720＋i690 Teamcraft 建議滿禁斷配置、食藥、專家之證與宇宙工具',
      itemByItemLoadoutKnown: false,
      panelAlreadyIncludesPreparation: true,
    },
  },
] as const

export const GENERIC_EVALUATION_EQUIPMENT_SOURCE: Readonly<EquipmentDataSnapshot> = {
  snapshotPatch: '7.55h2',
  verifiedAt: '2026-08-24',
  xivapiVersion: '284bb7f44b9c0976',
  xivapiSchema: 'exdschema@2:rev:83e965d091116f895d5b17573cc5d12909a5f407',
  xivapiUrl: 'https://v2.xivapi.com',
  ffxivDataminingRevision: '64ff8a5d2903b429cb9d95066547ce57fc53bfc8',
  ffxivDataminingCommitUrl: 'https://github.com/xivapi/ffxiv-datamining/commit/64ff8a5d2903b429cb9d95066547ce57fc53bfc8',
}

const MIXED_EQUIPMENT_AVAILABILITY: Readonly<EquipmentAvailability> = {
  kind: 'combined-equipment-available-by-snapshot',
  itemLevels: [690, 720],
  availableBySnapshotPatch: '7.55h2',
  componentIntroductions: [{
    component: 'Cosmic Saw',
    patch: '7.21',
    officialPatchNotesUrl: 'https://na.finalfantasyxiv.com/lodestone/topics/detail/5078f41351ca968c3b37382ec8eaa2249ccfd9fc/',
  }],
}

const I750_EQUIPMENT_AVAILABILITY: Readonly<EquipmentAvailability> = {
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
}

const BASE_LEVEL_100_PANEL: Readonly<EquipmentPanelComponents> = {
  craftsmanship: 0,
  control: 0,
  maxCp: 180,
}

const NO_SPECIALIST_BONUS: Readonly<EquipmentPanelComponents> = {
  craftsmanship: 0,
  control: 0,
  maxCp: 0,
}

const SPECIALIST_SOUL_BONUS: Readonly<EquipmentPanelComponents> = {
  craftsmanship: 20,
  control: 20,
  maxCp: 15,
}

const NO_MATERIA_TEMPLATE: Readonly<MateriaTemplateProvenance> = {
  kind: 'none',
  meldsPerSlot: 0,
}

const FIVE_MELD_REFERENCE_TEMPLATE: Readonly<MateriaTemplateProvenance> = {
  kind: 'explicit-five-meld-reference-template',
  meldsPerMeldableSlot: 5,
  fixedRelicMelds: 0,
  sourceUrl: 'https://etro.gg/gearset/8a0a6675-58ba-4d86-9510-afb4b89e9b35',
  interpretation: 'reference-template-not-official-bis',
}

interface MateriaDefinition {
  itemId: number
  itemName: string
  stat: EquipmentPanelStat
  nominalValue: number
}

const COMPETENCE_XII: Readonly<MateriaDefinition> = {
  itemId: 41778,
  itemName: "Craftsman's Competence Materia XII",
  stat: 'craftsmanship',
  nominalValue: 33,
}

const COMPETENCE_XI: Readonly<MateriaDefinition> = {
  itemId: 41765,
  itemName: "Craftsman's Competence Materia XI",
  stat: 'craftsmanship',
  nominalValue: 22,
}

const COMMAND_XII: Readonly<MateriaDefinition> = {
  itemId: 41780,
  itemName: "Craftsman's Command Materia XII",
  stat: 'control',
  nominalValue: 23,
}

const COMMAND_XI: Readonly<MateriaDefinition> = {
  itemId: 41767,
  itemName: "Craftsman's Command Materia XI",
  stat: 'control',
  nominalValue: 15,
}

const CUNNING_XII: Readonly<MateriaDefinition> = {
  itemId: 41779,
  itemName: "Craftsman's Cunning Materia XII",
  stat: 'maxCp',
  nominalValue: 11,
}

const CUNNING_IX: Readonly<MateriaDefinition> = {
  itemId: 33926,
  itemName: "Craftsman's Cunning Materia IX",
  stat: 'maxCp',
  nominalValue: 8,
}

function meld(
  definition: Readonly<MateriaDefinition>,
  appliedValue = definition.nominalValue,
): MateriaMeldComponent {
  return { ...definition, appliedValue }
}

const MIXED_I720_I690_HQ_ITEMS: readonly EquipmentItemComponent[] = [
  { slot: 'main-hand', itemId: 45679, itemName: 'Cosmic Saw', itemLevel: 720, quality: 'fixed-relic', panelContribution: { craftsmanship: 1624, control: 842, maxCp: 8 }, materia: [], equivalentDoHItemIds: [45679, 45680, 45681, 45682, 45683, 45684, 45685, 45686], descriptionEffect: { kind: 'good-condition-quality-multiplier', multiplier: 1.75, evidence: 'in-game-item-description-and-domain-golden-mechanics' } },
  { slot: 'off-hand', itemId: 44412, itemName: "Everseeker's Cross-pein Hammer", itemLevel: 720, quality: 'hq', panelContribution: { craftsmanship: 1624, control: 842, maxCp: 0 }, materia: [] },
  { slot: 'head', itemId: 43314, itemName: 'Thunderyards Silk Cap of Crafting', itemLevel: 690, quality: 'hq', panelContribution: { craftsmanship: 0, control: 469, maxCp: 10 }, materia: [] },
  { slot: 'body', itemId: 44433, itemName: "Everseeker's Top of Crafting", itemLevel: 720, quality: 'hq', panelContribution: { craftsmanship: 1392, control: 505, maxCp: 7 }, materia: [] },
  { slot: 'hands', itemId: 44434, itemName: "Everseeker's Armguards of Crafting", itemLevel: 720, quality: 'hq', panelContribution: { craftsmanship: 0, control: 505, maxCp: 10 }, materia: [] },
  { slot: 'legs', itemId: 44435, itemName: "Everseeker's Slops of Crafting", itemLevel: 720, quality: 'hq', panelContribution: { craftsmanship: 93, control: 505, maxCp: 0 }, materia: [] },
  { slot: 'feet', itemId: 44436, itemName: "Everseeker's Workboots of Crafting", itemLevel: 720, quality: 'hq', panelContribution: { craftsmanship: 93, control: 505, maxCp: 0 }, materia: [] },
  { slot: 'ears', itemId: 43340, itemName: 'Black Star Earrings of Crafting', itemLevel: 690, quality: 'hq', panelContribution: { craftsmanship: 84, control: 0, maxCp: 81 }, materia: [] },
  { slot: 'neck', itemId: 43341, itemName: 'Black Star Scarf of Crafting', itemLevel: 690, quality: 'hq', panelContribution: { craftsmanship: 84, control: 0, maxCp: 81 }, materia: [] },
  { slot: 'wrists', itemId: 43342, itemName: 'Black Star Bracelets of Crafting', itemLevel: 690, quality: 'hq', panelContribution: { craftsmanship: 84, control: 0, maxCp: 81 }, materia: [] },
  { slot: 'left-ring', itemId: 43343, itemName: 'Black Star Ring of Crafting', itemLevel: 690, quality: 'hq', panelContribution: { craftsmanship: 0, control: 156, maxCp: 42 }, materia: [] },
  { slot: 'right-ring', itemId: 43343, itemName: 'Black Star Ring of Crafting', itemLevel: 690, quality: 'hq', panelContribution: { craftsmanship: 0, control: 156, maxCp: 42 }, materia: [] },
] as const

const I750_HQ_UNMELDED_ITEMS: readonly EquipmentItemComponent[] = [
  { slot: 'main-hand', itemId: 49053, itemName: 'Stellar Saw', itemLevel: 750, quality: 'fixed-relic', panelContribution: { craftsmanship: 1720, control: 891, maxCp: 8 }, materia: [], equivalentDoHItemIds: [49053, 49054, 49055, 49056, 49057, 49058, 49059, 49060], descriptionEffect: { kind: 'good-condition-quality-multiplier', multiplier: 1.75, evidence: 'in-game-item-description-and-domain-golden-mechanics' } },
  { slot: 'off-hand', itemId: 47164, itemName: "Gold Thumb's Cross-pein Hammer", itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 1720, control: 891, maxCp: 0 }, materia: [] },
  { slot: 'head', itemId: 47184, itemName: 'Crested Headband of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 0, control: 534, maxCp: 10 }, materia: [] },
  { slot: 'body', itemId: 47185, itemName: 'Crested Shirt of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 1474, control: 534, maxCp: 7 }, materia: [] },
  { slot: 'hands', itemId: 47186, itemName: 'Crested Gloves of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 0, control: 534, maxCp: 10 }, materia: [] },
  { slot: 'legs', itemId: 47187, itemName: 'Crested Culottes of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 98, control: 534, maxCp: 0 }, materia: [] },
  { slot: 'feet', itemId: 47188, itemName: 'Crested Boots of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 98, control: 534, maxCp: 0 }, materia: [] },
  { slot: 'ears', itemId: 47194, itemName: 'Crested Earrings of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 98, control: 0, maxCp: 85 }, materia: [] },
  { slot: 'neck', itemId: 47195, itemName: 'Crested Necklace of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 98, control: 0, maxCp: 85 }, materia: [] },
  { slot: 'wrists', itemId: 47196, itemName: 'Crested Bracelet of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 98, control: 0, maxCp: 85 }, materia: [] },
  { slot: 'left-ring', itemId: 47197, itemName: 'Crested Ring of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 0, control: 178, maxCp: 44 }, materia: [] },
  { slot: 'right-ring', itemId: 47197, itemName: 'Crested Ring of Crafting', itemLevel: 750, quality: 'hq', panelContribution: { craftsmanship: 0, control: 178, maxCp: 44 }, materia: [] },
] as const

const I750_HQ_FIVE_MELD_ITEMS: readonly EquipmentItemComponent[] = [
  { ...I750_HQ_UNMELDED_ITEMS[0]!, materia: [] },
  { ...I750_HQ_UNMELDED_ITEMS[1]!, materia: [meld(COMMAND_XII), meld(COMMAND_XII), meld(COMMAND_XI), meld(COMMAND_XI), meld(CUNNING_IX)] },
  { ...I750_HQ_UNMELDED_ITEMS[2]!, materia: [meld(COMPETENCE_XII), meld(COMPETENCE_XII), meld(COMMAND_XII), meld(COMPETENCE_XI), meld(COMMAND_XI)] },
  { ...I750_HQ_UNMELDED_ITEMS[3]!, materia: [meld(COMPETENCE_XII), meld(COMPETENCE_XII), meld(COMPETENCE_XII), meld(COMPETENCE_XI), meld(COMMAND_XI)] },
  { ...I750_HQ_UNMELDED_ITEMS[4]!, materia: [meld(COMPETENCE_XII), meld(COMPETENCE_XII), meld(COMMAND_XII), meld(COMMAND_XI), meld(COMMAND_XI)] },
  { ...I750_HQ_UNMELDED_ITEMS[5]!, materia: [meld(COMMAND_XII), meld(COMMAND_XII), meld(CUNNING_XII), meld(COMMAND_XI), meld(COMMAND_XI)] },
  { ...I750_HQ_UNMELDED_ITEMS[6]!, materia: [meld(COMMAND_XII), meld(COMMAND_XII), meld(CUNNING_XII), meld(COMMAND_XI), meld(COMMAND_XI)] },
  { ...I750_HQ_UNMELDED_ITEMS[7]!, materia: [meld(COMMAND_XII), meld(COMMAND_XII), meld(COMMAND_XI), meld(CUNNING_IX), meld(CUNNING_IX, 7)] },
  { ...I750_HQ_UNMELDED_ITEMS[8]!, materia: [meld(COMMAND_XII), meld(COMMAND_XII), meld(COMMAND_XI), meld(CUNNING_IX), meld(CUNNING_IX, 7)] },
  { ...I750_HQ_UNMELDED_ITEMS[9]!, materia: [meld(COMMAND_XII), meld(COMMAND_XII), meld(COMMAND_XI), meld(CUNNING_IX), meld(CUNNING_IX, 7)] },
  { ...I750_HQ_UNMELDED_ITEMS[10]!, materia: [meld(COMPETENCE_XII), meld(COMPETENCE_XII), meld(COMMAND_XI), meld(COMMAND_XI), meld(CUNNING_IX)] },
  { ...I750_HQ_UNMELDED_ITEMS[11]!, materia: [meld(COMPETENCE_XII), meld(COMPETENCE_XII), meld(COMMAND_XI), meld(COMMAND_XI), meld(CUNNING_IX)] },
] as const

const HQ_ALL_I_PEBRE_AND_TISANE: readonly ConsumableComponent[] = [
  {
    itemId: 46253,
    itemName: 'All i Pebre',
    itemFoodRowId: 694,
    quality: 'hq',
    effects: [
      { stat: 'maxCp', percent: 26, cap: 100 },
      { stat: 'control', percent: 5, cap: 115 },
    ],
  },
  {
    itemId: 44169,
    itemName: "Cunning Craftsman's Tisane",
    itemFoodRowId: 651,
    quality: 'hq',
    effects: [
      { stat: 'maxCp', percent: 6, cap: 27 },
    ],
  },
] as const

const calculated = (
  items: readonly EquipmentItemComponent[],
  availability: Readonly<EquipmentAvailability>,
  materiaTemplate: Readonly<MateriaTemplateProvenance>,
  consumables: readonly ConsumableComponent[],
  specialistSoulBonus: Readonly<EquipmentPanelComponents> = NO_SPECIALIST_BONUS,
): Readonly<CalculatedLoadoutDerivation> => ({
  kind: 'calculated-loadout',
  panelAlreadyIncludesPreparation: true,
  source: GENERIC_EVALUATION_EQUIPMENT_SOURCE,
  availability,
  basePanel: BASE_LEVEL_100_PANEL,
  items,
  materiaTemplate,
  consumables,
  specialistSoulBonus,
})

// CP-specialized meld variants and the i780 Saw of Stars (item 51778) remain
// future probes; they are intentionally not part of this evaluation registry.
const CALCULATED_EQUIPMENT_PROFILES: readonly EvaluationEquipmentProfile[] = [
  {
    id: 'generic-mixed-i720-i690-hq-unmelded-v1',
    label: 'i720 Cosmic 主手＋6×i720／6×i690 混裝／其餘 HQ／0 materia',
    notes: 'Cosmic Saw 是固定 relic、不可 HQ／meld；其餘逐件以 pinned HQ 面板重算。啟用宇宙工具 Good 1.75× 效果，非專家，作為較低裝備 boundary probe。',
    preparation: 'unbuffed',
    specialistConsumableCost: 'none',
    crafter: { level: 100, craftsmanship: 5078, control: 4485, maxCp: 542, cosmicToolGoodBonus: true, specialist: false },
    derivation: calculated(MIXED_I720_I690_HQ_ITEMS, MIXED_EQUIPMENT_AVAILABILITY, NO_MATERIA_TEMPLATE, []),
  },
  {
    id: 'generic-mixed-i720-i690-hq-unmelded-buffed-v1',
    label: 'i720 Cosmic 主手＋6×i720／6×i690 混裝／其餘 HQ／0 materia／食物＋藥水',
    notes: '同一 Cosmic Saw 混裝，加 HQ All i Pebre 與 HQ Cunning Craftsman’s Tisane；固定 relic 不 HQ／meld，啟用宇宙工具 Good 1.75× 效果，非專家。',
    preparation: 'food-and-medicine',
    specialistConsumableCost: 'none',
    crafter: { level: 100, craftsmanship: 5078, control: 4600, maxCp: 669, cosmicToolGoodBonus: true, specialist: false },
    derivation: calculated(MIXED_I720_I690_HQ_ITEMS, MIXED_EQUIPMENT_AVAILABILITY, NO_MATERIA_TEMPLATE, HQ_ALL_I_PEBRE_AND_TISANE),
  },
  {
    id: 'generic-i750-hq-unmelded-v1',
    label: 'i750 Stellar 主手＋其餘 i750 HQ／0 materia',
    notes: 'Stellar Saw 是固定 relic、不可 HQ／meld；其餘 Gold Thumb’s／Crested 逐件以 pinned HQ 面板重算。啟用宇宙工具 Good 1.75× 效果，非專家。',
    preparation: 'unbuffed',
    specialistConsumableCost: 'none',
    crafter: { level: 100, craftsmanship: 5404, control: 4808, maxCp: 558, cosmicToolGoodBonus: true, specialist: false },
    derivation: calculated(I750_HQ_UNMELDED_ITEMS, I750_EQUIPMENT_AVAILABILITY, NO_MATERIA_TEMPLATE, []),
  },
  {
    id: 'generic-i750-hq-unmelded-buffed-v1',
    label: 'i750 Stellar 主手＋其餘 i750 HQ／0 materia／食物＋藥水',
    notes: '同一 Stellar Saw 裸裝，加 HQ All i Pebre 與 HQ Cunning Craftsman’s Tisane；固定 relic 不 HQ／meld，啟用宇宙工具 Good 1.75× 效果，非專家。',
    preparation: 'food-and-medicine',
    specialistConsumableCost: 'none',
    crafter: { level: 100, craftsmanship: 5404, control: 4923, maxCp: 685, cosmicToolGoodBonus: true, specialist: false },
    derivation: calculated(I750_HQ_UNMELDED_ITEMS, I750_EQUIPMENT_AVAILABILITY, NO_MATERIA_TEMPLATE, HQ_ALL_I_PEBRE_AND_TISANE),
  },
  {
    id: 'generic-i750-hq-five-meld-template-v1',
    label: 'i750 Stellar 主手＋其餘 11 槽 5-meld 參考模板',
    notes: 'Stellar Saw 固定 relic 不 HQ／meld，其餘 11 槽逐槽明列五顆 materia；可重算但不是官方 BiS，也不宣稱全域最佳。啟用宇宙工具 Good 1.75× 效果，非專家。',
    preparation: 'unbuffed',
    specialistConsumableCost: 'none',
    crafter: { level: 100, craftsmanship: 5811, control: 5385, maxCp: 649, cosmicToolGoodBonus: true, specialist: false },
    derivation: calculated(I750_HQ_FIVE_MELD_ITEMS, I750_EQUIPMENT_AVAILABILITY, FIVE_MELD_REFERENCE_TEMPLATE, []),
  },
  {
    id: 'generic-i750-hq-five-meld-template-buffed-v1',
    label: 'i750 Stellar 主手＋其餘 11 槽 5-meld 參考模板／食物＋藥水',
    notes: '同一可重算 Stellar＋11 槽 5-meld 參考模板，加 HQ 食藥；固定 relic 不 meld，且不是官方 BiS。啟用宇宙工具 Good 1.75× 效果，非專家。',
    preparation: 'food-and-medicine',
    specialistConsumableCost: 'none',
    crafter: { level: 100, craftsmanship: 5811, control: 5500, maxCp: 776, cosmicToolGoodBonus: true, specialist: false },
    derivation: calculated(I750_HQ_FIVE_MELD_ITEMS, I750_EQUIPMENT_AVAILABILITY, FIVE_MELD_REFERENCE_TEMPLATE, HQ_ALL_I_PEBRE_AND_TISANE),
  },
  {
    id: 'generic-i750-hq-five-meld-template-buffed-specialist-v1',
    label: 'i750 Stellar 主手＋其餘 11 槽 5-meld 參考模板／食藥＋專家',
    notes: '同一可重算 Stellar＋11 槽 5-meld 參考模板與 HQ 食藥，再計入專家之證 +20 作業／+20 加工／+15 CP；固定 relic 不 meld，且不是官方 BiS。啟用宇宙工具 Good 1.75× 效果。',
    preparation: 'food-medicine-and-specialist',
    specialistConsumableCost: 'delineation-if-specialist-actions-used',
    crafter: { level: 100, craftsmanship: 5831, control: 5520, maxCp: 791, cosmicToolGoodBonus: true, specialist: true },
    derivation: calculated(I750_HQ_FIVE_MELD_ITEMS, I750_EQUIPMENT_AVAILABILITY, FIVE_MELD_REFERENCE_TEMPLATE, HQ_ALL_I_PEBRE_AND_TISANE, SPECIALIST_SOUL_BONUS),
  },
] as const

/**
 * Bounded evaluation registry. The historical player panels remain first for
 * compatibility, followed by seven source-traceable calculated boundary probes.
 */
export const GENERIC_EVALUATION_EQUIPMENT_PROFILES: readonly EvaluationEquipmentProfile[] = [
  ...PLAYER_EQUIPMENT_PROFILES,
  ...CALCULATED_EQUIPMENT_PROFILES,
] as const

export function playerEquipmentProfileById(id: string): PlayerEquipmentProfile | null {
  return PLAYER_EQUIPMENT_PROFILES.find((profile) => profile.id === id) ?? null
}
