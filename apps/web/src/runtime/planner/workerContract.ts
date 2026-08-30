import type { PlannerAdvance, PlannerReply } from './protocol'

export type PlannerWorkerRequest =
  | { id: number; type: 'initialize' }
  | { id: number; type: 'reset-session' }
  | { id: number; type: 'recommend'; advance: PlannerAdvance; episode: string }

export type PlannerWorkerRequestWithoutId = PlannerWorkerRequest extends infer Request
  ? Request extends { id: number }
    ? Omit<Request, 'id'>
    : never
  : never

export type PlannerWorkerResponse =
  | { id: number; ok: true; type: 'initialized' | 'reset' }
  | { id: number; ok: true; type: 'recommendation'; reply: PlannerReply; elapsedMs: number }
  | { id: number; ok: false; error: string }
