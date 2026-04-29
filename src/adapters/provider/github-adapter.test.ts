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
  it('maps notifications from GitHub notifications API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '123',
            reason: 'mention',
            unread: true,
            updated_at: '2026-01-10T10:00:00Z',
            repository: { full_name: 'acme/home', html_url: 'https://github.com/acme/home' },
            subject: { title: 'Review requested', type: 'PullRequest', url: 'https://api.github.com/...' },
          },
        ]),
      ),
    )

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeGitHubConfig(), { since: '2026-01-01T00:00:00Z' })

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].externalId).toBe('123')
    expect(result.notifications[0].title).toBe('Review requested')
    expect(result.notifications[0].body).toContain('mention')
    expect(fetchMock.mock.calls[0][0]).toContain('/notifications')
    expect(fetchMock.mock.calls[0][0]).toContain('since=2026-01-01T00%3A00%3A00Z')
  })

  it('returns next page cursor from link header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: {
          link: '<https://api.github.com/notifications?page=2>; rel="next"',
        },
      }),
    )

    const adapter = createGitHubAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeGitHubConfig(), {})

    expect(result.nextCursor).toEqual({ cursor: '2' })
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
})
