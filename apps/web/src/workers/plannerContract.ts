import type { CraftActionId, CrafterProfile, CraftState } from '@frozen-rabbit-expert/domain'
import type { Recommendation } from '@frozen-rabbit-expert/solver'
import type { RiskPreference } from '@frozen-rabbit-expert/solver'

export interface GenericPlannerRequest {
  id: number
  plannerKind: 'generic'
  scenarioId: string
  crafter: CrafterProfile
  state: CraftState
  riskPreference: RiskPreference
  actualActionHistory: CraftActionId[]
}

export interface GenericPlannerResponse {
  id: number
  result: Recommendation | null
  elapsedMs: number
  deadlineExceeded: boolean
  error?: string
}
