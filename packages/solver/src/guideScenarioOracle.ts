import type { CraftActionId, CraftState } from '@frozen-rabbit-expert/domain'

export interface GuideScenarioOracleEntry {
  id: string
  summary: string
  state: Omit<Partial<CraftState>, 'buffs'> & { buffs?: Partial<CraftState['buffs']> }
  acceptableActions: readonly CraftActionId[]
  forbiddenActions?: readonly CraftActionId[]
  techniqueIds: readonly string[]
}

/**
 * Guide-derived behavioral checks for the current six-condition mechanics
 * subset. They intentionally permit multiple actions where guides describe a
 * trade-off. Passing this corpus is necessary, but not proof of optimal play.
 */
export const GUIDE_SCENARIO_ORACLE: readonly GuideScenarioOracleEntry[] = [
  {
    id: 'opening-progress-or-quality-route',
    summary: 'The first action should establish either the progress opener or the quality opener.',
    state: { step: 1, condition: 'normal' },
    acceptableActions: ['muscleMemory', 'reflect'],
    techniqueIds: ['muscle-memory-progress-staging', 'reflect-quality-opener'],
  },
  {
    id: 'innovation-standard-combo',
    summary: 'Continue a discounted Standard Touch combo with Advanced Touch while Innovation is active.',
    state: {
      step: 12, progress: 6500, quality: 7200, durability: 25, cp: 300,
      innerQuiet: 7, comboFrom: 'standardTouch', buffs: { innovation: 3 },
    },
    acceptableActions: ['advancedTouch'],
    techniqueIds: ['touch-combo-economy', 'innovation-window-packing'],
  },
  {
    id: 'innovation-observe-combo',
    summary: 'Cash in an already-armed Observe-to-Advanced route inside Innovation.',
    state: {
      step: 12, progress: 6500, quality: 7200, durability: 20, cp: 180,
      innerQuiet: 8, comboFrom: 'observe', buffs: { innovation: 2 },
    },
    acceptableActions: ['advancedTouch'],
    techniqueIds: ['touch-combo-economy', 'innovation-window-packing'],
  },
  {
    id: 'good-inner-quiet-growth',
    summary: 'Convert Good into high-value Inner Quiet growth or CP needed by the remaining route.',
    state: {
      step: 8, progress: 5900, quality: 4300, durability: 25, cp: 360,
      innerQuiet: 5, condition: 'good',
    },
    acceptableActions: ['preciseTouch', 'tricksOfTheTrade', 'trainedPerfection'],
    techniqueIds: ['condition-resource-conversion', 'inner-quiet-efficient-growth'],
  },
  {
    id: 'pliant-low-durability',
    summary: 'Use Pliant for an expensive durability action when durability is critically low.',
    state: {
      step: 9, progress: 5900, quality: 5200, durability: 5, cp: 280,
      innerQuiet: 6, condition: 'pliant',
    },
    acceptableActions: ['immaculateMend', 'mastersMend', 'manipulation', 'trainedPerfection'],
    techniqueIds: ['condition-resource-conversion', 'durability-cycle-efficiency'],
  },
  {
    id: 'malleable-progress-headroom',
    summary: 'Spend Malleable on progress while leaving room for quality rather than completing early.',
    state: {
      step: 6, progress: 2200, quality: 2600, durability: 25, cp: 450,
      innerQuiet: 3, condition: 'malleable',
    },
    acceptableActions: ['groundwork', 'rapidSynthesis', 'carefulSynthesis', 'prudentSynthesis', 'basicSynthesis'],
    techniqueIds: ['condition-resource-conversion', 'progress-headroom'],
  },
  {
    id: 'innovation-inner-quiet-ten',
    summary: 'Pack quality actions into an active Innovation window at ten Inner Quiet.',
    state: {
      step: 17, progress: 6800, quality: 10300, durability: 25, cp: 220,
      innerQuiet: 10, buffs: { innovation: 4 },
    },
    acceptableActions: ['trainedFinesse', 'preparatoryTouch', 'greatStrides', 'basicTouch', 'observe'],
    forbiddenActions: ['innovation'],
    techniqueIds: ['innovation-window-packing', 'quality-finisher-reserve'],
  },
  {
    id: 'quality-ready-complete',
    summary: 'Once required quality is reached, complete with a legal progress action instead of spending more quality resources.',
    state: {
      step: 22, progress: 7000, quality: 18900, durability: 10, cp: 100,
      innerQuiet: 0,
    },
    acceptableActions: ['basicSynthesis', 'carefulSynthesis', 'prudentSynthesis', 'rapidSynthesis'],
    techniqueIds: ['progress-headroom', 'quality-finisher-reserve'],
  },
] as const
