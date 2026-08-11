import {
  ACTIONS,
  legalActions,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type CraftState,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import { createEpisodeRandomStream, runEpisode, type EpisodeResult } from '@frozen-rabbit-expert/simulator'
import { compareRouteScores, scoreEpisodes } from './objective'
import type { CandidateRouteLabel, LabeledPolicyState, OfflineLabOptions } from './types'

function stateSeed(state: CraftState): number {
  const values = [state.step, state.progress, state.quality, state.durability, state.cp, state.innerQuiet]
  let hash = 0x811c9dc5
  for (const value of values) {
    hash ^= value
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function rootCandidates(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: OfflineLabOptions,
): CraftActionId[] {
  const legal = legalActions(recipe, crafter, state).filter((action) => {
    const preview = previewAction(recipe, crafter, state, action)
    if (state.quality < recipe.requiredQuality && state.progress + preview.progressGain >= recipe.progressRequired) return false
    if (ACTIONS[action].noStep === true && action !== 'finalAppraisal') return false
    if (action === 'wasteNot' || action === 'wasteNot2') return state.buffs.wasteNot === 0
    if (action === 'veneration') return state.buffs.veneration === 0
    if (action === 'innovation') return state.buffs.innovation === 0
    if (action === 'manipulation') return state.buffs.manipulation === 0
    if (action === 'greatStrides') return state.buffs.greatStrides === 0
    return true
  })
  const preferred = new Set<CraftActionId>()
  for (const entry of options.policies) {
    const action = entry.policy(recipe, crafter, state)
    if (action !== null && legal.includes(action)) preferred.add(action)
  }
  if (state.buffs.veneration > 0 || state.buffs.muscleMemory > 0 || state.quality >= recipe.requiredQuality) {
    for (const action of legal) if (ACTIONS[action].category === 'progress') preferred.add(action)
  }
  if (state.condition === 'good') {
    for (const action of ['preciseTouch', 'tricksOfTheTrade', 'intensiveSynthesis'] as const) {
      if (legal.includes(action)) preferred.add(action)
    }
  }
  if (state.condition === 'pliant' || state.durability <= 10) {
    for (const action of ['trainedPerfection', 'immaculateMend', 'mastersMend', 'manipulation'] as const) {
      if (legal.includes(action)) preferred.add(action)
    }
  }
  if (state.comboFrom === 'basicTouch') {
    for (const action of ['standardTouch', 'refinedTouch'] as const) if (legal.includes(action)) preferred.add(action)
  }
  if (state.comboFrom === 'standardTouch' || state.comboFrom === 'observe') {
    if (legal.includes('advancedTouch')) preferred.add('advancedTouch')
  }
  return preferred.size > 0 ? [...preferred].slice(0, 12) : legal.slice(0, 12)
}

export function labelPolicyState(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  options: OfflineLabOptions,
): LabeledPolicyState | null {
  if (state.terminal !== 'none') return null
  const labels: CandidateRouteLabel[] = []
  const baseSeed = options.seed ^ stateSeed(state)

  for (const action of rootCandidates(recipe, crafter, state, options)) {
    for (const continuation of options.policies) {
      const episodesByProfile = new Map<string, EpisodeResult[]>()
      for (const [profileIndex, profile] of options.profiles.entries()) {
        const episodes: EpisodeResult[] = []
        for (let sample = 0; sample < options.samplesPerProfile; sample += 1) {
          const seed = baseSeed
            ^ Math.imul(profileIndex + 1, 0x85eb_ca6b)
            ^ Math.imul(sample + 1, 0x9e37_79b1)
          episodes.push(runEpisode({
            recipe,
            crafter,
            initialState: state,
            firstAction: action,
            policy: continuation.policy,
            random: createEpisodeRandomStream(seed),
            conditionProfile: profile,
            maxSteps: options.maxEpisodeSteps,
          }))
        }
        episodesByProfile.set(profile.id, episodes)
      }
      labels.push({
        action,
        continuationPolicyId: continuation.id,
        score: scoreEpisodes(recipe, episodesByProfile),
        episodeCount: options.profiles.length * options.samplesPerProfile,
      })
    }
  }

  labels.sort((left, right) => (
    compareRouteScores(right.score, left.score)
    || left.action.localeCompare(right.action)
    || left.continuationPolicyId.localeCompare(right.continuationPolicyId)
  ))
  const best = labels[0]
  if (!best) return null
  const bestPerAction = labels.filter((label, index) => (
    labels.findIndex((candidate) => candidate.action === label.action) === index
  ))
  return { state, best, alternatives: bestPerAction.slice(1) }
}
