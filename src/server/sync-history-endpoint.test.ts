import { createSyncHistoryEndpoint } from './sync-history-endpoint'

describe('sync history endpoint', () => {
  it('returns sync history and forwards filters', async () => {
    const listSyncHistory = vi.fn().mockResolvedValue([
      {
        runId: 'run-1',
        source: 'github',
        instanceKey: 'org-1',
        status: 'success',
        startedAt: '2026-01-15T12:00:00.000Z',
        finishedAt: '2026-01-15T12:00:01.000Z',
        fetchedCount: 2,
        upsertedCount: 2,
        archivedCount: 0,
        sinceUsed: '2026-01-15T11:00:00.000Z',
      },
    ])
    const endpoint = createSyncHistoryEndpoint({ listSyncHistory })

    const response = await endpoint(
      new Request('http://localhost/api/sync/history?source=github&instanceKey=org-1&limit=5'),
    )

    expect(response.status).toBe(200)
    expect(listSyncHistory).toHaveBeenCalledWith({
      source: 'github',
      instanceKey: 'org-1',
      limit: 5,
    })
    const payload = (await response.json()) as { history: unknown[] }
    expect(payload.history).toHaveLength(1)
  })

  it('returns 405 for unsupported methods', async () => {
    const endpoint = createSyncHistoryEndpoint({
      listSyncHistory: vi.fn().mockResolvedValue([]),
    })
    const response = await endpoint(new Request('http://localhost/api/sync/history', { method: 'POST' }))
    expect(response.status).toBe(405)
  })
})
