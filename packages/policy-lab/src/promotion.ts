import {
  CRAFT_MECHANICS_VERSION,
  assertCraftObjective,
} from '@frozen-rabbit-expert/domain'
import {
  canonicalEvidenceContentHash,
  createValidatedEvaluationCorpusSealManifestIndex,
  type Sha256ContentHash,
} from './corpusSeal'
import {
  assertCrafterSplitPromotionReady,
  canonicalCrafterGroupedSplitManifestContentHash,
  canonicalCrafterPopulationManifestContentHash,
} from './crafterPopulation'
import {
  POPULATION_HELD_OUT_EVALUATION_IDENTITY_VERSION,
  compareDevelopmentPolicies,
  type DecisionLatencySummary,
  type HeldOutCrafterCoverage,
  type PolicyFactoryColdStartLatencySummary,
  type PopulationHeldOutPolicyResult,
  type PromotionCriteria,
} from './evaluatePolicy'
import { compareRouteScores } from './objective'
import { isBrandedPopulationHeldOutPolicyResult } from './populationEvaluationBrand'

export const SEALED_POPULATION_PROMOTION_DECISION_VERSION =
  'sealed-population-promotion-decision-v2'

export const DECLARED_ARTIFACT_EXECUTION_BOUNDARY =
  'declared-policy-artifact-identity-does-not-prove-executed-factory-bytes'

export const LIVE_EVALUATION_SUMMARY_BOUNDARY =
  'serialized-evaluation-summaries-must-be-recomputed-before-promotion'

export const SEALED_POPULATION_EVIDENCE_NOT_PROVIDED =
  'sealed-population-evidence-not-provided'

export interface SealedPopulationPromotionCriteria extends PromotionCriteria {
  maximumPolicyCallbackP95Ms?: number
  maximumPolicyFactoryColdStartP95Ms?: number
  maximumWorstProfilePolicyCallbackP95Ms?: number
  allowedPolicyCallbackP95RegressionMs?: number
  allowedPolicyFactoryColdStartP95RegressionMs?: number
  allowedWorstProfilePolicyCallbackP95RegressionMs?: number
}

export interface SealedPopulationPromotionExpectedAnchors {
  expectedPopulationManifestContentHash: Sha256ContentHash
  expectedSplitManifestContentHash: Sha256ContentHash
  expectedCorpusSealManifestContentHash: Sha256ContentHash
  expectedEvaluationSetupContentHash: Sha256ContentHash
}

export interface SealedPopulationPromotionDecision {
  version: typeof SEALED_POPULATION_PROMOTION_DECISION_VERSION
  evidenceKind: 'sealed-population-held-out'
  promote: boolean
  reasons: string[]
  basis: 'completion-gain' | 'near-perfect-efficiency' | null
  evidenceBoundaries: readonly [
    typeof DECLARED_ARTIFACT_EXECUTION_BOUNDARY,
    typeof LIVE_EVALUATION_SUMMARY_BOUNDARY,
  ]
  baselineEvaluationIdentityHash: string
  candidateEvaluationIdentityHash: string
  releaseEvaluationSetupContentHash: string | null
}

export interface PromotionUnavailableDecision {
  evidenceKind: null
  promote: false
  reasons: readonly [typeof SEALED_POPULATION_EVIDENCE_NOT_PROVIDED]
  basis: null
  evidenceBoundaries: readonly [
    'single-crafter-development-evaluation-is-not-population-held-out-evidence',
    typeof DECLARED_ARTIFACT_EXECUTION_BOUNDARY,
  ]
}

/** Fail-closed report value for tools that only ran development evaluation. */
export function sealedPopulationEvidenceNotProvidedDecision(): PromotionUnavailableDecision {
  return {
    evidenceKind: null,
    promote: false,
    reasons: [SEALED_POPULATION_EVIDENCE_NOT_PROVIDED],
    basis: null,
    evidenceBoundaries: [
      'single-crafter-development-evaluation-is-not-population-held-out-evidence',
      DECLARED_ARTIFACT_EXECUTION_BOUNDARY,
    ],
  }
}

const REQUIRED_COVERAGE: readonly HeldOutCrafterCoverage[] = [
  'held-out-interpolation',
  'held-out-boundary',
]

