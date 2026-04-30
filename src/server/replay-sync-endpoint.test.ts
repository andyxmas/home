import { createReplaySyncEndpoint } from './replay-sync-endpoint'

describe('replay sync endpoint', () => {
  it('handles POST replay sync and returns summary', async () => {
    const endpoint = createReplaySyncEndpoint({
      async runReplaySync() {
        return {
          startedAt: '2026-01-15T12:00:00.000Z',
          finishedAt: '2026-01-15T12:00:02.000Z',
          totalSources: 1,
          succeededSources: 1,
          failedSources: 0,
          totalFetched: 2,
          totalUpserted: 2,
          totalArchived: 0,
          sources: [],
        }
      },
      async runReplaySyncForSource() {
        throw new Error('should not be called')
      },
    })

    const response = await endpoint(new Request('http://localhost/api/sync/replay', { method: 'POST' }))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { totalSources: number; totalUpserted: number }
    expect(payload.totalSources).toBe(1)
    expect(payload.totalUpserted).toBe(2)
  })

  it('handles POST replay for one source', async () => {
    const endpoint = createReplaySyncEndpoint({
      async runReplaySync() {
        throw new Error('should not be called')
      },
      async runReplaySyncForSource(source, instanceKey) {
        expect(source).toBe('github')
        expect(instanceKey).toBe('main')
        return {
          startedAt: '2026-01-15T12:00:00.000Z',
          finishedAt: '2026-01-15T12:00:01.000Z',
          totalSources: 1,
          succeededSources: 1,
          failedSources: 0,
          totalFetched: 1,
          totalUpserted: 1,
          totalArchived: 0,
          sources: [],
        }
      },
    })

    const response = await endpoint(
      new Request('http://localhost/api/sync/replay', { method: 'POST' }),
      { source: 'github', instanceKey: 'main' },
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { totalFetched: number }
    expect(payload.totalFetched).toBe(1)
  })

  it('returns 405 for unsupported methods', async () => {
    const endpoint = createReplaySyncEndpoint({
      async runReplaySync() {
        throw new Error('should not be called')
      },
      async runReplaySyncForSource() {
        throw new Error('should not be called')
      },
    })

    const response = await endpoint(new Request('http://localhost/api/sync/replay', { method: 'GET' }))
    expect(response.status).toBe(405)
  })
})
