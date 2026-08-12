import { describe, expect, it } from 'vitest'
import { PLAYER_EQUIPMENT_PROFILES } from '@frozen-rabbit-expert/data'
import {
  MANUAL_CONDITION_PROFILE_NAMES,
  MANUAL_SCENARIO_IDS,
  createScenarioManualSession,
} from '../tools/manual-craft-session/core'

describe('manual craft scenario registry', () => {
  it('runs the command brew against only its three supported conditions', () => {
    expect(MANUAL_SCENARIO_IDS).toContain('survey-craftsmans-command-brew')

    for (const conditionProfile of MANUAL_CONDITION_PROFILE_NAMES) {
      const session = createScenarioManualSession({
        scenarioId: 'survey-craftsmans-command-brew',
        equipmentProfileId: PLAYER_EQUIPMENT_PROFILES[1]!.id,
        conditionProfile,
        seed: 0x4252_4557,
      })

      expect(session.qualityTarget).toBe(12_000)
      expect(session.recipe.availableConditions).toEqual(['normal', 'good', 'malleable'])
      expect(Object.keys(session.conditionProfile.weights).sort()).toEqual(['good', 'malleable', 'normal'])
    }
  })
})
