import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { createAdapterRegistry } from '../application/sync/adapter-registry'
import {
  createClearNotificationsService,
  type ClearAllNotificationsResult,
} from '../application/inbox/clear-notifications-service'
import { createMarkAllReadService } from '../application/inbox/mark-all-read-service'
import { createSyncOrchestrator } from '../application/sync/sync-orchestrator'
import { createLocalSnapshotStore } from '../application/sync/local-snapshot-store'
import { createDefaultSourceAdapters } from '../adapters/local/default-source-adapters'
import { createDatabase } from '../data/db'
import {
  createNotificationRepository,
  createPersonRepository,
  createProjectRepository,
  createSourceConfigRepository,
  createSyncRunRepository,
  createWorkRepository,
} from '../data/repositories'
import { notification } from '../data/db/schema'
import type { WorkColumn, WorkItem } from '../domain/work'
import { syncShortcutWorkItems } from '../application/work/shortcut-work-sync-service'
import { DEFAULT_SHORTCUT_ALLOWED_WORKFLOW_STATES, type SourceConfig, type SourceKind } from '../domain/notification'
import type { Person } from '../domain/person'
import type { Project, ProjectMetadata } from '../domain/project'
import type { ManualSyncService } from './manual-sync-endpoint'

const LOCAL_DB_PATH = resolve(process.cwd(), '.home', 'home.sqlite')
const MIGRATION_PATH = resolve(process.cwd(), 'src/data/db/migrations/0000_initial.sql')

export type LocalHomeService = ManualSyncService & {
  listSourceConfigs(): Promise<SourceConfig[]>
  upsertSourceConfig(input: {
    source: SourceKind
    instanceKey: string
    displayName: string
    enabled: boolean
    token: string
    slackUserId?: string
    slackWorkspaceUrl?: string
    shortcutAllowedWorkflowStates?: string[]
    githubApiBaseUrl?: string
    githubParticipating?: boolean
  }): Promise<void>
  deleteSourceConfig(source: SourceKind, instanceKey: string): Promise<void>
  listInboxItems(): Promise<
    Array<{
      id: string
      source: SourceKind
      projectId?: string
      projectName?: string
      fromPersonId?: string
      fromPersonName?: string
      title: string
      body?: string
      url?: string
      authorName?: string
      occurredAt: string
      isRead: boolean
      readAt?: string
    }>
  >
  setInboxReadState(notificationId: string, isRead: boolean): Promise<void>
  markAllAsRead(): Promise<{ changedCount: number }>
  listProjects(): Promise<Project[]>
  listPeople(): Promise<Person[]>
  upsertProject(input: {
    id?: string
    name: string
    shortcutSourceConfigId?: string
    githubRepos: string[]
    slackChannelIds: string[]
  }): Promise<string>
  deleteProject(projectId: string): Promise<void>
  upsertPerson(input: {
    id?: string
    name: string
    isMe?: boolean
    githubUsername?: string
    slackUsername?: string
    shortcutUserId?: string
    shortcutHandle?: string
    shortcutUsername?: string
  }): Promise<string>
  deletePerson(personId: string): Promise<void>
  listProjectMetadata(): Promise<ProjectMetadata>
  clearAllNotifications(): Promise<ClearAllNotificationsResult>
  listSyncHistory(filters?: {
    source?: SourceKind
    instanceKey?: string
    limit?: number
  }): Promise<
    Array<{
      runId: string
      source: SourceKind
      instanceKey: string
      status: 'running' | 'success' | 'failed'
      startedAt: string
      finishedAt?: string
      fetchedCount: number
      upsertedCount: number
      archivedCount: number
      errorMessage?: string
      sinceUsed?: string
    }>
  >

  listWorkItems(): Promise<import('../domain/work').WorkItem[]>
  createWorkFromNotification(input: { notificationId: string; column?: import('../domain/work').WorkColumn }): Promise<WorkItem>
  moveWorkItem(input: { id: string; column: import('../domain/work').WorkColumn; position: number }): Promise<void>
  reorderWorkColumn(input: { column: import('../domain/work').WorkColumn; orderedIds: string[] }): Promise<void>
  clearAllWorkItems(): Promise<{ clearedWorkItems: number }>
  syncShortcutWorkItems(instanceKey?: string): ReturnType<typeof syncShortcutWorkItems>
}

