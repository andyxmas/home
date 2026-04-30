import type { SyncAllSourcesResult } from '../application/sync/sync-orchestrator'
import type { SourceKind } from '../domain/notification'

export type ReplaySyncService = {
  runReplaySync(): Promise<SyncAllSourcesResult>
  runReplaySyncForSource(source: SourceKind, instanceKey: string): Promise<SyncAllSourcesResult>
}

type ReplaySyncPayload = {
  source?: SourceKind
  instanceKey?: string
}

export function createReplaySyncEndpoint(service: ReplaySyncService) {
  return async function handleReplaySync(
    request: Pick<Request, 'method'>,
    payload: ReplaySyncPayload = {},
  ): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed. Use POST /api/sync/replay.' },
        { status: 405 },
      )
    }

    try {
      const result =
        payload.source && payload.instanceKey
          ? await service.runReplaySyncForSource(payload.source, payload.instanceKey)
          : await service.runReplaySync()
      return Response.json(result, { status: 200 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
