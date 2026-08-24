import { describe, expect, it } from 'vitest'
import {
  MOBILE_WORK_STAIRS,
  PLAYER_EQUIPMENT_PROFILES,
  cosmicExpertScenarioDataByRecipeId,
} from '@frozen-rabbit-expert/data'
import { createInitialCraftState, previewAction } from '@frozen-rabbit-expert/domain'
import {
  conditionForResolvedEvent,
  inspectActionResolution,
  randomConditionChoices,
} from '../apps/web/src/session/actionResolution'

const crafter = PLAYER_EQUIPMENT_PROFILES[1].crafter

function finishingState(action: 'basicSynthesis' | 'rapidSynthesis') {
  const initial = createInitialCraftState(MOBILE_WORK_STAIRS, crafter)
  const gain = previewAction(MOBILE_WORK_STAIRS, crafter, initial, action).progressGain
  return {
    ...initial,
    progress: MOBILE_WORK_STAIRS.progressRequired - gain,
  }
}

describe('web action resolution input', () => {
  it('settles a guaranteed finishing action without asking for a next condition', () => {
    const result = inspectActionResolution(
      MOBILE_WORK_STAIRS,
      crafter,
      finishingState('basicSynthesis'),
      'basicSynthesis',
      null,
    )

    expect(result).toMatchObject({
      successRequired: false,
      resolvedSuccess: true,
      terminal: 'completed',
      conditionMode: 'terminal',
    })
    expect(conditionForResolvedEvent(result, 'normal', 'good')).toBe('normal')
  })

  it('still asks for success or failure when the finishing action can fail', () => {
    const current = finishingState('rapidSynthesis')

    expect(inspectActionResolution(
      MOBILE_WORK_STAIRS,
      crafter,
      current,
      'rapidSynthesis',
      null,
    )).toMatchObject({
      successRequired: true,
      resolvedSuccess: null,
      terminal: null,
      conditionMode: 'await-result',
    })

    expect(inspectActionResolution(
      MOBILE_WORK_STAIRS,
      crafter,
      current,
      'rapidSynthesis',
      true,
    )).toMatchObject({
      terminal: 'completed',
      conditionMode: 'terminal',
    })

    expect(inspectActionResolution(
      MOBILE_WORK_STAIRS,
      crafter,
      current,
      'rapidSynthesis',
      false,
    )).toMatchObject({
      terminal: null,
      conditionMode: 'select',
    })
  })

  it('does not mistake a Final Appraisal stop for craft completion', () => {
    const current = finishingState('basicSynthesis')
    current.buffs = { ...current.buffs, finalAppraisal: 1 }

    expect(inspectActionResolution(
      MOBILE_WORK_STAIRS,
      crafter,
      current,
      'basicSynthesis',
      true,
    )).toMatchObject({
      terminal: null,
      conditionMode: 'select',
    })
  })

  it('settles Robust as forced Sturdy without asking the player for a random condition', () => {
    const current = { ...createInitialCraftState(MOBILE_WORK_STAIRS, crafter), condition: 'robust' as const }
    const result = inspectActionResolution(
      { ...MOBILE_WORK_STAIRS, availableConditions: [...MOBILE_WORK_STAIRS.availableConditions, 'robust'] },
      crafter,
      current,
      'basicTouch',
      true,
    )

    expect(result.conditionMode).toBe('forced-sturdy')
    expect(conditionForResolvedEvent(result, 'robust', 'good')).toBe('sturdy')
  })

  it('does not offer forced-only Sturdy as a random result for Robust recipes', () => {
    const recipe = cosmicExpertScenarioDataByRecipeId(37519)!.recipe

    expect(recipe.availableConditions).toContain('sturdy')
    expect(recipe.randomConditions).not.toContain('sturdy')
    expect(randomConditionChoices(recipe)).not.toContain('sturdy')
  })
})
