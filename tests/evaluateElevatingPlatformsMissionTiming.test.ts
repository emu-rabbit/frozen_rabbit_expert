import { describe, expect, it } from 'vitest'
import {
  estimateMissionDeadlines,
  pairMissionCraftAttempts,
  summarizeActionCounts,
} from '../tools/evaluate-elevating-platforms/missionTiming'
import { estimateHqChancePercentFromCommunityTable } from '@frozen-rabbit-expert/data'

describe('Elevating Platforms mission timing diagnostics', () => {
  it('pairs crafts by condition profile and seed instead of array order', () => {
    const attempts = pairMissionCraftAttempts(
      [
        { key: 'balanced:1', completed: true, actionCount: 20 },
        { key: 'scarce:2', completed: false, actionCount: 30 },
      ],
      [
        { key: 'scarce:2', completed: true, actionCount: 35 },
        { key: 'balanced:1', completed: true, actionCount: 40 },
      ],
    )

    expect(attempts).toEqual([
      { key: 'balanced:1', bothCompleted: true, totalActionCount: 60 },
      { key: 'scarce:2', bothCompleted: false, totalActionCount: 65 },
    ])
  })

  it('keeps completion in the deadline denominator and applies fixed overhead', () => {
    const estimates = estimateMissionDeadlines(
      [
        { key: 'a', bothCompleted: true, totalActionCount: 64 },
        { key: 'b', bothCompleted: true, totalActionCount: 65 },
        { key: 'c', bothCompleted: false, totalActionCount: 20 },
      ],
      330,
      10,
      [5],
    )

    expect(estimates).toEqual([{
      secondsPerAction: 5,
      deadlineSeconds: 330,
      fixedOverheadSeconds: 10,
      maximumActionsWithinDeadline: 64,
      attained: 1,
      attempts: 3,
      attainmentRate: 1 / 3,
    }])
  })

  it('reports stable action-count percentiles', () => {
    expect(summarizeActionCounts([50, 60, 70, 80, 90])).toEqual({
      samples: 5,
      mean: 70,
      p50: 70,
      p90: 90,
      maximum: 90,
    })
  })

  it('rejects unpaired craft attempts', () => {
    expect(() => pairMissionCraftAttempts(
      [{ key: 'balanced:1', completed: true, actionCount: 20 }],
      [{ key: 'balanced:2', completed: true, actionCount: 40 }],
    )).toThrow('missing paired attempt balanced:1')
  })

  it('rejects duplicate keys on either side of the mission pair', () => {
    const duplicate = [
      { key: 'balanced:1', completed: true, actionCount: 20 },
      { key: 'balanced:1', completed: true, actionCount: 21 },
    ]
    const unique = [
      { key: 'balanced:1', completed: true, actionCount: 40 },
      { key: 'balanced:2', completed: true, actionCount: 41 },
    ]

    expect(() => pairMissionCraftAttempts(duplicate, unique)).toThrow('first craft contains duplicate')
    expect(() => pairMissionCraftAttempts(unique, duplicate)).toThrow('second craft contains duplicate')
  })

  it('keeps the provisional HQ estimator monotonic so the quality median maps to the HQ median', () => {
    const completedQualities = [8_000, 18_000, 22_500]
    const hqEstimates = completedQualities.map((quality) => (
      estimateHqChancePercentFromCommunityTable(quality, 22_500)
    ))

    expect(hqEstimates).toEqual([...hqEstimates].sort((left, right) => left - right))
    expect(hqEstimates[1]).toBe(71)
  })
})
