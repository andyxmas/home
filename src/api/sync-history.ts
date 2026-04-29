import type { SourceKind } from '../domain/notification'

export type SyncHistoryEntry = {
  runId: string
  source: SourceKind
  instanceKey: string
  status: 'running' | 'success' | 'failed'
  startedAt: string
  finishedAt?: string
  fetchedCount: number
  upsertedCount: number
  archivedCount: number
  errorMessage?: string
  sinceUsed?: string
}

type SyncHistoryResponse = {
  history?: SyncHistoryEntry[]
  error?: string
}

export async function listSyncHistory(params?: {
  source?: SourceKind
  instanceKey?: string
  limit?: number
}): Promise<SyncHistoryEntry[]> {
  const query = new URLSearchParams()
  if (params?.source) {
    query.set('source', params.source)
  }
  if (params?.instanceKey) {
    query.set('instanceKey', params.instanceKey)
  }
  if (typeof params?.limit === 'number') {
    query.set('limit', String(params.limit))
  }

  const querySuffix = query.size > 0 ? `?${query.toString()}` : ''
  const response = await fetch(`/api/sync/history${querySuffix}`)
  const payload = (await response.json().catch(() => ({}))) as SyncHistoryResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load sync history')
  }
  return payload.history ?? []
}
