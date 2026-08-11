import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import { NORMAL_HEAVY_POC_CONDITIONS } from '@frozen-rabbit-expert/simulator'
import {
  DEFAULT_POLICY_POPULATION,
  baselinePolicy,
  decidePromotion,
  evaluatePolicyHeldOut,
  recommendCompactAction,
  labelPolicyState,
  sampleReachableStates,
  trainCompactScorer,
} from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 722,
  cosmicToolGoodBonus: true,
}

const policies = DEFAULT_POLICY_POPULATION.filter((entry) => (
  ['guide-greedy-v1', 'progress-commit-v1', 'quality-commit-v1'].includes(entry.id)
))

describe('offline practical teacher lab', () => {
  it('samples reproducible reachable states from a policy population', () => {
    const run = () => sampleReachableStates({
      recipe: COSMIC_TITANIUM_INGOT,
      crafter,
      initialStates: [createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)],
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies,
      seeds: [11, 29],
      maxEpisodeSteps: 24,
      maxStates: 30,
    })
    const first = run()
    const second = run()
    expect(first.length).toBeGreaterThan(5)
    expect(first.map((sample) => sample.id)).toEqual(second.map((sample) => sample.id))
    expect(first.map((sample) => sample.state)).toEqual(second.map((sample) => sample.state))
  })

  it('labels the rejected live states from full route outcomes instead of greedy continuation alone', () => {
    let current = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'reflect', {
      success: true,
      nextCondition: 'normal',
    }).nextState
    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'veneration', {
      success: true,
      nextCondition: 'normal',
    }).nextState

    const options = {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      policies,
      samplesPerProfile: 1,
      maxEpisodeSteps: 20,
      seed: 1786440942,
    }
    const venerationLabel = labelPolicyState(COSMIC_TITANIUM_INGOT, crafter, current, options)
    expect(venerationLabel).not.toBeNull()
    expect(venerationLabel!.best.action).not.toBe('wasteNot2')

    current = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, current, 'wasteNot2', {
      success: true,
      nextCondition: 'good',
    }).nextState
    const goodLabel = labelPolicyState(COSMIC_TITANIUM_INGOT, crafter, current, options)
    expect(goodLabel).not.toBeNull()
    expect(goodLabel!.best.action).not.toBe('manipulation')
    console.info(`offline labels: veneration=${venerationLabel!.best.action}/${venerationLabel!.best.continuationPolicyId}, good=${goodLabel!.best.action}/${goodLabel!.best.continuationPolicyId}`)

    const artifact = trainCompactScorer(
      COSMIC_TITANIUM_INGOT,
      crafter,
      [venerationLabel!, goodLabel!],
      { epochs: 300, learningRate: 0.1, seed: 7 },
    )
    expect(artifact.training.examples).toBe(2)
    expect(recommendCompactAction(artifact, COSMIC_TITANIUM_INGOT, crafter, venerationLabel!.state)).toBe(venerationLabel!.best.action)
    expect(recommendCompactAction(artifact, COSMIC_TITANIUM_INGOT, crafter, goodLabel!.state)).toBe(goodLabel!.best.action)

    const initialStates = [createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)]
    const heldOutOptions = {
      profiles: [NORMAL_HEAVY_POC_CONDITIONS],
      seeds: [101, 211],
      maxEpisodeSteps: 32,
    }
    const baselineResult = evaluatePolicyHeldOut(
      COSMIC_TITANIUM_INGOT,
      crafter,
      initialStates,
      baselinePolicy,
      heldOutOptions,
    )
    const compactResult = evaluatePolicyHeldOut(
      COSMIC_TITANIUM_INGOT,
      crafter,
      initialStates,
      (recipe, profile, state) => recommendCompactAction(artifact, recipe, profile, state),
      heldOutOptions,
    )
    const promotion = decidePromotion(baselineResult, compactResult, 0)
    expect(promotion.promote).toBe(false)
    expect(promotion.reasons).toContain('no-robust-completion-gain')
  })
})
