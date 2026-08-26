import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  CRAFT_MECHANICS_VERSION,
  createInitialCraftState,
  type CrafterProfile,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  POC_SENSITIVITY_PROFILES,
  type EpisodePolicy,
} from '@frozen-rabbit-expert/simulator'
import {
  CRAFTER_MECHANICS_SIGNATURE_VERSION,
  POLICY_FEATURE_SCHEMA_VERSION,
  POLICY_OBJECTIVE_VERSION,
  assertCompactScorerCompatible,
  createBaselinePolicy,
  createDefaultContinuationPopulation,
  createDefaultPolicyPopulation,
  createQualityMaximumCrafterSafePolicy,
  compareRouteScores,
  compareDevelopmentPolicies,
  evaluatePolicyHeldOut,
  labelPolicyState,
  recommendCompactAction,
  sampleReachableStates,
  sealedPopulationEvidenceNotProvidedDecision,
  TARGET_CRAFTER_722,
  trainCompactScorer,
  crafterMechanicsSignature,
  normalizeCrafterProfile,
  type CompactScorerArtifact,
  type LabeledPolicyState,
  type PolicyPopulationEntry,
} from '@frozen-rabbit-expert/policy-lab'

interface TrainingCheckpoint {
  manifest: {
    version: 'targeted-policy-training-v6'
    mechanicsModelVersion: string
    objectiveVersion: typeof POLICY_OBJECTIVE_VERSION
    featureSchemaVersion: typeof POLICY_FEATURE_SCHEMA_VERSION
    recipeProfileId: string
    objectiveId: string
    qualityMaximum: number
    crafterMechanicsSignatureVersion: typeof CRAFTER_MECHANICS_SIGNATURE_VERSION
    crafterMechanicsSignature: string
    targetCrafter: CrafterProfile
    trainingSeed: number
    samplingSeeds: number[]
    heldOutSeeds: number[]
    conditionProfileIds: string[]
    policyPopulationIds: string[]
    continuationPolicyIds: string[]
    samplesPerProfile: number
    maxEpisodeSteps: number
    sourceStateClass: 'balanced-reachable-policy-population-with-buff-durations'
    candidateSpace: 'all-legal-non-catastrophic'
  }
  labels: LabeledPolicyState[]
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(argument(name, String(fallback)))
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`)
  return value
}

function seedSeries(count: number, start: number, stride: number): number[] {
  return Array.from({ length: count }, (_, index) => (start + Math.imul(index + 1, stride)) >>> 0)
}

function stateKey(state: CraftState): string {
  return JSON.stringify(state)
}

function saveJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const targetCrafter: CrafterProfile = normalizeCrafterProfile({
  ...TARGET_CRAFTER_722,
  maxCp: positiveInteger('max-cp', TARGET_CRAFTER_722.maxCp),
})
const maxStates = positiveInteger('max-states', 24)
const samplingSeedCount = positiveInteger('sampling-seeds', 8)
const heldOutSeedCount = positiveInteger('held-out-seeds', 24)
const samplesPerProfile = positiveInteger('samples-per-profile', 1)
const labelProfileCount = Math.min(POC_SENSITIVITY_PROFILES.length, positiveInteger('label-profile-count', 1))
const epochs = positiveInteger('epochs', 180)
const maxEpisodeSteps = positiveInteger('max-episode-steps', 36)
const timeLimitMinutes = Math.min(39, positiveInteger('time-limit-minutes', 38))
const trainingSeed = positiveInteger('training-seed', 1_786_440_942)
const continuationMode = argument('continuation-mode', 'broad')
if (!['broad', 'target-only', 'bootstrap-only'].includes(continuationMode)) {
  throw new Error('--continuation-mode must be broad, target-only, or bootstrap-only')
}
const outputDirectory = path.resolve(argument('output', path.join('.tmp', 'policy-training', 'current')))
const checkpointPath = path.join(outputDirectory, 'dataset.checkpoint.json')
const artifactPath = path.join(outputDirectory, 'artifact.json')
const reportPath = path.join(outputDirectory, 'report.json')
const samplingSeeds = seedSeries(samplingSeedCount, trainingSeed, 0x9e37_79b1)
const heldOutSeeds = seedSeries(heldOutSeedCount, 0x51a7_e001, 0x85eb_ca6b)
const labelProfiles = POC_SENSITIVITY_PROFILES.slice(0, labelProfileCount)
const startTime = Date.now()
const deadline = startTime + timeLimitMinutes * 60_000

let bootstrapArtifact: CompactScorerArtifact | null = null
const bootstrapPath = argument('bootstrap-artifact', '')
if (bootstrapPath) {
  bootstrapArtifact = JSON.parse(readFileSync(path.resolve(bootstrapPath), 'utf8')) as CompactScorerArtifact
  assertCompactScorerCompatible(
    bootstrapArtifact,
    COSMIC_TITANIUM_INGOT,
    COSMIC_TITANIUM_INGOT_OBJECTIVE,
    targetCrafter,
  )
}

const samplingPolicies: PolicyPopulationEntry[] = []
let bootstrapPolicyEntry: PolicyPopulationEntry | null = null
if (bootstrapArtifact) {
  const artifact = bootstrapArtifact
  bootstrapPolicyEntry = {
    id: `bootstrap-${artifact.version}`,
    policy: (recipe, crafter, state) => recommendCompactAction(
      artifact,
      recipe,
      COSMIC_TITANIUM_INGOT_OBJECTIVE,
      crafter,
      state,
    ),
  }
  samplingPolicies.push(bootstrapPolicyEntry)
}
const defaultPolicyPopulation = createDefaultPolicyPopulation(COSMIC_TITANIUM_INGOT_OBJECTIVE)
const defaultContinuationPopulation = createDefaultContinuationPopulation(
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
)
samplingPolicies.push(...defaultPolicyPopulation)
const continuationPolicies = continuationMode === 'target-only'
  ? defaultContinuationPopulation.filter((policy) => policy.id === 'quality-maximum-video-informed-v3')
  : continuationMode === 'bootstrap-only'
    ? (bootstrapPolicyEntry ? [bootstrapPolicyEntry] : [])
    : defaultContinuationPopulation
if (continuationPolicies.length === 0) throw new Error('No continuation policies selected')

const manifest: TrainingCheckpoint['manifest'] = {
  version: 'targeted-policy-training-v6',
  mechanicsModelVersion: CRAFT_MECHANICS_VERSION,
  objectiveVersion: POLICY_OBJECTIVE_VERSION,
  featureSchemaVersion: POLICY_FEATURE_SCHEMA_VERSION,
  recipeProfileId: COSMIC_TITANIUM_INGOT.profileId,
  objectiveId: COSMIC_TITANIUM_INGOT_OBJECTIVE.objectiveId,
  qualityMaximum: COSMIC_TITANIUM_INGOT.qualityMax,
  crafterMechanicsSignatureVersion: CRAFTER_MECHANICS_SIGNATURE_VERSION,
  crafterMechanicsSignature: crafterMechanicsSignature(COSMIC_TITANIUM_INGOT, targetCrafter),
  targetCrafter,
  trainingSeed,
  samplingSeeds,
  heldOutSeeds,
  conditionProfileIds: labelProfiles.map((profile) => profile.id),
  policyPopulationIds: samplingPolicies.map((policy) => policy.id),
  continuationPolicyIds: continuationPolicies.map((policy) => policy.id),
  samplesPerProfile,
  maxEpisodeSteps,
  sourceStateClass: 'balanced-reachable-policy-population-with-buff-durations',
  candidateSpace: 'all-legal-non-catastrophic',
}

let labels: LabeledPolicyState[] = []
const resumeCheckpointPath = argument('resume-checkpoint', checkpointPath)
try {
  const checkpoint = JSON.parse(readFileSync(resumeCheckpointPath, 'utf8')) as TrainingCheckpoint
  if (JSON.stringify(checkpoint.manifest) !== JSON.stringify(manifest)) {
    throw new Error('checkpoint manifest mismatch; refusing to mix labels from another objective, seed, profile, or horizon')
  }
  labels = checkpoint.labels
  console.log(`[resume] loaded ${labels.length} labels from ${resumeCheckpointPath}`)
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  if (code !== 'ENOENT') {
    throw new Error(
      `checkpoint is incompatible; choose a new output directory and retrain: ${(error as Error).message}`,
    )
  }
}

console.log(`[sampling] target=${targetCrafter.craftsmanship}/${targetCrafter.control}/${targetCrafter.maxCp}/tool-on maxStates=${maxStates} seeds=${samplingSeeds.length}`)
const states = sampleReachableStates({
  recipe: COSMIC_TITANIUM_INGOT,
  objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
  crafter: targetCrafter,
  initialStates: [createInitialCraftState(COSMIC_TITANIUM_INGOT, targetCrafter)],
  profiles: POC_SENSITIVITY_PROFILES,
  policies: samplingPolicies,
  seeds: samplingSeeds,
  maxEpisodeSteps,
  maxStates,
})
const completed = new Set(labels.map((label) => stateKey(label.state)))
console.log(`[sampling] collected=${states.length} already-labeled=${completed.size}`)
console.log(`[sampling] sources=${JSON.stringify(Object.fromEntries(
  [...new Set(states.map((sample) => sample.sourcePolicyId))]
    .map((id) => [id, states.filter((sample) => sample.sourcePolicyId === id).length]),
))}`)

for (const [index, sample] of states.entries()) {
  if (completed.has(stateKey(sample.state))) continue
  if (Date.now() >= deadline) {
    console.log(`[stop] ${timeLimitMinutes}-minute training deadline reached before state ${index + 1}`)
    break
  }
  const labelStart = Date.now()
  const label = labelPolicyState(
    COSMIC_TITANIUM_INGOT,
    COSMIC_TITANIUM_INGOT_OBJECTIVE,
    targetCrafter,
    sample.state,
    {
      profiles: labelProfiles,
      policies: continuationPolicies,
      samplesPerProfile,
      maxEpisodeSteps,
      seed: trainingSeed,
    },
  )
  if (label) {
    labels.push(label)
    completed.add(stateKey(label.state))
  }
  saveJson(checkpointPath, { manifest, labels } satisfies TrainingCheckpoint)
  console.log(`[label ${labels.length}/${states.length}] action=${label?.best.action ?? 'none'} source=${sample.sourcePolicyId} elapsed=${((Date.now() - labelStart) / 1_000).toFixed(2)}s total=${((Date.now() - startTime) / 1_000).toFixed(1)}s`)
}

if (labels.length === 0) throw new Error('No labeled states were produced')
const artifact = trainCompactScorer(
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  targetCrafter,
  labels,
  {
    epochs,
    learningRate: 0.08,
    l2: 0.0005,
    seed: trainingSeed,
  },
)
const compactPolicy: EpisodePolicy = (recipe, crafter, state) => recommendCompactAction(
  artifact,
  recipe,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  crafter,
  state,
)
const evaluationOptions = {
  objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
  profiles: POC_SENSITIVITY_PROFILES,
  seeds: heldOutSeeds,
  maxEpisodeSteps,
}
console.log(`[evaluation] held-out episodes per policy=${POC_SENSITIVITY_PROFILES.length * heldOutSeeds.length}`)
const initialStates = [createInitialCraftState(COSMIC_TITANIUM_INGOT, targetCrafter)]
const baselinePolicy = createBaselinePolicy(COSMIC_TITANIUM_INGOT_OBJECTIVE)
const targetCrafterSafePolicy = createQualityMaximumCrafterSafePolicy(COSMIC_TITANIUM_INGOT_OBJECTIVE)
const baseline = evaluatePolicyHeldOut(COSMIC_TITANIUM_INGOT, targetCrafter, initialStates, () => baselinePolicy, evaluationOptions)
const targetedReference = evaluatePolicyHeldOut(
  COSMIC_TITANIUM_INGOT,
  targetCrafter,
  initialStates,
  () => targetCrafterSafePolicy,
  evaluationOptions,
)
const candidate = evaluatePolicyHeldOut(COSMIC_TITANIUM_INGOT, targetCrafter, initialStates, () => compactPolicy, evaluationOptions)
const trainingCorrect = labels.filter((label) => compactPolicy(COSMIC_TITANIUM_INGOT, targetCrafter, label.state) === label.best.action).length
const bestReference = compareRouteScores(targetedReference.score, baseline.score) > 0 ? targetedReference : baseline
const developmentComparison = compareDevelopmentPolicies(bestReference, candidate)
const promotion = sealedPopulationEvidenceNotProvidedDecision()
const report = {
  generatedAt: new Date().toISOString(),
  elapsedSeconds: (Date.now() - startTime) / 1_000,
  targetCrafter,
  budget: { maxStates, samplingSeedCount, heldOutSeedCount, samplesPerProfile, labelProfileCount, epochs, maxEpisodeSteps, timeLimitMinutes },
  dataset: {
    labels: labels.length,
    trainingAccuracy: trainingCorrect / labels.length,
    sampledSourcePolicies: Object.fromEntries(
      [...new Set(states.map((sample) => sample.sourcePolicyId))]
        .map((id) => [id, states.filter((sample) => sample.sourcePolicyId === id).length]),
    ),
    labelActions: Object.fromEntries(
      [...new Set(labels.map((label) => label.best.action))]
        .map((action) => [action, labels.filter((label) => label.best.action === action).length]),
    ),
  },
  baseline,
  targetedReference,
  candidate,
  objectiveComparison: compareRouteScores(candidate.score, baseline.score),
  developmentComparison,
  promotion,
}
saveJson(artifactPath, artifact)
saveJson(reportPath, report)
console.log(JSON.stringify(report, null, 2))
console.log(`[output] checkpoint=${checkpointPath}`)
console.log(`[output] artifact=${artifactPath}`)
console.log(`[output] report=${reportPath}`)
