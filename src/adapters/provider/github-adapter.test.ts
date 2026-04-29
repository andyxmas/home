import { createGitHubAdapter } from './github-adapter'
import type { SourceConfig } from '../../domain/notification'

function makeGitHubConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'cfg-github',
    source: 'github',
    instanceKey: 'github-default',
    displayName: 'GitHub',
    enabled: true,
    credentials: {
      authMode: 'token',
      token: { value: 'ghp-secret' },
      service: {
        github: {
          participating: false,
        },
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('github adapter', () => {
  it('maps mentions from GitHub issue search API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 123,
                node_id: 'I_kwDOA',
                title: 'Review requested',
                body: 'Hey @octocat can you review this change?',
                html_url: 'https://github.com/acme/home/pull/1',
                repository_url: 'https://api.github.com/repos/acme/home',
                updated_at: '2026-01-10T10:00:00Z',
                user: { login: 'alice' },
                pull_request: {},
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeGitHubConfig(), { since: '2026-01-01T00:00:00Z' })

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].externalId).toBe('mention:I_kwDOA')
    expect(result.notifications[0].title).toBe('Review requested')
    expect(result.notifications[0].body).toContain('@octocat')
    expect(result.notifications[0].authorName).toBe('alice')
    expect(result.notifications[0].payload.repository).toBe('acme/home')
    expect(fetchMock.mock.calls[0][0]).toContain('/user')
    expect(fetchMock.mock.calls[1][0]).toContain('/search/issues')
    expect(fetchMock.mock.calls[2][0]).toContain('/search/issues')
    expect(fetchMock.mock.calls[3][0]).toContain('/search/issues')
    expect(fetchMock.mock.calls[4][0]).toContain('/search/issues')
    const queryIssueMentions = new URL(fetchMock.mock.calls[1][0] as string).searchParams.get('q')
    const queryPullRequestMentions = new URL(fetchMock.mock.calls[2][0] as string).searchParams.get('q')
    const queryIssueInvolves = new URL(fetchMock.mock.calls[3][0] as string).searchParams.get('q')
    const queryPullRequestInvolves = new URL(fetchMock.mock.calls[4][0] as string).searchParams.get('q')
    expect(queryIssueMentions).toBe('is:issue mentions:octocat updated:>=2026-01-01T00:00:00Z')
    expect(queryPullRequestMentions).toBe('is:pull-request mentions:octocat updated:>=2026-01-01T00:00:00Z')
    expect(queryIssueInvolves).toBe('is:issue involves:octocat updated:>=2026-01-01T00:00:00Z')
    expect(queryPullRequestInvolves).toBe('is:pull-request involves:octocat updated:>=2026-01-01T00:00:00Z')
  })

  it('prefers browser URL fallback when API URL is returned', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 456,
                node_id: 'I_kwDOB',
                title: 'Mention from API URL',
                body: 'Following up with @octocat on this issue.',
                url: 'https://api.github.com/repos/acme/home/issues/44',
                repository_url: 'https://api.github.com/repos/acme/home',
                updated_at: '2026-01-11T10:00:00Z',
                user: { login: 'alice' },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeGitHubConfig(), {})

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].url).toBe('https://github.com/acme/home/issues/44')
  })

  it('returns next page cursor from link header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          headers: {
            link: '<https://api.github.com/search/issues?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          headers: {
            link: '<https://api.github.com/search/issues?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          headers: {
            link: '<https://api.github.com/search/issues?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          headers: {
            link: '<https://api.github.com/search/issues?page=2>; rel="next"',
          },
        }),
      )

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeGitHubConfig(), {})

    expect(result.nextCursor).toEqual({ cursor: '2' })
  })

  it('includes involves qualifier when participating is enabled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    await adapter.fetchNotifications(
      makeGitHubConfig({
        credentials: {
          authMode: 'token',
          token: { value: 'ghp-secret' },
          service: {
            github: {
              participating: true,
            },
          },
        },
      }),
      {},
    )

    const queryIssueMentions = new URL(fetchMock.mock.calls[1][0] as string).searchParams.get('q')
    const queryPullRequestMentions = new URL(fetchMock.mock.calls[2][0] as string).searchParams.get('q')
    const queryIssueInvolves = new URL(fetchMock.mock.calls[3][0] as string).searchParams.get('q')
    const queryPullRequestInvolves = new URL(fetchMock.mock.calls[4][0] as string).searchParams.get('q')
    expect(queryIssueMentions).toBe('is:issue mentions:octocat')
    expect(queryPullRequestMentions).toBe('is:pull-request mentions:octocat')
    expect(queryIssueInvolves).toBe('is:issue involves:octocat')
    expect(queryPullRequestInvolves).toBe('is:pull-request involves:octocat')
  })

  it('filters out stale results that do not satisfy since watermark', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 1,
                title: 'Old mention',
                body: 'Ping @octocat on old mention',
                html_url: 'https://github.com/acme/home/issues/1',
                repository_url: 'https://api.github.com/repos/acme/home',
                updated_at: '2026-01-09T09:00:00Z',
              },
              {
                id: 2,
                title: 'Fresh mention',
                body: 'Ping @octocat on fresh mention',
                html_url: 'https://github.com/acme/home/issues/2',
                repository_url: 'https://api.github.com/repos/acme/home',
                updated_at: '2026-01-10T10:00:00Z',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeGitHubConfig(), {
      since: '2026-01-10T00:00:00Z',
    })

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].title).toBe('Fresh mention')
  })

  it('hydrates mention comments discovered from involves search', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'octocat' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 333,
                node_id: 'PR_kwDOX',
                number: 77,
                title: 'Improve checkout validation',
                html_url: 'https://github.com/acme/home/pull/77',
                repository_url: 'https://api.github.com/repos/acme/home',
                updated_at: '2026-01-10T12:00:00Z',
                user: { login: 'alice' },
                pull_request: {},
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 991,
              body: 'Heads up @octocat, please review this part.',
              html_url: 'https://github.com/acme/home/pull/77#issuecomment-991',
              updated_at: '2026-01-10T12:01:00Z',
              user: { login: 'bob' },
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([])))

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeGitHubConfig(), {
      since: '2026-01-10T00:00:00Z',
    })

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].externalId).toBe('mention-comment:991')
    expect(result.notifications[0].authorName).toBe('bob')
    expect(result.notifications[0].body).toContain('@octocat')
    expect(result.notifications[0].url).toBe('https://github.com/acme/home/pull/77#issuecomment-991')
  })

  it('throws clear config error when token is missing', async () => {
    const adapter = createGitHubAdapter({ fetchImpl: vi.fn() as unknown as typeof fetch })

    await expect(
      adapter.fetchNotifications(
        makeGitHubConfig({
          credentials: {
            authMode: 'token',
            token: { value: '' },
          },
        }),
        {},
      ),
    ).rejects.toThrow('Missing required token value')
  })

  it('throws clear config error when auth mode is not token', async () => {
    const adapter = createGitHubAdapter({ fetchImpl: vi.fn() as unknown as typeof fetch })

    await expect(
      adapter.fetchNotifications(
        makeGitHubConfig({
          credentials: {
            authMode: 'oauth2',
            oauth2: {
              accessToken: 'abc',
            },
          },
        }),
        {},
      ),
    ).rejects.toThrow('Only token auth is supported in v1')
  })
})
