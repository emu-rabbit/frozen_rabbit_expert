import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const gitSafeDirectory = root.replaceAll('\\', '/')
const temporaryRoot = path.join(root, '.tmp')
mkdirSync(temporaryRoot, { recursive: true })
const buildDirectory = mkdtempSync(path.join(temporaryRoot, 'benchmark-kernels-'))
const output = path.join(buildDirectory, 'benchmark-kernels.mjs')

try {
  const build = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
    path.join(root, 'tools', 'benchmark-kernels', 'index.ts'),
    '--file', output,
    '--format', 'esm',
    '--platform', 'node',
  ], { cwd: root, stdio: 'inherit' })
  if (build.status !== 0) throw new Error(`benchmark bundle build failed with status ${build.status}`)

  const gitCommit = spawnSync('git', [
    '-c',
    `safe.directory=${gitSafeDirectory}`,
    'rev-parse',
    'HEAD',
  ], { cwd: root, encoding: 'utf8' })
  const gitStatus = spawnSync('git', [
    '-c',
    `safe.directory=${gitSafeDirectory}`,
    'status',
    '--porcelain',
  ], { cwd: root, encoding: 'utf8' })
  const bundleSha256 = createHash('sha256').update(readFileSync(output)).digest('hex')
  const run = spawnSync(process.execPath, [output, ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      FROZEN_RABBIT_BENCHMARK_BUNDLE_SHA256: bundleSha256,
      FROZEN_RABBIT_BENCHMARK_GIT_COMMIT: gitCommit.status === 0
        ? gitCommit.stdout.trim()
        : 'unknown',
      FROZEN_RABBIT_BENCHMARK_GIT_DIRTY: gitStatus.status === 0
        ? String(gitStatus.stdout.trim().length > 0)
        : 'unknown',
    },
  })
  if (run.status !== 0) throw new Error(`benchmark process failed with status ${run.status}`)
} finally {
  const relativeBuildDirectory = path.relative(temporaryRoot, buildDirectory)
  if (
    relativeBuildDirectory.length === 0
    || relativeBuildDirectory.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeBuildDirectory)
  ) throw new Error(`refusing to remove benchmark directory outside .tmp: ${buildDirectory}`)
  rmSync(buildDirectory, { recursive: true, force: true })
}
