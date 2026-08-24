import { describe, expect, it } from 'vitest'
import {
  CRAFT_SCENARIO_DATA,
  PLAYER_EQUIPMENT_PROFILES,
} from '@frozen-rabbit-expert/data'
import {
  ACTION_IDS,
  CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
  MATERIAL_CONDITIONS,
} from '@frozen-rabbit-expert/domain'
import {
  NATIVE_ROOT_PLAN_MATRIX_VERSION,
  executePreparedNativeRootPlanMatrix,
  nativeFixedContinuationPlanHash,
  nativeRootPlanMatrixOracleSha256,
  prepareNativeRootPlanMatrix,
  type NativeRootPlanMatrixOutcome,
  type PreparedNativeRootPlanMatrix,
} from '../tools/native-parity/rootPlanMatrix'
import {
  NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS,
  NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES,
  NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS,
  assertRootPlanMatrixProtocolIdentity,
  encodeNativeRootPlanMatrixBatch,
  encodeNativeRootPlanMatrixBenchmarkInput,
  encodeNativeRootPlanMatrixInput,
  parseNativeRootPlanMatrixBatchOutput,
  validateNativeRootPlanMatrixBatch,
  validateNativeRootPlanMatrixBenchmark,
} from '../tools/native-parity/rootPlanMatrixProtocol'
import {
  encodeNativeStateCells,
  outputFnv1a64,
} from '../tools/native-parity/transitionBatchProtocol'

function encodedOutcomeLine(outcome: Readonly<NativeRootPlanMatrixOutcome>): string {
  const trace = outcome.rollout.steps.length === 0
    ? '-'
    : outcome.rollout.steps.map((step) => [
        step.action,
        step.success ? '1' : '0',
        step.nextCondition,
        step.cursorBefore.condition,
        step.cursorBefore.success,
        step.cursorAfter.condition,
        step.cursorAfter.success,
        step.explanationCodes.length === 0 ? '-' : step.explanationCodes.join(','),
        ...encodeNativeStateCells(step.after),
      ].join('|')).join(';')
  return [
    NATIVE_ROOT_PLAN_MATRIX_VERSION,
    outcome.caseId,
    'outcome',
    'ok',
    outcome.scenarioId,
    outcome.scenarioModelIdentityVersion,
    outcome.scenarioModelContentHash,
    outcome.continuationPlanId,
    outcome.conditionProfileId,
    outcome.candidateOrdinal,
    outcome.candidateId,
    outcome.rootAction,
    outcome.sampleIndex,
    outcome.pairedSeed,
    outcome.rollout.terminal,
    outcome.rollout.stopReason,
    outcome.rollout.actions.length === 0 ? '-' : outcome.rollout.actions.join(','),
    outcome.rollout.transitions,
    outcome.rollout.finalCursor.condition,
    outcome.rollout.finalCursor.success,
    ...encodeNativeStateCells(outcome.rollout.finalState),
    trace,
  ].join('\t')
}

