import type { CanonicalNotification, SourceConfig } from '../../domain/notification'
import type { SourceAdapter } from '../../domain/source-adapter'
import { AdapterConfigError } from './adapter-errors'
import { requestJson } from './http'

type FetchLike = typeof fetch

type GitHubNotificationItem = {
  id: string
  reason?: string
  unread?: boolean
  updated_at?: string
  last_read_at?: string
  repository?: {
    full_name?: string
    html_url?: string
  }
  subject?: {
    title?: string
    type?: string
    url?: string
    latest_comment_url?: string
  }
}

type CreateGitHubAdapterOptions = {
  fetchImpl?: FetchLike
}

function requireGithubToken(config: SourceConfig): string {
  if (config.credentials.authMode !== 'token') {
    throw new AdapterConfigError('github', 'Only token auth is supported in v1.')
  }

  const token = config.credentials.token?.value?.trim()
  if (!token) {
    throw new AdapterConfigError('github', 'Missing required token value.')
  }
  return token
}

function nextPageFromLinkHeader(linkHeader: string | null): number | undefined {
  if (!linkHeader) {
    return undefined
  }

  const nextMatch = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/i)
  if (!nextMatch) {
    return undefined
  }

  const page = Number.parseInt(nextMatch[1], 10)
  return Number.isFinite(page) ? page : undefined
}

function mapGitHubNotification(item: GitHubNotificationItem, now: Date): CanonicalNotification | undefined {
  if (!item.id) {
    return undefined
  }

  const title =
    item.subject?.title ?? `${item.repository?.full_name ?? 'GitHub'} notification`
  const occurredAt = item.updated_at ?? item.last_read_at ?? now.toISOString()

  return {
    id: crypto.randomUUID(),
    source: 'github',
    externalId: item.id,
    dedupeKey: `github:${item.id}`,
    title,
    body: item.reason ? `Reason: ${item.reason}` : undefined,
    url: item.subject?.url ?? item.subject?.latest_comment_url ?? item.repository?.html_url,
    occurredAt,
    payload: {
      reason: item.reason,
      unread: item.unread,
      subjectType: item.subject?.type,
      repository: item.repository?.full_name,
    },
  }
}

export function createGitHubAdapter(options: CreateGitHubAdapterOptions = {}): SourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    source: 'github',
    async fetchNotifications(config, input) {
      const token = requireGithubToken(config)
      const settings = config.credentials.service?.github
      const baseUrl = settings?.apiBaseUrl?.trim() || 'https://api.github.com'
      const page = Number.parseInt(input.cursor?.cursor ?? '1', 10)
      const now = new Date()

      const notificationsUrl = new URL('/notifications', baseUrl)
      notificationsUrl.searchParams.set('per_page', '50')
      notificationsUrl.searchParams.set('page', Number.isFinite(page) && page > 0 ? String(page) : '1')
      notificationsUrl.searchParams.set('participating', String(settings?.participating ?? false))
      if (input.since) {
        notificationsUrl.searchParams.set('since', input.since)
      }

      const { data: items, response } = await requestJson<GitHubNotificationItem[]>({
        source: 'github',
        fetchImpl,
        url: notificationsUrl,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })

      const notifications = items
        .map((item) => mapGitHubNotification(item, now))
        .filter((item): item is CanonicalNotification => Boolean(item))

      const nextPage = nextPageFromLinkHeader(response.headers.get('link'))
      return {
        notifications,
        nextCursor: nextPage ? { cursor: String(nextPage) } : undefined,
      }
    },
  }
}
