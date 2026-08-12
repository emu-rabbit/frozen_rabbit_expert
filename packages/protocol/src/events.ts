import type {
  CraftActionId,
  CraftState,
  MaterialCondition,
  ModelVersions,
  CrafterProfile,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'

export const MODEL_VERSIONS: ModelVersions = {
  mechanics: 'cosmic-craft-mechanics-v0.3.0-tw751-specialist',
  cosmicTitaniumPolicy: 'cosmic-titanium-guide-integrated-v1.1.0',
  cosmicTitaniumNailsPolicy: 'cosmic-titanium-nails-guide-integrated-v1.2.0',
  conditionProfiles: 'manual-current-plus-assumed-sensitivity-v1',
  sessionCodec: 'expert-session-v0.7.0',
}

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
  crafter: CrafterProfile
  initialState: CraftState
  events: SessionEvent[]
  notes: string[]
}

export function createEventId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
