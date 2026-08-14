import {
  ACTION_IDS,
  CRAFT_MECHANICS_VERSION,
  assertCraftObjective,
  legalActions,
  type CraftActionId,
  type CraftObjective,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import {
  CRAFTER_MECHANICS_SIGNATURE_VERSION,
  crafterMechanicsSignature,
  crafterProfileGroupKey,
  normalizeCrafterProfile,
  type NormalizedCrafterProfile,
} from './crafterPopulation'
import {
  encodePolicyState,
  POLICY_FEATURE_SCHEMA,
  POLICY_FEATURE_SCHEMA_VERSION,
} from './features'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'
import { POLICY_OBJECTIVE_VERSION } from './objective'
import type { LabeledPolicyState } from './types'

export const COMPACT_SCORER_VERSION = 'offline-compact-action-scorer-poc-v0.8.0'

export interface CompactScorerObjectiveIdentity {
  objectiveId: string
  mode: CraftObjective['mode']
  qualityTarget: number
}

export interface CompactScorerArtifact {
  version: typeof COMPACT_SCORER_VERSION
  objectiveVersion: typeof POLICY_OBJECTIVE_VERSION
  featureSchemaVersion: typeof POLICY_FEATURE_SCHEMA_VERSION
  mechanicsModelVersion: typeof CRAFT_MECHANICS_VERSION
  recipeProfileId: string
  objective: CompactScorerObjectiveIdentity
  crafterProfile: NormalizedCrafterProfile
  crafterMechanicsSignatureVersion: typeof CRAFTER_MECHANICS_SIGNATURE_VERSION
  crafterMechanicsSignature: string
  featureSchema: readonly string[]
  actions: readonly CraftActionId[]
  hiddenWeights: number[][]
  hiddenBiases: number[]
  weights: number[][]
  biases: number[]
  training: {
    examples: number
    epochs: number
    learningRate: number
    l2: number
    seed: number
    hiddenUnits: number
  }
}

export interface CompactScorerTrainingOptions {
  epochs?: number
  learningRate?: number
  l2?: number
  seed?: number
  hiddenUnits?: number
}

function createRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0
    return value / 4_294_967_296
  }
}

function softmax(logits: readonly number[]): number[] {
  const max = Math.max(...logits)
  const exponents = logits.map((value) => Math.exp(value - max))
  const total = exponents.reduce((sum, value) => sum + value, 0)
  return exponents.map((value) => value / total)
}

