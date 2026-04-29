import type { CanonicalNotification, SourceConfig } from '../../domain/notification'
import type { SourceAdapter } from '../../domain/source-adapter'
import { AdapterConfigError } from './adapter-errors'
import { requestJson } from './http'

type FetchLike = typeof fetch

type ShortcutNotificationItem = {
  id?: number | string
  type?: string
  entity_type?: string
  mention?: boolean
  created_at?: string
  updated_at?: string
  text?: string
  comment_text?: string
  story_name?: string
  app_url?: string
  entity_url?: string
  author?: {
    name?: string
  }
}

type ShortcutNotificationsResponse = {
  data?: ShortcutNotificationItem[]
  notifications?: ShortcutNotificationItem[]
  next_page_token?: string
}

type CreateShortcutAdapterOptions = {
  fetchImpl?: FetchLike
}

function requireShortcutToken(config: SourceConfig): string {
  if (config.credentials.authMode !== 'token') {
    throw new AdapterConfigError('shortcut', 'Only token auth is supported in v1.')
  }

  const token = config.credentials.token?.value?.trim()
  if (!token) {
    throw new AdapterConfigError('shortcut', 'Missing required token value.')
  }
  return token
}

function requireShortcutBaseUrl(config: SourceConfig): string {
  const baseUrl = config.credentials.service?.shortcut?.apiBaseUrl?.trim()
  if (!baseUrl) {
    throw new AdapterConfigError(
      'shortcut',
      'Missing required config: service.shortcut.apiBaseUrl.',
    )
  }

  return baseUrl
}

function isCommentMention(item: ShortcutNotificationItem): boolean {
  const type = item.type?.toLowerCase() ?? ''
  const entityType = item.entity_type?.toLowerCase() ?? ''
  if (entityType !== 'comment') {
    return false
  }

  if (item.mention === true) {
    return true
  }

  return type.includes('mention')
}

function mapShortcutNotification(
  item: ShortcutNotificationItem,
  fallbackNow: Date,
): CanonicalNotification | undefined {
  const id = item.id
  if (id === undefined || id === null) {
    return undefined
  }

  const externalId = String(id)
  const body = item.comment_text ?? item.text
  const occurredAt = item.updated_at ?? item.created_at ?? fallbackNow.toISOString()

  return {
    id: crypto.randomUUID(),
    source: 'shortcut',
    externalId,
    dedupeKey: `shortcut:${externalId}`,
    title: item.story_name ? `Comment mention on ${item.story_name}` : 'Shortcut comment mention',
    body: body || undefined,
    url: item.app_url ?? item.entity_url,
    authorName: item.author?.name,
    occurredAt,
    payload: {
      type: item.type,
      entityType: item.entity_type,
      mention: item.mention,
      storyName: item.story_name,
    },
  }
}

export function createShortcutAdapter(options: CreateShortcutAdapterOptions = {}): SourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    source: 'shortcut',
    async fetchNotifications(config, input) {
      const token = requireShortcutToken(config)
      const baseUrl = requireShortcutBaseUrl(config)
      const now = new Date()

      const notificationsUrl = new URL('/api/v3/notifications', baseUrl)
      notificationsUrl.searchParams.set('page_size', '50')
      if (input.cursor?.cursor) {
        notificationsUrl.searchParams.set('page_token', input.cursor.cursor)
      }

      const { data: responseBody } = await requestJson<ShortcutNotificationsResponse>({
        source: 'shortcut',
        fetchImpl,
        url: notificationsUrl,
        headers: {
          Accept: 'application/json',
          'Shortcut-Token': token,
        },
      })

      const rows = responseBody.data ?? responseBody.notifications ?? []
      const notifications = rows
        .filter((item) => isCommentMention(item))
        .map((item) => mapShortcutNotification(item, now))
        .filter((item): item is CanonicalNotification => Boolean(item))

      const nextPageToken = responseBody.next_page_token?.trim()
      return {
        notifications,
        nextCursor: nextPageToken ? { cursor: nextPageToken } : undefined,
      }
    },
  }
}
