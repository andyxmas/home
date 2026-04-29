import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const sourceConfig = sqliteTable(
  'source_config',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    instanceKey: text('instance_key').notNull(),
    displayName: text('display_name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    authMode: text('auth_mode').notNull().default('token'),
    credentialsJson: text('credentials_json').notNull(),
    lastSuccessfulSyncAt: integer('last_successful_sync_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    unique().on(table.source, table.instanceKey),
    index('source_config_source_idx').on(table.source),
  ],
)

export const project = sqliteTable(
  'project',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    shortcutSourceConfigId: text('shortcut_source_config_id').references(() => sourceConfig.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [unique().on(table.shortcutSourceConfigId)],
)

export const person = sqliteTable('person', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  githubUsername: text('github_username'),
  slackUsername: text('slack_username'),
  shortcutUserId: text('shortcut_user_id'),
  shortcutHandle: text('shortcut_handle'),
  shortcutUsername: text('shortcut_username'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const notification = sqliteTable(
  'notification',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    url: text('url'),
    authorName: text('author_name'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    payloadJson: text('payload_json').notNull(),
    // TODO(project-tagging): Move to many-to-many if notifications can span multiple projects.
    projectId: text('project_id').references(() => project.id, { onDelete: 'set null' }),
    fromPersonId: text('from_person_id').references(() => person.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    unique().on(table.dedupeKey),
    unique().on(table.source, table.externalId),
    index('notification_occurred_at_idx').on(table.occurredAt),
  ],
)

export const notificationState = sqliteTable('notification_state', {
  notificationId: text('notification_id')
    .primaryKey()
    .references(() => notification.id, { onDelete: 'cascade' }),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const syncRun = sqliteTable('sync_run', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  instanceKey: text('instance_key'),
  sinceUsed: text('since_used'),
  status: text('status').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  fetchedCount: integer('fetched_count').notNull().default(0),
  upsertedCount: integer('upserted_count').notNull().default(0),
  archivedCount: integer('archived_count').notNull().default(0),
  errorMessage: text('error_message'),
})

export const projectGithubRepo = sqliteTable(
  'project_github_repo',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    repoFullName: text('repo_full_name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.repoFullName] }),
    unique().on(table.repoFullName),
  ],
)

export const projectSlackChannel = sqliteTable(
  'project_slack_channel',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    slackChannelId: text('slack_channel_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.slackChannelId] }),
    unique().on(table.slackChannelId),
  ],
)

export const archiveNotification = sqliteTable(
  'archive_notification',
  {
    id: text('id').primaryKey(),
    originalNotificationId: text('original_notification_id').notNull(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    url: text('url'),
    authorName: text('author_name'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    payloadJson: text('payload_json').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    unique().on(table.originalNotificationId),
    index('archive_notification_occurred_at_idx').on(table.occurredAt),
  ],
)

export type SourceConfigRow = typeof sourceConfig.$inferSelect
export type NotificationRow = typeof notification.$inferSelect
export type NotificationStateRow = typeof notificationState.$inferSelect
export type SyncRunRow = typeof syncRun.$inferSelect
export type ArchiveNotificationRow = typeof archiveNotification.$inferSelect
export type ProjectRow = typeof project.$inferSelect
export type PersonRow = typeof person.$inferSelect
export type ProjectGithubRepoRow = typeof projectGithubRepo.$inferSelect
export type ProjectSlackChannelRow = typeof projectSlackChannel.$inferSelect
