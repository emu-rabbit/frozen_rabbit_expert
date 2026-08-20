import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_DEVELOPMENT_CORPUS,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  createGuideIntegratedPolicyController,
  rebuildGuideIntegratedDecisionMemory,
  findGuaranteedProgressFinisherWithRecovery,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'
import {
  createCommandBrewCrossEquipmentPolicyController,
} from '../../packages/policy-lab/src/commandBrewCrossEquipmentPolicy'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'

const recipe = SURVEY_CRAFTSMANS_COMMAND_BREW
const objective = SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE
const crafter = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === 'player-unbuffed-cosmic-tool-v1')!.crafter
const seeds = corpusSeeds(COMMAND_BREW_DEVELOPMENT_CORPUS)
const maxSteps = 80

type CandidateId =
  | 'baseline'
  | 'observe-before-byregot'
  | 'refresh-before-byregot'
  | 'refresh-and-observe-before-byregot'
  | 'hasty-over-trained-finesse'
  | 'hasty-low-iq'
  | 'rapid-progress'
  | 'observe-repair-window'
  | 'observe-repair-wide'
  | 'tricks-good-low-cp'
  | 'tricks-good-mid-iq'
  | 'malleable-reliable-progress'
  | 'stoploss-rapid-2'
  | 'stoploss-quality-2'
  | 'stoploss-combined-2'
  | 'stoploss-combined-1'
  | 'stoploss-combined-3'
  | 'low-route-baseline'
  | 'low-hasty-daring'
  | 'low-risk-burst'

interface CandidateStats {
  optionUses: number
  observeUses: number
  riskyUses: number
  riskyFailures: number
  recoveredRiskFailures: number
  byregotStates: Array<{
    step: number
    condition: CraftState['condition']
    progress: number
    quality: number
    durability: number
    cp: number
    innerQuiet: number
    greatStrides: number
    innovation: number
    proposedAction: CraftActionId | null
  }>
}

interface Episode {
  profileId: string
  seed: number
  result: EpisodeTraceResult
  stats: CandidateStats
}

function isSafe(state: CraftState, action: CraftActionId): boolean {
  const preview = previewAction(recipe, crafter, state, action)
  return preview.legal && isPolicyActionSafe(recipe, crafter, state, action, preview)
}

