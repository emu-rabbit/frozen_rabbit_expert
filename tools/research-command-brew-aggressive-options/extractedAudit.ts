import { performance } from 'node:perf_hooks'
import {
  PLAYER_EQUIPMENT_PROFILES,
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import {
  createInitialCraftState,
  previewAction,
} from '@frozen-rabbit-expert/domain'
import {
  COMMAND_BREW_DEVELOPMENT_CORPUS,
  COMMAND_BREW_DEVELOPMENT_RISK_AUDIT_BUDGET_V1,
  COMMAND_BREW_GUIDE_EXTRACTED_RISK_OPTIONS_VERSION,
  COMMAND_BREW_U_DEVELOPMENT_OBSERVED_RISK_ENVELOPE_V1,
  corpusSeeds,
  createCommandBrewGuideExtractedOptionController,
  type CommandBrewGuideExtractedOptionId,
} from '@frozen-rabbit-expert/policy-lab'
import {
  COMMAND_BREW_SENSITIVITY_PROFILES,
  createEpisodeRandomStream,
  runEpisodeTrace,
  type EpisodeTraceResult,
  type WeightedConditionProfile,
} from '@frozen-rabbit-expert/simulator'
import {
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG_V1_2_0,
  SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION_V1_2_0,
  createGuideIntegratedPolicyFactory,
  isPolicyActionSafe,
} from '@frozen-rabbit-expert/solver'

const recipe = SURVEY_CRAFTSMANS_COMMAND_BREW
const objective = SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE
const seeds = corpusSeeds(COMMAND_BREW_DEVELOPMENT_CORPUS)
const fullAllEquipment = process.argv.includes('--full-all-equipment')

function runGuide(
  crafter: (typeof PLAYER_EQUIPMENT_PROFILES)[number]['crafter'],
  profile: WeightedConditionProfile,
  seed: number,
): EpisodeTraceResult {
  const policy = createGuideIntegratedPolicyFactory(
    SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_CONFIG_V1_2_0,
    objective,
  )()
  const initialState = createInitialCraftState(recipe, crafter)
  const firstAction = policy(recipe, crafter, initialState)
  if (firstAction === null) throw new Error('released guide stopped at the initial state')
  return runEpisodeTrace({
    recipe,
    crafter,
    initialState,
    firstAction,
    policy,
    random: createEpisodeRandomStream(seed),
    conditionProfile: profile,
    maxSteps: 80,
  })
}

function emptyOptionCounts(): Record<CommandBrewGuideExtractedOptionId, number> {
  return {
    'route-mainline': 0,
    'progress-risk-loop': 0,
    'quality-risk-loop': 0,
    'condition-opportunity': 0,
    'bounded-condition-fishing': 0,
    'quality-burst': 0,
    'resource-recovery': 0,
    'safe-finish': 0,
  }
}

function auditEquipment(
  equipment: (typeof PLAYER_EQUIPMENT_PROFILES)[number],
  seedCountPerWorld: number,
) {
  const startedAt = performance.now()
  const optionCounts = emptyOptionCounts()
  const attemptsByAction: Record<string, number> = {}
  const failuresByAction: Record<string, number> = {}
  let episodes = 0
  let completed = 0
  let quality10200 = 0
  let fullQuality12000 = 0
  let episodesWithRiskFailures = 0
  let totalRiskFailures = 0
  let safetyViolations = 0
  let parityTransitions = 0
  let budgetExceededEpisodes = 0
  let projectedBudgetExceedances = 0
  let maximumTotalAttempts = 0
  let maximumProgressAttempts = 0
  let maximumQualityAttempts = 0
  let maximumConsecutiveFailures = 0
  let maximumConsecutiveProgressFailures = 0
  let maximumConsecutiveQualityFailures = 0
  let maximumConditionFishingUses = 0
  let minimumCpAfterRiskFailure = Number.POSITIVE_INFINITY
  let minimumDurabilityAfterRiskFailure = Number.POSITIVE_INFINITY

  for (const profile of COMMAND_BREW_SENSITIVITY_PROFILES) {
    for (const seed of seeds.slice(0, seedCountPerWorld)) {
      const trace = runGuide(equipment.crafter, profile, seed)
      const controller = createCommandBrewGuideExtractedOptionController({
        scenarioId: 'survey-craftsmans-command-brew',
        recipe,
        objective,
        crafter: equipment.crafter,
      })
      let episodeRiskFailures = 0
      for (const step of trace.steps) {
        const decision = controller.decide(step.before)
        if (decision.action !== step.action) {
          throw new Error(
            `action parity mismatch ${equipment.id}|${profile.id}|${seed}|${trace.steps.indexOf(step)}: `
            + `${String(decision.action)} != ${step.action}`,
          )
        }
        optionCounts[decision.optionId] += 1
        if (!decision.currentWithinAuditEnvelope || !decision.projectedWithinAuditEnvelope) {
          projectedBudgetExceedances += 1
        }
        const preview = previewAction(recipe, equipment.crafter, step.before, step.action)
        if (!isPolicyActionSafe(recipe, equipment.crafter, step.before, step.action, preview)) {
          safetyViolations += 1
        }
        if (preview.successRate < 1) {
          attemptsByAction[step.action] = (attemptsByAction[step.action] ?? 0) + 1
          if (!step.success) {
            episodeRiskFailures += 1
            totalRiskFailures += 1
            failuresByAction[step.action] = (failuresByAction[step.action] ?? 0) + 1
            minimumCpAfterRiskFailure = Math.min(minimumCpAfterRiskFailure, step.after.cp)
            minimumDurabilityAfterRiskFailure = Math.min(
              minimumDurabilityAfterRiskFailure,
              step.after.durability,
            )
          }
        }
        controller.advance(step)
        parityTransitions += 1
      }
      const memory = controller.snapshot()
      if (memory.totalObservedTransitions !== trace.actions.length) {
        throw new Error(`observation count drift ${equipment.id}|${profile.id}|${seed}`)
      }
      if (memory.budgetExceeded) budgetExceededEpisodes += 1
      maximumTotalAttempts = Math.max(maximumTotalAttempts, memory.risk.totalAttempts)
      maximumProgressAttempts = Math.max(maximumProgressAttempts, memory.risk.progressAttempts)
      maximumQualityAttempts = Math.max(maximumQualityAttempts, memory.risk.qualityAttempts)
      maximumConsecutiveFailures = Math.max(
        maximumConsecutiveFailures,
        memory.risk.maximumConsecutiveFailures,
      )
      maximumConsecutiveProgressFailures = Math.max(
        maximumConsecutiveProgressFailures,
        memory.risk.maximumConsecutiveProgressFailures,
      )
      maximumConsecutiveQualityFailures = Math.max(
        maximumConsecutiveQualityFailures,
        memory.risk.maximumConsecutiveQualityFailures,
      )
      maximumConditionFishingUses = Math.max(
        maximumConditionFishingUses,
        memory.risk.conditionFishingUses,
      )
      episodes += 1
      if (episodeRiskFailures > 0) episodesWithRiskFailures += 1
      if (trace.terminal === 'completed') {
        completed += 1
        if (trace.finalState.quality >= 10_200) quality10200 += 1
        if (trace.finalState.quality >= 12_000) fullQuality12000 += 1
      }
    }
    console.error(`audited ${equipment.id} ${profile.id} (${seedCountPerWorld} seeds)`)
  }

  return {
    equipmentId: equipment.id,
    equipment: equipment.crafter,
    corpusId: COMMAND_BREW_DEVELOPMENT_CORPUS.id,
    seedCountPerWorld,
    conditionWorlds: COMMAND_BREW_SENSITIVITY_PROFILES.map(({ id }) => id),
    episodes,
    parity: {
      exactActionOutcomeAndStateEpisodes: episodes,
      exactTransitions: parityTransitions,
      mismatches: 0,
      pairedCompletionTierTies: episodes,
      pairedQuality10200TierTies: episodes,
      pairedFullQualityTierTies: episodes,
    },
    outcomes: { completed, quality10200, fullQuality12000 },
    risk: {
      episodesWithRiskFailures,
      totalRiskFailures,
      attemptsByAction,
      failuresByAction,
      maximumTotalAttempts,
      maximumProgressAttempts,
      maximumQualityAttempts,
      maximumConsecutiveFailures,
      maximumConsecutiveProgressFailures,
      maximumConsecutiveQualityFailures,
      maximumConditionFishingUses,
      minimumCpAfterRiskFailure: Number.isFinite(minimumCpAfterRiskFailure)
        ? minimumCpAfterRiskFailure
        : null,
      minimumDurabilityAfterRiskFailure: Number.isFinite(minimumDurabilityAfterRiskFailure)
        ? minimumDurabilityAfterRiskFailure
        : null,
    },
    optionCounts,
    integrity: {
      safetyViolations,
      budgetExceededEpisodes,
      currentOrProjectedBudgetExceedances: projectedBudgetExceedances,
    },
    elapsedMs: performance.now() - startedAt,
  }
}

const reports = PLAYER_EQUIPMENT_PROFILES.map((equipment, index) => {
  const report = auditEquipment(equipment, index === 0 || fullAllEquipment ? 128 : 32)
  console.error(JSON.stringify({
    completedEquipmentAudit: report.equipmentId,
    episodes: report.episodes,
    outcomes: report.outcomes,
    risk: report.risk,
    optionCounts: report.optionCounts,
    integrity: report.integrity,
    elapsedMs: report.elapsedMs,
  }))
  return report
})
const unbuffed = reports[0]!
const observed = COMMAND_BREW_U_DEVELOPMENT_OBSERVED_RISK_ENVELOPE_V1
const observedEnvelopeMatches = (
  unbuffed.episodes === observed.episodes
  && unbuffed.outcomes.completed === observed.completed
  && unbuffed.outcomes.quality10200 === observed.quality10200
  && unbuffed.outcomes.fullQuality12000 === observed.fullQuality12000
  && unbuffed.risk.episodesWithRiskFailures === observed.episodesWithRiskFailures
  && unbuffed.risk.totalRiskFailures === observed.totalRiskFailures
  && unbuffed.risk.maximumTotalAttempts === observed.maximumTotalAttempts
  && unbuffed.risk.maximumProgressAttempts === observed.maximumProgressAttempts
  && unbuffed.risk.maximumQualityAttempts === observed.maximumQualityAttempts
  && unbuffed.risk.maximumConsecutiveFailures === observed.maximumConsecutiveFailures
  && unbuffed.risk.maximumConsecutiveProgressFailures === observed.maximumConsecutiveProgressFailures
  && unbuffed.risk.maximumConsecutiveQualityFailures === observed.maximumConsecutiveQualityFailures
  && unbuffed.risk.maximumConditionFishingUses === observed.maximumConditionFishingUses
  && unbuffed.risk.minimumCpAfterRiskFailure === observed.minimumCpAfterRiskFailure
  && unbuffed.risk.minimumDurabilityAfterRiskFailure === observed.minimumDurabilityAfterRiskFailure
)
if (!observedEnvelopeMatches) throw new Error('full U development audit drifted from the declared observed envelope')
if (reports.some(({ parity, integrity }) => (
  parity.mismatches > 0
  || integrity.safetyViolations > 0
  || integrity.budgetExceededEpisodes > 0
  || integrity.currentOrProjectedBudgetExceedances > 0
))) throw new Error('guide-extracted option parity or audit budget failed')

console.log(JSON.stringify({
  evidence: 'development-guide-action-segmentation-parity-not-policy-promotion',
  controllerVersion: COMMAND_BREW_GUIDE_EXTRACTED_RISK_OPTIONS_VERSION,
  protectedGuideVersion: SURVEY_CRAFTSMANS_COMMAND_BREW_GUIDE_INTEGRATED_POLICY_VERSION_V1_2_0,
  corpusRole: COMMAND_BREW_DEVELOPMENT_CORPUS.role,
  observedEnvelope: observed,
  allowedAuditCap: COMMAND_BREW_DEVELOPMENT_RISK_AUDIT_BUDGET_V1,
  observedEnvelopeMatches,
  reports,
  formalPromotionEligible: false,
  nextBoundary: 'option labels are replayable segmentation, not an independent data-only option program',
}, null, 2))
