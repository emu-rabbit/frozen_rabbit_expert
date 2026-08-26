import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  ACTIONS,
  applyObservedOutcome,
  createInitialCraftState,
  legalActions,
  previewAction,
  type CraftActionId,
  type CraftState,
} from '@frozen-rabbit-expert/domain'
import { isPolicyActionSafe } from '@frozen-rabbit-expert/solver'

interface SearchNode {
  state: CraftState
  actions: readonly CraftActionId[]
}

const scenarioId = 'survey-craftsmans-command-brew'
const equipmentIndex = process.argv.indexOf('--equipment-id')
const equipmentId = equipmentIndex < 0
  ? 'player-unbuffed-cosmic-tool-v1'
  : process.argv[equipmentIndex + 1]
const equipment = PLAYER_EQUIPMENT_PROFILES.find((candidate) => candidate.id === equipmentId)
if (equipment === undefined) throw new RangeError(`unknown --equipment-id: ${String(equipmentId)}`)

function positiveIntegerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`)
  return value
}

const beamWidth = positiveIntegerOption('--beam-width', 20_000)
const maxActions = positiveIntegerOption('--max-actions', 36)
const resultLimit = positiveIntegerOption('--result-limit', 12)
const crafter = equipment.crafter

const excludedActions = new Set<CraftActionId>([
  'observe',
  'finalAppraisal',
  'carefulObservation',
  'heartAndSoul',
  'quickInnovation',
])

function stateKey(state: Readonly<CraftState>): string {
  return JSON.stringify(state)
}

function partialScore(node: Readonly<SearchNode>): number {
  const { state } = node
  if (state.terminal === 'failed') return Number.NEGATIVE_INFINITY
  if (state.terminal === 'completed') {
    return 1_000_000_000_000
      + state.quality * 1_000_000
      - node.actions.length * 10_000
      + state.cp * 10
      + Math.max(0, state.durability)
  }
  const qualityRatio = state.quality / SURVEY_CRAFTSMANS_COMMAND_BREW.qualityMax
  const progressRatio = state.progress / SURVEY_CRAFTSMANS_COMMAND_BREW.progressRequired
  const effectiveDurability = state.durability
    + state.buffs.manipulation * 5
    + Number(state.trainedPerfectionAvailable || state.trainedPerfectionActive) * 10
  const targetFloorBonus = state.quality >= 10_200 ? 50_000_000 : 0
  return targetFloorBonus
    + Math.min(1, Math.min(progressRatio, qualityRatio)) * 100_000_000
    + Math.min(1, progressRatio) * 20_000_000
    + Math.min(1, qualityRatio) * 10_000_000
    + state.cp * 2_000
    + effectiveDurability * 10_000
    + state.innerQuiet * 25_000
    + state.buffs.innovation * 5_000
    + state.buffs.greatStrides * 5_000
    + state.buffs.veneration * 3_000
    - node.actions.length * 100
}

function progressScore(node: Readonly<SearchNode>): number {
  const { state } = node
  if (state.terminal !== 'none') return partialScore(node)
  const progressRatio = state.progress / SURVEY_CRAFTSMANS_COMMAND_BREW.progressRequired
  const qualityRatio = state.quality / SURVEY_CRAFTSMANS_COMMAND_BREW.qualityMax
  return progressRatio * 100_000_000
    + qualityRatio * 2_000_000
    + state.cp * 5_000
    + Math.max(0, state.durability) * 20_000
    - node.actions.length * 100
}

function qualityScore(node: Readonly<SearchNode>): number {
  const { state } = node
  if (state.terminal !== 'none') return partialScore(node)
  const progressRatio = state.progress / SURVEY_CRAFTSMANS_COMMAND_BREW.progressRequired
  const qualityRatio = state.quality / SURVEY_CRAFTSMANS_COMMAND_BREW.qualityMax
  return qualityRatio * 100_000_000
    + progressRatio * 2_000_000
    + state.cp * 5_000
    + Math.max(0, state.durability) * 20_000
    + state.innerQuiet * 100_000
    - node.actions.length * 100
}

function selectDiverseBeam(nodes: readonly SearchNode[]): SearchNode[] {
  const selected = new Map<string, SearchNode>()
  const perChannel = Math.max(1, Math.floor(beamWidth / 3))
  for (const score of [partialScore, progressScore, qualityScore]) {
    const ranked = [...nodes].sort((left, right) => score(right) - score(left))
    for (const node of ranked.slice(0, perChannel)) selected.set(stateKey(node.state), node)
  }
  if (selected.size < beamWidth) {
    for (const node of [...nodes].sort((left, right) => partialScore(right) - partialScore(left))) {
      selected.set(stateKey(node.state), node)
      if (selected.size >= beamWidth) break
    }
  }
  return [...selected.values()].slice(0, beamWidth)
}

function deterministicSafeActions(state: CraftState): CraftActionId[] {
  return legalActions(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state).filter((action) => {
    if (excludedActions.has(action)) return false
    const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action)
    return preview.successRate === 1
      && isPolicyActionSafe(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action, preview)
      && (
        ACTIONS[action].noStep !== true
        || preview.cpCost > 0
        || action === 'trainedPerfection'
      )
  })
}

let beam: SearchNode[] = [{
  state: createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter),
  actions: [],
}]
const completed: SearchNode[] = []
let expandedNodes = 0
let transitionCalls = 0

for (let depth = 0; depth < maxActions && beam.length > 0; depth += 1) {
  const bestByState = new Map<string, SearchNode>()
  for (const node of beam) {
    expandedNodes += 1
    for (const action of deterministicSafeActions(node.state)) {
      transitionCalls += 1
      const nextState = applyObservedOutcome(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        node.state,
        action,
        { success: true, nextCondition: 'normal' },
      ).nextState
      if (nextState.terminal === 'failed') continue
      const next: SearchNode = {
        state: nextState,
        actions: [...node.actions, action],
      }
      if (nextState.terminal === 'completed') {
        completed.push(next)
        continue
      }
      const key = stateKey(nextState)
      const previous = bestByState.get(key)
      if (previous === undefined || partialScore(next) > partialScore(previous)) {
        bestByState.set(key, next)
      }
    }
  }
  beam = selectDiverseBeam([...bestByState.values()])
  completed.sort((left, right) => partialScore(right) - partialScore(left))
  if (completed.length > resultLimit * 20) completed.length = resultLimit * 20
  console.error(JSON.stringify({
    depth: depth + 1,
    frontier: beam.length,
    completed: completed.length,
    bestCompletedQuality: completed[0]?.state.quality ?? null,
    bestFrontier: beam[0] === undefined ? null : {
      progress: beam[0].state.progress,
      quality: beam[0].state.quality,
      durability: beam[0].state.durability,
      cp: beam[0].state.cp,
    },
  }))
}

const results = completed
  .sort((left, right) => partialScore(right) - partialScore(left))
  .slice(0, resultLimit)
  .map((node) => {
    let state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const trace = node.actions.map((action) => {
      const before = state
      state = applyObservedOutcome(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        state,
        action,
        { success: true, nextCondition: 'normal' },
      ).nextState
      return {
        action,
        before: {
          progress: before.progress,
          quality: before.quality,
          durability: before.durability,
          cp: before.cp,
        },
        after: {
          progress: state.progress,
          quality: state.quality,
          durability: state.durability,
          cp: state.cp,
        },
      }
    })
    return {
      quality: node.state.quality,
      progress: node.state.progress,
      durability: node.state.durability,
      cp: node.state.cp,
      actionCount: node.actions.length,
      actions: node.actions,
      trace,
    }
  })

console.log(JSON.stringify({
  version: 'command-brew-deterministic-route-search-v1',
  evidence: 'development-only-all-normal-existence-search-not-a-causal-policy',
  scenarioId,
  recipeProfileId: SURVEY_CRAFTSMANS_COMMAND_BREW.profileId,
  objectiveId: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.objectiveId,
  equipment: { id: equipment.id, crafter },
  budget: { beamWidth, maxActions, resultLimit },
  work: { expandedNodes, transitionCalls },
  results,
}, null, 2))
