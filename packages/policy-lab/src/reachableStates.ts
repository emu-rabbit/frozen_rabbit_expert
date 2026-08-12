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
    state.buffs.veneration,
    state.buffs.innovation,
    state.buffs.wasteNot,
    state.buffs.manipulation,
    state.buffs.greatStrides,
    state.buffs.muscleMemory,
    state.buffs.expedience,
  ].join(':')
}

export function sampleReachableStates(options: ReachableStateOptions): ReachableStateSample[] {
  const groups = new Map<string, Map<string, ReachableStateSample>>()
  for (const initialState of options.initialStates) {
    for (const profile of options.profiles) {
      for (const source of options.policies) {
        const groupKey = `${source.id}:${profile.id}`
        const group = groups.get(groupKey) ?? new Map<string, ReachableStateSample>()
        groups.set(groupKey, group)
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
            if (!group.has(key)) group.set(key, { id: `${source.id}:${profile.id}:${seed}:${stepIndex}`, ...candidate })
          }
        }
      }
    }
  }

  const queues = [...groups.values()].map((group) => [...group.values()])
  const selected: ReachableStateSample[] = []
  const selectedBuckets = new Set<string>()
  let cursor = 0
  while (selected.length < options.maxStates && queues.some((queue) => cursor < queue.length)) {
    for (let offset = 0; offset < queues.length; offset += 1) {
      const queue = queues[(cursor + offset) % queues.length]!
      const candidate = queue[cursor]
      if (!candidate) continue
      const key = bucketKey(candidate)
      if (selectedBuckets.has(key)) continue
      selected.push(candidate)
      selectedBuckets.add(key)
      if (selected.length >= options.maxStates) break
    }
    cursor += 1
  }
  return selected
}
