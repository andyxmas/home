import type { SyncAllSourcesResult } from '../application/sync/sync-orchestrator'
import type { SourceKind } from '../domain/notification'

type ErrorPayload = {
  error?: string
}

export type ManualSyncResult = SyncAllSourcesResult & {
  workSync?: {
    totalSources: number
    succeededSources: number
    failedSources: number
    totalUpserted: number
    sources: Array<{ source: 'shortcut'; instanceKey: string; status: 'success' | 'failed'; upserted: number; error?: string }>
  }
}

export async function triggerManualSync(): Promise<ManualSyncResult> {
  const response = await fetch('/api/sync/manual', {
    method: 'POST',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload
    throw new Error(payload.error ?? 'Manual sync failed')
  }

  return (await response.json()) as ManualSyncResult
}

export async function triggerSourceManualSync(
  source: SourceKind,
  instanceKey: string,
): Promise<ManualSyncResult> {
  const response = await fetch('/api/sync/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, instanceKey }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload
    throw new Error(payload.error ?? 'Source sync failed')
  }

  return (await response.json()) as ManualSyncResult
}

export async function triggerReplaySync(): Promise<SyncAllSourcesResult> {
  const response = await fetch('/api/sync/replay', {
    method: 'POST',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload
    throw new Error(payload.error ?? 'Replay sync failed')
  }

  return (await response.json()) as SyncAllSourcesResult
}

export async function triggerSourceReplaySync(
  source: SourceKind,
  instanceKey: string,
): Promise<SyncAllSourcesResult> {
  const response = await fetch('/api/sync/replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, instanceKey }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload
    throw new Error(payload.error ?? 'Source replay failed')
  }

  return (await response.json()) as SyncAllSourcesResult
}