function appendUnique(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason)
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function validLatencySummary(
  summary: Readonly<DecisionLatencySummary>,
): boolean {
  return Number.isSafeInteger(summary.decisionCount)
    && summary.decisionCount > 0
    && isFiniteNonNegative(summary.p50Ms)
    && isFiniteNonNegative(summary.p95Ms)
    && isFiniteNonNegative(summary.p99Ms)
    && isFiniteNonNegative(summary.maxMs)
    && summary.p50Ms <= summary.p95Ms
    && summary.p95Ms <= summary.p99Ms
    && summary.p99Ms <= summary.maxMs
}

function validFactoryLatencySummary(
  summary: Readonly<PolicyFactoryColdStartLatencySummary>,
): boolean {
  return validLatencySummary({
    decisionCount: summary.factoryInvocationCount,
    p50Ms: summary.p50Ms,
    p95Ms: summary.p95Ms,
    p99Ms: summary.p99Ms,
    maxMs: summary.maxMs,
  })
}

function evidenceIntegrityReasons(
  result: Readonly<PopulationHeldOutPolicyResult>,
  label: 'baseline' | 'candidate',
): string[] {
  const reasons: string[] = []
  const identity = result.evaluationIdentity
  if (!isBrandedPopulationHeldOutPolicyResult(result)) {
    reasons.push(`${label}-evaluation-summary-not-produced-by-live-evaluator`)
  }
  try {
    if (result.evaluationIdentityVersion !== POPULATION_HELD_OUT_EVALUATION_IDENTITY_VERSION
      || identity.version !== POPULATION_HELD_OUT_EVALUATION_IDENTITY_VERSION) {
      appendUnique(reasons, `${label}-evaluation-identity-version-mismatch`)
    }
    if (result.mechanicsVersion !== CRAFT_MECHANICS_VERSION
      || identity.mechanicsVersion !== CRAFT_MECHANICS_VERSION) {
      appendUnique(reasons, `${label}-mechanics-version-mismatch`)
    }
    if (canonicalEvidenceContentHash(identity) !== result.evaluationIdentityHash) {
      appendUnique(reasons, `${label}-evaluation-identity-hash-mismatch`)
    }
    const populationHash = canonicalCrafterPopulationManifestContentHash(identity.population)
    if (populationHash !== result.populationManifestContentHash
      || populationHash !== identity.populationManifestContentHash) {
      appendUnique(reasons, `${label}-population-anchor-mismatch`)
    }
    const splitHash = canonicalCrafterGroupedSplitManifestContentHash(identity.split)
    if (splitHash !== result.splitManifestContentHash
      || splitHash !== identity.splitManifestContentHash) {
      appendUnique(reasons, `${label}-split-anchor-mismatch`)
    }
    createValidatedEvaluationCorpusSealManifestIndex(identity.corpusSealManifest)
    if (identity.corpusSealManifest.manifestId !== result.corpusSealManifestId
      || identity.corpusSealManifest.manifestContentHash !== result.corpusSealManifestContentHash
      || identity.corpusSealManifest.manifestContentHash !== identity.corpusSealManifestContentHash) {
      appendUnique(reasons, `${label}-corpus-anchor-mismatch`)
    }
    try {
      assertCrafterSplitPromotionReady(
        identity.split,
        identity.population,
        identity.populationRecipes,
        identity.corpusSealManifest,
        {
          expectedPopulationManifestContentHash: identity.populationManifestContentHash,
          expectedSplitManifestContentHash: identity.splitManifestContentHash,
          expectedCorpusSealManifestContentHash: identity.corpusSealManifestContentHash,
        },
      )
    } catch {
      appendUnique(reasons, `${label}-promotion-split-not-ready`)
    }
    assertCraftObjective(identity.recipe, identity.objective)
    if (identity.objective.objectiveId !== result.objectiveId) {
      appendUnique(reasons, `${label}-objective-id-mismatch`)
    }
    if (canonicalEvidenceContentHash(identity.declaredPolicyArtifact)
      !== canonicalEvidenceContentHash(result.declaredPolicyArtifact)) {
      appendUnique(reasons, `${label}-declared-artifact-identity-mismatch`)
    }
  } catch {
    appendUnique(reasons, `${label}-evaluation-evidence-invalid`)
  }

  if (!Number.isSafeInteger(result.episodeCount) || result.episodeCount <= 0) {
    appendUnique(reasons, `${label}-episode-evidence-missing`)
  }
  if (result.perCrafter.length === 0) {
    appendUnique(reasons, `${label}-per-crafter-evidence-missing`)
  }
  if (!validLatencySummary(result.policyCallbackLatency)
    || !validFactoryLatencySummary(result.policyFactoryColdStartLatency)
    || !isFiniteNonNegative(result.worstProfilePolicyCallbackP95.p95Ms)) {
    appendUnique(reasons, `${label}-latency-evidence-invalid`)
  }
  if (result.perCrafter.some((crafter) => (
    !Number.isSafeInteger(crafter.episodeCount)
    || crafter.episodeCount <= 0
    || !validLatencySummary(crafter.policyCallbackLatency)
    || !validFactoryLatencySummary(crafter.policyFactoryColdStartLatency)
  ))) {
    appendUnique(reasons, `${label}-per-crafter-evidence-invalid`)
  }
  if (result.perCrafter.reduce((sum, crafter) => sum + crafter.episodeCount, 0)
    !== result.episodeCount) {
    appendUnique(reasons, `${label}-episode-count-anchor-mismatch`)
  }
  if (!result.perCrafter.some((crafter) => (
    crafter.profileId === result.worstProfileId
    && Math.abs(crafter.score.robustCompletionRate - result.worstProfileCompletionRate) <= 1e-9
  ))) {
    appendUnique(reasons, `${label}-worst-profile-anchor-mismatch`)
  }
  if (!result.perCrafter.some((crafter) => (
    crafter.profileId === result.worstProfilePolicyCallbackP95.profileId
    && Math.abs(
      crafter.policyCallbackLatency.p95Ms - result.worstProfilePolicyCallbackP95.p95Ms,
    ) <= 1e-9
  ))) {
    appendUnique(reasons, `${label}-worst-latency-profile-anchor-mismatch`)
  }
  if (result.safetyViolations !== 0
    || result.perCrafter.some((crafter) => crafter.safetyViolations !== 0)) {
    appendUnique(reasons, `${label}-safety-violations`)
  }
  for (const coverage of REQUIRED_COVERAGE) {
    if (result.coverageScores[coverage] === undefined) {
      appendUnique(reasons, `${label}-${coverage}-evidence-missing`)
    }
  }
  if (result.evaluationIdentity.split.oodProbeGroupIds.length > 0
    && result.coverageScores['out-of-distribution'] === undefined) {
    appendUnique(reasons, `${label}-out-of-distribution-evidence-missing`)
  }
  if (result.evaluationIdentity.split.oodProbeGroupIds.length === 0) {
    appendUnique(reasons, `${label}-out-of-distribution-evidence-not-declared`)
  }
  return reasons
}

