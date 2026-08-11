import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_INGOT } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CrafterProfile, type CraftState } from '@frozen-rabbit-expert/domain'
import { MODEL_VERSIONS } from '@frozen-rabbit-expert/protocol'
import { recommendAction } from '../src'

const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5408,
  control: 5140,
  maxCp: 630,
  cosmicToolGoodBonus: true,
}

function state(patch: Partial<CraftState> = {}): CraftState {
  return { ...createInitialCraftState(COSMIC_TITANIUM_INGOT, crafter), ...patch }
}

describe('runtime recommendation performance', () => {
  it('keeps p95 below 50ms on the local representative corpus', () => {
    const samples: number[] = []
    const corpus = Array.from({ length: 120 }, (_, index) => state({
      step: 2 + (index % 24),
      progress: Math.min(6900, (index * 173) % 7000),
      quality: (index * 431) % 18500,
      durability: [10, 15, 20, 25, 30][index % 5]!,
      cp: 180 + (index * 37) % 430,
      innerQuiet: index % 11,
      condition: (['normal', 'good', 'centered', 'sturdy', 'pliant', 'malleable'] as const)[index % 6]!,
    }))

    for (const current of corpus) {
      const startedAt = performance.now()
      recommendAction(COSMIC_TITANIUM_INGOT, crafter, current, { mechanicsVersion: MODEL_VERSIONS.mechanics })
      samples.push(performance.now() - startedAt)
    }
    samples.sort((a, b) => a - b)
    const p50 = samples[Math.ceil(samples.length * 0.5) - 1]!
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!
    const p99 = samples[Math.ceil(samples.length * 0.99) - 1]!
    console.info(`solver benchmark: ${samples.length} scenarios; p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`)
    expect(p95).toBeLessThan(50)
  })
})
