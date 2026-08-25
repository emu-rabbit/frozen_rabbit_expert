import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const output = path.join(root, '.tmp', 'evaluate-native-generic-cosmic.mjs')
mkdirSync(path.dirname(output), { recursive: true })
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
  path.join(root, 'tools', 'evaluate-native-generic-cosmic', 'index.ts'),
  '--file', output,
  '--format', 'esm',
  '--platform', 'node',
], { cwd: root, stdio: 'inherit', windowsHide: true })
if (result.status !== 0) process.exit(result.status ?? 1)
await import(`${pathToFileURL(output).href}?built=${Date.now()}`)
