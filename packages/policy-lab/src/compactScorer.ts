import {
  ACTION_IDS,
  legalActions,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { encodePolicyState, POLICY_FEATURE_SCHEMA } from './features'
import type { LabeledPolicyState } from './types'

export const COMPACT_SCORER_VERSION = 'offline-compact-action-scorer-poc-v0.1.0'

export interface CompactScorerArtifact {
  version: typeof COMPACT_SCORER_VERSION
  featureSchema: readonly string[]
  actions: readonly CraftActionId[]
  weights: number[][]
  biases: number[]
  training: {
    examples: number
    epochs: number
    learningRate: number
    l2: number
    seed: number
  }
}

export interface CompactScorerTrainingOptions {
  epochs?: number
  learningRate?: number
  l2?: number
  seed?: number
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
  crafter: CrafterProfile,
  labels: readonly LabeledPolicyState[],
  options: CompactScorerTrainingOptions = {},
): CompactScorerArtifact {
  if (labels.length === 0) throw new Error('Compact scorer training requires labeled states')
  const epochs = Math.max(1, options.epochs ?? 120)
  const learningRate = options.learningRate ?? 0.08
  const l2 = options.l2 ?? 0.0005
  const seed = options.seed ?? 0x51a7_e001
  const random = createRandom(seed)
  const weights = ACTION_IDS.map(() => POLICY_FEATURE_SCHEMA.map(() => (random() - 0.5) * 0.01))
  const biases = ACTION_IDS.map(() => 0)
  const examples = labels.map((label) => ({
    features: encodePolicyState(recipe, crafter, label.state),
    target: ACTION_IDS.indexOf(label.best.action),
  }))

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const order = examples.map((_, index) => index)
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      ;[order[index], order[swap]] = [order[swap]!, order[index]!]
    }
    const rate = learningRate / (1 + epoch * 0.01)
    for (const exampleIndex of order) {
      const example = examples[exampleIndex]!
      const logits = weights.map((actionWeights, actionIndex) => (
        actionWeights.reduce((sum, weight, featureIndex) => sum + weight * example.features[featureIndex]!, biases[actionIndex]!)
      ))
      const probabilities = softmax(logits)
      for (let actionIndex = 0; actionIndex < ACTION_IDS.length; actionIndex += 1) {
        const error = probabilities[actionIndex]! - Number(actionIndex === example.target)
        biases[actionIndex]! -= rate * error
        for (let featureIndex = 0; featureIndex < example.features.length; featureIndex += 1) {
          const weight = weights[actionIndex]![featureIndex]!
          weights[actionIndex]![featureIndex] = weight - rate * (error * example.features[featureIndex]! + l2 * weight)
        }
      }
    }
  }

  return {
    version: COMPACT_SCORER_VERSION,
    featureSchema: POLICY_FEATURE_SCHEMA,
    actions: ACTION_IDS,
    weights,
    biases,
    training: { examples: labels.length, epochs, learningRate, l2, seed },
  }
}

export function compactActionScores(
  artifact: CompactScorerArtifact,
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
): Array<{ action: CraftActionId; score: number }> {
  const features = encodePolicyState(recipe, crafter, state)
  const legal = new Set(legalActions(recipe, crafter, state))
  return artifact.actions
    .map((action, actionIndex) => ({
      action,
      score: artifact.weights[actionIndex]!.reduce(
        (sum, weight, featureIndex) => sum + weight * features[featureIndex]!,
        artifact.biases[actionIndex]!,
      ),
    }))
    .filter((candidate) => legal.has(candidate.action))
    .sort((left, right) => right.score - left.score || left.action.localeCompare(right.action))
}

export function recommendCompactAction(
  artifact: CompactScorerArtifact,
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
): CraftActionId | null {
  return compactActionScores(artifact, recipe, crafter, state)[0]?.action ?? null
}