let singletonService: LocalHomeService | undefined

function normalizeWorkColumn(column: WorkColumn | undefined, fallback: WorkColumn = 'unassigned'): WorkColumn {
  return column === 'unassigned' || column === 'today' || column === 'soon' || column === 'later' ? column : fallback
}

function applyInitialMigrationIfNeeded(sqlite: Database.Database): void {
  const tableExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
    .get('source_config')

  if (tableExists) {
    return
  }

  const migrationSql = readFileSync(MIGRATION_PATH, 'utf8')
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    sqlite.exec(statement)
  }
}

function applySourceConfigSchemaPatches(sqlite: Database.Database): void {
  const columns = sqlite.prepare('PRAGMA table_info(source_config)').all() as Array<{
    name: string
  }>
  const hasLastSuccessfulSyncAt = columns.some((column) => column.name === 'last_successful_sync_at')
  if (!hasLastSuccessfulSyncAt) {
    sqlite.exec('ALTER TABLE source_config ADD COLUMN last_successful_sync_at integer')
  }
}

function applySyncRunSchemaPatches(sqlite: Database.Database): void {
  const columns = sqlite.prepare('PRAGMA table_info(sync_run)').all() as Array<{ name: string }>
  const hasInstanceKey = columns.some((column) => column.name === 'instance_key')
  const hasSinceUsed = columns.some((column) => column.name === 'since_used')
  if (!hasInstanceKey) {
    sqlite.exec('ALTER TABLE sync_run ADD COLUMN instance_key text')
  }
  if (!hasSinceUsed) {
    sqlite.exec('ALTER TABLE sync_run ADD COLUMN since_used text')
  }
}

function applyProjectSchemaPatches(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      shortcut_source_config_id text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      UNIQUE(shortcut_source_config_id),
      FOREIGN KEY (shortcut_source_config_id) REFERENCES source_config (id) ON DELETE SET NULL
    )
  `)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_github_repo (
      project_id text NOT NULL,
      repo_full_name text NOT NULL,
      PRIMARY KEY(project_id, repo_full_name),
      FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE,
      UNIQUE(repo_full_name)
    )
  `)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_slack_channel (
      project_id text NOT NULL,
      slack_channel_id text NOT NULL,
      PRIMARY KEY(project_id, slack_channel_id),
      FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE,
      UNIQUE(slack_channel_id)
    )
  `)

  const notificationColumns = sqlite.prepare('PRAGMA table_info(notification)').all() as Array<{
    name: string
  }>
  const hasProjectId = notificationColumns.some((column) => column.name === 'project_id')
  if (!hasProjectId) {
    sqlite.exec('ALTER TABLE notification ADD COLUMN project_id text')
  }
}

function applyPersonSchemaPatches(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS person (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      github_username text,
      slack_username text,
      shortcut_user_id text,
      shortcut_handle text,
      shortcut_username text,
      is_me integer DEFAULT 0 NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    )
  `)

  const personColumns = sqlite.prepare('PRAGMA table_info(person)').all() as Array<{ name: string }>
  const hasShortcutUserId = personColumns.some((column) => column.name === 'shortcut_user_id')
  const hasShortcutHandle = personColumns.some((column) => column.name === 'shortcut_handle')
  const hasShortcutUsername = personColumns.some((column) => column.name === 'shortcut_username')
  const hasIsMe = personColumns.some((column) => column.name === 'is_me')

  if (!hasShortcutUserId) {
    sqlite.exec('ALTER TABLE person ADD COLUMN shortcut_user_id text')
  }
  if (!hasShortcutHandle) {
    sqlite.exec('ALTER TABLE person ADD COLUMN shortcut_handle text')
  }
  if (!hasShortcutUsername) {
    sqlite.exec('ALTER TABLE person ADD COLUMN shortcut_username text')
  }
  if (!hasIsMe) {
    sqlite.exec('ALTER TABLE person ADD COLUMN is_me integer DEFAULT 0 NOT NULL')
  }

  // Backfill split fields from the legacy single Shortcut identity field.
  sqlite.exec(`
    UPDATE person
    SET shortcut_handle = COALESCE(shortcut_handle, shortcut_username)
    WHERE shortcut_username IS NOT NULL
      AND trim(shortcut_username) != ''
  `)

  const notificationColumns = sqlite.prepare('PRAGMA table_info(notification)').all() as Array<{
    name: string
  }>
  const hasFromPersonId = notificationColumns.some((column) => column.name === 'from_person_id')
  if (!hasFromPersonId) {
    sqlite.exec('ALTER TABLE notification ADD COLUMN from_person_id text')
  }
}

