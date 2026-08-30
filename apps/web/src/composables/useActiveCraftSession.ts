import { computed, readonly, ref, shallowRef, type DeepReadonly } from 'vue'
import {
  ACTIONS,
  applyObservedOutcome,
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  COSMIC_EXPERT_CATALOG_VERSION,
  cosmicExpertScenarioDataByRecipeId,
  type CosmicExpertScenarioDataEntry,
} from '@frozen-rabbit-expert/data'
import {
  MODEL_VERSIONS,
  createEventId,
  createSessionExport,
  removeLastStep,
  replaySession,
  type SessionEvent,
} from '@frozen-rabbit-expert/protocol'
import type { EquipmentProfile } from './useEquipmentProfiles'
import type { CosmicMission, MissionItem } from '@/types/missionData'
import { WEB_PLANNER_POLICY, plannerRuntime, type PlannerReply } from '@/runtime/planner'
import { createPlannerEpisode } from '@/runtime/planner/episode'

export interface CraftSessionSelection {
  mission: DeepReadonly<CosmicMission>
  item: DeepReadonly<MissionItem>
  equipmentProfile: Readonly<EquipmentProfile>
  crafter: Readonly<CrafterProfile>
}

interface ActiveCraftSession extends CraftSessionSelection {
  scenario: Readonly<CosmicExpertScenarioDataEntry>
  initialState: ReturnType<typeof createInitialCraftState>
  startedAt: number
}

const activeSession = shallowRef<ActiveCraftSession | null>(null)

export function actionNeedsObservedCondition(
  action: CraftActionId,
  currentCondition: MaterialCondition | undefined,
) {
  const definition = ACTIONS[action]
  if (definition.rerollsCondition === true) return true
  if (definition.noStep === true) return false
  return currentCondition !== 'goodOmen' && currentCondition !== 'robust'
}
const events = ref<SessionEvent[]>([])
const recommendation = shallowRef<PlannerReply | null>(null)
const recommendationLoading = ref(false)
const recommendationError = ref<string | null>(null)
const inputLocked = ref(false)
let requestRevision = 0

const replay = computed(() => {
  const session = activeSession.value
  if (!session) return null
  return replaySession(session.scenario.recipe, session.crafter, session.initialState, events.value)
})
const state = computed(() => replay.value?.state ?? null)
const actionCount = computed(() => events.value.filter(event => event.type === 'craftActionResolved').length)
const availableActions = computed(() => {
  const session = activeSession.value
  const current = state.value
  return session && current ? legalActions(session.scenario.recipe, session.crafter, current) : []
})

function startEvents(): SessionEvent[] {
  const at = Date.now()
  return [
    { type: 'craftStarted', id: createEventId(), at },
    { type: 'conditionSelected', id: createEventId(), at: at + 1, condition: 'normal' },
  ]
}

async function requestRecommendation(advance: Parameters<typeof plannerRuntime.recommend>[0]) {
  const session = activeSession.value
  const current = state.value
  if (!session || !current || current.terminal !== 'none') {
    recommendation.value = null
    recommendationLoading.value = false
    recommendationError.value = null
    return
  }

  const revision = ++requestRevision
  recommendationLoading.value = true
  recommendationError.value = null
  try {
    const reply = await plannerRuntime.recommend(
      advance,
      createPlannerEpisode(session.scenario, session.crafter, current),
    )
    if (revision !== requestRevision) return
    recommendation.value = reply
    if (reply.action === null) recommendationError.value = 'policy-null'
  } catch (error) {
    if (revision !== requestRevision) return
    recommendation.value = null
    recommendationError.value = error instanceof Error ? error.message : String(error)
    console.warn('[CraftSession] Recommendation failed', recommendationError.value)
  } finally {
    if (revision === requestRevision) recommendationLoading.value = false
  }
}

export function startCraftSession(selection: CraftSessionSelection) {
  const scenario = cosmicExpertScenarioDataByRecipeId(selection.item.recipeId)
  if (!scenario) throw new Error(`Recipe ${selection.item.recipeId} is missing from the Cosmic catalog`)
  const crafter = { ...selection.crafter }
  const equipmentProfile = {
    ...selection.equipmentProfile,
    jobs: [...selection.equipmentProfile.jobs],
    food: selection.equipmentProfile.food ? { ...selection.equipmentProfile.food } : null,
    medicine: selection.equipmentProfile.medicine ? { ...selection.equipmentProfile.medicine } : null,
  }
  activeSession.value = {
    ...selection,
    equipmentProfile,
    crafter,
    scenario,
    initialState: createInitialCraftState(scenario.recipe, crafter),
    startedAt: Date.now(),
  }
  events.value = startEvents()
  recommendation.value = null
  recommendationError.value = null
  inputLocked.value = false
  void requestRecommendation({ mode: 'reset' })
}

