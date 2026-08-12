import type { CrafterProfile } from '@frozen-rabbit-expert/domain'

export type PlayerEquipmentProfileId =
  | 'player-unbuffed-cosmic-tool-v1'
  | 'player-food-medicine-cosmic-tool-v1'
  | 'player-food-medicine-specialist-cosmic-tool-v1'

export interface PlayerEquipmentProfile {
  id: PlayerEquipmentProfileId
  label: string
  preparation: 'unbuffed' | 'food-and-medicine' | 'food-medicine-and-specialist'
  specialistConsumableCost: 'none' | 'delineation-if-specialist-actions-used'
  crafter: Readonly<CrafterProfile>
}

/**
 * Player-observed final panel values. Food, medicine, specialist soul, and
 * cosmic-tool effects are already reflected where applicable; consumers must
 * not add those bonuses a second time.
 */
export const PLAYER_EQUIPMENT_PROFILES: readonly PlayerEquipmentProfile[] = [
  {
    id: 'player-unbuffed-cosmic-tool-v1',
    label: '無 buff／宇宙工具',
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
  },
  {
    id: 'player-food-medicine-cosmic-tool-v1',
    label: '食物＋藥水／宇宙工具',
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
  },
  {
    id: 'player-food-medicine-specialist-cosmic-tool-v1',
    label: '食藥＋專家／宇宙工具',
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
  },
] as const

export function playerEquipmentProfileById(id: string): PlayerEquipmentProfile | null {
  return PLAYER_EQUIPMENT_PROFILES.find((profile) => profile.id === id) ?? null
}
