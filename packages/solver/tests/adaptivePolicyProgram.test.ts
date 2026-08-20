import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  applyObservedOutcome,
  craftScenarioModelContentHash,
  createInitialCraftState,
  type CrafterProfile,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION,
  CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION,
  CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION,
  assertCraftAdaptivePolicyProgramV1,
  craftAdaptivePolicyProgramContentHashV1,
  createCraftAdaptivePolicyControllerV1,
  sealCraftAdaptivePolicyProgramV1,
  type CraftAdaptivePolicyProgramDefinitionV1,
  type ObservedCraftAdaptivePolicyTransitionV1,
} from '../src'

const scenarioId = 'cosmotized-ilmenite-ingot'
const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
}

function programDefinition(): CraftAdaptivePolicyProgramDefinitionV1 {
  return {
    version: CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION,
    programId: 'test-adaptive-ingot-v1',
    scenarioId,
    recipeProfileId: COSMIC_TITANIUM_INGOT.profileId,
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: craftScenarioModelContentHash(
      COSMIC_TITANIUM_INGOT,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
    ),
    objectiveId: COSMIC_TITANIUM_INGOT_OBJECTIVE.objectiveId,
    objectiveMode: COSMIC_TITANIUM_INGOT_OBJECTIVE.mode,
    qualityTarget: COSMIC_TITANIUM_INGOT_OBJECTIVE.qualityTarget,
    featureSchemaVersion: CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION,
    safetyVersion: CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION,
    entryNode: 'mainline',
    limits: { maxActions: 20, maxSettleHops: 4 },
    nodes: [
      {
        ordinal: 0,
        id: 'mainline',
        actionBudget: 4,
        transitions: [
          {
            id: 'finish-progress',
            all: [{ kind: 'integer', feature: 'state.progressBps', op: 'gte', value: 8_000 }],
            goto: 'finish',
          },
          {
            id: 'good-opportunity',
            all: [
              { kind: 'enum', feature: 'state.condition', op: 'eq', value: 'good' },
              { kind: 'integer', feature: 'state.progressBps', op: 'lt', value: 8_000 },
              { kind: 'boolean', feature: 'memory.flags.saw-good', op: 'eq', value: false },
            ],
            goto: 'good-window',
            setResume: 'active-node',
            setFlag: { flag: 'saw-good', value: true },
          },
        ],
        decisions: [
          {
            id: 'specialist-reroll',
            all: [{ kind: 'boolean', feature: 'crafter.specialist', op: 'eq', value: true }],
            actions: ['carefulObservation'],
          },
          {
            id: 'opening',
            all: [],
            actions: ['finalAppraisal', 'muscleMemory', 'basicSynthesis'],
          },
        ],
        onBudgetExhausted: { kind: 'goto', goto: 'finish' },
      },
      {
        ordinal: 1,
        id: 'good-window',
        actionBudget: 1,
        transitions: [],
        decisions: [{
          id: 'use-good',
          all: [{ kind: 'enum', feature: 'state.condition', op: 'eq', value: 'good' }],
          actions: ['preciseTouch', 'basicTouch'],
        }],
        onBudgetExhausted: { kind: 'goto', goto: '$resume', setResume: 'clear' },
      },
      {
        ordinal: 2,
        id: 'finish',
        actionBudget: 4,
        transitions: [],
        decisions: [{
          id: 'safe-finish',
          all: [],
          actions: ['preciseTouch', 'basicSynthesis', 'basicTouch'],
        }],
        onBudgetExhausted: { kind: 'terminate', reason: 'finish-budget-exhausted' },
      },
    ],
  }
}

function context() {
  return {
    scenarioId,
    recipe: COSMIC_TITANIUM_INGOT,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
    crafter,
  }
}

function observed(
  before: CraftState,
  action: ObservedCraftAdaptivePolicyTransitionV1['action'],
  success = true,
  nextCondition: CraftState['condition'] = 'normal',
): ObservedCraftAdaptivePolicyTransitionV1 {
  const after = applyObservedOutcome(
    COSMIC_TITANIUM_INGOT,
    crafter,
    before,
    action,
    { success, nextCondition },
  ).nextState
  return { before, action, success, after }
}

