import { describe, expect, it } from 'vitest'
import {
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
  playerEquipmentProfileById,
} from '@frozen-rabbit-expert/data'
import {
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  createManualSession,
  formatManualSession,
  manualSessionView,
  replayManualSession,
  stepManualSession,
  type ManualCraftSession,
} from '../src'

const EQUIPMENT_ID = 'player-food-medicine-cosmic-tool-v1'

function newSession(seed = 12_345, maxActions = 80): ManualCraftSession {
  const equipment = playerEquipmentProfileById(EQUIPMENT_ID)
  if (equipment === null) throw new Error('missing test equipment')
  return createManualSession({
    scenarioId: 'mobile-work-stairs',
    recipe: MOBILE_WORK_STAIRS,
    objectiveId: MOBILE_WORK_STAIRS_OBJECTIVE.objectiveId,
    qualityMaximum: MOBILE_WORK_STAIRS.qualityMax,
    crafterProfileId: equipment.id,
    crafter: equipment.crafter,
    conditionProfile: BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
    seed,
    maxActions,
  })
}

describe('manual craft session', () => {
  it('shows only the currently observable state and legal actions', () => {
    const session = newSession()
    const view = manualSessionView(session)
    const formatted = formatManualSession(session)

    expect(view.actionCount).toBe(0)
    expect(view.state.condition).toBe('normal')
    expect(view.state.progress).toBe(0)
    expect(view.legalActions.some(({ id }) => id === 'muscleMemory')).toBe(true)
    expect(formatted).toContain('actions=0/80')
    expect(formatted).toContain('condition=normal')
    expect(formatted).not.toContain('seed=')
    expect(formatted).not.toContain('nextCondition')
    expect(formatted).not.toContain('recommend')
  })

  it('advances exactly one caller-selected action with deterministic hidden streams', () => {
    const first = stepManualSession(newSession(), 'muscleMemory')
    const same = stepManualSession(newSession(), 'muscleMemory')
    const firstReplay = replayManualSession(first)

    expect(first.actions).toEqual(['muscleMemory'])
    expect(firstReplay).toEqual(replayManualSession(same))
    expect(firstReplay.steps).toHaveLength(1)
    expect(firstReplay.steps[0]?.action).toBe('muscleMemory')
    expect(firstReplay.steps[0]?.success).toBe(true)
    expect(firstReplay.state.condition).toBe('malleable')
  })

  it('fixes non-guaranteed outcomes by seed without exposing the next draw', () => {
    const outcomes = Array.from({ length: 24 }, (_, seed) => {
      const stepped = stepManualSession(newSession(seed), 'rapidSynthesis')
      return replayManualSession(stepped).steps[0]?.success
    })

    expect(new Set(outcomes)).toEqual(new Set([true, false]))
    const repeated = stepManualSession(newSession(5), 'rapidSynthesis')
    expect(replayManualSession(repeated)).toEqual(
      replayManualSession(stepManualSession(newSession(5), 'rapidSynthesis')),
    )
    expect(formatManualSession(repeated)).toContain('outcomeStream=fixed-hidden')
  })

  it('round-trips through JSON and resumes from the same stream position', () => {
    const once = stepManualSession(newSession(77), 'reflect')
    const restored = JSON.parse(JSON.stringify(once)) as ManualCraftSession
    const continued = stepManualSession(restored, 'innovation')
    const direct = stepManualSession(once, 'innovation')

    expect(replayManualSession(continued)).toEqual(replayManualSession(direct))
    expect(continued.actions).toEqual(['reflect', 'innovation'])
  })

  it('rejects illegal or unknown actions without selecting a fallback', () => {
    const session = newSession()

    expect(() => stepManualSession(session, 'intensiveSynthesis')).toThrow(/Illegal action/)
    expect(() => stepManualSession(session, 'notAnAction' as never)).toThrow(/Unknown action/)
    expect(session.actions).toEqual([])
  })

  it('reports action-limit as a terminal tool outcome', () => {
    const limited = stepManualSession(newSession(123, 1), 'observe')
    const view = manualSessionView(limited)

    expect(view.terminal).toBe('action-limit')
    expect(view.legalActions).toEqual([])
    expect(formatManualSession(limited)).toContain('result: action-limit')
    expect(() => stepManualSession(limited, 'observe')).toThrow(/action limit/)
  })

  it('rejects tampered seeds and unsupported transition conditions on replay', () => {
    const invalidSeed = { ...newSession(), seed: 2 ** 32 }
    const invalidTransition = {
      ...newSession(),
      conditionProfile: {
        ...newSession().conditionProfile,
        transitionWeights: {
          centered: { normal: 1 },
        },
      },
    } as ManualCraftSession

    expect(() => replayManualSession(invalidSeed)).toThrow('unsigned 32-bit integer')
    expect(() => replayManualSession(invalidTransition)).toThrow('unsupported previous condition')
  })
})
