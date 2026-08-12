import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import type {
  GuideContinuationCandidateEvaluation,
  GuideContinuationPlan,
} from './guideContinuationPlanner'

export const CONSERVATIVE_GUIDE_IMPROVEMENT_GATE_VERSION =
  'conservative-guide-improvement-gate-v0.1.0'
export const DEFAULT_CONSERVATIVE_GUIDE_MINIMUM_PAIRED_WINS = 5

const SCORE_EPSILON = 1e-9

export type ConservativeGuideImprovementGateReason =
  | 'guide-already-ranked-first'
  | 'strict-completion-improvement'
  | 'no-strict-completion-improvement'
  | 'robust-completion-regression'
  | 'paired-completion-regression'
  | 'insufficient-paired-completion-evidence'
  | 'unpaired-candidate-evidence'

export interface ConservativeGuideImprovementGateOptions {
  /**
   * Five candidate-only completions with no guide-only loss are a deliberately
   * conservative research heuristic. The proposal and gate currently reuse
   * the same paired outcomes, so this threshold is not an exact hypothesis
   * test or a runtime success guarantee; promotion still needs disjoint
   * full-episode evidence.
   */
  minimumPairedCandidateOnlyWins?: number
}

export interface ConservativeGuideImprovementGateDecision {
  version: typeof CONSERVATIVE_GUIDE_IMPROVEMENT_GATE_VERSION
  guideAction: CraftActionId
  proposedAction: CraftActionId
  selectedAction: CraftActionId
  deviatedFromGuide: boolean
  reason: ConservativeGuideImprovementGateReason
  averageCompletionDelta: number
  robustCompletionDelta: number
  pairedCandidateOnlyWins: number
  pairedGuideOnlyWins: number
  selected: GuideContinuationCandidateEvaluation
  guide: GuideContinuationCandidateEvaluation
  proposed: GuideContinuationCandidateEvaluation
}

export interface ConservativelyGatedGuideContinuationPlan extends GuideContinuationPlan {
  gate: Omit<
    ConservativeGuideImprovementGateDecision,
    'selected' | 'guide' | 'proposed'
  >
}

function planCandidates(
  plan: Readonly<GuideContinuationPlan>,
): GuideContinuationCandidateEvaluation[] {
  return [{
    action: plan.action,
    score: plan.score,
    episodeCount: plan.episodeCountPerCandidate,
    decisionMemoryAfterAction: plan.decisionMemoryAfterAction,
    endingDecisionMemories: plan.endingDecisionMemories,
    completionOutcomes: plan.completionOutcomes,
  }, ...plan.alternatives]
}

function outcomeKey(outcome: {
  profileId: string
  sample: number
  pairedSeed: number
}): string {
  return `${outcome.profileId}:${outcome.sample}:${outcome.pairedSeed}`
}

/**
 * Chooses whether a paired guide-continuation experiment may override its
 * guide root action. Candidate evaluations in a GuideContinuationPlan share
 * the same profile/sample seeds. A deviation needs the configured minimum of
 * candidate-only completions and no guide-only completion, as well as a
 * strictly higher average completion rate and no worst-profile (robust) loss.
 */
