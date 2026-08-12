export interface MissionCraftAttempt {
  key: string
  completed: boolean
  actionCount: number
}

export interface MissionAttempt {
  key: string
  bothCompleted: boolean
  totalActionCount: number
}

export interface ActionCountDistribution {
  samples: number
  mean: number
  p50: number
  p90: number
  maximum: number
}

export interface MissionDeadlineEstimate {
  secondsPerAction: number
  deadlineSeconds: number
  fixedOverheadSeconds: number
  maximumActionsWithinDeadline: number
  attained: number
  attempts: number
  attainmentRate: number
}

function percentile(sortedSamples: readonly number[], fraction: number): number {
  return sortedSamples[Math.max(0, Math.ceil(sortedSamples.length * fraction) - 1)] ?? 0
}

export function summarizeActionCounts(samples: readonly number[]): ActionCountDistribution {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    samples: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    maximum: sorted.at(-1) ?? 0,
  }
}

export function pairMissionCraftAttempts(
  firstCraft: readonly MissionCraftAttempt[],
  secondCraft: readonly MissionCraftAttempt[],
): MissionAttempt[] {
  const firstByKey = new Map(firstCraft.map((attempt) => [attempt.key, attempt]))
  if (firstByKey.size !== firstCraft.length) {
    throw new Error('first craft contains duplicate condition-profile/trial keys')
  }
  const secondByKey = new Map(secondCraft.map((attempt) => [attempt.key, attempt]))
  if (secondByKey.size !== secondCraft.length) {
    throw new Error('second craft contains duplicate condition-profile/trial keys')
  }
  const paired = firstCraft.map((first) => {
    const second = secondByKey.get(first.key)
    if (second === undefined) throw new Error(`second craft is missing paired attempt ${first.key}`)
    return {
      key: first.key,
      bothCompleted: first.completed && second.completed,
      totalActionCount: first.actionCount + second.actionCount,
    }
  })
  if (paired.length !== secondCraft.length) {
    throw new Error('craft attempt sets do not contain the same condition-profile/trial keys')
  }
  return paired
}

export function estimateMissionDeadlines(
  attempts: readonly MissionAttempt[],
  deadlineSeconds: number,
  fixedOverheadSeconds: number,
  secondsPerActionValues: readonly number[],
): MissionDeadlineEstimate[] {
  return secondsPerActionValues.map((secondsPerAction) => {
    const maximumActionsWithinDeadline = Math.max(
      0,
      Math.floor((deadlineSeconds - fixedOverheadSeconds) / secondsPerAction),
    )
    const attained = attempts.filter((attempt) => (
      attempt.bothCompleted
      && fixedOverheadSeconds + attempt.totalActionCount * secondsPerAction <= deadlineSeconds
    )).length
    return {
      secondsPerAction,
      deadlineSeconds,
      fixedOverheadSeconds,
      maximumActionsWithinDeadline,
      attained,
      attempts: attempts.length,
      attainmentRate: attained / Math.max(1, attempts.length),
    }
  })
}
