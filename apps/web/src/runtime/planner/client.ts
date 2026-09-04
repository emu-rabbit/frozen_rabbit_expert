import { readonly, shallowRef } from 'vue'
import type { PlannerAdvance, PlannerReply } from './protocol'
import type {
  PlannerWorkerRequest,
  PlannerWorkerRequestWithoutId,
  PlannerWorkerResponse,
} from './workerContract'

const MAIN_SOLVER_DEADLINE_MS = 3_000
const PLANNER_INITIALIZATION_DEADLINE_MS = 30_000

export type PlannerRuntimeStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PendingRequest {
  resolve: (response: PlannerWorkerResponse) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export class PlannerRuntime {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private initialization: Promise<void> | null = null
  private readonly mutableStatus = shallowRef<PlannerRuntimeStatus>('idle')
  private readonly mutableError = shallowRef<string | null>(null)

  readonly status = readonly(this.mutableStatus)
  readonly error = readonly(this.mutableError)

  async initialize(): Promise<void> {
    if (this.mutableStatus.value === 'ready') return
    if (this.initialization) return this.initialization
    this.mutableStatus.value = 'loading'
    this.mutableError.value = null
    this.initialization = this.send(
      { type: 'initialize' },
      PLANNER_INITIALIZATION_DEADLINE_MS,
      'Planner initialization',
    )
      .then(() => {
        this.mutableStatus.value = 'ready'
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.mutableStatus.value = 'error'
        this.mutableError.value = message
        throw error
      })
      .finally(() => {
        this.initialization = null
      })
    return this.initialization
  }

  async recommend(advance: PlannerAdvance, episode: string): Promise<PlannerReply> {
    await this.initialize()
    const response = await this.send({ type: 'recommend', advance, episode })
    if (!response.ok || response.type !== 'recommendation') {
      throw new Error(response.ok ? 'Planner worker returned an unexpected response' : response.error)
    }
    return response.reply
  }

  async resetSession(): Promise<void> {
    await this.initialize()
    const response = await this.send({ type: 'reset-session' })
    if (!response.ok || response.type !== 'reset') {
      throw new Error(response.ok ? 'Planner worker returned an unexpected response' : response.error)
    }
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId)
      pending.reject(new Error('Planner Worker was disposed'))
    }
    this.pending.clear()
    this.mutableStatus.value = 'idle'
  }

  private createWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PlannerWorkerResponse>) => {
      const pending = this.pending.get(event.data.id)
      if (!pending) return
      clearTimeout(pending.timeoutId)
      this.pending.delete(event.data.id)
      if (event.data.ok) pending.resolve(event.data)
      else pending.reject(new Error(event.data.error))
    }
    worker.onerror = (event) => {
      this.failClosed(new Error(event.message || 'Planner Worker failed'))
    }
    this.worker = worker
    return worker
  }

  private send(
    request: PlannerWorkerRequestWithoutId,
    deadlineMs = MAIN_SOLVER_DEADLINE_MS,
    operation = 'Main solver',
  ): Promise<PlannerWorkerResponse> {
    const worker = this.createWorker()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${operation} exceeded its ${deadlineMs}ms deadline`))
        this.failClosed(new Error('Planner Worker was terminated after a deadline overrun'))
      }, deadlineMs)
      this.pending.set(id, { resolve, reject, timeoutId })
      worker.postMessage({ ...request, id } as PlannerWorkerRequest)
    })
  }

  private failClosed(error: Error): void {
    this.worker?.terminate()
    this.worker = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
    }
    this.pending.clear()
    this.mutableStatus.value = 'error'
    this.mutableError.value = error.message
  }
}

export const plannerRuntime = new PlannerRuntime()
