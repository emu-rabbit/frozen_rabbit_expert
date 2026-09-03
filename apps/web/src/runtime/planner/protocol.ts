export const WEB_PLANNER_ABI = 'rust-web-planner-abi-v1'
export const WEB_PLANNER_POLICY = 'generic-craft-external-reference-v2.1.0'
export const WEB_PLANNER_MAX_INPUT_BYTES = 64 * 1024

export type PlannerAdvance =
  | { mode: 'reset' }
  | { mode: 'continue' | 'deviate'; action: string }

export interface PlannerReply {
  action: string | null
  option: string | null
  persona: string | null
  policyVersion: typeof WEB_PLANNER_POLICY
  contextFingerprint: string
}

const optionalCell = (cell: string) => cell === '-' ? null : cell

export function serializePlannerRequest(advance: PlannerAdvance, episode: string): string {
  const trimmedEpisode = episode.trimEnd()
  if (!trimmedEpisode || /[\r\n]/u.test(trimmedEpisode)) {
    throw new Error('Planner episode must contain exactly one non-empty TSV row')
  }

  const cells = trimmedEpisode.split('\t')
  if (cells[3] !== WEB_PLANNER_POLICY) {
    throw new Error(`Planner episode must use ${WEB_PLANNER_POLICY}`)
  }

  const advanceCell = advance.mode === 'reset'
    ? 'reset'
    : `${advance.mode}:${advance.action}`
  const request = `${advanceCell}\t${trimmedEpisode}`
  if (new TextEncoder().encode(request).byteLength > WEB_PLANNER_MAX_INPUT_BYTES) {
    throw new Error('Planner request exceeds the Rust ABI input limit')
  }
  return request
}

export function parsePlannerReply(row: string): PlannerReply {
  const cells = row.trimEnd().split('\t')
  if (cells[0] !== WEB_PLANNER_ABI) {
    throw new Error(`Unexpected Web planner ABI: ${cells[0] ?? 'missing'}`)
  }
  if (cells[1] === 'error') {
    throw new Error(cells[2] || 'Rust Web planner returned an unspecified error')
  }
  if (cells.length !== 7 || cells[1] !== 'ok') {
    throw new Error('Rust Web planner returned an invalid reply')
  }
  if (cells[2] !== WEB_PLANNER_POLICY) {
    throw new Error(`Unexpected solver policy: ${cells[2]}`)
  }

  return {
    policyVersion: WEB_PLANNER_POLICY,
    action: optionalCell(cells[3] ?? '-'),
    option: optionalCell(cells[4] ?? '-'),
    persona: optionalCell(cells[5] ?? '-'),
    contextFingerprint: cells[6] ?? '',
  }
}