describe('craft adaptive policy program v1', () => {
  it('seals a canonical data-only artifact and rejects content drift', () => {
    const definition = programDefinition()
    const artifact = sealCraftAdaptivePolicyProgramV1(definition)
    const { nodes, ...rest } = definition
    const reordered = { nodes, ...rest } as CraftAdaptivePolicyProgramDefinitionV1

    expect(artifact.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(craftAdaptivePolicyProgramContentHashV1(reordered)).toBe(artifact.contentHash)
    expect(Object.isFrozen(artifact)).toBe(true)
    expect(() => assertCraftAdaptivePolicyProgramV1(artifact)).not.toThrow()

    const tampered = structuredClone(artifact)
    tampered.nodes[0]!.decisions[1]!.actions[0] = 'observe'
    expect(() => assertCraftAdaptivePolicyProgramV1(tampered)).toThrow('content hash mismatch')

    const callbackArtifact = {
      ...definition,
      chooseAction: () => 'basicSynthesis',
    } as unknown as CraftAdaptivePolicyProgramDefinitionV1
    expect(() => sealCraftAdaptivePolicyProgramV1(callbackArtifact)).toThrow('is not supported')
  })

  it('fails closed on scenario, objective, feature, and graph binding drift', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    expect(() => createCraftAdaptivePolicyControllerV1({ ...context(), scenarioId: 'other-scenario' }, artifact))
      .toThrow('scenario binding mismatch')
    expect(() => createCraftAdaptivePolicyControllerV1({
      ...context(),
      objective: { ...COSMIC_TITANIUM_INGOT_OBJECTIVE, qualityTarget: 16_499 },
    }, artifact)).toThrow()

    const invalidFeature = programDefinition()
    invalidFeature.nodes[0]!.transitions[0]!.all[0] = {
      kind: 'integer',
      feature: 'state.unknown' as 'state.step',
      op: 'gte',
      value: 1,
    }
    expect(() => sealCraftAdaptivePolicyProgramV1(invalidFeature)).toThrow('supported integer feature')

    const invalidGraph = programDefinition()
    invalidGraph.nodes[0]!.transitions[0]!.goto = 'missing-node'
    expect(() => sealCraftAdaptivePolicyProgramV1(invalidGraph)).toThrow('program node or $resume')
  })

  it('uses ordered all-of integer, enum, and boolean guards and resumes after a budgeted detour', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    const initial = {
      ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter),
      condition: 'good' as const,
    }
    const controller = createCraftAdaptivePolicyControllerV1(context(), artifact)

    const opportunity = controller.decide(initial)
    expect(opportunity).toMatchObject({
      action: 'preciseTouch',
      nodeId: 'good-window',
      decisionId: 'use-good',
      status: 'active',
    })
    expect(opportunity.memory).toMatchObject({
      resumeNodeId: 'mainline',
      totalActionUses: 0,
      flags: { 'saw-good': true },
    })
    expect(controller.snapshot()).toMatchObject({
      activeNodeId: 'mainline',
      resumeNodeId: null,
      flags: { 'saw-good': false },
    })
    expect(controller.decide(initial)).toMatchObject({
      action: 'preciseTouch',
      nodeId: 'good-window',
    })

    const transition = observed(initial, 'preciseTouch')
    const memory = controller.advance(transition)
    expect(memory).toMatchObject({
      activeNodeId: 'mainline',
      resumeNodeId: null,
      totalActionUses: 1,
      nodeActionUses: 0,
      lastAction: 'preciseTouch',
      lastActionSuccess: true,
    })
  })

  it('chooses the first action that is both legal and policy-safe', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const nearPrematureCompletion: CraftState = {
      ...initial,
      step: 12,
      progress: COSMIC_TITANIUM_INGOT.progressRequired - 1,
      quality: 0,
    }
    const controller = createCraftAdaptivePolicyControllerV1(context(), artifact)

    // Precise Touch is illegal on Normal; Basic Synthesis would prematurely
    // finish below required quality. The ordered safe fallback is Basic Touch.
    expect(controller.decide(nearPrematureCompletion)).toMatchObject({
      action: 'basicTouch',
      nodeId: 'finish',
      decisionId: 'safe-finish',
    })
  })

  it('changes action and no-step counters only when an actual outcome advances', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const controller = createCraftAdaptivePolicyControllerV1(context(), artifact)

    expect(controller.decide(initial).action).toBe('finalAppraisal')
    expect(controller.decide(initial).action).toBe('finalAppraisal')
    expect(controller.snapshot()).toMatchObject({
      totalActionUses: 0,
      totalNoStepUses: 0,
      totalObservedTransitions: 0,
    })

    const memory = controller.advance(observed(initial, 'finalAppraisal'))
    expect(memory.totalActionUses).toBe(1)
    expect(memory.totalNoStepUses).toBe(1)
    expect(memory.nodeActionUses).toBe(1)
    expect(memory.nodeNoStepUses).toBe(1)
    expect(memory.totalObservedTransitions).toBe(1)
    expect(memory.actionUses.finalAppraisal).toBe(1)
    expect(memory.actionUses.muscleMemory).toBe(0)
    expect(JSON.parse(JSON.stringify(memory))).toEqual(memory)
  })

  it('rejects a claimed observed transition before mutating memory', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const controller = createCraftAdaptivePolicyControllerV1(context(), artifact)
    const transition = observed(initial, 'finalAppraisal')
    const inconsistent = {
      ...transition,
      after: { ...transition.after, cp: transition.after.cp + 1 },
    }

    expect(() => controller.advance(inconsistent)).toThrow('does not match the mechanics result')
    expect(controller.snapshot().totalActionUses).toBe(0)
  })

  it('keeps memory bit-identical when rejection happens after a route would settle', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    const before = {
      ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter),
      condition: 'good' as const,
    }
    const controller = createCraftAdaptivePolicyControllerV1(context(), artifact)
    const snapshotBefore = controller.snapshot()
    const transition = observed(before, 'preciseTouch')
    const inconsistent = {
      ...transition,
      after: { ...transition.after, quality: transition.after.quality + 1 },
    }

    expect(() => controller.advance(inconsistent)).toThrow('does not match the mechanics result')
    expect(controller.snapshot()).toEqual(snapshotBefore)
  })

  it('restores only serializable memory bound to the same program hash', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    const first = createCraftAdaptivePolicyControllerV1(context(), artifact)
    const accepted = observed(initial, 'finalAppraisal')
    first.advance(accepted)
    const saved = JSON.parse(JSON.stringify(first.snapshot()))
    const restored = createCraftAdaptivePolicyControllerV1(context(), artifact, { initialMemory: saved })
    expect(restored.snapshot()).toEqual(first.snapshot())
    expect(() => restored.decide(initial)).toThrow('not continuous')
    expect(() => restored.decide(accepted.after)).not.toThrow()

    const wrong = { ...saved, programContentHash: `sha256:${'0'.repeat(64)}` }
    expect(() => createCraftAdaptivePolicyControllerV1(context(), artifact, { initialMemory: wrong }))
      .toThrow('does not belong to this program artifact')
    const continuityRemoved = { ...saved, lastObservedStateHash: null }
    expect(() => createCraftAdaptivePolicyControllerV1(
      context(),
      artifact,
      { initialMemory: continuityRemoved },
    )).toThrow('last observed state')
    expect(() => createCraftAdaptivePolicyControllerV1({
      ...context(),
      crafter: { ...crafter, maxCp: crafter.maxCp + 1 },
    }, artifact, { initialMemory: saved })).toThrow('crafter context')
  })

  it('normalizes omitted, explicit false, and explicit undefined specialist capability', () => {
    const artifact = sealCraftAdaptivePolicyProgramV1(programDefinition())
    const omitted = createCraftAdaptivePolicyControllerV1(context(), artifact)
    const explicitFalse = createCraftAdaptivePolicyControllerV1({
      ...context(),
      crafter: { ...crafter, specialist: false },
    }, artifact)
    const explicitUndefinedCrafter = {
      ...crafter,
      specialist: undefined,
    } as unknown as CrafterProfile
    const explicitUndefined = createCraftAdaptivePolicyControllerV1({
      ...context(),
      crafter: explicitUndefinedCrafter,
    }, artifact)

    expect(omitted.context.crafter.specialist).toBe(false)
    expect(explicitFalse.snapshot().contextContentHash).toBe(omitted.snapshot().contextContentHash)
    expect(explicitUndefined.snapshot().contextContentHash).toBe(omitted.snapshot().contextContentHash)
  })

  it('uses preview guards and requires explicit permission to finish below a maximize-quality target', () => {
    const commandBrewContext = {
      scenarioId: 'survey-craftsmans-command-brew',
      recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
      objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      crafter,
    }
    const definition: CraftAdaptivePolicyProgramDefinitionV1 = {
      version: CRAFT_ADAPTIVE_POLICY_PROGRAM_VERSION,
      programId: 'test-command-brew-preview-v1',
      scenarioId: commandBrewContext.scenarioId,
      recipeProfileId: commandBrewContext.recipe.profileId,
      scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
      scenarioModelContentHash: craftScenarioModelContentHash(
        commandBrewContext.recipe,
        commandBrewContext.objective,
      ),
      objectiveId: commandBrewContext.objective.objectiveId,
      objectiveMode: commandBrewContext.objective.mode,
      qualityTarget: commandBrewContext.objective.qualityTarget,
      featureSchemaVersion: CRAFT_ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION,
      safetyVersion: CRAFT_ADAPTIVE_POLICY_SAFETY_VERSION,
      entryNode: 'finish',
      limits: { maxActions: 2, maxSettleHops: 2 },
      nodes: [{
        ordinal: 0,
        id: 'finish',
        actionBudget: 2,
        transitions: [],
        decisions: [{
          id: 'explicit-lower-tier-finish',
          all: [{
            kind: 'boolean',
            feature: 'preview.basicSynthesis.wouldCompleteBelowObjectiveTarget',
            op: 'eq',
            value: true,
          }],
          actions: ['basicSynthesis'],
        }],
        onBudgetExhausted: { kind: 'terminate', reason: 'done' },
      }],
    }
    const nearCompletion = {
      ...createInitialCraftState(commandBrewContext.recipe, crafter),
      progress: commandBrewContext.recipe.progressRequired - 1,
    }

    const shielded = createCraftAdaptivePolicyControllerV1(
      commandBrewContext,
      sealCraftAdaptivePolicyProgramV1(definition),
    )
    expect(shielded.decide(nearCompletion)).toMatchObject({
      action: null,
      terminationReason: 'no-safe-action',
    })

    definition.nodes[0]!.decisions[0]!.allowBelowObjectiveCompletion = true
    const explicitlyAllowed = createCraftAdaptivePolicyControllerV1(
      commandBrewContext,
      sealCraftAdaptivePolicyProgramV1(definition),
    )
    expect(explicitlyAllowed.decide(nearCompletion)).toMatchObject({
      action: 'basicSynthesis',
      decisionId: 'explicit-lower-tier-finish',
    })
  })

  it('terminates an unconditional transition loop at the declared settle bound', () => {
    const looping = programDefinition()
    looping.nodes = [{
      ordinal: 0,
      id: 'mainline',
      actionBudget: 1,
      transitions: [{ id: 'loop', all: [], goto: 'mainline' }],
      decisions: [{ id: 'unreachable', all: [], actions: ['basicSynthesis'] }],
      onBudgetExhausted: { kind: 'terminate', reason: 'unused' },
    }]
    looping.limits = { maxActions: 5, maxSettleHops: 2 }
    const artifact = sealCraftAdaptivePolicyProgramV1(looping)
    const controller = createCraftAdaptivePolicyControllerV1(context(), artifact)

    expect(controller.decide(createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter))).toMatchObject({
      action: null,
      status: 'terminated',
      terminationReason: 'settle-hop-limit',
    })
  })
})
