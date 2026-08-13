import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  HARDENED_SURVEY_PLANK,
  HARDENED_SURVEY_PLANK_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
  estimateHqChancePercentFromCommunityTable,
  estimateMobileWorkStairsExpectedMissionPoints,
  type PlayerEquipmentProfile,
} from '@frozen-rabbit-expert/data'
import {
  ACTIONS,
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  BALANCED_COMMAND_BREW_CONDITIONS,
  BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
  GOOD_SCARCE_MALLEABLE_STRESS_COMMAND_BREW_CONDITIONS,
  NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
  NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
  NORMAL_HEAVY_POC_CONDITIONS,
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
  RESOURCE_SCARCE_ELEVATING_PLATFORMS_CONDITIONS,
  RESOURCE_SCARCE_POC_CONDITIONS,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import {
  HISTORICAL_POLICY_RELEASES,
  type HistoricalPolicyRelease,
  type ScorecardScenarioId,
} from './registry'

interface ScorecardScenario {
  id: ScorecardScenarioId
  recipe: RecipeProfile
  objective: CraftObjective
  primaryProfile: WeightedConditionProfile
  stressProfiles: readonly WeightedConditionProfile[]
}

interface HistoricalPolicyModule {
  createGuideIntegratedPolicyFactory: (
    config: Readonly<Record<string, unknown>>,
    objective?: Readonly<CraftObjective>,
  ) => () => EpisodePolicy
  [exportName: string]: unknown
}

interface ConditionSlice {
  profile: WeightedConditionProfile
  role: 'practical-primary' | 'stress-minority'
  seeds: readonly number[]
}

interface EpisodeKey {
  equipmentId: string
  conditionProfileId: string
  seed: number
}

interface EvaluatedEpisode extends EpisodeKey {
  conditionRole: ConditionSlice['role']
  result: EpisodeTraceResult
  safetyViolations: number
}

const SCENARIOS: readonly ScorecardScenario[] = [
  {
    id: 'cosmotized-ilmenite-ingot',
    recipe: COSMIC_TITANIUM_INGOT,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
    primaryProfile: PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
    stressProfiles: [NORMAL_HEAVY_POC_CONDITIONS, RESOURCE_SCARCE_POC_CONDITIONS],
  },
  {
    id: 'cosmotized-ilmenite-nails',
    recipe: COSMIC_TITANIUM_NAILS,
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    primaryProfile: PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
    stressProfiles: [NORMAL_HEAVY_POC_CONDITIONS, RESOURCE_SCARCE_POC_CONDITIONS],
  },
  {
    id: 'hardened-survey-plank',
    recipe: HARDENED_SURVEY_PLANK,
    objective: HARDENED_SURVEY_PLANK_OBJECTIVE,
    primaryProfile: BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
    stressProfiles: [
      NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
      RESOURCE_SCARCE_ELEVATING_PLATFORMS_CONDITIONS,
    ],
  },
  {
    id: 'mobile-work-stairs',
    recipe: MOBILE_WORK_STAIRS,
    objective: MOBILE_WORK_STAIRS_OBJECTIVE,
    primaryProfile: BALANCED_ELEVATING_PLATFORMS_CONDITIONS,
    stressProfiles: [
      NORMAL_HEAVY_ELEVATING_PLATFORMS_CONDITIONS,
      RESOURCE_SCARCE_ELEVATING_PLATFORMS_CONDITIONS,
    ],
  },
  {
    id: 'survey-craftsmans-command-brew',
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
    primaryProfile: BALANCED_COMMAND_BREW_CONDITIONS,
    stressProfiles: [
      NORMAL_HEAVY_COMMAND_BREW_CONDITIONS,
      GOOD_SCARCE_MALLEABLE_STRESS_COMMAND_BREW_CONDITIONS,
    ],
  },
] as const

const SCORECARD_VERSION = 'solver-growth-scorecard-v1'
const DEFAULT_PRIMARY_SEEDS = 64
const DEFAULT_STRESS_SEEDS = 4
const MAX_STEPS = 80
const SEED_STRIDE = 0x85eb_ca6b
const root = process.cwd()
const moduleCache = new Map<string, Promise<HistoricalPolicyModule>>()

function optionValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] ?? null
}

function positiveIntegerOption(name: string, fallback: number): number {
  const raw = optionValue(name)
  if (raw === null) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function seeds(seedStart: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => (
    seedStart + Math.imul(index + 1, SEED_STRIDE)
  ) >>> 0)
}

