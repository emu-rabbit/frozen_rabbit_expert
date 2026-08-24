import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildCapabilityBoundPlan,
  evaluateCapabilityBoundPlan,
  parseCapabilityBoundCliOptions,
} from './matrix'

const options = parseCapabilityBoundCliOptions(process.argv.slice(2))
const report = evaluateCapabilityBoundPlan(buildCapabilityBoundPlan(options))
const serialized = `${JSON.stringify(report, null, 2)}\n`
const outputPath = options.outputPath

if (outputPath === null || outputPath === '-') {
  process.stdout.write(serialized)
} else {
  const resolved = path.resolve(process.cwd(), outputPath)
  mkdirSync(path.dirname(resolved), { recursive: true })
  writeFileSync(resolved, serialized, 'utf8')
  process.stderr.write(`wrote ${report.summary.evaluatedCells} capability-bound cells to ${resolved}\n`)
}
