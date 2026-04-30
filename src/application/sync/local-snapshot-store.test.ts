import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createLocalSnapshotStore } from './local-snapshot-store'

describe('local snapshot store', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(resolve(tmpdir(), 'home-snapshot-store-'))
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('overwrites latest snapshot for same source config', async () => {
    const store = createLocalSnapshotStore(rootDir)

    await store.saveLatest({
      source: 'github',
      instanceKey: 'main',
      capturedAt: '2026-01-15T12:00:00.000Z',
      since: '2026-01-08T12:00:00.000Z',
      notifications: [
        {
          id: 'n-1',
          source: 'github',
          externalId: 'thread-1',
          title: 'Old payload',
          occurredAt: '2026-01-14T11:00:00.000Z',
          payload: { repo: 'acme/one' },
        },
      ],
    })

    await store.saveLatest({
      source: 'github',
      instanceKey: 'main',
      capturedAt: '2026-01-15T12:01:00.000Z',
      since: '2026-01-15T12:00:00.000Z',
      notifications: [
        {
          id: 'n-2',
          source: 'github',
          externalId: 'thread-2',
          title: 'Latest payload',
          occurredAt: '2026-01-14T11:05:00.000Z',
          payload: { repo: 'acme/two' },
        },
      ],
    })

    const stored = await store.readLatest('github', 'main')
    expect(stored?.capturedAt).toBe('2026-01-15T12:01:00.000Z')
    expect(stored?.notifications).toHaveLength(1)
    expect(stored?.notifications[0].externalId).toBe('thread-2')

    const snapshotPath = resolve(rootDir, '.home', 'snapshots', 'github--main.json')
    const raw = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { notifications: Array<{ title: string }> }
    expect(raw.notifications[0].title).toBe('Latest payload')
  })
})
