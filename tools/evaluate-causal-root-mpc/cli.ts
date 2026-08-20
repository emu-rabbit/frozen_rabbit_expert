import {
  MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_EPISODE_STEPS,
  MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_SAMPLES_PER_PROFILE,
  MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_SEED_COUNT,
  MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_STEPS,
  evaluateCausalRootMpcDevelopment,
  type CausalRootMpcDevelopmentEvaluationOptions,
} from './index'
import type {
  CraftScenarioDataId,
  PlayerEquipmentProfileId,
} from '@frozen-rabbit-expert/data'

const VALUE_OPTIONS = new Set([
  '--scenario',
  '--equipment-profile',
  '--condition-profile',
  '--seed-count',
  '--max-steps',
  '--planner-samples-per-profile',
  '--planner-max-episode-steps',
])

const FORBIDDEN_CORPUS_OPTIONS = new Set([
  '--corpus',
  '--corpus-id',
  '--frozen-validation',
  '--reserved-final',
])

function optionValue(name: string): string | null {
  const matches = process.argv.reduce<number[]>((indices, value, index) => {
    if (value === name) indices.push(index)
    return indices
  }, [])
  if (matches.length > 1) throw new Error(`${name} may be provided only once`)
  const index = matches[0]
  if (index === undefined) return null
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function positiveIntegerOption(name: string, maximum: number): number | undefined {
  const raw = optionValue(name)
  if (raw === null) return undefined
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value
}

function validateArguments(): void {
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (FORBIDDEN_CORPUS_OPTIONS.has(argument)) {
      throw new Error(
        `${argument} is forbidden: this CLI generates development seeds and never reads frozen or reserved-final corpora`,
      )
    }
    if (argument === '--compact') continue
    if (!argument.startsWith('--')) throw new Error(`unexpected positional argument: ${argument}`)
    if (!VALUE_OPTIONS.has(argument)) throw new Error(`unknown option: ${argument}`)
    index += 1
  }
}

validateArguments()

const scenarioId = optionValue('--scenario')
const equipmentProfileId = optionValue('--equipment-profile')
const conditionProfileId = optionValue('--condition-profile')
const seedCount = positiveIntegerOption(
  '--seed-count',
  MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_SEED_COUNT,
)
const maxSteps = positiveIntegerOption('--max-steps', MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_STEPS)
const plannerSamplesPerProfile = positiveIntegerOption(
  '--planner-samples-per-profile',
  MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_SAMPLES_PER_PROFILE,
)
const plannerMaxEpisodeSteps = positiveIntegerOption(
  '--planner-max-episode-steps',
  MAX_CAUSAL_ROOT_MPC_DEVELOPMENT_PLANNER_EPISODE_STEPS,
)

const options: CausalRootMpcDevelopmentEvaluationOptions = {
  ...(scenarioId === null ? {} : {
    scenarioIds: [scenarioId as CraftScenarioDataId],
  }),
  ...(equipmentProfileId === null ? {} : {
    equipmentProfileIds: [equipmentProfileId as PlayerEquipmentProfileId],
  }),
  ...(conditionProfileId === null ? {} : { conditionProfileIds: [conditionProfileId] }),
  ...(seedCount === undefined ? {} : { seedCount }),
  ...(maxSteps === undefined ? {} : { maxSteps }),
  ...(plannerSamplesPerProfile === undefined ? {} : { plannerSamplesPerProfile }),
  ...(plannerMaxEpisodeSteps === undefined ? {} : { plannerMaxEpisodeSteps }),
}

const report = evaluateCausalRootMpcDevelopment(options)
console.log(JSON.stringify(report, null, process.argv.includes('--compact') ? 0 : 2))
