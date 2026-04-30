import { createAdapterRegistry } from '../application/sync/adapter-registry'
import { createSyncOrchestrator } from '../application/sync/sync-orchestrator'
import type { SourceAdapter } from '../domain/source-adapter'
import { createNotificationRepository } from '../data/repositories/notification-repository'
import { createProjectRepository } from '../data/repositories/project-repository'
import { createSourceConfigRepository } from '../data/repositories/source-config-repository'
import { createSyncRunRepository } from '../data/repositories/sync-run-repository'
import { createTestDatabase } from '../data/test/test-db'
import { createManualSyncEndpoint } from './manual-sync-endpoint'

describe('manual sync endpoint', () => {
  let nowMs: number
  const activeDbs: Array<{ close: () => void }> = []

  const clock = () => new Date(nowMs)
  const withDb = () => {
    const testDb = createTestDatabase()
    activeDbs.push(testDb)
    return testDb
  }

  beforeEach(() => {
    nowMs = Date.parse('2026-01-15T12:00:00.000Z')
  })

  afterEach(() => {
    for (const testDb of activeDbs.splice(0)) {
      testDb.close()
    }
  })

  it('handles POST manual sync and returns run summary', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)
    const projectRepo = createProjectRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'github',
      instanceKey: 'org-1',
      displayName: 'GitHub One',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'ghp-secret' } },
    })

    const adapter: SourceAdapter = {
      source: 'github',
      async fetchNotifications() {
        return {
          notifications: [
            {
              id: crypto.randomUUID(),
              source: 'github',
              externalId: 'gh-1',
              dedupeKey: 'ignored',
              title: 'PR comment',
              occurredAt: '2026-01-14T11:00:00.000Z',
              payload: { repo: 'home' },
            },
          ],
        }
      },
    }

    const orchestrator = createSyncOrchestrator(
      {
        sourceConfigRepository: sourceConfigRepo,
        syncRunRepository: syncRunRepo,
        notificationRepository: notificationRepo,
        projectRepository: projectRepo,
        adapterRegistry: createAdapterRegistry([adapter]),
      },
      clock,
    )

    const endpoint = createManualSyncEndpoint({
      runManualSync() {
        return orchestrator.syncAllSources()
      },
      runManualSyncForSource(source, instanceKey) {
        return orchestrator.syncSingleSource({ source, instanceKey })
      },
      runReplaySync() {
        return orchestrator.replayAllSources()
      },
      runReplaySyncForSource(source, instanceKey) {
        return orchestrator.replaySingleSource({ source, instanceKey })
      },
    })

    const response = await endpoint(new Request('http://localhost/api/sync/manual', { method: 'POST' }))
    expect(response.status).toBe(200)

    const payload = (await response.json()) as { totalSources: number; totalUpserted: number }
    expect(payload.totalSources).toBe(1)
    expect(payload.totalUpserted).toBe(1)

    const runs = await testDb.db.query.syncRun.findMany()
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('success')
  })

  it('returns 405 for unsupported methods', async () => {
    const endpoint = createManualSyncEndpoint({
      async runManualSync() {
        throw new Error('should not be called')
      },
      async runManualSyncForSource() {
        throw new Error('should not be called')
      },
      async runReplaySync() {
        throw new Error('should not be called')
      },
      async runReplaySyncForSource() {
        throw new Error('should not be called')
      },
    })

    const response = await endpoint(new Request('http://localhost/api/sync/manual', { method: 'GET' }))
    expect(response.status).toBe(405)
  })

  it('handles POST manual sync for one source', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)
    const projectRepo = createProjectRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'shortcut',
      instanceKey: 'workspace-a',
      displayName: 'Shortcut A',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'shortcut-secret' } },
    })
    await sourceConfigRepo.upsert({
      source: 'github',
      instanceKey: 'main',
      displayName: 'GitHub Main',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'ghp-secret' } },
    })

    const adapters: SourceAdapter[] = [
      {
        source: 'shortcut',
        async fetchNotifications() {
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'shortcut',
                externalId: 'story-1',
                dedupeKey: 'ignored',
                title: 'Shortcut mention',
                occurredAt: '2026-01-14T10:00:00.000Z',
                payload: {},
              },
            ],
          }
        },
      },
      {
        source: 'github',
        async fetchNotifications() {
          return { notifications: [] }
        },
      },
    ]

    const orchestrator = createSyncOrchestrator(
      {
        sourceConfigRepository: sourceConfigRepo,
        syncRunRepository: syncRunRepo,
        notificationRepository: notificationRepo,
        projectRepository: projectRepo,
        adapterRegistry: createAdapterRegistry(adapters),
      },
      clock,
    )

    const endpoint = createManualSyncEndpoint({
      runManualSync() {
        return orchestrator.syncAllSources()
      },
      runManualSyncForSource(source, instanceKey) {
        return orchestrator.syncSingleSource({ source, instanceKey })
      },
      runReplaySync() {
        return orchestrator.replayAllSources()
      },
      runReplaySyncForSource(source, instanceKey) {
        return orchestrator.replaySingleSource({ source, instanceKey })
      },
    })

    const response = await endpoint(
      new Request('http://localhost/api/sync/manual', { method: 'POST' }),
      { source: 'shortcut', instanceKey: 'workspace-a' },
    )
    expect(response.status).toBe(200)

    const payload = (await response.json()) as { totalSources: number; sources: Array<{ source: string }> }
    expect(payload.totalSources).toBe(1)
    expect(payload.sources[0]?.source).toBe('shortcut')

    const runs = await syncRunRepo.listHistory()
    expect(runs).toHaveLength(1)
    expect(runs[0].source).toBe('shortcut')
  })
})
