import type {
  CanonicalNotification,
  SourceConfig,
  SourceKind,
} from './notification'

export type AdapterSyncCursor = {
  cursor?: string
}

export type FetchNotificationsInput = {
  since?: string
  cursor?: AdapterSyncCursor
}

export type FetchNotificationsOutput = {
  notifications: CanonicalNotification[]
  nextCursor?: AdapterSyncCursor
}

export interface SourceAdapter {
  readonly source: SourceKind
  fetchNotifications(
    config: SourceConfig,
    input: FetchNotificationsInput,
  ): Promise<FetchNotificationsOutput>
}
