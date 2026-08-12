import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  type CrafterProfile,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  ROUTE_OPTION_IDS,
  createVideoInformedMainlineController,
  createVideoInformedMainlineControllerFactory,
  type ObservedOptionTransition,
  type PlannerContext,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

const context: PlannerContext = {
  recipe: COSMIC_TITANIUM_INGOT,
  crafter,
}

function observedTransition(
  before: CraftState,
  action: ObservedOptionTransition['action'],
  success = true,
): ObservedOptionTransition {
  const after = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, before, action, {
    success,
    nextCondition: 'normal',
  }).nextState
  return { before, action, success, after }
}

describe('video-informed route option controller', () => {
  it('keeps the active option committed between explicit termination boundaries', () => {
    expect(ROUTE_OPTION_IDS).toEqual([
      'progress-window',
      'inner-quiet-build',
      'quality-cycle',
      'quality-burst',
      'safe-finish',
      'resource-recovery',
      'bounded-condition-fishing',
    ])

    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const controller = createVideoInformedMainlineController(context, initial)
    const opening = controller.decide(initial)
    expect(opening.optionId).toBe('progress-window')
    expect(opening.action).toBe('muscleMemory')

    const transition = observedTransition(initial, opening.action!)
    controller.advance(transition)
    const conditionOpportunity = { ...transition.after, condition: 'good' as const }
    const next = controller.decide(conditionOpportunity)
    expect(next.optionId).toBe('progress-window')
    expect(controller.snapshot().activeOption.optionId).toBe('progress-window')
  })

  it('enters resource recovery and resumes the interrupted option', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const depleted: CraftState = {
      ...initial,
      step: 14,
      progress: 6200,
      quality: 5000,
      durability: 10,
      cp: 400,
      innerQuiet: 5,
      trainedPerfectionAvailable: false,
    }
    const controller = createVideoInformedMainlineController(context, depleted, {
      initialOptionId: 'inner-quiet-build',
    })

    const recovery = controller.decide(depleted)
    expect(recovery.optionId).toBe('resource-recovery')
    expect(recovery.action).toBe('mastersMend')
    expect(recovery.memory.activeOption.resumeOptionId).toBe('inner-quiet-build')

    const transition = observedTransition(depleted, recovery.action!)
    controller.advance(transition)
    expect(controller.snapshot().activeOption.optionId).toBe('inner-quiet-build')
    expect(controller.snapshot().activeOption.resumeOptionId).toBeNull()
  })

  it('continues at durability 6 when Sturdy and Manipulation make a touch survivable', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const mitigated: CraftState = {
      ...initial,
      step: 14,
      progress: 6200,
      quality: 5000,
      durability: 6,
      cp: 400,
      condition: 'sturdy',
      innerQuiet: 5,
      buffs: { ...initial.buffs, manipulation: 4 },
      trainedPerfectionAvailable: false,
    }
    const controller = createVideoInformedMainlineController(context, mitigated, {
      initialOptionId: 'inner-quiet-build',
    })

    const decision = controller.decide(mitigated)
    const actions = decision.candidates.map((candidate) => candidate.action)
    expect(decision.optionId).toBe('inner-quiet-build')
    expect(decision.action).not.toBe('mastersMend')
    expect(actions).toContain('hastyTouch')

    const continued = observedTransition(mitigated, 'hastyTouch')
    expect(continued.after.terminal).toBe('none')
    expect(continued.after.durability).toBe(6)
  })

  it('does not force repair at durability 10 with Waste Not and Manipulation active', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const protectedState: CraftState = {
      ...initial,
      step: 16,
      progress: 6200,
      quality: 5000,
      durability: 10,
      cp: 400,
      innerQuiet: 5,
      buffs: { ...initial.buffs, wasteNot: 5, manipulation: 4 },
      trainedPerfectionAvailable: false,
    }
    const controller = createVideoInformedMainlineController(context, protectedState, {
      initialOptionId: 'inner-quiet-build',
    })

    const decision = controller.decide(protectedState)
    expect(decision.optionId).toBe('inner-quiet-build')
    expect(decision.action).not.toBe('mastersMend')
    expect(decision.candidates.map((candidate) => candidate.action)).toContain('hastyTouch')

    const continued = observedTransition(protectedState, 'hastyTouch')
    expect(continued.after.terminal).toBe('none')
    expect(continued.after.durability).toBe(10)

    const zeroCostTick = observedTransition(protectedState, 'innovation')
    expect(zeroCostTick.after.terminal).toBe('none')
    expect(zeroCostTick.after.durability).toBe(15)
  })

  it('exposes the guide-supported foundation, progress, and quality route choices', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const foundation = createVideoInformedMainlineController(context, initial).decide(initial)
    expect(foundation.candidates.map((candidate) => candidate.action)).toEqual(expect.arrayContaining([
      'reflect',
      'manipulation',
      'wasteNot2',
      'delicateSynthesis',
    ]))

    const qualityState: CraftState = {
      ...initial,
      step: 14,
      progress: 6200,
      quality: 5000,
      durability: 30,
      cp: 400,
      innerQuiet: 5,
      buffs: { ...initial.buffs, expedience: 1 },
    }
    const quality = createVideoInformedMainlineController(context, qualityState, {
      initialOptionId: 'inner-quiet-build',
    }).decide(qualityState)
    expect(quality.candidates.map((candidate) => candidate.action)).toEqual(expect.arrayContaining([
      'manipulation',
      'wasteNot2',
      'innovation',
      'delicateSynthesis',
      'hastyTouch',
      'daringTouch',
    ]))
  })

  it('creates isolated serializable memory for every controller instance', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const createController = createVideoInformedMainlineControllerFactory(context)
    const first = createController(initial)
    const second = createController(initial)

    const opening = first.decide(initial)
    first.advance(observedTransition(initial, opening.action!))

    expect(first.snapshot().totalObservedTransitions).toBe(1)
    expect(second.snapshot().totalObservedTransitions).toBe(0)
    expect(second.snapshot().activeOption.actionsUsed).toBe(0)
    expect(JSON.parse(JSON.stringify(first.snapshot()))).toEqual(first.snapshot())
  })

  it('bounds condition fishing and resumes the quality burst option', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const burst: CraftState = {
      ...initial,
      step: 24,
      progress: 6200,
      quality: 11000,
      durability: 30,
      cp: 160,
      innerQuiet: 10,
      buffs: { ...initial.buffs, greatStrides: 3, innovation: 3 },
    }
    const controller = createVideoInformedMainlineController(context, burst, {
      initialOptionId: 'quality-burst',
      fishingRolls: 2,
    })

    const fishing = controller.decide(burst)
    expect(fishing.optionId).toBe('bounded-condition-fishing')
    expect(fishing.action).toBe('observe')
    expect(fishing.memory.activeOption.resumeOptionId).toBe('quality-burst')

    const observed = observedTransition(burst, 'observe')
    controller.advance({ ...observed, after: { ...observed.after, condition: 'good' } })
    expect(controller.snapshot().activeOption.optionId).toBe('quality-burst')
    expect(controller.snapshot().fishingUsed).toBe(true)
  })

  it('terminates an option when its observed-action budget is exhausted', () => {
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const controller = createVideoInformedMainlineController(context, initial, {
      actionBudgets: { 'progress-window': 1 },
    })
    const opening = controller.decide(initial)
    const transition = observedTransition(initial, opening.action!)
    const memory = controller.advance(transition)

    expect(memory.terminated).toBe(true)
    expect(memory.terminationReason).toBe('action-budget-exhausted')
    expect(controller.decide(transition.after).action).toBeNull()
  })
})