export function trainCompactScorer(
  recipe: RecipeProfile,
  objective: Readonly<CraftObjective>,
  crafter: CrafterProfile,
  labels: readonly LabeledPolicyState[],
  options: CompactScorerTrainingOptions = {},
): CompactScorerArtifact {
  assertCraftObjective(recipe, objective)
  if (labels.some((label) => label.objectiveId !== objective.objectiveId)) {
    throw new Error(`compact scorer labels do not belong to objective ${objective.objectiveId}`)
  }
  if (labels.length === 0) throw new Error('Compact scorer training requires labeled states')
  const epochs = Math.max(1, options.epochs ?? 120)
  const learningRate = options.learningRate ?? 0.08
  const l2 = options.l2 ?? 0.0005
  const seed = options.seed ?? 0x51a7_e001
  const hiddenUnits = Math.max(4, options.hiddenUnits ?? 64)
  const random = createRandom(seed)
  const hiddenScale = Math.sqrt(6 / (POLICY_FEATURE_SCHEMA.length + hiddenUnits))
  const outputScale = Math.sqrt(6 / (hiddenUnits + ACTION_IDS.length))
  const hiddenWeights = Array.from({ length: hiddenUnits }, () => (
    POLICY_FEATURE_SCHEMA.map(() => (random() * 2 - 1) * hiddenScale)
  ))
  const hiddenBiases = Array.from({ length: hiddenUnits }, () => 0)
  const weights = ACTION_IDS.map(() => (
    Array.from({ length: hiddenUnits }, () => (random() * 2 - 1) * outputScale)
  ))
  const biases = ACTION_IDS.map(() => 0)
  const examples = labels.map((label) => ({
    features: encodePolicyState(recipe, objective, crafter, label.state),
    target: ACTION_IDS.indexOf(label.best.action),
  }))
  const normalizedCrafter = normalizeCrafterProfile(crafter)

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const order = examples.map((_, index) => index)
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      ;[order[index], order[swap]] = [order[swap]!, order[index]!]
    }
    const rate = learningRate / (1 + epoch * 0.01)
    for (const exampleIndex of order) {
      const example = examples[exampleIndex]!
      const hidden = hiddenWeights.map((hiddenUnitWeights, hiddenIndex) => Math.tanh(
        hiddenUnitWeights.reduce(
          (sum, weight, featureIndex) => sum + weight * example.features[featureIndex]!,
          hiddenBiases[hiddenIndex]!,
        ),
      ))
      const logits = weights.map((actionWeights, actionIndex) => (
        actionWeights.reduce((sum, weight, hiddenIndex) => sum + weight * hidden[hiddenIndex]!, biases[actionIndex]!)
      ))
      const probabilities = softmax(logits)
      const errors = probabilities.map((probability, actionIndex) => (
        probability - Number(actionIndex === example.target)
      ))
      const hiddenErrors = hidden.map((hiddenValue, hiddenIndex) => (
        (1 - hiddenValue * hiddenValue) * weights.reduce(
          (sum, actionWeights, actionIndex) => sum + actionWeights[hiddenIndex]! * errors[actionIndex]!,
          0,
        )
      ))
      for (let actionIndex = 0; actionIndex < ACTION_IDS.length; actionIndex += 1) {
        const error = errors[actionIndex]!
        biases[actionIndex]! -= rate * error
        for (let hiddenIndex = 0; hiddenIndex < hidden.length; hiddenIndex += 1) {
          const weight = weights[actionIndex]![hiddenIndex]!
          weights[actionIndex]![hiddenIndex] = weight - rate * (error * hidden[hiddenIndex]! + l2 * weight)
        }
      }
      for (let hiddenIndex = 0; hiddenIndex < hiddenUnits; hiddenIndex += 1) {
        hiddenBiases[hiddenIndex]! -= rate * hiddenErrors[hiddenIndex]!
        for (let featureIndex = 0; featureIndex < example.features.length; featureIndex += 1) {
          const weight = hiddenWeights[hiddenIndex]![featureIndex]!
          hiddenWeights[hiddenIndex]![featureIndex] = weight - rate * (
            hiddenErrors[hiddenIndex]! * example.features[featureIndex]! + l2 * weight
          )
        }
      }
    }
  }

  return {
    version: COMPACT_SCORER_VERSION,
    objectiveVersion: POLICY_OBJECTIVE_VERSION,
    featureSchemaVersion: POLICY_FEATURE_SCHEMA_VERSION,
    mechanicsModelVersion: CRAFT_MECHANICS_VERSION,
    recipeProfileId: recipe.profileId,
    objective: {
      objectiveId: objective.objectiveId,
      mode: objective.mode,
      qualityTarget: objective.qualityTarget,
    },
    crafterProfile: normalizedCrafter,
    crafterMechanicsSignatureVersion: CRAFTER_MECHANICS_SIGNATURE_VERSION,
    crafterMechanicsSignature: crafterMechanicsSignature(recipe, normalizedCrafter),
    featureSchema: POLICY_FEATURE_SCHEMA,
    actions: ACTION_IDS,
    hiddenWeights,
    hiddenBiases,
    weights,
    biases,
    training: { examples: labels.length, epochs, learningRate, l2, seed, hiddenUnits },
  }
}

