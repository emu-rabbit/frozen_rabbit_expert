import {
  SURVEY_CRAFTSMANS_COMMAND_BREW,
  SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
} from '@frozen-rabbit-expert/data'
import type { CrafterProfile } from '@frozen-rabbit-expert/domain'
import {
  createCommandBrewCrossEquipmentPolicyController,
  probePolicyOnAllNormal,
} from '@frozen-rabbit-expert/policy-lab'

const craftsmanshipValues = [5_200, 5_300, 5_408, 5_500]
const controlValues = [4_900, 5_000, 5_140, 5_237, 5_350]
const cpValues = [580, 600, 630, 680, 749, 780]

interface ProbeResult {
  crafter: CrafterProfile
  mode: ReturnType<typeof createCommandBrewCrossEquipmentPolicyController>['mode']
  terminal: ReturnType<typeof probePolicyOnAllNormal>['terminal']
  quality: number
  actionCount: number
  riskyActionUses: number
  stopped: boolean
}

const results: ProbeResult[] = []
for (const craftsmanship of craftsmanshipValues) {
  for (const control of controlValues) {
    for (const maxCp of cpValues) {
      const crafter: CrafterProfile = {
        level: 100,
        craftsmanship,
        control,
        maxCp,
        cosmicToolGoodBonus: true,
        specialist: false,
      }
      const controller = createCommandBrewCrossEquipmentPolicyController(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        SURVEY_CRAFTSMANS_COMMAND_BREW_OBJECTIVE,
      )
      const probe = probePolicyOnAllNormal(
        SURVEY_CRAFTSMANS_COMMAND_BREW,
        crafter,
        controller.policy,
      )
      results.push({ crafter, mode: controller.mode, ...probe })
    }
  }
}

function minimum(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.min(...values)
}

const safeCompleted = results.filter((result) => (
  result.terminal === 'completed'
  && result.riskyActionUses === 0
  && !result.stopped
))
const failed = results.filter((result) => !safeCompleted.includes(result))

console.log(JSON.stringify({
  version: 'command-brew-synthetic-equipment-envelope-v1',
  evidence: 'development-only-mechanics-sensitivity-grid-not-real-loadouts-or-promotion-evidence',
  scenarioId: 'survey-craftsmans-command-brew',
  grid: { craftsmanshipValues, controlValues, cpValues },
  summary: {
    probes: results.length,
    deterministicSafeCompletion: safeCompleted.length,
    guideMode: results.filter((result) => result.mode === 'guide').length,
    lowResourceRouteMode: results.filter((result) => result.mode === 'low-resource-route').length,
    minimumSafeCompletedQuality: minimum(safeCompleted.map((result) => result.quality)),
    failedOrStopped: failed.length,
  },
  byCp: Object.fromEntries(cpValues.map((maxCp) => {
    const cells = results.filter((result) => result.crafter.maxCp === maxCp)
    const safe = cells.filter((result) => safeCompleted.includes(result))
    return [maxCp, {
      probes: cells.length,
      deterministicSafeCompletion: safe.length,
      minimumQuality: minimum(safe.map((result) => result.quality)),
      modes: {
        guide: cells.filter((result) => result.mode === 'guide').length,
        lowResourceRoute: cells.filter((result) => result.mode === 'low-resource-route').length,
      },
    }]
  })),
  failures: failed,
}, null, 2))
