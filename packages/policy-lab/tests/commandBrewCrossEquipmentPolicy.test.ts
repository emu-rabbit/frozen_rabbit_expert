import { describe, expect, it } from 'vitest'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import { createInitialCraftState, previewAction } from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  createGuideIntegratedPolicyFactory,
} from '@frozen-rabbit-expert/solver'
import {
  commandBrewRouteUsesOnlyDeterministicActions,
  createCommandBrewCrossEquipmentPolicyController,
  probePolicyOnAllNormal,
} from '../src/commandBrewCrossEquipmentPolicy'

const [unbuffed, foodMedicine, specialist] = PLAYER_EQUIPMENT_PROFILES
const allMalleable: WeightedConditionProfile = {
  id: 'test-command-brew-all-malleable',
  evidence: 'assumption',
  weights: { malleable: 1 },
}

function run(policy: EpisodePolicy, crafter: (typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter'], profile: WeightedConditionProfile, seed: number) {
  const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const firstAction = policy(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, initialState)
  if (firstAction === null) throw new Error('policy stopped at the initial state')
  return runEpisodeTrace({
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    crafter,
    initialState,
    firstAction,
    policy,
    random: createEpisodeRandomStream(seed),
    conditionProfile: profile,
    maxSteps: 80,
  })
}

describe('Command Brew cross-equipment route candidate', () => {
  it('selects the deterministic low-resource route from stats and reproduces the all-Normal floor', () => {
    const controller = createCommandBrewCrossEquipmentPolicyController(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      unbuffed!.crafter,
      SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    )
    const probe = probePolicyOnAllNormal(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      unbuffed!.crafter,
      controller.policy,
    )

    expect(commandBrewRouteUsesOnlyDeterministicActions()).toBe(true)
    expect(controller.mode).toBe('low-resource-route')
    expect(probe).toMatchObject({
      terminal: 'completed',
      quality: 6839,
      actionCount: 24,
      riskyActionUses: 0,
      stopped: false,
    })
  })

  it('holds a Malleable progress spike before the quality cashout and still completes without risky actions', () => {
    const controller = createCommandBrewCrossEquipmentPolicyController(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      unbuffed!.crafter,
      SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    )
    const result = run(controller.policy, unbuffed!.crafter, allMalleable, 73)
    const finalAppraisalIndex = result.actions.indexOf('finalAppraisal')
    const byregotIndex = result.actions.indexOf('byregotsBlessing')

    expect(result.terminal).toBe('completed')
    expect(result.finalState.quality).toBeGreaterThanOrEqual(6839)
    expect(finalAppraisalIndex).toBeGreaterThanOrEqual(0)
    expect(byregotIndex).toBeGreaterThan(finalAppraisalIndex)
    expect(result.steps.every((step) => previewAction(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      unbuffed!.crafter,
      step.before,
      step.action,
    ).successRate === 1)).toBe(true)
  })

  it('keeps the mixed Good/Malleable CP boundary on a deterministic first-tier route', () => {
    const controller = createCommandBrewCrossEquipmentPolicyController(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      unbuffed!.crafter,
      SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    )
    const profile = COMMAND_BREW_SENSITIVITY_PROFILES.find((candidate) => (
      candidate.id === 'good-scarce-malleable-stress-command-brew-three-condition-sensitivity-v1'
    ))!
    const result = run(controller.policy, unbuffed!.crafter, profile, 1_846_031_222)

    expect(result.terminal).toBe('completed')
    expect(result.finalState.quality).toBeGreaterThanOrEqual(6_000)
    expect(result.steps.every((step) => step.success)).toBe(true)
    expect(result.steps.every((step) => previewAction(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      unbuffed!.crafter,
      step.before,
      step.action,
    ).successRate === 1)).toBe(true)
  })

  it('holds the declared CP 680 mechanics-sensitivity envelope without profile-id routing', () => {
    const craftsmanshipValues = [5_200, 5_500]
    const controlValues = [4_900, 5_350]
    const probes = craftsmanshipValues.flatMap((craftsmanship) => (
      controlValues.map((control) => {
        const crafter = {
          level: 100,
          craftsmanship,
          control,
          maxCp: 680,
          cosmicToolGoodBonus: true,
          specialist: false,
        }
        const controller = createCommandBrewCrossEquipmentPolicyController(
          SURVEY_CRAFTSMANS_COMMAND_BREW,
          crafter,
          SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
        )
        return {
          mode: controller.mode,
          probe: probePolicyOnAllNormal(
            SURVEY_CRAFTSMANS_COMMAND_BREW,
            crafter,
            controller.policy,
          ),
        }
      })
    ))

    expect(probes).toHaveLength(4)
    expect(probes.every(({ mode }) => mode !== 'guide-outside-deterministic-envelope')).toBe(true)
    expect(probes.every(({ probe }) => (
      probe.terminal === 'completed'
      && !probe.stopped
      && probe.riskyActionUses === 0
      && probe.quality >= 6_550
    ))).toBe(true)
  })

  it('marks a panel outside the deterministic envelope instead of silently certifying it', () => {
    const controller = createCommandBrewCrossEquipmentPolicyController(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      { ...unbuffed!.crafter, craftsmanship: 5_200, control: 4_900, maxCp: 580 },
      SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    )

    expect(controller.mode).toBe('guide-outside-deterministic-envelope')
  })

  it.each([foodMedicine!, specialist!])(
    'preserves the released full-quality guide trace for $id',
    (equipment) => {
      const candidate = createCommandBrewCrossEquipmentPolicyController(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        equipment.crafter,
        SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      )
      const baseline = createGuideIntegratedPolicyFactory(
        DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
        SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      )()
      const profile = COMMAND_BREW_SENSITIVITY_PROFILES[0]!
      const seed = 0x51f15e
      const baselineResult = run(baseline, equipment.crafter, profile, seed)
      const candidateResult = run(candidate.policy, equipment.crafter, profile, seed)

      expect(candidate.mode).toBe('guide')
      expect(candidateResult.actions).toEqual(baselineResult.actions)
      expect(candidateResult.finalState).toEqual(baselineResult.finalState)
      expect(candidateResult.terminal).toBe('completed')
      expect(candidateResult.finalState.quality).toBe(12_000)
    },
  )
})