/** Refuses silent use outside the exact environment represented by the artifact. */
export function assertCompactScorerCompatible(
  artifact: CompactScorerArtifact,
  recipe: RecipeProfile,
  objective: Readonly<CraftObjective>,
  crafter: CrafterProfile,
): void {
  assertCraftObjective(recipe, objective)
  if (artifact.version !== COMPACT_SCORER_VERSION) {
    throw new Error(`compact scorer version mismatch: ${String(artifact.version)}; retraining required`)
  }
  if (artifact.objectiveVersion !== POLICY_OBJECTIVE_VERSION) {
    throw new Error(`compact scorer objective version mismatch: ${String(artifact.objectiveVersion)}; retraining required`)
  }
  if (artifact.featureSchemaVersion !== POLICY_FEATURE_SCHEMA_VERSION) {
    throw new Error(`compact scorer feature schema version mismatch: ${String(artifact.featureSchemaVersion)}; retraining required`)
  }
  if (artifact.mechanicsModelVersion !== CRAFT_MECHANICS_VERSION) {
    throw new Error(`compact scorer mechanics model version mismatch: ${String(artifact.mechanicsModelVersion)}; retraining required`)
  }
  if (artifact.recipeProfileId !== recipe.profileId) {
    throw new Error(`compact scorer recipe mismatch: ${String(artifact.recipeProfileId)}`)
  }
  if (
    artifact.objective?.objectiveId !== objective.objectiveId
    || artifact.objective?.mode !== objective.mode
    || artifact.objective?.qualityTarget !== objective.qualityTarget
  ) {
    throw new Error(`compact scorer objective identity mismatch: ${String(artifact.objective?.objectiveId)}`)
  }
  if (artifact.crafterProfile?.specialist !== true && artifact.crafterProfile?.specialist !== false) {
    throw new Error('compact scorer crafter profile is not normalized')
  }
  const normalizedCrafter = normalizeCrafterProfile(crafter)
  if (crafterProfileGroupKey(artifact.crafterProfile) !== crafterProfileGroupKey(normalizedCrafter)) {
    throw new Error('compact scorer crafter profile mismatch')
  }
  if (artifact.crafterMechanicsSignatureVersion !== CRAFTER_MECHANICS_SIGNATURE_VERSION) {
    throw new Error(`compact scorer crafter mechanics signature version mismatch: ${String(artifact.crafterMechanicsSignatureVersion)}; retraining required`)
  }
  const expectedMechanicsSignature = crafterMechanicsSignature(recipe, normalizedCrafter)
  if (artifact.crafterMechanicsSignature !== expectedMechanicsSignature) {
    throw new Error('compact scorer crafter mechanics signature mismatch')
  }
  if (JSON.stringify(artifact.featureSchema) !== JSON.stringify(POLICY_FEATURE_SCHEMA)) {
    throw new Error('compact scorer feature schema mismatch; retraining required')
  }
  if (JSON.stringify(artifact.actions) !== JSON.stringify(ACTION_IDS)) {
    throw new Error('compact scorer action schema mismatch; retraining required')
  }
  if (
    artifact.training === undefined
    || artifact.hiddenWeights.length !== artifact.training.hiddenUnits
    || artifact.hiddenBiases.length !== artifact.training.hiddenUnits
    || artifact.weights.length !== ACTION_IDS.length
    || artifact.biases.length !== ACTION_IDS.length
    || artifact.hiddenWeights.some((row) => row.length !== POLICY_FEATURE_SCHEMA.length)
    || artifact.weights.some((row) => row.length !== artifact.training.hiddenUnits)
  ) {
    throw new Error('compact scorer tensor shape mismatch')
  }
  const parameters = [
    ...artifact.hiddenWeights.flat(),
    ...artifact.hiddenBiases,
    ...artifact.weights.flat(),
    ...artifact.biases,
  ]
  if (parameters.some((value) => !Number.isFinite(value))) {
    throw new Error('compact scorer contains non-finite parameters')
  }
}

export function compactActionScores(
  artifact: CompactScorerArtifact,
  recipe: RecipeProfile,
  objective: Readonly<CraftObjective>,
  crafter: CrafterProfile,
  state: CraftState,
): Array<{ action: CraftActionId; score: number }> {
  assertCompactScorerCompatible(artifact, recipe, objective, crafter)
  const features = encodePolicyState(recipe, objective, crafter, state)
  const hidden = artifact.hiddenWeights.map((hiddenUnitWeights, hiddenIndex) => Math.tanh(
    hiddenUnitWeights.reduce(
      (sum, weight, featureIndex) => sum + weight * features[featureIndex]!,
      artifact.hiddenBiases[hiddenIndex]!,
    ),
  ))
  const legal = new Set(legalActions(recipe, crafter, state))
  return artifact.actions
    .map((action, actionIndex) => ({
      action,
      score: artifact.weights[actionIndex]!.reduce(
        (sum, weight, hiddenIndex) => sum + weight * hidden[hiddenIndex]!,
        artifact.biases[actionIndex]!,
      ),
    }))
    .filter((candidate) => legal.has(candidate.action) && isPolicyActionSafe(recipe, crafter, state, candidate.action))
    .sort((left, right) => right.score - left.score || left.action.localeCompare(right.action))
}

export function recommendCompactAction(
  artifact: CompactScorerArtifact,
  recipe: RecipeProfile,
  objective: Readonly<CraftObjective>,
  crafter: CrafterProfile,
  state: CraftState,
): CraftActionId | null {
  return compactActionScores(
    artifact,
    recipe,
    objective,
    crafter,
    state,
  )[0]?.action ?? null
}