export function populationHeldOutEvaluationSetupContentHash(
  result: Readonly<PopulationHeldOutPolicyResult>,
): Sha256ContentHash {
  const { declaredPolicyArtifact: _artifact, ...evaluationSetup } = result.evaluationIdentity
  return canonicalEvidenceContentHash(evaluationSetup)
}

function caseAnchor(caseResult: Readonly<PopulationHeldOutPolicyResult['perCrafter'][number]>): string {
  return canonicalEvidenceContentHash({
    profileId: caseResult.profileId,
    groupId: caseResult.groupId,
    splitFamilyId: caseResult.splitFamilyId,
    evidenceRole: caseResult.evidenceRole,
    initialStateCorpusId: caseResult.initialStateCorpusId,
    splitRole: caseResult.splitRole,
    coverage: caseResult.coverage,
    seedCorpusId: caseResult.seedCorpusId,
    seedCorpusContentHash: caseResult.seedCorpusContentHash,
    initialStateCorpusContentHash: caseResult.initialStateCorpusContentHash,
    episodeCount: caseResult.episodeCount,
  })
}

function sortedCaseAnchors(result: Readonly<PopulationHeldOutPolicyResult>): readonly string[] {
  return result.perCrafter.map(caseAnchor).sort()
}

function compatibleEvidenceReasons(
  baseline: Readonly<PopulationHeldOutPolicyResult>,
  candidate: Readonly<PopulationHeldOutPolicyResult>,
): string[] {
  const reasons: string[] = []
  if (baseline.mechanicsVersion !== candidate.mechanicsVersion) {
    reasons.push('mechanics-version-incompatible')
  }
  if (baseline.populationManifestContentHash !== candidate.populationManifestContentHash) {
    reasons.push('population-anchor-incompatible')
  }
  if (baseline.splitManifestContentHash !== candidate.splitManifestContentHash) {
    reasons.push('split-anchor-incompatible')
  }
  if (baseline.corpusSealManifestId !== candidate.corpusSealManifestId
    || baseline.corpusSealManifestContentHash !== candidate.corpusSealManifestContentHash) {
    reasons.push('corpus-anchor-incompatible')
  }
  if (baseline.objectiveId !== candidate.objectiveId) {
    reasons.push('objective-incompatible')
  }
  if (baseline.evaluationIdentity.recipe.profileId !== candidate.evaluationIdentity.recipe.profileId
    || canonicalEvidenceContentHash(baseline.evaluationIdentity.recipe)
      !== canonicalEvidenceContentHash(candidate.evaluationIdentity.recipe)) {
    reasons.push('recipe-incompatible')
  }
  if (canonicalEvidenceContentHash(baseline.evaluationIdentity.objective)
    !== canonicalEvidenceContentHash(candidate.evaluationIdentity.objective)) {
    reasons.push('objective-content-incompatible')
  }
  if (canonicalEvidenceContentHash(baseline.evaluationIdentity.conditionProfiles)
    !== canonicalEvidenceContentHash(candidate.evaluationIdentity.conditionProfiles)) {
    reasons.push('condition-profiles-incompatible')
  }
  if (baseline.evaluationIdentity.maxEpisodeSteps !== candidate.evaluationIdentity.maxEpisodeSteps) {
    reasons.push('max-episode-steps-incompatible')
  }
  if (populationHeldOutEvaluationSetupContentHash(baseline)
    !== populationHeldOutEvaluationSetupContentHash(candidate)) {
    reasons.push('evaluation-setup-incompatible')
  }
  if (JSON.stringify(sortedCaseAnchors(baseline)) !== JSON.stringify(sortedCaseAnchors(candidate))) {
    reasons.push('held-out-case-anchors-incompatible')
  }
  if (baseline.episodeCount !== candidate.episodeCount) {
    reasons.push('episode-count-incompatible')
  }
  return reasons
}

