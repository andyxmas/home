import type { CanonicalNotification, SourceConfig } from '../../domain/notification'
import type { SourceAdapter } from '../../domain/source-adapter'
import { AdapterConfigError } from './adapter-errors'
import { requestJson } from './http'

type FetchLike = typeof fetch

type GitHubUser = {
  login?: string
}

type GitHubIssueSearchItem = {
  id?: number
  node_id?: string
  number?: number
  title?: string
  body?: string
  html_url?: string
  url?: string
  repository_url?: string
  updated_at?: string
  user?: GitHubUser
  pull_request?: Record<string, unknown>
}

type GitHubIssueSearchResponse = {
  items?: GitHubIssueSearchItem[]
}

type GitHubComment = {
  id?: number
  node_id?: string
  body?: string
  html_url?: string
  url?: string
  updated_at?: string
  created_at?: string
  user?: GitHubUser
}

type HydratedMentionComment = {
  comment: GitHubComment
  kind: 'issue' | 'pull_review'
}

type CreateGitHubAdapterOptions = {
  fetchImpl?: FetchLike
}

const ENABLE_GITHUB_DEBUG_LOGS = process.env.HOME_SYNC_DEBUG === '1'

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

function repositoryNameFromUrl(repositoryUrl: string | undefined): string | undefined {
  if (!repositoryUrl) {
    return undefined
  }
  const match = repositoryUrl.match(/\/repos\/([^/]+\/[^/]+)$/)
  return match?.[1]
}

function toIsoWithoutMilliseconds(input: string): string {
  const parsed = new Date(input)
  if (Number.isNaN(parsed.valueOf())) {
    return input
  }
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function truncateBodySnippet(body: string | undefined, maxLength = 280): string | undefined {
  const normalized = body?.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return undefined
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1)}…`
}

function asEpochMillis(value: string | undefined): number {
  if (!value) {
    return Number.NaN
  }
  return new Date(value).valueOf()
}

function compareDatesDescending(left: string, right: string): number {
  return new Date(right).valueOf() - new Date(left).valueOf()
}

function parseGitHubRepositoryAndNumber(
  item: GitHubIssueSearchItem,
): { owner: string; repo: string; number: number; repository: string } | undefined {
  const number = item.number
  const repositoryUrl = item.repository_url
  if (!number || !repositoryUrl) {
    return undefined
  }
  const match = repositoryUrl.match(/\/repos\/([^/]+)\/([^/]+)$/)
  if (!match) {
    return undefined
  }
  const owner = match[1]
  const repo = match[2]
  return { owner, repo, number, repository: `${owner}/${repo}` }
}

function bodyContainsMention(body: string | undefined, mentionToken: string): boolean {
  if (!body) {
    return false
  }
  return body.toLowerCase().includes(mentionToken)
}

function withAnchor(url: string | undefined, anchor: string): string | undefined {
  if (!url) {
    return undefined
  }

  const normalized = url.trim()
  if (!normalized) {
    return undefined
  }

  const withoutHash = normalized.split('#')[0]
  return `${withoutHash}#${anchor}`
}

function toCommentNotification(
  item: GitHubIssueSearchItem,
  hydrated: HydratedMentionComment,
  now: Date,
): CanonicalNotification | undefined {
  const { comment, kind } = hydrated
  const commentId = comment.id
  if (!commentId) {
    return undefined
  }

  const repository = repositoryNameFromUrl(item.repository_url)
  const occurredAt = comment.updated_at ?? comment.created_at ?? item.updated_at ?? now.toISOString()
  const bodySnippet = truncateBodySnippet(comment.body)
  const title = item.title ?? `${repository ?? 'GitHub'} mention`
  const externalId = `mention-comment:${commentId}`
  const resourceUrl = toBrowserGitHubUrl(item.html_url) ?? toBrowserGitHubUrl(item.url)
  const commentUrl = toBrowserGitHubUrl(comment.html_url) ?? toBrowserGitHubUrl(comment.url)
  const fallbackAnchor = kind === 'pull_review' ? `discussion_r${commentId}` : `issuecomment-${commentId}`
  const notificationUrl = commentUrl?.includes('#')
    ? commentUrl
    : withAnchor(commentUrl ?? resourceUrl, fallbackAnchor)

  return {
    id: crypto.randomUUID(),
    source: 'github',
    externalId,
    dedupeKey: `github:${externalId}`,
    title,
    body: bodySnippet,
    url: notificationUrl,
    authorName: comment.user?.login ?? item.user?.login,
    occurredAt,
    payload: {
      repository,
      repositoryUrl: item.repository_url,
      updatedAt: item.updated_at,
      commentId,
      commentUpdatedAt: comment.updated_at ?? comment.created_at,
      commentAuthorLogin: comment.user?.login,
      commentKind: kind,
      authorLogin: item.user?.login,
      isPullRequest: Boolean(item.pull_request),
    },
  }
}

