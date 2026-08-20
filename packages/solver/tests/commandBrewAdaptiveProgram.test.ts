import { describe, expect, it } from 'vitest'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  craftScenarioModelContentHash,
  createInitialCraftState,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  assertCraftAdaptivePolicyProgramV1,
  createCraftAdaptivePolicyControllerV1,
} from '../src'

const scenarioId = 'survey-craftsmans-command-brew'

const exactMinimumFullQualityCrafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5_350,
  control: 5_215,
  maxCp: 748,
  cosmicToolGoodBonus: true,
  specialist: false,
}

function firstAction(crafter: Readonly<CrafterProfile>) {
  const context = {
    scenarioId,
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    crafter,
  }
  return createCraftAdaptivePolicyControllerV1(
    context,
    COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  ).decide(createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter))
}

function expectEntryClosed(crafter: Readonly<CrafterProfile>): void {
  expect(firstAction(crafter)).toMatchObject({
    action: null,
    status: 'terminated',
    terminationReason: 'program:capability-routing-failed',
  })
}

function decideState(
  crafter: Readonly<CrafterProfile>,
  state: ReturnType<typeof createInitialCraftState>,
) {
  return createCraftAdaptivePolicyControllerV1({
    scenarioId,
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    crafter,
  }, COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM).decide(state)
}

describe('Command Brew conservative adaptive program artifact', () => {
  it('is self-hashed data bound to the exact recipe and objective, not equipment ids', () => {
    expect(() => assertCraftAdaptivePolicyProgramV1(COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM))
      .not.toThrow()
    expect(COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM.scenarioModelContentHash).toBe(
      craftScenarioModelContentHash(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      ),
    )
    const serialized = JSON.stringify(COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM)
    expect(JSON.parse(serialized)).toEqual(COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM)
    expect(serialized).not.toContain('player-')
    expect(serialized).not.toContain('equipment')
  })

  it('routes on observable capability values and preview gains', () => {
    const [unbuffed, food, specialist] = PLAYER_EQUIPMENT_PROFILES
    expect(firstAction(unbuffed!.crafter)).toMatchObject({
      action: 'muscleMemory',
      nodeId: 'open-muscle-memory',
    })
    expect(firstAction(food!.crafter)).toMatchObject({
      action: 'reflect',
      nodeId: 'full-quality-reflect',
    })
    expect(firstAction(specialist!.crafter)).toMatchObject({
      action: 'reflect',
      nodeId: 'full-quality-reflect',
    })

    expect(firstAction(exactMinimumFullQualityCrafter)).toMatchObject({
      action: 'reflect',
      nodeId: 'full-quality-reflect',
    })

    expect(firstAction({
      ...exactMinimumFullQualityCrafter,
      craftsmanship: 5_500,
      control: 5_350,
      maxCp: 780,
    })).toMatchObject({
      action: 'reflect',
      nodeId: 'full-quality-reflect',
    })

    expectEntryClosed({ ...exactMinimumFullQualityCrafter, maxCp: 747 })
    expectEntryClosed({ ...exactMinimumFullQualityCrafter, control: 5_214 })
    expectEntryClosed({ ...exactMinimumFullQualityCrafter, craftsmanship: 5_349 })
    expectEntryClosed({ ...exactMinimumFullQualityCrafter, maxCp: 781 })
    expectEntryClosed({ ...exactMinimumFullQualityCrafter, control: 5_351 })
    expectEntryClosed({ ...exactMinimumFullQualityCrafter, craftsmanship: 5_501 })
  })

  it('fails closed before the first action outside the proven fallback envelope', () => {
    const unbuffed = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    for (const maxCp of [100, 580, 600, 620, 629]) {
      expectEntryClosed({ ...unbuffed, maxCp })
    }
    expect(firstAction(unbuffed)).toMatchObject({
      action: 'muscleMemory',
      status: 'active',
    })
  })

  it('does not route a non-fresh state into a fresh-state certificate', () => {
    const crafter = exactMinimumFullQualityCrafter
    const initial = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const afterFinalAppraisal = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      initial,
      'finalAppraisal',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const controller = createCraftAdaptivePolicyControllerV1({
      scenarioId,
      recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
      objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      crafter,
    }, COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM)

    expect(controller.decide(afterFinalAppraisal)).toMatchObject({
      action: null,
      status: 'terminated',
      terminationReason: 'program:capability-routing-failed',
    })
  })

  it('rejects specialist states that already spent a no-step resource', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[2]!.crafter
    const initial = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const afterObservation = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      initial,
      'carefulObservation',
      { success: true, nextCondition: 'normal' },
    ).nextState
    const afterHeartAndSoul = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      initial,
      'heartAndSoul',
      { success: true, nextCondition: 'normal' },
    ).nextState

    for (const state of [
      afterObservation,
      afterHeartAndSoul,
      { ...initial, quickInnovationAvailable: false },
    ]) {
      expect(decideState(crafter, state)).toMatchObject({
        action: null,
        status: 'terminated',
        terminationReason: 'program:capability-routing-failed',
      })
    }
  })

  it('marks only the explicit safe-finish decisions as allowed to complete below objective', () => {
    const optedIn = COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM.nodes.flatMap((node) => (
      node.decisions
        .filter((decision) => decision.allowBelowObjectiveCompletion === true)
        .map((decision) => ({ nodeId: node.id, decisionId: decision.id }))
    ))

    expect(optedIn).toEqual([
      { nodeId: 'safe-finish', decisionId: 'complete-with-basic-synthesis' },
      { nodeId: 'safe-finish', decisionId: 'complete-with-careful-synthesis' },
      { nodeId: 'safe-finish', decisionId: 'complete-with-groundwork' },
    ])
    expect(COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM.nodes.some((node) => (
      node.transitions.some((transition) => transition.id === 'protect-current-malleable-finish')
    ))).toBe(true)
  })
})
