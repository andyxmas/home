import type { SourceConfig, SourceKind } from '../../domain/notification'
import type { AdapterRegistry } from './adapter-registry'
import type { UpsertNotificationInput } from '../../data/repositories/notification-repository'
import type { SourceConfigRow } from '../../data/db/schema'
import { buildInitialSyncSince } from './sync-defaults'

type SourceConfigRepository = {
  listEnabled(): Promise<SourceConfigRow[]>
  setLastSuccessfulSyncAt(source: SourceKind, instanceKey: string, lastSuccessfulSyncAt: Date): Promise<void>
}

type SyncRunRepository = {
  start(params: { source: SourceKind; instanceKey: string; sinceUsed?: string }): Promise<string>
  complete(params: {
    runId: string
    fetchedCount: number
    upsertedCount: number
    archivedCount: number
    errorMessage?: string
  }): Promise<void>
}

type NotificationRepository = {
  upsert(input: UpsertNotificationInput): Promise<unknown>
}

type ProjectRepository = {
  resolveProjectIdForNotification(input: {
    source: SourceKind
    instanceKey: string
    payload: Record<string, unknown>
  }): Promise<string | null>
}

type PersonRepository = {
  resolvePersonIdForNotification(input: {
    source: SourceKind
    payload: Record<string, unknown>
    authorName?: string
  }): Promise<string | null>
}

type SyncSnapshotStore = {
  saveLatest(input: {
    source: SourceKind
    instanceKey: string
    capturedAt: string
    since: string
    notifications: UpsertNotificationInput[]
  }): Promise<void>
  readLatest(source: SourceKind, instanceKey: string): Promise<{
    source: SourceKind
    instanceKey: string
    capturedAt: string
    since: string
    notifications: UpsertNotificationInput[]
  } | null>
}

type Clock = () => Date

function defaultClock(): Date {
  return new Date()
}

function asErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

