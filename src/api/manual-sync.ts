import type { SyncAllSourcesResult } from '../application/sync/sync-orchestrator'
import type { SourceKind } from '../domain/notification'

type ErrorPayload = {
  error?: string
}

export async function triggerManualSync(): Promise<SyncAllSourcesResult> {
  const response = await fetch('/api/sync/manual', {
    method: 'POST',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload
    throw new Error(payload.error ?? 'Manual sync failed')
  }

  return (await response.json()) as SyncAllSourcesResult
}

export async function triggerSourceManualSync(
  source: SourceKind,
  instanceKey: string,
): Promise<SyncAllSourcesResult> {
  const response = await fetch('/api/sync/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, instanceKey }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload
    throw new Error(payload.error ?? 'Source sync failed')
  }

  return (await response.json()) as SyncAllSourcesResult
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