function debugGitHub(message: string, context: Record<string, unknown>): void {
  if (!ENABLE_GITHUB_DEBUG_LOGS) {
    return
  }
  console.info('[sync:github]', message, context)
}

function toBrowserGitHubUrl(candidateUrl: string | undefined): string | undefined {
  const normalized = candidateUrl?.trim()
  if (!normalized) {
    return undefined
  }

  try {
    const parsed = new URL(normalized)
    const host = parsed.hostname.toLowerCase()

    if (host === 'github.com' || (host.endsWith('.github.com') && !host.startsWith('api.'))) {
      return parsed.toString()
    }

    const repoPathMatch = parsed.pathname.match(
      /^\/repos\/([^/]+)\/([^/]+)(?:\/(issues|pulls|pull|discussions)\/(\d+))?/,
    )
    if (!repoPathMatch) {
      return parsed.toString()
    }

    const owner = repoPathMatch[1]
    const repo = repoPathMatch[2]
    const kind = repoPathMatch[3]
    const number = repoPathMatch[4]
    const slug = `${owner}/${repo}`
    if (!kind || !number) {
      return `https://github.com/${slug}`
    }

    if (kind === 'issues') {
      return `https://github.com/${slug}/issues/${number}`
    }
    if (kind === 'pulls' || kind === 'pull') {
      return `https://github.com/${slug}/pull/${number}`
    }
    return `https://github.com/${slug}/discussions/${number}`
  } catch {
    return undefined
  }
}

function mapGitHubMention(item: GitHubIssueSearchItem, now: Date): CanonicalNotification | undefined {
  const id = item.node_id ?? (item.id ? String(item.id) : undefined)
  if (!id) {
    return undefined
  }

  const repository = repositoryNameFromUrl(item.repository_url)
  const occurredAt = item.updated_at ?? now.toISOString()
  const bodySnippet = truncateBodySnippet(item.body)
  const title = item.title ?? `${repository ?? 'GitHub'} mention`
  const externalId = `mention:${id}`

  return {
    id: crypto.randomUUID(),
    source: 'github',
    externalId,
    dedupeKey: `github:${externalId}`,
    title,
    body: bodySnippet,
    url: toBrowserGitHubUrl(item.html_url) ?? toBrowserGitHubUrl(item.url),
    authorName: item.user?.login,
    occurredAt,
    payload: {
      repository,
      repositoryUrl: item.repository_url,
      updatedAt: item.updated_at,
      authorLogin: item.user?.login,
      isPullRequest: Boolean(item.pull_request),
    },
  }
}