function validSha256ContentHash(value: unknown): value is Sha256ContentHash {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)
}

function releaseAnchorReasons(
  baseline: Readonly<PopulationHeldOutPolicyResult>,
  candidate: Readonly<PopulationHeldOutPolicyResult>,
  expectedAnchors: Readonly<SealedPopulationPromotionExpectedAnchors> | undefined,
): string[] {
  if (expectedAnchors === undefined || expectedAnchors === null) {
    return ['release-owned-promotion-anchors-not-provided']
  }
  const reasons: string[] = []
  for (const [field, value] of [
    ['population', expectedAnchors.expectedPopulationManifestContentHash],
    ['split', expectedAnchors.expectedSplitManifestContentHash],
    ['corpus', expectedAnchors.expectedCorpusSealManifestContentHash],
    ['evaluation-setup', expectedAnchors.expectedEvaluationSetupContentHash],
  ] as const) {
    if (!validSha256ContentHash(value)) reasons.push(`release-${field}-anchor-missing-or-invalid`)
  }
  if (reasons.length > 0) return reasons
  if (baseline.populationManifestContentHash
    !== expectedAnchors.expectedPopulationManifestContentHash
    || candidate.populationManifestContentHash
      !== expectedAnchors.expectedPopulationManifestContentHash) {
    reasons.push('release-population-anchor-mismatch')
  }
  if (baseline.splitManifestContentHash !== expectedAnchors.expectedSplitManifestContentHash
    || candidate.splitManifestContentHash !== expectedAnchors.expectedSplitManifestContentHash) {
    reasons.push('release-split-anchor-mismatch')
  }
  if (baseline.corpusSealManifestContentHash
    !== expectedAnchors.expectedCorpusSealManifestContentHash
    || candidate.corpusSealManifestContentHash
      !== expectedAnchors.expectedCorpusSealManifestContentHash) {
    reasons.push('release-corpus-anchor-mismatch')
  }
  if (populationHeldOutEvaluationSetupContentHash(baseline)
    !== expectedAnchors.expectedEvaluationSetupContentHash
    || populationHeldOutEvaluationSetupContentHash(candidate)
      !== expectedAnchors.expectedEvaluationSetupContentHash) {
    reasons.push('release-evaluation-setup-anchor-mismatch')
  }
  return reasons
}

