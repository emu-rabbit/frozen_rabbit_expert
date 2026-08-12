import { computed, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import {
  ACTIONS,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CraftState,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  createEventId,
  createSessionExport,
  removeLastStep,
  replaySession,
  type SessionEvent,
} from '@frozen-rabbit-expert/protocol'
import {
  recommendAction,
  type GuideIntegratedRuntimeRecommendation,
  type Recommendation,
} from '@frozen-rabbit-expert/solver'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import {
  CRAFT_SCENARIOS,
  DEFAULT_CRAFT_SCENARIO_ID,
  WEB_GUIDE_PLANNER_TIMEOUT_MS,
  craftScenarioById,
  policyCoverageForCrafter,
  type CraftScenarioId,
} from '../scenarios'

const STORAGE_KEY = 'frozen-rabbit-expert/session-v0.8.0'
const LEGACY_STORAGE_KEYS = [
  'frozen-rabbit-expert/session-v0.7.0',
  'frozen-rabbit-expert/session-v0.6.0',
] as const
const EQUIPMENT_STORAGE_KEY = 'frozen-rabbit-expert/equipment-v2'
const LEGACY_EQUIPMENT_STORAGE_KEY = 'frozen-rabbit-expert/equipment-v1'

type EquipmentProfile = Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'>

interface SavedSession {
  scenarioId: CraftScenarioId
  crafter: CrafterProfile
  initialState: CraftState
  events: SessionEvent[]
}

const DEFAULT_CRAFTER: CrafterProfile = {
  level: 100,
  craftsmanship: 0,
  control: 0,
  maxCp: 0,
  cosmicToolGoodBonus: false,
  specialist: false,
}

function isValidEquipment(value: Partial<EquipmentProfile>): boolean {
  return Number.isFinite(value.craftsmanship) && (value.craftsmanship ?? 0) > 0
    && Number.isFinite(value.control) && (value.control ?? 0) > 0
    && Number.isFinite(value.maxCp) && (value.maxCp ?? 0) > 0
    && typeof value.cosmicToolGoodBonus === 'boolean'
}

function loadSavedEquipment(): EquipmentProfile | null {
  try {
    const raw = localStorage.getItem(EQUIPMENT_STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_EQUIPMENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EquipmentProfile>
    return isValidEquipment(parsed)
      ? {
          craftsmanship: parsed.craftsmanship!,
          control: parsed.control!,
          maxCp: parsed.maxCp!,
          cosmicToolGoodBonus: parsed.cosmicToolGoodBonus!,
          specialist: parsed.specialist === true,
        }
      : null
  } catch {
    return null
  }
}

function equipmentFromCrafter(crafter: CrafterProfile): EquipmentProfile {
  return {
    craftsmanship: crafter.craftsmanship,
    control: crafter.control,
    maxCp: crafter.maxCp,
    cosmicToolGoodBonus: crafter.cosmicToolGoodBonus,
    specialist: crafter.specialist === true,
  }
}

export function createCraftStartEvents(at = Date.now()): SessionEvent[] {
  return [
    { type: 'craftStarted', id: createEventId(), at },
    { type: 'conditionSelected', id: createEventId(), at, condition: 'normal' },
  ]
}

export function withInitialNormalCondition(events: SessionEvent[]): SessionEvent[] {
  if (events.length === 0) return createCraftStartEvents()
  const isUntouchedStart = events.some((event) => event.type === 'craftStarted')
    && !events.some((event) => event.type !== 'craftStarted')
  return isUntouchedStart ? createCraftStartEvents(events[0]?.at) : events
}

function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      ?? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find((value) => value !== null)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedSession>
    if (!parsed.crafter || !parsed.initialState || !Array.isArray(parsed.events)) return null
    if (parsed.crafter.craftsmanship <= 0 || parsed.crafter.control <= 0 || parsed.crafter.maxCp <= 0) return null
    const scenario = craftScenarioById(parsed.scenarioId ?? DEFAULT_CRAFT_SCENARIO_ID)
    if (scenario === null) return null
    const normalizedEvents = withInitialNormalCondition(parsed.events)
    replaySession(scenario.recipe, parsed.crafter, parsed.initialState, normalizedEvents)
    return {
      scenarioId: scenario.scenarioId as CraftScenarioId,
      crafter: parsed.crafter,
      initialState: parsed.initialState,
      events: normalizedEvents,
    }
  } catch {
    return null
  }
}

