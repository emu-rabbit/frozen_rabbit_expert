/// <reference lib="webworker" />

import type {
  CraftActionId,
  CrafterProfile,
  CraftState,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  recommendGuideIntegratedAction,
  type GuideIntegratedRuntimeRecommendation,
} from '@frozen-rabbit-expert/solver'

interface GuidePlannerRequest {
  id: number
  recipe: RecipeProfile
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
    const result = recommendGuideIntegratedAction(
      request.recipe,
      request.crafter,
      request.state,
      {
        actualActionHistory: request.actualActionHistory,
        deadlineMs: 3_000,
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
