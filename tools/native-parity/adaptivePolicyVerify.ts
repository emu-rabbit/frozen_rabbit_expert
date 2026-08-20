import { prepareNativeAdaptivePolicyMatrix } from './adaptivePolicyMatrix'
import { runNativeAdaptivePolicyMatrix } from './adaptivePolicyMatrixRunner'

const prepared = prepareNativeAdaptivePolicyMatrix()
const result = runNativeAdaptivePolicyMatrix(process.cwd(), prepared)
if (!result.available) {
  throw new Error(`native adaptive-policy parity is unavailable: ${JSON.stringify(result)}`)
}
if (result.cases !== prepared.cases.length) {
  throw new Error(`native adaptive-policy case count mismatch: ${result.cases}`)
}

console.log(JSON.stringify({
  schema: 'native-adaptive-policy-parity-checkpoint-v1',
  semantics: 'generic prepared adaptive-policy interpreter; mechanics and raw outcomes only; no promotion authority',
  programContentHash: prepared.program.contentHash,
  scenarioModelIdentityVersion: prepared.program.scenarioModelIdentityVersion,
  scenarioModelContentHash: prepared.program.scenarioModelContentHash,
  featureSchemaVersion: prepared.program.featureSchemaVersion,
  safetyVersion: prepared.program.safetyVersion,
  cases: result.cases,
  transitions: result.transitions,
  correctnessSha256: result.correctnessSha256,
  structuredFnv1a32Hex: result.structuredFnv1a32Hex,
  outputFnv1a64Hex: result.outputFnv1a64Hex,
  rustKernelMs: result.rustKernelMs,
  processBoundaryMs: result.processBoundaryMs,
}, null, 2))
