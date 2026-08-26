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
})

describe('overnight overview markdown', () => {
  test('renders exactly four result tables without judgment columns and sorts by E09', () => {
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
        summaries: [{ completionRate: 0.5 }, { completionRate: 0.25 }],
      },
      {
        ...common,
        code: 'F02',
        kind: 'hard-quality',
        representative: baseRecipe({ requiredQuality: 100, qualityOutcome: 'required-quality' }),
        summaries: [{ completionRate: 0.5 }, { completionRate: 0.75 }],
      },
      {
        ...common,
        code: 'F03',
        kind: 'collectability',
        summaries: [{
          deliveryRate: 1,
          collectabilityLowRate: 1,
          collectabilityMidRate: 1,
          collectabilityHighRate: 0.8,
          fullQualityRate: 0.5,
        }, {
          deliveryRate: 1,
          collectabilityLowRate: 1,
          collectabilityMidRate: 0.9,
          collectabilityHighRate: 0.7,
          fullQualityRate: 0.4,
        }],
      },
      {
        ...common,
        code: 'F04',
        kind: 'hq',
        representative: baseRecipe({ qualityOutcome: 'hq-chance', missionNamesEn: ['Test'] }),
        summaries: [{ deliveryRate: 1, completedHqChanceMean: 90, fullQualityRate: 0.5 }, {
          deliveryRate: 1, completedHqChanceMean: 95, fullQualityRate: 0.6,
        }],
      },
      {
        ...common,
        code: 'F05',
        kind: 'master',
        representative: baseRecipe({ missionNamesEn: ['Master: Test'] }),
        summaries: [{ deliveryRate: 1, completedCollectabilityMean: 9, fullQualityRate: 0.5 }, {
          deliveryRate: 1, completedCollectabilityMean: 10, fullQualityRate: 0.6,
        }],
      },
    ]

    const markdown = renderOvernightOverviewMarkdown({
      runId: 'test-run',
      configFingerprint: 'abc',
      solver: 'candidate-v1',
      seedCount: 4,
      families,
    })

    assert.equal((markdown.match(/^\| Family /gm) ?? []).length, 4)
    assert.doesNotMatch(markdown, /\| (判讀|量尺說明) \|/)
    assert.ok(markdown.indexOf('| F02 |') < markdown.indexOf('| F01 |'))
    assert.match(markdown, /E02 交\/100\/300\/700\/滿/)
    assert.match(markdown, /E09 交貨\/HQ\/滿/)
  })
})
