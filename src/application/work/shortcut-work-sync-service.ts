import type { SourceConfig, SourceKind } from '../../domain/notification'
import type { WorkColumn } from '../../domain/work'
import type { HomeDb } from '../../data/db/client'
import type { createWorkRepository } from '../../data/repositories/work-repository'
import type { createPersonRepository } from '../../data/repositories/person-repository'
import type { createProjectRepository } from '../../data/repositories/project-repository'
import { project, sourceConfig } from '../../data/db/schema'
import { and, eq } from 'drizzle-orm'
import { syncShortcutWork } from './shortcut-work-sync'
import type { ShortcutWorkSyncReport } from './shortcut-work-sync'

type WorkRepository = ReturnType<typeof createWorkRepository>
type PersonRepository = ReturnType<typeof createPersonRepository>
type ProjectRepository = ReturnType<typeof createProjectRepository>

export async function syncShortcutWorkItems(input: {
  db: HomeDb
  workRepository: WorkRepository
  personRepository: PersonRepository
  projectRepository: ProjectRepository
  sourceConfigs: Array<{ source: string; instanceKey: string; credentialsJson: string }>
}): Promise<{
  totalSources: number
  succeededSources: number
  failedSources: number
  totalUpserted: number
  sources: Array<
    | (ShortcutWorkSyncReport & { status: 'success' })
    | { source: 'shortcut'; instanceKey: string; status: 'failed'; error: string; upserted: number }
  >
}> {
  const enabledShortcutConfigs = input.sourceConfigs
    .filter((row) => row.source === 'shortcut')
    .map(
      (row): SourceConfig => ({
        id: 'unknown',
        source: row.source as SourceKind,
        instanceKey: row.instanceKey,
        displayName: row.instanceKey,
        enabled: true,
        credentials: JSON.parse(row.credentialsJson) as SourceConfig['credentials'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    )

  const me = await input.personRepository.getMe()
  const meHandle = me?.shortcutHandle ?? me?.shortcutUsername ?? null

  const resolveProjectIdForShortcutInstance = async (instanceKey: string): Promise<string | null> => {
    const shortcutConfig = await input.db.query.sourceConfig.findFirst({
      where: and(eq(sourceConfig.source, 'shortcut'), eq(sourceConfig.instanceKey, instanceKey)),
    })
    if (!shortcutConfig) {
      return null
    }
    const projectRow = await input.db.query.project.findFirst({
      where: eq(project.shortcutSourceConfigId, shortcutConfig.id),
    })
    return projectRow?.id ?? null
  }

  const sources: Array<
    | (ShortcutWorkSyncReport & { status: 'success' })
    | { source: 'shortcut'; instanceKey: string; status: 'failed'; error: string; upserted: number }
  > = []

  for (const config of enabledShortcutConfigs) {
    try {
      const report = await syncShortcutWork(config, {
        getMeShortcutHandle: async () => meHandle,
        resolveProjectIdForShortcutInstance,
        upsertWorkItem: async (work) => {
          await input.workRepository.upsert({
            kind: work.kind,
            source: 'shortcut',
            dedupeKey: work.dedupeKey,
            externalId: work.externalId,
            title: work.title,
            body: work.body,
            url: work.url,
            projectId: work.projectId,
            column: work.column as WorkColumn,
          })
        },
      })
      sources.push({ ...report, status: 'success' })
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause)
      console.warn('[work-sync] Shortcut source failed', {
        instanceKey: config.instanceKey,
        error,
      })
      sources.push({
        source: 'shortcut',
        instanceKey: config.instanceKey,
        status: 'failed',
        error,
        upserted: 0,
      })
    }
  }

  const succeededSources = sources.filter((source) => source.status === 'success').length
  const failedSources = sources.length - succeededSources
  const totalUpserted = sources.reduce((total, source) => total + source.upserted, 0)

  return {
    totalSources: sources.length,
    succeededSources,
    failedSources,
    totalUpserted,
    sources,
  }
}

