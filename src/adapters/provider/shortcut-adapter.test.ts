import { createShortcutAdapter } from './shortcut-adapter'
import type { SourceConfig } from '../../domain/notification'

function makeShortcutConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'cfg-shortcut',
    source: 'shortcut',
    instanceKey: 'shortcut-acme',
    displayName: 'Shortcut Acme',
    enabled: true,
    credentials: {
      authMode: 'token',
      token: { value: 'shortcut-token' },
      service: {
        shortcut: {
          apiBaseUrl: 'https://api.app.shortcut.com',
        },
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('shortcut adapter', () => {
  it('maps comment mentions and ignores non-comment rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 11,
              type: 'mention',
              entity_type: 'comment',
              mention: true,
              story_name: 'Improve sync',
              text: 'FYI @andy',
              app_url: 'https://app.shortcut.com/acme/story/11',
              created_at: '2026-01-10T10:00:00Z',
              author: { name: 'Teammate' },
            },
            {
              id: 12,
              type: 'workflow_change',
              entity_type: 'story',
            },
          ],
        }),
      ),
    )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].externalId).toBe('11')
    expect(result.notifications[0].title).toContain('Comment mention')
  })

  it('returns next page token as cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          notifications: [],
          next_page_token: 'token-2',
        }),
      ),
    )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), { cursor: { cursor: 'token-1' } })

    expect(result.nextCursor).toEqual({ cursor: 'token-2' })
    expect(fetchMock.mock.calls[0][0]).toContain('page_token=token-1')
  })

  it('throws clear config error when base url is missing', async () => {
    const adapter = createShortcutAdapter({ fetchImpl: vi.fn() as unknown as typeof fetch })

    await expect(
      adapter.fetchNotifications(
        makeShortcutConfig({
          credentials: {
            authMode: 'token',
            token: { value: 'shortcut-token' },
            service: { shortcut: { apiBaseUrl: '' } },
          },
        }),
        {},
      ),
    ).rejects.toThrow('service.shortcut.apiBaseUrl')
  })
})
