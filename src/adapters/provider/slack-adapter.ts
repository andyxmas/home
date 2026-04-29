import type { CanonicalNotification, SourceConfig } from '../../domain/notification'
import type { SourceAdapter } from '../../domain/source-adapter'
import { AdapterConfigError, AdapterRequestError } from './adapter-errors'
import { requestJson } from './http'

type FetchLike = typeof fetch

type SlackConversationsResponse = {
  ok: boolean
  error?: string
  channels?: Array<{ id: string; name?: string; is_im?: boolean }>
  response_metadata?: {
    next_cursor?: string
  }
}

type SlackHistoryResponse = {
  ok: boolean
  error?: string
  messages?: Array<{
    ts?: string
    text?: string
    user?: string
    subtype?: string
  }>
}

type CreateSlackAdapterOptions = {
  fetchImpl?: FetchLike
}

function requireSlackToken(config: SourceConfig): string {
  if (config.credentials.authMode !== 'token') {
    throw new AdapterConfigError('slack', 'Only token auth is supported in v1.')
  }

  const token = config.credentials.token?.value?.trim()
  if (!token) {
    throw new AdapterConfigError('slack', 'Missing required token value.')
  }
  return token
}

function requireUserId(config: SourceConfig): string {
  const userId = config.credentials.service?.slack?.userId?.trim()
  if (!userId) {
    throw new AdapterConfigError('slack', 'Missing required config: service.slack.userId.')
  }
  return userId
}

function slackTimestampToIso(ts: string | undefined, fallback: Date): string {
  if (!ts) {
    return fallback.toISOString()
  }

  const parsedSeconds = Number.parseFloat(ts)
  if (!Number.isFinite(parsedSeconds)) {
    return fallback.toISOString()
  }

  return new Date(parsedSeconds * 1000).toISOString()
}

function buildSlackUrl(workspaceUrl: string | undefined, channelId: string, ts: string): string | undefined {
  if (!workspaceUrl) {
    return undefined
  }

  const trimmedWorkspace = workspaceUrl.replace(/\/+$/, '')
  return `${trimmedWorkspace}/archives/${channelId}/p${ts.replace('.', '')}`
}

function mapSlackMessage(input: {
  channelId: string
  channelName?: string
  isIm: boolean
  message: NonNullable<SlackHistoryResponse['messages']>[number]
  workspaceUrl?: string
  fallbackNow: Date
}): CanonicalNotification | undefined {
  const { channelId, channelName, isIm, message, workspaceUrl, fallbackNow } = input
  const ts = message.ts
  if (!ts) {
    return undefined
  }

  const text = message.text ?? ''
  const externalId = `${channelId}:${ts}`
  const title = isIm
    ? `Slack direct message`
    : `Slack mention in #${channelName ?? channelId}`

  return {
    id: crypto.randomUUID(),
    source: 'slack',
    externalId,
    dedupeKey: `slack:${externalId}`,
    title,
    body: text || undefined,
    url: buildSlackUrl(workspaceUrl, channelId, ts),
    authorName: message.user,
    occurredAt: slackTimestampToIso(ts, fallbackNow),
    payload: {
      channelId,
      channelName,
      isDirectMessage: isIm,
      ts,
      text,
      user: message.user,
      username: message.user,
    },
  }
}

export function createSlackAdapter(options: CreateSlackAdapterOptions = {}): SourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    source: 'slack',
    async fetchNotifications(config, input) {
      const token = requireSlackToken(config)
      const userId = requireUserId(config)
      const slackSettings = config.credentials.service?.slack
      const includeChannels = slackSettings?.includeChannelMentions ?? true
      const includeDirectMessages = slackSettings?.includeDirectMessages ?? true
      const workspaceUrl = slackSettings?.workspaceUrl
      const channelFilter = new Set(slackSettings?.channelIds ?? [])
      const now = new Date()

      const conversationsUrl = new URL('https://slack.com/api/users.conversations')
      conversationsUrl.searchParams.set('limit', '200')
      conversationsUrl.searchParams.set(
        'types',
        [
          includeChannels ? 'public_channel,private_channel' : '',
          includeDirectMessages ? 'im' : '',
        ]
          .filter(Boolean)
          .join(','),
      )
      if (input.cursor?.cursor) {
        conversationsUrl.searchParams.set('cursor', input.cursor.cursor)
      }

      const { data: conversations } = await requestJson<SlackConversationsResponse>({
        source: 'slack',
        fetchImpl,
        url: conversationsUrl,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!conversations.ok) {
        throw new AdapterRequestError('slack', `Slack API error: ${conversations.error ?? 'unknown_error'}`)
      }

      const notifications: CanonicalNotification[] = []
      const channels = conversations.channels ?? []
      for (const channel of channels) {
        if (channelFilter.size > 0 && !channelFilter.has(channel.id)) {
          continue
        }

        const historyUrl = new URL('https://slack.com/api/conversations.history')
        historyUrl.searchParams.set('channel', channel.id)
        historyUrl.searchParams.set('limit', '200')
        // TODO(sync-watermark): Apply `input.since` via Slack `oldest` and handle per-channel paging.

        const { data: history } = await requestJson<SlackHistoryResponse>({
          source: 'slack',
          fetchImpl,
          url: historyUrl,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!history.ok) {
          throw new AdapterRequestError(
            'slack',
            `Slack history API error for channel ${channel.id}: ${history.error ?? 'unknown_error'}`,
          )
        }

        for (const message of history.messages ?? []) {
          if (!message.ts || message.user === userId || message.subtype === 'bot_message') {
            continue
          }
          const text = message.text ?? ''
          const isMention = channel.is_im ? true : text.includes(`<@${userId}>`)
          if (!isMention) {
            continue
          }

          const mapped = mapSlackMessage({
            channelId: channel.id,
            channelName: channel.name,
            isIm: Boolean(channel.is_im),
            message,
            workspaceUrl,
            fallbackNow: now,
          })
          if (mapped) {
            notifications.push(mapped)
          }
        }
      }

      const nextCursor = conversations.response_metadata?.next_cursor?.trim()
      return {
        notifications,
        nextCursor: nextCursor ? { cursor: nextCursor } : undefined,
      }
    },
  }
}
