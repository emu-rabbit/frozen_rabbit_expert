export type PolicyEvaluationCorpusRole =
  | 'regression'
  | 'development'
  | 'frozen-validation'
  | 'reserved-final'

export interface PolicyEvaluationCorpus {
  id: string
  role: PolicyEvaluationCorpusRole
  seedStart: number
  seedStride: number
  seedsPerConditionProfile: number
  note: string
}

const DEFAULT_SEED_STRIDE = 0x85eb_ca6b

/** Both 72-episode corpora were inspected repeatedly during the first 13
 * rounds. They are useful regressions, never untouched promotion evidence. */
export const LEGACY_REGRESSION_CORPUS: PolicyEvaluationCorpus = {
  id: 'legacy-regression-72-v1',
  role: 'regression',
  seedStart: 0x51a7_e001,
  seedStride: DEFAULT_SEED_STRIDE,
  seedsPerConditionProfile: 24,
  note: 'Historical round-selection corpus; already inspected.',
}

export const SECONDARY_REGRESSION_CORPUS: PolicyEvaluationCorpus = {
  id: 'secondary-regression-72-v1',
  role: 'regression',
  seedStart: 2_882_400_001,
  seedStride: DEFAULT_SEED_STRIDE,
  seedsPerConditionProfile: 24,
  note: 'Previously called new 72; now inspected and regression-only.',
}

export const DEVELOPMENT_CORPUS: PolicyEvaluationCorpus = {
  id: 'planner-development-384-v1',
  role: 'development',
  seedStart: 0x1357_9bdf,
  seedStride: DEFAULT_SEED_STRIDE,
  seedsPerConditionProfile: 128,
  note: 'Direction selection and diagnostics; never a promotion final. All 128 seeds/profile were inspected during 2026-08-11 to 2026-08-12 tuning.',
}

export const FROZEN_VALIDATION_CORPUS: PolicyEvaluationCorpus = {
  id: 'planner-frozen-validation-768-v1',
  role: 'frozen-validation',
  seedStart: 0x2468_ace0,
  seedStride: DEFAULT_SEED_STRIDE,
  seedsPerConditionProfile: 256,
  note: 'Run only after planner design and thresholds are frozen.',
}

export const RESERVED_FINAL_CORPUS: PolicyEvaluationCorpus = {
  id: 'planner-reserved-final-1536-v1',
  role: 'reserved-final',
  seedStart: 0xc001_d00d,
  seedStride: DEFAULT_SEED_STRIDE,
  seedsPerConditionProfile: 512,
  note: 'Reserved for one final promotion decision; do not use for tuning.',
}

export const POLICY_EVALUATION_CORPORA: readonly PolicyEvaluationCorpus[] = [
  LEGACY_REGRESSION_CORPUS,
  SECONDARY_REGRESSION_CORPUS,
  DEVELOPMENT_CORPUS,
  FROZEN_VALIDATION_CORPUS,
  RESERVED_FINAL_CORPUS,
]

export function corpusSeeds(corpus: PolicyEvaluationCorpus): number[] {
  return Array.from({ length: corpus.seedsPerConditionProfile }, (_, index) => (
    corpus.seedStart + Math.imul(index + 1, corpus.seedStride)
  ) >>> 0)
}
