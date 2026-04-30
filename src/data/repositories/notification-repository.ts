import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import type { CanonicalNotification } from '../../domain/notification'
import type { HomeDb } from '../db/client'
import { archiveNotification, notification, notificationState } from '../db/schema'
import { buildDedupeKey } from './dedupe'

type Clock = () => Date

function defaultClock(): Date {
  return new Date()
}

export type UpsertNotificationInput = Omit<CanonicalNotification, 'dedupeKey'>
export type ClearNotificationsResult = {
  clearedNotifications: number
  clearedReadStates: number
}

export function createNotificationRepository(db: HomeDb, clock: Clock = defaultClock) {
  return {
    async upsert(input: UpsertNotificationInput) {
      const now = clock()
      const dedupeKey = buildDedupeKey(input.source, input.externalId)

      await db
        .insert(notification)
        .values({
          id: crypto.randomUUID(),
          source: input.source,
          externalId: input.externalId,
          dedupeKey,
          title: input.title,
          body: input.body,
          url: input.url,
          authorName: input.authorName,
          occurredAt: new Date(input.occurredAt),
          payloadJson: JSON.stringify(input.payload),
          projectId: input.projectId ?? null,
          fromPersonId: input.fromPersonId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: notification.dedupeKey,
          set: {
            title: input.title,
            body: input.body,
            url: input.url,
            authorName: input.authorName,
            occurredAt: new Date(input.occurredAt),
            payloadJson: JSON.stringify(input.payload),
            projectId: input.projectId ?? null,
            fromPersonId: input.fromPersonId ?? null,
            updatedAt: now,
          },
        })

      const saved = await db.query.notification.findFirst({
        where: eq(notification.dedupeKey, dedupeKey),
      })

      if (!saved) {
        throw new Error(`Failed to load notification for dedupe key: ${dedupeKey}`)
      }

      await db
        .insert(notificationState)
        .values({
          notificationId: saved.id,
          isRead: false,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: notificationState.notificationId,
        })

      return saved
    },

    async getByDedupeKey(source: string, externalId: string) {
      const dedupeKey = buildDedupeKey(source, externalId)
      return db.query.notification.findFirst({
        where: eq(notification.dedupeKey, dedupeKey),
      })
    },

    async listActive() {
      return db.query.notification.findMany({
        orderBy: (table, { desc }) => [desc(table.occurredAt)],
      })
    },

    async listActiveWithState() {
      const notifications = await db.query.notification.findMany({
        orderBy: (table, { desc }) => [desc(table.occurredAt)],
      })

      if (notifications.length === 0) {
        return []
      }

      const states = await db.query.notificationState.findMany({
        where: inArray(
          notificationState.notificationId,
          notifications.map((row) => row.id),
        ),
      })
      const stateById = new Map(states.map((state) => [state.notificationId, state]))

      return notifications.map((row) => ({
        notification: row,
        state: stateById.get(row.id) ?? null,
      }))
    },

    async listUnreadActiveWithState() {
      const notifications = await db.query.notification.findMany({
        orderBy: (table, { desc }) => [desc(table.occurredAt)],
      })

      if (notifications.length === 0) {
        return []
      }

      const states = await db.query.notificationState.findMany({
        where: inArray(
          notificationState.notificationId,
          notifications.map((row) => row.id),
        ),
      })
      const stateById = new Map(states.map((state) => [state.notificationId, state]))

      return notifications
        .map((row) => ({
          notification: row,
          state: stateById.get(row.id) ?? null,
        }))
        .filter(({ state }) => !state?.isRead)
    },

    async setReadState(notificationId: string, isRead: boolean) {
      const now = clock()
      await db
        .update(notificationState)
        .set({
          isRead,
          readAt: isRead ? now : null,
          updatedAt: now,
        })
        .where(eq(notificationState.notificationId, notificationId))
    },

    async markAllActiveAsRead() {
      const now = clock()
      const [unreadSummary] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notificationState)
        .where(eq(notificationState.isRead, false))
      const unreadCount = Number(unreadSummary?.count ?? 0)
      if (unreadCount === 0) {
        return 0
      }

      await db
        .update(notificationState)
        .set({
          isRead: true,
          readAt: now,
          updatedAt: now,
        })
        .where(eq(notificationState.isRead, false))
      return unreadCount
    },

    async getState(notificationId: string) {
      return db.query.notificationState.findFirst({
        where: eq(notificationState.notificationId, notificationId),
      })
    },

    async delete(notificationId: string) {
      await db.delete(notification).where(eq(notification.id, notificationId))
    },

    async clearActive(): Promise<ClearNotificationsResult> {
      const notifications = await db.query.notification.findMany()
      const states = await db.query.notificationState.findMany()

      await db.delete(notificationState)
      await db.delete(notification)

      return {
        clearedNotifications: notifications.length,
        clearedReadStates: states.length,
      }
    },

    async archiveOlderThanDays(days = 90): Promise<number> {
      const now = clock()
      const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      const staleRows = await db.query.notification.findMany({
        where: lt(notification.occurredAt, threshold),
      })

      if (staleRows.length === 0) {
        return 0
      }

      await db
        .insert(archiveNotification)
        .values(
          staleRows.map((row) => ({
            id: crypto.randomUUID(),
            originalNotificationId: row.id,
            source: row.source,
            externalId: row.externalId,
            dedupeKey: row.dedupeKey,
            title: row.title,
            body: row.body,
            url: row.url,
            authorName: row.authorName,
            occurredAt: row.occurredAt,
            payloadJson: row.payloadJson,
            archivedAt: now,
          })),
        )
        .onConflictDoNothing({
          target: archiveNotification.originalNotificationId,
        })

      const ids = staleRows.map((row) => row.id)
      await db.delete(notificationState).where(inArray(notificationState.notificationId, ids))
      await db
        .delete(notification)
        .where(and(inArray(notification.id, ids), lt(notification.occurredAt, threshold)))

      return staleRows.length
    },
  }
}
