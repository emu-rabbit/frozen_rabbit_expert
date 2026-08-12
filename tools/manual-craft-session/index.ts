import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  formatManualSession,
  manualSessionView,
  stepManualSession,
  type ManualCraftSession,
} from '@frozen-rabbit-expert/simulator'
import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import { createScenarioManualSession } from './core'

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}

function requiredOption(name: string): string {
  const value = option(name)
  if (value === undefined) throw new Error(`Missing required option: ${name}`)
  return value
}

function integerOption(name: string, fallback?: number): number {
  const raw = option(name, fallback === undefined ? undefined : String(fallback))
  const value = Number(raw)
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`)
  return value
}

function sessionPath(): string {
  return path.resolve(requiredOption('--session'))
}

function loadSession(file: string): ManualCraftSession {
  return JSON.parse(readFileSync(file, 'utf8')) as ManualCraftSession
}

// This developer tool intentionally owns its explicit session file. Production
// session persistence remains in the protocol/web layer.
function saveSession(file: string, session: ManualCraftSession): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
}

function usage(): never {
  throw new Error([
    'Usage:',
    '  new  --session FILE --scenario ID --equipment-profile ID --seed N [--condition-profile balanced|normal-heavy|resource-scarce] [--max-actions N]',
    '  show --session FILE',
    '  act  --session FILE --action ACTION_ID',
    '  inspect --session FILE --action ACTION_ID',
  ].join('\n'))
}

const command = process.argv[2]
const file = command === undefined ? usage() : sessionPath()
let session: ManualCraftSession
let output: string | null = null

if (command === 'new') {
  session = createScenarioManualSession({
    scenarioId: requiredOption('--scenario'),
    equipmentProfileId: requiredOption('--equipment-profile'),
    conditionProfile: option('--condition-profile', 'balanced') as 'balanced' | 'normal-heavy' | 'resource-scarce',
    seed: integerOption('--seed'),
    maxActions: integerOption('--max-actions', 80),
  })
  saveSession(file, session)
} else if (command === 'show') {
  session = loadSession(file)
} else if (command === 'act') {
  session = stepManualSession(loadSession(file), requiredOption('--action') as CraftActionId)
  saveSession(file, session)
} else if (command === 'inspect') {
  session = loadSession(file)
  const requestedAction = requiredOption('--action')
  const action = manualSessionView(session).legalActions.find(({ id }) => id === requestedAction)
  if (action === undefined) throw new Error(`Action is not currently legal: ${requestedAction}`)
  output = `action=${action.id} category=${action.category} cpCost=${action.cpCost} durabilityCost=${action.durabilityCost} successRate=${action.successRate} progressGain=${action.progressGain} qualityGain=${action.qualityGain}`
} else {
  usage()
}

console.log(output ?? formatManualSession(session))
