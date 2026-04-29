import type { SyncAllSourcesResult } from '../application/sync/sync-orchestrator'
import type { SourceKind } from '../domain/notification'

export type ManualSyncService = {
  runManualSync(): Promise<SyncAllSourcesResult>
  runManualSyncForSource(source: SourceKind, instanceKey: string): Promise<SyncAllSourcesResult>
}

type ManualSyncPayload = {
  source?: SourceKind
  instanceKey?: string
}

export function createManualSyncEndpoint(service: ManualSyncService) {
  return async function handleManualSync(
    request: Pick<Request, 'method'>,
    payload: ManualSyncPayload = {},
  ): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed. Use POST /api/sync/manual.' },
        { status: 405 },
      )
    }

    try {
      const result =
        payload.source && payload.instanceKey
          ? await service.runManualSyncForSource(payload.source, payload.instanceKey)
          : await service.runManualSync()
      return Response.json(result, { status: 200 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
