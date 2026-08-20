import { describe, expect, it } from 'vitest'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CrafterProfile,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  COMMAND_BREW_CONSERVATIVE_ROUTE,
  COMMAND_BREW_FULL_QUALITY_ROUTE,
  craftAdaptivePolicyStateContentHashV1,
  createCraftAdaptivePolicyControllerV1,
} from '@frozen-rabbit-expert/solver'
import {
  runEpisode,
  type EpisodeRandomStream,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { createAdaptivePolicyEpisodeAdapterV1 } from '../src/adaptivePolicyEpisodeAdapter'

const scenarioId = 'survey-craftsmans-command-brew'
const allNormal: WeightedConditionProfile = {
  id: 'test-all-normal-command-brew',
  weights: { normal: 1 },
  evidence: 'assumption',
}

const exactMinimumFullQualityCrafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5_350,
  control: 5_215,
  maxCp: 748,
  cosmicToolGoodBonus: true,
  specialist: false,
}

function zeroRandom(): EpisodeRandomStream {
  return {
    nextCondition: () => 0,
    nextSuccess: () => 0,
  }
}

function context(crafter: Readonly<CrafterProfile>) {
  return {
    scenarioId,
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    crafter,
  }
}

function runWithConditionProfile(
  crafter: Readonly<CrafterProfile>,
  conditionProfile: Readonly<WeightedConditionProfile>,
) {
  const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const adapter = createAdaptivePolicyEpisodeAdapterV1(
    context(crafter),
    COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
    initialState,
  )
  if (adapter.firstAction === null) throw new Error('command brew program did not provide a first action')
  const result = runEpisode({
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    crafter,
    initialState,
    firstAction: adapter.firstAction,
    policy: adapter.policy,
    random: zeroRandom(),
    conditionProfile,
    maxSteps: 40,
  })
  const finalMemory = adapter.observeFinalState(result.finalState)
  if (finalMemory.totalActionUses !== result.actions.length) {
    throw new Error('adaptive adapter did not observe the final simulator action')
  }
  return result
}

function runAllNormal(crafter: Readonly<CrafterProfile>) {
  return runWithConditionProfile(crafter, allNormal)
}

