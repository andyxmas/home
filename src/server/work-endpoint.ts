import type { WorkColumn, WorkItem } from '../domain/work'

export type WorkService = {
  listWorkItems(): Promise<WorkItem[]>
  createWorkFromNotification(input: { notificationId: string }): Promise<WorkItem>
  moveWorkItem(input: { id: string; column: WorkColumn; position: number }): Promise<void>
  reorderWorkColumn(input: { column: WorkColumn; orderedIds: string[] }): Promise<void>
}

type CreateFromNotificationPayload = {
  notificationId?: string
}

type MoveWorkPayload = {
  column?: WorkColumn
  position?: number
}

type ReorderWorkPayload = {
  column?: WorkColumn
  orderedIds?: string[]
}

function validateColumn(value: unknown): WorkColumn | null {
  if (value === 'today' || value === 'soon' || value === 'later') {
    return value
  }
  return null
}

async function readPayload<T>(request: Pick<Request, 'text'>): Promise<T> {
  const text = await request.text()
  if (!text.trim()) {
    return {} as T
  }
  return JSON.parse(text) as T
}

export function createWorkEndpoint(service: WorkService) {
  return async function handleWorkEndpoint(request: Pick<Request, 'method' | 'url' | 'text'>) {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === '/api/work' && request.method === 'GET') {
      const items = await service.listWorkItems()
      return Response.json({ items }, { status: 200 })
    }

    if (pathname === '/api/work/from-notification' && request.method === 'POST') {
      const payload = await readPayload<CreateFromNotificationPayload>(request)
      const notificationId = payload.notificationId?.trim()
      if (!notificationId) {
        return Response.json({ error: 'notificationId is required.' }, { status: 400 })
      }
      const item = await service.createWorkFromNotification({ notificationId })
      return Response.json({ ok: true, item }, { status: 200 })
    }

    if (pathname.startsWith('/api/work/') && pathname.endsWith('/move') && request.method === 'PATCH') {
      const workItemId = decodeURIComponent(pathname.replace('/api/work/', '').replace('/move', '').trim())
      if (!workItemId) {
        return Response.json({ error: 'Missing work item ID in URL.' }, { status: 400 })
      }

      const payload = await readPayload<MoveWorkPayload>(request)
      const column = validateColumn(payload.column)
      if (!column) {
        return Response.json({ error: 'column must be one of: today, soon, later.' }, { status: 400 })
      }
      const position = payload.position
      if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) {
        return Response.json({ error: 'position must be a non-negative number.' }, { status: 400 })
      }
      await service.moveWorkItem({ id: workItemId, column, position })
      return Response.json({ ok: true }, { status: 200 })
    }

    if (pathname === '/api/work/reorder' && request.method === 'PATCH') {
      const payload = await readPayload<ReorderWorkPayload>(request)
      const column = validateColumn(payload.column)
      if (!column) {
        return Response.json({ error: 'column must be one of: today, soon, later.' }, { status: 400 })
      }
      if (!Array.isArray(payload.orderedIds) || payload.orderedIds.some((id) => typeof id !== 'string')) {
        return Response.json({ error: 'orderedIds must be an array of strings.' }, { status: 400 })
      }
      const orderedIds = payload.orderedIds.map((id) => id.trim()).filter(Boolean)
      await service.reorderWorkColumn({ column, orderedIds })
      return Response.json({ ok: true }, { status: 200 })
    }

    return Response.json({ error: 'Work endpoint route not found.' }, { status: 404 })
  }
}

