import { describe, expect, it, vi } from 'vitest'
import { __testing, storyHasHandleTaskMention, syncShortcutWork } from './shortcut-work-sync'
import type { SourceConfig } from '../../domain/notification'

function makeShortcutConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'cfg-shortcut',
    source: 'shortcut',
    instanceKey: 'medaire',
    displayName: 'Shortcut medaire',
    enabled: true,
    credentials: {
      authMode: 'token',
      token: { value: 'shortcut-token' },
      service: { shortcut: {} },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('shortcut work sync', () => {
  it('detects checklist mentions of handle (case-insensitive, with/without @)', () => {
    const story = {
      tasks: [
        { description: 'PR @andyc' },
        { description: 'Code review @SomeoneElse' },
        { description: 'please REVIEW @ANDYC when ready' },
      ],
    }

    expect(storyHasHandleTaskMention(story, 'andyc')).toBe(true)
    expect(storyHasHandleTaskMention(story, '@andyc')).toBe(true)
    expect(storyHasHandleTaskMention(story, 'nope')).toBe(false)
  })

  it('resolves workflow state name from workflow_state_id map', () => {
    const story = {
      workflow_state_id: 123,
    }
    const map = new Map<number, string>([[123, 'In Progress']])
    expect(__testing.resolveStoryStateName(story, map)).toBe('In Progress')
  })

  it('normalizes state names with emoji/punctuation prefixes', () => {
    expect(__testing.normalizeStateName('💻 Ready for Work')).toBe('ready for work')
    expect(__testing.normalizeStateName('❌ Rejected Review')).toBe('rejected review')
    expect(__testing.normalizeStateName('⚒ In Progress')).toBe('in progress')
  })

  it('detects checklist mentions via member_mention_ids', () => {
    const story = {
      tasks: [{ member_mention_ids: ['member-1'] }],
    }
    expect(__testing.storyHasMemberMention(story, 'member-1')).toBe(true)
    expect(__testing.storyHasMemberMention(story, 'member-2')).toBe(false)
  })

  it('keeps partial assigned pages when Shortcut rejects the next token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123', mention_name: 'andy' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              states: [{ id: 1, name: 'In Progress' }],
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                name: 'Story from first page',
                owner_ids: ['member-123'],
                workflow_state_id: 1,
                app_url: 'https://app.shortcut.com/acme/story/42',
              },
            ],
            next: 'stale-token',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The next page token is not valid for the given query.',
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                name: 'Story from restart page',
                owner_ids: ['member-123'],
                workflow_state_id: 1,
                app_url: 'https://app.shortcut.com/acme/story/42',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))

    const upsertWorkItem = vi.fn().mockResolvedValue(undefined)
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const report = await syncShortcutWork(makeShortcutConfig(), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger,
      getMeShortcutHandle: async () => 'andy',
      upsertWorkItem,
      resolveProjectIdForShortcutInstance: async () => null,
    })

    expect(report.assignedCandidates).toBe(1)
    expect(report.taskCandidates).toBe(0)
    expect(report.upserted).toBe(1)
    expect(upsertWorkItem).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      '[work-sync] Shortcut search pagination token rejected; restarting query',
      expect.objectContaining({
        instanceKey: 'medaire',
        rejectedToken: 'stale-token',
      }),
    )
  })

  it('restarts once after invalid token and stays bounded on repeat failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'member-123', mention_name: 'andy' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              states: [{ id: 1, name: 'In Progress' }],
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], next: 'stale-token' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The next page token is not valid for the given query.',
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], next: 'stale-token' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'The next page token is not valid for the given query.',
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const report = await syncShortcutWork(makeShortcutConfig(), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger,
      getMeShortcutHandle: async () => 'andy',
      upsertWorkItem: vi.fn().mockResolvedValue(undefined),
      resolveProjectIdForShortcutInstance: async () => null,
    })

    expect(report.assignedCandidates).toBe(0)
    expect(report.taskCandidates).toBe(0)
    expect(report.upserted).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(7)
    expect(logger.warn).toHaveBeenCalledWith(
      '[work-sync] Shortcut search pagination token rejected; restarting query',
      expect.objectContaining({
        query: 'owner:andy',
      }),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      '[work-sync] Shortcut search pagination token rejected; using partial page set',
      expect.objectContaining({
        query: 'owner:andy',
      }),
    )
  })
})

