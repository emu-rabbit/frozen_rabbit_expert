import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  ACTION_IDS,
  applyObservedOutcome,
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftState,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_DEVELOPMENT_CORPUS,
  corpusSeeds,
} from '@frozen-rabbit-expert/policy-lab'
import {
  COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  craftAdaptivePolicyStateContentHashV1,
  createCraftAdaptivePolicyControllerV1,
  isPolicyActionSafe,
  type CraftAdaptivePolicyDecisionResultV1,
  type SerializableCraftAdaptivePolicyMemoryV1,
} from '@frozen-rabbit-expert/solver'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'

const scenarioId = 'survey-craftsmans-command-brew'
const crafter = PLAYER_EQUIPMENT_PROFILES.find(({ id }) => id === 'player-unbuffed-cosmic-tool-v1')!.crafter
const context = {
  scenarioId,
  recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
  objective: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
  crafter,
}
const qualityFloor = 6_839
const maxActions = 40
const secondaryTargetNodeId = 'quality-basic-touch-2'

interface Candidate {
  nodeId: string
  action: CraftActionId
}

interface DeterministicTrace {
  terminal: CraftState['terminal']
  finalState: CraftState
  actions: CraftActionId[]
  decisionNodes: string[]
  originalActions: CraftActionId[]
  substitutionUses: number
  substitutionState: CraftState | null
  safetyViolations: number
}

interface ReachableProgramState {
  state: CraftState
  memory: SerializableCraftAdaptivePolicyMemoryV1
}

function positiveIntegerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function actionSafe(state: CraftState, action: CraftActionId): boolean {
  const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action)
  return preview.legal
    && preview.successRate === 1
    && legalActions(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state).includes(action)
    && isPolicyActionSafe(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action, preview)
}

function deterministicSingleGoodTrace(
  targetActionIndex: number | null,
  candidate: Candidate | null,
): DeterministicTrace {
  const controller = createCraftAdaptivePolicyControllerV1(
    context,
    COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  )
  let state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const actions: CraftActionId[] = []
  const decisionNodes: string[] = []
  const originalActions: CraftActionId[] = []
  let substitutionUses = 0
  let substitutionState: CraftState | null = null
  let safetyViolations = 0

  for (let actionIndex = 0; actionIndex < maxActions && state.terminal === 'none'; actionIndex += 1) {
    const decision = controller.decide(state)
    if (decision.action === null) break
    decisionNodes.push(decision.nodeId)
    originalActions.push(decision.action)
    let action = decision.action
    if (
      candidate !== null
      && targetActionIndex === actionIndex
      && decision.nodeId === candidate.nodeId
      && state.condition === 'good'
      && actionSafe(state, candidate.action)
    ) {
      action = candidate.action
      substitutionUses += 1
      substitutionState = structuredClone(state)
    }
    if (!actionSafe(state, action)) safetyViolations += 1
    const nextCondition: MaterialCondition = targetActionIndex === actionIndex + 1 ? 'good' : 'normal'
    const before = state
    state = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      before,
      action,
      { success: true, nextCondition },
    ).nextState
    actions.push(action)
    controller.advance({ before, action, success: true, after: state })
  }

  return {
    terminal: state.terminal,
    finalState: state,
    actions,
    decisionNodes,
    originalActions,
    substitutionUses,
    substitutionState,
    safetyViolations,
  }
}

function reachableStateKey(entry: ReachableProgramState): string {
  return `${craftAdaptivePolicyStateContentHashV1(entry.state)}|${JSON.stringify(entry.memory)}`
}

