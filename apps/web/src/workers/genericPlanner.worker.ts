/// <reference lib="webworker" />

import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import { recommendAction } from '@frozen-rabbit-expert/solver'
import {
  WEB_PLANNER_TIMEOUT_MS,
  craftScenarioById,
  policyCoverageForCrafter,
} from '../scenarios'
import type { GenericPlannerRequest, GenericPlannerResponse } from './plannerContract'

const worker = self as DedicatedWorkerGlobalScope

worker.onmessage = (event: MessageEvent<GenericPlannerRequest>) => {
  const request = event.data
  const startedAt = performance.now()
  try {
    if (request.plannerKind !== 'generic') {
      throw new Error(`unsupported planner kind: ${String(request.plannerKind)}`)
    }
    const scenario = craftScenarioById(request.scenarioId)
    if (scenario === null) throw new Error(`unsupported craft scenario: ${request.scenarioId}`)
    const result = recommendAction(
      scenario.recipe,
      request.crafter,
      request.state,
      {
        mechanicsVersion: MODEL_VERSIONS.mechanics,
        objective: scenario.objective,
        riskPreference: request.riskPreference,
        policyCoverage: policyCoverageForCrafter(scenario, request.crafter),
        actualActionHistory: request.actualActionHistory,
      },
    )
    const elapsedMs = Math.max(0, performance.now() - startedAt)
    worker.postMessage({
      id: request.id,
      result,
      elapsedMs,
      deadlineExceeded: elapsedMs >= WEB_PLANNER_TIMEOUT_MS,
    } satisfies GenericPlannerResponse)
  } catch (error) {
    const elapsedMs = Math.max(0, performance.now() - startedAt)
    worker.postMessage({
      id: request.id,
      result: null,
      elapsedMs,
      deadlineExceeded: elapsedMs >= WEB_PLANNER_TIMEOUT_MS,
      error: error instanceof Error ? error.message : String(error),
    } satisfies GenericPlannerResponse)
  }
}

export {}
