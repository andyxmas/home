export type SourceKind = 'slack' | 'github' | 'shortcut'

export type SlackServiceConfig = {
  userId: string
  workspaceUrl?: string
  channelIds?: string[]
  includeChannelMentions?: boolean
  includeDirectMessages?: boolean
}

export type GitHubServiceConfig = {
  apiBaseUrl?: string
  participating?: boolean
}

export type ShortcutServiceConfig = {
  apiBaseUrl?: string
  allowedWorkflowStates?: string[]
}

export type SourceCredentialShape = {
  authMode: 'token' | 'oauth2'
  token?: {
    /**
     * v1 token-based auth. Keep this for now.
     */
    value: string
  }
  oauth2?: {
    /**
     * OAuth-ready shape for future migration.
     */
    accessToken: string
    refreshToken?: string
    expiresAt?: string
    tokenType?: string
    scopes?: string[]
  }
  service?: {
    slack?: SlackServiceConfig
    github?: GitHubServiceConfig
    shortcut?: ShortcutServiceConfig
  }
}

export type SourceConfig = {
  id: string
  source: SourceKind
  instanceKey: string
  displayName: string
  enabled: boolean
  credentials: SourceCredentialShape
  createdAt: string
  updatedAt: string
}

export type CanonicalNotification = {
  id: string
  source: SourceKind
  externalId: string
  dedupeKey: string
  projectId?: string
  fromPersonId?: string
  title: string
  body?: string
  url?: string
  authorName?: string
  occurredAt: string
  payload: Record<string, unknown>
}

export type NotificationState = {
  notificationId: string
  isRead: boolean
  readAt?: string
  updatedAt: string
}

export type AdapterSyncResult = {
  source: SourceKind
  fetchedCount: number
  upsertedCount: number
  archivedCount: number
  finishedAt: string
  error?: string
}
