/// <reference lib="webworker" />

import type { CrafterProfile, CraftState, RecipeProfile } from '@frozen-rabbit-expert/domain'
import {
  recommendWithResearchTeacher,
  type ResearchTeacherResult,
} from '@frozen-rabbit-expert/solver'

interface ResearchRequest {
  id: number
  recipe: RecipeProfile
  crafter: CrafterProfile
  state: CraftState
  mechanicsVersion: string
}

interface ResearchResponse {
  id: number
  result: ResearchTeacherResult | null
  error?: string
}

const worker = self as DedicatedWorkerGlobalScope

worker.onmessage = (event: MessageEvent<ResearchRequest>) => {
  const request = event.data
  try {
    const result = recommendWithResearchTeacher(
      request.recipe,
      request.crafter,
      request.state,
      {
        mechanicsVersion: request.mechanicsVersion,
        maxTimeMs: 4_500,
        samplesPerProfile: 16,
        maxEpisodeSteps: 40,
      },
    )
    worker.postMessage({ id: request.id, result } satisfies ResearchResponse)
  } catch (error) {
    worker.postMessage({
      id: request.id,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ResearchResponse)
  }
}

export {}
