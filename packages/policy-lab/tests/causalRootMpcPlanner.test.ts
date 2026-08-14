import { describe, expect, it } from 'vitest'
import {
  CRAFT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import { ACTIONS, createInitialCraftState } from '@frozen-rabbit-expert/domain'
import {
  NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
  NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_POLICY_VERSION,
  HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
  MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedDecisionMemory,
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
} from '@frozen-rabbit-expert/solver'
import {
  MAX_CAUSAL_ROOT_MPC_CANDIDATES,
  causalRootMpcPairedSeed,
  planWithCertificateShieldedCausalRootMpc,
} from '../src'

const nonSpecialist = PLAYER_EQUIPMENT_PROFILES[1]!.crafter
const specialist = PLAYER_EQUIPMENT_PROFILES[2]!.crafter

const policyByScenario = {
  'cosmotized-ilmenite-ingot': [
    DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
    GUIDE_INTEGRATED_POLICY_VERSION,
    NORMAL_HEAVY_POC_CONDITIONS,
  ],
  'cosmotized-ilmenite-nails': [
    DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
    NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    NORMAL_HEAVY_POC_CONDITIONS,
  ],
  'hardened-survey-plank': [
    DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
    HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
    NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  ],
  'mobile-work-stairs': [
    DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
    MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
    NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  ],
  'survey-craftsmans-command-brew': [
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
    SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
    NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
  ],
} as const satisfies Record<string, readonly [
  Readonly<GuideIntegratedPolicyConfig>,
  GuideIntegratedPolicyVersion,
  typeof NORMAL_HEAVY_POC_CONDITIONS
    | typeof NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS
    | typeof NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
]>

describe('certificate-shielded causal root MPC', () => {
  it('keeps the explicit guide root in a bounded candidate set for all five scenarios', () => {
    for (const scenario of CRAFT_SCENARIO_DATA) {
      const [guideConfig, baselinePolicyVersion, profile] = policyByScenario[scenario.scenarioId]
      const state = createInitialCraftState(scenario.recipe, nonSpecialist)
      const plan = planWithCertificateShieldedCausalRootMpc({
        recipe: scenario.recipe,
        objective: scenario.objective,
        crafter: nonSpecialist,
      }, state, {
        guideConfig,
        baselinePolicyVersion,
        startingDecisionMemory: createGuideIntegratedDecisionMemory(),
        profiles: [profile],
        samplesPerProfile: 1,
        maxEpisodeSteps: 1,
        seed: 73,
        maxStage1Episodes: MAX_CAUSAL_ROOT_MPC_CANDIDATES,
      })

      expect(plan, scenario.scenarioId).not.toBeNull()
      expect(plan!.candidates.length, scenario.scenarioId).toBeLessThanOrEqual(8)
      expect(plan!.candidates.find(({ action }) => action === plan!.baselineAction)?.origins)
        .toContain('guide-baseline')
      expect(plan!.action, scenario.scenarioId).toBe(plan!.baselineAction)
      expect(plan!.selectionReason, scenario.scenarioId).toBe('baseline-no-completion-evidence')
      expect(plan!.candidates.every((candidate) => (
        candidate.allConditionContinuationCertificate === 'unknown'
      ))).toBe(true)
    }
  })

  it('derives paired seeds from profile identity, not profile or candidate order', () => {
    const identity = 'fixed-evidence-identity'
    const forward = ['profile-b', 'profile-a'].sort().flatMap((profileId) => (
      [0, 1, 2].map((sample) => causalRootMpcPairedSeed(917, identity, profileId, sample))
    ))
    const reverse = ['profile-a', 'profile-b'].sort().flatMap((profileId) => (
      [0, 1, 2].map((sample) => causalRootMpcPairedSeed(917, identity, profileId, sample))
    ))
    expect(reverse).toEqual(forward)
    expect(new Set(forward).size).toBe(forward.length)
  })

  it('fails closed to the baseline before consuming a partial Stage-1 budget', () => {
    const scenario = CRAFT_SCENARIO_DATA[0]
    const state = createInitialCraftState(scenario.recipe, nonSpecialist)
    const plan = planWithCertificateShieldedCausalRootMpc({
      recipe: scenario.recipe,
      objective: scenario.objective,
      crafter: nonSpecialist,
    }, state, {
      guideConfig: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
      baselinePolicyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
      startingDecisionMemory: createGuideIntegratedDecisionMemory(),
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      samplesPerProfile: 2,
      maxEpisodeSteps: 2,
      seed: 73,
      maxStage1Episodes: 1,
    })!

    expect(plan.action).toBe(plan.baselineAction)
    expect(plan.selectionReason).toBe('baseline-budget-exhausted')
    expect(plan.episodeCount).toBe(0)
    expect(plan.evaluations).toEqual([])
  })

  it('inherits Good Omen and no-step behavior from runEpisode semantics', () => {
    const scenario = CRAFT_SCENARIO_DATA[4]
    const state = {
      ...createInitialCraftState(scenario.recipe, specialist),
      condition: 'goodOmen' as const,
    }
    const plan = planWithCertificateShieldedCausalRootMpc({
      recipe: scenario.recipe,
      objective: scenario.objective,
      crafter: specialist,
    }, state, {
      guideConfig: DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
      baselinePolicyVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
      startingDecisionMemory: createGuideIntegratedDecisionMemory(),
      profiles: [NORMAL_HEAVY_COMMAND_BREW_CONDITIONS],
      samplesPerProfile: 1,
      maxEpisodeSteps: 1,
      seed: 119,
      maxStage1Episodes: MAX_CAUSAL_ROOT_MPC_CANDIDATES,
    })!

    const noStep = plan.evaluations.find(({ candidate }) => (
      candidate.action === 'quickInnovation'
    ))
    expect(noStep).toBeDefined()
    expect(ACTIONS[noStep!.candidate.action].noStep).toBe(true)
    expect(noStep!.pairedOutcomes[0]).toMatchObject({
      actionCount: 1,
      finalStep: state.step,
      finalCondition: 'goodOmen',
    })

    const baseline = plan.evaluations.find(({ shieldStatus }) => shieldStatus === 'baseline')!
    expect(ACTIONS[baseline.candidate.action].noStep).not.toBe(true)
    expect(baseline.pairedOutcomes[0]?.finalCondition).toBe('good')
  })
})