function parseSourceConfig(row: SourceConfigRow): SourceConfig {
  return {
    id: row.id,
    source: row.source as SourceKind,
    instanceKey: row.instanceKey,
    displayName: row.displayName,
    enabled: row.enabled,
    credentials: JSON.parse(row.credentialsJson) as SourceConfig['credentials'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type SourceSyncSummary = {
  source: SourceKind
  instanceKey: string
  displayName: string
  runId: string
  status: 'success' | 'failed'
  fetchedCount: number
  upsertedCount: number
  archivedCount: number
  error?: string
}

export type SyncAllSourcesResult = {
  startedAt: string
  finishedAt: string
  totalSources: number
  succeededSources: number
  failedSources: number
  totalFetched: number
  totalUpserted: number
  totalArchived: number
  sources: SourceSyncSummary[]
}

type SyncTarget = {
  source: SourceKind
  instanceKey: string
}

export function createSyncOrchestrator(
  dependencies: {
    sourceConfigRepository: SourceConfigRepository
    syncRunRepository: SyncRunRepository
    notificationRepository: NotificationRepository
    projectRepository?: ProjectRepository
    personRepository?: PersonRepository
    adapterRegistry: AdapterRegistry
    snapshotStore?: SyncSnapshotStore
  },
  clock: Clock = defaultClock,
) {
  const processNotifications = async (
    parsed: SourceConfig,
    notifications: UpsertNotificationInput[],
  ): Promise<void> => {
    for (const notification of notifications) {
      const projectId = dependencies.projectRepository
        ? await dependencies.projectRepository.resolveProjectIdForNotification({
            source: parsed.source,
            instanceKey: parsed.instanceKey,
            payload: notification.payload,
          })
        : null
      const fromPersonId = dependencies.personRepository
        ? await dependencies.personRepository.resolvePersonIdForNotification({
            source: parsed.source,
            payload: notification.payload,
            authorName: notification.authorName,
          })
        : null
      await dependencies.notificationRepository.upsert({
        ...notification,
        projectId: projectId ?? undefined,
        fromPersonId: fromPersonId ?? undefined,
      })
    }
  }

  const loadLiveNotifications = async (row: SourceConfigRow, since: string) => {
    const parsed = parseSourceConfig(row)
    const adapter = dependencies.adapterRegistry.get(parsed.source)
    if (!adapter) {
      throw new Error(`No adapter registered for source: ${parsed.source}`)
    }

    const notifications: UpsertNotificationInput[] = []
    const seenCursors = new Set<string>()
    let cursor: { cursor?: string } | undefined

    while (true) {
      const fetched = await adapter.fetchNotifications(parsed, {
        since,
        cursor,
      })
      notifications.push(...fetched.notifications)

      const nextCursor = fetched.nextCursor?.cursor?.trim()
      if (!nextCursor) {
        break
      }
      if (seenCursors.has(nextCursor)) {
        throw new Error(
          `Adapter cursor loop detected for ${parsed.source}:${parsed.instanceKey} at cursor "${nextCursor}"`,
        )
      }
      seenCursors.add(nextCursor)
      cursor = { cursor: nextCursor }
    }

    if (dependencies.snapshotStore) {
      await dependencies.snapshotStore.saveLatest({
        source: parsed.source,
        instanceKey: parsed.instanceKey,
        capturedAt: clock().toISOString(),
        since,
        notifications,
      })
    }

    return { parsed, since, notifications }
  }

  const loadReplayNotifications = async (row: SourceConfigRow) => {
    const parsed = parseSourceConfig(row)
    if (!dependencies.snapshotStore) {
      throw new Error('Snapshot store is not configured; replay is unavailable.')
    }

    const snapshot = await dependencies.snapshotStore.readLatest(parsed.source, parsed.instanceKey)
    if (!snapshot) {
      throw new Error(`No local snapshot found for ${parsed.source}/${parsed.instanceKey}`)
    }

    return {
      parsed,
      since: snapshot.since,
      notifications: snapshot.notifications,
    }
  }

  const syncSource = async (row: SourceConfigRow, mode: 'live' | 'replay'): Promise<SourceSyncSummary> => {
    const sinceUsedForRun =
      mode === 'live' ? row.lastSuccessfulSyncAt?.toISOString() ?? buildInitialSyncSince(clock()) : undefined
    const runId = await dependencies.syncRunRepository.start({
      source: row.source as SourceKind,
      instanceKey: row.instanceKey,
      sinceUsed: sinceUsedForRun,
    })

    try {
      const sourcePayload =
        mode === 'live'
          ? await loadLiveNotifications(row, sinceUsedForRun as string)
          : await loadReplayNotifications(row)
      await processNotifications(sourcePayload.parsed, sourcePayload.notifications)

      const upsertedCount = sourcePayload.notifications.length
      const archivedCount = 0
      const sourceSyncFinishedAt = clock()

      await dependencies.sourceConfigRepository.setLastSuccessfulSyncAt(
        sourcePayload.parsed.source,
        sourcePayload.parsed.instanceKey,
        sourceSyncFinishedAt,
      )

      await dependencies.syncRunRepository.complete({
        runId,
        fetchedCount: sourcePayload.notifications.length,
        upsertedCount,
        archivedCount,
      })

      return {
        source: sourcePayload.parsed.source,
        instanceKey: sourcePayload.parsed.instanceKey,
        displayName: sourcePayload.parsed.displayName,
        runId,
        status: 'success',
        fetchedCount: sourcePayload.notifications.length,
        upsertedCount,
        archivedCount,
      }
    } catch (error) {
      const errorMessage = asErrorMessage(error)
      await dependencies.syncRunRepository.complete({
        runId,
        fetchedCount: 0,
        upsertedCount: 0,
        archivedCount: 0,
        errorMessage,
      })

      return {
        source: row.source as SourceKind,
        instanceKey: row.instanceKey,
        displayName: row.displayName,
        runId,
        status: 'failed',
        fetchedCount: 0,
        upsertedCount: 0,
        archivedCount: 0,
        error: errorMessage,
      }
    }
  }

  const buildResult = (startedAt: Date, sources: SourceSyncSummary[]): SyncAllSourcesResult => {
    const succeededSources = sources.filter((source) => source.status === 'success').length
    const failedSources = sources.length - succeededSources
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: clock().toISOString(),
      totalSources: sources.length,
      succeededSources,
      failedSources,
      totalFetched: sources.reduce((total, source) => total + source.fetchedCount, 0),
      totalUpserted: sources.reduce((total, source) => total + source.upsertedCount, 0),
      totalArchived: sources.reduce((total, source) => total + source.archivedCount, 0),
      sources,
    }
  }

  const findTargetRow = (
    sourceRows: SourceConfigRow[],
    target: SyncTarget,
  ): SourceConfigRow | undefined =>
    sourceRows.find(
      (row) => row.source === target.source && row.instanceKey === target.instanceKey,
    )

  return {
    async syncAllSources(): Promise<SyncAllSourcesResult> {
      const startedAt = clock()
      const sourceRows = await dependencies.sourceConfigRepository.listEnabled()
      const sources: SourceSyncSummary[] = []

      for (const row of sourceRows) {
        sources.push(await syncSource(row, 'live'))
      }

      return buildResult(startedAt, sources)
    },

    async syncSingleSource(target: SyncTarget): Promise<SyncAllSourcesResult> {
      const startedAt = clock()
      const sourceRows = await dependencies.sourceConfigRepository.listEnabled()
      const row = findTargetRow(sourceRows, target)
      if (!row) {
        throw new Error(`Enabled source not found: ${target.source}/${target.instanceKey}`)
      }

      return buildResult(startedAt, [await syncSource(row, 'live')])
    },

    async replayAllSources(): Promise<SyncAllSourcesResult> {
      const startedAt = clock()
      const sourceRows = await dependencies.sourceConfigRepository.listEnabled()
      const sources: SourceSyncSummary[] = []

      for (const row of sourceRows) {
        sources.push(await syncSource(row, 'replay'))
      }

      return buildResult(startedAt, sources)
    },

    async replaySingleSource(target: SyncTarget): Promise<SyncAllSourcesResult> {
      const startedAt = clock()
      const sourceRows = await dependencies.sourceConfigRepository.listEnabled()
      const row = findTargetRow(sourceRows, target)
      if (!row) {
        throw new Error(`Enabled source not found: ${target.source}/${target.instanceKey}`)
      }

      return buildResult(startedAt, [await syncSource(row, 'replay')])
    },
  }
}
