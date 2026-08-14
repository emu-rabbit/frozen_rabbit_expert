import {
  CRAFT_SCENARIO_DATA,
  type CraftScenarioDataEntry,
  type CraftScenarioDataId,
} from '@frozen-rabbit-expert/data'
import type { RecipeProfile } from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  ELEVATING_PLATFORMS_SENSITIVITY_PROFILES,
  POC_SENSITIVITY_PROFILES,
  assertConditionProfileCompatible,
  createEpisodeRandomStream,
  type EpisodeRandomStream,
  type WeightedConditionProfile,
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
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
} from '@frozen-rabbit-expert/solver'

export const CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE = {
  equipmentProfiles: 'regression-seen-exact-player-profiles',
  conditions: 'assumed-development-sensitivity-only',
  seeds: 'paired-common-random-numbers-development-v1',
  releaseUse: 'development-only-not-promotion-not-frozen-not-reserved',
} as const

export interface CausalRootMpcDevelopmentScenario extends CraftScenarioDataEntry {
  baselinePolicyVersion: GuideIntegratedPolicyVersion
  baselineConfig: Readonly<GuideIntegratedPolicyConfig>
  assumedConditionProfiles: readonly Readonly<WeightedConditionProfile>[]
}

interface BaselineBinding {
  policyVersion: GuideIntegratedPolicyVersion
  config: Readonly<GuideIntegratedPolicyConfig>
}

function baselineBinding(scenarioId: CraftScenarioDataId): BaselineBinding {
  switch (scenarioId) {
    case 'cosmotized-ilmenite-ingot':
      return {
        policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
        config: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
      }
    case 'cosmotized-ilmenite-nails':
      return {
        policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
        config: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
      }
    case 'hardened-survey-plank':
      return {
        policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
        config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
      }
    case 'mobile-work-stairs':
      return {
        policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
        config: DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
      }
    case 'survey-craftsmans-command-brew':
      return {
        policyVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
        config: DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
      }
    default: {
      const unsupportedScenario: never = scenarioId
      throw new Error(`missing baseline binding for ${String(unsupportedScenario)}`)
    }
  }
}

function assumedConditionProfiles(
  recipe: Readonly<RecipeProfile>,
): readonly Readonly<WeightedConditionProfile>[] {
  let profiles: readonly Readonly<WeightedConditionProfile>[]
  switch (recipe.missionFamily) {
    case 'sinus-ardorum-explus-equipment-materials-i':
      profiles = POC_SENSITIVITY_PROFILES
      break
    case 'sinus-ardorum-explus-elevating-platforms':
      profiles = ELEVATING_PLATFORMS_SENSITIVITY_PROFILES
      break
    case 'sinus-ardorum-ex-artisans-mixtures':
      profiles = COMMAND_BREW_SENSITIVITY_PROFILES
      break
    default:
      throw new Error(`missing assumed condition family for ${recipe.profileId}`)
  }
  for (const profile of profiles) {
    assertConditionProfileCompatible(recipe, profile)
    if (profile.evidence !== 'assumption') {
      throw new Error(`development condition profile ${profile.id} must be assumption-only`)
    }
  }
  return profiles
}

export const CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS = CRAFT_SCENARIO_DATA.map((entry) => {
  const baseline = baselineBinding(entry.scenarioId)
  return {
    ...entry,
    baselinePolicyVersion: baseline.policyVersion,
    baselineConfig: baseline.config,
    assumedConditionProfiles: assumedConditionProfiles(entry.recipe),
  }
}) satisfies readonly CausalRootMpcDevelopmentScenario[]

export interface PairedDevelopmentSeed {
  corpusId: typeof CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE.seeds
  seed: number
  baselineSeed: number
  causalSeed: number
}

export function pairedDevelopmentSeeds(
  scenarioIndex: number,
  count: number,
): readonly PairedDevelopmentSeed[] {
  if (!Number.isSafeInteger(scenarioIndex) || scenarioIndex < 0) {
    throw new RangeError('scenarioIndex must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError('count must be a positive safe integer')
  }
  const base = (0x434d_0000 + Math.imul(scenarioIndex, 0x1_0000)) >>> 0
  return Array.from({ length: count }, (_, index) => {
    const seed = (base + Math.imul(index + 1, 0x9e37)) >>> 0
    return {
      corpusId: CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE.seeds,
      seed,
      baselineSeed: seed,
      causalSeed: seed,
    }
  })
}

export function createPairedEpisodeRandomStreams(seed: Readonly<PairedDevelopmentSeed>): {
  baseline: EpisodeRandomStream
  causal: EpisodeRandomStream
} {
  if (seed.baselineSeed !== seed.seed || seed.causalSeed !== seed.seed) {
    throw new Error('paired development arms must use the same seed identity')
  }
  return {
    baseline: createEpisodeRandomStream(seed.baselineSeed),
    causal: createEpisodeRandomStream(seed.causalSeed),
  }
}