describe('native root-plan matrix v2 TypeScript oracle', () => {
  const prepared = prepareNativeRootPlanMatrix()
  const oracleOutcomes = prepared.flatMap(executePreparedNativeRootPlanMatrix)

  it('covers every scenario, every equipment panel, and two condition profiles per scenario', () => {
    expect(new Set(prepared.map(({ spec }) => spec.scenarioId))).toEqual(
      new Set(CRAFT_SCENARIO_DATA.map(({ scenarioId }) => scenarioId)),
    )
    expect(new Set(prepared.map(({ spec }) => spec.equipmentProfileId))).toEqual(
      new Set(PLAYER_EQUIPMENT_PROFILES.map(({ id }) => id)),
    )
    for (const scenario of CRAFT_SCENARIO_DATA) {
      expect(prepared.filter(({ spec }) => spec.scenarioId === scenario.scenarioId)).toHaveLength(2)
    }
    expect(prepared.every(({ spec }) => spec.candidates.length >= 3 && spec.samples.length >= 4)).toBe(true)
  })

  it('orders candidate/sample pairs and keeps each paired seed identical across roots', () => {
    for (const entry of prepared) {
      const outcomes = executePreparedNativeRootPlanMatrix(entry)
      expect(outcomes.map(({ candidateOrdinal, sampleIndex }) => [candidateOrdinal, sampleIndex]))
        .toEqual(entry.spec.candidates.flatMap((candidate) => (
          entry.spec.samples.map((sample) => [candidate.ordinal, sample.sampleIndex])
        )))
      for (const sample of entry.spec.samples) {
        const pair = outcomes.filter(({ sampleIndex }) => sampleIndex === sample.sampleIndex)
        expect(new Set(pair.map(({ pairedSeed }) => pairedSeed))).toEqual(new Set([sample.pairedSeed]))
      }
    }
  })

  it('has at least one matrix where every root really executes multiple transitions', () => {
    expect(prepared.some((entry) => {
      const outcomes = executePreparedNativeRootPlanMatrix(entry)
      return entry.spec.candidates.every((candidate) => outcomes
        .filter(({ candidateId }) => candidateId === candidate.candidateId)
        .every(({ rollout }) => rollout.transitions >= 2))
    })).toBe(true)
  })

  it('encodes one compressed 137-cell request with a complete 9x9 transition model', () => {
    const transitionStart = 53
    const transitionEnd = transitionStart + MATERIAL_CONDITIONS.length ** 2
    for (const entry of prepared) {
      const cells = encodeNativeRootPlanMatrixInput(entry).split('\t')
      expect(cells).toHaveLength(137)
      expect(cells.slice(0, 5)).toEqual([
        NATIVE_ROOT_PLAN_MATRIX_VERSION,
        entry.spec.caseId,
        'matrix',
        entry.spec.scenarioId,
        CRAFT_SCENARIO_MODEL_IDENTITY_VERSION,
      ])
      expect(cells.slice(transitionStart, transitionEnd)).toHaveLength(
        MATERIAL_CONDITIONS.length * MATERIAL_CONDITIONS.length,
      )
      expect(cells[transitionEnd + 1]!.split(',')).toHaveLength(entry.spec.samples.length)
      expect(cells[transitionEnd + 2]!.split(',')).toHaveLength(entry.spec.candidates.length)
    }
    expect(encodeNativeRootPlanMatrixBatch(prepared).trimEnd().split('\n')).toHaveLength(prepared.length)
  })

  it('rejects aggregate operations and projected full-trace output before encoding', () => {
    const entry = prepared[0]!
    const candidates = ACTION_IDS.map((rootAction, ordinal) => ({
      ordinal,
      candidateId: `candidate-${ordinal}`,
      rootAction,
    }))
    const samples = Array.from({ length: 20_000 }, (_, sampleIndex) => ({
      sampleIndex,
      pairedSeed: Math.imul(sampleIndex, 0x9e37_79b9) >>> 0,
    }))
    const large = {
      ...entry,
      spec: { ...entry.spec, candidates, samples },
    } satisfies PreparedNativeRootPlanMatrix
    const perRequestOperations = candidates.length * samples.length
    expect(perRequestOperations).toBeLessThanOrEqual(1_000_000)
    expect(perRequestOperations * 3).toBeGreaterThan(NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS)
    expect(() => validateNativeRootPlanMatrixBatch([large, large, large]))
      .toThrow(/batch operations/u)

    const continuationActions = Array.from({ length: 999 }, () => 'observe' as const)
    const continuationPlan = {
      ...entry.continuationPlan,
      actions: continuationActions,
      contentFnv1a32: nativeFixedContinuationPlanHash(
        entry.continuationPlan.planId,
        continuationActions,
      ),
    }
    const longTrace = {
      ...entry,
      spec: {
        ...entry.spec,
        maxSteps: 1_000,
        continuationActions,
      },
      continuationPlan,
    } satisfies PreparedNativeRootPlanMatrix
    const oversizedOutput = Array.from({ length: 64 }, (_, index) => ({
      ...longTrace,
      spec: { ...longTrace.spec, caseId: `oversized-output-${index}` },
    }))
    expect(() => encodeNativeRootPlanMatrixBatch(oversizedOutput))
      .toThrow(/projected output bytes/u)
    expect(NATIVE_ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES).toBe(240 * 1024 * 1024)
  })

  it('caps benchmark total work while preserving the 1,000,080-operation evidence run', () => {
    const evidenceRepetitions = 8_334
    const evidence = validateNativeRootPlanMatrixBenchmark(prepared, evidenceRepetitions)
    expect(evidence.operations).toBe(1_000_080)

    const operationsPerRepetition = prepared.reduce((sum, entry) => (
      sum + entry.spec.candidates.length * entry.spec.samples.length
    ), 0)
    const tooManyRepetitions = Math.floor(
      NATIVE_ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS / operationsPerRepetition,
    ) + 1
    expect(() => encodeNativeRootPlanMatrixBenchmarkInput(prepared, tooManyRepetitions))
      .toThrow(/benchmark operations/u)
  })

  it('recomputes recipe and objective identity before TS execution or native encoding', () => {
    const entry = prepared[0]!
    const recipeDrifted = {
      ...entry,
      recipe: {
        ...entry.recipe,
        progressRequired: entry.recipe.progressRequired + 1,
      },
    } satisfies PreparedNativeRootPlanMatrix
    const objectiveDrifted = {
      ...entry,
      objective: {
        ...entry.objective,
        qualityTarget: entry.objective.qualityTarget + 1,
      },
    } satisfies PreparedNativeRootPlanMatrix

    for (const drifted of [recipeDrifted, objectiveDrifted]) {
      expect(drifted.scenarioModelContentHash).toBe(entry.scenarioModelContentHash)
      expect(() => executePreparedNativeRootPlanMatrix(drifted))
        .toThrow(/scenario model content hash mismatch/u)
      expect(() => encodeNativeRootPlanMatrixInput(drifted))
        .toThrow(/scenario model content hash mismatch/u)
    }
  })

  it('round-trips raw paired outcomes and exact scenario/profile identities', () => {
    const outcomeLines = oracleOutcomes.map(encodedOutcomeLine)
    const transitions = oracleOutcomes.reduce((sum, outcome) => sum + outcome.rollout.transitions, 0)
    const stdout = [
      ...outcomeLines,
      [
        NATIVE_ROOT_PLAN_MATRIX_VERSION,
        '__batch__',
        'summary',
        'ok',
        prepared.length,
        oracleOutcomes.length,
        transitions,
        123,
        outputFnv1a64(outcomeLines),
      ].join('\t'),
      '',
    ].join('\n')
    const parsed = parseNativeRootPlanMatrixBatchOutput(stdout)
    assertRootPlanMatrixProtocolIdentity(prepared, parsed.outcomes)
    expect(parsed.outcomes).toEqual(oracleOutcomes)
    expect(parsed.correctnessSha256).toBe(nativeRootPlanMatrixOracleSha256(prepared))
    expect(parsed.correctnessSha256).toBe(
      '9d5518bdd05686f311c3f2154f7f9c77228e937ef50681ebcafaae63d8d6e4ed',
    )
  })

  it('rejects identity drift, duplicate pairs, and missing pairs', () => {
    const correct = structuredClone(oracleOutcomes)
    const drifted = structuredClone(correct)
    drifted[0]!.scenarioModelContentHash = `sha256:${'0'.repeat(64)}`
    expect(() => assertRootPlanMatrixProtocolIdentity(prepared, drifted)).toThrow()
    expect(() => assertRootPlanMatrixProtocolIdentity(prepared, [...correct, correct[0]!])).toThrow()
    expect(() => assertRootPlanMatrixProtocolIdentity(prepared, correct.slice(1))).toThrow()
  })
})
