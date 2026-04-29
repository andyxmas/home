import type { SourceKind } from '../domain/notification'

export type InboxItem = {
  id: string
  source: SourceKind
  projectId?: string
  projectName?: string
  fromPersonId?: string
  fromPersonName?: string
  title: string
  body?: string
  url?: string
  authorName?: string
  occurredAt: string
  isRead: boolean
  readAt?: string
}

type InboxResponse = {
  items?: InboxItem[]
  clearedNotifications?: number
  clearedReadStates?: number
  clearedSyncHistory?: number
  resetWatermarks?: number
  error?: string
}

export type ClearInboxResult = {
  clearedNotifications: number
  clearedReadStates: number
  clearedSyncHistory: number
  resetWatermarks: number
}

export async function listInboxItems(): Promise<InboxItem[]> {
  const response = await fetch('/api/inbox')
  const payload = (await response.json().catch(() => ({}))) as InboxResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load inbox')
  }
  return payload.items ?? []
}

export async function setInboxReadState(notificationId: string, isRead: boolean): Promise<void> {
  const response = await fetch(`/api/inbox/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as InboxResponse
    throw new Error(payload.error ?? 'Failed to update read state')
  }
}

export async function clearAllInboxItems(): Promise<ClearInboxResult> {
  const response = await fetch('/api/inbox/clear-all', {
    method: 'POST',
  })
  const payload = (await response.json().catch(() => ({}))) as InboxResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to clear inbox')
  }

  return {
    clearedNotifications: payload.clearedNotifications ?? 0,
    clearedReadStates: payload.clearedReadStates ?? 0,
    clearedSyncHistory: payload.clearedSyncHistory ?? 0,
    resetWatermarks: payload.resetWatermarks ?? 0,
  }
}
