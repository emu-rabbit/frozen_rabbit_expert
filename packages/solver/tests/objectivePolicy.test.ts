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
  resolveObjectivePolicy,
  resolveRiskPreferencePreset,
} from '../src'

describe('generic objective policy', () => {
  it('maps verified collectability tiers to stable, balanced, and aggressive floors', () => {
    const resolve = (risk: 'stable' | 'balanced' | 'aggressive') => resolveObjectivePolicy(
      COSMIC_TITANIUM_NAILS,
      {
        objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
        riskPreset: resolveRiskPreferencePreset(risk),
      },
    )

    expect(resolve('stable').voluntaryQualityFloor).toBe(16_440)
    expect(resolve('balanced').voluntaryQualityFloor).toBe(24_660)
    expect(resolve('aggressive').voluntaryQualityFloor).toBe(27_100)
    expect(resolve('balanced').evidence).toBe('verified-collectability-tiers')
  })

  it('keeps one-tier, provisional, and HQ objectives on continuous utility', () => {
    const oneTierObjective = {
      ...COSMIC_TITANIUM_NAILS_OBJECTIVE,
      objectiveId: 'nails-one-tier-same-target-test',
      qualityTiers: [COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTiers.at(-1)!],
    }
    const oneTier = resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: oneTierObjective,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })
    const provisional = resolveObjectivePolicy(SURVEY_CRAFTSMANS_COMMAND_BREW, {
      objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })
    const hq = resolveObjectivePolicy(MOBILE_WORK_STAIRS, {
      objective: MOBILE_WORK_STAIRS_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })

    expect(oneTier).toMatchObject({
      evidence: 'continuous-soft-quality',
      voluntaryQualityFloor: 14_905,
    })
    expect(provisional.evidence).toBe('continuous-soft-quality')
    expect(hq.evidence).toBe('continuous-soft-quality')
  })

  it('uses ordinal tier progress without interpolating mission points', () => {
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

    expect(objectiveQualityUtility(stable, quality)).toBe(1)
    expect(objectiveQualityUtility(balanced, quality)).toBeCloseTo(2 / 3)
    expect(objectiveQualityUtility(aggressive, quality)).toBeCloseTo(2 / 4)
  })

  it('keeps required quality hard and legacy targets heuristic', () => {
    const hard = resolveObjectivePolicy(COSMIC_TITANIUM_INGOT, {
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('aggressive'),
    })
    const legacy = resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })

    expect(hard).toMatchObject({
      evidence: 'hard-required-quality',
      voluntaryQualityFloor: COSMIC_TITANIUM_INGOT.requiredQuality,
    })
    expect(legacy).toMatchObject({
      evidence: 'legacy-quality-target',
      voluntaryQualityFloor: 14_905,
    })
  })

  it('fails closed on objective identity and target conflicts', () => {
    expect(() => resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: COSMIC_TITANIUM_INGOT_OBJECTIVE,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })).toThrow(/does not belong/)
    expect(() => resolveObjectivePolicy(COSMIC_TITANIUM_NAILS, {
      objective: COSMIC_TITANIUM_NAILS_OBJECTIVE,
      qualityTarget: COSMIC_TITANIUM_NAILS_OBJECTIVE.qualityTarget - 1,
      riskPreset: resolveRiskPreferencePreset('balanced'),
    })).toThrow(/conflicts/)
  })
})
