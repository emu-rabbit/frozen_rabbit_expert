import { previewAction } from '@frozen-rabbit-expert/domain'
import { createEpisodeRandomStream, runEpisodeTrace } from '@frozen-rabbit-expert/simulator'
import type { ReachableStateOptions, ReachableStateSample } from './types'

function bucketKey(sample: Omit<ReachableStateSample, 'id'>): string {
  const state = sample.state
  return [
    Math.floor(state.progress / 400),
    Math.floor(state.quality / 600),
    Math.floor(state.durability / 5),
    Math.floor(state.cp / 25),
    state.innerQuiet,
    state.condition,
    state.comboFrom ?? '-',
    state.buffs.veneration > 0 ? 1 : 0,
    state.buffs.innovation > 0 ? 1 : 0,
    state.buffs.wasteNot > 0 ? 1 : 0,
    state.buffs.manipulation > 0 ? 1 : 0,
  ].join(':')
}

export function sampleReachableStates(options: ReachableStateOptions): ReachableStateSample[] {
  const unique = new Map<string, ReachableStateSample>()
  for (const initialState of options.initialStates) {
    for (const profile of options.profiles) {
      for (const source of options.policies) {
        for (const seed of options.seeds) {
          const firstAction = source.policy(options.recipe, options.crafter, initialState)
          if (firstAction === null || !previewAction(options.recipe, options.crafter, initialState, firstAction).legal) continue
          const episode = runEpisodeTrace({
            recipe: options.recipe,
            crafter: options.crafter,
            initialState,
            firstAction,
            policy: source.policy,
            random: createEpisodeRandomStream(seed),
            conditionProfile: profile,
            maxSteps: options.maxEpisodeSteps,
          })
          for (const [stepIndex, step] of episode.steps.entries()) {
            const candidate = {
              sourcePolicyId: source.id,
              sourceProfileId: profile.id,
              sourceSeed: seed,
              state: step.before,
            }
            const key = bucketKey(candidate)
            if (!unique.has(key)) {
              unique.set(key, { id: `${source.id}:${profile.id}:${seed}:${stepIndex}`, ...candidate })
              if (unique.size >= options.maxStates) return [...unique.values()]
            }
          }
        }
      }
    }
  }
  return [...unique.values()]
}