function createCandidate(candidateId: CandidateId): { policy: EpisodePolicy; stats: CandidateStats } {
  if (
    candidateId === 'low-route-baseline'
    || candidateId === 'low-hasty-daring'
    || candidateId === 'low-risk-burst'
  ) return createLowRouteCandidate(candidateId)
  const history: CraftActionId[] = []
  let pendingAction: CraftActionId | null = null
  let pendingBefore: CraftState | null = null
  let optionUsed = false
  let burstStage: 'none' | 'after-refresh' | 'after-observe' = 'none'
  let rapidFailureStreak = 0
  let qualityFailureStreak = 0
  const stats: CandidateStats = {
    optionUses: 0,
    observeUses: 0,
    riskyUses: 0,
    riskyFailures: 0,
    recoveredRiskFailures: 0,
    byregotStates: [],
  }

  const policy: EpisodePolicy = (activeRecipe, activeCrafter, state) => {
    if (pendingAction !== null) {
      history.push(pendingAction)
      if (pendingBefore === null) throw new Error('pending candidate action is missing its before state')
      const wasRisky = previewAction(activeRecipe, activeCrafter, pendingBefore, pendingAction).successRate < 1
      if (wasRisky && pendingAction === 'rapidSynthesis') {
        rapidFailureStreak = state.progress > pendingBefore.progress ? 0 : rapidFailureStreak + 1
      } else if (pendingAction !== 'rapidSynthesis') rapidFailureStreak = 0
      if (wasRisky && (pendingAction === 'hastyTouch' || pendingAction === 'daringTouch')) {
        qualityFailureStreak = state.quality > pendingBefore.quality ? 0 : qualityFailureStreak + 1
      } else if (pendingAction !== 'hastyTouch' && pendingAction !== 'daringTouch') qualityFailureStreak = 0
    }
    const guide = createGuideIntegratedPolicyController(
      DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
      rebuildGuideIntegratedDecisionMemory(history),
      objective,
    ).policy
    const baseline = guide(activeRecipe, activeCrafter, state)
    if (baseline === 'byregotsBlessing') {
      stats.byregotStates.push({
        step: state.step,
        condition: state.condition,
        progress: state.progress,
        quality: state.quality,
        durability: state.durability,
        cp: state.cp,
        innerQuiet: state.innerQuiet,
        greatStrides: state.buffs.greatStrides,
        innovation: state.buffs.innovation,
        proposedAction: baseline,
      })
    }
    let action = baseline
    if (burstStage === 'after-refresh') {
      if (state.condition === 'good') {
        action = 'byregotsBlessing'
        burstStage = 'none'
      }
      else if (
        candidateId === 'refresh-and-observe-before-byregot'
        && state.buffs.greatStrides > 1
        && state.buffs.innovation > 1
        && isSafe(state, 'observe')
      ) {
        action = 'observe'
        burstStage = 'after-observe'
      } else {
        action = 'byregotsBlessing'
        burstStage = 'none'
      }
    } else if (burstStage === 'after-observe') {
      action = 'byregotsBlessing'
      burstStage = 'none'
    }
    if (!optionUsed && state.terminal === 'none') {
      const byregot = previewAction(activeRecipe, activeCrafter, state, 'byregotsBlessing')
      if (
        candidateId === 'observe-before-byregot'
        && baseline === 'byregotsBlessing'
        && state.condition !== 'good'
        && state.innerQuiet === 10
        && state.buffs.greatStrides > 1
        && state.buffs.innovation > 1
        && state.cp >= byregot.cpCost + previewAction(activeRecipe, activeCrafter, state, 'observe').cpCost
        && isSafe(state, 'observe')
      ) action = 'observe'
      if (
        (candidateId === 'refresh-before-byregot' || candidateId === 'refresh-and-observe-before-byregot')
        && baseline === 'byregotsBlessing'
        && state.condition !== 'good'
        && state.innerQuiet === 10
        && state.buffs.greatStrides >= 3
        && state.buffs.innovation === 0
        && state.cp >= byregot.cpCost
          + previewAction(activeRecipe, activeCrafter, state, 'innovation').cpCost
          + (candidateId === 'refresh-and-observe-before-byregot'
            ? previewAction(activeRecipe, activeCrafter, state, 'observe').cpCost
            : 0)
        && isSafe(state, 'innovation')
        && findGuaranteedProgressFinisherWithRecovery(activeRecipe, activeCrafter, state, {
          maxActions: 8,
          maxNodeExpansions: 256,
        }) !== null
      ) {
        action = 'innovation'
        burstStage = 'after-refresh'
      }
      if (
        candidateId === 'hasty-over-trained-finesse'
        && baseline === 'trainedFinesse'
        && state.buffs.innovation > 0
        && state.durability > 10
        && isSafe(state, 'hastyTouch')
      ) action = 'hastyTouch'
      if (
        candidateId === 'hasty-low-iq'
        && state.innerQuiet >= 2
        && state.innerQuiet <= 6
        && state.buffs.innovation > 0
        && state.durability > 10
        && baseline !== 'hastyTouch'
        && isSafe(state, 'hastyTouch')
      ) action = 'hastyTouch'
      if (
        candidateId === 'rapid-progress'
        && state.progress < 7_500
        && state.durability > 10
        && baseline !== 'rapidSynthesis'
        && isSafe(state, 'rapidSynthesis')
      ) action = 'rapidSynthesis'
      if (
        (candidateId === 'observe-repair-window' || candidateId === 'observe-repair-wide')
        && baseline === 'hastyTouch'
        && state.condition === 'normal'
        && state.innerQuiet >= 1
        && state.innerQuiet < 10
        && state.buffs.greatStrides === 0
        && state.buffs.innovation === 0
        && state.buffs.manipulation >= (candidateId === 'observe-repair-window' ? 2 : 1)
        && state.durability <= (candidateId === 'observe-repair-window' ? 25 : 30)
        && state.cp >= 25
        && isSafe(state, 'observe')
      ) action = 'observe'
      if (
        (candidateId === 'tricks-good-low-cp' || candidateId === 'tricks-good-mid-iq')
        && baseline === 'preciseTouch'
        && state.condition === 'good'
        && state.cp <= (candidateId === 'tricks-good-low-cp' ? 60 : 100)
        && state.innerQuiet >= (candidateId === 'tricks-good-low-cp' ? 6 : 4)
        && state.cp <= activeCrafter.maxCp - 20
        && isSafe(state, 'tricksOfTheTrade')
      ) action = 'tricksOfTheTrade'
      if (
        candidateId === 'malleable-reliable-progress'
        && baseline === 'rapidSynthesis'
        && state.condition === 'malleable'
      ) {
        const groundwork = previewAction(activeRecipe, activeCrafter, state, 'groundwork')
        if (
          groundwork.legal
          && groundwork.successRate === 1
          && state.progress + groundwork.progressGain < activeRecipe.progressRequired
          && isSafe(state, 'groundwork')
        ) action = 'groundwork'
      }
      const stoplossCap = candidateId === 'stoploss-combined-1'
        ? 1
        : candidateId === 'stoploss-combined-3' ? 3 : 2
      const capsRapid = candidateId === 'stoploss-rapid-2'
        || candidateId === 'stoploss-combined-1'
        || candidateId === 'stoploss-combined-2'
        || candidateId === 'stoploss-combined-3'
      if (capsRapid && baseline === 'rapidSynthesis' && rapidFailureStreak >= stoplossCap) {
        const deterministicProgress = (['groundwork', 'prudentSynthesis', 'carefulSynthesis', 'basicSynthesis'] as const)
          .map((candidate) => ({ candidate, preview: previewAction(activeRecipe, activeCrafter, state, candidate) }))
          .filter(({ candidate, preview }) => (
            preview.legal
            && preview.successRate === 1
            && isSafe(state, candidate)
            && (
              state.quality >= 10_200
              || state.progress + preview.progressGain < activeRecipe.progressRequired
            )
          ))
          .sort((left, right) => right.preview.progressGain - left.preview.progressGain)[0]
        if (deterministicProgress !== undefined) action = deterministicProgress.candidate
      }
      const capsQuality = candidateId === 'stoploss-quality-2'
        || candidateId === 'stoploss-combined-1'
        || candidateId === 'stoploss-combined-2'
        || candidateId === 'stoploss-combined-3'
      if (
        capsQuality
        && (baseline === 'hastyTouch' || baseline === 'daringTouch')
        && qualityFailureStreak >= stoplossCap
      ) {
        const deterministicQuality = (['prudentTouch', 'basicTouch'] as const).find((candidate) => (
          previewAction(activeRecipe, activeCrafter, state, candidate).successRate === 1
          && isSafe(state, candidate)
        ))
        if (deterministicQuality !== undefined) action = deterministicQuality
      }
    }
    if (action !== baseline) {
      optionUsed = true
      stats.optionUses += 1
    }
    if (action === 'observe') stats.observeUses += 1
    const preview = action === null ? null : previewAction(activeRecipe, activeCrafter, state, action)
    if (preview !== null && preview.successRate < 1) stats.riskyUses += 1
    pendingAction = action
    pendingBefore = structuredClone(state)
    return action
  }
  return { policy, stats }
}