export function useCraftSession() {
  const saved = loadSavedSession()
  const initialScenarioId = saved?.scenarioId ?? DEFAULT_CRAFT_SCENARIO_ID
  const initialScenario = craftScenarioById(initialScenarioId)
  if (initialScenario === null) throw new Error(`unsupported craft scenario: ${initialScenarioId}`)
  const activeCraft = ref({
    scenarioId: initialScenarioId,
    initialState: saved?.initialState ?? createInitialCraftState(initialScenario.recipe, saved?.crafter ?? DEFAULT_CRAFTER),
  })
  const scenarioId = computed(() => activeCraft.value.scenarioId)
  const scenario = computed(() => {
    const resolved = craftScenarioById(scenarioId.value)
    if (resolved === null) throw new Error(`unsupported craft scenario: ${scenarioId.value}`)
    return resolved
  })
  const recipe = computed(() => scenario.value.recipe)
  const objective = computed(() => scenario.value.objective)
  const savedEquipment = ref<EquipmentProfile | null>(loadSavedEquipment() ?? (saved ? equipmentFromCrafter(saved.crafter) : null))
  const crafter = reactive<CrafterProfile>({ ...DEFAULT_CRAFTER, ...saved?.crafter })
  const configured = computed(() => crafter.craftsmanship > 0 && crafter.control > 0 && crafter.maxCp > 0)
  const initialState = computed({
    get: () => activeCraft.value.initialState,
    set: (value: CraftState) => {
      activeCraft.value = { ...activeCraft.value, initialState: value }
    },
  })
  const events = ref<SessionEvent[]>(saved?.events ?? [])

  const replay = computed(() => configured.value
    ? replaySession(recipe.value, crafter, initialState.value, events.value)
    : { state: initialState.value, pendingAction: null, appliedEvents: 0 })
  const state = computed(() => replay.value.state)
  const pendingAction = computed(() => replay.value.pendingAction)
  const conditionConfirmed = computed(() => {
    if (pendingAction.value !== null) return false
    const last = events.value.at(-1)
    return last?.type === 'conditionSelected'
      || last?.type === 'craftActionResolved'
      || last?.type === 'stateResynced'
  })
  const actionCount = computed(() => events.value.filter((event) => event.type === 'craftActionResolved').length)
  const fastRecommendation = computed(() => configured.value && conditionConfirmed.value
      ? recommendAction(recipe.value, crafter, state.value, {
        mechanicsVersion: MODEL_VERSIONS.mechanics,
        qualityTarget: objective.value.qualityTarget,
        policyCoverage: policyCoverageForCrafter(scenario.value, crafter),
      })
    : null)
  const actualActionHistory = computed(() => events.value
    .filter((event): event is Extract<SessionEvent, { type: 'craftActionUsed' }> => event.type === 'craftActionUsed')
    .map((event) => event.action))
  const plannerRecommendation = shallowRef<Recommendation | null>(null)
  const plannerStatus = ref<'idle' | 'analyzing' | 'ready' | 'timed-out' | 'failed'>('idle')
  const plannerError = ref<string | null>(null)
  const plannerDurationMs = ref<number | null>(null)
  const plannerFallbackReason = ref<
    'worker-start' | 'worker-response-error' | 'worker-error' | 'planner-deadline' | 'watchdog-timeout' | null
  >(null)
  const recommendation = computed(() => {
    if (plannerStatus.value === 'analyzing') return null
    return plannerRecommendation.value ?? fastRecommendation.value
  })
  let worker: Worker | null = null
  let requestId = 0
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let plannerStartedAtMs = 0

  function currentPlannerDuration(): number {
    return Math.max(0, performance.now() - plannerStartedAtMs)
  }

  function stopPlannerWorker(): void {
    if (watchdog !== null) clearTimeout(watchdog)
    watchdog = null
    worker?.terminate()
    worker = null
  }

  function runtimeRecommendation(
    result: GuideIntegratedRuntimeRecommendation,
  ): Recommendation {
    const fallback = fastRecommendation.value
    return {
      action: result.action,
      alternatives: [],
      phase: result.phase,
      reasons: [result.reason],
      progressFinisher: fallback?.progressFinisher ?? 'uncertain',
      confidence: fallback?.confidence ?? {
        mechanicsVersion: MODEL_VERSIONS.mechanics,
        conditionProfileConfidence: 'assumed',
        policyCoverage: 'out-of-distribution',
      },
      policyVersion: result.policyVersion,
    }
  }

  function startPlannerRecommendation(): void {
    stopPlannerWorker()
    requestId += 1
    const currentRequestId = requestId
    plannerRecommendation.value = null
    plannerError.value = null
    plannerDurationMs.value = null
    plannerFallbackReason.value = null

    if (!configured.value || !conditionConfirmed.value || state.value.terminal !== 'none') {
      plannerStatus.value = 'idle'
      return
    }

    plannerStatus.value = 'analyzing'
    plannerStartedAtMs = performance.now()
    try {
      worker = new Worker(new URL('../workers/guidePlanner.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      plannerError.value = error instanceof Error
        ? `無法啟動強決策，已改用快速備援：${error.message}`
        : '無法啟動強決策，已改用快速備援。'
      plannerDurationMs.value = currentPlannerDuration()
      plannerFallbackReason.value = 'worker-start'
      plannerStatus.value = 'failed'
      worker = null
      return
    }
    worker.onmessage = (event: MessageEvent<{
      id: number
      result: GuideIntegratedRuntimeRecommendation | null
      error?: string
    }>) => {
      if (event.data.id !== currentRequestId || currentRequestId !== requestId) return
      if (watchdog !== null) clearTimeout(watchdog)
      watchdog = null
      if (event.data.error || event.data.result === null) {
        plannerError.value = event.data.error
          ? `強決策立即失敗，已改用快速備援：${event.data.error}`
          : '強決策沒有找到可用動作，已立即改用快速備援。'
        plannerDurationMs.value = currentPlannerDuration()
        plannerFallbackReason.value = 'worker-response-error'
        plannerStatus.value = 'failed'
      } else if (event.data.result.deadlineExceeded) {
        plannerError.value = `強決策用滿 ${WEB_GUIDE_PLANNER_TIMEOUT_MS} ms，已改用快速備援。`
        plannerDurationMs.value = event.data.result.elapsedMs
        plannerFallbackReason.value = 'planner-deadline'
        plannerStatus.value = 'timed-out'
      } else {
        plannerRecommendation.value = runtimeRecommendation(event.data.result)
        plannerDurationMs.value = event.data.result.elapsedMs
        plannerStatus.value = 'ready'
      }
      worker?.terminate()
      worker = null
    }
    worker.onerror = (event) => {
      if (currentRequestId !== requestId) return
      plannerError.value = event.message
        ? `強決策發生錯誤，已改用快速備援：${event.message}`
        : '強決策發生錯誤，已改用快速備援。'
      plannerDurationMs.value = currentPlannerDuration()
      plannerFallbackReason.value = 'worker-error'
      plannerStatus.value = 'failed'
      stopPlannerWorker()
    }
    worker.postMessage({
      id: currentRequestId,
      scenarioId: scenarioId.value,
      crafter: { ...crafter },
      state: { ...state.value, buffs: { ...state.value.buffs } },
      actualActionHistory: [...actualActionHistory.value],
    })
    watchdog = setTimeout(() => {
      if (currentRequestId !== requestId || plannerStatus.value !== 'analyzing') return
      plannerDurationMs.value = currentPlannerDuration()
      plannerStatus.value = 'timed-out'
      plannerFallbackReason.value = 'watchdog-timeout'
      plannerError.value = `強決策用滿 ${WEB_GUIDE_PLANNER_TIMEOUT_MS} ms，已改用快速備援。`
      stopPlannerWorker()
    }, WEB_GUIDE_PLANNER_TIMEOUT_MS)
  }

  watch(
    [configured, conditionConfirmed, state, actualActionHistory],
    startPlannerRecommendation,
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(stopPlannerWorker)

  function chooseCondition(condition: MaterialCondition): void {
    if (!configured.value || state.value.terminal !== 'none' || pendingAction.value !== null) return
    const resolvedCondition = actionCount.value === 0 ? 'normal' : condition
    const last = events.value.at(-1)
    const event: SessionEvent = { type: 'conditionSelected', id: createEventId(), at: Date.now(), condition: resolvedCondition }
    if (last?.type === 'conditionSelected') events.value.splice(-1, 1, event)
    else events.value.push(event)
  }

  function beginAction(action: CraftActionId): void {
    if (!configured.value || !conditionConfirmed.value || pendingAction.value !== null) return
    events.value.push({
      type: 'craftActionUsed',
      id: createEventId(),
      at: Date.now(),
      action,
      previousCondition: state.value.condition,
    })
  }

  function resolveAction(success: boolean, nextCondition: MaterialCondition): void {
    if (!configured.value || pendingAction.value === null) return
    const action = ACTIONS[pendingAction.value]
    events.value.push({
      type: 'craftActionResolved',
      id: createEventId(),
      at: Date.now(),
      success,
      nextCondition: action.noStep === true && action.rerollsCondition !== true
        ? state.value.condition
        : nextCondition,
    })
  }

  function completeAction(
    action: CraftActionId,
    success: boolean,
    nextCondition: MaterialCondition,
  ): void {
    if (!configured.value || !conditionConfirmed.value || pendingAction.value !== null) return
    const preview = previewAction(recipe.value, crafter, state.value, action)
    if (!preview.legal) return
    const definition = ACTIONS[action]
    const at = Date.now()
    events.value.push(
      {
        type: 'craftActionUsed',
        id: createEventId(),
        at,
        action,
        previousCondition: state.value.condition,
      },
      {
        type: 'craftActionResolved',
        id: createEventId(),
        at,
        success: preview.successRate === 1 ? true : success,
        nextCondition: definition.noStep === true && definition.rerollsCondition !== true
          ? state.value.condition
          : nextCondition,
      },
    )
  }

  function undo(): void {
    events.value = removeLastStep(events.value)
  }

  function resync(patch: Partial<CraftState>, reason: string): void {
    events.value.push({ type: 'stateResynced', id: createEventId(), at: Date.now(), patch, reason })
  }

  function selectScenario(nextScenarioId: CraftScenarioId): void {
    const nextScenario = craftScenarioById(nextScenarioId)
    if (nextScenario === null || nextScenario.scenarioId === scenarioId.value) return
    stopPlannerWorker()
    activeCraft.value = {
      scenarioId: nextScenario.scenarioId as CraftScenarioId,
      initialState: createInitialCraftState(nextScenario.recipe, crafter),
    }
    events.value = configured.value ? createCraftStartEvents() : []
  }

  function restart(nextCrafter: EquipmentProfile): void {
    Object.assign(crafter, DEFAULT_CRAFTER, nextCrafter)
    savedEquipment.value = equipmentFromCrafter(crafter)
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(savedEquipment.value))
    initialState.value = createInitialCraftState(recipe.value, crafter)
    events.value = createCraftStartEvents()
  }

  function exportSession(): void {
    const payload = createSessionExport(
      scenarioId.value,
      recipe.value,
      { ...crafter },
      initialState.value,
      events.value,
    )
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `frozen-rabbit-expert-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  watch([scenarioId, crafter, initialState, events], () => {
    if (!configured.value) return
    savedEquipment.value = equipmentFromCrafter(crafter)
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(savedEquipment.value))
    const savedSession: SavedSession = {
      scenarioId: scenarioId.value,
      crafter: { ...crafter },
      initialState: initialState.value,
      events: events.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSession))
  }, { deep: true })

  return {
    scenarios: CRAFT_SCENARIOS,
    scenarioId,
    scenario,
    recipe,
    objective,
    crafter,
    initialState,
    events,
    state,
    configured,
    savedEquipment,
    actionCount,
    pendingAction,
    conditionConfirmed,
    recommendation,
    fastRecommendation,
    plannerStatus,
    plannerError,
    plannerDurationMs,
    plannerFallbackReason,
    beginAction,
    resolveAction,
    completeAction,
    chooseCondition,
    selectScenario,
    undo,
    resync,
    restart,
    exportSession,
  }
}
