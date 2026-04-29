import { createSlackAdapter } from './slack-adapter'
import type { SourceConfig } from '../../domain/notification'

function makeSlackConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'cfg-slack',
    source: 'slack',
    instanceKey: 'workspace-default',
    displayName: 'Slack Workspace',
    enabled: true,
    credentials: {
      authMode: 'token',
      token: { value: 'xoxb-secret' },
      service: {
        slack: {
          userId: 'U123',
          workspaceUrl: 'https://acme.slack.com',
        },
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('slack adapter', () => {
  it('maps channel mentions and direct messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            channels: [
              { id: 'C1', name: 'general', is_im: false },
              { id: 'D1', is_im: true },
            ],
            response_metadata: {},
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            messages: [
              { ts: '1713456000.001', user: 'U999', text: 'hello <@U123>' },
              { ts: '1713456000.002', user: 'U999', text: 'not a mention' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            messages: [{ ts: '1713456000.003', user: 'U456', text: 'DM ping' }],
          }),
        ),
      )

    const adapter = createSlackAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeSlackConfig(), {})

    expect(result.notifications).toHaveLength(2)
    expect(result.notifications[0].externalId).toBe('C1:1713456000.001')
    expect(result.notifications[0].title).toContain('mention')
    expect(result.notifications[0].url).toContain('/archives/C1/')
    expect(result.notifications[1].externalId).toBe('D1:1713456000.003')
    expect(result.notifications[1].title).toContain('direct message')
  })

  it('returns pagination cursor from conversations list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            channels: [],
            response_metadata: { next_cursor: 'next-convo-cursor' },
          }),
        ),
      )

    const adapter = createSlackAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    const result = await adapter.fetchNotifications(makeSlackConfig(), { cursor: { cursor: 'start' } })

    expect(result.notifications).toEqual([])
    expect(result.nextCursor).toEqual({ cursor: 'next-convo-cursor' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('cursor=start')
  })

  it('throws clear config error when user id is missing', async () => {
    const adapter = createSlackAdapter({ fetchImpl: vi.fn() as unknown as typeof fetch })

    await expect(
      adapter.fetchNotifications(
        makeSlackConfig({
          credentials: {
            authMode: 'token',
            token: { value: 'xoxb-secret' },
            service: { slack: { userId: '' } },
          },
        }),
        {},
      ),
    ).rejects.toThrow('service.slack.userId')
  })

  it('currently ignores since until Slack oldest-based narrowing is implemented', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            channels: [{ id: 'C1', name: 'general', is_im: false }],
            response_metadata: {},
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            messages: [{ ts: '1713456000.001', user: 'U999', text: 'hello <@U123>' }],
          }),
        ),
      )

    const adapter = createSlackAdapter({ fetchImpl: fetchMock as unknown as typeof fetch })
    await adapter.fetchNotifications(makeSlackConfig(), { since: '2026-01-10T10:00:00.000Z' })

    expect(fetchMock.mock.calls[1][0]).not.toContain('oldest=')
  })
})
