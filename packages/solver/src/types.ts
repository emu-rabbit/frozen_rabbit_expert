import type { CraftActionId } from '@frozen-rabbit-expert/domain'

export const SOLVER_POLICY_VERSION = 'cosmic-titanium-lookahead-policy-v1.1.0'

export type CraftPhase =
  | 'opener'
  | 'secure-progress'
  | 'build-inner-quiet'
  | 'maintain-resources'
  | 'prepare-quality-burst'
  | 'quality-finisher'
  | 'complete-synthesis'
  | 'recovery'

export type RecommendationReasonCode =
  | 'open-with-muscle-memory'
  | 'open-with-reflect'
  | 'condition-good-quality'
  | 'condition-good-cp'
  | 'condition-good-progress'
  | 'condition-pliant-value'
  | 'condition-malleable-progress'
  | 'condition-centered-risk'
  | 'condition-sturdy-value'
  | 'restore-durability'
  | 'protect-next-durability'
  | 'maintain-durability'
  | 'activate-progress-buff'
  | 'activate-quality-buff'
  | 'build-inner-quiet'
  | 'use-touch-combo'
  | 'quality-finisher'
  | 'secure-progress'
  | 'complete-craft'
  | 'preserve-progress-headroom'
  | 'bounded-guide-fallback'
  | 'lookahead-quality-route'
  | 'lookahead-progress-route'
  | 'lookahead-resource-route'

export type AlternativeTradeoffCode =
  | 'more-progress'
  | 'more-quality'
  | 'preserves-durability'
  | 'recovers-cp'
  | 'setup-next-actions'
  | 'higher-variance'
  | 'lower-resource-cost'

export interface RecommendationAlternative {
  action: CraftActionId
  tradeoff: AlternativeTradeoffCode
}

export interface RecommendationConfidence {
  mechanicsVersion: string
  conditionProfileConfidence: 'verified' | 'empirical' | 'assumed'
  policyCoverage: 'in-distribution' | 'near-boundary' | 'out-of-distribution'
}

export interface Recommendation {
  action: CraftActionId
  alternatives: RecommendationAlternative[]
  phase: CraftPhase
  reasons: RecommendationReasonCode[]
  progressFinisher: 'ready' | 'viable' | 'uncertain'
  confidence: RecommendationConfidence
  policyVersion: typeof SOLVER_POLICY_VERSION
}
