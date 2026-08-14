import { describe, expect, it } from 'vitest'
import { CRAFT_SCENARIO_DATA } from '@frozen-rabbit-expert/data'
import {
  CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE,
  CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS,
  createPairedEpisodeRandomStreams,
  pairedDevelopmentSeeds,
} from '../tools/evaluate-causal-root-mpc/scenarios'

describe('causal root MPC development evaluation contract', () => {
  it('binds every data-owned scenario exactly once', () => {
    expect(CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS.map((scenario) => scenario.scenarioId))
      .toEqual(CRAFT_SCENARIO_DATA.map((scenario) => scenario.scenarioId))
    expect(new Set(CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS.map((scenario) => scenario.scenarioId)).size)
      .toBe(CRAFT_SCENARIO_DATA.length)
    for (const scenario of CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS) {
      expect(scenario.baselinePolicyVersion).not.toHaveLength(0)
      expect(scenario.assumedConditionProfiles).toHaveLength(3)
      expect(scenario.assumedConditionProfiles.every((profile) => profile.evidence === 'assumption'))
        .toBe(true)
    }
  })

  it('labels this corpus as regression-seen development evidence only', () => {
    expect(CAUSAL_ROOT_MPC_DEVELOPMENT_EVIDENCE).toEqual({
      equipmentProfiles: 'regression-seen-exact-player-profiles',
      conditions: 'assumed-development-sensitivity-only',
      seeds: 'paired-common-random-numbers-development-v1',
      releaseUse: 'development-only-not-promotion-not-frozen-not-reserved',
    })
  })

  it('gives both paired arms identical independent RNG stream starts', () => {
    const pair = pairedDevelopmentSeeds(3, 1)[0]!
    expect(pair.baselineSeed).toBe(pair.seed)
    expect(pair.causalSeed).toBe(pair.seed)
    const streams = createPairedEpisodeRandomStreams(pair)
    for (let index = 0; index < 8; index += 1) {
      expect(streams.baseline.nextSuccess()).toBe(streams.causal.nextSuccess())
      expect(streams.baseline.nextCondition()).toBe(streams.causal.nextCondition())
    }
  })

  it('fails closed on invalid corpus sizes and tampered arm seeds', () => {
    expect(() => pairedDevelopmentSeeds(-1, 1)).toThrow(/scenarioIndex/)
    expect(() => pairedDevelopmentSeeds(0, 0)).toThrow(/count/)
    const pair = pairedDevelopmentSeeds(0, 1)[0]!
    expect(() => createPairedEpisodeRandomStreams({ ...pair, causalSeed: pair.seed + 1 }))
      .toThrow(/same seed identity/)
  })
})
