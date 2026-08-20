import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  previewAction,
  type CraftActionId,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'
import {
  DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
  createGuideIntegratedPolicyFactory,
} from '@frozen-rabbit-expert/solver'
import { runEpisodeTrace } from '@frozen-rabbit-expert/simulator'

const allNormal = {
  id: 'research-command-brew-all-normal-v1',
  evidence: 'assumption' as const,
  weights: { normal: 1 },
}

const reliableRoutePrefix = [
  'reflect',
  'manipulation',
  'basicTouch',
  'refinedTouch',
  'innovation',
  'delicateSynthesis',
  'basicTouch',
  'standardTouch',
  'advancedTouch',
  'trainedPerfection',
  'greatStrides',
  'innovation',
  'preparatoryTouch',
  'greatStrides',
  'byregotsBlessing',
  'veneration',
  'wasteNot2',
  'groundwork',
  'immaculateMend',
  'groundwork',
  'veneration',
  'groundwork',
  'groundwork',
  'groundwork',
  'groundwork',
] as const satisfies readonly CraftActionId[]

function replayReliableRoute(crafter: CrafterProfile, nextCondition: MaterialCondition = 'normal') {
  let state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const actions: CraftActionId[] = []
  for (const action of reliableRoutePrefix) {
    const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action)
    if (!preview.legal || preview.successRate !== 1 || state.terminal !== 'none') {
      return { completed: false, quality: state.quality, progress: state.progress, actions, stop: action }
    }
    state = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      state,
      action,
      { success: true, nextCondition },
    ).nextState
    actions.push(action)
    if (state.terminal === 'completed') {
      return {
        completed: true,
        quality: state.quality,
        progress: state.progress,
        cp: state.cp,
        finalAction: action,
        actions,
      }
    }
  }
  for (const action of ['basicSynthesis', 'carefulSynthesis', 'groundwork'] as const) {
    const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action)
    if (!preview.legal || preview.successRate !== 1) continue
    const nextState = applyObservedOutcome(
      SURVEY_CRAFTSMANS_COMMAND_BREW,
      crafter,
      state,
      action,
      { success: true, nextCondition },
    ).nextState
    if (nextState.terminal === 'completed') {
      return {
        completed: true,
        quality: nextState.quality,
        progress: nextState.progress,
        cp: nextState.cp,
        finalAction: action,
        actions: [...actions, action],
      }
    }
  }
  return { completed: false, quality: state.quality, progress: state.progress, cp: state.cp, actions }
}

