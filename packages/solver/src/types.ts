import type { CraftActionId } from '@frozen-rabbit-expert/domain'

export const SOLVER_POLICY_VERSION = 'generic-craft-route-objective-condition-v0.5.1'

export const RISK_PREFERENCES = ['stable', 'balanced', 'aggressive'] as const

/**
 * Player-selected policy preference. This affects recommendation utility only;
 * it never changes recipe mechanics, action legality, or the quality target.
 */
export type RiskPreference = (typeof RISK_PREFERENCES)[number]

export interface RiskPreferencePreset {
  id: RiskPreference
  terminalCompletionReward: number
  terminalQualityShortfallPenalty: number
  minimumVoluntaryCompletionQualityRatio: number
  terminalFailurePenalty: number
  completionPotentialWeight: number
  currentQualityWeight: number
  currentProgressWeight: number
  qualityShortfallPenalty: number
  progressShortfallPenalty: number
  failureDownsideMultiplier: number
  failureProbabilityPenalty: number
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`)
  }
}

function assertRiskPreferencePreset(preset: Readonly<RiskPreferencePreset>): void {
  for (const [field, value] of Object.entries(preset)) {
    if (field === 'id') continue
    assertFiniteNonNegative(value as number, `${preset.id}.${field}`)
  }
  if (preset.failureDownsideMultiplier > 1) {
    throw new RangeError(`${preset.id}.failureDownsideMultiplier must be at most 1`)
  }
  if (preset.minimumVoluntaryCompletionQualityRatio > 1) {
    throw new RangeError(`${preset.id}.minimumVoluntaryCompletionQualityRatio must be at most 1`)
  }
}

const riskPreferencePresets = {
  stable: {
    id: 'stable',
    terminalCompletionReward: 1_200_000,
    terminalQualityShortfallPenalty: 160_000,
    minimumVoluntaryCompletionQualityRatio: 0.25,
    terminalFailurePenalty: 1_350_000,
    completionPotentialWeight: 520_000,
    currentQualityWeight: 75_000,
    currentProgressWeight: 70_000,
    qualityShortfallPenalty: 220_000,
    progressShortfallPenalty: 310_000,
    failureDownsideMultiplier: 0.85,
    failureProbabilityPenalty: 90_000,
  },
  balanced: {
    id: 'balanced',
    terminalCompletionReward: 1_000_000,
    terminalQualityShortfallPenalty: 650_000,
    minimumVoluntaryCompletionQualityRatio: 0.55,
    terminalFailurePenalty: 1_000_000,
    completionPotentialWeight: 420_000,
    currentQualityWeight: 95_000,
    currentProgressWeight: 48_000,
    qualityShortfallPenalty: 180_000,
    progressShortfallPenalty: 220_000,
    failureDownsideMultiplier: 0.35,
    failureProbabilityPenalty: 0,
  },
  aggressive: {
    id: 'aggressive',
    terminalCompletionReward: 800_000,
    terminalQualityShortfallPenalty: 1_100_000,
    minimumVoluntaryCompletionQualityRatio: 0.75,
    terminalFailurePenalty: 700_000,
    completionPotentialWeight: 340_000,
    currentQualityWeight: 180_000,
    currentProgressWeight: 30_000,
    qualityShortfallPenalty: 100_000,
    progressShortfallPenalty: 140_000,
    failureDownsideMultiplier: 0.05,
    failureProbabilityPenalty: 0,
  },
} as const satisfies Record<RiskPreference, RiskPreferencePreset>

for (const preset of Object.values(riskPreferencePresets)) assertRiskPreferencePreset(preset)

if (
  riskPreferencePresets.stable.terminalCompletionReward <= riskPreferencePresets.balanced.terminalCompletionReward
  || riskPreferencePresets.balanced.terminalCompletionReward <= riskPreferencePresets.aggressive.terminalCompletionReward
  || riskPreferencePresets.stable.terminalQualityShortfallPenalty >= riskPreferencePresets.balanced.terminalQualityShortfallPenalty
  || riskPreferencePresets.balanced.terminalQualityShortfallPenalty >= riskPreferencePresets.aggressive.terminalQualityShortfallPenalty
  || riskPreferencePresets.stable.minimumVoluntaryCompletionQualityRatio >= riskPreferencePresets.balanced.minimumVoluntaryCompletionQualityRatio
  || riskPreferencePresets.balanced.minimumVoluntaryCompletionQualityRatio >= riskPreferencePresets.aggressive.minimumVoluntaryCompletionQualityRatio
  || riskPreferencePresets.stable.failureDownsideMultiplier <= riskPreferencePresets.balanced.failureDownsideMultiplier
  || riskPreferencePresets.balanced.failureDownsideMultiplier <= riskPreferencePresets.aggressive.failureDownsideMultiplier
  || riskPreferencePresets.stable.currentQualityWeight >= riskPreferencePresets.balanced.currentQualityWeight
  || riskPreferencePresets.balanced.currentQualityWeight >= riskPreferencePresets.aggressive.currentQualityWeight
) {
  throw new Error('risk preference presets must preserve the stable-to-aggressive ordering contract')
}

export const RISK_PREFERENCE_PRESETS: Readonly<Record<RiskPreference, Readonly<RiskPreferencePreset>>>
  = Object.freeze({
    stable: Object.freeze(riskPreferencePresets.stable),
    balanced: Object.freeze(riskPreferencePresets.balanced),
    aggressive: Object.freeze(riskPreferencePresets.aggressive),
  })

export function resolveRiskPreferencePreset(
  preference: RiskPreference | undefined,
): Readonly<RiskPreferencePreset> {
  const normalized = preference ?? 'balanced'
  if (!RISK_PREFERENCES.includes(normalized)) {
    throw new RangeError(`unsupported riskPreference: ${String(normalized)}`)
  }
  return RISK_PREFERENCE_PRESETS[normalized]
}

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
  | 'condition-robust-value'
  | 'condition-good-omen-setup'
  | 'condition-primed-value'
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
  | 'research-rollout-route'

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

export type PolicyCoverage = RecommendationConfidence['policyCoverage']

export interface Recommendation {
  action: CraftActionId
  alternatives: RecommendationAlternative[]
  phase: CraftPhase
  reasons: RecommendationReasonCode[]
  progressFinisher: 'ready' | 'viable' | 'uncertain'
  confidence: RecommendationConfidence
  policyVersion: string
}
