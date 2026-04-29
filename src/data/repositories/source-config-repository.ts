import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { HomeDb } from '../db/client'
import { sourceConfig } from '../db/schema'
import type { SourceCredentialShape, SourceKind } from '../../domain/notification'

export type UpsertSourceConfigInput = {
  source: SourceKind
  instanceKey: string
  displayName: string
  enabled: boolean
  authMode: SourceCredentialShape['authMode']
  credentials: SourceCredentialShape
}

type Clock = () => Date

function defaultClock(): Date {
  return new Date()
}

export function createSourceConfigRepository(db: HomeDb, clock: Clock = defaultClock) {
  return {
    async upsert(input: UpsertSourceConfigInput): Promise<void> {
      const now = clock()

      await db
        .insert(sourceConfig)
        .values({
          id: crypto.randomUUID(),
          source: input.source,
          instanceKey: input.instanceKey,
          displayName: input.displayName,
          enabled: input.enabled,
          authMode: input.authMode,
          credentialsJson: JSON.stringify(input.credentials),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [sourceConfig.source, sourceConfig.instanceKey],
          set: {
            displayName: input.displayName,
            enabled: input.enabled,
            authMode: input.authMode,
            credentialsJson: JSON.stringify(input.credentials),
            updatedAt: now,
          },
        })
    },

    async listBySource(source: SourceKind) {
      return db.query.sourceConfig.findMany({
        where: eq(sourceConfig.source, source),
        orderBy: (table, { asc }) => [asc(table.instanceKey)],
      })
    },

    async listEnabled() {
      return db.query.sourceConfig.findMany({
        where: eq(sourceConfig.enabled, true),
        orderBy: [asc(sourceConfig.source), asc(sourceConfig.instanceKey)],
      })
    },

    async listAll() {
      return db.query.sourceConfig.findMany({
        orderBy: [asc(sourceConfig.source), asc(sourceConfig.instanceKey)],
      })
    },

    async get(source: SourceKind, instanceKey: string) {
      return db.query.sourceConfig.findFirst({
        where: and(
          eq(sourceConfig.source, source),
          eq(sourceConfig.instanceKey, instanceKey),
        ),
      })
    },

    async delete(source: SourceKind, instanceKey: string): Promise<void> {
      await db
        .delete(sourceConfig)
        .where(and(eq(sourceConfig.source, source), eq(sourceConfig.instanceKey, instanceKey)))
    },

    async setLastSuccessfulSyncAt(
      source: SourceKind,
      instanceKey: string,
      lastSuccessfulSyncAt: Date,
    ): Promise<void> {
      await db
        .update(sourceConfig)
        .set({
          lastSuccessfulSyncAt,
          updatedAt: clock(),
        })
        .where(and(eq(sourceConfig.source, source), eq(sourceConfig.instanceKey, instanceKey)))
    },

    async resetLastSuccessfulSyncAt(): Promise<number> {
      const rowsToReset = await db.query.sourceConfig.findMany({
        where: isNotNull(sourceConfig.lastSuccessfulSyncAt),
      })
      if (rowsToReset.length === 0) {
        return 0
      }

      await db
        .update(sourceConfig)
        .set({
          lastSuccessfulSyncAt: null,
          updatedAt: clock(),
        })
        .where(isNotNull(sourceConfig.lastSuccessfulSyncAt))

      return rowsToReset.length
    },
  }
}
