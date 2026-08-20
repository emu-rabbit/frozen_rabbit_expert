import { describe, expect, it, vi } from 'vitest'

vi.mock('@frozen-rabbit-expert/solver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@frozen-rabbit-expert/solver')>()
  return {
    ...actual,
    createGuideIntegratedPolicyController: (
      ...args: Parameters<typeof actual.createGuideIntegratedPolicyController>
    ) => {
      const controller = actual.createGuideIntegratedPolicyController(...args)
      return {
        ...controller,
        policy: (...policyArgs: Parameters<typeof controller.policy>) => {
          const state = policyArgs[2]
          return state.durability <= 5 ? 'basicSynthesis' as const : 'reflect' as const
        },
      }
    },
  }
})

import { CRAFT_SCENARIO_DATA, PLAYER_EQUIPMENT_PROFILES } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, previewAction } from '@frozen-rabbit-expert/domain'
import { NORMAL_HEAVY_POC_CONDITIONS } from '@frozen-rabbit-expert/simulator'
import {
  GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedDecisionMemory,
  isPolicyActionSafe,
  resolvePlayerProfilePolicyConfig,
} from '@frozen-rabbit-expert/solver'
import {
  MAX_CAUSAL_ROOT_MPC_CANDIDATES,
  planWithCertificateShieldedCausalRootMpc,
} from '../src/causalRootMpcPlanner'

const scenario = CRAFT_SCENARIO_DATA[0]
const crafter = PLAYER_EQUIPMENT_PROFILES[1]!.crafter

function planFrom(state: ReturnType<typeof createInitialCraftState>) {
  return planWithCertificateShieldedCausalRootMpc({
    recipe: scenario.recipe,
    objective: scenario.objective,
    crafter,
  }, state, {
    scenarioId: scenario.scenarioId,
    guideConfig: resolvePlayerProfilePolicyConfig(scenario.scenarioId, crafter),
    baselinePolicyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
    startingDecisionMemory: createGuideIntegratedDecisionMemory(),
    profiles: [NORMAL_HEAVY_POC_CONDITIONS],
    samplesPerProfile: 1,
    maxEpisodeSteps: 1,
    seed: 73,
    maxStage1Episodes: MAX_CAUSAL_ROOT_MPC_CANDIDATES,
  })!
}

describe('causal root MPC guide baseline safety boundary', () => {
  it('returns no action when the guide baseline is illegal', () => {
    const state = {
      ...createInitialCraftState(scenario.recipe, crafter),
      step: 2,
    }
    expect(previewAction(scenario.recipe, crafter, state, 'reflect')).toMatchObject({
      legal: false,
      reason: 'wrong-step',
    })

    const plan = planFrom(state)
    expect(plan).toMatchObject({
      action: null,
      baselineAction: null,
      usedBaseline: true,
      selectionReason: 'baseline-unavailable',
      episodeCount: 0,
    })
    expect(plan.error).toMatch(/guide baseline action reflect is illegal: wrong-step/)
  })

  it('returns no action when the guide baseline is legal but safety-vetoed', () => {
    const state = {
      ...createInitialCraftState(scenario.recipe, crafter),
      step: 2,
      durability: 5,
    }
    const preview = previewAction(scenario.recipe, crafter, state, 'basicSynthesis')
    expect(preview.legal).toBe(true)
    expect(isPolicyActionSafe(
      scenario.recipe,
      crafter,
      state,
      'basicSynthesis',
      preview,
    )).toBe(false)

    const plan = planFrom(state)
    expect(plan).toMatchObject({
      action: null,
      baselineAction: null,
      usedBaseline: true,
      selectionReason: 'baseline-unavailable',
      episodeCount: 0,
    })
    expect(plan.error).toMatch(/guide baseline action basicSynthesis is unsafe/)
  })
})
