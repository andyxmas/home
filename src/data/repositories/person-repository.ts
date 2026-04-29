import { asc, eq, sql } from 'drizzle-orm'
import type { SourceKind } from '../../domain/notification'
import type { HomeDb } from '../db/client'
import { person } from '../db/schema'

type Clock = () => Date

function defaultClock(): Date {
  return new Date()
}

function normalizeIdentity(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function createPersonRepository(db: HomeDb, clock: Clock = defaultClock) {
  const findByIdentity = async (
    column:
      | typeof person.githubUsername
      | typeof person.slackUsername
      | typeof person.shortcutUserId
      | typeof person.shortcutHandle
      | typeof person.shortcutUsername,
    value: string | undefined,
  ): Promise<string | null> => {
    const normalized = value?.trim().toLowerCase()
    if (!normalized) {
      return null
    }
    const row = await db
      .select({ id: person.id })
      .from(person)
      .where(sql`lower(${column}) = ${normalized}`)
      .orderBy(asc(person.id))
      .limit(1)
    return row[0]?.id ?? null
  }

  return {
    async listAll() {
      const rows = await db.query.person.findMany({
        orderBy: [asc(person.name), asc(person.createdAt)],
      })
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        githubUsername: row.githubUsername ?? undefined,
        slackUsername: row.slackUsername ?? undefined,
        shortcutUserId: row.shortcutUserId ?? undefined,
        shortcutHandle: row.shortcutHandle ?? row.shortcutUsername ?? undefined,
        shortcutUsername: row.shortcutUsername ?? row.shortcutHandle ?? undefined,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }))
    },

    async create(input: {
      name: string
      githubUsername?: string
      slackUsername?: string
      shortcutUserId?: string
      shortcutHandle?: string
      shortcutUsername?: string
    }): Promise<string> {
      const now = clock()
      const id = crypto.randomUUID()
      await db.insert(person).values({
        id,
        name: input.name.trim(),
        githubUsername: normalizeIdentity(input.githubUsername),
        slackUsername: normalizeIdentity(input.slackUsername),
        shortcutUserId: normalizeIdentity(input.shortcutUserId),
        shortcutHandle: normalizeIdentity(input.shortcutHandle ?? input.shortcutUsername),
        // Keep legacy column populated for older clients.
        shortcutUsername: normalizeIdentity(input.shortcutUsername ?? input.shortcutHandle),
        createdAt: now,
        updatedAt: now,
      })
      return id
    },

    async update(
      id: string,
      input: {
        name: string
        githubUsername?: string
        slackUsername?: string
        shortcutUserId?: string
        shortcutHandle?: string
        shortcutUsername?: string
      },
    ): Promise<void> {
      await db
        .update(person)
        .set({
          name: input.name.trim(),
          githubUsername: normalizeIdentity(input.githubUsername),
          slackUsername: normalizeIdentity(input.slackUsername),
          shortcutUserId: normalizeIdentity(input.shortcutUserId),
          shortcutHandle: normalizeIdentity(input.shortcutHandle ?? input.shortcutUsername),
          shortcutUsername: normalizeIdentity(input.shortcutUsername ?? input.shortcutHandle),
          updatedAt: clock(),
        })
        .where(eq(person.id, id))
    },

    async delete(id: string): Promise<void> {
      await db.delete(person).where(eq(person.id, id))
    },

    async resolvePersonIdForNotification(input: {
      source: SourceKind
      payload: Record<string, unknown>
      authorName?: string
    }): Promise<string | null> {
      if (input.source === 'github') {
        const authorLogin =
          typeof input.payload.authorLogin === 'string'
            ? input.payload.authorLogin
            : typeof input.payload.author === 'string'
              ? input.payload.author
              : undefined
        return (
          (await findByIdentity(person.githubUsername, authorLogin)) ??
          (await findByIdentity(person.githubUsername, input.authorName))
        )
      }

      if (input.source === 'slack') {
        const slackUser =
          typeof input.payload.username === 'string'
            ? input.payload.username
            : typeof input.payload.user === 'string'
              ? input.payload.user
              : undefined
        return (
          (await findByIdentity(person.slackUsername, slackUser)) ??
          (await findByIdentity(person.slackUsername, input.authorName))
        )
      }

      if (input.source === 'shortcut') {
        const authorIdRaw =
          typeof input.payload.authorId === 'string'
            ? input.payload.authorId
            : typeof input.payload.authorId === 'number'
              ? String(input.payload.authorId)
              : undefined
        const handleCandidates = [
          input.payload.authorHandle,
          input.payload.authorUsername,
          input.payload.authorLogin,
          input.payload.authorName,
          input.payload.author,
          input.authorName,
        ]
        const shortcutHandle = handleCandidates.find(
          (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
        )

        return (
          (await findByIdentity(person.shortcutUserId, authorIdRaw)) ??
          (await findByIdentity(person.shortcutHandle, shortcutHandle)) ??
          // Legacy fallback for pre-split Shortcut identity records.
          (await findByIdentity(person.shortcutUsername, authorIdRaw)) ??
          (await findByIdentity(person.shortcutUsername, shortcutHandle))
        )
      }

      return null
    },
  }
}
