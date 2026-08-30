import { ref, watch, type Ref } from 'vue'
import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import type { PlannerReply } from '@/runtime/planner'

export function useRecommendationOutcome(
  recommendation: Readonly<Ref<PlannerReply | null>>,
  actionNeedsSuccess: (action: CraftActionId) => boolean,
) {
  const success = ref<boolean | null>(null)

  watch(recommendation, nextRecommendation => {
    const action = nextRecommendation?.action as CraftActionId | null ?? null
    success.value = action && actionNeedsSuccess(action) ? null : action ? true : null
  }, { immediate: true })

  return success
}