export function createGitHubAdapter(options: CreateGitHubAdapterOptions = {}): SourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch
  const userLoginCache = new Map<string, string>()

  return {
    source: 'github',
    async fetchNotifications(config, input) {
      const token = requireGithubToken(config)
      const settings = config.credentials.service?.github
      const baseUrl = settings?.apiBaseUrl?.trim() || 'https://api.github.com'
      const page = Number.parseInt(input.cursor?.cursor ?? '1', 10)
      const now = new Date()

      const cacheKey = `${baseUrl}|${token}`
      let login = userLoginCache.get(cacheKey)
      if (!login) {
        const userUrl = new URL('/user', baseUrl)
        const { data: user } = await requestJson<GitHubUser>({
          source: 'github',
          fetchImpl,
          url: userUrl,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        })
        if (!user.login?.trim()) {
          throw new AdapterConfigError('github', 'Unable to determine authenticated GitHub user login.')
        }
        login = user.login.trim()
        userLoginCache.set(cacheKey, login)
      }

      // POC escape hatch: lets local validation force @andyxmas without changing token owner.
      const mentionLoginOverride = process.env.HOME_SYNC_GITHUB_MENTION_LOGIN?.trim()
      const mentionLookupLogin = mentionLoginOverride || login
      const mentionToken = `@${mentionLookupLogin.toLowerCase()}`
      const searchUrl = new URL('/search/issues', baseUrl)
      searchUrl.searchParams.set('per_page', '50')
      searchUrl.searchParams.set('page', Number.isFinite(page) && page > 0 ? String(page) : '1')
      searchUrl.searchParams.set('sort', 'updated')
      searchUrl.searchParams.set('order', 'desc')
      const requestHeaders = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      }
      const mentionQualifiers = [`mentions:${mentionLookupLogin}`]
      const involvesQualifiers = [`involves:${mentionLookupLogin}`]
      if (input.since) {
        const sinceQualifier = `updated:>=${toIsoWithoutMilliseconds(input.since)}`
        mentionQualifiers.push(sinceQualifier)
        involvesQualifiers.push(sinceQualifier)
      }

      const fetchMentionsByType = async (
        typeQualifier: 'is:issue' | 'is:pull-request',
        qualifiers: string[],
      ) => {
        searchUrl.searchParams.set('q', [typeQualifier, ...qualifiers].join(' '))
        debugGitHub('request', {
          endpoint: searchUrl.pathname,
          page: searchUrl.searchParams.get('page'),
          perPage: searchUrl.searchParams.get('per_page'),
          type: typeQualifier,
          hasSince: Boolean(input.since),
          participating: Boolean(settings?.participating),
        })
        const { data, response } = await requestJson<GitHubIssueSearchResponse>({
          source: 'github',
          fetchImpl,
          url: searchUrl,
          headers: requestHeaders,
        })
        debugGitHub('response', {
          endpoint: searchUrl.pathname,
          status: response.status,
          type: typeQualifier,
          itemCount: data.items?.length ?? 0,
        })
        return { data, response }
      }

      const [issueMentionResult, pullRequestMentionResult, issueInvolvesResult, pullRequestInvolvesResult] =
        await Promise.all([
          fetchMentionsByType('is:issue', mentionQualifiers),
          fetchMentionsByType('is:pull-request', mentionQualifiers),
          fetchMentionsByType('is:issue', involvesQualifiers),
          fetchMentionsByType('is:pull-request', involvesQualifiers),
        ])
      const itemEntries = [
        ...(issueMentionResult.data.items ?? []).map((item) => ({ item, fromMentionsQuery: true })),
        ...(pullRequestMentionResult.data.items ?? []).map((item) => ({ item, fromMentionsQuery: true })),
        ...(issueInvolvesResult.data.items ?? []).map((item) => ({ item, fromMentionsQuery: false })),
        ...(pullRequestInvolvesResult.data.items ?? []).map((item) => ({ item, fromMentionsQuery: false })),
      ]
      const itemsById = new Map<string, { item: GitHubIssueSearchItem; fromMentionsQuery: boolean }>()
      for (const entry of itemEntries) {
        const item = entry.item
        const itemId = item.node_id ?? (item.id ? String(item.id) : undefined)
        if (!itemId) {
          continue
        }
        const existing = itemsById.get(itemId)
        if (!existing) {
          itemsById.set(itemId, entry)
          continue
        }
        if (!existing.fromMentionsQuery && entry.fromMentionsQuery) {
          itemsById.set(itemId, { item, fromMentionsQuery: true })
        }
      }
      const items = [...itemsById.values()]
      const sinceMs = input.since ? new Date(input.since).valueOf() : NaN
      const filteredByWatermark = items.filter(({ item }) => {
        if (!Number.isFinite(sinceMs)) {
          return true
        }
        const updatedMs = asEpochMillis(item.updated_at)
        return Number.isFinite(updatedMs) && updatedMs >= sinceMs
      })

      // Strategy: use search/issues for incremental discovery, then hydrate endpoint-level comments
      // so inbox bodies can carry exact mention text and anchor links when comment records are readable.
      const fetchMentionCommentsForItem = async (
        item: GitHubIssueSearchItem,
      ): Promise<{ comments: HydratedMentionComment[]; hadHydrationError: boolean }> => {
        const details = parseGitHubRepositoryAndNumber(item)
        if (!details) {
          return { comments: [], hadHydrationError: false }
        }
        const commentUrls: Array<{ url: URL; kind: HydratedMentionComment['kind'] }> = [
          {
            url: new URL(`/repos/${details.owner}/${details.repo}/issues/${details.number}/comments`, baseUrl),
            kind: 'issue',
          },
        ]
        if (item.pull_request) {
          commentUrls.push({
            url: new URL(`/repos/${details.owner}/${details.repo}/pulls/${details.number}/comments`, baseUrl),
            kind: 'pull_review',
          })
        }

        const mentionComments: HydratedMentionComment[] = []
        let hadHydrationError = false
        for (const target of commentUrls) {
          let endpointPage = 1
          let hasNextPage = true
          while (hasNextPage) {
            const commentUrl = new URL(target.url.toString())
            commentUrl.searchParams.set('per_page', '100')
            commentUrl.searchParams.set('page', String(endpointPage))
            if (input.since) {
              commentUrl.searchParams.set('since', toIsoWithoutMilliseconds(input.since))
            }
            try {
              const { data, response } = await requestJson<GitHubComment[]>({
                source: 'github',
                fetchImpl,
                url: commentUrl,
                headers: requestHeaders,
              })
              for (const comment of data ?? []) {
                const updatedAtMs = asEpochMillis(comment.updated_at ?? comment.created_at)
                const satisfiesSince =
                  !Number.isFinite(sinceMs) || (Number.isFinite(updatedAtMs) && updatedAtMs >= sinceMs)
                if (!satisfiesSince) {
                  continue
                }
                if (!bodyContainsMention(comment.body, mentionToken)) {
                  continue
                }
                mentionComments.push({ comment, kind: target.kind })
              }
              const nextPage = nextPageFromLinkHeader(response.headers.get('link'))
              endpointPage = nextPage ?? 0
              hasNextPage = Boolean(nextPage)
            } catch {
              hadHydrationError = true
              hasNextPage = false
            }
          }
        }
        return { comments: mentionComments, hadHydrationError }
      }

      const mappedNotifications: CanonicalNotification[] = []
      for (const { item, fromMentionsQuery } of filteredByWatermark) {
        const hydratedMentions = await fetchMentionCommentsForItem(item)
        if (hydratedMentions.comments.length > 0) {
          hydratedMentions.comments.sort((a, b) =>
            compareDatesDescending(
              a.comment.updated_at ?? a.comment.created_at ?? now.toISOString(),
              b.comment.updated_at ?? b.comment.created_at ?? now.toISOString(),
            ),
          )
          for (const hydrated of hydratedMentions.comments) {
            const mapped = toCommentNotification(item, hydrated, now)
            if (mapped) {
              mappedNotifications.push(mapped)
            }
          }
          continue
        }

        const mentionOnResource = bodyContainsMention(item.body, mentionToken)
        if (mentionOnResource || fromMentionsQuery || hydratedMentions.hadHydrationError) {
          const mapped = mapGitHubMention(item, now)
          if (mapped) {
            mappedNotifications.push(mapped)
          }
          continue
        }

        if (!settings?.participating) {
          continue
        }
        const mapped = mapGitHubMention(item, now)
        if (mapped) {
          mappedNotifications.push(mapped)
        }
      }

      mappedNotifications.sort((a, b) => new Date(b.occurredAt).valueOf() - new Date(a.occurredAt).valueOf())
      const dedupeKeys = new Set<string>()
      const notifications = mappedNotifications.filter((notification) => {
        if (dedupeKeys.has(notification.dedupeKey)) {
          return false
        }
        dedupeKeys.add(notification.dedupeKey)
        return true
      })

      const nextPage = Math.min(
        nextPageFromLinkHeader(issueMentionResult.response.headers.get('link')) ?? Number.POSITIVE_INFINITY,
        nextPageFromLinkHeader(pullRequestMentionResult.response.headers.get('link')) ?? Number.POSITIVE_INFINITY,
        nextPageFromLinkHeader(issueInvolvesResult.response.headers.get('link')) ?? Number.POSITIVE_INFINITY,
        nextPageFromLinkHeader(pullRequestInvolvesResult.response.headers.get('link')) ??
          Number.POSITIVE_INFINITY,
      )
      return {
        notifications,
        nextCursor: Number.isFinite(nextPage) ? { cursor: String(nextPage) } : undefined,
      }
    },
  }
}
