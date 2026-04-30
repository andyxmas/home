import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { WorkColumn, WorkItem, WorkKind, WorkSource } from '../../domain/work'
import type { HomeDb } from '../db/client'
import { workItem } from '../db/schema'

type Clock = () => Date

function defaultClock(): Date {
  return new Date()
}

function asWorkColumn(value: string): WorkColumn {
  if (value === 'today' || value === 'soon' || value === 'later') {
    return value
  }
  return 'soon'
}

export function createWorkRepository(db: HomeDb, clock: Clock = defaultClock) {
  return {
    async listAll(): Promise<WorkItem[]> {
      const rows = await db.query.workItem.findMany({
        orderBy: (table) => [asc(table.column), asc(table.position), asc(table.updatedAt)],
      })
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind as WorkKind,
        source: row.source as WorkSource,
        dedupeKey: row.dedupeKey,
        externalId: row.externalId ?? undefined,
        title: row.title,
        body: row.body ?? undefined,
        url: row.url ?? undefined,
        projectId: row.projectId ?? undefined,
        column: asWorkColumn(row.column),
        position: row.position,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }))
    },

    async getById(id: string) {
      return db.query.workItem.findFirst({ where: eq(workItem.id, id) })
    },

    async upsert(
      input: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt' | 'position'> & { id?: string; position?: number },
    ) {
      const now = clock()

      // Allocate a position if needed (append to end of column).
      let position = input.position
      if (position == null || !Number.isFinite(position)) {
        const [summary] = await db
          .select({ max: sql<number | null>`max(${workItem.position})` })
          .from(workItem)
          .where(eq(workItem.column, input.column))
        const maxPosition = summary?.max == null ? -1 : Number(summary.max)
        position = maxPosition + 1
      }

      const id = input.id ?? crypto.randomUUID()
      await db
        .insert(workItem)
        .values({
          id,
          kind: input.kind,
          source: input.source,
          dedupeKey: input.dedupeKey,
          externalId: input.externalId ?? null,
          title: input.title,
          body: input.body ?? null,
          url: input.url ?? null,
          projectId: input.projectId ?? null,
          column: input.column,
          position,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: workItem.dedupeKey,
          set: {
            kind: input.kind,
            source: input.source,
            externalId: input.externalId ?? null,
            title: input.title,
            body: input.body ?? null,
            url: input.url ?? null,
            projectId: input.projectId ?? null,
            // preserve user-controlled column/position unless explicitly provided
            ...(input.column ? { column: input.column } : {}),
            ...(input.position == null ? {} : { position }),
            updatedAt: now,
          },
        })

      const saved = await db.query.workItem.findFirst({
        where: eq(workItem.dedupeKey, input.dedupeKey),
      })
      if (!saved) {
        throw new Error(`Failed to load work item for dedupe key: ${input.dedupeKey}`)
      }
      return saved
    },

    async moveWorkItem(id: string, column: WorkColumn, position: number) {
      const now = clock()
      await db
        .update(workItem)
        .set({
          column,
          position,
          updatedAt: now,
        })
        .where(eq(workItem.id, id))
    },

    async reorderColumn(column: WorkColumn, orderedIds: string[]) {
      const now = clock()
      if (orderedIds.length === 0) {
        return
      }

      // Ensure all ids belong to the column we are reordering.
      const rows = await db.query.workItem.findMany({
        where: and(eq(workItem.column, column), inArray(workItem.id, orderedIds)),
      })
      const rowIds = new Set(rows.map((row) => row.id))
      for (const id of orderedIds) {
        if (!rowIds.has(id)) {
          throw new Error(`Cannot reorder: work item ${id} is not in column ${column}`)
        }
      }

      // Update positions in a transaction-ish batch. better-sqlite3 is sync, drizzle will serialize.
      for (let index = 0; index < orderedIds.length; index++) {
        await db
          .update(workItem)
          .set({ position: index, updatedAt: now })
          .where(eq(workItem.id, orderedIds[index]))
      }
    },
  }
}

