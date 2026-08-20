import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const output = path.join(root, '.tmp', `research-command-brew-single-good-substitutions-${process.pid}.mjs`)
mkdirSync(path.dirname(output), { recursive: true })
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
  path.join(root, 'tools', 'research-command-brew-single-good-substitutions', 'index.ts'),
  '--file', output,
  '--format', 'esm',
  '--platform', 'node',
], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
if (result.status !== 0) process.exit(result.status ?? 1)
await import(`${pathToFileURL(output).href}?built=${Date.now()}`)
