import { describe, expect, it } from 'vitest'
import {
  MAX_CAPABILITY_BOUND_CELLS,
  buildCapabilityBoundPlan,
  evaluateCapabilityBoundPlan,
  parseCapabilityBoundCliOptions,
  runCapabilityBoundEvaluation,
} from './matrix'

describe('generic capability-bound plan', () => {
  it('builds the default bounded 50-family by 10-equipment matrix', () => {
    const plan = buildCapabilityBoundPlan(parseCapabilityBoundCliOptions([]))

    expect(plan.selectedFamilyCount).toBe(50)
    expect(plan.selectedEquipmentCount).toBe(10)
    expect(plan.cases).toHaveLength(500)
    expect(plan.budget.projectedCells).toBe(MAX_CAPABILITY_BOUND_CELLS)
    expect(plan.budget.projectedProgressStateScans)
      .toBeLessThanOrEqual(plan.budget.hardProgressStateScanCap)
    expect(new Set(plan.cases.map((entry) => entry.caseId)).size).toBe(plan.cases.length)
  })

  it('supports exact recipe, equipment alias, horizon, budget, and output filters', () => {
    const options = parseCapabilityBoundCliOptions([
      '--recipe=36282',
      '--equipment=buffed',
      '--horizon=12',
      '--budget-ms=5000',
      '--output',
      '.tmp/capability.json',
    ])
    const plan = buildCapabilityBoundPlan(options)

    expect(options).toMatchObject({
      recipeId: 36282,
      equipmentId: 'player-food-medicine-cosmic-tool-v1',
      horizon: 12,
      budgetMs: 5000,
      outputPath: '.tmp/capability.json',
    })
    expect(plan.cases).toHaveLength(1)
    expect(plan.cases[0]).toMatchObject({ recipeId: 36282 })
  })

  it('fails closed on excessive horizons, work, and unknown equipment', () => {
    expect(() => parseCapabilityBoundCliOptions(['--horizon=201']))
      .toThrow(/may not exceed 200/)
    expect(() => parseCapabilityBoundCliOptions(['--budget-ms=300001']))
      .toThrow(/may not exceed 300000/)
    expect(() => buildCapabilityBoundPlan(parseCapabilityBoundCliOptions([
      '--horizon=200',
    ]))).toThrow(/progress-state scans/)
    expect(() => buildCapabilityBoundPlan(parseCapabilityBoundCliOptions([
      '--equipment=imaginary',
    ]))).toThrow(/unknown equipment/)
  })

  it('enforces the wall-clock hard budget without emitting a partial report', () => {
    const plan = buildCapabilityBoundPlan(parseCapabilityBoundCliOptions([
      '--recipe=36282',
      '--equipment=buffed',
      '--horizon=1',
      '--budget-ms=1',
    ]))
    let tick = 0
    expect(() => evaluateCapabilityBoundPlan(plan, { now: () => tick++ * 2 }))
      .toThrow(/hard budget exhausted/)
  })
})

describe('generic capability-bound report', () => {
  it('only makes a negative proof and marks every non-proof inconclusive', () => {
    const report = runCapabilityBoundEvaluation([
      '--recipe=36282',
      '--equipment=buffed',
      '--horizon=1',
    ])
    const cell = report.cells[0]!

    expect(report.evidence).toBe(
      'negative-only-action-gain-mechanics-relaxation-not-causal-policy-bound',
    )
    expect(cell.targetProvablyImpossible).toBe(true)
    expect(cell.inconclusive).toBe(false)
    expect(cell.maximumQualityUpperBound).toBeNull()
    expect(cell.conclusion).toMatch(/^target-provably-impossible/u)
  })

  it('materializes all 500 default cells with sound report invariants', () => {
    const report = runCapabilityBoundEvaluation([])

    expect(report.summary.evaluatedCells).toBe(500)
    expect(report.summary.evaluatedFamilies).toBe(50)
    expect(report.summary.evaluatedEquipmentProfiles).toBe(10)
    expect(report.summary.targetProvablyImpossible + report.summary.inconclusive).toBe(500)
    for (const cell of report.cells) {
      expect(cell.inconclusive).toBe(!cell.targetProvablyImpossible)
      if (cell.maximumQualityUpperBound !== null) {
        expect(cell.maximumQualityUpperBound).toBeLessThanOrEqual(cell.qualityMaximum)
      }
      if (cell.targetProvablyImpossible && cell.maximumQualityUpperBound !== null) {
        expect(cell.maximumQualityUpperBound).toBeLessThan(cell.qualityMaximum)
      }
    }
  })
})