function enumerateReachableGoodStates() {
  const nodeOrdinals = new Map(COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM.nodes.map((node) => [
    node.id,
    node.ordinal,
  ]))
  const targetOrdinal = nodeOrdinals.get(secondaryTargetNodeId)
  if (targetOrdinal === undefined) throw new Error(`missing secondary target node ${secondaryTargetNodeId}`)
  const initialController = createCraftAdaptivePolicyControllerV1(
    context,
    COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  )
  let frontier = new Map<string, ReachableProgramState>()
  const initial: ReachableProgramState = {
    state: createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter),
    memory: initialController.snapshot(),
  }
  frontier.set(reachableStateKey(initial), initial)
  const goodByNode = new Map<string, Map<string, ReachableProgramState>>()
  const frontierCounts: number[] = []
  let expandedStates = 0
  let generatedTransitions = 0

  for (let depth = 0; depth < maxActions && frontier.size > 0; depth += 1) {
    frontierCounts.push(frontier.size)
    const next = new Map<string, ReachableProgramState>()
    for (const entry of frontier.values()) {
      const controller = createCraftAdaptivePolicyControllerV1(
        context,
        COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
        { initialMemory: entry.memory },
      )
      const decision = controller.decide(entry.state)
      if (decision.action === null) continue
      expandedStates += 1
      if (entry.state.condition === 'good') {
        const nodeStates = goodByNode.get(decision.nodeId) ?? new Map<string, ReachableProgramState>()
        nodeStates.set(reachableStateKey(entry), entry)
        goodByNode.set(decision.nodeId, nodeStates)
      }
      if (decision.nodeId === secondaryTargetNodeId) continue
      const decisionOrdinal = nodeOrdinals.get(decision.nodeId)
      const resumeOrdinal = entry.memory.resumeNodeId === null
        ? null
        : nodeOrdinals.get(entry.memory.resumeNodeId) ?? null
      if (
        decisionOrdinal !== undefined
        && decisionOrdinal > targetOrdinal
        && (resumeOrdinal === null || resumeOrdinal > targetOrdinal)
      ) continue
      if (!actionSafe(entry.state, decision.action)) {
        throw new Error(`program selected an unsafe reachable action ${decision.action}`)
      }
      for (const nextCondition of ['normal', 'good', 'malleable'] as const) {
        generatedTransitions += 1
        const after = applyObservedOutcome(
          SURVEY_CRAFTSMANS_COMMAND_BREW,
          crafter,
          entry.state,
          decision.action,
          { success: true, nextCondition },
        ).nextState
        const branchController = createCraftAdaptivePolicyControllerV1(
          context,
          COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
          { initialMemory: entry.memory },
        )
        const memory = branchController.advance({
          before: entry.state,
          action: decision.action,
          success: true,
          after,
        })
        if (after.terminal !== 'none') continue
        const reachable = { state: after, memory }
        next.set(reachableStateKey(reachable), reachable)
      }
    }
    if (next.size > 250_000) throw new Error(`reachable state frontier exceeded research cap: ${next.size}`)
    frontier = next
  }
  return { goodByNode, frontierCounts, expandedStates, generatedTransitions }
}

function allNormalContinuation(
  start: Readonly<ReachableProgramState>,
  candidate: Candidate | null,
): DeterministicTrace {
  const controller = createCraftAdaptivePolicyControllerV1(
    context,
    COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
    { initialMemory: start.memory },
  )
  let state = structuredClone(start.state)
  const actions: CraftActionId[] = []
  const decisionNodes: string[] = []
  const originalActions: CraftActionId[] = []
  let substitutionUses = 0
  let substitutionState: CraftState | null = null
  let safetyViolations = 0
  for (let actionIndex = 0; actionIndex < maxActions && state.terminal === 'none'; actionIndex += 1) {
    const decision = controller.decide(state)
    if (decision.action === null) break
    decisionNodes.push(decision.nodeId)
    originalActions.push(decision.action)
    let action = decision.action
    if (
      candidate !== null
      && substitutionUses === 0
      && decision.nodeId === candidate.nodeId
      && state.condition === 'good'
      && actionSafe(state, candidate.action)
    ) {
      action = candidate.action
      substitutionUses = 1
      substitutionState = structuredClone(state)
    }
    if (!actionSafe(state, action)) safetyViolations += 1
    const before = state
    state = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      before,
      action,
      { success: true, nextCondition: 'normal' },
    ).nextState
    actions.push(action)
    controller.advance({ before, action, success: true, after: state })
  }
  return {
    terminal: state.terminal,
    finalState: state,
    actions,
    decisionNodes,
    originalActions,
    substitutionUses,
    substitutionState,
    safetyViolations,
  }
}

