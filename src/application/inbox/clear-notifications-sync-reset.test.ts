import { createClearNotificationsService } from './clear-notifications-service'
import { createSyncOrchestrator } from '../sync/sync-orchestrator'
import { createAdapterRegistry } from '../sync/adapter-registry'
import { buildInitialSyncSince } from '../sync/sync-defaults'
import type { SourceAdapter } from '../../domain/source-adapter'
import type { SourceConfigRow } from '../../data/db/schema'

describe('clear notifications + sync reset', () => {
  it('resets sync context so the next sync uses initial lookback again', async () => {
    let nowMs = Date.parse('2026-01-15T12:00:00.000Z')
    const clock = () => new Date(nowMs)

    const sourceRow: SourceConfigRow = {
      id: 'source-1',
      source: 'github',
      instanceKey: 'main',
      displayName: 'GitHub Main',
      enabled: true,
      authMode: 'token',
      credentialsJson: JSON.stringify({ authMode: 'token', token: { value: 'ghp-secret' } }),
      lastSuccessfulSyncAt: null,
      createdAt: clock(),
      updatedAt: clock(),
    }

    const runHistory: Array<{ id: string; sinceUsed: string }> = []
    let nextRunIndex = 1
    const sinceValues: Array<string | undefined> = []

    const sourceConfigRepository = {
      async listEnabled() {
        return [sourceRow]
      },
      async setLastSuccessfulSyncAt() {
        sourceRow.lastSuccessfulSyncAt = clock()
      },
      async resetLastSuccessfulSyncAt() {
        if (!sourceRow.lastSuccessfulSyncAt) {
          return 0
        }
        sourceRow.lastSuccessfulSyncAt = null
        return 1
      },
    }

    const syncRunRepository = {
      async start(params: { sinceUsed?: string }) {
        const id = `run-${nextRunIndex++}`
        runHistory.push({ id, sinceUsed: params.sinceUsed ?? '' })
        return id
      },
      async complete() {},
      async clearHistory() {
        const count = runHistory.length
        runHistory.splice(0, runHistory.length)
        return count
      },
    }

    const notificationRepository = {
      async upsert() {
        return {}
      },
      async clearActive() {
        return { clearedNotifications: 0, clearedReadStates: 0 }
      },
    }

    const adapter: SourceAdapter = {
      source: 'github',
      async fetchNotifications(_config, input) {
        sinceValues.push(input.since)
        return { notifications: [] }
      },
    }

    const orchestrator = createSyncOrchestrator(
      {
        sourceConfigRepository,
        syncRunRepository,
        notificationRepository,
        adapterRegistry: createAdapterRegistry([adapter]),
      },
      clock,
    )

    await orchestrator.syncAllSources()
    nowMs += 60_000
    await orchestrator.syncAllSources()

    expect(sinceValues).toEqual([
      buildInitialSyncSince(new Date('2026-01-15T12:00:00.000Z')),
      '2026-01-15T12:00:00.000Z',
    ])

    const clearService = createClearNotificationsService({
      notificationRepository,
      syncRunRepository,
      sourceConfigRepository,
    })
    const clearResult = await clearService.clearAllNotifications()
    expect(clearResult.clearedSyncHistory).toBe(2)
    expect(clearResult.resetWatermarks).toBe(1)

    nowMs += 60_000
    await orchestrator.syncAllSources()
    expect(sinceValues[2]).toBe(buildInitialSyncSince(new Date('2026-01-15T12:02:00.000Z')))
  })
})
