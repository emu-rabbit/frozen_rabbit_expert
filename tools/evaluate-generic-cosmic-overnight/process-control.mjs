import { spawn } from 'node:child_process'
import path from 'node:path'

// Every evaluator owns a process group on POSIX. Windows taskkill follows the
// child tree, including the synchronous Rust process inside the Node evaluator.
export const evaluatorDetached = process.platform !== 'win32'

export async function terminateEvaluatorTree(child, signal = 'SIGTERM') {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
    throw new Error('evaluator termination requires a positive spawned PID')
  }
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
    return
  }
  const executable = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
  await new Promise((resolve, reject) => {
    const terminator = spawn(executable, ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    terminator.once('error', reject)
    terminator.once('close', (code) => {
      if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve()
      else reject(new Error(`taskkill could not terminate evaluator tree ${child.pid}: ${code}`))
    })
  })
}
