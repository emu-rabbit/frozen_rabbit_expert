import { describe, expect, it } from 'vitest'
import { GUIDE_SCENARIO_POLICY_BINDINGS } from '@frozen-rabbit-expert/solver'
import { HISTORICAL_POLICY_RELEASES } from '../tools/evaluate-solver-scorecard/registry'

describe('solver growth scorecard release registry', () => {
  it('keeps historical guide versions registered and candidates explicitly unregistered', () => {
    for (const [scenarioId, binding] of Object.entries(GUIDE_SCENARIO_POLICY_BINDINGS)) {
      const releases = HISTORICAL_POLICY_RELEASES.filter((release) => (
        release.scenarioId === scenarioId
      ))
      expect(releases.length).toBeGreaterThan(0)
      if (/-candidate\.\d+$/.test(binding.policyVersion)) {
        expect(releases.some((release) => release.version === binding.policyVersion)).toBe(false)
      } else {
        expect(releases.at(-1)?.version).toBe(binding.policyVersion)
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
