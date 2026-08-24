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
    scenarioModelContentHash: 'sha256:2483cb2007193bf04bfe66c08bcd8186f68c9b73afe8df7d14ae600b45302519',
    policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'cosmotized-ilmenite-nails': {
    recipeProfileId: 'cosmotized-ilmenite-nails-36283-v1',
    objectiveId: 'cosmotized-ilmenite-nails-score-max-v2',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:5cc7f94c2d6b13d6aa7cb2e068a522f8ab597c23bff19d4249a350855f7ff851',
    policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'hardened-survey-plank': {
    recipeProfileId: 'hardened-survey-plank-36205-v1',
    objectiveId: 'hardened-survey-plank-required-quality-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:9e756ff3947e3d177d8985d0d1b6fa682cb9e20b1bcee6bde0ddcfef5c687845',
    policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'mobile-work-stairs': {
    recipeProfileId: 'mobile-work-stairs-36208-v1',
    objectiveId: 'mobile-work-stairs-hq-quality-max-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:4e210a17cc393152961e063db422bfb8252dbe73d963a2fee4230a11e03fda46',
    policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'survey-craftsmans-command-brew': {
    recipeProfileId: 'survey-craftsmans-command-brew-36582-v1',
    objectiveId: 'survey-craftsmans-command-brew-score-max-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:61ce672e5dadee1ce761675899a0349d0c426267c3280d8a8beab029a3c61d97',
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