if (process.argv.includes('--boundaries')) {
  const base: CrafterProfile = {
    level: 100,
    craftsmanship: 5408,
    control: 5237,
    maxCp: 749,
    cosmicToolGoodBonus: true,
    specialist: false,
  }
  const minimumControl = Array.from({ length: 1_001 }, (_, index) => 4_500 + index)
    .find((control) => replayReliableRoute({ ...base, control }).quality >= 12_000) ?? null
  const minimumCraftsmanship = Array.from({ length: 1_001 }, (_, index) => 4_500 + index)
    .find((craftsmanship) => replayReliableRoute({ ...base, craftsmanship }).completed) ?? null
  const minimumCp = Array.from({ length: 201 }, (_, index) => 600 + index)
    .find((maxCp) => replayReliableRoute({ ...base, maxCp }).completed) ?? null
  const boundaryCorners = minimumControl === null || minimumCraftsmanship === null || minimumCp === null
    ? []
    : [
        { id: 'exact-minimums', craftsmanship: minimumCraftsmanship, control: minimumControl, maxCp: minimumCp },
        { id: 'below-craftsmanship', craftsmanship: minimumCraftsmanship - 1, control: minimumControl, maxCp: minimumCp },
        { id: 'below-control', craftsmanship: minimumCraftsmanship, control: minimumControl - 1, maxCp: minimumCp },
        { id: 'below-cp', craftsmanship: minimumCraftsmanship, control: minimumControl, maxCp: minimumCp - 1 },
      ].map((corner) => ({ ...corner, result: replayReliableRoute({ ...base, ...corner }) }))
  const entryFeatures = minimumControl === null || minimumCraftsmanship === null || minimumCp === null
    ? null
    : (() => {
        const crafter = {
          ...base,
          craftsmanship: minimumCraftsmanship,
          control: minimumControl,
          maxCp: minimumCp,
        }
        const state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
        return Object.fromEntries(([
          'reflect',
          'basicSynthesis',
          'delicateSynthesis',
        ] as const).map((action) => {
          const preview = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, action)
          return [action, {
            legal: preview.legal,
            successRateBps: Math.round(preview.successRate * 10_000),
            progressGain: preview.progressGain,
            qualityGain: preview.qualityGain,
            cpCost: preview.cpCost,
            durabilityCost: preview.durabilityCost,
          }]
        }))
      })()
  const conditionExtremes = minimumControl === null || minimumCraftsmanship === null || minimumCp === null
    ? []
    : (['normal', 'good', 'malleable'] as const).map((nextCondition) => ({
        nextCondition,
        result: replayReliableRoute({
          ...base,
          craftsmanship: minimumCraftsmanship,
          control: minimumControl,
          maxCp: minimumCp,
        }, nextCondition),
      }))
  const knownProfileEntryGuards = PLAYER_EQUIPMENT_PROFILES.map(({ id, crafter }) => {
    const state = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
    const reflect = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, 'reflect')
    const delicate = previewAction(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, state, 'delicateSynthesis')
    return {
      id,
      stateCp: state.cp,
      reflectQualityGain: reflect.qualityGain,
      delicateProgressGain: delicate.progressGain,
      passesProposedGuard: state.cp >= 748
        && reflect.qualityGain >= 861
        && delicate.progressGain >= 427,
    }
  })
  let evaluatedEnvelopeCells = 0
  let failedEnvelopeCells = 0
  let firstEnvelopeFailure: Record<string, unknown> | null = null
  for (let craftsmanship = 5_350; craftsmanship <= 5_500; craftsmanship += 1) {
    for (let control = 5_215; control <= 5_350; control += 1) {
      for (let maxCp = 748; maxCp <= 780; maxCp += 1) {
        evaluatedEnvelopeCells += 1
        const result = replayReliableRoute({ ...base, craftsmanship, control, maxCp })
        if (result.completed && result.quality >= 12_000) continue
        failedEnvelopeCells += 1
        firstEnvelopeFailure ??= { craftsmanship, control, maxCp, result }
      }
    }
  }
  console.log(JSON.stringify({
    evidence: 'exhaustive-integer-threshold-scan-under-all-normal-success-only-mechanics',
    minimumControl,
    minimumCraftsmanship,
    minimumCp,
    entryFeatures,
    knownProfileEntryGuards,
    boundedIntegerEnvelope: {
      craftsmanship: [5_350, 5_500],
      control: [5_215, 5_350],
      maxCp: [748, 780],
      evaluatedCells: evaluatedEnvelopeCells,
      failedCells: failedEnvelopeCells,
      firstFailure: firstEnvelopeFailure,
    },
    conditionExtremes,
    boundaryCorners,
  }, null, 2))
  process.exit(0)
}

const profileArgumentIndex = process.argv.indexOf('--profile')
const profileArgument = profileArgumentIndex < 0 ? null : process.argv[profileArgumentIndex + 1]
const selectedProfiles = profileArgument === null
  ? PLAYER_EQUIPMENT_PROFILES
  : PLAYER_EQUIPMENT_PROFILES.filter(({ id }) => id === profileArgument)
if (selectedProfiles.length === 0) throw new Error(`unknown --profile ${profileArgument}`)

const profiles = selectedProfiles.map(({ id, crafter }) => {
  const initialState = createInitialCraftState(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter)
  const policy = createGuideIntegratedPolicyFactory(
    DEFAULT_SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG,
    SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
  )()
  const firstAction = policy(SURVEY_CRAFTSMANS_COMMAND_BREW, crafter, initialState)
  if (firstAction === null) throw new Error(`${id} guide returned no opening action`)
  const result = runEpisodeTrace({
    recipe: SURVEY_CRAFTSMANS_COMMAND_BREW,
    crafter,
    initialState,
    firstAction,
    policy,
    random: { nextCondition: () => 0, nextSuccess: () => 0 },
    conditionProfile: allNormal,
    maxSteps: 80,
  })
  return {
    id,
    crafter,
    terminal: result.terminal,
    actions: result.actions,
    final: {
      progress: result.finalState.progress,
      quality: result.finalState.quality,
      durability: result.finalState.durability,
      cp: result.finalState.cp,
      step: result.finalState.step,
    },
    steps: result.steps.map((step, index) => ({
      index: index + 1,
      action: step.action,
      success: step.success,
      progress: `${step.before.progress}->${step.after.progress}`,
      quality: `${step.before.quality}->${step.after.quality}`,
      durability: `${step.before.durability}->${step.after.durability}`,
      cp: `${step.before.cp}->${step.after.cp}`,
      innerQuiet: `${step.before.innerQuiet}->${step.after.innerQuiet}`,
      condition: `${step.before.condition}->${step.after.condition}`,
      terminal: step.after.terminal,
      buffsAfter: step.after.buffs,
    })),
  }
})

console.log(JSON.stringify({
  evidence: 'deterministic-all-normal-research-trace-not-real-world-success-rate',
  recipeProfileId: SURVEY_CRAFTSMANS_COMMAND_BREW.profileId,
  objectiveId: SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE.objectiveId,
  profiles,
}, null, 2))
