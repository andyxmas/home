import type { WorkColumn, WorkItem } from '../domain/work'

type WorkResponse = {
  items?: WorkItem[]
  error?: string
}

type CreateFromNotificationResponse = {
  item?: WorkItem
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
  if (!payload.item) {
    throw new Error('Created work item was not returned')
  }
  return payload.item
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

export async function clearAllWorkItems(): Promise<{ clearedWorkItems: number }> {
  const response = await fetch('/api/work/clear-all', {
    method: 'POST',
  })
  const payload = (await response.json().catch(() => ({}))) as { error?: string; clearedWorkItems?: number }
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to clear work items')
  }
  return { clearedWorkItems: payload.clearedWorkItems ?? 0 }
}

export type ShortcutWorkSyncResult = {
  totalSources: number
  succeededSources: number
  failedSources: number
  totalUpserted: number
  sources: Array<{ source: 'shortcut'; instanceKey: string; status: 'success' | 'failed'; upserted: number; error?: string }>
}

export async function syncShortcutWorkItems(instanceKey?: string): Promise<ShortcutWorkSyncResult> {
  const response = await fetch('/api/work/sync-shortcut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceKey }),
  })
  const payload = (await response.json().catch(() => ({}))) as ShortcutWorkSyncResult & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to sync work items')
  }
  return payload
}

