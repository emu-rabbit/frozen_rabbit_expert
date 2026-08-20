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
  resolveGuideScenarioPolicyBinding,
  type GuideIntegratedPolicyConfig,
  type GuideIntegratedPolicyVersion,
} from '@frozen-rabbit-expert/solver'

export const CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE = {
  equipmentProfiles: 'regression-seen-exact-player-profiles',
  conditions: 'assumed-development-sensitivity-only',
  seeds: 'paired-environment-independent-planner-development-v2',
  releaseUse: 'development-only-not-promotion-not-frozen-not-reserved',
} as const

interface ScenarioSeedNamespace {
  environmentNamespaceId: string
  plannerNamespaceId: string
  environmentSeedBase: number
  plannerSeedBase: number
}

/**
 * Seed ownership is keyed by canonical scenario identity, never array order.
 * Environment and planner bases are independently assigned constants; neither
 * namespace is calculated from the other.
 */
export const CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES = {
  'cosmotized-ilmenite-ingot': {
    environmentNamespaceId: 'environment-cosmotized-ilmenite-ingot-v1',
    plannerNamespaceId: 'planner-cosmotized-ilmenite-ingot-v1',
    environmentSeedBase: 0x434d_0000,
    plannerSeedBase: 0xa13c_6e2d,
  },
  'cosmotized-ilmenite-nails': {
    environmentNamespaceId: 'environment-cosmotized-ilmenite-nails-v1',
    plannerNamespaceId: 'planner-cosmotized-ilmenite-nails-v1',
    environmentSeedBase: 0x434e_0000,
    plannerSeedBase: 0xb74f_92c1,
  },
  'hardened-survey-plank': {
    environmentNamespaceId: 'environment-hardened-survey-plank-v1',
    plannerNamespaceId: 'planner-hardened-survey-plank-v1',
    environmentSeedBase: 0x434f_0000,
    plannerSeedBase: 0xc83d_57a9,
  },
  'mobile-work-stairs': {
    environmentNamespaceId: 'environment-mobile-work-stairs-v1',
    plannerNamespaceId: 'planner-mobile-work-stairs-v1',
    environmentSeedBase: 0x4350_0000,
    plannerSeedBase: 0xd25a_bf13,
  },
  'survey-craftsmans-command-brew': {
    environmentNamespaceId: 'environment-survey-craftsmans-command-brew-v1',
    plannerNamespaceId: 'planner-survey-craftsmans-command-brew-v1',
    environmentSeedBase: 0x4351_0000,
    plannerSeedBase: 0xe61b_48d7,
  },
} as const satisfies Record<CraftScenarioDataId, ScenarioSeedNamespace>

const ENVIRONMENT_SEED_STRIDE = 0x0000_9e37
const PLANNER_SEED_STRIDE = 0x85eb_ca6b

export interface CausalRootMpcDevelopmentScenario
  extends Omit<CraftScenarioDataEntry, 'scenarioId'> {
  scenarioId: CraftScenarioDataId
  baselinePolicyVersion: GuideIntegratedPolicyVersion
  baselineConfig: Readonly<GuideIntegratedPolicyConfig>
  assumedConditionProfiles: readonly Readonly<WeightedConditionProfile>[]
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
  const baseline = resolveGuideScenarioPolicyBinding(entry.scenarioId)
  return {
    ...entry,
    baselinePolicyVersion: baseline.policyVersion,
    baselineConfig: baseline.config,
    assumedConditionProfiles: assumedConditionProfiles(entry.recipe),
  }
}) satisfies readonly CausalRootMpcDevelopmentScenario[]

export interface PairedDevelopmentSeed {
  corpusId: typeof CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE.seeds
  scenarioId: CraftScenarioDataId
  seedIndex: number
  environmentSeed: number
  baselineEnvironmentSeed: number
  causalEnvironmentSeed: number
  plannerSeed: number
}

function scenarioSeedNamespace(scenarioId: CraftScenarioDataId): Readonly<ScenarioSeedNamespace> {
  const namespace = CAUSAL_ROOT_MPC_SCENARIO_SEED_NAMESPACES[scenarioId]
  if (namespace === undefined) throw new Error(`unknown scenarioId seed namespace: ${scenarioId}`)
  return namespace
}

function seedAt(base: number, stride: number, seedIndex: number): number {
  return (base + Math.imul(seedIndex + 1, stride)) >>> 0
}

function assertUint32Seed(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must be an unsigned 32-bit integer`)
  }
}

function expectedDevelopmentSeed(
  scenarioId: CraftScenarioDataId,
  seedIndex: number,
): PairedDevelopmentSeed {
  const namespace = scenarioSeedNamespace(scenarioId)
  const environmentSeed = seedAt(
    namespace.environmentSeedBase,
    ENVIRONMENT_SEED_STRIDE,
    seedIndex,
  )
  const plannerSeed = seedAt(namespace.plannerSeedBase, PLANNER_SEED_STRIDE, seedIndex)
  if (environmentSeed === plannerSeed) {
    throw new Error(`seed namespaces collided for ${scenarioId} at index ${seedIndex}`)
  }
  return {
    corpusId: CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE.seeds,
    scenarioId,
    seedIndex,
    environmentSeed,
    baselineEnvironmentSeed: environmentSeed,
    causalEnvironmentSeed: environmentSeed,
    plannerSeed,
  }
}

export function pairedDevelopmentSeeds(
  scenarioId: CraftScenarioDataId,
  count: number,
): readonly PairedDevelopmentSeed[] {
  scenarioSeedNamespace(scenarioId)
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError('count must be a positive safe integer')
  }
  return Array.from({ length: count }, (_, seedIndex) => (
    expectedDevelopmentSeed(scenarioId, seedIndex)
  ))
}

function assertPairedDevelopmentSeed(seed: Readonly<PairedDevelopmentSeed>): void {
  if (!Number.isInteger(seed.seedIndex) || seed.seedIndex < 0 || seed.seedIndex > 0xffff_ffff) {
    throw new Error('paired development seedIndex must be an unsigned 32-bit integer')
  }
  for (const key of [
    'environmentSeed',
    'baselineEnvironmentSeed',
    'causalEnvironmentSeed',
    'plannerSeed',
  ] as const) assertUint32Seed(seed[key], `paired development ${key}`)
  const expected = expectedDevelopmentSeed(seed.scenarioId, seed.seedIndex)
  for (const key of [
    'corpusId',
    'scenarioId',
    'environmentSeed',
    'baselineEnvironmentSeed',
    'causalEnvironmentSeed',
    'plannerSeed',
  ] as const) {
    if (seed[key] !== expected[key]) {
      throw new Error(`paired development seed evidence mismatch: ${key}`)
    }
  }
}

export function createPairedEpisodeRandomStreams(seed: Readonly<PairedDevelopmentSeed>): {
  baseline: EpisodeRandomStream
  causal: EpisodeRandomStream
} {
  assertPairedDevelopmentSeed(seed)
  return {
    baseline: createEpisodeRandomStream(seed.baselineEnvironmentSeed),
    causal: createEpisodeRandomStream(seed.causalEnvironmentSeed),
  }
}