describe('adaptive policy episode adapter', () => {
  it('runs the data-only Command Brew program closed-loop for all actual crafter panels', () => {
    const results = PLAYER_EQUIPMENT_PROFILES.map(({ id, crafter }) => ({ id, result: runAllNormal(crafter) }))

    expect(results.map(({ id, result }) => ({
      id,
      terminal: result.terminal,
      quality: result.finalState.quality,
      actions: result.actions.length,
      stopReason: result.stopReason,
    }))).toEqual([
      {
        id: 'player-unbuffed-cosmic-tool-v1',
        terminal: 'completed',
        quality: 6_839,
        actions: 24,
        stopReason: 'completed',
      },
      {
        id: 'player-food-medicine-cosmic-tool-v1',
        terminal: 'completed',
        quality: 12_000,
        actions: 26,
        stopReason: 'completed',
      },
      {
        id: 'player-food-medicine-specialist-cosmic-tool-v1',
        terminal: 'completed',
        quality: 12_000,
        actions: 26,
        stopReason: 'completed',
      },
    ])
    expect(results[0]!.result.actions).toEqual([
      ...COMMAND_BREW_CONSERVATIVE_ROUTE,
      'basicSynthesis',
    ])
    expect(results[1]!.result.actions).toEqual([
      ...COMMAND_BREW_FULL_QUALITY_ROUTE,
      'basicSynthesis',
    ])
  })

  it('uses preview guards to prevent early Malleable positions from ending below objective', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    let protectedRuns = 0
    for (const malleableAfter of Array.from({ length: 12 }, (_, index) => index)) {
      const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
      const controller = createCraftAdaptivePolicyControllerV1(
        context(crafter),
        COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
      )
      let state: CraftState = initialState
      const actions: string[] = []

      for (let actionIndex = 0; actionIndex < 40 && state.terminal === 'none'; actionIndex += 1) {
        const decision = controller.decide(state)
        expect(
          decision.action,
          JSON.stringify({ malleableAfter, decision, state, actions }),
        ).not.toBeNull()
        const action = decision.action!
        const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action)
        expect(preview.legal).toBe(true)
        expect(preview.successRate).toBe(1)
        const before = state
        state = applyObservedOutcome(
          SURVEY_CRAFTSMANS_COMMAND_BREW,
          crafter,
          before,
          action,
          { success: true, nextCondition: actionIndex === malleableAfter ? 'malleable' : 'normal' },
        ).nextState
        actions.push(action)
        controller.advance({ before, action, success: true, after: state })
        if (state.terminal === 'completed' && state.quality < 12_000) {
          expect(decision.nodeId).toBe('safe-finish')
        }
      }

      expect(state.terminal, `malleable after ${malleableAfter}`).toBe('completed')
      expect(state.quality, `malleable after ${malleableAfter}`).toBeGreaterThanOrEqual(6_000)
      expect(
        ['basicSynthesis', 'carefulSynthesis', 'groundwork'],
        `malleable after ${malleableAfter}`,
      ).toContain(actions.at(-1))
      if (actions.includes('finalAppraisal')) protectedRuns += 1
    }
    expect(protectedRuns).toBeGreaterThan(0)
  })

  it('takes the single proven Good opportunity and then rejoins the conservative route', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const controller = createCraftAdaptivePolicyControllerV1(
      context(crafter),
      COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
    )
    let state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const actions: string[] = []
    const decisionIds: Array<string | null> = []

    for (let actionIndex = 0; actionIndex < 40 && state.terminal === 'none'; actionIndex += 1) {
      const decision = controller.decide(state)
      expect(decision.action).not.toBeNull()
      const before = state
      state = applyObservedOutcome(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        before,
        decision.action!,
        { success: true, nextCondition: actionIndex === 6 ? 'good' : 'normal' },
      ).nextState
      actions.push(decision.action!)
      decisionIds.push(decision.decisionId)
      controller.advance({ before, action: decision.action!, success: true, after: state })
    }

    expect(state).toMatchObject({ terminal: 'completed', quality: 7_887 })
    expect(actions.filter((action) => action === 'preciseTouch')).toHaveLength(1)
    expect(decisionIds).toContain('use-single-good-precise-touch')
    expect(actions).toHaveLength(24)
  })

  it('keeps the two proven Good opportunities independently bounded on the exact unbuffed route', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const controller = createCraftAdaptivePolicyControllerV1(
      context(crafter),
      COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
    )
    let state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const decisions: string[] = []

    for (let actionIndex = 0; actionIndex < 40 && state.terminal === 'none'; actionIndex += 1) {
      const decision = controller.decide(state)
      expect(decision.action).not.toBeNull()
      if (decision.decisionId !== null) decisions.push(decision.decisionId)
      const before = state
      state = applyObservedOutcome(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        before,
        decision.action!,
        { success: true, nextCondition: 'good' },
      ).nextState
      controller.advance({ before, action: decision.action!, success: true, after: state })
    }

    expect(state.terminal).toBe('completed')
    expect(state.quality).toBeGreaterThanOrEqual(7_985)
    expect(decisions.filter((id) => id === 'use-single-good-precise-touch')).toHaveLength(1)
    expect(decisions.filter((id) => id === 'use-second-good-precise-touch')).toHaveLength(1)
  })

  it.each([
    { id: 'all-normal', condition: 'normal' as const },
    { id: 'all-good', condition: 'good' as const },
    { id: 'all-malleable', condition: 'malleable' as const },
  ])('keeps the exact-minimum full-quality corner safe under $id', ({ id, condition }) => {
    const result = runWithConditionProfile(exactMinimumFullQualityCrafter, {
      id: `test-command-brew-${id}`,
      weights: { [condition]: 1 },
      evidence: 'assumption',
    })

    expect(result).toMatchObject({
      terminal: 'completed',
      stopReason: 'completed',
      finalState: { quality: 12_000 },
    })
    expect(result.actions.length).toBeLessThanOrEqual(26)
  })

  it('binds the adapter to the exact recipe and crafter values', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const adapter = createAdaptivePolicyEpisodeAdapterV1(
      context(crafter),
      COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
      initialState,
    )
    const firstAction = adapter.firstAction!
    const after = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      initialState,
      firstAction,
      { success: true, nextCondition: 'normal' },
    ).nextState

    expect(() => adapter.policy(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      { ...crafter, control: crafter.control + 1 },
      after,
    )).toThrow('different recipe or crafter context')
  })

  it('observes the last action exactly once when runEpisode stops at its action limit', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const adapter = createAdaptivePolicyEpisodeAdapterV1(
      context(crafter),
      COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
      initialState,
    )
    const result = runEpisode({
      recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      initialState,
      firstAction: adapter.firstAction!,
      policy: adapter.policy,
      random: zeroRandom(),
      conditionProfile: allNormal,
      maxSteps: 1,
    })

    expect(result).toMatchObject({ terminal: 'none', stopReason: 'action-limit' })
    expect(adapter.hasPendingObservation()).toBe(true)
    expect(adapter.controller.snapshot().totalActionUses).toBe(0)

    const finalized = adapter.observeFinalState(result.finalState)
    expect(finalized).toMatchObject({
      totalActionUses: 1,
      totalObservedTransitions: 1,
      terminated: false,
      lastObservedStateHash: craftAdaptivePolicyStateContentHashV1(result.finalState),
    })
    expect(adapter.controller.snapshot()).toEqual(finalized)
    expect(adapter.hasPendingObservation()).toBe(false)
    expect(() => adapter.observeFinalState(result.finalState)).toThrow('no pending action')
  })

  it('detaches pending state/context and compares callback context canonically', () => {
    const originalCrafter: CrafterProfile = { ...PLAYER_EQUIPMENT_PROFILES[0]!.crafter }
    const boundCrafter: CrafterProfile = { ...originalCrafter }
    const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, originalCrafter)
    const pristineInitial = structuredClone(initialState)
    const adapter = createAdaptivePolicyEpisodeAdapterV1(
      context(originalCrafter),
      COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
      initialState,
    )
    const firstAction = adapter.firstAction!

    originalCrafter.control = 1
    initialState.progress = 999
    const after = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      boundCrafter,
      pristineInitial,
      firstAction,
      { success: true, nextCondition: 'normal' },
    ).nextState
    const { profileId, ...recipeRest } = SURVEY_CRAFTSMANS_COMMAND_BREW
    const reorderedRecipe = { ...recipeRest, profileId }
    const { maxCp, ...crafterRest } = boundCrafter
    const reorderedCrafter = { maxCp, ...crafterRest }

    expect(() => adapter.policy(reorderedRecipe, reorderedCrafter, after)).not.toThrow()
    expect(adapter.controller.snapshot()).toMatchObject({
      totalActionUses: 1,
      lastAction: firstAction,
    })
  })
})