interface ResearchEpisodeAdapter {
  firstAction: CraftActionId | null
  policy: EpisodePolicy
  finalize: (state: CraftState) => void
  stats: () => { substitutionUses: number; goodActionStates: number; safetyViolations: number }
}

function createResearchEpisodeAdapter(candidate: Candidate | null): ResearchEpisodeAdapter {
  const controller = createCraftAdaptivePolicyControllerV1(
    context,
    COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM,
  )
  let pendingBefore = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  let pendingAction: CraftActionId | null = null
  let substitutionUses = 0
  let goodActionStates = 0
  let safetyViolations = 0

  const select = (state: CraftState, decision: CraftAdaptivePolicyDecisionResultV1): CraftActionId | null => {
    if (state.condition === 'good') goodActionStates += 1
    let action = decision.action
    if (
      action !== null
      && candidate !== null
      && substitutionUses === 0
      && decision.nodeId === candidate.nodeId
      && state.condition === 'good'
      && actionSafe(state, candidate.action)
    ) {
      action = candidate.action
      substitutionUses = 1
    }
    if (action !== null && !actionSafe(state, action)) safetyViolations += 1
    pendingBefore = structuredClone(state)
    pendingAction = action
    return action
  }

  const observePending = (state: CraftState) => {
    if (pendingAction === null) throw new Error('research adapter has no pending action')
    const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, pendingBefore, pendingAction)
    if (preview.successRate !== 1) throw new Error('research adapter selected a non-deterministic action')
    controller.advance({
      before: pendingBefore,
      action: pendingAction,
      success: true,
      after: state,
    })
    pendingAction = null
  }

  const initialState = structuredClone(pendingBefore)
  const firstAction = select(initialState, controller.decide(initialState))
  const policy: EpisodePolicy = (_recipe, _crafter, state) => {
    observePending(state)
    return select(state, controller.decide(state))
  }

  return {
    firstAction,
    policy,
    finalize: (state) => {
      if (pendingAction !== null) observePending(state)
      const memory = controller.snapshot()
      if (memory.totalActionUses <= 0 || memory.totalObservedTransitions !== memory.totalActionUses) {
        throw new Error('research adapter observation accounting drift')
      }
    },
    stats: () => ({ substitutionUses, goodActionStates, safetyViolations }),
  }
}

interface EvaluatedEpisode {
  profileId: string
  seed: number
  result: EpisodeTraceResult
  substitutionUses: number
  goodActionStates: number
  safetyViolations: number
}

