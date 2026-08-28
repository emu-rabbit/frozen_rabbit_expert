// Offline pairing of two saved candidates, including a smaller seed subset.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const [before, after] = process.argv.slice(2)
const root = 'evaluation-runs/v120-development/'
const read = label => JSON.parse(fs.readFileSync(root + label + '/rows.json'))
const key = r => JSON.stringify([r.recipe, r.equipment, r.risk, r.world, r.seed])
const old = new Map(read(before).map(r => [key(r), r]))
const pairs = read(after).map(b => {
  const a = old.get(key(b)); assert(a, 'missing exact case')
  for (const field of ['kind', 'bCompleted', 'bU', 'bFull', 'bStop', 'bActions']) assert.equal(a[field], b[field])
  return {a, b}
})
const groups = {}
function group(name, rows) {
  if (!rows.length) return
  const sum = f => rows.reduce((s, r) => s + f(r), 0)
  groups[name] = {n: rows.length, completionDelta: sum(({a,b}) => +b.cCompleted - +a.cCompleted),
    wins: sum(({a,b}) => +(!a.cCompleted && b.cCompleted)), losses: sum(({a,b}) => +(a.cCompleted && !b.cCompleted)),
    utilityDelta: sum(({a,b}) => b.cU - a.cU) / rows.length,
    fullDelta: sum(({a,b}) => +b.cFull - +a.cFull), nativeTimeRatio: sum(r => r.b.cNs) / sum(r => r.a.cNs)}
}
group('all', pairs)
for (const kind of new Set(pairs.map(p => p.b.kind))) {
  group(kind, pairs.filter(p => p.b.kind === kind))
  group('balanced/' + kind, pairs.filter(p => p.b.kind === kind && p.b.risk === 'balanced'))
}
const result = {before, after, timingCaveat: 'Saved separate batches; approximate cost comparison, not a new concurrent A/B.', groups}
fs.writeFileSync(root + after + '/candidate-comparison.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