function createLowRouteCandidate(
  candidateId: Extract<CandidateId, `low-${string}`>,
): { policy: EpisodePolicy; stats: CandidateStats } {
  const base = createCommandBrewCrossEquipmentPolicyController(recipe, crafter, objective)
  if (base.mode !== 'low-resource-route') throw new Error(`unexpected low route mode ${base.mode}`)
  const stats: CandidateStats = {
    optionUses: 0,
    observeUses: 0,
    riskyUses: 0,
    riskyFailures: 0,
    recoveredRiskFailures: 0,
    byregotStates: [],
  }
  let riskUsed = false
  let fishingUsed = false
  let stage: 'none' | 'after-hasty' | 'after-daring' | 'after-innovation' | 'after-observe' = 'none'
  let riskBeforeQuality = 0
  let riskBeforeInnerQuiet = 0

  const select = (
    state: CraftState,
    action: CraftActionId | null,
    baseline: CraftActionId | null,
  ): CraftActionId | null => {
    if (action !== baseline) stats.optionUses += 1
    if (action === 'observe') stats.observeUses += 1
    if (action !== null && previewAction(recipe, crafter, state, action).successRate < 1) stats.riskyUses += 1
    return action
  }

  const policy: EpisodePolicy = (activeRecipe, activeCrafter, state) => {
    if (stage === 'after-hasty') {
      const hastySucceeded = state.quality > riskBeforeQuality || state.innerQuiet > riskBeforeInnerQuiet
      stage = hastySucceeded && isSafe(state, 'daringTouch') ? 'after-daring' : 'none'
      if (stage === 'after-daring') return select(state, 'daringTouch', null)
    } else if (stage === 'after-daring') {
      stage = 'none'
    } else if (stage === 'after-innovation') {
      if (state.condition === 'good') {
        stage = 'none'
        return select(state, 'byregotsBlessing', null)
      }
      if (!fishingUsed && isSafe(state, 'observe')) {
        fishingUsed = true
        stage = 'after-observe'
        return select(state, 'observe', null)
      }
      stage = 'none'
      return select(state, 'byregotsBlessing', null)
    } else if (stage === 'after-observe') {
      stage = 'none'
      return select(state, 'byregotsBlessing', null)
    }

    const baseline = base.policy(activeRecipe, activeCrafter, state)
    if (baseline === 'byregotsBlessing') {
      stats.byregotStates.push({
        step: state.step,
        condition: state.condition,
        progress: state.progress,
        quality: state.quality,
        durability: state.durability,
        cp: state.cp,
        innerQuiet: state.innerQuiet,
        greatStrides: state.buffs.greatStrides,
        innovation: state.buffs.innovation,
        proposedAction: baseline,
      })
    }
    if (
      candidateId !== 'low-route-baseline'
      && !riskUsed
      && baseline === 'prudentTouch'
      && state.condition !== 'good'
      && state.durability >= 20
      && isSafe(state, 'hastyTouch')
    ) {
      riskUsed = true
      riskBeforeQuality = state.quality
      riskBeforeInnerQuiet = state.innerQuiet
      stage = 'after-hasty'
      return select(state, 'hastyTouch', baseline)
    }
    if (
      candidateId === 'low-risk-burst'
      && !riskUsed
      && baseline === 'prudentTouch'
      && state.condition === 'good'
      && isSafe(state, 'preciseTouch')
    ) {
      riskUsed = true
      return select(state, 'preciseTouch', baseline)
    }
    if (
      candidateId === 'low-risk-burst'
      && baseline === 'byregotsBlessing'
      && state.condition !== 'good'
    ) {
      const byregotCp = previewAction(activeRecipe, activeCrafter, state, 'byregotsBlessing').cpCost
      const innovationCp = previewAction(activeRecipe, activeCrafter, state, 'innovation').cpCost
      const observeCp = previewAction(activeRecipe, activeCrafter, state, 'observe').cpCost
      if (
        state.buffs.innovation === 0
        && state.cp >= byregotCp + innovationCp + observeCp
        && isSafe(state, 'innovation')
      ) {
        stage = 'after-innovation'
        return select(state, 'innovation', baseline)
      }
      if (!fishingUsed && state.cp >= byregotCp + observeCp && isSafe(state, 'observe')) {
        fishingUsed = true
        stage = 'after-observe'
        return select(state, 'observe', baseline)
      }
    }
    return select(state, baseline, baseline)
  }
  return { policy, stats }
}

