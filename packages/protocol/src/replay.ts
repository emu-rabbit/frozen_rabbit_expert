import {
  applyObservedOutcome,
  assertCraftState,
  type CraftActionId,
  type CraftState,
  type CrafterProfile,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { SessionEvent } from './events'

export interface ReplayResult {
  state: CraftState
  pendingAction: CraftActionId | null
  appliedEvents: number
}

function mergeResync(state: CraftState, patch: Partial<CraftState>): CraftState {
  return {
    ...state,
    ...patch,
    buffs: patch.buffs ? { ...state.buffs, ...patch.buffs } : state.buffs,
  }
}

export function replaySession(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  initialState: CraftState,
  events: SessionEvent[],
): ReplayResult {
  let state: CraftState = {
    ...initialState,
    buffs: { ...initialState.buffs },
  }
  let pendingAction: CraftActionId | null = null

  for (const event of events) {
    if (event.type === 'craftStarted') continue

    if (event.type === 'conditionSelected') {
      if (pendingAction !== null) throw new Error('Cannot select a condition while an action is unresolved')
      state = { ...state, condition: event.condition }
      assertCraftState(recipe, crafter, state)
      continue
    }

    if (event.type === 'craftActionUsed') {
      if (pendingAction !== null) throw new Error('An action is already awaiting resolution')
      if (event.previousCondition !== state.condition) throw new Error('Action condition does not match replay state')
      pendingAction = event.action
      continue
    }

    if (event.type === 'craftActionResolved') {
      if (pendingAction === null) throw new Error('Resolved event has no matching action')
      state = applyObservedOutcome(recipe, crafter, state, pendingAction, event).nextState
      assertCraftState(recipe, crafter, state)
      pendingAction = null
      continue
    }

    if (event.type === 'stateResynced') {
      if (pendingAction !== null) throw new Error('Cannot resync while an action is unresolved')
      state = mergeResync(state, event.patch)
      assertCraftState(recipe, crafter, state)
    }
  }

  return { state, pendingAction, appliedEvents: events.length }
}

export function removeLastStep(events: SessionEvent[]): SessionEvent[] {
  if (events.length === 0) return []
  const next = events.slice()
  while (next.at(-1)?.type === 'conditionSelected') next.pop()
  const last = next.at(-1)
  if (last?.type === 'stateResynced' || last?.type === 'craftStarted') {
    next.pop()
    return next
  }
  if (last?.type === 'craftActionResolved') next.pop()
  if (next.at(-1)?.type === 'craftActionUsed') next.pop()
  return next
}
