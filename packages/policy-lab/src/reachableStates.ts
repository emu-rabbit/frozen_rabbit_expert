import { assertCraftObjective, previewAction } from '@frozen-rabbit-expert/domain'
import { createEpisodeRandomStream, runEpisodeTrace } from '@frozen-rabbit-expert/simulator'
import { bindEpisodePolicyObjective } from './objective'
import type { ReachableStateOptions, ReachableStateSample } from './types'

function assertUniqueEvidenceIdentities(options: ReachableStateOptions): void {
  const policyIds = new Set<string>()
  for (const source of options.policies) {
    if (source.id.trim().length === 0) throw new Error('reachable-state policy id must not be empty')
    if (policyIds.has(source.id)) throw new Error(`duplicate reachable-state policy id: ${source.id}`)
    policyIds.add(source.id)
  }
  const profileIds = new Set<string>()
  for (const profile of options.profiles) {
    if (profile.id.trim().length === 0) throw new Error('reachable-state profile id must not be empty')
    if (profileIds.has(profile.id)) throw new Error(`duplicate reachable-state profile id: ${profile.id}`)
    profileIds.add(profile.id)
  }
}

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
    state.buffs.finalAppraisal,
    Number(state.trainedPerfectionAvailable),
    Number(state.trainedPerfectionActive),
    state.carefulObservationUsesLeft,
    Number(state.heartAndSoulAvailable),
    Number(state.heartAndSoulActive),
    Number(state.quickInnovationAvailable),
  ].join(':')
}

export function sampleReachableStates(options: ReachableStateOptions): ReachableStateSample[] {
  assertCraftObjective(options.recipe, options.objective)
  assertUniqueEvidenceIdentities(options)
  const groups = new Map<string, Map<string, ReachableStateSample>>()
  for (const initialState of options.initialStates) {
    for (const profile of options.profiles) {
      for (const source of options.policies) {
        const objectivePolicy = bindEpisodePolicyObjective(options.objective, source.policy)
        const groupKey = `${options.objective.objectiveId}:${source.id}:${profile.id}`
        const group = groups.get(groupKey) ?? new Map<string, ReachableStateSample>()
        groups.set(groupKey, group)
        for (const seed of options.seeds) {
          const firstAction = objectivePolicy(options.recipe, options.crafter, initialState)
          if (firstAction === null || !previewAction(options.recipe, options.crafter, initialState, firstAction).legal) continue
          const episode = runEpisodeTrace({
            recipe: options.recipe,
            crafter: options.crafter,
            initialState,
            firstAction,
            policy: objectivePolicy,
            random: createEpisodeRandomStream(seed),
            conditionProfile: profile,
            maxSteps: options.maxEpisodeSteps,
          })
          for (const [stepIndex, step] of episode.steps.entries()) {
            const candidate = {
              objectiveId: options.objective.objectiveId,
              sourcePolicyId: source.id,
              sourceProfileId: profile.id,
              sourceSeed: seed,
              state: step.before,
            }
            const key = bucketKey(candidate)
            if (!group.has(key)) group.set(key, {
              id: `${options.objective.objectiveId}:${source.id}:${profile.id}:${seed}:${stepIndex}`,
              ...candidate,
            })
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
