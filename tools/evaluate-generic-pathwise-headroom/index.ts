import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  evaluateGenericPathwiseHeadroom,
  parsePathwiseHeadroomCliOptions,
} from './probe'

const options = parsePathwiseHeadroomCliOptions(process.argv.slice(2))
const report = evaluateGenericPathwiseHeadroom(options)
const serialized = `${JSON.stringify(report, null, 2)}\n`

if (options.outputPath === null || options.outputPath === '-') {
  process.stdout.write(serialized)
} else {
  const resolved = path.resolve(process.cwd(), options.outputPath)
  mkdirSync(path.dirname(resolved), { recursive: true })
  writeFileSync(resolved, serialized, 'utf8')
  process.stderr.write([
    `wrote pathwise headroom probe to ${resolved}`,
    `baseline=${report.baseline.stopReason}`,
    `classification=${report.assessment.classification}`,
    `frontierTruncated=${report.clairvoyantReference.frontierTruncated}`,
  ].join(' ') + '\n')
}