function latencyProvenanceReasons(
  baseline: Readonly<PopulationHeldOutPolicyResult>,
  candidate: Readonly<PopulationHeldOutPolicyResult>,
): string[] {
  const reasons: string[] = []
  if (baseline.evaluationIdentity.latencyClock !== 'global-performance-now') {
    reasons.push('baseline-latency-evidence-inconclusive:caller-injected-clock')
  }
  if (candidate.evaluationIdentity.latencyClock !== 'global-performance-now') {
    reasons.push('candidate-latency-evidence-inconclusive:caller-injected-clock')
  }
  return reasons
}

function artifactIdentityReasons(
  baseline: Readonly<PopulationHeldOutPolicyResult>,
  candidate: Readonly<PopulationHeldOutPolicyResult>,
): string[] {
  const reasons: string[] = []
  const baselineArtifact = baseline.declaredPolicyArtifact
  const candidateArtifact = candidate.declaredPolicyArtifact
  if (canonicalEvidenceContentHash(baselineArtifact) === canonicalEvidenceContentHash(candidateArtifact)) {
    reasons.push('policy-artifact-identities-identical')
  }
  if (baselineArtifact.contentHash === candidateArtifact.contentHash) {
    reasons.push('policy-artifact-content-hash-identical')
  }
  if (baselineArtifact.policyId === candidateArtifact.policyId
    && baselineArtifact.policyVersion === candidateArtifact.policyVersion
    && baselineArtifact.contentHash !== candidateArtifact.contentHash) {
    reasons.push('policy-artifact-version-collision')
  }
  return reasons
}

function scoreRegressionReasons(
  baseline: Readonly<PopulationHeldOutPolicyResult>,
  candidate: Readonly<PopulationHeldOutPolicyResult>,
): string[] {
  const reasons: string[] = []
  if (candidate.worstProfileCompletionRate + 1e-9 < baseline.worstProfileCompletionRate) {
    reasons.push('worst-profile-completion-regression')
  }
  if (candidate.worstDecileCompletionRate + 1e-9 < baseline.worstDecileCompletionRate) {
    reasons.push('worst-decile-completion-regression')
  }
  if (candidate.score.lowerTailBalance + 1e-9 < baseline.score.lowerTailBalance) {
    reasons.push('lower-tail-regression')
  }
  for (const coverage of [
    ...REQUIRED_COVERAGE,
    'out-of-distribution',
  ] as const) {
    const baselineScore = baseline.coverageScores[coverage]
    const candidateScore = candidate.coverageScores[coverage]
    if (baselineScore !== undefined && candidateScore !== undefined
      && compareRouteScores(candidateScore, baselineScore) < 0) {
      reasons.push(`${coverage}-regression`)
    }
  }
  const baselineByAnchor = new Map(baseline.perCrafter.map((result) => [caseAnchor(result), result]))
  for (const candidateCase of candidate.perCrafter) {
    const baselineCase = baselineByAnchor.get(caseAnchor(candidateCase))
    if (baselineCase !== undefined && compareRouteScores(candidateCase.score, baselineCase.score) < 0) {
      reasons.push(`held-out-crafter-regression:${candidateCase.profileId}`)
    }
  }
  return reasons
}

