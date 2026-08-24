import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PATHWISE_BEAM_WIDTH,
  DEFAULT_PATHWISE_EQUIPMENT_ID,
  DEFAULT_PATHWISE_MAX_ACTIONS,
  DEFAULT_PATHWISE_RECIPE_ID,
  DEFAULT_PATHWISE_SEED,
  DEFAULT_PATHWISE_WORLD_ID,
  MAX_PATHWISE_ACTIONS,
  MAX_PATHWISE_BEAM_WIDTH,
  evaluateGenericPathwiseHeadroom,
  parsePathwiseHeadroomCliOptions,
} from './probe'

describe('generic pathwise headroom CLI', () => {
  it('defaults to the known balanced-risk hard-quality null case', () => {
    expect(parsePathwiseHeadroomCliOptions([])).toEqual({
      recipeId: DEFAULT_PATHWISE_RECIPE_ID,
      equipmentId: DEFAULT_PATHWISE_EQUIPMENT_ID,
      worldId: DEFAULT_PATHWISE_WORLD_ID,
      seed: DEFAULT_PATHWISE_SEED,
      beamWidth: DEFAULT_PATHWISE_BEAM_WIDTH,
      maxActions: DEFAULT_PATHWISE_MAX_ACTIONS,
      riskPreference: 'balanced',
      outputPath: null,
    })
  })

  it('accepts every required selector and rejects excessive work', () => {
    expect(parsePathwiseHeadroomCliOptions([
      '--recipe=36990',
      '--equipment=buffed',
      '--world=all-normal',
      '--seed=0',
      '--beam-width=16',
      '--max-actions=12',
      '--risk=aggressive',
      '--output=.tmp/pathwise.json',
    ])).toMatchObject({
      recipeId: 36_990,
      equipmentId: DEFAULT_PATHWISE_EQUIPMENT_ID,
      worldId: 'all-normal',
      seed: 0,
      beamWidth: 16,
      maxActions: 12,
      riskPreference: 'aggressive',
      outputPath: '.tmp/pathwise.json',
    })

    expect(() => parsePathwiseHeadroomCliOptions([
      `--beam-width=${MAX_PATHWISE_BEAM_WIDTH + 1}`,
    ])).toThrow(/beam-width may not exceed/u)
    expect(() => parsePathwiseHeadroomCliOptions([
      `--max-actions=${MAX_PATHWISE_ACTIONS + 1}`,
    ])).toThrow(/max-actions may not exceed/u)
    expect(() => parsePathwiseHeadroomCliOptions([
      '--beam-width=8192',
      '--max-actions=60',
    ])).toThrow(/beam-width × max-actions/u)
  })
})

describe('generic pathwise headroom report', () => {
  it('keeps causal baseline and clairvoyant reference explicitly separate', () => {
    const options = parsePathwiseHeadroomCliOptions([
      '--recipe=36990',
      '--equipment=buffed',
      '--world=normal-heavy-iid',
      `--seed=${DEFAULT_PATHWISE_SEED}`,
      '--beam-width=4',
      '--max-actions=4',
    ])
    const report = evaluateGenericPathwiseHeadroom(options)

    expect(report.scope.caseCount).toBe(1)
    expect(report.baseline.evidence).toBe('causal-policy-on-fixed-rng-tape')
    expect(report.baseline.fixedTapeReplayVerified).toBe(true)
    expect(report.clairvoyantReference.evidence)
      .toBe('clairvoyant-fixed-tape-feasible-witness-not-causal-policy')
    expect(typeof report.clairvoyantReference.frontierTruncated).toBe('boolean')
    expect(report.clairvoyantReference.incumbentRouteEvaluated).toBe(true)
    expect(report.baseline.actionCount).toBeLessThanOrEqual(options.maxActions)
    expect(report.witnessReplayVerified).toBeNull()
    expect(report.assessment.equipmentLimitEvidence).toBe('not-established')
  })
})
