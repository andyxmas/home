import { and, asc, eq, inArray } from 'drizzle-orm'
import type { SourceKind } from '../../domain/notification'
import type { HomeDb } from '../db/client'
import { project, projectGithubRepo, projectSlackChannel, sourceConfig } from '../db/schema'

type Clock = () => Date

function defaultClock(): Date {
  return new Date()
}

function toProjectDto(input: {
  id: string
  name: string
  shortcutSourceConfigId: string | null
  createdAt: Date
  updatedAt: Date
  githubRepos: string[]
  slackChannelIds: string[]
}) {
  return {
    id: input.id,
    name: input.name,
    shortcutSourceConfigId: input.shortcutSourceConfigId ?? undefined,
    githubRepos: input.githubRepos,
    slackChannelIds: input.slackChannelIds,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  }
}

function parseMappedRepo(payloadJson: string): string | undefined {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>
    const repository = payload.repository
    return typeof repository === 'string' && repository.trim() ? repository.trim() : undefined
  } catch {
    return undefined
  }
}

function parseMappedSlackChannel(payloadJson: string): string | undefined {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>
    const channelId = payload.channelId
    return typeof channelId === 'string' && channelId.trim() ? channelId.trim() : undefined
  } catch {
    return undefined
  }
}

export function createProjectRepository(db: HomeDb, clock: Clock = defaultClock) {
  return {
    async listAll() {
      const rows = await db.query.project.findMany({
        orderBy: [asc(project.name), asc(project.createdAt)],
      })
      if (rows.length === 0) {
        return []
      }

      const projectIds = rows.map((row) => row.id)
      const githubRows = await db.query.projectGithubRepo.findMany({
        where: inArray(projectGithubRepo.projectId, projectIds),
        orderBy: [asc(projectGithubRepo.repoFullName)],
      })
      const slackRows = await db.query.projectSlackChannel.findMany({
        where: inArray(projectSlackChannel.projectId, projectIds),
        orderBy: [asc(projectSlackChannel.slackChannelId)],
      })

      const githubByProject = new Map<string, string[]>()
      for (const row of githubRows) {
        const list = githubByProject.get(row.projectId) ?? []
        list.push(row.repoFullName)
        githubByProject.set(row.projectId, list)
      }
      const slackByProject = new Map<string, string[]>()
      for (const row of slackRows) {
        const list = slackByProject.get(row.projectId) ?? []
        list.push(row.slackChannelId)
        slackByProject.set(row.projectId, list)
      }

      return rows.map((row) =>
        toProjectDto({
          id: row.id,
          name: row.name,
          shortcutSourceConfigId: row.shortcutSourceConfigId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          githubRepos: githubByProject.get(row.id) ?? [],
          slackChannelIds: slackByProject.get(row.id) ?? [],
        }),
      )
    },

    async create(input: {
      name: string
      shortcutSourceConfigId?: string
      githubRepos: string[]
      slackChannelIds: string[]
    }) {
      const now = clock()
      const id = crypto.randomUUID()
      await db.insert(project).values({
        id,
        name: input.name,
        shortcutSourceConfigId: input.shortcutSourceConfigId ?? null,
        createdAt: now,
        updatedAt: now,
      })

      if (input.githubRepos.length > 0) {
        await db.insert(projectGithubRepo).values(
          input.githubRepos.map((repoFullName) => ({
            projectId: id,
            repoFullName,
          })),
        )
      }
      if (input.slackChannelIds.length > 0) {
        await db.insert(projectSlackChannel).values(
          input.slackChannelIds.map((slackChannelId) => ({
            projectId: id,
            slackChannelId,
          })),
        )
      }

      return id
    },

    async update(
      id: string,
      input: {
        name: string
        shortcutSourceConfigId?: string
        githubRepos: string[]
        slackChannelIds: string[]
      },
    ): Promise<void> {
      await db
        .update(project)
        .set({
          name: input.name,
          shortcutSourceConfigId: input.shortcutSourceConfigId ?? null,
          updatedAt: clock(),
        })
        .where(eq(project.id, id))

      await db.delete(projectGithubRepo).where(eq(projectGithubRepo.projectId, id))
      await db.delete(projectSlackChannel).where(eq(projectSlackChannel.projectId, id))

      if (input.githubRepos.length > 0) {
        await db.insert(projectGithubRepo).values(
          input.githubRepos.map((repoFullName) => ({
            projectId: id,
            repoFullName,
          })),
        )
      }
      if (input.slackChannelIds.length > 0) {
        await db.insert(projectSlackChannel).values(
          input.slackChannelIds.map((slackChannelId) => ({
            projectId: id,
            slackChannelId,
          })),
        )
      }
    },

    async delete(id: string): Promise<void> {
      await db.delete(project).where(eq(project.id, id))
    },

    async resolveProjectIdForNotification(input: {
      source: SourceKind
      instanceKey: string
      payload: Record<string, unknown>
    }): Promise<string | null> {
      if (input.source === 'shortcut') {
        const shortcutConfig = await db.query.sourceConfig.findFirst({
          where: and(
            eq(sourceConfig.source, 'shortcut'),
            eq(sourceConfig.instanceKey, input.instanceKey),
          ),
        })
        if (!shortcutConfig) {
          return null
        }
        const projectRow = await db.query.project.findFirst({
          where: eq(project.shortcutSourceConfigId, shortcutConfig.id),
        })
        return projectRow?.id ?? null
      }

      if (input.source === 'github') {
        const repository = input.payload.repository
        if (typeof repository !== 'string' || !repository.trim()) {
          return null
        }
        const repoRow = await db.query.projectGithubRepo.findFirst({
          where: eq(projectGithubRepo.repoFullName, repository.trim()),
        })
        return repoRow?.projectId ?? null
      }

      if (input.source === 'slack') {
        const channelId = input.payload.channelId
        if (typeof channelId !== 'string' || !channelId.trim()) {
          return null
        }
        const channelRow = await db.query.projectSlackChannel.findFirst({
          where: eq(projectSlackChannel.slackChannelId, channelId.trim()),
        })
        return channelRow?.projectId ?? null
      }

      return null
    },

    async listMetadata() {
      const shortcutSources = await db.query.sourceConfig.findMany({
        where: eq(sourceConfig.source, 'shortcut'),
        orderBy: [asc(sourceConfig.instanceKey)],
      })
      const notifications = await db.query.notification.findMany({
        columns: {
          source: true,
          payloadJson: true,
        },
      })

      const knownGithubRepos = new Set<string>()
      const knownSlackChannels = new Set<string>()
      for (const row of notifications) {
        if (row.source === 'github') {
          const repo = parseMappedRepo(row.payloadJson)
          if (repo) {
            knownGithubRepos.add(repo)
          }
        }
        if (row.source === 'slack') {
          const channelId = parseMappedSlackChannel(row.payloadJson)
          if (channelId) {
            knownSlackChannels.add(channelId)
          }
        }
      }

      return {
        shortcutSources: shortcutSources.map((row) => ({
          id: row.id,
          instanceKey: row.instanceKey,
          displayName: row.displayName,
        })),
        knownGithubRepos: [...knownGithubRepos].sort((a, b) => a.localeCompare(b)),
        knownSlackChannels: [...knownSlackChannels].sort((a, b) => a.localeCompare(b)),
      }
    },
  }
}