function latencyReasons(
  baseline: Readonly<PopulationHeldOutPolicyResult>,
  candidate: Readonly<PopulationHeldOutPolicyResult>,
  criteria: Readonly<SealedPopulationPromotionCriteria>,
): string[] {
  const reasons: string[] = []
  const maximumCallback = criteria.maximumPolicyCallbackP95Ms ?? 1_000
  const maximumFactory = criteria.maximumPolicyFactoryColdStartP95Ms ?? 1_000
  const maximumWorst = criteria.maximumWorstProfilePolicyCallbackP95Ms ?? 1_000
  const allowedCallbackRegression = criteria.allowedPolicyCallbackP95RegressionMs ?? 0
  const allowedFactoryRegression = criteria.allowedPolicyFactoryColdStartP95RegressionMs ?? 0
  const allowedWorstRegression = criteria.allowedWorstProfilePolicyCallbackP95RegressionMs ?? 0
  if (candidate.policyCallbackLatency.p95Ms > maximumCallback) {
    reasons.push('policy-callback-p95-budget-exceeded')
  }
  if (candidate.policyFactoryColdStartLatency.p95Ms > maximumFactory) {
    reasons.push('policy-factory-cold-start-p95-budget-exceeded')
  }
  if (candidate.worstProfilePolicyCallbackP95.p95Ms > maximumWorst) {
    reasons.push('worst-profile-policy-callback-p95-budget-exceeded')
  }
  if (candidate.policyCallbackLatency.p95Ms
    > baseline.policyCallbackLatency.p95Ms + allowedCallbackRegression) {
    reasons.push('policy-callback-p95-regression')
  }
  if (candidate.policyFactoryColdStartLatency.p95Ms
    > baseline.policyFactoryColdStartLatency.p95Ms + allowedFactoryRegression) {
    reasons.push('policy-factory-cold-start-p95-regression')
  }
  if (candidate.worstProfilePolicyCallbackP95.p95Ms
    > baseline.worstProfilePolicyCallbackP95.p95Ms + allowedWorstRegression) {
    reasons.push('worst-profile-policy-callback-p95-regression')
  }
  return reasons
}

/**
 * Formal promotion gate for two independently evaluated policies over the same
 * sealed held-out population. Artifact identities remain caller declarations;
 * the decision records that reproducibility boundary explicitly.
 */
export function decideSealedPopulationPromotion(
  baseline: Readonly<PopulationHeldOutPolicyResult>,
  candidate: Readonly<PopulationHeldOutPolicyResult>,
  expectedAnchors: Readonly<SealedPopulationPromotionExpectedAnchors>,
  criteria: Readonly<SealedPopulationPromotionCriteria> = {},
): SealedPopulationPromotionDecision {
  const development = compareDevelopmentPolicies(
    baseline,
    candidate,
    candidate.safetyViolations,
    criteria,
  )
  const reasons = [
    ...evidenceIntegrityReasons(baseline, 'baseline'),
    ...evidenceIntegrityReasons(candidate, 'candidate'),
    ...releaseAnchorReasons(
      baseline,
      candidate,
      expectedAnchors as Readonly<SealedPopulationPromotionExpectedAnchors> | undefined,
    ),
    ...compatibleEvidenceReasons(baseline, candidate),
    ...artifactIdentityReasons(baseline, candidate),
    ...development.reasons,
    ...scoreRegressionReasons(baseline, candidate),
    ...latencyReasons(baseline, candidate, criteria),
    ...latencyProvenanceReasons(baseline, candidate),
    'policy-artifact-execution-binding-not-proven',
    'reserved-final-evidence-not-evaluated',
  ]
  return {
    version: SEALED_POPULATION_PROMOTION_DECISION_VERSION,
    evidenceKind: 'sealed-population-held-out',
    promote: reasons.length === 0,
    reasons: [...new Set(reasons)],
    basis: development.basis,
    evidenceBoundaries: [
      DECLARED_ARTIFACT_EXECUTION_BOUNDARY,
      LIVE_EVALUATION_SUMMARY_BOUNDARY,
    ],
    baselineEvaluationIdentityHash: baseline.evaluationIdentityHash,
    candidateEvaluationIdentityHash: candidate.evaluationIdentityHash,
    releaseEvaluationSetupContentHash: validSha256ContentHash(
      (expectedAnchors as Partial<SealedPopulationPromotionExpectedAnchors> | undefined)
        ?.expectedEvaluationSetupContentHash,
    )
      ? expectedAnchors.expectedEvaluationSetupContentHash
      : null,
  }
}
