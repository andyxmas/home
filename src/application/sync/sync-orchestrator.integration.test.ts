import { createAdapterRegistry } from './adapter-registry'
import { createSyncOrchestrator } from './sync-orchestrator'
import { buildInitialSyncSince } from './sync-defaults'
import type { SourceAdapter } from '../../domain/source-adapter'
import { createNotificationRepository } from '../../data/repositories/notification-repository'
import { createPersonRepository } from '../../data/repositories/person-repository'
import { createProjectRepository } from '../../data/repositories/project-repository'
import { createSourceConfigRepository } from '../../data/repositories/source-config-repository'
import { createSyncRunRepository } from '../../data/repositories/sync-run-repository'
import { createTestDatabase } from '../../data/test/test-db'

describe('sync orchestrator integration', () => {
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

  it('syncs multiple enabled sources successfully', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'slack',
      instanceKey: 'workspace-1',
      displayName: 'Slack One',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'slack-token' } },
    })
    await sourceConfigRepo.upsert({
      source: 'github',
      instanceKey: 'org-1',
      displayName: 'GitHub One',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'ghp-secret' } },
    })

    const adapters: SourceAdapter[] = [
      {
        source: 'slack',
        async fetchNotifications() {
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'slack',
                externalId: 'slack-1',
                dedupeKey: 'ignored',
                title: 'Slack mention',
                occurredAt: '2026-01-14T10:00:00.000Z',
                payload: { channel: 'general' },
              },
            ],
          }
        },
      },
      {
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
      },
    ]

    const orchestrator = createSyncOrchestrator(
      {
        sourceConfigRepository: sourceConfigRepo,
        syncRunRepository: syncRunRepo,
        notificationRepository: notificationRepo,
        adapterRegistry: createAdapterRegistry(adapters),
      },
      clock,
    )

    const result = await orchestrator.syncAllSources()
    expect(result.totalSources).toBe(2)
    expect(result.succeededSources).toBe(2)
    expect(result.failedSources).toBe(0)
    expect(result.totalUpserted).toBe(2)

    const runs = await testDb.db.query.syncRun.findMany()
    expect(runs).toHaveLength(2)
    expect(runs.every((run) => run.status === 'success')).toBe(true)

    const notifications = await notificationRepo.listActive()
    expect(notifications).toHaveLength(2)

    const configs = await sourceConfigRepo.listEnabled()
    expect(configs.every((config) => config.lastSuccessfulSyncAt instanceof Date)).toBe(true)
  })

  it('isolates source failures and continues other sources', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'slack',
      instanceKey: 'workspace-1',
      displayName: 'Slack One',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'slack-token' } },
    })
    await sourceConfigRepo.upsert({
      source: 'github',
      instanceKey: 'org-1',
      displayName: 'GitHub One',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'ghp-secret' } },
    })

    const adapters: SourceAdapter[] = [
      {
        source: 'slack',
        async fetchNotifications() {
          throw new Error('Slack unavailable')
        },
      },
      {
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
      },
    ]

    const orchestrator = createSyncOrchestrator(
      {
        sourceConfigRepository: sourceConfigRepo,
        syncRunRepository: syncRunRepo,
        notificationRepository: notificationRepo,
        adapterRegistry: createAdapterRegistry(adapters),
      },
      clock,
    )

    const result = await orchestrator.syncAllSources()
    expect(result.succeededSources).toBe(1)
    expect(result.failedSources).toBe(1)
    expect(result.totalUpserted).toBe(1)

    const slackSummary = result.sources.find((source) => source.source === 'slack')
    expect(slackSummary?.status).toBe('failed')
    expect(slackSummary?.error).toContain('Slack unavailable')

    const runs = await testDb.db.query.syncRun.findMany()
    expect(runs).toHaveLength(2)
    expect(runs.some((run) => run.status === 'failed')).toBe(true)
    expect(runs.some((run) => run.status === 'success')).toBe(true)

    const slackConfig = await sourceConfigRepo.get('slack', 'workspace-1')
    const githubConfig = await sourceConfigRepo.get('github', 'org-1')
    expect(slackConfig?.lastSuccessfulSyncAt).toBeNull()
    expect(githubConfig?.lastSuccessfulSyncAt).toBeInstanceOf(Date)
  })

  it('upserts notifications idempotently across repeated sync runs', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)

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
              title: 'Latest title',
              occurredAt: '2026-01-14T11:00:00.000Z',
              payload: { repo: 'home', updated: true },
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
        adapterRegistry: createAdapterRegistry([adapter]),
      },
      clock,
    )

    await orchestrator.syncAllSources()
    nowMs += 60_000
    await orchestrator.syncAllSources()

    const notifications = await notificationRepo.listActive()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].dedupeKey).toBe('github:gh-1')

    const runs = await testDb.db.query.syncRun.findMany()
    expect(runs).toHaveLength(2)
  })

  it('passes source watermark as since and advances it only after successful sync', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)
    const sinceValues: Array<string | undefined> = []

    await sourceConfigRepo.upsert({
      source: 'shortcut',
      instanceKey: 'team-1',
      displayName: 'Shortcut Team',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'secret' } },
    })

    const adapter: SourceAdapter = {
      source: 'shortcut',
      async fetchNotifications(_config, input) {
        sinceValues.push(input.since)
        return {
          notifications: [
            {
              id: crypto.randomUUID(),
              source: 'shortcut',
              externalId: 'story:1',
              dedupeKey: 'ignored',
              title: 'Mention',
              occurredAt: '2026-01-14T11:00:00.000Z',
              payload: {},
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
        adapterRegistry: createAdapterRegistry([adapter]),
      },
      clock,
    )

    await orchestrator.syncAllSources()
    const afterFirstRun = await sourceConfigRepo.get('shortcut', 'team-1')
    expect(afterFirstRun?.lastSuccessfulSyncAt?.toISOString()).toBe('2026-01-15T12:00:00.000Z')
    expect(sinceValues[0]).toBe(buildInitialSyncSince(new Date('2026-01-15T12:00:00.000Z')))
    const firstRun = (await syncRunRepo.listHistory({ source: 'shortcut', instanceKey: 'team-1' }))[0]
    expect(firstRun.instanceKey).toBe('team-1')
    expect(firstRun.sinceUsed).toBe(buildInitialSyncSince(new Date('2026-01-15T12:00:00.000Z')))

    nowMs += 60_000
    await orchestrator.syncAllSources()

    const afterSecondRun = await sourceConfigRepo.get('shortcut', 'team-1')
    expect(afterSecondRun?.lastSuccessfulSyncAt?.toISOString()).toBe('2026-01-15T12:01:00.000Z')
    expect(sinceValues[1]).toBe('2026-01-15T12:00:00.000Z')
    const runs = await syncRunRepo.listHistory({ source: 'shortcut', instanceKey: 'team-1' })
    expect(runs).toHaveLength(2)
    expect(runs[0].sinceUsed).toBe('2026-01-15T12:00:00.000Z')
  })

  it('follows adapter cursors to fetch all pages', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)
    const cursorsSeen: string[] = []

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
      async fetchNotifications(_config, input) {
        const cursor = input.cursor?.cursor
        cursorsSeen.push(cursor ?? 'first-page')
        if (!cursor) {
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'github',
                externalId: 'gh-1',
                dedupeKey: 'ignored',
                title: 'Page 1',
                occurredAt: '2026-01-14T11:00:00.000Z',
                payload: {},
              },
            ],
            nextCursor: { cursor: '2' },
          }
        }

        return {
          notifications: [
            {
              id: crypto.randomUUID(),
              source: 'github',
              externalId: 'gh-2',
              dedupeKey: 'ignored',
              title: 'Page 2',
              occurredAt: '2026-01-14T12:00:00.000Z',
              payload: {},
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
        adapterRegistry: createAdapterRegistry([adapter]),
      },
      clock,
    )

    const result = await orchestrator.syncAllSources()
    expect(result.totalFetched).toBe(2)
    expect(cursorsSeen).toEqual(['first-page', '2'])
  })

  it('syncs only the targeted enabled source', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)
    const fetchedSources: string[] = []

    await sourceConfigRepo.upsert({
      source: 'github',
      instanceKey: 'main',
      displayName: 'GitHub Main',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'ghp-main' } },
    })
    await sourceConfigRepo.upsert({
      source: 'slack',
      instanceKey: 'workspace-1',
      displayName: 'Slack One',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'xoxb-one' } },
    })

    const adapters: SourceAdapter[] = [
      {
        source: 'github',
        async fetchNotifications(config, input) {
          fetchedSources.push(`${config.source}:${config.instanceKey}:${input.since ?? 'none'}`)
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'github',
                externalId: 'gh-single',
                dedupeKey: 'ignored',
                title: 'Single source sync',
                occurredAt: '2026-01-14T11:00:00.000Z',
                payload: {},
              },
            ],
          }
        },
      },
      {
        source: 'slack',
        async fetchNotifications(config) {
          fetchedSources.push(`${config.source}:${config.instanceKey}:unexpected`)
          return { notifications: [] }
        },
      },
    ]

    const orchestrator = createSyncOrchestrator(
      {
        sourceConfigRepository: sourceConfigRepo,
        syncRunRepository: syncRunRepo,
        notificationRepository: notificationRepo,
        adapterRegistry: createAdapterRegistry(adapters),
      },
      clock,
    )

    const firstResult = await orchestrator.syncSingleSource({ source: 'github', instanceKey: 'main' })
    expect(firstResult.totalSources).toBe(1)
    expect(firstResult.sources[0].source).toBe('github')
    expect(firstResult.sources[0].instanceKey).toBe('main')
    expect(fetchedSources).toEqual(['github:main:2026-01-08T12:00:00.000Z'])

    nowMs += 60_000
    await orchestrator.syncSingleSource({ source: 'github', instanceKey: 'main' })
    expect(fetchedSources[1]).toBe('github:main:2026-01-15T12:00:00.000Z')

    const runs = await syncRunRepo.listHistory()
    expect(runs).toHaveLength(2)
    expect(runs.every((run) => run.source === 'github')).toBe(true)
    expect(runs[0].sinceUsed).toBe('2026-01-15T12:00:00.000Z')

    const githubConfig = await sourceConfigRepo.get('github', 'main')
    const slackConfig = await sourceConfigRepo.get('slack', 'workspace-1')
    expect(githubConfig?.lastSuccessfulSyncAt?.toISOString()).toBe('2026-01-15T12:01:00.000Z')
    expect(slackConfig?.lastSuccessfulSyncAt).toBeNull()
  })

  it('assigns project IDs during upsert for shortcut/github/slack notifications', async () => {
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
      credentials: { authMode: 'token', token: { value: 'shortcut-token' } },
    })
    await sourceConfigRepo.upsert({
      source: 'github',
      instanceKey: 'main',
      displayName: 'GitHub Main',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'ghp-secret' } },
    })
    await sourceConfigRepo.upsert({
      source: 'slack',
      instanceKey: 'workspace-main',
      displayName: 'Slack Main',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'xoxb-secret' } },
    })

    const shortcutConfig = await sourceConfigRepo.get('shortcut', 'workspace-a')
    await projectRepo.create({
      name: 'Shortcut Project',
      shortcutSourceConfigId: shortcutConfig?.id,
      githubRepos: [],
      slackChannelIds: [],
    })
    await projectRepo.create({
      name: 'GitHub Project',
      githubRepos: ['acme/api'],
      slackChannelIds: [],
    })
    await projectRepo.create({
      name: 'Slack Project',
      githubRepos: [],
      slackChannelIds: ['C123'],
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
                externalId: 'story:1',
                dedupeKey: 'ignored',
                title: 'Shortcut mention',
                occurredAt: '2026-01-14T11:00:00.000Z',
                payload: { storyId: 1 },
              },
            ],
          }
        },
      },
      {
        source: 'github',
        async fetchNotifications() {
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'github',
                externalId: 'gh-1',
                dedupeKey: 'ignored',
                title: 'GitHub mention',
                occurredAt: '2026-01-14T11:10:00.000Z',
                payload: { repository: 'acme/api' },
              },
            ],
          }
        },
      },
      {
        source: 'slack',
        async fetchNotifications() {
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'slack',
                externalId: 'C123:1',
                dedupeKey: 'ignored',
                title: 'Slack mention',
                occurredAt: '2026-01-14T11:20:00.000Z',
                payload: { channelId: 'C123' },
              },
            ],
          }
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

    await orchestrator.syncAllSources()
    const active = await notificationRepo.listActive()
    expect(active).toHaveLength(3)
    expect(active.every((row) => row.projectId)).toBe(true)
  })

  it('assigns from person IDs during upsert across sources', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)
    const notificationRepo = createNotificationRepository(testDb.db, clock)
    const personRepo = createPersonRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'shortcut',
      instanceKey: 'workspace-a',
      displayName: 'Shortcut A',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'shortcut-token' } },
    })
    await sourceConfigRepo.upsert({
      source: 'github',
      instanceKey: 'main',
      displayName: 'GitHub Main',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'ghp-secret' } },
    })
    await sourceConfigRepo.upsert({
      source: 'slack',
      instanceKey: 'workspace-main',
      displayName: 'Slack Main',
      enabled: true,
      authMode: 'token',
      credentials: { authMode: 'token', token: { value: 'xoxb-secret' } },
    })

    const githubPersonId = await personRepo.create({
      name: 'GitHub Alice',
      githubUsername: 'OctoCat',
    })
    const slackPersonId = await personRepo.create({
      name: 'Slack Bob',
      slackUsername: 'u123',
    })
    const shortcutPersonId = await personRepo.create({
      name: 'Shortcut Carol',
      shortcutUserId: 'member-77',
      shortcutHandle: 'carol-shortcut',
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
                externalId: 'story:1',
                dedupeKey: 'ignored',
                title: 'Shortcut mention',
                authorName: 'CAROL-SHORTCUT',
                occurredAt: '2026-01-14T11:00:00.000Z',
                payload: { authorId: 'member-77', authorUsername: 'carol-shortcut' },
              },
            ],
          }
        },
      },
      {
        source: 'github',
        async fetchNotifications() {
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'github',
                externalId: 'gh-1',
                dedupeKey: 'ignored',
                title: 'GitHub mention',
                authorName: 'octocat',
                occurredAt: '2026-01-14T11:10:00.000Z',
                payload: { repository: 'acme/api', authorLogin: 'octocat' },
              },
            ],
          }
        },
      },
      {
        source: 'slack',
        async fetchNotifications() {
          return {
            notifications: [
              {
                id: crypto.randomUUID(),
                source: 'slack',
                externalId: 'C123:1',
                dedupeKey: 'ignored',
                title: 'Slack mention',
                authorName: 'U123',
                occurredAt: '2026-01-14T11:20:00.000Z',
                payload: { channelId: 'C123', user: 'u123' },
              },
            ],
          }
        },
      },
    ]

    const orchestrator = createSyncOrchestrator(
      {
        sourceConfigRepository: sourceConfigRepo,
        syncRunRepository: syncRunRepo,
        notificationRepository: notificationRepo,
        personRepository: personRepo,
        adapterRegistry: createAdapterRegistry(adapters),
      },
      clock,
    )

    await orchestrator.syncAllSources()
    const active = await notificationRepo.listActive()
    expect(active).toHaveLength(3)
    const bySource = new Map(active.map((row) => [row.source, row]))
    expect(bySource.get('github')?.fromPersonId).toBe(githubPersonId)
    expect(bySource.get('slack')?.fromPersonId).toBe(slackPersonId)
    expect(bySource.get('shortcut')?.fromPersonId).toBe(shortcutPersonId)
  })
})
