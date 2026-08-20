import { prepareNativeRolloutBatch } from './rolloutBatch'
import {
  benchmarkTypeScriptRolloutBatch,
  runNativeCoreRolloutBenchmark,
  runNativeRolloutBatch,
} from './rolloutRunner'
import { prepareNativeTransitionBatch } from './transitionBatch'
import {
  benchmarkTypeScriptTransitionBatch,
  runNativeCoreTransitionBenchmark,
  runNativeTransitionBatch,
} from './nativeRunner'
import { prepareNativeRootPlanMatrix } from './rootPlanMatrix'
import {
  benchmarkTypeScriptRootPlanMatrix,
  runNativeCoreRootPlanMatrixBenchmark,
  runNativeRootPlanMatrix,
} from './rootPlanMatrixRunner'

function requireAvailable<T extends { available: boolean }>(
  result: T,
  label: string,
): asserts result is T & { available: true } {
  if (!result.available) {
    throw new Error(`${label} is unavailable: ${JSON.stringify(result)}`)
  }
}

const root = process.cwd()
const repetitions = 100
const transitionCases = prepareNativeTransitionBatch()
const transitionTypeScript = benchmarkTypeScriptTransitionBatch(transitionCases, repetitions, 2)
const transitionProtocol = runNativeTransitionBatch(root, transitionCases, 1)
const transitionCore = runNativeCoreTransitionBenchmark(root, transitionCases, repetitions)
requireAvailable(transitionProtocol, 'native transition protocol parity')
requireAvailable(transitionCore, 'native transition core parity')

if (transitionProtocol.operations !== transitionCases.length) {
  throw new Error('native transition protocol operation count mismatch')
}
if (transitionProtocol.correctnessSha256 !== transitionTypeScript.correctnessSha256) {
  throw new Error('native transition protocol SHA-256 mismatch')
}
if (
  transitionCore.operations !== transitionTypeScript.operations
  || transitionCore.fnv1a32Hex !== transitionTypeScript.fnv1a32Hex
) throw new Error('native transition core operation/hash mismatch')

const rolloutCases = prepareNativeRolloutBatch()
const rolloutTypeScript = benchmarkTypeScriptRolloutBatch(rolloutCases, repetitions, 2)
const rolloutProtocol = runNativeRolloutBatch(root, rolloutCases, 1)
const rolloutCore = runNativeCoreRolloutBenchmark(root, rolloutCases, repetitions)
requireAvailable(rolloutProtocol, 'native rollout protocol parity')
requireAvailable(rolloutCore, 'native rollout core parity')

const rolloutTransitionsPerBatch = rolloutCases.reduce((sum, entry) => (
  sum + entry.oracle.steps.length
), 0)
if (
  rolloutProtocol.operations !== rolloutCases.length
  || rolloutProtocol.transitions !== rolloutTransitionsPerBatch
) throw new Error('native rollout protocol operation/transition count mismatch')
if (rolloutProtocol.correctnessSha256 !== rolloutTypeScript.correctnessSha256) {
  throw new Error('native rollout protocol SHA-256 mismatch')
}
if (
  rolloutCore.operations !== rolloutTypeScript.operations
  || rolloutCore.transitions !== rolloutTypeScript.transitions
  || rolloutCore.fnv1a32Hex !== rolloutTypeScript.fnv1a32Hex
) throw new Error('native rollout core operation/transition/hash mismatch')

const rootPlanMatrices = prepareNativeRootPlanMatrix()
const rootPlanTypeScript = benchmarkTypeScriptRootPlanMatrix(rootPlanMatrices, repetitions, 2)
const rootPlanProtocol = runNativeRootPlanMatrix(root, rootPlanMatrices)
const rootPlanCore = runNativeCoreRootPlanMatrixBenchmark(root, rootPlanMatrices, repetitions)
requireAvailable(rootPlanProtocol, 'native fixed-continuation root-plan protocol parity')
requireAvailable(rootPlanCore, 'native fixed-continuation root-plan core parity')

const rootPlanOperationsPerBatch = rootPlanMatrices.reduce((sum, entry) => (
  sum + entry.spec.candidates.length * entry.spec.samples.length
), 0)
if (
  rootPlanProtocol.requests !== rootPlanMatrices.length
  || rootPlanProtocol.operations !== rootPlanOperationsPerBatch
) throw new Error('native root-plan protocol request/operation count mismatch')
if (rootPlanProtocol.correctnessSha256 !== rootPlanTypeScript.correctnessSha256) {
  throw new Error('native root-plan protocol SHA-256 mismatch')
}
if (
  rootPlanCore.operations !== rootPlanTypeScript.operations
  || rootPlanCore.transitions !== rootPlanTypeScript.transitions
  || rootPlanCore.fnv1a32Hex !== rootPlanTypeScript.fnv1a32Hex
) throw new Error('native root-plan core operation/transition/hash mismatch')

console.log(JSON.stringify({
  schema: 'native-parity-verification-v1',
  transition: {
    cases: transitionCases.length,
    operations: transitionCore.operations,
    correctnessSha256: transitionProtocol.correctnessSha256,
    fnv1a32Hex: transitionCore.fnv1a32Hex,
  },
  fixedActionRollout: {
    cases: rolloutCases.length,
    operations: rolloutCore.operations,
    transitions: rolloutCore.transitions,
    correctnessSha256: rolloutProtocol.correctnessSha256,
    fnv1a32Hex: rolloutCore.fnv1a32Hex,
  },
  fixedContinuationRootPlanMatrix: {
    semantics: 'multiple root actions x paired seeds; one shared fixed continuation; not adaptive guide or search',
    requests: rootPlanMatrices.length,
    operations: rootPlanCore.operations,
    transitions: rootPlanCore.transitions,
    transitionsPerOperation: rootPlanCore.transitionsPerOperation,
    correctnessSha256: rootPlanProtocol.correctnessSha256,
    fnv1a32Hex: rootPlanCore.fnv1a32Hex,
  },
}, null, 2))
