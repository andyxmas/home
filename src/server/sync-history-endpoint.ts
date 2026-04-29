import type { SourceKind } from '../domain/notification'

export type SyncHistoryService = {
  listSyncHistory(filters?: {
    source?: SourceKind
    instanceKey?: string
    limit?: number
  }): Promise<unknown[]>
}

function asSourceKind(value: string | null): SourceKind | undefined {
  if (value === 'slack' || value === 'github' || value === 'shortcut') {
    return value
  }
  return undefined
}

export function createSyncHistoryEndpoint(service: SyncHistoryService) {
  return async function handleSyncHistory(request: Pick<Request, 'method' | 'url'>): Promise<Response> {
    if (request.method !== 'GET') {
      return Response.json(
        { error: 'Method not allowed. Use GET /api/sync/history.' },
        { status: 405 },
      )
    }

    const url = new URL(request.url)
    const source = asSourceKind(url.searchParams.get('source'))
    const instanceKey = url.searchParams.get('instanceKey')?.trim() || undefined
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined

    const history = await service.listSyncHistory({
      source,
      instanceKey,
      limit,
    })
    return Response.json({ history }, { status: 200 })
  }
}
