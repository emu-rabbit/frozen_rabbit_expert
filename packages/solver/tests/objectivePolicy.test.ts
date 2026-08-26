import { describe, expect, it } from 'vitest'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  COSMIC_TITANIUM_NAILS,
  COSMIC_TITANIUM_NAILS_OBJECTIVE,
  MOBILE_WORK_STAIRS,
  MOBILE_WORK_STAIRS_OBJECTIVE,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  objectiveQualityUtility,
  objectiveOutcomeUtility,
  resolveObjectivePolicy,
  resolveRiskPreferencePreset,
} from '../src'

describe('generic objective policy', () => {
  it('keeps one greedy four-tier utility while risk selects only the protected fallback floor', () => {
    const resolve = (risk: 'stable' | 'balanced' | 'aggressive') => resolveObjectivePolicy(
      COSMIC_TITANIUM_NAILS,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        riskPreset: resolveRiskPreferencePreset(risk),
      },
    )

    expect(resolve('stable').protectedQualityFloor).toBe(16_440)
    expect(resolve('balanced').protectedQualityFloor).toBe(24_660)
    expect(resolve('aggressive').protectedQualityFloor).toBe(27_400)
    expect(resolve('stable').qualityMilestones).toEqual([16_440, 19_180, 24_660, 27_400])
    expect(resolve('balanced').qualityMilestones).toEqual([16_440, 19_180, 24_660, 27_400])
    expect(resolve('aggressive').qualityMilestones).toEqual([16_440, 19_180, 24_660, 27_400])
    expect(resolve('balanced').qualityUtilityKind).toBe('collectability-tiers')
  })

  it('keeps one-tier Master-style quality continuous and uses HQ chance utility', () => {
    const oneTierObjective = {
      ...COSMIC_TITANIUM_NAILS_OBJECTIVE,
      objectiveId: 'nails-one-tier-same-target-test',
      qualityTiers: [COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers.at(-1)!],
    }
    const oneTier = resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: oneTierObjective,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })
    const fourTier = resolveObjectivePolicy(SURVEY_CRAFTSMANS_COMMAND_BREW, {
      objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })
    const hq = resolveObjectivePolicy(MOBILE_WORK_STAIRS, {
      objective: MOBILE_WORK_STAIRS_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })

    expect(oneTier).toMatchObject({
      qualityUtilityKind: 'continuous-collectability',
      protectedQualityFloor: 15_070,
    })
    expect(fourTier.qualityUtilityKind).toBe('collectability-tiers')
    expect(hq).toMatchObject({
      qualityUtilityKind: 'hq-chance',
      protectedQualityFloor: 18_450,
      qualityMilestones: [17_100, 18_450, 22_500],
      hqChanceMilestones: [50, 75, 100],
      protectedHqChanceFloorPercent: 75,
    })
    expect(objectiveOutcomeUtility(MOBILE_WORK_STAIRS, MOBILE_WORK_STAIRS_OBJECTIVE, 15_750))
      .toBe(0.28)
  })

  it('uses the same full ordinal tier utility for every risk without interpolating mission points', () => {
    const quality = 19_180
    const stable = resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('stable'),
    })
    const balanced = resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })
    const aggressive = resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('aggressive'),
    })

    expect(objectiveQualityUtility(stable, quality)).toBeCloseTo(2 / 4)
    expect(objectiveQualityUtility(balanced, quality)).toBeCloseTo(2 / 4)
    expect(objectiveQualityUtility(aggressive, quality)).toBeCloseTo(2 / 4)
  })

  it('uses recipe qualityMax for hard quality and objective-less recipe fallback', () => {
    const hard = resolveObjectivePolicy(COSMIC_TITANIUM_INGOT, {
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('aggressive'),
    })
    const derived = resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })

    expect(hard).toMatchObject({
      qualityUtilityKind: 'hard-quality-max',
      protectedQualityFloor: COSMIC_TITANIUM_INGOT.qualityMax,
    })
    expect(derived).toMatchObject({
      qualityUtilityKind: 'continuous-collectability',
      qualityMaximum: COSMIC_TITANIUM_NAILS.qualityMax,
      protectedQualityFloor: 15_070,
    })
  })

  it('fails closed on objective identity drift', () => {
    expect(() => resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })).toThrow(/does not belong/)
  })
})
