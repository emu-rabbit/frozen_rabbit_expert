import type { PopulationHeldOutPolicyResult } from './evaluatePolicy'

const evaluatedPopulationResults = new WeakSet<object>()

/** Internal live-object brand; intentionally not exported from the package entrypoint. */
export function brandPopulationHeldOutPolicyResult(
  result: PopulationHeldOutPolicyResult,
): PopulationHeldOutPolicyResult {
  evaluatedPopulationResults.add(result)
  return result
}

/** Serialized, cloned, or caller-constructed summaries are deliberately untrusted. */
export function isBrandedPopulationHeldOutPolicyResult(
  result: Readonly<PopulationHeldOutPolicyResult>,
): boolean {
  return evaluatedPopulationResults.has(result)
}
