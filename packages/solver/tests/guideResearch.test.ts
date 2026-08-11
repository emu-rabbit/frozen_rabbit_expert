import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  GUIDE_TECHNIQUES,
  GUIDE_SCENARIO_ORACLE,
  RESEARCH_TEACHER_PROMOTED,
  guideRolloutAction,
  recommendAction,
  recommendWithResearchTeacher,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5140,
  maxCp: 630,
  cosmicToolGoodBonus: true,
}

function state(patch: Partial<CraftState> = {}): CraftState {
  const initial = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
  return {
    ...initial,
    ...patch,
    buffs: { ...initial.buffs, ...patch.buffs },
  }
}

describe('guide research catalog', () => {
  it('covers the major guide-derived route families without treating them as hard rules', () => {
    const ids = new Set(GUIDE_TECHNIQUES.map((technique) => technique.id))
    expect([...ids]).toEqual(expect.arrayContaining([
      'muscle-memory-progress-staging',
      'condition-resource-conversion',
      'touch-combo-economy',
      'innovation-window-packing',
      'durability-cycle-efficiency',
      'quality-finisher-reserve',
    ]))

    const sequences = GUIDE_TECHNIQUES.flatMap((technique) => technique.sequences ?? [])
      .map((sequence) => sequence.join('>'))
    expect(sequences).toContain('basicTouch>standardTouch>advancedTouch')
    expect(sequences).toContain('basicTouch>refinedTouch')
    expect(sequences).toContain('observe>advancedTouch')
    expect(sequences).toContain('innovation>basicTouch>standardTouch>advancedTouch')
    expect(GUIDE_TECHNIQUES.every((technique) => technique.sources.length > 0)).toBe(true)
  })
})

describe('guide rollout policy', () => {
  it('recognizes the discounted Standard-to-Advanced combo inside Innovation', () => {
    const current = state({
      step: 12,
      progress: 6500,
      quality: 7200,
      durability: 25,
      cp: 300,
      innerQuiet: 7,
      comboFrom: 'standardTouch',
      buffs: { ...state().buffs, innovation: 3 },
    })
    expect(guideRolloutAction(COSMIC_TITANIUM_INGOT, crafter, current)).toBe('advancedTouch')
  })

  it('uses Observe-to-Advanced as a real route when that combo is already armed', () => {
    const current = state({
      step: 12,
      progress: 6500,
      quality: 7200,
      durability: 20,
      cp: 180,
      innerQuiet: 8,
      comboFrom: 'observe',
      buffs: { ...state().buffs, innovation: 2 },
    })
    expect(guideRolloutAction(COSMIC_TITANIUM_INGOT, crafter, current)).toBe('advancedTouch')
  })
})

describe('paired rollout research teacher', () => {
  it('returns a legal, analyzed recommendation within the hard ten-second product limit', () => {
    const current = state({
      step: 10,
      progress: 6100,
      quality: 6500,
      durability: 25,
      cp: 410,
      innerQuiet: 6,
      condition: 'normal',
    })
    const startedAt = performance.now()
    const result = recommendWithResearchTeacher(COSMIC_TITANIUM_INGOT, crafter, current, {
      mechanicsVersion: 'test-mechanics',
      maxTimeMs: 1_500,
      samplesPerProfile: 4,
      maxEpisodeSteps: 36,
      seed: 42,
    })
    const durationMs = performance.now() - startedAt

    expect(result).not.toBeNull()
    expect(durationMs).toBeLessThan(10_000)
    expect(result!.analysis.durationMs).toBeLessThan(10_000)
    expect(result!.analysis.conditionProfiles).toHaveLength(3)
    expect(result!.analysis.techniqueCount).toBeGreaterThanOrEqual(8)
    expect(result!.analysis.candidates[0]!.samples).toBeGreaterThan(0)
    expect(previewAction(COSMIC_TITANIUM_INGOT, crafter, current, result!.recommendation.action).legal).toBe(true)
  })

  it('passes the supported guide-derived scenario oracle', () => {
    const outcomes: string[] = []
    for (const scenario of GUIDE_SCENARIO_ORACLE) {
      const current = state({
        ...scenario.state,
        buffs: { ...state().buffs, ...scenario.state.buffs },
      })
      const result = recommendWithResearchTeacher(COSMIC_TITANIUM_INGOT, crafter, current, {
        mechanicsVersion: 'test-mechanics',
        maxTimeMs: 1_500,
        samplesPerProfile: 3,
        maxEpisodeSteps: 36,
        seed: 314_159,
      })
      expect(result, scenario.id).not.toBeNull()
      const action = result!.recommendation.action
      outcomes.push(`${scenario.id}=${action}`)
      expect(scenario.acceptableActions, `${scenario.id} chose ${action}`).toContain(action)
      expect(scenario.forbiddenActions ?? [], `${scenario.id} chose forbidden ${action}`).not.toContain(action)
    }
    console.info(`guide scenario oracle: ${outcomes.join(', ')}`)
  })

  it('keeps the rejected teacher disabled and protects the live-session fallback decisions', () => {
    const liveCrafter: CrafterProfile = {
      level: 100,
      craftsmanship: 5408,
      control: 5237,
      maxCp: 722,
      cosmicToolGoodBonus: true,
    }
    const trace: Array<{ action: CraftActionId; nextCondition: MaterialCondition }> = [
      { action: 'reflect', nextCondition: 'normal' },
      { action: 'veneration', nextCondition: 'normal' },
      { action: 'wasteNot2', nextCondition: 'good' },
    ]
    let current = createInitialCraftState(COSMIC_TITANIUM_INGOT, liveCrafter)
    for (const [index, step] of trace.entries()) {
      const baseline = recommendAction(COSMIC_TITANIUM_INGOT, liveCrafter, current, { mechanicsVersion: 'test-mechanics' })
      if (index === 2) expect(baseline?.action).toBe('rapidSynthesis')
      expect(previewAction(COSMIC_TITANIUM_INGOT, liveCrafter, current, step.action).legal).toBe(true)
      current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, liveCrafter, current, step.action, {
        success: true,
        nextCondition: step.nextCondition,
      }).nextState
    }
    const goodFallback = recommendAction(COSMIC_TITANIUM_INGOT, liveCrafter, current, { mechanicsVersion: 'test-mechanics' })
    expect(RESEARCH_TEACHER_PROMOTED).toBe(false)
    expect(goodFallback?.action).toBe('intensiveSynthesis')
  })
})
