// Verify that a new version has not changed the frozen comparison policy.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const [reference, ...candidates] = process.argv.slice(2)
assert(reference && candidates.length)
const root = 'evaluation-runs/v120-development/'
const read = label => {
  const plan = JSON.parse(fs.readFileSync(root + label + '/plan.json'))
  const rows = [0, 1].flatMap(slot => fs.readFileSync(`${root}${label}/${slot}-baseline.output.tsv`, 'utf8')
    .trim().split(/\r?\n/).filter(line => !line.includes('\t__batch__\t')).map(line => line.split('\t')))
    .sort((a, b) => a[1].localeCompare(b[1]))
  return {plan, rows}
}
const a = read(reference), checked = []
for (const label of candidates) {
  const b = read(label)
  for (const key of ['mode', 'baseline', 'seedBase', 'seedCount', 'seedMethod', 'pairs']) {
    assert.equal(b.plan[key], a.plan[key], key)
  }
  assert.equal(a.rows.length, b.rows.length)
  const normalize = row => row.map((value, index) => [1, 22, 23, 50].includes(index) ? '' : value)
  a.rows.forEach((row, index) => assert.deepEqual(normalize(row), normalize(b.rows[index]), label + '/' + index))
  checked.push({label, rows: b.rows.length, allNonTimingColumnsEqual: true, binarySha256: b.plan.binarySha256})
}
const output = {reference, referenceBinarySha256: a.plan.binarySha256,
  ignoredColumns: ['case label', 'total ns', 'max ns', 'per-call ns'], checked}
fs.writeFileSync(`reports/generic-cosmic-overnight/v130-development/baseline-parity-${a.plan.mode}.json`, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(output))
