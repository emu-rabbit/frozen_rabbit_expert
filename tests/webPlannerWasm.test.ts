import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cosmicExpertScenarioDataByRecipeId } from '@frozen-rabbit-expert/data'
import {
  applyObservedOutcome,
  createInitialCraftState,
  type CraftActionId,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import {
  parsePlannerReply,
  serializePlannerRequest,
  WEB_PLANNER_ABI,
  WEB_PLANNER_POLICY,
} from '../apps/web/src/runtime/planner/protocol'
import { createPlannerEpisode } from '../apps/web/src/runtime/planner/episode'

interface PlannerWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  frozen_rabbit_web_input_resize(length: number): number
  frozen_rabbit_web_input_ptr(): number
  frozen_rabbit_web_recommend(): number
  frozen_rabbit_web_output_ptr(): number
  frozen_rabbit_web_output_len(): number
  frozen_rabbit_web_reset_session(): void
}

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const wasmPath = path.join(
  repositoryRoot,
  'apps', 'web', 'src', 'runtime', 'wasm', 'frozen_rabbit_craft_kernel_web.wasm',
)
const fixturePath = path.join(
  repositoryRoot,
  'native', 'craft-kernel', 'tests', 'fixtures', 'web-bridge-f36-prefix.tsv',
)

async function loadWasm(): Promise<PlannerWasmExports> {
  const bytes = readFileSync(wasmPath)
  const { instance } = await WebAssembly.instantiate(bytes, {})
  return instance.exports as PlannerWasmExports
}

function recommend(exports: PlannerWasmExports, request: string) {
  const encoded = new TextEncoder().encode(request)
  expect(exports.frozen_rabbit_web_input_resize(encoded.byteLength)).toBe(0)
  const pointer = exports.frozen_rabbit_web_input_ptr()
  new Uint8Array(exports.memory.buffer, pointer, encoded.byteLength).set(encoded)
  exports.frozen_rabbit_web_recommend()
  const outputPointer = exports.frozen_rabbit_web_output_ptr()
  const outputLength = exports.frozen_rabbit_web_output_len()
  return new TextDecoder().decode(
    new Uint8Array(exports.memory.buffer, outputPointer, outputLength).slice(),
  )
}

describe('v2.0 Web planner boundary', () => {
  it('loads the production WASM and returns a version-checked recommendation', async () => {
    const exports = await loadWasm()
    const fixturePrefix = readFileSync(fixturePath, 'utf8').trim().replace(
      'generic-craft-route-portfolio-v1.12.0',
      WEB_PLANNER_POLICY,
    )
    const episode = `${fixturePrefix}\t1\t1\t1\t1\t1\t1\t1\t1\t0`
    const row = recommend(exports, serializePlannerRequest({ mode: 'reset' }, episode))
    const reply = parsePlannerReply(row)

    expect(row.startsWith(`${WEB_PLANNER_ABI}\tok\t${WEB_PLANNER_POLICY}\t`)).toBe(true)
    expect(reply.policyVersion).toBe(WEB_PLANNER_POLICY)
    expect(reply.action).not.toBeNull()
    expect(reply.contextFingerprint).not.toBe('')
  })

  it('fails closed when a non-v2.0 episode is sent', () => {
    expect(() => serializePlannerRequest(
      { mode: 'reset' },
      'native-generic-episode-batch-v7\tcase\tepisode\tgeneric-craft-route-portfolio-v1.1.0',
    )).toThrow(`must use ${WEB_PLANNER_POLICY}`)
  })

  it('accepts a live Web session row generated from catalog data', async () => {
    const scenario = cosmicExpertScenarioDataByRecipeId(37_006)
    expect(scenario).not.toBeNull()
    const crafter: CrafterProfile = {
      level: 100,
      craftsmanship: 5_408,
      control: 5_237,
      maxCp: 749,
      cosmicToolGoodBonus: true,
      specialist: true,
    }
    const state = createInitialCraftState(scenario!.recipe, crafter)
    const episode = createPlannerEpisode(scenario!, crafter, state)
    expect(episode.split('\t')).toHaveLength(141)

    const exports = await loadWasm()
    const row = recommend(exports, serializePlannerRequest({ mode: 'reset' }, episode))
    const first = parsePlannerReply(row)
    expect(first.action).not.toBeNull()

    const nextState = applyObservedOutcome(
      scenario!.recipe,
      crafter,
      state,
      first.action as CraftActionId,
      { success: true, nextCondition: 'normal' },
    ).nextState
    const continued = recommend(exports, serializePlannerRequest(
      { mode: 'continue', action: first.action! },
      createPlannerEpisode(scenario!, crafter, nextState),
    ))
    expect(parsePlannerReply(continued).action).not.toBeNull()
  })
})