function conditionSlices(scenarioIndex: number, scenario: ScorecardScenario): readonly ConditionSlice[] {
  const primaryCount = positiveIntegerOption('--primary-seeds', DEFAULT_PRIMARY_SEEDS)
  const stressCount = positiveIntegerOption('--stress-seeds', DEFAULT_STRESS_SEEDS)
  const base = (0x5343_0000 + scenarioIndex * 0x1_0000) >>> 0
  return [
    {
      profile: scenario.primaryProfile,
      role: 'practical-primary',
      seeds: seeds(base + 0x1000, primaryCount),
    },
    ...scenario.stressProfiles.map((profile, index) => ({
      profile,
      role: 'stress-minority' as const,
      seeds: seeds(base + 0x2000 + index * 0x1000, stressCount),
    })),
  ]
}

async function loadHistoricalModule(release: HistoricalPolicyRelease): Promise<HistoricalPolicyModule> {
  const cached = moduleCache.get(release.releaseCommit)
  if (cached !== undefined) return cached
  const promise = (async () => {
    const snapshotDirectory = path.join(root, '.tmp', 'solver-scorecard-snapshots', release.releaseCommit)
    const archivedSourceFiles = [
      'guideIntegratedPolicy.ts',
      'policySafety.ts',
      'boundedRiskFinisher.ts',
      'finisherCertificate.ts',
      'types.ts',
    ] as const
    const entry = path.join(snapshotDirectory, archivedSourceFiles[0])
    const output = path.join(snapshotDirectory, 'guideIntegratedPolicy.mjs')
    mkdirSync(snapshotDirectory, { recursive: true })
    for (const fileName of archivedSourceFiles) {
      const source = execFileSync(
        'git',
        ['show', `${release.releaseCommit}:packages/solver/src/${fileName}`],
        { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      )
      writeFileSync(path.join(snapshotDirectory, fileName), source, 'utf8')
    }
    const build = spawnSync(process.execPath, [
      path.join(root, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
      entry,
      '--file', output,
      '--format', 'esm',
      '--platform', 'node',
    ], { cwd: root, stdio: 'inherit' })
    if (build.status !== 0) {
      throw new Error(`failed to build archived policy source at ${release.releaseCommit}`)
    }
    return import(`${pathToFileURL(output).href}?built=${Date.now()}`) as Promise<HistoricalPolicyModule>
  })()
  moduleCache.set(release.releaseCommit, promise)
  return promise
}

function isExactFoodMedicineProfile(crafter: CrafterProfile): boolean {
  return crafter.craftsmanship === 5408
    && crafter.control === 5237
    && crafter.maxCp === 749
    && crafter.cosmicToolGoodBonus === true
    && crafter.specialist !== true
}

function routedConfig(
  release: HistoricalPolicyRelease,
  crafter: CrafterProfile,
  baseConfig: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!isExactFoodMedicineProfile(crafter)) return baseConfig
  if (release.profileRouting === 'exact-food-nails-v1') {
    return { ...baseConfig, progressFloorBeforeQuality: 0.75, greatStridesQuality: 0.70 }
  }
  if (release.profileRouting === 'exact-food-stairs-v1') {
    return {
      ...baseConfig,
      allowSpecialistActions: false,
      adaptiveByregotCashoutCpCeiling: 100,
      adaptiveByregotMinimumProjectedQualityRatio: 0.75,
    }
  }
  if (release.profileRouting === 'exact-food-stairs-v2') {
    return {
      ...baseConfig,
      allowSpecialistActions: false,
      adaptiveByregotCashoutCpCeiling: 100,
      adaptiveByregotMinimumProjectedQualityRatio: 0.75,
      adaptiveGoodQualityExtensionActionBudget: 36,
      adaptiveGoodQualityExtensionActionFloor: 30,
      consumeMalleableBeforeVeneration: true,
    }
  }
  return baseConfig
}

async function evaluateEpisode(
  archived: HistoricalPolicyModule,
  release: HistoricalPolicyRelease,
  scenario: ScorecardScenario,
  equipment: PlayerEquipmentProfile,
  slice: ConditionSlice,
  seed: number,
): Promise<EvaluatedEpisode> {
  const exported = archived[release.configExport]
  if (exported === undefined || exported === null || typeof exported !== 'object') {
    throw new Error(`${release.version} is missing ${release.configExport}`)
  }
  const config = routedConfig(
    release,
    equipment.crafter,
    exported as Readonly<Record<string, unknown>>,
  )
  const policy = archived.createGuideIntegratedPolicyFactory(config, scenario.objective)()
  let safetyViolations = 0
  const audited: EpisodePolicy = (recipe, crafter, state) => {
    const action = policy(recipe, crafter, state)
    if (action !== null && (
      !legalActions(recipe, crafter, state).includes(action)
      || !isPolicyActionSafe(recipe, crafter, state, action)
    )) safetyViolations += 1
    return action
  }
  const initialState = createInitialCraftState(scenario.recipe, equipment.crafter)
  const firstAction = audited(scenario.recipe, equipment.crafter, initialState)
  const result: EpisodeTraceResult = firstAction === null
    ? {
        terminal: 'none',
        finalState: initialState,
        actions: [],
        steps: [],
        stoppedByLimit: false,
        stopReason: 'policy-null',
      }
    : runEpisodeTrace({
        recipe: scenario.recipe,
        crafter: equipment.crafter,
        initialState,
        firstAction,
        policy: audited,
        random: createEpisodeRandomStream(seed),
        conditionProfile: slice.profile,
        maxSteps: MAX_STEPS,
      })
  return {
    equipmentId: equipment.id,
    conditionProfileId: slice.profile.id,
    conditionRole: slice.role,
    seed,
    result,
    safetyViolations,
  }
}

function mechanicsCompleted(scenario: ScorecardScenario, episode: EvaluatedEpisode): boolean {
  return episode.result.terminal === 'completed'
    && episode.result.finalState.progress >= scenario.recipe.progressRequired
}

function objectiveCompleted(scenario: ScorecardScenario, episode: EvaluatedEpisode): boolean {
  if (!mechanicsCompleted(scenario, episode)) return false
  return scenario.objective.mode !== 'required-quality'
    || episode.result.finalState.quality >= scenario.objective.qualityTarget
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function summarize(
  scenario: ScorecardScenario,
  equipment: PlayerEquipmentProfile,
  episodes: readonly EvaluatedEpisode[],
) {
  const completed = episodes.filter((episode) => mechanicsCompleted(scenario, episode))
  const valid = episodes.filter((episode) => objectiveCompleted(scenario, episode))
  const quality = completed.map((episode) => episode.result.finalState.quality).sort((a, b) => a - b)
  const specialistActions = ['carefulObservation', 'heartAndSoul', 'quickInnovation'] as const
  const primary = episodes.filter((episode) => episode.conditionRole === 'practical-primary')
  const stress = episodes.filter((episode) => episode.conditionRole === 'stress-minority')
  const shared = {
    episodes: episodes.length,
    mechanicsCompletions: completed.length,
    objectiveCompletions: valid.length,
    practicalPrimary: {
      episodes: primary.length,
      mechanicsCompletions: primary.filter((episode) => mechanicsCompleted(scenario, episode)).length,
      objectiveCompletions: primary.filter((episode) => objectiveCompleted(scenario, episode)).length,
    },
    stressMinority: {
      episodes: stress.length,
      mechanicsCompletions: stress.filter((episode) => mechanicsCompleted(scenario, episode)).length,
      objectiveCompletions: stress.filter((episode) => objectiveCompleted(scenario, episode)).length,
    },
    completedQuality: {
      minimum: quality[0] ?? 0,
      p10: percentile(quality, 0.1),
      median: percentile(quality, 0.5),
      p90: percentile(quality, 0.9),
      maximum: quality.at(-1) ?? 0,
      average: average(quality),
    },
    averageActions: average(episodes.map((episode) => episode.result.actions.length)),
    stopReasons: Object.fromEntries(
      ['completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit'].map((reason) => [
        reason,
        episodes.filter((episode) => episode.result.stopReason === reason).length,
      ]),
    ),
    safetyViolations: episodes.reduce((sum, episode) => sum + episode.safetyViolations, 0),
    specialistActionInvocations: Object.fromEntries(specialistActions.map((action) => [
      action,
      episodes.reduce(
        (sum, episode) => sum + episode.result.actions.filter((used) => used === action).length,
        0,
      ),
    ])),
  }
  if (scenario.id === 'cosmotized-ilmenite-ingot') {
    return {
      ...shared,
      missionScale: {
        fixedPointsPerValidCraft: 80,
        completionWeightedAveragePoints: valid.length * 80 / episodes.length,
      },
    }
  }
  if (scenario.id === 'cosmotized-ilmenite-nails') {
    return {
      ...shared,
      missionScale: {
        highQuality24660: completed.filter((episode) => episode.result.finalState.quality >= 24_660).length,
        maximumMissionScoreQuality27100: completed.filter((episode) => episode.result.finalState.quality >= 27_100).length,
        note: '24660 is only the verified 700-1000 band floor; it is not a Silver or 1000-point threshold.',
      },
    }
  }
  if (scenario.id === 'mobile-work-stairs') {
    const hqChance = completed.map((episode) => estimateHqChancePercentFromCommunityTable(
      episode.result.finalState.quality,
      scenario.recipe.qualityMax,
    ))
    const completionWeightedPoints = episodes.map((episode) => mechanicsCompleted(scenario, episode)
      ? estimateMobileWorkStairsExpectedMissionPoints(
          episode.result.finalState.quality,
          scenario.recipe.qualityMax,
        )
      : 0)
    return {
      ...shared,
      missionScale: {
        fullQuality: completed.filter((episode) => episode.result.finalState.quality >= 22_500).length,
        averageProvisionalHqChancePercentWhenCompleted: average(hqChance),
        completionWeightedAverageProvisionalMissionPoints: average(completionWeightedPoints),
        note: 'HQ chance and expected points use the versioned provisional community curve, not an in-game Recipe 36208 oracle.',
      },
    }
  }
  if (scenario.id === 'survey-craftsmans-command-brew') {
    return {
      ...shared,
      missionScale: {
        verifiedHighQuality10200: completed.filter((episode) => episode.result.finalState.quality >= 10_200).length,
        provisional800PointProxy10800: completed.filter((episode) => episode.result.finalState.quality >= 10_800).length,
        fullQuality12000: completed.filter((episode) => episode.result.finalState.quality >= 12_000).length,
        note: '10800 is a provisional interpolation proxy, not a verified exact 800-point threshold.',
      },
    }
  }
  return shared
}

function comparisonTuple(scenario: ScorecardScenario, episode: EvaluatedEpisode): readonly number[] {
  const completed = mechanicsCompleted(scenario, episode)
  const valid = objectiveCompleted(scenario, episode)
  const quality = episode.result.finalState.quality
  const actionEfficiency = -episode.result.actions.length
  if (scenario.id === 'cosmotized-ilmenite-ingot' || scenario.id === 'hardened-survey-plank') {
    return [Number(valid), valid ? actionEfficiency : 0]
  }
  if (scenario.id === 'cosmotized-ilmenite-nails') {
    return [Number(completed), Number(completed && quality >= 27_100), Number(completed && quality >= 24_660), completed ? quality : 0, actionEfficiency]
  }
  if (scenario.id === 'mobile-work-stairs') {
    return [
      Number(completed),
      completed ? estimateMobileWorkStairsExpectedMissionPoints(quality, scenario.recipe.qualityMax) : 0,
      completed ? quality : 0,
      actionEfficiency,
    ]
  }
  return [
    Number(completed),
    Number(completed && quality >= 12_000),
    Number(completed && quality >= 10_800),
    Number(completed && quality >= 10_200),
    completed ? quality : 0,
    actionEfficiency,
  ]
}

function compareTuples(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function keyOf(episode: EpisodeKey): string {
  return `${episode.equipmentId}|${episode.conditionProfileId}|${episode.seed}`
}

function pairedGrowth(
  scenario: ScorecardScenario,
  baseline: readonly EvaluatedEpisode[],
  candidate: readonly EvaluatedEpisode[],
) {
  const baselineByKey = new Map(baseline.map((episode) => [keyOf(episode), episode]))
  let wins = 0
  let losses = 0
  let ties = 0
  for (const episode of candidate) {
    const peer = baselineByKey.get(keyOf(episode))
    if (peer === undefined) throw new Error(`missing paired baseline episode ${keyOf(episode)}`)
    const comparison = compareTuples(comparisonTuple(scenario, episode), comparisonTuple(scenario, peer))
    if (comparison > 0) wins += 1
    else if (comparison < 0) losses += 1
    else ties += 1
  }
  return { wins, losses, ties }
}

const requestedScenario = optionValue('--scenario')
if (requestedScenario !== null && !SCENARIOS.some((scenario) => scenario.id === requestedScenario)) {
  throw new RangeError(`unknown --scenario ${requestedScenario}`)
}
const selectedScenarios = SCENARIOS.filter((scenario) => (
  requestedScenario === null || scenario.id === requestedScenario
))

const scenarioReports = []
for (const [scenarioIndex, scenario] of selectedScenarios.entries()) {
  const slices = conditionSlices(scenarioIndex, scenario)
  const releases = HISTORICAL_POLICY_RELEASES.filter((release) => release.scenarioId === scenario.id)
  const releaseRuns = []
  for (const release of releases) {
    const archived = await loadHistoricalModule(release)
    const episodes: EvaluatedEpisode[] = []
    for (const equipment of PLAYER_EQUIPMENT_PROFILES) {
      for (const slice of slices) {
        for (const seed of slice.seeds) {
          episodes.push(await evaluateEpisode(archived, release, scenario, equipment, slice, seed))
        }
      }
    }
    releaseRuns.push({ release, episodes })
  }
  const firstRun = releaseRuns[0]!
  const currentRun = releaseRuns.at(-1)!
  scenarioReports.push({
    scenarioId: scenario.id,
    recipeProfileId: scenario.recipe.profileId,
    recipeDisplayName: scenario.recipe.displayName,
    objectiveId: scenario.objective.objectiveId,
    conditionMix: slices.map((slice) => {
      const normal = Math.max(0, slice.profile.weights.normal ?? 0)
      const total = Object.values(slice.profile.weights).reduce((sum, weight) => sum + Math.max(0, weight ?? 0), 0)
      return {
        profileId: slice.profile.id,
        evidence: slice.profile.evidence,
        role: slice.role,
        episodesPerEquipment: slice.seeds.length,
        modeledNormalShare: total === 0 ? 1 : normal / total,
        modeledColoredShare: total === 0 ? 0 : 1 - normal / total,
      }
    }),
    releases: releaseRuns.map(({ release, episodes }, index) => ({
      version: release.version,
      releaseCommit: release.releaseCommit,
      historicalReplay: 'archived policy and solver-helper source evaluated against current checkout mechanics/data',
      equipment: PLAYER_EQUIPMENT_PROFILES.map((equipment) => ({
        equipmentProfileId: equipment.id,
        equipmentLabel: equipment.label,
        summary: summarize(
          scenario,
          equipment,
          episodes.filter((episode) => episode.equipmentId === equipment.id),
        ),
        growthVsPrevious: index === 0 ? null : pairedGrowth(
          scenario,
          releaseRuns[index - 1]!.episodes.filter((episode) => episode.equipmentId === equipment.id),
          episodes.filter((episode) => episode.equipmentId === equipment.id),
        ),
        growthVsFirst: index === 0 ? null : pairedGrowth(
          scenario,
          firstRun.episodes.filter((episode) => episode.equipmentId === equipment.id),
          episodes.filter((episode) => episode.equipmentId === equipment.id),
        ),
      })),
    })),
    currentVersusFirstAllEquipment: pairedGrowth(scenario, firstRun.episodes, currentRun.episodes),
  })
}

const report = {
  scorecardVersion: SCORECARD_VERSION,
  generatedAt: new Date().toISOString(),
  mechanicsAndDataBasis: 'current checkout',
  interpretation: {
    purpose: 'Normalized growth comparison across every published recipe policy and all three fixed player equipment profiles.',
    conditionWeighting: 'The practical-primary slice dominates. Two harder assumed profiles are retained as a small minority so stress sensitivity remains visible without underestimating practical play.',
    historicalReplay: 'Archived release policy, certificate, bounded-risk, and safety-helper source is replayed against the current checkout mechanics/data. This isolates solver growth but is not a historical binary/runtime reproduction.',
    probabilityBoundary: 'IID condition sensitivity is not a real transition model or real-world success probability.',
  },
  primarySeedsPerEquipment: positiveIntegerOption('--primary-seeds', DEFAULT_PRIMARY_SEEDS),
  seedsPerStressProfilePerEquipment: positiveIntegerOption('--stress-seeds', DEFAULT_STRESS_SEEDS),
  equipmentProfiles: PLAYER_EQUIPMENT_PROFILES,
  scenarios: scenarioReports,
}

const outputPath = optionValue('--output')
if (outputPath === null) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const resolved = path.resolve(root, outputPath)
  mkdirSync(path.dirname(resolved), { recursive: true })
  writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${resolved}`)
}