export function selectConservativeGuideImprovement(
  plan: Readonly<GuideContinuationPlan>,
  guideAction: CraftActionId,
  options: Readonly<ConservativeGuideImprovementGateOptions> = {},
): ConservativeGuideImprovementGateDecision | null {
  const minimumPairedCandidateOnlyWins = options.minimumPairedCandidateOnlyWins
    ?? DEFAULT_CONSERVATIVE_GUIDE_MINIMUM_PAIRED_WINS
  if (!Number.isInteger(minimumPairedCandidateOnlyWins) || minimumPairedCandidateOnlyWins < 1) {
    throw new Error('minimumPairedCandidateOnlyWins must be a positive integer')
  }
  const candidates = planCandidates(plan)
  const proposed = candidates[0]
  const guide = candidates.find((candidate) => candidate.action === guideAction)
  if (proposed === undefined || guide === undefined) return null

  const averageCompletionDelta = (
    proposed.score.averageCompletionRate - guide.score.averageCompletionRate
  )
  const robustCompletionDelta = (
    proposed.score.robustCompletionRate - guide.score.robustCompletionRate
  )
  const guideOutcomes = new Map(guide.completionOutcomes.map((outcome) => [
    outcomeKey(outcome),
    outcome.completed,
  ]))
  const proposedOutcomes = new Map(proposed.completionOutcomes.map((outcome) => [
    outcomeKey(outcome),
    outcome.completed,
  ]))
  const outcomesArePaired = proposedOutcomes.size === proposed.episodeCount
    && guideOutcomes.size === guide.episodeCount
    && proposedOutcomes.size === guideOutcomes.size
    && [...proposedOutcomes.keys()].every((key) => guideOutcomes.has(key))
  let pairedCandidateOnlyWins = 0
  let pairedGuideOnlyWins = 0
  if (outcomesArePaired) {
    for (const [key, proposedCompleted] of proposedOutcomes) {
      const guideCompleted = guideOutcomes.get(key) ?? false
      if (proposedCompleted && !guideCompleted) pairedCandidateOnlyWins += 1
      if (!proposedCompleted && guideCompleted) pairedGuideOnlyWins += 1
    }
  }
  let selected = guide
  let reason: ConservativeGuideImprovementGateReason
  if (proposed.action === guide.action) {
    reason = 'guide-already-ranked-first'
  } else if (
    proposed.episodeCount !== guide.episodeCount
    || proposed.episodeCount < 1
    || !outcomesArePaired
  ) {
    reason = 'unpaired-candidate-evidence'
  } else if (averageCompletionDelta <= SCORE_EPSILON) {
    reason = 'no-strict-completion-improvement'
  } else if (robustCompletionDelta < -SCORE_EPSILON) {
    reason = 'robust-completion-regression'
  } else if (pairedGuideOnlyWins > 0) {
    reason = 'paired-completion-regression'
  } else if (pairedCandidateOnlyWins < minimumPairedCandidateOnlyWins) {
    reason = 'insufficient-paired-completion-evidence'
  } else {
    selected = proposed
    reason = 'strict-completion-improvement'
  }

  return {
    version: CONSERVATIVE_GUIDE_IMPROVEMENT_GATE_VERSION,
    guideAction,
    proposedAction: proposed.action,
    selectedAction: selected.action,
    deviatedFromGuide: selected.action !== guide.action,
    reason,
    averageCompletionDelta,
    robustCompletionDelta,
    pairedCandidateOnlyWins,
    pairedGuideOnlyWins,
    selected,
    guide,
    proposed,
  }
}

/**
 * Re-materializes a plan around the gated selection. This intentionally uses
 * the selected candidate's post-action memory; carrying the unrestricted
 * proposal's memory after retaining the guide action would corrupt all later
 * stateful guide decisions.
 */
export function applyConservativeGuideImprovementGate(
  plan: Readonly<GuideContinuationPlan>,
  guideAction: CraftActionId,
  options: Readonly<ConservativeGuideImprovementGateOptions> = {},
): ConservativelyGatedGuideContinuationPlan | null {
  const decision = selectConservativeGuideImprovement(plan, guideAction, options)
  if (decision === null) return null
  const candidates = planCandidates(plan)
  const selected = decision.selected
  const {
    selected: _selected,
    guide: _guide,
    proposed: _proposed,
    ...gate
  } = decision
  return {
    ...plan,
    action: selected.action,
    score: selected.score,
    alternatives: candidates.filter((candidate) => candidate.action !== selected.action),
    decisionMemoryAfterAction: selected.decisionMemoryAfterAction,
    endingDecisionMemories: selected.endingDecisionMemories,
    completionOutcomes: selected.completionOutcomes,
    episodeCountPerCandidate: selected.episodeCount,
    evidence: selected.score.averageCompletionRate > 0
      ? 'completion-supported'
      : 'finishability-surrogate',
    gate,
  }
}
