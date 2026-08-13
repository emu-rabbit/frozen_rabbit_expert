export type ScorecardScenarioId =
  | 'cosmotized-ilmenite-ingot'
  | 'cosmotized-ilmenite-nails'
  | 'hardened-survey-plank'
  | 'mobile-work-stairs'
  | 'survey-craftsmans-command-brew'

export type HistoricalProfileRouting =
  | 'none'
  | 'exact-food-nails-v1'
  | 'exact-food-stairs-v1'
  | 'exact-food-stairs-v2'

export interface HistoricalPolicyRelease {
  scenarioId: ScorecardScenarioId
  version: string
  releaseCommit: string
  configExport: string
  profileRouting: HistoricalProfileRouting
}

/**
 * Immutable release registry for normalized historical replay. Each entry
 * points at the commit that first published that recipe-policy identity.
 * Add every new recipe policy version here; the registry test requires the
 * final entry for each scenario to match the runtime scenario registry.
 */
export const HISTORICAL_POLICY_RELEASES: readonly HistoricalPolicyRelease[] = [
  {
    scenarioId: 'cosmotized-ilmenite-ingot',
    version: 'cosmic-titanium-guide-integrated-v1.0.0',
    releaseCommit: '804960c4ad0fb610a77f376fec22e7d6a03f1261',
    configExport: 'DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'cosmotized-ilmenite-ingot',
    version: 'cosmic-titanium-guide-integrated-v1.1.0',
    releaseCommit: 'c56d8f956379d025a8cf2a83ae0fd97a7fa0843c',
    configExport: 'DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'cosmotized-ilmenite-ingot',
    version: 'cosmic-titanium-guide-integrated-v1.2.0',
    releaseCommit: '1acce2901f968cf23470ea37a8f32fe470dc79e8',
    configExport: 'DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'cosmotized-ilmenite-nails',
    version: 'cosmic-titanium-nails-guide-integrated-v1.0.1',
    releaseCommit: '83ec96cc0045583f572bdc6b8166208d38cdff5d',
    configExport: 'DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'cosmotized-ilmenite-nails',
    version: 'cosmic-titanium-nails-guide-integrated-v1.1.0',
    releaseCommit: '11fb79459b056e4ae08456b4ecd100fba3f0785f',
    configExport: 'DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'cosmotized-ilmenite-nails',
    version: 'cosmic-titanium-nails-guide-integrated-v1.2.0',
    releaseCommit: 'c56d8f956379d025a8cf2a83ae0fd97a7fa0843c',
    configExport: 'DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'cosmotized-ilmenite-nails',
    version: 'cosmic-titanium-nails-guide-integrated-v1.3.0',
    releaseCommit: '1acce2901f968cf23470ea37a8f32fe470dc79e8',
    configExport: 'DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'exact-food-nails-v1',
  },
  {
    scenarioId: 'hardened-survey-plank',
    version: 'hardened-survey-plank-guide-integrated-v1.0.0',
    releaseCommit: '8fa42b2170875423fa77058f04b9fc6d19a0e73b',
    configExport: 'DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'hardened-survey-plank',
    version: 'hardened-survey-plank-guide-integrated-v1.1.0',
    releaseCommit: '1acce2901f968cf23470ea37a8f32fe470dc79e8',
    configExport: 'DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'mobile-work-stairs',
    version: 'mobile-work-stairs-guide-integrated-v1.0.0',
    releaseCommit: '8fa42b2170875423fa77058f04b9fc6d19a0e73b',
    configExport: 'DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'mobile-work-stairs',
    version: 'mobile-work-stairs-guide-integrated-v1.2.0',
    releaseCommit: '1acce2901f968cf23470ea37a8f32fe470dc79e8',
    configExport: 'DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'exact-food-stairs-v1',
  },
  {
    scenarioId: 'mobile-work-stairs',
    version: 'mobile-work-stairs-guide-integrated-v1.3.0',
    releaseCommit: '95b7ecc807ef7a23f0d10913d6520557f7eeff23',
    configExport: 'DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'exact-food-stairs-v2',
  },
  {
    scenarioId: 'survey-craftsmans-command-brew',
    version: 'survey-craftsmans-command-brew-guide-integrated-v1.0.0',
    releaseCommit: '827cf73781c7af155f0e5c5be46bc1db59f5542a',
    configExport: 'DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'survey-craftsmans-command-brew',
    version: 'survey-craftsmans-command-brew-guide-integrated-v1.1.0',
    releaseCommit: '60ff0e8537bd3392b23bbe078d34607eed253f9c',
    configExport: 'DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
  {
    scenarioId: 'survey-craftsmans-command-brew',
    version: 'survey-craftsmans-command-brew-guide-integrated-v1.2.0',
    releaseCommit: '5f8c375bfe4506345029e81b5a89838ff151e0a3',
    configExport: 'DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG',
    profileRouting: 'none',
  },
] as const
