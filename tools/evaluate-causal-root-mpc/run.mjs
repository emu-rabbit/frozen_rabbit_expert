import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const temporaryRoot = path.resolve(root, '.tmp')
mkdirSync(temporaryRoot, { recursive: true })
const buildDirectory = mkdtempSync(path.join(temporaryRoot, 'evaluate-causal-root-mpc-'))
const output = path.join(buildDirectory, 'cli.mjs')

try {
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
    path.join(root, 'tools', 'evaluate-causal-root-mpc', 'cli.ts'),
    '--file', output,
    '--format', 'esm',
    '--platform', 'node',
  ], { cwd: root, encoding: 'utf8' })
  if (result.stdout.length > 0) process.stderr.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  if (result.status !== 0) process.exitCode = result.status ?? 1
  else await import(`${pathToFileURL(output).href}?built=${Date.now()}`)
} finally {
  const relativeBuildDirectory = path.relative(temporaryRoot, buildDirectory)
  if (
    relativeBuildDirectory.length === 0
    || relativeBuildDirectory.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeBuildDirectory)
  ) throw new Error(`refusing to remove causal evaluator directory outside .tmp: ${buildDirectory}`)
  rmSync(buildDirectory, { recursive: true, force: true })
}
