import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SourceKind } from '../../domain/notification'
import type { UpsertNotificationInput } from '../../data/repositories/notification-repository'

const SNAPSHOT_SCHEMA_VERSION = 1

export type SourceSnapshot = {
  schemaVersion: number
  source: SourceKind
  instanceKey: string
  capturedAt: string
  since: string
  notifications: UpsertNotificationInput[]
}

function buildSnapshotFileName(source: SourceKind, instanceKey: string): string {
  return `${source}--${encodeURIComponent(instanceKey)}.json`
}

export function createLocalSnapshotStore(rootDir: string) {
  const snapshotsDir = resolve(rootDir, '.home', 'snapshots')

  const ensureDirectory = async () => {
    await mkdir(snapshotsDir, { recursive: true })
  }

  const buildSnapshotPath = (source: SourceKind, instanceKey: string) =>
    resolve(snapshotsDir, buildSnapshotFileName(source, instanceKey))

  return {
    async saveLatest(input: Omit<SourceSnapshot, 'schemaVersion'>): Promise<void> {
      await ensureDirectory()
      const destinationPath = buildSnapshotPath(input.source, input.instanceKey)
      const temporaryPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`
      const payload: SourceSnapshot = {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        ...input,
      }
      await writeFile(temporaryPath, JSON.stringify(payload, null, 2), 'utf8')
      await rename(temporaryPath, destinationPath)
    },

    async readLatest(source: SourceKind, instanceKey: string): Promise<SourceSnapshot | null> {
      const path = buildSnapshotPath(source, instanceKey)
      try {
        const raw = await readFile(path, 'utf8')
        const parsed = JSON.parse(raw) as SourceSnapshot
        if (
          parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
          parsed.source !== source ||
          parsed.instanceKey !== instanceKey ||
          !Array.isArray(parsed.notifications)
        ) {
          return null
        }
        return parsed
      } catch {
        return null
      }
    },
  }
}
