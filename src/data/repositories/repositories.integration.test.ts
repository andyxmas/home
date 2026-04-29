import { eq } from 'drizzle-orm'
import { createNotificationRepository } from './notification-repository'
import { createPersonRepository } from './person-repository'
import { createProjectRepository } from './project-repository'
import { createSourceConfigRepository } from './source-config-repository'
import { createSyncRunRepository } from './sync-run-repository'
import { notificationState } from '../db/schema'
import { createTestDatabase } from '../test/test-db'

describe('repositories integration', () => {
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

  it('upserts source config with token and oauth-ready credentials', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'slack',
      instanceKey: 'default',
      displayName: 'Slack Workspace',
      enabled: true,
      authMode: 'token',
      credentials: {
        authMode: 'token',
        token: { value: 'xoxb-secret' },
      },
    })

    await sourceConfigRepo.upsert({
      source: 'slack',
      instanceKey: 'default',
      displayName: 'Slack Workspace Updated',
      enabled: true,
      authMode: 'oauth2',
      credentials: {
        authMode: 'oauth2',
        oauth2: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-01-16T00:00:00.000Z',
          scopes: ['channels:read', 'im:read'],
        },
      },
    })

    const rows = await sourceConfigRepo.listBySource('slack')
    expect(rows).toHaveLength(1)
    expect(rows[0].displayName).toBe('Slack Workspace Updated')
    expect(rows[0].authMode).toBe('oauth2')
  })

  it('stores per-source last successful sync watermark', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'shortcut',
      instanceKey: 'default',
      displayName: 'Shortcut Workspace',
      enabled: true,
      authMode: 'token',
      credentials: {
        authMode: 'token',
        token: { value: 'shortcut-token' },
      },
    })

    const watermark = new Date('2026-01-15T11:30:00.000Z')
    await sourceConfigRepo.setLastSuccessfulSyncAt('shortcut', 'default', watermark)

    const row = await sourceConfigRepo.get('shortcut', 'default')
    expect(row?.lastSuccessfulSyncAt?.toISOString()).toBe('2026-01-15T11:30:00.000Z')

    const resetCount = await sourceConfigRepo.resetLastSuccessfulSyncAt()
    expect(resetCount).toBe(1)

    const resetRow = await sourceConfigRepo.get('shortcut', 'default')
    expect(resetRow?.lastSuccessfulSyncAt).toBeNull()
  })

  it('upserts notifications idempotently and preserves read state', async () => {
    const testDb = withDb()
    const notificationRepo = createNotificationRepository(testDb.db, clock)

    await notificationRepo.upsert({
      id: crypto.randomUUID(),
      source: 'github',
      externalId: 'thread-123',
      title: 'Initial title',
      body: 'First body',
      url: 'https://github.com/example/repo/pull/1',
      authorName: 'octocat',
      occurredAt: '2026-01-10T10:00:00.000Z',
      payload: { reason: 'mention' },
    })

    await notificationRepo.upsert({
      id: crypto.randomUUID(),
      source: 'github',
      externalId: 'thread-123',
      title: 'Updated title',
      body: 'Updated body',
      url: 'https://github.com/example/repo/pull/1',
      authorName: 'octocat',
      occurredAt: '2026-01-11T10:00:00.000Z',
      payload: { reason: 'comment' },
    })

    const rows = await notificationRepo.listActive()
    expect(rows).toHaveLength(1)
    expect(rows[0].dedupeKey).toBe('github:thread-123')
    expect(rows[0].title).toBe('Updated title')

    await notificationRepo.setReadState(rows[0].id, true)
    const state = await notificationRepo.getState(rows[0].id)
    expect(state?.isRead).toBe(true)
    expect(state?.readAt).toBeInstanceOf(Date)

    await notificationRepo.delete(rows[0].id)
    const remaining = await notificationRepo.listActive()
    expect(remaining).toHaveLength(0)
  })

  it('archives notifications older than 90 days', async () => {
    const testDb = withDb()
    const notificationRepo = createNotificationRepository(testDb.db, clock)

    const ninetyOneDaysAgo = new Date(nowMs - 91 * 24 * 60 * 60 * 1000).toISOString()
    const tenDaysAgo = new Date(nowMs - 10 * 24 * 60 * 60 * 1000).toISOString()

    await notificationRepo.upsert({
      id: crypto.randomUUID(),
      source: 'slack',
      externalId: 'old-1',
      title: 'Old notification',
      body: 'Archive me',
      occurredAt: ninetyOneDaysAgo,
      payload: { channel: 'general' },
    })

    await notificationRepo.upsert({
      id: crypto.randomUUID(),
      source: 'slack',
      externalId: 'new-1',
      title: 'Recent notification',
      body: 'Keep me',
      occurredAt: tenDaysAgo,
      payload: { channel: 'general' },
    })

    const archivedCount = await notificationRepo.archiveOlderThanDays(90)
    expect(archivedCount).toBe(1)

    const activeRows = await notificationRepo.listActive()
    expect(activeRows).toHaveLength(1)
    expect(activeRows[0].externalId).toBe('new-1')

    const archivedRows = await testDb.db.query.archiveNotification.findMany()
    expect(archivedRows).toHaveLength(1)
    expect(archivedRows[0].externalId).toBe('old-1')

    const oldState = await testDb.db.query.notificationState.findFirst({
      where: eq(notificationState.notificationId, archivedRows[0].originalNotificationId),
    })
    expect(oldState).toBeUndefined()
  })

  it('clears active inbox notifications and read state', async () => {
    const testDb = withDb()
    const notificationRepo = createNotificationRepository(testDb.db, clock)

    await notificationRepo.upsert({
      id: crypto.randomUUID(),
      source: 'github',
      externalId: 'thread-clear-1',
      title: 'Clear me',
      body: 'First',
      occurredAt: '2026-01-10T10:00:00.000Z',
      payload: { reason: 'mention' },
    })
    await notificationRepo.upsert({
      id: crypto.randomUUID(),
      source: 'slack',
      externalId: 'thread-clear-2',
      title: 'Clear me too',
      body: 'Second',
      occurredAt: '2026-01-11T10:00:00.000Z',
      payload: { channel: 'general' },
    })

    const beforeClear = await notificationRepo.listActive()
    expect(beforeClear).toHaveLength(2)
    await notificationRepo.setReadState(beforeClear[0].id, true)

    const result = await notificationRepo.clearActive()
    expect(result).toEqual({
      clearedNotifications: 2,
      clearedReadStates: 2,
    })

    const remainingNotifications = await notificationRepo.listActive()
    expect(remainingNotifications).toHaveLength(0)
    const remainingStates = await testDb.db.query.notificationState.findMany()
    expect(remainingStates).toHaveLength(0)
  })

  it('stores sync run start/completion with source config context', async () => {
    const testDb = withDb()
    const syncRunRepo = createSyncRunRepository(testDb.db, clock)

    const runId = await syncRunRepo.start({
      source: 'github',
      instanceKey: 'org-1',
      sinceUsed: '2026-01-15T11:00:00.000Z',
    })
    await syncRunRepo.complete({
      runId,
      fetchedCount: 12,
      upsertedCount: 10,
      archivedCount: 2,
    })

    const run = await syncRunRepo.get(runId)
    expect(run?.status).toBe('success')
    expect(run?.fetchedCount).toBe(12)
    expect(run?.upsertedCount).toBe(10)
    expect(run?.archivedCount).toBe(2)
    expect(run?.instanceKey).toBe('org-1')
    expect(run?.sinceUsed).toBe('2026-01-15T11:00:00.000Z')
    expect(run?.finishedAt).toBeInstanceOf(Date)

    const history = await syncRunRepo.listHistory({ source: 'github', instanceKey: 'org-1' })
    expect(history).toHaveLength(1)
    expect(history[0].id).toBe(runId)

    const cleared = await syncRunRepo.clearHistory()
    expect(cleared).toBe(1)
    expect(await syncRunRepo.listHistory()).toHaveLength(0)
  })

  it('supports project CRUD with repository and channel mappings', async () => {
    const testDb = withDb()
    const projectRepo = createProjectRepository(testDb.db, clock)

    const projectId = await projectRepo.create({
      name: 'Core',
      githubRepos: ['acme/api', 'acme/web'],
      slackChannelIds: ['C123', 'C456'],
    })
    let projects = await projectRepo.listAll()
    expect(projects).toHaveLength(1)
    expect(projects[0].githubRepos).toEqual(['acme/api', 'acme/web'])
    expect(projects[0].slackChannelIds).toEqual(['C123', 'C456'])

    await projectRepo.update(projectId, {
      name: 'Core Platform',
      githubRepos: ['acme/api'],
      slackChannelIds: ['C123'],
    })
    projects = await projectRepo.listAll()
    expect(projects[0].name).toBe('Core Platform')
    expect(projects[0].githubRepos).toEqual(['acme/api'])
    expect(projects[0].slackChannelIds).toEqual(['C123'])

    await projectRepo.delete(projectId)
    projects = await projectRepo.listAll()
    expect(projects).toHaveLength(0)
  })

  it('supports person CRUD and shortcut resolver priority with legacy fallback', async () => {
    const testDb = withDb()
    const personRepo = createPersonRepository(testDb.db, clock)

    const personId = await personRepo.create({
      name: 'Alice',
      githubUsername: 'OctoCat',
      slackUsername: 'U123',
      shortcutUserId: 'member-1',
      shortcutHandle: 'alice-handle',
    })
    const legacyPersonId = await personRepo.create({
      name: 'Legacy Shortcut User',
      shortcutUsername: 'legacy-handle',
    })

    let people = await personRepo.listAll()
    expect(people).toHaveLength(2)
    expect(people[0].name).toBe('Alice')
    expect(people[0].shortcutUserId).toBe('member-1')
    expect(people[0].shortcutHandle).toBe('alice-handle')

    await personRepo.update(personId, {
      name: 'Alice Updated',
      githubUsername: 'octocat',
      slackUsername: 'u123',
      shortcutUserId: 'MEMBER-1',
      shortcutHandle: 'ALICE-HANDLE',
    })

    people = await personRepo.listAll()
    expect(people[0].name).toBe('Alice Updated')
    expect(
      await personRepo.resolvePersonIdForNotification({
        source: 'github',
        payload: { authorLogin: 'OCTOCAT' },
      }),
    ).toBe(personId)
    expect(
      await personRepo.resolvePersonIdForNotification({
        source: 'slack',
        payload: { user: 'U123' },
      }),
    ).toBe(personId)
    expect(
      await personRepo.resolvePersonIdForNotification({
        source: 'shortcut',
        payload: {
          authorId: 'member-1',
          authorUsername: 'legacy-handle',
        },
      }),
    ).toBe(personId)
    expect(
      await personRepo.resolvePersonIdForNotification({
        source: 'shortcut',
        payload: { authorUsername: 'alice-handle' },
      }),
    ).toBe(personId)
    expect(
      await personRepo.resolvePersonIdForNotification({
        source: 'shortcut',
        payload: { authorName: 'legacy-handle' },
      }),
    ).toBe(legacyPersonId)

    await personRepo.delete(personId)
    await personRepo.delete(legacyPersonId)
    people = await personRepo.listAll()
    expect(people).toHaveLength(0)
  })

  it('resolves project mapping for shortcut, github, and slack notifications', async () => {
    const testDb = withDb()
    const sourceConfigRepo = createSourceConfigRepository(testDb.db, clock)
    const projectRepo = createProjectRepository(testDb.db, clock)

    await sourceConfigRepo.upsert({
      source: 'shortcut',
      instanceKey: 'workspace-a',
      displayName: 'Shortcut A',
      enabled: true,
      authMode: 'token',
      credentials: {
        authMode: 'token',
        token: { value: 'shortcut-token' },
      },
    })
    const shortcutSource = await sourceConfigRepo.get('shortcut', 'workspace-a')
    await projectRepo.create({
      name: 'Project A',
      shortcutSourceConfigId: shortcutSource?.id,
      githubRepos: ['acme/api'],
      slackChannelIds: ['C123'],
    })
    const projects = await projectRepo.listAll()
    const projectId = projects[0].id

    expect(
      await projectRepo.resolveProjectIdForNotification({
        source: 'shortcut',
        instanceKey: 'workspace-a',
        payload: { storyId: 123 },
      }),
    ).toBe(projectId)
    expect(
      await projectRepo.resolveProjectIdForNotification({
        source: 'github',
        instanceKey: 'main',
        payload: { repository: 'acme/api' },
      }),
    ).toBe(projectId)
    expect(
      await projectRepo.resolveProjectIdForNotification({
        source: 'slack',
        instanceKey: 'workspace-main',
        payload: { channelId: 'C123' },
      }),
    ).toBe(projectId)
    expect(
      await projectRepo.resolveProjectIdForNotification({
        source: 'github',
        instanceKey: 'main',
        payload: { repository: 'missing/repo' },
      }),
    ).toBeNull()
  })
})
