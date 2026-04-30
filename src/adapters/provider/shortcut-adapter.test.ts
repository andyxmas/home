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
      service: { shortcut: {} },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('shortcut adapter', () => {
  it('maps comment mentions and ignores non-mentioned comments', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'member-other', mention_name: 'andyc' }])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                name: 'Improve sync',
                app_url: 'https://app.shortcut.com/acme/story/42',
                comments: [
                  {
                    id: 11,
                    text: 'FYI @andy',
                    app_url: 'https://app.shortcut.com/acme/story/42#comment-11',
                    author_id: 'member-other',
                    member_mention_ids: ['member-123'],
                    created_at: '2026-01-10T10:00:00Z',
                  },
                  {
                    id: 12,
                    text: 'No mention here',
                    member_mention_ids: [],
                  },
                ],
              },
              {
                id: 43,
                comments: [
                  {
                    id: 13,
                    text: 'Mention someone else',
                    mention_ids: ['member-999'],
                  },
                ],
              },
            ],
          }),
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].externalId).toBe('42:11')
    expect(result.notifications[0].title).toContain('Comment mention')
    expect(result.notifications[0].authorName).toBe('andyc')
    expect(result.notifications[0].payload).toMatchObject({
      authorId: 'member-other',
      authorHandle: 'andyc',
      authorUsername: 'andyc',
    })
    expect(result.notifications[0].url).toBe('https://app.shortcut.com/acme/story/42#comment-11')
  })

  it('builds comment deep links from story app URL fallback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                app_url: 'https://app.shortcut.com/acme/story/42',
                comments: [
                  {
                    id: 11,
                    text: 'FYI @andy',
                    author_id: 'member-other',
                    member_mention_ids: ['member-123'],
                    created_at: '2026-01-10T10:00:00Z',
                  },
                ],
              },
            ],
          }),
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].url).toBe('https://app.shortcut.com/acme/story/42#comment-11')
  })

  it('preserves existing comment URL fragments without appending comment hash', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                app_url: 'https://app.shortcut.com/acme/story/42',
                comments: [
                  {
                    id: 64621,
                    text: 'FYI @andy',
                    app_url: 'https://app.shortcut.com/acme/story/42#activity-64621',
                    author_id: 'member-other',
                    member_mention_ids: ['member-123'],
                    created_at: '2026-01-10T10:00:00Z',
                  },
                ],
              },
            ],
          }),
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].url).toBe('https://app.shortcut.com/acme/story/42#activity-64621')
  })

  it('appends comment hash when comment URL has no fragment', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                comments: [
                  {
                    id: 64621,
                    text: 'FYI @andy',
                    app_url: 'https://app.shortcut.com/acme/story/42',
                    author_id: 'member-other',
                    member_mention_ids: ['member-123'],
                    created_at: '2026-01-10T10:00:00Z',
                  },
                ],
              },
            ],
          }),
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].url).toBe('https://app.shortcut.com/acme/story/42#comment-64621')
  })

  it('fetches all pages when Shortcut returns next cursor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                comments: [
                  {
                    id: 100,
                    text: 'Page one mention',
                    member_mention_ids: ['member-123'],
                    updated_at: '2026-01-09T10:00:00Z',
                  },
                ],
              },
            ],
            next: 'token-2',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 43,
                comments: [
                  {
                    id: 101,
                    text: 'Page two mention',
                    member_mention_ids: ['member-123'],
                    updated_at: '2026-01-09T11:00:00Z',
                  },
                ],
              },
            ],
          }),
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.nextCursor).toBeUndefined()
    expect(result.notifications).toHaveLength(2)
    expect(fetchMock.mock.calls[2][0]).not.toContain('next=')
    expect(fetchMock.mock.calls[3][0]).toContain('next=token-2')
  })

  it('restarts paging once when Shortcut next token is rejected with HTTP 422', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                comments: [
                  {
                    id: 100,
                    text: 'Page one mention',
                    member_mention_ids: ['member-123'],
                    updated_at: '2026-01-09T10:00:00Z',
                  },
                ],
              },
            ],
            next: 'stale-token',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The next page token is not valid for the given query.',
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                comments: [
                  {
                    id: 100,
                    text: 'Page one mention',
                    member_mention_ids: ['member-123'],
                    updated_at: '2026-01-09T10:00:00Z',
                  },
                ],
              },
            ],
            next: 'token-2',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 43,
                comments: [
                  {
                    id: 101,
                    text: 'Page two mention',
                    member_mention_ids: ['member-123'],
                    updated_at: '2026-01-09T11:00:00Z',
                  },
                ],
              },
            ],
          }),
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.notifications).toHaveLength(2)
    expect(new Set(result.notifications.map((notification) => notification.externalId)).size).toBe(2)
    expect(fetchMock.mock.calls[2][0]).not.toContain('next=')
    expect(fetchMock.mock.calls[3][0]).toContain('next=stale-token')
    expect(fetchMock.mock.calls[4][0]).not.toContain('next=')
    expect(fetchMock.mock.calls[5][0]).toContain('next=token-2')
  })

  it('completes no-update runs when Shortcut returns invalid-next on first page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The next page token is not valid for the given query.',
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {
      since: '2026-01-10T10:00:00.000Z',
    })

    expect(result.notifications).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps invalid-next retries bounded and deterministic', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
            next: 'stale-token',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The next page token is not valid for the given query.',
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
            next: 'stale-token',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The next page token is not valid for the given query.',
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {})

    expect(result.notifications).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(fetchMock.mock.calls[2][0]).toContain('query=has%3Acomment')
    expect(fetchMock.mock.calls[4][0]).toContain('query=has%3Acomment')
  })

  it('ignores orchestrator cursor input and starts each run from page 1', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
          }),
        ),
      )
    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })

    await adapter.fetchNotifications(makeShortcutConfig(), { cursor: { cursor: 'stale-external-cursor' } })

    expect(fetchMock.mock.calls[2][0]).not.toContain('next=')
  })

  it('uses built-in API base URL when none configured', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
          }),
        ),
      )
    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })

    await adapter.fetchNotifications(
      makeShortcutConfig({
        credentials: {
          authMode: 'token',
          token: { value: 'shortcut-token' },
          service: { shortcut: {} },
        },
      }),
      {},
    )

    expect(fetchMock.mock.calls[0][0]).toContain('https://api.app.shortcut.com/api/v3/member')
    expect(fetchMock.mock.calls[2][0]).toContain('https://api.app.shortcut.com/api/v3/search/stories')
  })

  it('throws clear error when current member cannot be resolved', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mention_name: 'andy',
        }),
      ),
    )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })

    await expect(adapter.fetchNotifications(makeShortcutConfig(), {})).rejects.toThrow(
      'Unable to determine current member from Shortcut API.',
    )
  })

  it('uses since window for search narrowing and comment-level filtering', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                comments: [
                  {
                    id: 11,
                    text: 'Older same-day mention',
                    member_mention_ids: ['member-123'],
                    updated_at: '2026-01-10T08:00:00Z',
                  },
                  {
                    id: 12,
                    text: 'Fresh mention',
                    member_mention_ids: ['member-123'],
                    updated_at: '2026-01-10T10:30:00Z',
                  },
                ],
              },
            ],
          }),
        ),
      )

    const adapter = createShortcutAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeShortcutConfig(), {
      since: '2026-01-10T10:00:00.000Z',
    })

    expect(fetchMock.mock.calls[2][0]).toContain('query=has%3Acomment+updated%3A2026-01-10..*')
    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].externalId).toBe('42:12')
  })
})
