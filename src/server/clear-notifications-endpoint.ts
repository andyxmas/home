import type { ClearAllNotificationsResult } from '../application/inbox/clear-notifications-service'

export type ClearNotificationsService = {
  clearAllNotifications(): Promise<ClearAllNotificationsResult>
}

export function createClearNotificationsEndpoint(service: ClearNotificationsService) {
  return async function handleClearNotifications(
    request: Pick<Request, 'method'>,
  ): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed. Use POST /api/inbox/clear-all.' },
        { status: 405 },
      )
    }

    try {
      const result = await service.clearAllNotifications()
      return Response.json(result, { status: 200 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
