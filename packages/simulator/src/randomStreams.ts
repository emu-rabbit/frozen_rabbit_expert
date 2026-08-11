import type { EpisodeRandomStream } from './types'

function mixSeed(seed: number): number {
  let value = seed >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b)
  value ^= value >>> 16
  return value >>> 0
}

function createGenerator(seed: number): () => number {
  let value = mixSeed(seed) || 0x6d2b79f5
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function createEpisodeRandomStream(seed: number): EpisodeRandomStream {
  const condition = createGenerator(seed ^ 0x43a9_b2f1)
  const success = createGenerator(seed ^ 0x9e37_79b9)
  return {
    nextCondition: condition,
    nextSuccess: success,
  }
}
