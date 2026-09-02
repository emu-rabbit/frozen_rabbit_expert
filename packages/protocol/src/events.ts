import {
  CRAFT_MECHANICS_VERSION,
  type CraftActionId,
  type CraftObjective,
  type CraftState,
  type MaterialCondition,
  type ModelVersions,
  type CrafterProfile,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'

export const MODEL_VERSIONS: ModelVersions = {
  mechanics: CRAFT_MECHANICS_VERSION,
  plannerPolicy: 'generic-craft-route-objective-condition-v0.6.0-migration-oracle',
  // Keep protocol independent from the data package/catalog payload. The Web
  // registry test compares this value against COSMIC_EXPERT_CATALOG_VERSION.
  recipeCatalog: 'cosmic-expert-catalog-284bb7f44b9c0976-3c0ac44a05e9bf29-v2',
  conditionProfiles: 'manual-cosmic-expert-condition-selection-v1',
  sessionCodec: 'expert-session-v0.11.0',
}

export type SessionRiskPreference = 'balanced'

interface EventBase {
  id: string
  at: number
}

export type SessionEvent =
  | (EventBase & { type: 'craftStarted' })
  | (EventBase & {
      type: 'conditionSelected'
      condition: MaterialCondition
    })
  | (EventBase & {
      type: 'craftActionUsed'
      action: CraftActionId
      previousCondition: MaterialCondition
    })
  | (EventBase & {
      type: 'craftActionResolved'
      success: boolean
      nextCondition: MaterialCondition
    })
  | (EventBase & {
      type: 'stateResynced'
      patch: Partial<CraftState>
      reason: string
    })

export interface ExpertSessionExport {
  manifest: {
    schema: string
    scenarioId: string
    scenario: string
    createdAt: string
    modelVersions: ModelVersions
  }
  recipe: RecipeProfile
  objective: CraftObjective
  crafter: CrafterProfile
  riskPreference: SessionRiskPreference
  initialState: CraftState
  events: SessionEvent[]
  notes: string[]
}

export function createEventId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
