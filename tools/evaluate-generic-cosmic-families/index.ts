import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  attachExternalBaselineReport,
  buildMatrixPlan,
  parseMatrixCliOptions,
  runGenericCosmicFamilyMatrix,
} from './matrix'

const options = parseMatrixCliOptions(process.argv.slice(2))
const plan = buildMatrixPlan(options)
let nextProgressPercent = 10
const currentReport = runGenericCosmicFamilyMatrix(plan, options.quiet
  ? undefined
  : (completed, total) => {
      const percent = Math.floor((completed / total) * 100)
      if (percent < nextProgressPercent && completed !== total) return
      process.stderr.write(
        `[generic-family-matrix] ${completed}/${total} episodes (${percent}%)\n`,
      )
      while (nextProgressPercent <= percent) nextProgressPercent += 10
    })

const report = options.baselineReportPath === null
  ? currentReport
  : attachExternalBaselineReport(
      currentReport,
      JSON.parse(readFileSync(path.resolve(options.baselineReportPath), 'utf8')) as unknown,
      options,
    )
const serialized = `${JSON.stringify(report, null, 2)}\n`
if (options.outputPath === null) {
  process.stdout.write(serialized)
} else {
  const outputPath = path.resolve(options.outputPath)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, serialized, 'utf8')
  process.stderr.write(`[generic-family-matrix] wrote ${outputPath}\n`)
}
