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
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
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

const STORAGE_KEY = 'frozen-rabbit-expert/session-v0.6.0'
const EQUIPMENT_STORAGE_KEY = 'frozen-rabbit-expert/equipment-v1'

type EquipmentProfile = Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus'>

interface SavedSession {
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
}

function isValidEquipment(value: Partial<EquipmentProfile>): value is EquipmentProfile {
  return Number.isFinite(value.craftsmanship) && (value.craftsmanship ?? 0) > 0
    && Number.isFinite(value.control) && (value.control ?? 0) > 0
    && Number.isFinite(value.maxCp) && (value.maxCp ?? 0) > 0
    && typeof value.cosmicToolGoodBonus === 'boolean'
}

function loadSavedEquipment(): EquipmentProfile | null {
  try {
    const raw = localStorage.getItem(EQUIPMENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EquipmentProfile>
    return isValidEquipment(parsed) ? parsed : null
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
  }
}

function newStartEvent(): SessionEvent {
  return { type: 'craftStarted', id: createEventId(), at: Date.now() }
}

function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedSession
    if (!parsed.crafter || !parsed.initialState || !Array.isArray(parsed.events)) return null
    if (parsed.crafter.craftsmanship <= 0 || parsed.crafter.control <= 0 || parsed.crafter.maxCp <= 0) return null
    replaySession(COSMIC_TITANIUM_INGOT, parsed.crafter, parsed.initialState, parsed.events)
    return parsed
  } catch {
    return null
  }
}

export function useCraftSession() {
  const saved = loadSavedSession()
  const savedEquipment = ref<EquipmentProfile | null>(loadSavedEquipment() ?? (saved ? equipmentFromCrafter(saved.crafter) : null))
  const crafter = reactive<CrafterProfile>(saved?.crafter ?? { ...DEFAULT_CRAFTER })
  const configured = computed(() => crafter.craftsmanship > 0 && crafter.control > 0 && crafter.maxCp > 0)
  const initialState = ref<CraftState>(saved?.initialState ?? createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter))
  const events = ref<SessionEvent[]>(saved?.events ?? [])

  const replay = computed(() => configured.value
    ? replaySession(COSMIC_TITANIUM_INGOT, crafter, initialState.value, events.value)
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
    ? recommendAction(COSMIC_TITANIUM_INGOT, crafter, state.value, { mechanicsVersion: MODEL_VERSIONS.mechanics })
    : null)
  const actualActionHistory = computed(() => events.value
    .filter((event): event is Extract<SessionEvent, { type: 'craftActionUsed' }> => event.type === 'craftActionUsed')
    .map((event) => event.action))
  const plannerRecommendation = shallowRef<Recommendation | null>(null)
  const plannerStatus = ref<'idle' | 'analyzing' | 'ready' | 'timed-out' | 'failed'>('idle')
  const plannerError = ref<string | null>(null)
  const plannerDurationMs = ref<number | null>(null)
  const recommendation = computed(() => {
    if (plannerStatus.value === 'analyzing') return null
    return plannerRecommendation.value ?? fastRecommendation.value
  })
  let worker: Worker | null = null
  let requestId = 0
  let watchdog: ReturnType<typeof setTimeout> | null = null

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

    if (!configured.value || !conditionConfirmed.value || state.value.terminal !== 'none') {
      plannerStatus.value = 'idle'
      return
    }

    plannerStatus.value = 'analyzing'
    try {
      worker = new Worker(new URL('../workers/guidePlanner.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      plannerError.value = error instanceof Error
        ? `無法啟動強決策，已改用快速備援：${error.message}`
        : '無法啟動強決策，已改用快速備援。'
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
        plannerError.value = '強決策未能完成，已改用快速備援。'
        plannerStatus.value = 'failed'
      } else if (event.data.result.deadlineExceeded) {
        plannerError.value = '強決策超過 3 秒，已改用快速備援。'
        plannerDurationMs.value = event.data.result.elapsedMs
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
      plannerStatus.value = 'failed'
      stopPlannerWorker()
    }
    worker.postMessage({
      id: currentRequestId,
      recipe: COSMIC_TITANIUM_INGOT,
      crafter: { ...crafter },
      state: { ...state.value, buffs: { ...state.value.buffs } },
      actualActionHistory: [...actualActionHistory.value],
    })
    watchdog = setTimeout(() => {
      if (currentRequestId !== requestId || plannerStatus.value !== 'analyzing') return
      plannerStatus.value = 'timed-out'
      plannerError.value = '強決策超過 3 秒，已改用快速備援。'
      stopPlannerWorker()
    }, 3_000)
  }

  watch(
    [configured, conditionConfirmed, state, actualActionHistory],
    startPlannerRecommendation,
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(stopPlannerWorker)

  function chooseCondition(condition: MaterialCondition): void {
    if (!configured.value || state.value.terminal !== 'none' || pendingAction.value !== null) return
    const last = events.value.at(-1)
    const event: SessionEvent = { type: 'conditionSelected', id: createEventId(), at: Date.now(), condition }
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
    const preview = previewAction(COSMIC_TITANIUM_INGOT, crafter, state.value, action)
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

  function restart(nextCrafter: EquipmentProfile): void {
    Object.assign(crafter, DEFAULT_CRAFTER, nextCrafter)
    savedEquipment.value = equipmentFromCrafter(crafter)
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(savedEquipment.value))
    initialState.value = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    events.value = [newStartEvent()]
  }

  function exportSession(): void {
    const payload = createSessionExport(COSMIC_TITANIUM_INGOT, { ...crafter }, initialState.value, events.value)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `frozen-rabbit-expert-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  watch([crafter, initialState, events], () => {
    if (!configured.value) return
    savedEquipment.value = equipmentFromCrafter(crafter)
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(savedEquipment.value))
    const savedSession: SavedSession = {
      crafter: { ...crafter },
      initialState: initialState.value,
      events: events.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSession))
  }, { deep: true })

  return {
    recipe: COSMIC_TITANIUM_INGOT,
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
    beginAction,
    resolveAction,
    completeAction,
    chooseCondition,
    undo,
    resync,
    restart,
    exportSession,
  }
}
