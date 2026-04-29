import { and, desc, eq } from 'drizzle-orm'
import type { SourceKind } from '../../domain/notification'
import type { HomeDb } from '../db/client'
import { syncRun } from '../db/schema'

type Clock = () => Date

function defaultClock(): Date {
  return new Date()
}

export function createSyncRunRepository(db: HomeDb, clock: Clock = defaultClock) {
  return {
    async start(params: {
      source: SourceKind
      instanceKey: string
      sinceUsed?: string
    }): Promise<string> {
      const id = crypto.randomUUID()
      await db.insert(syncRun).values({
        id,
        source: params.source,
        instanceKey: params.instanceKey,
        sinceUsed: params.sinceUsed ?? null,
        status: 'running',
        startedAt: clock(),
      })
      return id
    },

    async complete(params: {
      runId: string
      fetchedCount: number
      upsertedCount: number
      archivedCount: number
      errorMessage?: string
    }): Promise<void> {
      await db
        .update(syncRun)
        .set({
          status: params.errorMessage ? 'failed' : 'success',
          fetchedCount: params.fetchedCount,
          upsertedCount: params.upsertedCount,
          archivedCount: params.archivedCount,
          errorMessage: params.errorMessage ?? null,
          finishedAt: clock(),
        })
        .where(eq(syncRun.id, params.runId))
    },

    async get(runId: string) {
      return db.query.syncRun.findFirst({
        where: eq(syncRun.id, runId),
      })
    },

    async listHistory(filters?: { source?: SourceKind; instanceKey?: string; limit?: number }) {
      const where = filters?.source
        ? filters.instanceKey
          ? and(eq(syncRun.source, filters.source), eq(syncRun.instanceKey, filters.instanceKey))
          : eq(syncRun.source, filters.source)
        : filters?.instanceKey
          ? eq(syncRun.instanceKey, filters.instanceKey)
          : undefined

      return db.query.syncRun.findMany({
        where,
        orderBy: [desc(syncRun.startedAt)],
        limit: filters?.limit,
      })
    },

    async clearHistory(): Promise<number> {
      const runs = await db.query.syncRun.findMany()
      await db.delete(syncRun)
      return runs.length
    },
  }
}
