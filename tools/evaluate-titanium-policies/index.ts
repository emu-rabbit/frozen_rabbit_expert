import { performance } from 'node:perf_hooks'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  PLAYER_EQUIPMENT_PROFILES,
  type PlayerEquipmentProfile,
} from '@frozen-rabbit-expert/data'
import {
  ACTIONS,
  createInitialCraftState,
  legalActions,
  type CraftActionId,
  type CraftObjective,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  DEVELOPMENT_CORPUS,
  FROZEN_VALIDATION_CORPUS,
  NAILS_DEVELOPMENT_CORPUS,
  NAILS_FROZEN_VALIDATION_CORPUS,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS,
  POC_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_POLICY_VERSION,
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
  resolvePlayerProfilePolicyConfig,
  type GuideIntegratedPolicyConfig,
} from '@frozen-rabbit-expert/solver'

type ScenarioId = 'ingot' | 'nails'

interface TitaniumScenario {
  id: ScenarioId
  recipe: RecipeProfile
  objective: CraftObjective
  policyVersion: string
  corpus: typeof DEVELOPMENT_CORPUS
  defaultConfig: Readonly<GuideIntegratedPolicyConfig>
}

interface EvaluatedEpisode {
  conditionProfileId: string
  seed: number
  result: EpisodeTraceResult
  safetyViolations: number
  latencies: number[]
}

const TITANIUM_SCENARIOS: readonly TitaniumScenario[] = [
  {
    id: 'ingot',
    recipe: COSMIC_TITANIUM_INGOT,
    objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
    policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
    corpus: DEVELOPMENT_CORPUS,
    defaultConfig: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
  {
    id: 'nails',
    recipe: COSMIC_TITANIUM_NAILS,
    objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
    policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
    corpus: NAILS_DEVELOPMENT_CORPUS,
    defaultConfig: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  },
]

const requestedCorpusRole = optionValue('--corpus') ?? 'development'
if (requestedCorpusRole !== 'development' && requestedCorpusRole !== 'frozen-validation') {
  throw new RangeError('--corpus must be development or frozen-validation')
}

const SPECIALIST_ACTIONS = ['carefulObservation', 'heartAndSoul', 'quickInnovation'] as const
const STOP_REASONS = [
  'completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit',
] as const
const maxSteps = 80
const compactOutput = process.argv.includes('--compact')
const bypassPlayerProfileRouter = process.argv.includes('--bypass-player-profile-router')

function jointProgressPrefixModeOption(name: string): boolean | null {
  const mode = optionValue(name)
  if (mode === null) return null
  if (mode !== 'allow' && mode !== 'forbid') {
    throw new RangeError(`${name} must be allow or forbid`)
  }
  return mode === 'allow'
}

function optionValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] ?? null
}

