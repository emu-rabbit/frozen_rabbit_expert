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
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  drawSimulatedActionOutcome,
  runEpisodeTrace,
  type EpisodeStopReason,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  advanceGuideIntegratedDecisionMemory,
  createGuideIntegratedDecisionMemory,
  createGuideIntegratedPolicyController,
  createGuideIntegratedPolicyFactory,
} from '@frozen-rabbit-expert/solver'
import {
  COMMAND_BREW_DEVELOPMENT_CORPUS,
  corpusSeeds,
} from '../src/evaluationCorpora'
import {
  COMMAND_BREW_DEVELOPMENT_RISK_AUDIT_BUDGET_V1,
  createCommandBrewGuideExtractedOptionController,
  type CommandBrewGuideExtractedOptionId,
  type SerializableCommandBrewGuideExtractedOptionMemory,
} from '../src/commandBrewAggressiveOptions'

const recipe = SURVEY_CRAFTSMANS_COMMAND_BREW
const objective = SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE
const developmentSeeds = corpusSeeds(COMMAND_BREW_DEVELOPMENT_CORPUS)

function context(crafter: (typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter']) {
  return {
    scenarioId: 'survey-craftsmans-command-brew',
    recipe,
    objective,
    crafter,
  }
}

function runGuide(
  crafter: (typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter'],
  profile: WeightedConditionProfile,
  seed: number,
): EpisodeTraceResult {
  const policy = createGuideIntegratedPolicyFactory(
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
    objective,
  )()
  const initialState = createInitialCraftState(recipe, crafter)
  const firstAction = policy(recipe, crafter, initialState)
  if (firstAction === null) throw new Error('released guide stopped at the initial state')
  return runEpisodeTrace({
    recipe,
    crafter,
    initialState,
    firstAction,
    policy,
    random: createEpisodeRandomStream(seed),
    conditionProfile: profile,
    maxSteps: 80,
  })
}

function runExtracted(
  crafter: (typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter'],
  profile: WeightedConditionProfile,
  seed: number,
): {
  result: EpisodeTraceResult
  memory: SerializableCommandBrewGuideExtractedOptionMemory
  optionIds: CommandBrewGuideExtractedOptionId[]
} {
  const controller = createCommandBrewGuideExtractedOptionController(context(crafter))
  const random = createEpisodeRandomStream(seed)
  let state = createInitialCraftState(recipe, crafter)
  const actions: CraftActionId[] = []
  const steps: EpisodeTraceResult['steps'] = []
  const optionIds: CommandBrewGuideExtractedOptionId[] = []
  let stopReason: EpisodeStopReason = 'action-limit'

  while (state.terminal === 'none' && actions.length < 80) {
    const decision = controller.decide(state)
    optionIds.push(decision.optionId)
    if (decision.action === null) {
      stopReason = 'policy-null'
      break
    }
    const preview = previewAction(recipe, crafter, state, decision.action)
    if (!preview.legal) {
      stopReason = 'illegal-action'
      break
    }
    const outcome = drawSimulatedActionOutcome(preview, state, profile, random)
    const before = state
    state = applyObservedOutcome(recipe, crafter, before, decision.action, outcome).nextState
    actions.push(decision.action)
    steps.push({
      before,
      action: decision.action,
      success: outcome.success,
      nextCondition: outcome.nextCondition,
      after: state,
    })
    controller.advance({
      before,
      action: decision.action,
      success: outcome.success,
      after: state,
    })
    if (state.terminal !== 'none') stopReason = state.terminal
  }
  return {
    result: {
      terminal: state.terminal,
      finalState: state,
      actions,
      steps,
      stoppedByLimit: state.terminal === 'none' && actions.length >= 80,
      stopReason,
    },
    memory: controller.snapshot(),
    optionIds,
  }
}

describe('Command Brew guide-extracted aggressive options', () => {
  it('preserves every guide action, sampled outcome, and final tier across three panels and worlds', () => {
    const observedOptions = new Set<CommandBrewGuideExtractedOptionId>()
    let maximumTotalRiskAttempts = 0
    let maximumConsecutiveFailures = 0
    for (const equipment of PLAYER_EQUIPMENT_PROFILES) {
      for (const profile of COMMAND_BREW_SENSITIVITY_PROFILES) {
        for (const seed of developmentSeeds.slice(0, 2)) {
          const guide = runGuide(equipment.crafter, profile, seed)
          const extracted = runExtracted(equipment.crafter, profile, seed)
          expect(extracted.result.actions).toEqual(guide.actions)
          expect(extracted.result.steps).toEqual(guide.steps)
          expect(extracted.result.finalState).toEqual(guide.finalState)
          expect(extracted.result.stopReason).toBe(guide.stopReason)
          expect(extracted.memory.budgetExceeded).toBe(false)
          expect(extracted.memory.totalObservedTransitions).toBe(extracted.result.actions.length)
          extracted.optionIds.forEach((optionId) => observedOptions.add(optionId))
          maximumTotalRiskAttempts = Math.max(
            maximumTotalRiskAttempts,
            extracted.memory.risk.totalAttempts,
          )
          maximumConsecutiveFailures = Math.max(
            maximumConsecutiveFailures,
            extracted.memory.risk.maximumConsecutiveFailures,
          )
        }
      }
    }

    expect(maximumTotalRiskAttempts).toBeLessThanOrEqual(
      COMMAND_BREW_DEVELOPMENT_RISK_AUDIT_BUDGET_V1.maxTotalAttempts,
    )
    expect(maximumConsecutiveFailures).toBeLessThanOrEqual(
      COMMAND_BREW_DEVELOPMENT_RISK_AUDIT_BUDGET_V1.maxConsecutiveFailures,
    )
    expect([...observedOptions]).toEqual(expect.arrayContaining([
      'progress-risk-loop',
      'quality-risk-loop',
      'condition-opportunity',
      'quality-burst',
      'resource-recovery',
      'safe-finish',
    ]))
  }, 30_000)

  it('replays a risk-heavy unbuffed trace from serialized option and guide memory', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const profile = COMMAND_BREW_SENSITIVITY_PROFILES[0]!
    const guide = runGuide(crafter, profile, developmentSeeds[0]!)
    const split = Math.floor(guide.steps.length / 2)
    const first = createCommandBrewGuideExtractedOptionController(context(crafter))
    const optionIds: CommandBrewGuideExtractedOptionId[] = []

    for (const step of guide.steps.slice(0, split)) {
      const decision = first.decide(step.before)
      expect(decision.action).toBe(step.action)
      optionIds.push(decision.optionId)
      first.advance(step)
    }
    const checkpoint = first.snapshot()
    const resumed = createCommandBrewGuideExtractedOptionController(context(crafter), {
      initialMemory: checkpoint,
    })
    for (const step of guide.steps.slice(split)) {
      const decision = resumed.decide(step.before)
      expect(decision.action).toBe(step.action)
      optionIds.push(decision.optionId)
      resumed.advance(step)
    }
    const finalMemory = resumed.snapshot()
    const riskySteps = guide.steps.filter((step) => (
      previewAction(recipe, crafter, step.before, step.action).successRate < 1
    ))
    expect(finalMemory.totalObservedTransitions).toBe(guide.actions.length)
    expect(finalMemory.risk.totalAttempts).toBe(riskySteps.length)
    expect(finalMemory.risk.totalFailures).toBe(riskySteps.filter((step) => !step.success).length)
    expect(optionIds).toContain('progress-risk-loop')
    expect(optionIds).toContain('quality-risk-loop')
    expect(optionIds).toContain('resource-recovery')
  })

  it('reports a deliberately tiny audit budget without silently changing the protected guide action', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const guide = runGuide(crafter, COMMAND_BREW_SENSITIVITY_PROFILES[0]!, developmentSeeds[0]!)
    const controller = createCommandBrewGuideExtractedOptionController(context(crafter), {
      riskAuditBudget: {
        maxTotalAttempts: 1,
        maxProgressAttempts: 1,
        maxQualityAttempts: 1,
        maxConsecutiveFailures: 1,
        maxConsecutiveProgressFailures: 1,
        maxConsecutiveQualityFailures: 1,
        maxConditionFishingUses: 1,
      },
    })
    let observedExceedance = false
    let observedProjectedBeforeCurrentExceedance = false
    for (const step of guide.steps) {
      const decision = controller.decide(step.before)
      expect(decision.action).toBe(step.action)
      if (!decision.currentWithinAuditEnvelope || !decision.projectedWithinAuditEnvelope) {
        observedExceedance = true
      }
      if (decision.currentWithinAuditEnvelope && !decision.projectedWithinAuditEnvelope) {
        observedProjectedBeforeCurrentExceedance = true
      }
      controller.advance(step)
    }
    expect(controller.snapshot().budgetExceeded).toBe(true)
    expect(observedExceedance).toBe(true)
    expect(observedProjectedBeforeCurrentExceedance).toBe(true)
  })

  it('binds checkpoints to one exact scenario, model, crafter context, and state path', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const controller = createCommandBrewGuideExtractedOptionController(context(crafter))
    expect(Object.isFrozen(controller.context)).toBe(true)
    expect(Object.isFrozen(controller.context.recipe)).toBe(true)

    const initial = createInitialCraftState(recipe, crafter)
    const firstDecision = controller.decide(initial)
    const firstAfter = applyObservedOutcome(recipe, crafter, initial, firstDecision.action!, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    controller.advance({
      before: initial,
      action: firstDecision.action!,
      success: true,
      after: firstAfter,
    })
    const checkpoint = controller.snapshot()

    expect(() => createCommandBrewGuideExtractedOptionController(
      context(PLAYER_EQUIPMENT_PROFILES[1]!.crafter),
      { initialMemory: checkpoint },
    )).toThrow('context binding mismatch')
    expect(() => controller.decide(initial)).toThrow('not continuous')
    expect(() => createCommandBrewGuideExtractedOptionController({
      ...context(crafter),
      recipe: { ...recipe, progressRequired: recipe.progressRequired + 1 },
    })).toThrow('scenario model content hash mismatch')

    const fresh = createCommandBrewGuideExtractedOptionController(context(crafter))
    expect(() => fresh.decide(firstAfter)).toThrow('only accepts the exact initial state')
  })

  it('treats a setup action after Hasty failure as recovery before burst segmentation', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const recoveryProfile = COMMAND_BREW_SENSITIVITY_PROFILES.find(
      (profile) => profile.id === 'normal-heavy-command-brew-three-condition-sensitivity-v1',
    )
    const recoverySeed = 3359510466
    expect(recoveryProfile).toBeDefined()
    expect(developmentSeeds).toContain(recoverySeed)
    const trace = runGuide(crafter, recoveryProfile!, recoverySeed)
    const recoveryIndex = trace.steps.findIndex((step, stepIndex) => (
      step.action === 'hastyTouch'
      && !step.success
      && trace.steps[stepIndex + 1]?.action === 'innovation'
    ))
    expect(recoveryIndex).toBe(23)

    const controller = createCommandBrewGuideExtractedOptionController(context(crafter))
    for (const step of trace.steps.slice(0, recoveryIndex + 1)) {
      controller.decide(step.before)
      controller.advance(step)
    }
    const nextStep = trace.steps[recoveryIndex + 1]!
    const recovery = controller.decide(nextStep.before)
    expect(recovery.action).toBe('innovation')
    expect(recovery.optionId).toBe('resource-recovery')
    expect(recovery.resumeOptionId).toBe('quality-risk-loop')
    expect(recovery.reason).toContain('observed-risk-failure')
  })

  it('records a legal player deviation as actual guide history and replans from it', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const controller = createCommandBrewGuideExtractedOptionController(context(crafter))
    const before = createInitialCraftState(recipe, crafter)
    const recommendation = controller.decide(before)
    expect(recommendation.action).not.toBe('muscleMemory')
    const actualAction = 'muscleMemory' as const
    const after = applyObservedOutcome(recipe, crafter, before, actualAction, {
      success: true,
      nextCondition: 'normal',
    }).nextState
    const memory = controller.advance({ before, action: actualAction, success: true, after })
    expect(memory.lastActualAction).toBe(actualAction)
    expect(memory.guideMemory.lastAction).toBe(actualAction)

    const expectedGuideMemory = advanceGuideIntegratedDecisionMemory(
      createGuideIntegratedDecisionMemory(),
      actualAction,
    )
    const expected = createGuideIntegratedPolicyController(
      DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
      expectedGuideMemory,
      objective,
    ).policy(recipe, crafter, after)
    expect(controller.decide(after).action).toBe(expected)
  })

  it('rejects an after-state that was not produced by the observed action outcome', () => {
    const crafter = PLAYER_EQUIPMENT_PROFILES[0]!.crafter
    const controller = createCommandBrewGuideExtractedOptionController(context(crafter))
    const before = createInitialCraftState(recipe, crafter)
    const decision = controller.decide(before)
    expect(decision.action).not.toBeNull()
    const after = applyObservedOutcome(recipe, crafter, before, decision.action!, {
      success: true,
      nextCondition: 'normal',
    }).nextState

    expect(() => controller.advance({
      before,
      action: decision.action!,
      success: true,
      after: { ...after, cp: after.cp + 1 },
    })).toThrow('does not match mechanics')
  })
})