function evaluateEpisode(
  candidate: Candidate | null,
  profile: WeightedConditionProfile,
  seed: number,
): EvaluatedEpisode {
  const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const adapter = createResearchEpisodeAdapter(candidate)
  const result = adapter.firstAction === null
    ? {
        terminal: 'none' as const,
        finalState: initialState,
        actions: [] as CraftActionId[],
        steps: [],
        stoppedByLimit: false,
        stopReason: 'policy-null' as const,
      }
    : runEpisodeTrace({
        recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        initialState,
        firstAction: adapter.firstAction,
        policy: adapter.policy,
        random: createEpisodeRandomStream(seed),
        conditionProfile: profile,
        maxSteps: maxActions,
      })
  if (result.actions.length > 0) adapter.finalize(result.finalState)
  const stats = adapter.stats()
  if (stats.substitutionUses > 1) throw new Error('candidate substituted more than once')
  return {
    profileId: profile.id,
    seed,
    result,
    ...stats,
  }
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function summarize(candidate: Candidate, baseline: readonly EvaluatedEpisode[], episodes: readonly EvaluatedEpisode[]) {
  const baselineByKey = new Map(baseline.map((episode) => [`${episode.profileId}|${episode.seed}`, episode]))
  let qualityWins = 0
  let qualityLosses = 0
  let qualityTies = 0
  let completionWins = 0
  let completionLosses = 0
  let qualityDelta = 0
  let worstQualityDelta = Number.POSITIVE_INFINITY
  let minimumQuality = Number.POSITIVE_INFINITY
  let minimumTriggeredQuality = Number.POSITIVE_INFINITY
  let triggeredEpisodes = 0
  let multiGoodEpisodes = 0
  let safetyViolations = 0
  let maximumSubstitutionUses = 0
  for (const episode of episodes) {
    const baselineEpisode = baselineByKey.get(`${episode.profileId}|${episode.seed}`)!
    const baselineCompleted = baselineEpisode.result.terminal === 'completed'
    const candidateCompleted = episode.result.terminal === 'completed'
    if (candidateCompleted && !baselineCompleted) completionWins += 1
    if (!candidateCompleted && baselineCompleted) completionLosses += 1
    const baselineQuality = baselineCompleted ? baselineEpisode.result.finalState.quality : 0
    const candidateQuality = candidateCompleted ? episode.result.finalState.quality : 0
    const delta = candidateQuality - baselineQuality
    qualityDelta += delta
    worstQualityDelta = Math.min(worstQualityDelta, delta)
    minimumQuality = Math.min(minimumQuality, candidateQuality)
    if (delta > 0) qualityWins += 1
    else if (delta < 0) qualityLosses += 1
    else qualityTies += 1
    if (episode.substitutionUses === 1) {
      triggeredEpisodes += 1
      minimumTriggeredQuality = Math.min(minimumTriggeredQuality, candidateQuality)
    }
    if (episode.goodActionStates > 1) multiGoodEpisodes += 1
    safetyViolations += episode.safetyViolations
    maximumSubstitutionUses = Math.max(maximumSubstitutionUses, episode.substitutionUses)
  }
  return {
    nodeId: candidate.nodeId,
    action: candidate.action,
    episodes: episodes.length,
    triggeredEpisodes,
    multiGoodEpisodes,
    maximumSubstitutionUses,
    completion: { wins: completionWins, losses: completionLosses },
    quality: {
      wins: qualityWins,
      losses: qualityLosses,
      ties: qualityTies,
      averageDelta: qualityDelta / episodes.length,
      worstDelta: worstQualityDelta,
      minimum: minimumQuality,
      minimumTriggered: triggeredEpisodes === 0 ? null : minimumTriggeredQuality,
      p10: percentile(episodes.map((episode) => episode.result.finalState.quality), 0.1),
    },
    safetyViolations,
  }
}

const allNormalTrace = deterministicSingleGoodTrace(null, null)
if (allNormalTrace.terminal !== 'completed' || allNormalTrace.finalState.quality !== qualityFloor) {
  throw new Error('unexpected all-Normal conservative program baseline')
}

const reachableNodes = allNormalTrace.decisionNodes.map((nodeId, actionIndex) => ({
  nodeId,
  actionIndex,
  normalAction: allNormalTrace.originalActions[actionIndex]!,
}))
const deterministicScreens: Array<{
  candidate: Candidate
  actionIndex: number
  originalAction: CraftActionId
  terminal: CraftState['terminal']
  baselineQuality: number
  quality: number
  qualityDelta: number
  baselineActions: number
  actions: number
}> = []
let enumeratedPairs = 0
for (const reachable of reachableNodes) {
  if (reachable.actionIndex === 0 || reachable.nodeId === 'progress-delicate-1') continue
  const goodBaseline = deterministicSingleGoodTrace(reachable.actionIndex, null)
  if (goodBaseline.decisionNodes[reachable.actionIndex] !== reachable.nodeId) continue
  const originalAction = goodBaseline.originalActions[reachable.actionIndex]!
  for (const action of ACTION_IDS) {
    enumeratedPairs += 1
    if (action === originalAction) continue
    const result = deterministicSingleGoodTrace(reachable.actionIndex, {
      nodeId: reachable.nodeId,
      action,
    })
    if (
      result.substitutionUses !== 1
      || result.safetyViolations !== 0
      || result.terminal !== 'completed'
      || result.finalState.quality < qualityFloor
    ) continue
    deterministicScreens.push({
      candidate: { nodeId: reachable.nodeId, action },
      actionIndex: reachable.actionIndex,
      originalAction,
      terminal: result.terminal,
      baselineQuality: goodBaseline.finalState.quality,
      quality: result.finalState.quality,
      qualityDelta: result.finalState.quality - goodBaseline.finalState.quality,
      baselineActions: goodBaseline.actions.length,
      actions: result.actions.length,
    })
  }
}

const seedCount = positiveIntegerOption('--seed-count', 16)
const skipPrefixProof = process.argv.includes('--skip-prefix-proof')
const seeds = corpusSeeds(COMMAND_BREW_DEVELOPMENT_CORPUS).slice(0, seedCount)
const baselineEpisodes = COMMAND_BREW_SENSITIVITY_PROFILES.flatMap((profile) => (
  seeds.map((seed) => evaluateEpisode(null, profile, seed))
))
const evaluated = deterministicScreens.map((screen) => {
  const episodes = COMMAND_BREW_SENSITIVITY_PROFILES.flatMap((profile) => (
    seeds.map((seed) => evaluateEpisode(screen.candidate, profile, seed))
  ))
  return {
    ...screen,
    development: summarize(screen.candidate, baselineEpisodes, episodes),
  }
})
const ranked = [...evaluated].sort((left, right) => (
  left.development.completion.losses - right.development.completion.losses
  || left.development.quality.losses - right.development.quality.losses
  || right.development.quality.averageDelta - left.development.quality.averageDelta
  || right.development.triggeredEpisodes - left.development.triggeredEpisodes
  || left.candidate.nodeId.localeCompare(right.candidate.nodeId)
  || left.candidate.action.localeCompare(right.candidate.action)
))
const preferredCandidate: Candidate = {
  nodeId: secondaryTargetNodeId,
  action: 'preciseTouch',
}
const reachable = skipPrefixProof ? null : enumerateReachableGoodStates()
const preferredOpportunityStates = [...(reachable?.goodByNode.get(preferredCandidate.nodeId)?.values() ?? [])]
let prefixCompletionLosses = 0
let prefixQualityWins = 0
let prefixQualityLosses = 0
let prefixQualityTies = 0
let prefixFloorBreaches = 0
let prefixSafetyViolations = 0
let prefixMaximumSubstitutionUses = 0
let prefixMinimumTriggeredQuality = Number.POSITIVE_INFINITY
let prefixTriggered = 0
let prefixWithFirstCandidateUsed = 0
const prefixTriggerStates: CraftState[] = []
const priorPreciseUses: number[] = []
for (const opportunity of preferredOpportunityStates) {
  const baseline = allNormalContinuation(opportunity, null)
  const candidate = allNormalContinuation(opportunity, preferredCandidate)
  const preciseUses = opportunity.memory.actionUses.preciseTouch
  priorPreciseUses.push(preciseUses)
  if (preciseUses >= 1) prefixWithFirstCandidateUsed += 1
  prefixMaximumSubstitutionUses = Math.max(prefixMaximumSubstitutionUses, candidate.substitutionUses)
  prefixSafetyViolations += candidate.safetyViolations
  if (baseline.terminal === 'completed' && candidate.terminal !== 'completed') prefixCompletionLosses += 1
  if (candidate.substitutionUses === 1) {
    prefixTriggered += 1
    if (candidate.substitutionState === null) throw new Error('triggered prefix is missing its substitution state')
    prefixTriggerStates.push(candidate.substitutionState)
    prefixMinimumTriggeredQuality = Math.min(prefixMinimumTriggeredQuality, candidate.finalState.quality)
    if (candidate.finalState.quality < qualityFloor) prefixFloorBreaches += 1
  }
  const delta = candidate.finalState.quality - baseline.finalState.quality
  if (delta > 0) prefixQualityWins += 1
  else if (delta < 0) prefixQualityLosses += 1
  else prefixQualityTies += 1
}
const triggerRange = (select: (state: CraftState) => number) => ({
  minimum: Math.min(...prefixTriggerStates.map(select)),
  maximum: Math.max(...prefixTriggerStates.map(select)),
})

console.log(JSON.stringify({
  evidence: 'development-only-second-good-route-consistent-substitution-search-after-first-candidate-not-promotion-evidence',
  recipeProfileId: SURVEY_CRAFTSMANS_COMMAND_BREW.profileId,
  programId: COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM.programId,
  programContentHash: COMMAND_BREW_CONSERVATIVE_ADAPTIVE_PROGRAM.contentHash,
  equipment: {
    evidence: 'exact-regression-seen-player-panel',
    craftsmanship: crafter.craftsmanship,
    control: crafter.control,
    maxCp: crafter.maxCp,
    cosmicToolGoodBonus: crafter.cosmicToolGoodBonus,
    specialist: crafter.specialist === true,
  },
  deterministicScreen: {
    allNormalQualityFloor: qualityFloor,
    reachableActionNodes: reachableNodes.length,
    enumeratedNodeActionPairs: enumeratedPairs,
    passingCandidates: deterministicScreens.length,
  },
  developmentSample: {
    corpusId: COMMAND_BREW_DEVELOPMENT_CORPUS.id,
    role: COMMAND_BREW_DEVELOPMENT_CORPUS.role,
    seedCountPerWorld: seedCount,
    conditionWorlds: COMMAND_BREW_SENSITIVITY_PROFILES.map(({ id }) => id),
    episodesPerCandidate: seedCount * COMMAND_BREW_SENSITIVITY_PROFILES.length,
    baseline: {
      completion: baselineEpisodes.filter(({ result }) => result.terminal === 'completed').length,
      minimumQuality: Math.min(...baselineEpisodes.map(({ result }) => result.finalState.quality)),
      multiGoodEpisodes: baselineEpisodes.filter(({ goodActionStates }) => goodActionStates > 1).length,
    },
  },
  preferredCandidatePrefixProof: skipPrefixProof ? null : {
    candidate: preferredCandidate,
    scope: 'all-unique-program-state-prefixes-under-normal-good-malleable-including-first-candidate-then-all-normal-suffix',
    exhaustiveReachability: {
      frontierCounts: reachable!.frontierCounts,
      expandedStates: reachable!.expandedStates,
      generatedTransitions: reachable!.generatedTransitions,
      uniqueGoodOpportunityStates: preferredOpportunityStates.length,
      opportunityStatesWithFirstPreciseAlreadyUsed: prefixWithFirstCandidateUsed,
    },
    independentOnceContract: {
      proposedFlag: 'command-brew-second-good-substitution-used',
      requiredFlagValueBeforeUse: false,
      priorPreciseTouchUses: {
        minimum: Math.min(...priorPreciseUses),
        maximum: Math.max(...priorPreciseUses),
      },
      note: 'Do not use preciseTouch actionUses==0 as the second-use guard because the first candidate may already have used it.',
    },
    triggeredStates: prefixTriggered,
    maximumSubstitutionUses: prefixMaximumSubstitutionUses,
    triggerStateEnvelope: {
      step: triggerRange((state) => state.step),
      progress: triggerRange((state) => state.progress),
      quality: triggerRange((state) => state.quality),
      durability: triggerRange((state) => state.durability),
      cp: triggerRange((state) => state.cp),
      innerQuiet: triggerRange((state) => state.innerQuiet),
      wasteNot: triggerRange((state) => state.buffs.wasteNot),
      veneration: triggerRange((state) => state.buffs.veneration),
      manipulation: triggerRange((state) => state.buffs.manipulation),
    },
    completionLosses: prefixCompletionLosses,
    quality: {
      wins: prefixQualityWins,
      losses: prefixQualityLosses,
      ties: prefixQualityTies,
      floorBreaches: prefixFloorBreaches,
      minimumTriggered: prefixTriggered === 0 ? null : prefixMinimumTriggeredQuality,
    },
    safetyViolations: prefixSafetyViolations,
  },
  candidates: ranked,
}, null, 2))