export function useActiveCraftSession() {
  function exportSession() {
    const session = activeSession.value
    if (!session) return null
    return createSessionExport(
      session.scenario.scenarioId,
      session.scenario.recipe,
      session.scenario.objective,
      session.crafter,
      'balanced',
      session.initialState,
      events.value,
      {
        ...MODEL_VERSIONS,
        plannerPolicy: WEB_PLANNER_POLICY,
        recipeCatalog: COSMIC_EXPERT_CATALOG_VERSION,
      },
    )
  }

  function replaceItem(item: DeepReadonly<MissionItem>) {
    const session = activeSession.value
    if (!session || item.recipeId === session.item.recipeId) return
    startCraftSession({
      mission: session.mission,
      item,
      equipmentProfile: session.equipmentProfile,
      crafter: session.crafter,
    })
  }

  function restart() {
    const session = activeSession.value
    if (!session) return
    startCraftSession(session)
  }

  async function resolveAction(
    action: CraftActionId,
    success: boolean,
    nextCondition: MaterialCondition,
  ) {
    if (inputLocked.value || recommendationLoading.value) return
    const session = activeSession.value
    const before = state.value
    if (!session || !before || before.terminal !== 'none') return
    if (!availableActions.value.includes(action)) throw new Error(`Illegal action: ${action}`)
    inputLocked.value = true
    try {
      const recommendedAction = recommendation.value?.action
      events.value = [
        ...events.value,
        {
          type: 'craftActionUsed',
          id: createEventId(),
          at: Date.now(),
          action,
          previousCondition: before.condition,
        },
        {
          type: 'craftActionResolved',
          id: createEventId(),
          at: Date.now() + 1,
          success,
          nextCondition,
        },
      ]
      const after = state.value
      if (!after || after.terminal !== 'none') {
        ++requestRevision
        recommendation.value = null
        recommendationLoading.value = false
        recommendationError.value = null
        return
      }
      await requestRecommendation({
        mode: recommendedAction === action ? 'continue' : 'deviate',
        action,
      })
    } finally {
      inputLocked.value = false
    }
  }

  async function rebuildRecommendation() {
    const session = activeSession.value
    if (!session) return
    const revision = ++requestRevision
    recommendationLoading.value = true
    recommendationError.value = null
    recommendation.value = null
    try {
      let current = { ...session.initialState, buffs: { ...session.initialState.buffs } }
      let reply: PlannerReply | null = null
      let pendingAction: CraftActionId | null = null
      for (const event of events.value) {
        if (event.type === 'conditionSelected') {
          current = { ...current, condition: event.condition }
          if (reply === null) {
            reply = await plannerRuntime.recommend(
              { mode: 'reset' },
              createPlannerEpisode(session.scenario, session.crafter, current),
            )
          }
        } else if (event.type === 'craftActionUsed') {
          pendingAction = event.action
        } else if (event.type === 'craftActionResolved' && pendingAction !== null) {
          const actualAction = pendingAction
          current = applyObservedOutcome(
            session.scenario.recipe,
            session.crafter,
            current,
            actualAction,
            event,
          ).nextState
          pendingAction = null
          if (current.terminal === 'none') {
            reply = await plannerRuntime.recommend(
              { mode: reply?.action === actualAction ? 'continue' : 'deviate', action: actualAction },
              createPlannerEpisode(session.scenario, session.crafter, current),
            )
          } else reply = null
        }
      }
      if (revision !== requestRevision) return
      recommendation.value = reply
      if (current.terminal === 'none' && reply?.action === null) recommendationError.value = 'policy-null'
    } catch (error) {
      if (revision !== requestRevision) return
      recommendationError.value = error instanceof Error ? error.message : String(error)
      console.warn('[CraftSession] Recommendation rebuild failed', recommendationError.value)
    } finally {
      if (revision === requestRevision) recommendationLoading.value = false
    }
  }

  function undo() {
    if (inputLocked.value || recommendationLoading.value || actionCount.value === 0) return
    events.value = removeLastStep(events.value)
    void rebuildRecommendation()
  }

  function actionNeedsSuccess(action: CraftActionId) {
    const session = activeSession.value
    const current = state.value
    if (!session || !current) return false
    return previewAction(session.scenario.recipe, session.crafter, current, action).successRate < 1
  }

  function actionNeedsNextCondition(action: CraftActionId) {
    return actionNeedsObservedCondition(action, state.value?.condition)
  }

  return {
    activeSession: readonly(activeSession),
    events: readonly(events),
    state,
    actionCount,
    recommendation: readonly(recommendation),
    recommendationLoading: readonly(recommendationLoading),
    recommendationError: readonly(recommendationError),
    inputLocked: readonly(inputLocked),
    availableActions,
    exportSession,
    replaceItem,
    restart,
    resolveAction,
    undo,
    actionNeedsSuccess,
    actionNeedsNextCondition,
  }
}
