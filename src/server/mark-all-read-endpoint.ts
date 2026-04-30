import type { MarkAllReadResult } from '../application/inbox/mark-all-read-service'

export type MarkAllReadService = {
  markAllAsRead(): Promise<MarkAllReadResult>
}

export function createMarkAllReadEndpoint(service: MarkAllReadService) {
  return async function handleMarkAllRead(request: Pick<Request, 'method'>): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed. Use POST /api/inbox/mark-all-read.' },
        { status: 405 },
      )
    }

    try {
      const result = await service.markAllAsRead()
      return Response.json(result, { status: 200 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