function applyWorkItemSchemaPatches(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS work_item (
      id text PRIMARY KEY NOT NULL,
      kind text NOT NULL,
      source text NOT NULL,
      dedupe_key text NOT NULL,
      external_id text,
      title text NOT NULL,
      body text,
      url text,
      project_id text,
      column text NOT NULL,
      position integer DEFAULT 0 NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      UNIQUE(dedupe_key),
      FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE SET NULL
    )
  `)
  sqlite.exec('CREATE INDEX IF NOT EXISTS work_item_column_position_idx ON work_item (column, position)')
}

export function createLocalManualSyncService(): LocalHomeService {
  if (singletonService) {
    return singletonService
  }

  if (!existsSync(dirname(LOCAL_DB_PATH))) {
    mkdirSync(dirname(LOCAL_DB_PATH), { recursive: true })
  }

  const { sqlite, db } = createDatabase(LOCAL_DB_PATH)
  applyInitialMigrationIfNeeded(sqlite)
  applySourceConfigSchemaPatches(sqlite)
  applySyncRunSchemaPatches(sqlite)
  applyProjectSchemaPatches(sqlite)
  applyPersonSchemaPatches(sqlite)
  applyWorkItemSchemaPatches(sqlite)

  const sourceConfigRepository = createSourceConfigRepository(db)
  const notificationRepository = createNotificationRepository(db)
  const personRepository = createPersonRepository(db)
  const projectRepository = createProjectRepository(db)
  const syncRunRepository = createSyncRunRepository(db)
  const workRepository = createWorkRepository(db)
  const clearNotificationsService = createClearNotificationsService({
    notificationRepository,
    syncRunRepository,
    sourceConfigRepository,
  })
  const markAllReadService = createMarkAllReadService({
    notificationRepository,
  })
  const orchestrator = createSyncOrchestrator({
    sourceConfigRepository,
    syncRunRepository,
    notificationRepository,
    projectRepository,
    personRepository,
    adapterRegistry: createAdapterRegistry(createDefaultSourceAdapters()),
    snapshotStore: createLocalSnapshotStore(process.cwd()),
  })

  const parseSourceConfig = (row: {
    id: string
    source: string
    instanceKey: string
    displayName: string
    enabled: boolean
    credentialsJson: string
    createdAt: Date
    updatedAt: Date
  }): SourceConfig => ({
    id: row.id,
    source: row.source as SourceKind,
    instanceKey: row.instanceKey,
    displayName: row.displayName,
    enabled: row.enabled,
    credentials: JSON.parse(row.credentialsJson) as SourceConfig['credentials'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })

  singletonService = {
    async runManualSync() {
      const result = await orchestrator.syncAllSources()
      try {
        const workSync = await syncShortcutWorkItems({
          db,
          workRepository,
          personRepository,
          projectRepository,
          sourceConfigs: await sourceConfigRepository.listEnabled(),
        })
        return { ...result, workSync }
      } catch (cause) {
        // Non-fatal: work sync should not fail the main notification sync loop in v1.
        console.warn('Work sync failed', cause)
      }
      return result
    },
    async runManualSyncForSource(source, instanceKey) {
      const result = await orchestrator.syncSingleSource({ source, instanceKey })
      if (source === 'shortcut') {
        try {
          const workSync = await syncShortcutWorkItems({
            db,
            workRepository,
            personRepository,
            projectRepository,
            sourceConfigs: (await sourceConfigRepository.listEnabled()).filter(
              (item) => item.source === 'shortcut' && item.instanceKey === instanceKey,
            ),
          })
          return { ...result, workSync }
        } catch (cause) {
          console.warn('Work sync failed', cause)
        }
      }
      return result
    },
    runReplaySync() {
      return orchestrator.replayAllSources()
    },
    runReplaySyncForSource(source, instanceKey) {
      return orchestrator.replaySingleSource({ source, instanceKey })
    },
    async listSourceConfigs() {
      const rows = await sourceConfigRepository.listAll()
      return rows.map(parseSourceConfig)
    },
    async upsertSourceConfig(input) {
      const credentials: SourceConfig['credentials'] = {
        authMode: 'token',
        token: { value: input.token },
      }

      if (input.source === 'slack') {
        credentials.service = {
          slack: {
            userId: input.slackUserId ?? '',
            workspaceUrl: input.slackWorkspaceUrl,
          },
        }
      }

      if (input.source === 'shortcut') {
        credentials.service = {
          shortcut: {
            allowedWorkflowStates:
              input.shortcutAllowedWorkflowStates && input.shortcutAllowedWorkflowStates.length > 0
                ? input.shortcutAllowedWorkflowStates
                : DEFAULT_SHORTCUT_ALLOWED_WORKFLOW_STATES,
          },
        }
      }

      if (input.source === 'github') {
        credentials.service = {
          github: {
            apiBaseUrl: input.githubApiBaseUrl,
            participating: input.githubParticipating ?? false,
          },
        }
      }

      await sourceConfigRepository.upsert({
        source: input.source,
        instanceKey: input.instanceKey,
        displayName: input.displayName,
        enabled: input.enabled,
        authMode: 'token',
        credentials,
      })
    },
    async deleteSourceConfig(source, instanceKey) {
      await sourceConfigRepository.delete(source, instanceKey)
    },
    async listInboxItems() {
      const rows = await notificationRepository.listUnreadActiveWithState()
      const projects = await projectRepository.listAll()
      const people = await personRepository.listAll()
      const projectById = new Map(projects.map((item) => [item.id, item]))
      const peopleById = new Map(people.map((item) => [item.id, item]))
      return rows.map(({ notification, state }) => ({
        id: notification.id,
        source: notification.source as SourceKind,
        projectId: notification.projectId ?? undefined,
        projectName: notification.projectId
          ? projectById.get(notification.projectId)?.name
          : undefined,
        fromPersonId: notification.fromPersonId ?? undefined,
        fromPersonName: notification.fromPersonId
          ? peopleById.get(notification.fromPersonId)?.name
          : undefined,
        title: notification.title,
        body: notification.body ?? undefined,
        url: notification.url ?? undefined,
        authorName: notification.authorName ?? undefined,
        occurredAt: notification.occurredAt.toISOString(),
        isRead: state?.isRead ?? false,
        readAt: state?.readAt?.toISOString(),
      }))
    },
    async setInboxReadState(notificationId, isRead) {
      await notificationRepository.setReadState(notificationId, isRead)
    },
    async markAllAsRead() {
      return markAllReadService.markAllAsRead()
    },
    async listProjects() {
      return projectRepository.listAll()
    },
    async listPeople() {
      return personRepository.listAll()
    },
    async upsertProject(input) {
      if (input.id) {
        await projectRepository.update(input.id, {
          name: input.name,
          shortcutSourceConfigId: input.shortcutSourceConfigId,
          githubRepos: input.githubRepos,
          slackChannelIds: input.slackChannelIds,
        })
        return input.id
      }
      return projectRepository.create({
        name: input.name,
        shortcutSourceConfigId: input.shortcutSourceConfigId,
        githubRepos: input.githubRepos,
        slackChannelIds: input.slackChannelIds,
      })
    },
    async deleteProject(projectId) {
      await projectRepository.delete(projectId)
    },
    async upsertPerson(input) {
      if (input.id) {
        await personRepository.update(input.id, {
          name: input.name,
          isMe: input.isMe,
          githubUsername: input.githubUsername,
          slackUsername: input.slackUsername,
          shortcutUserId: input.shortcutUserId,
          shortcutHandle: input.shortcutHandle,
          shortcutUsername: input.shortcutUsername,
        })
        return input.id
      }
      return personRepository.create({
        name: input.name,
        isMe: input.isMe,
        githubUsername: input.githubUsername,
        slackUsername: input.slackUsername,
        shortcutUserId: input.shortcutUserId,
        shortcutHandle: input.shortcutHandle,
        shortcutUsername: input.shortcutUsername,
      })
    },
    async deletePerson(personId) {
      await personRepository.delete(personId)
    },
    async listProjectMetadata() {
      return projectRepository.listMetadata()
    },
    async clearAllNotifications() {
      return clearNotificationsService.clearAllNotifications()
    },
    async listSyncHistory(filters) {
      const runs = await syncRunRepository.listHistory(filters)
      return runs.map((run) => ({
        runId: run.id,
        source: run.source as SourceKind,
        instanceKey: run.instanceKey ?? 'unknown',
        status: run.status as 'running' | 'success' | 'failed',
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
        fetchedCount: run.fetchedCount,
        upsertedCount: run.upsertedCount,
        archivedCount: run.archivedCount,
        errorMessage: run.errorMessage ?? undefined,
        sinceUsed: run.sinceUsed ?? undefined,
      }))
    },

    async listWorkItems() {
      const rows = await workRepository.listAll()
      return rows
    },

    async createWorkFromNotification(input) {
      const notificationRow = await db.query.notification.findFirst({
        where: eq(notification.id, input.notificationId),
      })
      if (!notificationRow) {
        throw new Error('Notification not found')
      }

      const column = normalizeWorkColumn(input.column, 'soon')
      const dedupeKey = `work:notification_todo:${notificationRow.id}`

      const saved = await workRepository.upsert({
        kind: 'notification_todo',
        source: 'notification',
        dedupeKey,
        externalId: notificationRow.id,
        title: notificationRow.title,
        body: notificationRow.body ?? undefined,
        url: notificationRow.url ?? undefined,
        projectId: notificationRow.projectId ?? undefined,
        column,
        position: Number.NaN,
      })
      return {
        id: saved.id,
        kind: saved.kind as WorkItem['kind'],
        source: saved.source as WorkItem['source'],
        dedupeKey: saved.dedupeKey,
        externalId: saved.externalId ?? undefined,
        title: saved.title,
        body: saved.body ?? undefined,
        url: saved.url ?? undefined,
        projectId: saved.projectId ?? undefined,
        column: saved.column as WorkColumn,
        position: saved.position,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
      }
    },

    async moveWorkItem(input) {
      const column = normalizeWorkColumn(input.column)
      await workRepository.moveWorkItem(input.id, column, input.position)
    },

    async reorderWorkColumn(input) {
      const column = normalizeWorkColumn(input.column)
      await workRepository.reorderColumn(column, input.orderedIds)
    },

    async clearAllWorkItems() {
      const clearedWorkItems = await workRepository.clearAll()
      return { clearedWorkItems }
    },

    async syncShortcutWorkItems(instanceKey) {
      return syncShortcutWorkItems({
        db,
        workRepository,
        personRepository,
        projectRepository,
        sourceConfigs: (await sourceConfigRepository.listEnabled()).filter(
          (config) => config.source === 'shortcut' && (!instanceKey || config.instanceKey === instanceKey),
        ),
      })
    },
  }

  return singletonService
}
