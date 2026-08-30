import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const toolDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(toolDirectory, '..', '..')
const manifest = path.join(repositoryRoot, 'native', 'craft-kernel-web', 'Cargo.toml')
const targetDirectory = path.join(repositoryRoot, '.tmp', 'web-wasm-target')
const source = path.join(targetDirectory, 'wasm32-unknown-unknown', 'release', 'frozen_rabbit_craft_kernel_web.wasm')
const outputDirectory = path.join(repositoryRoot, 'apps', 'web', 'src', 'runtime', 'wasm')
const output = path.join(outputDirectory, 'frozen_rabbit_craft_kernel_web.wasm')

const windowsCargo = path.join(os.homedir(), '.cargo', 'bin', 'cargo.exe')
const cargo = process.env.CARGO || (process.platform === 'win32' && existsSync(windowsCargo) ? windowsCargo : 'cargo')
const build = spawnSync(cargo, [
  'build',
  '--manifest-path', manifest,
  '--target', 'wasm32-unknown-unknown',
  '--release',
  '--target-dir', targetDirectory,
], {
  cwd: repositoryRoot,
  stdio: 'inherit',
  windowsHide: true,
})

if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status ?? 1)
if (!existsSync(source)) throw new Error(`Rust build did not produce ${source}`)

mkdirSync(outputDirectory, { recursive: true })
copyFileSync(source, output)
console.log(`Prepared ${path.relative(repositoryRoot, output)}`)
