import type {
  CraftActionId,
  CrafterProfile,
  CraftState,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type { EpisodePolicy, WeightedConditionProfile } from '@frozen-rabbit-expert/simulator'

export interface PolicyPopulationEntry {
  id: string
  policy: EpisodePolicy
}

export interface OfflineLabOptions {
  profiles: readonly WeightedConditionProfile[]
  policies: readonly PolicyPopulationEntry[]
  samplesPerProfile: number
  maxEpisodeSteps: number
  seed: number
}

export interface RouteScore {
  robustCompletionRate: number
  averageCompletionRate: number
  failureRate: number
  lowerTailBalance: number
  averageSuccessfulCp: number
  averageSuccessfulDurability: number
  averageSteps: number
}

export interface CandidateRouteLabel {
  action: CraftActionId
  continuationPolicyId: string
  score: RouteScore
  episodeCount: number
}

export interface LabeledPolicyState {
  state: CraftState
  best: CandidateRouteLabel
  alternatives: CandidateRouteLabel[]
}

export interface ReachableStateSample {
  id: string
  sourcePolicyId: string
  sourceProfileId: string
  sourceSeed: number
  state: CraftState
}

export interface ReachableStateOptions {
  recipe: RecipeProfile
  crafter: CrafterProfile
  initialStates: readonly CraftState[]
  profiles: readonly WeightedConditionProfile[]
  policies: readonly PolicyPopulationEntry[]
  seeds: readonly number[]
  maxEpisodeSteps: number
  maxStates: number
}
