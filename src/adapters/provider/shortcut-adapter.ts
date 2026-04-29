import type { CanonicalNotification, SourceConfig } from '../../domain/notification'
import type { SourceAdapter } from '../../domain/source-adapter'
import { AdapterConfigError } from './adapter-errors'
import { requestJson } from './http'

type FetchLike = typeof fetch

type ShortcutMemberResponse = {
  id?: string
  mention_name?: string
}

type ShortcutMembersResponse = ShortcutMemberResponse[]

type ShortcutStoryComment = {
  id?: number
  text?: string
  app_url?: string
  author_id?: string
  created_at?: string
  updated_at?: string
  member_mention_ids?: string[]
  mention_ids?: string[]
}

type ShortcutStory = {
  id?: number
  name?: string
  app_url?: string
  comments?: ShortcutStoryComment[]
}

type ShortcutSearchStoriesResponse = {
  data?: ShortcutStory[]
  next?: string
}

type CreateShortcutAdapterOptions = {
  fetchImpl?: FetchLike
}

const DEFAULT_SHORTCUT_API_BASE_URL = 'https://api.app.shortcut.com'

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

function resolveShortcutBaseUrl(config: SourceConfig): string {
  const configuredBaseUrl = config.credentials.service?.shortcut?.apiBaseUrl?.trim()
  return configuredBaseUrl || DEFAULT_SHORTCUT_API_BASE_URL
}

function isCommentMention(comment: ShortcutStoryComment, memberId: string): boolean {
  const mentionIds = comment.member_mention_ids ?? comment.mention_ids ?? []
  return mentionIds.includes(memberId)
}

function toIsoDateString(value: string): string | undefined {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) {
    return undefined
  }
  return parsed.toISOString().slice(0, 10)
}

function isCommentUpdatedSince(comment: ShortcutStoryComment, sinceIso: string | undefined): boolean {
  if (!sinceIso) {
    return true
  }
  const sinceTime = Date.parse(sinceIso)
  if (Number.isNaN(sinceTime)) {
    return true
  }

  const candidate = comment.updated_at ?? comment.created_at
  if (!candidate) {
    return false
  }
  const candidateTime = Date.parse(candidate)
  if (Number.isNaN(candidateTime)) {
    return false
  }
  return candidateTime >= sinceTime
}

function normalizeShortcutWebUrl(candidateUrl: string | undefined): string | undefined {
  const normalized = candidateUrl?.trim()
  if (!normalized) {
    return undefined
  }
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString()
    }
    return undefined
  } catch {
    return undefined
  }
}

function toShortcutCommentUrl(story: ShortcutStory, comment: ShortcutStoryComment): string | undefined {
  const commentId = comment.id
  if (!commentId) {
    return normalizeShortcutWebUrl(comment.app_url) ?? normalizeShortcutWebUrl(story.app_url)
  }

  const commentUrl = normalizeShortcutWebUrl(comment.app_url)
  if (commentUrl) {
    if (commentUrl.includes('#comment-')) {
      return commentUrl
    }
    return `${commentUrl}#comment-${commentId}`
  }

  const storyUrl = normalizeShortcutWebUrl(story.app_url)
  if (!storyUrl) {
    return undefined
  }
  return `${storyUrl}#comment-${commentId}`
}

function mapShortcutCommentMention(input: {
  story: ShortcutStory
  comment: ShortcutStoryComment
  fallbackNow: Date
  memberMentionById: ReadonlyMap<string, string>
}): CanonicalNotification | undefined {
  const { story, comment, fallbackNow, memberMentionById } = input

  if (story.id === undefined || comment.id === undefined) {
    return undefined
  }

  const externalId = `${story.id}:${comment.id}`
  const authorId = comment.author_id?.trim()
  const authorHandle = authorId ? memberMentionById.get(authorId) : undefined
  const occurredAt = comment.updated_at ?? comment.created_at ?? fallbackNow.toISOString()

  return {
    id: crypto.randomUUID(),
    source: 'shortcut',
    externalId,
    dedupeKey: `shortcut:${externalId}`,
    title: story.name ? `Comment mention on ${story.name}` : 'Shortcut comment mention',
    body: comment.text || undefined,
    url: toShortcutCommentUrl(story, comment),
    authorName: authorHandle ?? authorId,
    occurredAt,
    payload: {
      storyId: story.id,
      storyName: story.name,
      commentId: comment.id,
      mentionIds: comment.member_mention_ids ?? comment.mention_ids ?? [],
      authorId,
      authorHandle,
      // Keep payload key stable for resolver and older data readers.
      authorUsername: authorHandle ?? authorId,
    },
  }
}

function isInvalidShortcutNextTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('http 422') &&
    message.includes('/api/v3/search/stories') &&
    message.includes('next page token is not valid')
  )
}

export function createShortcutAdapter(options: CreateShortcutAdapterOptions = {}): SourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    source: 'shortcut',
    async fetchNotifications(config, input) {
      const token = requireShortcutToken(config)
      const baseUrl = resolveShortcutBaseUrl(config)
      const now = new Date()
      const headers = {
        Accept: 'application/json',
        'Shortcut-Token': token,
      }

      const memberUrl = new URL('/api/v3/member', baseUrl)
      const { data: member } = await requestJson<ShortcutMemberResponse>({
        source: 'shortcut',
        fetchImpl,
        url: memberUrl,
        headers,
      })
      const memberId = member.id?.trim()
      if (!memberId) {
        throw new AdapterConfigError('shortcut', 'Unable to determine current member from Shortcut API.')
      }

      const notifications: CanonicalNotification[] = []
      const memberMentionById = new Map<string, string>()
      const sinceDate = input.since ? toIsoDateString(input.since) : undefined
      const query = sinceDate ? `has:comment updated:${sinceDate}..*` : 'has:comment'
      const seenCursors = new Set<string>()
      // Shortcut `next` tokens are not portable across runs, so always start from page 1.
      let nextCursorToken: string | undefined
      let didRestartAfterInvalidNext = false

      try {
        const membersUrl = new URL('/api/v3/members', baseUrl)
        const { data: members } = await requestJson<ShortcutMembersResponse>({
          source: 'shortcut',
          fetchImpl,
          url: membersUrl,
          headers,
        })
        for (const shortcutMember of members ?? []) {
          const shortcutMemberId = shortcutMember.id?.trim()
          const shortcutMentionName = shortcutMember.mention_name?.trim()
          if (shortcutMemberId && shortcutMentionName) {
            memberMentionById.set(shortcutMemberId, shortcutMentionName)
          }
        }
      } catch {
        // Best-effort enrichment only; keep sync running with author IDs when lookup fails.
      }

      while (true) {
        const searchStoriesUrl = new URL('/api/v3/search/stories', baseUrl)
        searchStoriesUrl.searchParams.set('page_size', '100')
        searchStoriesUrl.searchParams.set('detail', 'full')
        searchStoriesUrl.searchParams.set('query', query)
        const requestedNextCursor = nextCursorToken
        if (nextCursorToken) {
          searchStoriesUrl.searchParams.set('next', nextCursorToken)
        }

        let responseBody: ShortcutSearchStoriesResponse
        try {
          const response = await requestJson<ShortcutSearchStoriesResponse>({
            source: 'shortcut',
            fetchImpl,
            url: searchStoriesUrl,
            headers,
          })
          responseBody = response.data
        } catch (error) {
          if (isInvalidShortcutNextTokenError(error)) {
            if (requestedNextCursor && !didRestartAfterInvalidNext) {
              // Shortcut next tokens are query-shape specific and can expire unexpectedly.
              // Restart paging once without `next` and replay this run from page 1.
              didRestartAfterInvalidNext = true
              notifications.length = 0
              seenCursors.clear()
              nextCursorToken = undefined
              continue
            }
            // If Shortcut keeps returning this known token error, stop paging and keep
            // the current run successful to avoid failing stable no-update syncs.
            break
          }
          throw error
        }

        for (const story of responseBody.data ?? []) {
          for (const comment of story.comments ?? []) {
            if (!isCommentMention(comment, memberId) || !isCommentUpdatedSince(comment, input.since)) {
              continue
            }
            const mapped = mapShortcutCommentMention({
              story,
              comment,
              fallbackNow: now,
              memberMentionById,
            })
            if (mapped) {
              notifications.push(mapped)
            }
          }
        }

        const cursorFromResponse = responseBody.next?.trim()
        if (!cursorFromResponse) {
          break
        }
        if (seenCursors.has(cursorFromResponse)) {
          throw new AdapterConfigError(
            'shortcut',
            `Shortcut search cursor loop detected at "${cursorFromResponse}"`,
          )
        }
        seenCursors.add(cursorFromResponse)
        nextCursorToken = cursorFromResponse
      }

      return { notifications }
    },
  }
}
