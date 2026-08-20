import { describe, expect, it } from 'vitest'
import { COSMIC_TITANIUM_NAILS, PLAYER_EQUIPMENT_PROFILES } from '@frozen-rabbit-expert/data'
import { createInitialCraftState, type CraftState } from '@frozen-rabbit-expert/domain'
import {
  canonicalInitialStateCorpusContentHash,
  canonicalSeedCorpusContentHash,
  compareCanonicalStrings,
  createEvaluationCorpusSealManifest,
  sealInitialStateCorpus,
  sealSeedCorpus,
  validateEvaluationCorpusSealManifest,
  type EvaluationCorpusSealManifestV4,
} from '../src'

function initialState(): CraftState {
  return createInitialCraftState(
    COSMIC_TITANIUM_NAILS,
    PLAYER_EQUIPMENT_PROFILES[2]!.crafter,
  )
}

const stateBinding = {
  recipeProfileId: COSMIC_TITANIUM_NAILS.profileId,
  crafterGroupId: PLAYER_EQUIPMENT_PROFILES[2]!.id,
} as const

describe('canonical evaluation corpus seals', () => {
  it('uses locale-independent ordering for manifest identities', () => {
    const entries = [
      sealSeedCorpus('藥', [3]),
      sealSeedCorpus('a', [2]),
      sealSeedCorpus('Z', [1]),
    ]
    const manifest = createEvaluationCorpusSealManifest('canonical-order-vector-v1', entries)
    const reversed = createEvaluationCorpusSealManifest(
      'canonical-order-vector-v1',
      [...entries].reverse(),
    )

    expect([...['藥', 'a', 'Z']].sort(compareCanonicalStrings)).toEqual(['Z', 'a', '藥'])
    expect(manifest.manifestContentHash).toBe(
      'sha256:c6e3e7276820a9749a3ba1fdd215f76967a1a40b15e6bba174bcec5d70076e32',
    )
    expect(reversed.manifestContentHash).toBe(manifest.manifestContentHash)
  })

  it('uses deterministic, order-sensitive sha256 seed content', () => {
    const hash = canonicalSeedCorpusContentHash([11, 29])
    expect(hash).toBe('sha256:b545e67d6487fb1a275415536b1ade0ee8b277e49fcd81131eec599e71aa583b')
    expect(canonicalSeedCorpusContentHash([11, 29])).toBe(hash)
    expect(canonicalSeedCorpusContentHash([29, 11])).not.toBe(hash)
    expect(canonicalSeedCorpusContentHash([11, 31])).not.toBe(hash)
    expect(() => canonicalSeedCorpusContentHash([Number.NaN])).toThrow(/uint32/)
    expect(() => canonicalSeedCorpusContentHash([-1])).toThrow(/uint32/)
    expect(() => canonicalSeedCorpusContentHash([0xffff_ffff + 1])).toThrow(/uint32/)
    expect(() => canonicalSeedCorpusContentHash([11, 11])).toThrow(/duplicate seed/)
  })

  it('ignores JavaScript object insertion order but seals state-array order', () => {
    const state = initialState()
    const reordered = {
      ...Object.fromEntries([...Object.entries(state)].reverse()),
      buffs: Object.fromEntries([...Object.entries(state.buffs)].reverse()),
    } as unknown as CraftState
    const changed = { ...state, progress: state.progress + 1 }

    expect(canonicalInitialStateCorpusContentHash([state], stateBinding)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    )
    expect(canonicalInitialStateCorpusContentHash([reordered], stateBinding)).toBe(
      canonicalInitialStateCorpusContentHash([state], stateBinding),
    )
    const reverseConstructedBinding = Object.fromEntries([
      ['crafterGroupId', stateBinding.crafterGroupId],
      ['recipeProfileId', stateBinding.recipeProfileId],
    ]) as unknown as typeof stateBinding
    expect(canonicalInitialStateCorpusContentHash([state], reverseConstructedBinding)).toBe(
      canonicalInitialStateCorpusContentHash([state], stateBinding),
    )
    expect(canonicalInitialStateCorpusContentHash([state, changed], stateBinding)).not.toBe(
      canonicalInitialStateCorpusContentHash([changed, state], stateBinding),
    )
    expect(canonicalInitialStateCorpusContentHash([state], stateBinding)).not.toBe(
      canonicalInitialStateCorpusContentHash([state], {
        ...stateBinding,
        recipeProfileId: 'different-recipe',
      }),
    )
    expect(canonicalInitialStateCorpusContentHash([state], stateBinding)).not.toBe(
      canonicalInitialStateCorpusContentHash([state], {
        ...stateBinding,
        crafterGroupId: 'different-group',
      }),
    )
    const boundSeal = sealInitialStateCorpus('bound-a', [state], stateBinding)
    const otherGroupSeal = sealInitialStateCorpus('bound-b', [state], {
      ...stateBinding,
      crafterGroupId: 'different-group',
    })
    const otherRecipeSeal = sealInitialStateCorpus('bound-c', [state], {
      ...stateBinding,
      recipeProfileId: 'different-recipe',
    })
    expect(otherGroupSeal.memberHashes).not.toEqual(boundSeal.memberHashes)
    expect(otherGroupSeal.overlapMemberHashes).toEqual(boundSeal.overlapMemberHashes)
    expect(otherRecipeSeal.overlapMemberHashes).not.toEqual(boundSeal.overlapMemberHashes)
    expect(boundSeal.binding).toEqual(stateBinding)
    expect(sealSeedCorpus('seed-binding-vector', [1]).binding).toBeNull()
  })

  it('seals every CraftState and nested buff field that can affect an episode', () => {
    const state = initialState()
    const baseline = canonicalInitialStateCorpusContentHash([state], stateBinding)
    const variants: readonly [string, CraftState][] = [
      ['step', { ...state, step: state.step + 1 }],
      ['progress', { ...state, progress: state.progress + 1 }],
      ['quality', { ...state, quality: state.quality + 1 }],
      ['durability', { ...state, durability: state.durability - 1 }],
      ['cp', { ...state, cp: state.cp - 1 }],
      ['condition', { ...state, condition: 'good' }],
      ['innerQuiet', { ...state, innerQuiet: state.innerQuiet + 1 }],
      ['buffs.wasteNot', { ...state, buffs: { ...state.buffs, wasteNot: 1 } }],
      ['buffs.veneration', { ...state, buffs: { ...state.buffs, veneration: 1 } }],
      ['buffs.greatStrides', { ...state, buffs: { ...state.buffs, greatStrides: 1 } }],
      ['buffs.innovation', { ...state, buffs: { ...state.buffs, innovation: 1 } }],
      ['buffs.finalAppraisal', { ...state, buffs: { ...state.buffs, finalAppraisal: 1 } }],
      ['buffs.manipulation', { ...state, buffs: { ...state.buffs, manipulation: 1 } }],
      ['buffs.muscleMemory', { ...state, buffs: { ...state.buffs, muscleMemory: 1 } }],
      ['buffs.expedience', { ...state, buffs: { ...state.buffs, expedience: 1 } }],
      ['comboFrom', { ...state, comboFrom: 'basicTouch' }],
      ['trainedPerfectionAvailable', {
        ...state,
        trainedPerfectionAvailable: !state.trainedPerfectionAvailable,
      }],
      ['trainedPerfectionActive', {
        ...state,
        trainedPerfectionActive: !state.trainedPerfectionActive,
      }],
      ['carefulObservationUsesLeft', {
        ...state,
        carefulObservationUsesLeft: state.carefulObservationUsesLeft - 1,
      }],
      ['heartAndSoulAvailable', {
        ...state,
        heartAndSoulAvailable: !state.heartAndSoulAvailable,
      }],
      ['heartAndSoulActive', { ...state, heartAndSoulActive: !state.heartAndSoulActive }],
      ['quickInnovationAvailable', {
        ...state,
        quickInnovationAvailable: !state.quickInnovationAvailable,
      }],
      ['terminal', { ...state, terminal: 'completed' }],
      ['failureReason', { ...state, failureReason: 'durability' }],
    ]

    for (const [field, variant] of variants) {
      expect(canonicalInitialStateCorpusContentHash([variant], stateBinding), field).not.toBe(baseline)
    }
  })

  it('requires one globally unique, typed sha256 entry per canonical corpus id', () => {
    const state = initialState()
    const manifest: EvaluationCorpusSealManifestV4 = createEvaluationCorpusSealManifest(
      'held-out-seals-v1',
      [
        sealSeedCorpus('held-out-seeds-v1', [11, 29]),
        sealInitialStateCorpus('held-out-states-v1', [state], stateBinding),
      ],
    )
    expect(() => validateEvaluationCorpusSealManifest(manifest)).not.toThrow()
    expect(() => validateEvaluationCorpusSealManifest({
      ...manifest,
      entries: [...manifest.entries, manifest.entries[0]!],
    })).toThrow(/duplicate sealed corpus id/)
    expect(() => validateEvaluationCorpusSealManifest({
      ...manifest,
      entries: [{
        ...manifest.entries[0]!,
        contentHash: 'sha256:ABC' as `sha256:${string}`,
      }],
    })).toThrow(/invalid sha256 content hash/)
    expect(() => validateEvaluationCorpusSealManifest({
      ...manifest,
      entries: [],
    })).toThrow(/must contain entries/)
    expect(() => validateEvaluationCorpusSealManifest({
      ...manifest,
      entries: [{
        ...manifest.entries[0]!,
        kind: 'unknown' as 'seed',
      }],
    })).toThrow(/unknown sealed corpus kind/)
    const seedEntry = manifest.entries.find((entry) => entry.kind === 'seed')!
    const initialStateEntry = manifest.entries.find((entry) => entry.kind === 'initial-state')!
    expect(() => validateEvaluationCorpusSealManifest({
      ...manifest,
      entries: [{ ...seedEntry, binding: stateBinding } as unknown as typeof seedEntry],
    })).toThrow(/must not declare an initial-state binding/)
    expect(() => validateEvaluationCorpusSealManifest({
      ...manifest,
      entries: [{ ...initialStateEntry, binding: null } as unknown as typeof initialStateEntry],
    })).toThrow(/must declare its recipe\/group binding/)
    expect(() => validateEvaluationCorpusSealManifest({
      ...manifest,
      manifestContentHash: `sha256:${'0'.repeat(64)}`,
    })).toThrow(/manifestContentHash does not match/)
  })
})
