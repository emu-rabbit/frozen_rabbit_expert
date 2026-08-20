import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const temporaryRoot = path.join(root, '.tmp')
mkdirSync(temporaryRoot, { recursive: true })
const buildDirectory = mkdtempSync(path.join(temporaryRoot, 'native-parity-'))
const output = path.join(buildDirectory, 'verify.mjs')

try {
  const build = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
    path.join(root, 'tools', 'native-parity', 'verify.ts'),
    '--file', output,
    '--format', 'esm',
    '--platform', 'node',
  ], { cwd: root, encoding: 'utf8' })
  if (build.stdout.length > 0) process.stderr.write(build.stdout)
  if (build.stderr.length > 0) process.stderr.write(build.stderr)
  if (build.status !== 0) throw new Error(`native parity bundle failed with status ${build.status}`)

  const run = spawnSync(process.execPath, [output], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`native parity verification failed with status ${run.status}`)
} finally {
  const relativeBuildDirectory = path.relative(temporaryRoot, buildDirectory)
  if (
    relativeBuildDirectory.length === 0
    || relativeBuildDirectory.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeBuildDirectory)
  ) throw new Error(`refusing to remove native parity directory outside .tmp: ${buildDirectory}`)
  rmSync(buildDirectory, { recursive: true, force: true })
}
