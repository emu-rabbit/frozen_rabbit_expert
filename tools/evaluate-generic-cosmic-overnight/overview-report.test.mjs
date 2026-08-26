import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  renderOvernightOverviewMarkdown,
  summarizeFamilyEquipmentRows,
} from './overview-report.mjs'

function completedRow({ progress = 100, quality = 100 } = {}) {
  return { terminal: 'completed', progress, quality }
}

function baseRecipe(overrides = {}) {
  return {
    recipeId: 1,
    progressRequired: 100,
    qualityMax: 100,
    requiredQuality: 0,
    qualityOutcome: 'collectability',
    missionNamesEn: ['A: Test'],
    ...overrides,
  }
}

describe('overnight overview metrics', () => {
  test('uses all seeds as the denominator for collectability tiers and full quality', () => {
    const summary = summarizeFamilyEquipmentRows(baseRecipe(), [
      completedRow({ quality: 100 }),
      completedRow({ quality: 70 }),
      completedRow({ quality: 55 }),
      { terminal: 'failed', progress: 50, quality: 100 },
    ])

    assert.equal(summary.deliveryRate, 0.75)
    assert.equal(summary.collectabilityLowRate, 0.75)
    assert.equal(summary.collectabilityMidRate, 0.75)
    assert.equal(summary.collectabilityHighRate, 0.5)
    assert.equal(summary.fullQualityRate, 0.25)
  })

  test('uses the complete 101-cell HQ table for completed products', () => {
    const summary = summarizeFamilyEquipmentRows(baseRecipe({
      qualityOutcome: 'hq-chance',
      missionNamesEn: ['Test'],
    }), [
      completedRow({ quality: 25 }),
      completedRow({ quality: 100 }),
      { terminal: 'failed', progress: 0, quality: 100 },
    ])

    assert.equal(summary.deliveryRate, 2 / 3)
    assert.equal(summary.completedHqChanceMean, 53.5)
    assert.equal(summary.fullQualityRate, 1 / 3)
  })

  test('requires both progress and required quality for hard-quality completion', () => {
    const summary = summarizeFamilyEquipmentRows(baseRecipe({
      requiredQuality: 80,
      qualityOutcome: 'required-quality',
    }), [
      completedRow({ quality: 80 }),
      completedRow({ quality: 79 }),
      completedRow({ progress: 99, quality: 100 }),
    ])

    assert.equal(summary.completionRate, 1 / 3)
  })

  test('separates completed and non-completed action and advancing-step tails', () => {
    const summary = summarizeFamilyEquipmentRows(baseRecipe(), [
      { ...completedRow(), actions: 10, advancingSteps: 9 },
      { ...completedRow(), actions: 20, advancingSteps: 18 },
      { terminal: 'failed', progress: 90, quality: 100, actions: 40, advancingSteps: 35 },
      { terminal: 'failed', progress: 90, quality: 100, actions: 80, advancingSteps: 70 },
    ])

    assert.deepEqual(summary.craftLength.completed.actions, {
      count: 2,
      p50: 20,
      maximum: 20,
    })
    assert.deepEqual(summary.craftLength.completed.advancingSteps, {
      count: 2,
      p50: 18,
      maximum: 18,
    })
    assert.deepEqual(summary.craftLength.nonCompleted.actions, {
      count: 2,
      p50: 80,
      maximum: 80,
    })
    assert.deepEqual(summary.craftLength.nonCompleted.advancingSteps, {
      count: 2,
      p50: 70,
      maximum: 70,
    })
  })
})

