import { describe, expect, it } from 'vitest'
import { CRAFT_SCENARIOS } from '../apps/web/src/scenarios'
import { HISTORICAL_POLICY_RELEASES } from '../tools/evaluate-solver-scorecard/registry'

describe('solver growth scorecard release registry', () => {
  it('keeps released runtime versions registered and candidates explicitly unregistered', () => {
    for (const scenario of CRAFT_SCENARIOS) {
      const releases = HISTORICAL_POLICY_RELEASES.filter((release) => (
        release.scenarioId === scenario.scenarioId
      ))
      expect(releases.length).toBeGreaterThan(0)
      if (/-candidate\.\d+$/.test(scenario.planner.policyVersion)) {
        expect(releases.some((release) => release.version === scenario.planner.policyVersion)).toBe(false)
      } else {
        expect(releases.at(-1)?.version).toBe(scenario.planner.policyVersion)
      }
    }
  })

  it('uses unique recipe-policy identities and immutable full commit ids', () => {
    expect(new Set(HISTORICAL_POLICY_RELEASES.map((release) => release.version)).size)
      .toBe(HISTORICAL_POLICY_RELEASES.length)
    for (const release of HISTORICAL_POLICY_RELEASES) {
      expect(release.releaseCommit).toMatch(/^[0-9a-f]{40}$/)
    }
  })
})
