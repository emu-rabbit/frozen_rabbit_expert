/// <reference lib="webworker" />

import type {
  CraftActionId,
  CrafterProfile,
  CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  recommendGuideIntegratedAction,
  type GuideIntegratedRuntimeRecommendation,
} from '@frozen-rabbit-expert/solver'
import { WEB_GUIDE_PLANNER_TIMEOUT_MS, craftScenarioById, plannerConfigForCrafter } from '../scenarios'

interface GuidePlannerRequest {
  id: number
  scenarioId: string
  crafter: CrafterProfile
  state: CraftState
  actualActionHistory: CraftActionId[]
}

interface GuidePlannerResponse {
  id: number
  result: GuideIntegratedRuntimeRecommendation | null
  error?: string
}

const worker = self as DedicatedWorkerGlobalScope

worker.onmessage = (event: MessageEvent<GuidePlannerRequest>) => {
  const request = event.data
  try {
    const scenario = craftScenarioById(request.scenarioId)
    if (scenario === null) throw new Error(`unsupported craft scenario: ${request.scenarioId}`)
    const result = recommendGuideIntegratedAction(
      scenario.recipe,
      request.crafter,
      request.state,
      {
        actualActionHistory: request.actualActionHistory,
        objective: scenario.objective,
        policyVersion: scenario.planner.policyVersion,
        config: plannerConfigForCrafter(scenario, request.crafter),
        deadlineMs: WEB_GUIDE_PLANNER_TIMEOUT_MS,
      },
    )
    worker.postMessage({ id: request.id, result } satisfies GuidePlannerResponse)
  } catch (error) {
    worker.postMessage({
      id: request.id,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    } satisfies GuidePlannerResponse)
  }
}

export {}
