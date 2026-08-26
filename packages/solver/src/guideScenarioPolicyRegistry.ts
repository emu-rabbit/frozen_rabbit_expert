import {
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  type CraftScenarioModelContentHash,
} from '@frozen-rabbit-expert/domain'
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
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
} from './guideIntegratedPolicy'

export interface GuideScenarioPolicyBinding {
  recipeProfileId: string
  objectiveId: string
  scenarioModelIdentityVersion: typeof CRAFT_SCENARIO_MODEL_IDENTITY_VERSION
  scenarioModelContentHash: CraftScenarioModelContentHash
  policyVersion: GuideIntegratedPolicyVersion
  config: Readonly<GuideIntegratedPolicyConfig>
}

/**
 * Runtime-neutral owner for the guide policy assigned to each scenario.
 * Recipe/objective data and UI metadata remain in their own packages.
 */
export const GUIDE_SCENARIO_POLICY_BINDINGS = {
  'cosmotized-ilmenite-ingot': {
    recipeProfileId: 'cosmotized-ilmenite-ingot-36282-v1',
    objectiveId: 'cosmotized-ilmenite-ingot-required-quality-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:9e0b8ecba0f88c12b3ace9f4e8171fe93b71e3d167c75e0fcb72dfdda62d9369',
    policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'cosmotized-ilmenite-nails': {
    recipeProfileId: 'cosmotized-ilmenite-nails-36283-v1',
    objectiveId: 'cosmotized-ilmenite-nails-four-tier-quality-v3',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:4f3b38e6977f449b64decd8752a18e58784b772eaa3757cb7e8080b89b3020e5',
    policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'hardened-survey-plank': {
    recipeProfileId: 'hardened-survey-plank-36205-v1',
    objectiveId: 'hardened-survey-plank-required-quality-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:33e537f87c981fc79dfcd3c3e24413043604d492aa491dfa778a6fbb09e38dd2',
    policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'mobile-work-stairs': {
    recipeProfileId: 'mobile-work-stairs-36208-v1',
    objectiveId: 'mobile-work-stairs-hq-chance-v2',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:b9b15d74020d0ebf9523a231cac0d287dc25e57239bddc45d5dac9e986c4620e',
    policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'survey-craftsmans-command-brew': {
    recipeProfileId: 'survey-craftsmans-command-brew-36582-v1',
    objectiveId: 'survey-craftsmans-command-brew-four-tier-quality-v2',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:f1ac80eaece249e0ab9d05c7215dd70049476f0df408d50de48567eaa03307c0',
    policyVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
} as const satisfies Readonly<Record<string, GuideScenarioPolicyBinding>>

export type GuideScenarioPolicyId = keyof typeof GUIDE_SCENARIO_POLICY_BINDINGS

export function resolveGuideScenarioPolicyBinding(
  scenarioId: string,
): Readonly<GuideScenarioPolicyBinding> {
  if (!Object.hasOwn(GUIDE_SCENARIO_POLICY_BINDINGS, scenarioId)) {
    throw new Error(`unsupported guide scenario policy: ${scenarioId}`)
  }
  return GUIDE_SCENARIO_POLICY_BINDINGS[scenarioId as GuideScenarioPolicyId]
}
