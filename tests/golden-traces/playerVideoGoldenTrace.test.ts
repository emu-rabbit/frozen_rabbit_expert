import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  type CraftActionId,
  type CrafterProfile,
  type MaterialCondition,
} from '@frozen-rabbit-expert/domain'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 722,
  cosmicToolGoodBonus: true,
}

interface ObservedTraceStep {
  action: CraftActionId
  success: boolean
  nextCondition: MaterialCondition
  progress: number
  quality: number
  durability?: number
  cp: number
}

/**
 * Player-observed full successful trace.
 * - Patch/client: TW 7.51, Traditional Chinese client
 * - Recipe: 36282 / Item 48360 / Cosmotized Ilmenite Ingot
 * - Capture: `錄製內容 2026-08-11 193225.mp4`, 2026-08-11, screen recording
 * - Transcription: 2 fps action review plus 1 fps stable-state review
 * - Mechanics scope: cosmic-craft-mechanics-v0.3.0-tw751-specialist
 * - Privacy: the repository stores only mechanics fields, not the source video
 *
 * Only directly visible post-action values are asserted. Buffs and Inner Quiet
 * were cropped in the recording and remain replay-derived rather than observed.
 */
const PLAYER_VIDEO_TRACE: readonly ObservedTraceStep[] = [
  { action: 'muscleMemory', success: true, nextCondition: 'normal', progress: 906, quality: 0, durability: 20, cp: 716 },
  { action: 'veneration', success: true, nextCondition: 'centered', progress: 906, quality: 0, durability: 20, cp: 698 },
  { action: 'rapidSynthesis', success: true, nextCondition: 'centered', progress: 4681, quality: 0, durability: 10, cp: 698 },
  { action: 'trainedPerfection', success: true, nextCondition: 'malleable', progress: 4681, quality: 0, durability: 10, cp: 698 },
  { action: 'prudentSynthesis', success: true, nextCondition: 'pliant', progress: 5904, quality: 0, durability: 10, cp: 680 },
  { action: 'manipulation', success: true, nextCondition: 'sturdy', progress: 5904, quality: 0, durability: 10, cp: 632 },
  { action: 'prudentSynthesis', success: true, nextCondition: 'centered', progress: 6447, quality: 0, durability: 12, cp: 614 },
  { action: 'innovation', success: true, nextCondition: 'sturdy', progress: 6447, quality: 0, durability: 17, cp: 596 },
  { action: 'preparatoryTouch', success: true, nextCondition: 'sturdy', progress: 6447, quality: 975, durability: 12, cp: 556 },
  { action: 'hastyTouch', success: true, nextCondition: 'centered', progress: 6447, quality: 1560, durability: 12, cp: 556 },
  { action: 'daringTouch', success: true, nextCondition: 'normal', progress: 6447, quality: 2510, durability: 7, cp: 556 },
  { action: 'innovation', success: true, nextCondition: 'centered', progress: 6447, quality: 2510, durability: 12, cp: 538 },
  { action: 'hastyTouch', success: true, nextCondition: 'good', progress: 6447, quality: 3192, durability: 7, cp: 538 },
  { action: 'tricksOfTheTrade', success: true, nextCondition: 'malleable', progress: 6447, quality: 3192, durability: 12, cp: 558 },
  { action: 'manipulation', success: true, nextCondition: 'pliant', progress: 6447, quality: 3192, durability: 12, cp: 462 },
  { action: 'wasteNot2', success: true, nextCondition: 'normal', progress: 6447, quality: 3192, durability: 17, cp: 413 },
  { action: 'hastyTouch', success: false, nextCondition: 'malleable', progress: 6447, quality: 3192, durability: 17, cp: 413 },
  { action: 'refinedTouch', success: true, nextCondition: 'centered', progress: 6447, quality: 3679, durability: 17, cp: 389 },
  { action: 'hastyTouch', success: true, nextCondition: 'sturdy', progress: 6447, quality: 4199, durability: 17, cp: 389 },
  { action: 'daringTouch', success: true, nextCondition: 'normal', progress: 6447, quality: 5027, durability: 19, cp: 389 },
  { action: 'innovation', success: true, nextCondition: 'sturdy', progress: 6447, quality: 5027, durability: 24, cp: 371 },
  { action: 'preparatoryTouch', success: true, nextCondition: 'normal', progress: 6447, quality: 6782, durability: 24, cp: 331 },
  { action: 'trainedFinesse', success: true, nextCondition: 'pliant', progress: 6447, quality: 7757, durability: 29, cp: 299 },
  { action: 'manipulation', success: true, nextCondition: 'normal', progress: 6447, quality: 7757, durability: 29, cp: 251 },
  { action: 'prudentTouch', success: true, nextCondition: 'pliant', progress: 6447, quality: 8732, durability: 29, cp: 226 },
  { action: 'wasteNot2', success: true, nextCondition: 'centered', progress: 6447, quality: 8732, durability: 30, cp: 177 },
  { action: 'preparatoryTouch', success: true, nextCondition: 'sturdy', progress: 6447, quality: 10032, durability: 25, cp: 137 },
  { action: 'greatStrides', success: true, nextCondition: 'pliant', progress: 6447, quality: 10032, durability: 30, cp: 105 },
  { action: 'innovation', success: true, nextCondition: 'centered', progress: 6447, quality: 10032, durability: 30, cp: 96 },
  { action: 'observe', success: true, nextCondition: 'pliant', progress: 6447, quality: 10032, durability: 30, cp: 89 },
  { action: 'observe', success: true, nextCondition: 'normal', progress: 6447, quality: 10032, durability: 30, cp: 85 },
  { action: 'greatStrides', success: true, nextCondition: 'centered', progress: 6447, quality: 10032, durability: 30, cp: 53 },
  { action: 'innovation', success: true, nextCondition: 'good', progress: 6447, quality: 10032, durability: 30, cp: 35 },
  { action: 'byregotsBlessing', success: true, nextCondition: 'normal', progress: 6447, quality: 18563, durability: 25, cp: 11 },
  { action: 'carefulSynthesis', success: true, nextCondition: 'normal', progress: 6990, quality: 18563, durability: 15, cp: 4 },
  { action: 'hastyTouch', success: true, nextCondition: 'pliant', progress: 6990, quality: 18900, durability: 5, cp: 4 },
  // The completion overlay replaces the stable crafting state; final durability
  // is therefore not claimed as directly observed (the engine retains 5 - 10).
  { action: 'carefulSynthesis', success: true, nextCondition: 'normal', progress: 7300, quality: 18900, cp: 0 },
] as const

describe('golden trace: 2026-08-11 player video', () => {
  it('matches every directly observed state transition', () => {
    let state = createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter)
    for (const [index, observed] of PLAYER_VIDEO_TRACE.entries()) {
      state = applyObservedOutcome(COSMIC_TITANIUM_INGOT, crafter, state, observed.action, {
        success: observed.success,
        nextCondition: observed.nextCondition,
      }).nextState
      expect(
        {
          progress: state.progress,
          quality: state.quality,
          ...(observed.durability === undefined ? {} : { durability: state.durability }),
          cp: state.cp,
        },
        `step ${index + 1} ${observed.action}`,
      ).toEqual({
        progress: observed.progress,
        quality: observed.quality,
        ...(observed.durability === undefined ? {} : { durability: observed.durability }),
        cp: observed.cp,
      })
    }
    expect(state.terminal).toBe('completed')
  })
})
