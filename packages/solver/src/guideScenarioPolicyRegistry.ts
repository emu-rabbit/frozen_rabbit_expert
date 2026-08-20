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
    scenarioModelContentHash: 'sha256:9c1bf1f5c4f375898959ceb896ff6545c05070f02c2012ea251d0c435e78abcc',
    policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'cosmotized-ilmenite-nails': {
    recipeProfileId: 'cosmotized-ilmenite-nails-36283-v1',
    objectiveId: 'cosmotized-ilmenite-nails-score-max-v2',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:8cc67845e4048361f94f9f27f41cca7724209e1a8a1977bab9abc4f246010051',
    policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'hardened-survey-plank': {
    recipeProfileId: 'hardened-survey-plank-36205-v1',
    objectiveId: 'hardened-survey-plank-required-quality-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:0ed8550e929f042fca6d1b82bf786bb44a795a1194aa3a6ac4bbf8ffe02f58a6',
    policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'mobile-work-stairs': {
    recipeProfileId: 'mobile-work-stairs-36208-v1',
    objectiveId: 'mobile-work-stairs-hq-quality-max-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:0ec3c146d47d63fe4dbe227800cb5ba098689e7e8ffeb16b8dd8bbc2e5335f8b',
    policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
    config: DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  'survey-craftsmans-command-brew': {
    recipeProfileId: 'survey-craftsmans-command-brew-36582-v1',
    objectiveId: 'survey-craftsmans-command-brew-score-max-v1',
    scenarioModelIdentityVersion: CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
    scenarioModelContentHash: 'sha256:e4149c585d98be18ef7f085ce8201d913ce3faec80099f458e7fa7b8ba784595',
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
