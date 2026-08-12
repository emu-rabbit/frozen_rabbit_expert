import type {
  CraftActionId,
  CrafterProfile,
  CraftState,
  MaterialCondition,
  RecipeProfile,
} from '@frozen-rabbit-expert/domain'

export interface EpisodeRandomStream {
  nextCondition(): number
  nextSuccess(): number
}

export interface WeightedConditionProfile {
  id: string
  weights: Readonly<Partial<Record<MaterialCondition, number>>>
  transitionWeights?: Readonly<Partial<Record<
    MaterialCondition,
    Readonly<Partial<Record<MaterialCondition, number>>>
  >>>
  evidence: 'assumption' | 'empirical' | 'verified'
}

export type EpisodePolicy = (
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
) => CraftActionId | null

export interface EpisodeOptions {
  recipe: RecipeProfile
  crafter: CrafterProfile
  initialState: CraftState
  firstAction: CraftActionId
  policy: EpisodePolicy
  random: EpisodeRandomStream
  conditionProfile: WeightedConditionProfile
  maxSteps: number
}

export type EpisodeStopReason =
  | 'completed'
  | 'failed'
  | 'policy-null'
  | 'no-legal-action'
  | 'illegal-action'
  | 'action-limit'

export interface EpisodeResult {
  terminal: CraftState['terminal']
  finalState: CraftState
  actions: CraftActionId[]
  stoppedByLimit: boolean
  stopReason: EpisodeStopReason
}

export interface EpisodeStep {
  before: CraftState
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
  after: CraftState
}

export interface EpisodeTraceResult extends EpisodeResult {
  steps: EpisodeStep[]
}
