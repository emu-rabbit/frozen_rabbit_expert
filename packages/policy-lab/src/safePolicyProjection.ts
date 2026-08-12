import { legalActions, previewAction } from '@frozen-rabbit-expert/domain'
import type { EpisodePolicy } from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'

/**
 * Makes rollout continuation semantics match the shared runtime safety gate.
 * An unsafe primary action may use an explicit safe fallback; otherwise the
 * route terminates as policy-null instead of borrowing value from a future the
 * runtime would refuse to execute.
 */
export function createSafetyProjectedPolicy(
  primary: EpisodePolicy,
  fallback: EpisodePolicy = () => null,
): EpisodePolicy {
  return (recipe, crafter, state) => {
    const safeAction = (policy: EpisodePolicy) => {
      const action = policy(recipe, crafter, state)
      if (action === null || !legalActions(recipe, crafter, state).includes(action)) return null
      const preview = previewAction(recipe, crafter, state, action)
      return isPolicyActionSafe(recipe, crafter, state, action, preview) ? action : null
    }
    return safeAction(primary) ?? safeAction(fallback)
  }
}