function run(candidateId: CandidateId, profile: WeightedConditionProfile, seed: number): Episode {
  const candidate = createCandidate(candidateId)
  const initialState = createInitialCraftState(recipe, crafter)
  const firstAction = candidate.policy(recipe, crafter, initialState)
  if (firstAction === null) throw new Error(`${candidateId} stopped at initial state`)
  const result = runEpisodeTrace({
    recipe,
    crafter,
    initialState,
    firstAction,
    policy: candidate.policy,
    random: createEpisodeRandomStream(seed),
    conditionProfile: profile,
    maxSteps,
  })
  candidate.stats.riskyFailures = result.steps.filter((step) => (
    !step.success && previewAction(recipe, crafter, step.before, step.action).successRate < 1
  )).length
  candidate.stats.recoveredRiskFailures = candidate.stats.riskyFailures > 0 && result.terminal === 'completed'
    ? candidate.stats.riskyFailures
    : 0
  return { profileId: profile.id, seed, result, stats: candidate.stats }
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function summarize(id: CandidateId, baseline: readonly Episode[], episodes: readonly Episode[]) {
  const baselineByKey = new Map(baseline.map((episode) => [`${episode.profileId}|${episode.seed}`, episode]))
  let completionWins = 0
  let completionLosses = 0
  let threshold10200Wins = 0
  let threshold10200Losses = 0
  let fullWins = 0
  let fullLosses = 0
  let qualityWins = 0
  let qualityLosses = 0
  let delta = 0
  let worstDelta = Number.POSITIVE_INFINITY
  for (const episode of episodes) {
    const reference = baselineByKey.get(`${episode.profileId}|${episode.seed}`)!
    const baselineCompleted = reference.result.terminal === 'completed'
    const completed = episode.result.terminal === 'completed'
    if (completed && !baselineCompleted) completionWins += 1
    if (!completed && baselineCompleted) completionLosses += 1
    const baselineQuality = baselineCompleted ? reference.result.finalState.quality : 0
    const quality = completed ? episode.result.finalState.quality : 0
    const qualityDelta = quality - baselineQuality
    delta += qualityDelta
    worstDelta = Math.min(worstDelta, qualityDelta)
    if (qualityDelta > 0) qualityWins += 1
    if (qualityDelta < 0) qualityLosses += 1
    const baselineHigh = baselineCompleted && baselineQuality >= 10_200
    const high = completed && quality >= 10_200
    if (high && !baselineHigh) threshold10200Wins += 1
    if (!high && baselineHigh) threshold10200Losses += 1
    const baselineFull = baselineCompleted && baselineQuality >= 12_000
    const full = completed && quality >= 12_000
    if (full && !baselineFull) fullWins += 1
    if (!full && baselineFull) fullLosses += 1
  }
  const completed = episodes.filter(({ result }) => result.terminal === 'completed')
  const qualities = completed.map(({ result }) => result.finalState.quality)
  return {
    id,
    episodes: episodes.length,
    optionUses: episodes.reduce((sum, episode) => sum + episode.stats.optionUses, 0),
    observeUses: episodes.reduce((sum, episode) => sum + episode.stats.observeUses, 0),
    riskyUses: episodes.reduce((sum, episode) => sum + episode.stats.riskyUses, 0),
    riskyFailures: episodes.reduce((sum, episode) => sum + episode.stats.riskyFailures, 0),
    recoveredRiskFailures: episodes.reduce((sum, episode) => sum + episode.stats.recoveredRiskFailures, 0),
    completion: completed.length,
    fullQuality: completed.filter(({ result }) => result.finalState.quality >= 12_000).length,
    highQuality10200: completed.filter(({ result }) => result.finalState.quality >= 10_200).length,
    p10: percentile(qualities, 0.1),
    average: qualities.reduce((sum, value) => sum + value, 0) / Math.max(1, qualities.length),
    paired: {
      completion: { wins: completionWins, losses: completionLosses },
      highQuality10200: { wins: threshold10200Wins, losses: threshold10200Losses },
      fullQuality: { wins: fullWins, losses: fullLosses },
      quality: { wins: qualityWins, losses: qualityLosses, averageDelta: delta / episodes.length, worstDelta },
    },
    byregotStates: id === 'baseline' || id === 'low-route-baseline'
      ? episodes.flatMap((episode) => episode.stats.byregotStates).slice(0, 30)
      : undefined,
  }
}

const seedCount = Number(process.argv[process.argv.indexOf('--seed-count') + 1] ?? 128)
const selectedSeeds = seeds.slice(0, seedCount)
const allCandidateIds: CandidateId[] = [
  'baseline',
  'observe-before-byregot',
  'refresh-before-byregot',
  'refresh-and-observe-before-byregot',
  'hasty-over-trained-finesse',
  'hasty-low-iq',
  'rapid-progress',
  'observe-repair-window',
  'observe-repair-wide',
  'tricks-good-low-cp',
  'tricks-good-mid-iq',
  'malleable-reliable-progress',
  'stoploss-rapid-2',
  'stoploss-quality-2',
  'stoploss-combined-2',
  'stoploss-combined-1',
  'stoploss-combined-3',
  'low-route-baseline',
  'low-hasty-daring',
  'low-risk-burst',
]
const candidateIds = process.argv.includes('--low-only')
  ? allCandidateIds.filter((id) => id.startsWith('low-'))
  : process.argv.includes('--stoploss-only')
    ? allCandidateIds.filter((id) => id === 'baseline' || id.startsWith('stoploss-'))
    : allCandidateIds
const results = new Map<CandidateId, Episode[]>()
for (const id of candidateIds) {
  results.set(id, COMMAND_BREW_SENSITIVITY_PROFILES.flatMap((profile) => (
    selectedSeeds.map((seed) => run(id, profile, seed))
  )))
}
const referenceId: CandidateId = process.argv.includes('--low-only') ? 'low-route-baseline' : 'baseline'
const baseline = results.get(referenceId)!
console.log(JSON.stringify({
  evidence: 'development-only-observable-state-option-screen-not-promotion-evidence',
  corpusId: COMMAND_BREW_DEVELOPMENT_CORPUS.id,
  equipment: crafter,
  seedCountPerWorld: selectedSeeds.length,
  worlds: COMMAND_BREW_SENSITIVITY_PROFILES.map(({ id }) => id),
  pairedReference: referenceId,
  candidates: candidateIds.map((id) => summarize(id, baseline, results.get(id)!)),
}, null, 2))
