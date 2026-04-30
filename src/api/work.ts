import type { WorkColumn, WorkItem } from '../domain/work'

type WorkResponse = {
  items?: WorkItem[]
  error?: string
}

type CreateFromNotificationResponse = {
  workItemId?: string
  error?: string
}

export async function listWorkItems(): Promise<WorkItem[]> {
  const response = await fetch('/api/work')
  const payload = (await response.json().catch(() => ({}))) as WorkResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load work items')
  }
  return payload.items ?? []
}

export async function createWorkFromNotification(notificationId: string): Promise<WorkItem> {
  const response = await fetch('/api/work/from-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId }),
  })
  const payload = (await response.json().catch(() => ({}))) as CreateFromNotificationResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to create work item')
  }
  if (!payload.workItemId) {
    throw new Error('workItemId was not returned')
  }

  const items = await listWorkItems()
  const created = items.find((item) => item.id === payload.workItemId)
  if (!created) {
    throw new Error('Created work item not found after refresh')
  }
  return created
}

export async function moveWorkItem(input: { id: string; column: WorkColumn; position: number }): Promise<void> {
  const response = await fetch(`/api/work/${encodeURIComponent(input.id)}/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column: input.column, position: input.position }),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'Failed to move work item')
  }
}

export async function reorderWorkColumn(input: { column: WorkColumn; orderedIds: string[] }): Promise<void> {
  const response = await fetch('/api/work/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'Failed to reorder work column')
  }
}