describe('overnight overview markdown', () => {
  const distribution = (p50, maximum) => ({ count: 2, p50, maximum })
  const withLengths = (summary, offset = 0, includeAdvancingSteps = true) => ({
    ...summary,
    craftLength: {
      completed: {
        actions: distribution(20 + offset, 30 + offset),
        advancingSteps: includeAdvancingSteps
          ? distribution(18 + offset, 28 + offset)
          : { count: 0, p50: null, maximum: null },
      },
      nonCompleted: {
        actions: distribution(40 + offset, 50 + offset),
        advancingSteps: includeAdvancingSteps
          ? distribution(35 + offset, 45 + offset)
          : { count: 0, p50: null, maximum: null },
      },
    },
  })
  const paired = (candidate, baseline) => ({
    candidate: withLengths(candidate),
    baseline: withLengths(baseline, 2),
  })

  test('renders candidate values with inline deltas and sorts by candidate E09 result', () => {
    const common = {
      representative: baseRecipe(),
      nameZh: '測試配方',
    }
    const families = [
      {
        ...common,
        code: 'F01',
        kind: 'hard-quality',
        representative: baseRecipe({ requiredQuality: 100, qualityOutcome: 'required-quality' }),
        summaries: [paired({ completionRate: 0.5 }, { completionRate: 0.25 }),
          paired({ completionRate: 0.25 }, { completionRate: 0.5 })],
      },
      {
        ...common,
        code: 'F02',
        kind: 'hard-quality',
        representative: baseRecipe({ requiredQuality: 100, qualityOutcome: 'required-quality' }),
        summaries: [paired({ completionRate: 0.5 }, { completionRate: 0.5 }),
          paired({ completionRate: 0.75 }, { completionRate: 0.5 })],
      },
      {
        ...common,
        code: 'F03',
        kind: 'collectability',
        summaries: [paired({
          deliveryRate: 1,
          collectabilityLowRate: 1,
          collectabilityMidRate: 1,
          collectabilityHighRate: 0.8,
          fullQualityRate: 0.5,
        }, {
          deliveryRate: 0.75,
          collectabilityLowRate: 0.75,
          collectabilityMidRate: 0.75,
          collectabilityHighRate: 0.5,
          fullQualityRate: 0.25,
        }), paired({
          deliveryRate: 1,
          collectabilityLowRate: 1,
          collectabilityMidRate: 0.9,
          collectabilityHighRate: 0.7,
          fullQualityRate: 0.4,
        }, {
          deliveryRate: 1,
          collectabilityLowRate: 1,
          collectabilityMidRate: 0.8,
          collectabilityHighRate: 0.6,
          fullQualityRate: 0.3,
        })],
      },
      {
        ...common,
        code: 'F04',
        kind: 'hq',
        representative: baseRecipe({ qualityOutcome: 'hq-chance', missionNamesEn: ['Test'] }),
        summaries: [paired(
          { deliveryRate: 1, completedHqChanceMean: 90, fullQualityRate: 0.5 },
          { deliveryRate: 0.75, completedHqChanceMean: 80, fullQualityRate: 0.25 },
        ), paired(
          { deliveryRate: 1, completedHqChanceMean: 95, fullQualityRate: 0.6 },
          { deliveryRate: 1, completedHqChanceMean: 90, fullQualityRate: 0.5 },
        )],
      },
      {
        ...common,
        code: 'F05',
        kind: 'master',
        representative: baseRecipe({ missionNamesEn: ['Master: Test'] }),
        summaries: [paired(
          { deliveryRate: 1, completedCollectabilityMean: 9, fullQualityRate: 0.5 },
          { deliveryRate: 0.75, completedCollectabilityMean: 8, fullQualityRate: 0.25 },
        ), paired(
          { deliveryRate: 1, completedCollectabilityMean: 10, fullQualityRate: 0.6 },
          { deliveryRate: 1, completedCollectabilityMean: 9, fullQualityRate: 0.5 },
        )],
      },
    ]

    const markdown = renderOvernightOverviewMarkdown({
      runId: 'test-run',
      configFingerprint: 'abc',
      solvers: { baseline: 'baseline-v1', candidate: 'candidate-v1' },
      seedCount: 4,
      families,
    })

    assert.equal((markdown.match(/^\| Family /gm) ?? []).length, 4)
    assert.doesNotMatch(markdown, /\| (判讀|量尺說明) \|/)
    assert.ok(markdown.indexOf('| F02 |') < markdown.indexOf('| F01 |'))
    assert.match(markdown, /E02 交\/100\/300\/700\/滿/)
    assert.match(markdown, /E09 交貨\/HQ\/滿/)
    assert.match(markdown, /E02 長度/)
    assert.match(markdown, /75\.0% \(\+25\.0%\)/)
    assert.match(markdown, /S：完 18 \(-2\)\/28 \(-2\)・未 35 \(-2\)\/45 \(-2\)/)
    assert.match(markdown, /p50\/max/)
    assert.doesNotMatch(markdown, /p90|p95/)
    assert.doesNotMatch(markdown, /<br>/)
    assert.doesNotMatch(markdown, /候 |基 |Δ /)
  })

  test('falls back to A and marks unavailable baseline for a legacy one-arm report', () => {
    const summary = withLengths({ completionRate: 0.5 }, 0, false)
    const markdown = renderOvernightOverviewMarkdown({
      runId: 'legacy-run',
      configFingerprint: 'abc',
      solvers: { baseline: null, candidate: 'candidate-v1' },
      seedCount: 4,
      families: [{
        representative: baseRecipe({ requiredQuality: 100, qualityOutcome: 'required-quality' }),
        nameZh: '測試配方',
        code: 'F01',
        kind: 'hard-quality',
        summaries: [{ candidate: summary, baseline: null }, { candidate: summary, baseline: null }],
      }],
    })

    assert.match(markdown, /此歷史 run 未保存 baseline arm/)
    assert.match(markdown, /A：完 20\/30・未 40\/50/)
    assert.doesNotMatch(markdown, /<br>|候 |基 |Δ |A：完 20 \(/)
  })
})