function positiveIntegerOption(name: string, fallback: number): number {
  const raw = optionValue(name)
  const value = raw === null ? fallback : Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function finiteNumberOption(name: string): number | null {
  const raw = optionValue(name)
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`)
  return value
}

function percentile(sortedSamples: readonly number[], fraction: number): number {
  return sortedSamples[Math.max(0, Math.ceil(sortedSamples.length * fraction) - 1)] ?? 0
}

function wilson95(successes: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 0 }
  const z = 1.959963984540054
  const observed = successes / total
  const denominator = 1 + z * z / total
  const center = (observed + z * z / (2 * total)) / denominator
  const spread = z * Math.sqrt(observed * (1 - observed) / total + z * z / (4 * total * total)) / denominator
  return { low: Math.max(0, center - spread), high: Math.min(1, center + spread) }
}

function taskValidCompletion(scenario: TitaniumScenario, result: EpisodeTraceResult): boolean {
  if (result.terminal !== 'completed') return false
  if (result.finalState.progress < scenario.recipe.progressRequired) return false
  return scenario.objective.mode === 'required-quality'
    ? result.finalState.quality >= scenario.objective.qualityTarget
    : true
}

function candidateConfig(
  baseline: Readonly<GuideIntegratedPolicyConfig>,
): GuideIntegratedPolicyConfig {
  const specialistMode = optionValue('--candidate-specialist-actions')
  if (specialistMode !== null && specialistMode !== 'allow' && specialistMode !== 'forbid') {
    throw new RangeError('--candidate-specialist-actions must be allow or forbid')
  }
  const overrides = {
    progressFloorBeforeQuality: finiteNumberOption('--candidate-progress-floor'),
    balanceTolerance: finiteNumberOption('--candidate-balance-tolerance'),
    greatStridesQuality: finiteNumberOption('--candidate-great-strides-quality'),
    freeQualityCpFloor: finiteNumberOption('--candidate-free-quality-cp-floor'),
    maxManipulation: finiteNumberOption('--candidate-max-manipulation'),
    maxInnovation: finiteNumberOption('--candidate-max-innovation'),
  }
  return {
    ...baseline,
    ...(overrides.progressFloorBeforeQuality === null ? {} : { progressFloorBeforeQuality: overrides.progressFloorBeforeQuality }),
    ...(overrides.balanceTolerance === null ? {} : { balanceTolerance: overrides.balanceTolerance }),
    ...(overrides.greatStridesQuality === null ? {} : { greatStridesQuality: overrides.greatStridesQuality }),
    ...(overrides.freeQualityCpFloor === null ? {} : { freeQualityCpFloor: overrides.freeQualityCpFloor }),
    ...(overrides.maxManipulation === null ? {} : { maxManipulation: overrides.maxManipulation }),
    ...(overrides.maxInnovation === null ? {} : { maxInnovation: overrides.maxInnovation }),
    ...(specialistMode === null ? {} : { allowSpecialistActions: specialistMode === 'allow' }),
    ...(process.argv.includes('--candidate-joint-progress-prefix')
      ? { requiredQualityProgressPrefixCertificate: true }
      : {}),
  }
}

function runOne(
  scenario: TitaniumScenario,
  equipment: PlayerEquipmentProfile,
  conditionProfile: WeightedConditionProfile,
  seed: number,
  config: Readonly<GuideIntegratedPolicyConfig>,
): EvaluatedEpisode {
  const policy = createGuideIntegratedPolicyFactory(config, scenario.objective)()
  let safetyViolations = 0
  const latencies: number[] = []
  const audited: EpisodePolicy = (recipe, crafter, state) => {
    const startedAt = performance.now()
    const action = policy(recipe, crafter, state)
    latencies.push(performance.now() - startedAt)
    if (action !== null && (
      !legalActions(recipe, crafter, state).includes(action)
      || !isPolicyActionSafe(recipe, crafter, state, action)
    )) safetyViolations += 1
    return action
  }
  const initialState = createInitialCraftState(scenario.recipe, equipment.crafter)
  const firstAction = audited(scenario.recipe, equipment.crafter, initialState)
  if (firstAction === null) {
    return {
      conditionProfileId: conditionProfile.id,
      seed,
      safetyViolations,
      latencies,
      result: {
        terminal: 'none',
        finalState: initialState,
        actions: [],
        stoppedByLimit: false,
        stopReason: 'policy-null',
        steps: [],
      },
    }
  }
  return {
    conditionProfileId: conditionProfile.id,
    seed,
    safetyViolations,
    latencies,
    result: runEpisodeTrace({
      recipe: scenario.recipe,
      crafter: equipment.crafter,
      initialState,
      firstAction,
      policy: audited,
      random: createEpisodeRandomStream(seed),
      conditionProfile,
      maxSteps,
    }),
  }
}

function summarize(
  scenario: TitaniumScenario,
  equipment: PlayerEquipmentProfile,
  episodes: readonly EvaluatedEpisode[],
) {
  const valid = episodes.filter(({ result }) => taskValidCompletion(scenario, result))
  const qualities = valid.map(({ result }) => result.finalState.quality).sort((a, b) => a - b)
  const latencies = episodes.flatMap((episode) => episode.latencies).sort((a, b) => a - b)
  const actionCount = (action: CraftActionId) => episodes.reduce(
    (sum, episode) => sum + episode.result.actions.filter((used) => used === action).length,
    0,
  )
  const specialistActions = Object.fromEntries(SPECIALIST_ACTIONS.map((action) => [action, actionCount(action)]))
  const specialistInvocations = Object.values(specialistActions).reduce((sum, count) => sum + count, 0)
  const taskCompletion = {
    count: valid.length,
    total: episodes.length,
    rate: valid.length / Math.max(1, episodes.length),
    wilson95: wilson95(valid.length, episodes.length),
  }
  const tierMinimum = (id: string) => scenario.objective.qualityTiers.find((tier) => tier.id === id)?.minimumQuality ?? 0
  const scored = tierMinimum('scored')
  const mid = tierMinimum('mid')
  const high = tierMinimum('high')
  const target = scenario.objective.qualityTarget
  const lowestOutcomeExamples = [...episodes]
    .sort((left, right) => (
      Number(taskValidCompletion(scenario, left.result)) - Number(taskValidCompletion(scenario, right.result))
      || Math.min(
        left.result.finalState.progress / scenario.recipe.progressRequired,
        left.result.finalState.quality / target,
      ) - Math.min(
        right.result.finalState.progress / scenario.recipe.progressRequired,
        right.result.finalState.quality / target,
      )
    ))
    .slice(0, 5)
    .map((episode) => ({
      conditionProfileId: episode.conditionProfileId,
      seed: episode.seed,
      stopReason: episode.result.stopReason,
      finalState: episode.result.finalState,
      actions: episode.result.actions,
      failedRiskActions: episode.result.steps
        .filter((step) => !step.success)
        .map((step) => step.action),
    }))
  return {
    equipmentProfileId: equipment.id,
    equipmentLabel: equipment.label,
    crafter: equipment.crafter,
    taskCompletion,
    terminalCompleted: episodes.filter(({ result }) => result.terminal === 'completed').length,
    invalidTerminalCompletions: episodes.filter(({ result }) => (
      result.terminal === 'completed' && !taskValidCompletion(scenario, result)
    )).length,
    stopReasons: Object.fromEntries(STOP_REASONS.map((reason) => [
      reason,
      episodes.filter(({ result }) => result.stopReason === reason).length,
    ])),
    outcomeDeficits: {
      progressOnly: episodes.filter(({ result }) => (
        result.finalState.progress < scenario.recipe.progressRequired
        && result.finalState.quality >= scenario.objective.qualityTarget
      )).length,
      qualityOnly: episodes.filter(({ result }) => (
        result.finalState.progress >= scenario.recipe.progressRequired
        && result.finalState.quality < scenario.objective.qualityTarget
      )).length,
      both: episodes.filter(({ result }) => (
        result.finalState.progress < scenario.recipe.progressRequired
        && result.finalState.quality < scenario.objective.qualityTarget
      )).length,
    },
    quality: {
      minimum: qualities[0] ?? 0,
      p10: percentile(qualities, 0.1),
      median: percentile(qualities, 0.5),
      p90: percentile(qualities, 0.9),
      maximum: qualities.at(-1) ?? 0,
      average: qualities.reduce((sum, quality) => sum + quality, 0) / Math.max(1, qualities.length),
    },
    missionScale: scenario.id === 'nails' ? {
      exactKnownBands: {
        belowScored: valid.filter(({ result }) => result.finalState.quality < scored).length,
        oneHundredPoints: valid.filter(({ result }) => result.finalState.quality >= scored && result.finalState.quality < mid).length,
        threeHundredPoints: valid.filter(({ result }) => result.finalState.quality >= mid && result.finalState.quality < high).length,
        variableSevenHundredToOneThousand: valid.filter(({ result }) => result.finalState.quality >= high && result.finalState.quality < target).length,
        maximumMissionScoreQuality: valid.filter(({ result }) => result.finalState.quality >= target).length,
      },
      qualityTail: {
        highTier: valid.filter(({ result }) => result.finalState.quality >= high).length,
        atLeast95PercentOfTarget: valid.filter(({ result }) => result.finalState.quality >= Math.ceil(target * 0.95)).length,
        atLeast97PercentOfTarget: valid.filter(({ result }) => result.finalState.quality >= Math.ceil(target * 0.97)).length,
        atLeast97Point5PercentOfTarget: valid.filter(({ result }) => result.finalState.quality >= Math.ceil(target * 0.975)).length,
        maximumMissionScoreQuality: valid.filter(({ result }) => result.finalState.quality >= target).length,
      },
      note: 'The exact score mapping inside collectability 2466-2710 is unknown; no linear interpolation or Silver-rate claim is made.',
    } : {
      requiredQualityTarget: target,
      fullQualityCompletions: valid.length,
    },
    specialist: {
      enabledByProfile: equipment.crafter.specialist === true,
      invocations: specialistInvocations,
      invocationsPerEpisode: specialistInvocations / Math.max(1, episodes.length),
      invocationsPerTaskCompletion: valid.length === 0 ? null : specialistInvocations / valid.length,
      actions: specialistActions,
      consumableUnits: null,
      note: 'Exact delineation consumption is not modeled; specialist action invocations are not consumable units.',
    },
    safetyViolations: episodes.reduce((sum, episode) => sum + episode.safetyViolations, 0),
    averageActions: episodes.reduce((sum, episode) => sum + episode.result.actions.length, 0) / Math.max(1, episodes.length),
    byConditionProfile: Object.fromEntries(conditionProfiles.map((profile) => {
      const group = episodes.filter((episode) => episode.conditionProfileId === profile.id)
      const groupValid = group.filter(({ result }) => taskValidCompletion(scenario, result))
      return [profile.id, {
        evidence: profile.evidence,
        taskCompletions: groupValid.length,
        episodes: group.length,
        highTier: scenario.id === 'nails'
          ? groupValid.filter(({ result }) => result.finalState.quality >= high).length
          : null,
      }]
    })),
    latency: {
      measuredStates: latencies.length,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      p99Ms: percentile(latencies, 0.99),
      maximumMs: latencies.at(-1) ?? 0,
    },
    lowestOutcomeExamples,
  }
}

function pairedComparison(
  scenario: TitaniumScenario,
  baseline: readonly EvaluatedEpisode[],
  candidate: readonly EvaluatedEpisode[],
) {
  if (baseline.length !== candidate.length) throw new Error('paired runs must have equal lengths')
  let wins = 0
  let losses = 0
  let ties = 0
  let candidateOnlyTaskCompletions = 0
  let baselineOnlyTaskCompletions = 0
  let candidateHigherQualityWhenBothComplete = 0
  let baselineHigherQualityWhenBothComplete = 0
  for (let index = 0; index < baseline.length; index += 1) {
    const left = baseline[index]!
    const right = candidate[index]!
    if (left.seed !== right.seed || left.conditionProfileId !== right.conditionProfileId) {
      throw new Error('paired runs must use identical seed and condition-profile keys')
    }
    const leftValid = taskValidCompletion(scenario, left.result)
    const rightValid = taskValidCompletion(scenario, right.result)
    if (rightValid && !leftValid) candidateOnlyTaskCompletions += 1
    if (leftValid && !rightValid) baselineOnlyTaskCompletions += 1
    if (leftValid && rightValid) {
      if (right.result.finalState.quality > left.result.finalState.quality) candidateHigherQualityWhenBothComplete += 1
      if (left.result.finalState.quality > right.result.finalState.quality) baselineHigherQualityWhenBothComplete += 1
    }
    const comparison = Number(rightValid) - Number(leftValid)
      || (leftValid && rightValid && scenario.id === 'nails'
        ? right.result.finalState.quality - left.result.finalState.quality
        : 0)
      || (leftValid && rightValid ? left.result.actions.length - right.result.actions.length : 0)
    if (comparison > 0) wins += 1
    else if (comparison < 0) losses += 1
    else ties += 1
  }
  const specialistInvocationCount = (episodes: readonly EvaluatedEpisode[]) => episodes.reduce(
    (sum, episode) => sum + episode.result.actions.filter((action) => ACTIONS[action].specialistOnly === true).length,
    0,
  )
  return {
    wins,
    losses,
    ties,
    candidateOnlyTaskCompletions,
    baselineOnlyTaskCompletions,
    candidateHigherQualityWhenBothComplete,
    baselineHigherQualityWhenBothComplete,
    candidateMinusBaselineSpecialistInvocations:
      specialistInvocationCount(candidate) - specialistInvocationCount(baseline),
  }
}

const requestedScenario = optionValue('--scenario')
if (requestedScenario !== null && requestedScenario !== 'ingot' && requestedScenario !== 'nails') {
  throw new RangeError('--scenario must be ingot or nails')
}
const scenarios = TITANIUM_SCENARIOS.filter((scenario) => requestedScenario === null || scenario.id === requestedScenario)
const requestedEquipment = optionValue('--equipment-profile')
const equipmentProfiles = PLAYER_EQUIPMENT_PROFILES.filter((profile) => (
  requestedEquipment === null || profile.id === requestedEquipment
))
if (equipmentProfiles.length === 0) throw new Error(`unknown player equipment profile: ${requestedEquipment}`)
const observedOnly = process.argv.includes('--observed-only')
const assumedOnly = process.argv.includes('--assumed-only')
if (observedOnly && assumedOnly) {
  throw new RangeError('--observed-only and --assumed-only are mutually exclusive')
}
const conditionProfiles: readonly WeightedConditionProfile[] = observedOnly
  ? [PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS]
  : assumedOnly
    ? POC_SENSITIVITY_PROFILES
    : [...POC_SENSITIVITY_PROFILES, PLAYER_OBSERVED_INGOT_MARGINAL_CONDITIONS]

const evaluations = scenarios.map((scenario) => {
  const evaluationCorpus = requestedCorpusRole === 'development'
    ? scenario.corpus
    : scenario.id === 'ingot'
      ? FROZEN_VALIDATION_CORPUS
      : NAILS_FROZEN_VALIDATION_CORPUS
  const availableSeeds = corpusSeeds(evaluationCorpus)
  const seedCount = positiveIntegerOption('--seed-count', Math.min(16, availableSeeds.length))
  if (seedCount > availableSeeds.length) {
    throw new RangeError(`--seed-count must be no greater than ${availableSeeds.length} for ${scenario.id}`)
  }
  const seeds = availableSeeds.slice(0, seedCount)
  const baselineJointProgressPrefix = jointProgressPrefixModeOption('--baseline-joint-progress-prefix')
  const baselineConfig = {
    ...scenario.defaultConfig,
    ...(baselineJointProgressPrefix === null
      ? {}
      : { requiredQualityProgressPrefixCertificate: baselineJointProgressPrefix }),
  }
  const configuredCandidate = candidateConfig(baselineConfig)
  return {
    scenarioId: scenario.id,
    recipeProfileId: scenario.recipe.profileId,
    objective: scenario.objective,
    policyVersion: scenario.policyVersion,
    corpus: {
      ...evaluationCorpus,
      selectedSeedsPerConditionProfile: seedCount,
      seedSubset: seedCount !== evaluationCorpus.seedsPerConditionProfile,
      conditionProfiles: conditionProfiles.map((profile) => ({ id: profile.id, evidence: profile.evidence })),
    },
    baselineConfig,
    candidateConfig: configuredCandidate,
    equipment: equipmentProfiles.map((equipment) => {
      const routedBaselineConfig = bypassPlayerProfileRouter
        ? baselineConfig
        : resolvePlayerProfilePolicyConfig(
            scenario.id === 'ingot' ? 'cosmotized-ilmenite-ingot' : 'cosmotized-ilmenite-nails',
            equipment.crafter,
          )
      const resolvedBaselineConfig = {
        ...routedBaselineConfig,
        ...(baselineJointProgressPrefix === null
          ? {}
          : { requiredQualityProgressPrefixCertificate: baselineJointProgressPrefix }),
      }
      // Resolve the deployed exact-profile route first, then apply candidate
      // flags. This preserves explicit zeros/forbid values from the CLI.
      const resolvedCandidateConfig = candidateConfig(resolvedBaselineConfig)
      const resolvedCandidateMatchesBaseline = JSON.stringify(resolvedCandidateConfig) === JSON.stringify(resolvedBaselineConfig)
      const baseline = conditionProfiles.flatMap((profile) => seeds.map((seed) => (
        runOne(scenario, equipment, profile, seed, resolvedBaselineConfig)
      )))
      const candidate = resolvedCandidateMatchesBaseline
        ? baseline
        : conditionProfiles.flatMap((profile) => seeds.map((seed) => (
            runOne(scenario, equipment, profile, seed, resolvedCandidateConfig)
          )))
      return {
        candidateReusedBaseline: resolvedCandidateMatchesBaseline,
        resolvedBaselineConfig,
        resolvedCandidateConfig,
        baseline: summarize(scenario, equipment, baseline),
        candidate: summarize(scenario, equipment, candidate),
        paired: pairedComparison(scenario, baseline, candidate),
      }
    }),
  }
})

function compactSummary(summary: ReturnType<typeof summarize>) {
  return {
    equipmentProfileId: summary.equipmentProfileId,
    equipmentLabel: summary.equipmentLabel,
    taskCompletion: summary.taskCompletion,
    stopReasons: summary.stopReasons,
    outcomeDeficits: summary.outcomeDeficits,
    quality: summary.quality,
    missionScale: summary.missionScale,
    specialistInvocations: summary.specialist.invocations,
    safetyViolations: summary.safetyViolations,
    byConditionProfile: summary.byConditionProfile,
    latency: summary.latency,
  }
}

const reportedEvaluations = compactOutput
  ? evaluations.map(({ scenarioId, recipeProfileId, policyVersion, corpus, equipment }) => ({
      scenarioId,
      recipeProfileId,
      policyVersion,
      corpus: {
        id: corpus.id,
        role: corpus.role,
        selectedSeedsPerConditionProfile: corpus.selectedSeedsPerConditionProfile,
        conditionProfiles: corpus.conditionProfiles,
      },
      equipment: equipment.map(({
        candidateReusedBaseline,
        resolvedBaselineConfig,
        resolvedCandidateConfig,
        baseline,
        candidate,
        paired,
      }) => ({
        candidateReusedBaseline,
        resolvedBaselineConfig,
        resolvedCandidateConfig,
        baseline: compactSummary(baseline),
        candidate: compactSummary(candidate),
        paired,
      })),
    }))
  : evaluations

console.log(JSON.stringify({
  interpretation: assumedOnly
    ? 'Versioned frozen sensitivity across three assumed condition profiles for the exact three player equipment profiles. These are stress-model estimates, not real-world probabilities.'
    : observedOnly
      ? 'Versioned IID replay of one observed 95-condition marginal for the exact three player equipment profiles. This is not a recipe transition oracle or real-world probability.'
      : 'Versioned sensitivity across three assumed profiles plus one observed 95-condition IID marginal. The profiles are equally weighted diagnostics, not a real-world probability mixture.',
  maxSteps,
  evaluations: reportedEvaluations,
}, null, 2))
