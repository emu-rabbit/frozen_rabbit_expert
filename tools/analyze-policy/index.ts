import { readFileSync } from 'node:fs'
import {
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CraftActionId, type CrafterProfile } from '@frozen-rabbit-expert/domain'
import {
  POC_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodePolicy,
} from '@frozen-rabbit-expert/simulator'
import {
  assertCompactScorerCompatible,
  recommendCompactAction,
  TARGET_CRAFTER_722,
  targetCrafterSafePolicy,
  type CompactScorerArtifact,
} from '@frozen-rabbit-expert/policy-lab'

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}`)
  return process.argv[index + 1]!
}

function optionalArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback
}

const requestedMaxCp = Number(optionalArgument('max-cp', String(TARGET_CRAFTER_722.maxCp)))
if (!Number.isInteger(requestedMaxCp) || requestedMaxCp <= 0) {
  throw new Error('--max-cp must be a positive integer')
}
const crafter: CrafterProfile = { ...TARGET_CRAFTER_722, maxCp: requestedMaxCp }

function seedSeries(count: number, start: number, stride: number): number[] {
  return Array.from({ length: count }, (_, index) => (start + Math.imul(index + 1, stride)) >>> 0)
}

function analyze(name: string, policy: EpisodePolicy) {
  const initialState = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
  const actionCounts = new Map<CraftActionId, number>()
  const seedCount = Number(optionalArgument('seed-count', '24'))
  const seedStart = Number(optionalArgument('seed-start', String(0x51a7_e001)))
  const maxEpisodeSteps = Number(optionalArgument('max-episode-steps', '50'))
  if (!Number.isInteger(seedCount) || seedCount < 1) throw new Error('--seed-count must be a positive integer')
  if (!Number.isInteger(seedStart) || seedStart < 0) throw new Error('--seed-start must be a non-negative integer')
  if (!Number.isInteger(maxEpisodeSteps) || maxEpisodeSteps < 1) {
    throw new Error('--max-episode-steps must be a positive integer')
  }
  const traces = POC_SENSITIVITY_PROFILES.flatMap((profile) => (
    seedSeries(seedCount, seedStart, 0x85eb_ca6b).map((seed) => {
      const firstAction = policy(COSMIC_TITANIUM_INGOT, crafter, initialState)
      if (firstAction === null) throw new Error(`${name} returned no opening action`)
      const trace = runEpisodeTrace({
        recipe: COSMIC_TITANIUM_INGOT,
        crafter,
        initialState,
        firstAction,
        policy,
        random: createEpisodeRandomStream(seed),
        conditionProfile: profile,
        maxSteps: maxEpisodeSteps,
      })
      for (const action of trace.actions) actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1)
      return { profile: profile.id, seed, ...trace }
    })
  ))
  const terminalCounts = Object.fromEntries(
    ['completed', 'failed', 'none'].map((terminal) => [terminal, traces.filter((trace) => trace.terminal === terminal).length]),
  )
  const stopReasonCounts = Object.fromEntries(
    ['completed', 'failed', 'policy-null', 'no-legal-action', 'illegal-action', 'action-limit']
      .map((reason) => [reason, traces.filter((trace) => trace.stopReason === reason).length]),
  )
  const stoppedBeforeLimit = traces.filter((trace) => trace.terminal === 'none' && !trace.stoppedByLimit).length
  const averages = {
    progressRatio: traces.reduce((sum, trace) => sum + trace.finalState.progress / COSMIC_TITANIUM_INGOT.progressRequired, 0) / traces.length,
    qualityRatio: traces.reduce((sum, trace) => (
      sum + trace.finalState.quality / COSMIC_TITANIUM_INGOT.qualityMax
    ), 0) / traces.length,
    durability: traces.reduce((sum, trace) => sum + trace.finalState.durability, 0) / traces.length,
    cp: traces.reduce((sum, trace) => sum + trace.finalState.cp, 0) / traces.length,
    steps: traces.reduce((sum, trace) => sum + trace.actions.length, 0) / traces.length,
  }
  const representative = [...traces]
    .sort((left, right) => (
      Math.min(
        left.finalState.progress / COSMIC_TITANIUM_INGOT.progressRequired,
        left.finalState.quality / COSMIC_TITANIUM_INGOT.qualityMax,
      )
      - Math.min(
        right.finalState.progress / COSMIC_TITANIUM_INGOT.progressRequired,
        right.finalState.quality / COSMIC_TITANIUM_INGOT.qualityMax,
      )
    ))
    .slice(0, 3)
    .map((trace) => ({
      profile: trace.profile,
      seed: trace.seed,
      terminal: trace.terminal,
      stoppedByLimit: trace.stoppedByLimit,
      final: trace.finalState,
      actions: trace.actions,
    }))
  return {
    name,
    crafter,
    terminalCounts,
    stopReasonCounts,
    stoppedBeforeLimit,
    averages,
    actionCounts: Object.fromEntries([...actionCounts].sort((left, right) => right[1] - left[1])),
    representative,
  }
}

const artifact = JSON.parse(readFileSync(argument('artifact'), 'utf8')) as CompactScorerArtifact
assertCompactScorerCompatible(
  artifact,
  COSMIC_TITANIUM_INGOT,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  crafter,
)
const compactPolicy: EpisodePolicy = (recipe, profile, state) => recommendCompactAction(
  artifact,
  recipe,
  COSMIC_TITANIUM_INGOT_OBJECTIVE,
  profile,
  state,
)
console.log(JSON.stringify([
  analyze('targeted-reference', targetCrafterSafePolicy),
  analyze('compact-candidate', compactPolicy),
], null, 2))
