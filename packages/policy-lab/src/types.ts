import type {
  CraftActionId,
  CraftObjective,
  CrafterProfile,
  CraftState,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import type {
  EpisodePolicy,
  EpisodeStopReason,
  WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'

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
  hardStopRate: number
  nonCompletionRate: number
  stopReasonRates: Readonly<Record<EpisodeStopReason, number>>
  lowerTailBalance: number
  averageBalance: number
  averageViableProgressRatio: number
  averageViableQualityRatio: number
  averageSuccessfulCp: number
  averageSuccessfulDurability: number
  averageSteps: number
  averageSuccessfulSteps: number | null
}

export interface CandidateRouteLabel {
  action: CraftActionId
  continuationPolicyId: string
  score: RouteScore
  episodeCount: number
}

export interface LabeledPolicyState {
  objectiveId: string
  state: CraftState
  best: CandidateRouteLabel
  alternatives: CandidateRouteLabel[]
}

export interface ReachableStateSample {
  id: string
  objectiveId: string
  sourcePolicyId: string
  sourceProfileId: string
  sourceSeed: number
  state: CraftState
}

export interface ReachableStateOptions {
  recipe: RecipeProfile
  objective: Readonly<CraftObjective>
  crafter: CrafterProfile
  initialStates: readonly CraftState[]
  profiles: readonly WeightedConditionProfile[]
  policies: readonly PolicyPopulationEntry[]
  seeds: readonly number[]
  maxEpisodeSteps: number
  maxStates: number
}
