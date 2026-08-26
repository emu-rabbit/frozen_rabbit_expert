import { describe, expect, it } from 'vitest'
import { CRAFT_SCENARIO_DATA } from '@frozen-rabbit-expert/data'
import {
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  craftScenarioModelContentHash,
} from '@frozen-rabbit-expert/domain'
import {
  DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  GUIDE_INTEGRATED_POLICY_VERSION,
  GUIDE_SCENARIO_POLICY_BINDINGS,
  HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
  MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
  NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
  resolveGuideScenarioPolicyBinding,
} from '../src'

describe('guide scenario policy registry', () => {
  it('binds exactly every data-owned scenario', () => {
    expect(Object.keys(GUIDE_SCENARIO_POLICY_BINDINGS).sort())
      .toEqual(CRAFT_SCENARIO_DATA.map(({ scenarioId }) => scenarioId).sort())
    for (const { scenarioId, recipe, objective } of CRAFT_SCENARIO_DATA) {
      expect(resolveGuideScenarioPolicyBinding(scenarioId)).toMatchObject({
        recipeProfileId: recipe.profileId,
        objectiveId: objective.objectiveId,
      })
      const binding = resolveGuideScenarioPolicyBinding(scenarioId)
      expect(binding.scenarioModelIdentityVersion)
        .toBe(CRAFT_SCENARIO_MODEL_IDENTITY_VERSION)
      expect(binding.scenarioModelContentHash)
        .toBe(craftScenarioModelContentHash(recipe, objective))
    }
  })

  it('preserves every established guide version and config', () => {
    expect(resolveGuideScenarioPolicyBinding('cosmotized-ilmenite-ingot')).toMatchObject({
      recipeProfileId: 'cosmotized-ilmenite-ingot-36282-v1',
      objectiveId: 'cosmotized-ilmenite-ingot-required-quality-v1',
      policyVersion: GUIDE_INTEGRATED_POLICY_VERSION,
      config: DEFAULT_GUIDE_INTEGRATED_POLICY_CONFIG,
    })
    expect(resolveGuideScenarioPolicyBinding('cosmotized-ilmenite-nails')).toMatchObject({
      recipeProfileId: 'cosmotized-ilmenite-nails-36283-v1',
      objectiveId: 'cosmotized-ilmenite-nails-four-tier-quality-v3',
      policyVersion: NAILS_GUIDE_INTEGRATED_POLICY_VERSION,
      config: DEFAULT_NAILS_GUIDE_INTEGRATED_POLICY_CONFIG,
    })
    expect(resolveGuideScenarioPolicyBinding('hardened-survey-plank')).toMatchObject({
      recipeProfileId: 'hardened-survey-plank-36205-v1',
      objectiveId: 'hardened-survey-plank-required-quality-v1',
      policyVersion: HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_VERSION,
      config: DEFAULT_HARDENED_SURVEY_PLANK_GUIDE_INTEGRATED_POLICY_CONFIG,
    })
    expect(resolveGuideScenarioPolicyBinding('mobile-work-stairs')).toMatchObject({
      recipeProfileId: 'mobile-work-stairs-36208-v1',
      objectiveId: 'mobile-work-stairs-hq-chance-v2',
      policyVersion: MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_VERSION,
      config: DEFAULT_MOBILE_WORK_STAIRS_GUIDE_INTEGRATED_POLICY_CONFIG,
    })
    expect(resolveGuideScenarioPolicyBinding('survey-craftsmans-command-brew')).toMatchObject({
      recipeProfileId: 'survey-craftsmans-command-brew-36582-v1',
      objectiveId: 'survey-craftsmans-command-brew-four-tier-quality-v2',
      policyVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION,
      config: DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
    })
  })

  it('fails closed instead of borrowing another recipe policy', () => {
    expect(() => resolveGuideScenarioPolicyBinding('unknown-scenario'))
      .toThrow('unsupported guide scenario policy: unknown-scenario')
    expect(() => resolveGuideScenarioPolicyBinding('toString'))
      .toThrow('unsupported guide scenario policy: toString')
  })
})
