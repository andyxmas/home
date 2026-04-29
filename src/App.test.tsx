import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import type { SourceKind } from './domain/notification'
import type { ProjectMetadata } from './domain/project'

type TestSourceConfig = {
  id: string
  source: SourceKind
  instanceKey: string
  displayName: string
  enabled: boolean
  credentials: {
    authMode: 'token'
    token: { value: string }
    service?: Record<string, unknown>
  }
  createdAt: string
  updatedAt: string
}

type TestInboxItem = {
  id: string
  source: SourceKind
  projectId?: string
  projectName?: string
  fromPersonId?: string
  fromPersonName?: string
  title: string
  occurredAt: string
  isRead: boolean
  body?: string
  url?: string
}

type TestPerson = {
  id: string
  name: string
  githubUsername?: string
  slackUsername?: string
  shortcutUserId?: string
  shortcutHandle?: string
  shortcutUsername?: string
  createdAt: string
  updatedAt: string
}

type TestProject = {
  id: string
  name: string
  shortcutSourceConfigId?: string
  githubRepos: string[]
  slackChannelIds: string[]
  createdAt: string
  updatedAt: string
}

type TestSyncHistoryEntry = {
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
}

function createMockApi() {
  const now = '2026-01-15T12:00:00.000Z'
  const sourceConfigs: TestSourceConfig[] = []
  const projects: TestProject[] = []
  const people: TestPerson[] = []
  const inboxItems: TestInboxItem[] = []
  const syncHistory: TestSyncHistoryEntry[] = []
  const projectMetadata: ProjectMetadata = {
    shortcutSources: [],
    knownGithubRepos: [],
    knownSlackChannels: [],
  }
  let nextManualSync: { ok: boolean; payload: unknown; delayMs?: number } = {
    ok: true,
    payload: {
      startedAt: now,
      finishedAt: now,
      totalSources: 0,
      succeededSources: 0,
      failedSources: 0,
      totalFetched: 0,
      totalUpserted: 0,
      totalArchived: 0,
      sources: [],
    },
  }
  const nextSourceManualSync = new Map<string, { ok: boolean; payload: unknown; delayMs?: number }>()

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'

    if (url === '/api/sources' && method === 'GET') {
      return new Response(JSON.stringify({ sources: sourceConfigs }), { status: 200 })
    }

    if (url === '/api/sources' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        source: SourceKind
        instanceKey: string
        displayName: string
        enabled: boolean
        token: string
        slackUserId?: string
        slackWorkspaceUrl?: string
        githubApiBaseUrl?: string
        githubParticipating?: boolean
      }

      const service =
        body.source === 'slack'
          ? { slack: { userId: body.slackUserId, workspaceUrl: body.slackWorkspaceUrl } }
          : body.source === 'github'
            ? {
                github: {
                  apiBaseUrl: body.githubApiBaseUrl,
                  participating: body.githubParticipating ?? false,
                },
              }
            : { shortcut: {} }

      const existing = sourceConfigs.find(
        (row) => row.source === body.source && row.instanceKey === body.instanceKey,
      )
      if (existing) {
        existing.displayName = body.displayName
        existing.enabled = body.enabled
        existing.credentials = {
          authMode: 'token',
          token: { value: body.token },
          service,
        }
        existing.updatedAt = now
      } else {
        sourceConfigs.push({
          id: crypto.randomUUID(),
          source: body.source,
          instanceKey: body.instanceKey,
          displayName: body.displayName,
          enabled: body.enabled,
          credentials: {
            authMode: 'token',
            token: { value: body.token },
            service,
          },
          createdAt: now,
          updatedAt: now,
        })
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    if (url.startsWith('/api/sources/') && method === 'DELETE') {
      const [, , , source, instance] = url.split('/')
      const decodedSource = decodeURIComponent(source ?? '')
      const decodedInstance = decodeURIComponent(instance ?? '')
      const index = sourceConfigs.findIndex(
        (row) => row.source === decodedSource && row.instanceKey === decodedInstance,
      )
      if (index >= 0) {
        sourceConfigs.splice(index, 1)
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    if (url === '/api/inbox' && method === 'GET') {
      return new Response(JSON.stringify({ items: inboxItems }), { status: 200 })
    }

    if (url === '/api/projects' && method === 'GET') {
      return new Response(
        JSON.stringify({
          projects,
          metadata: projectMetadata,
        }),
        { status: 200 },
      )
    }

    if (url === '/api/people' && method === 'GET') {
      return new Response(JSON.stringify({ people }), { status: 200 })
    }

    if (url === '/api/people' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        name: string
        githubUsername?: string
        slackUsername?: string
        shortcutUserId?: string
        shortcutHandle?: string
        shortcutUsername?: string
      }
      const id = crypto.randomUUID()
      people.push({
        id,
        name: body.name,
        githubUsername: body.githubUsername,
        slackUsername: body.slackUsername,
        shortcutUserId: body.shortcutUserId,
        shortcutHandle: body.shortcutHandle,
        shortcutUsername: body.shortcutUsername,
        createdAt: now,
        updatedAt: now,
      })
      return new Response(JSON.stringify({ ok: true, personId: id }), { status: 200 })
    }

    if (url.startsWith('/api/people/') && method === 'PUT') {
      const [, , , id] = url.split('/')
      const personId = decodeURIComponent(id ?? '')
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        name: string
        githubUsername?: string
        slackUsername?: string
        shortcutUserId?: string
        shortcutHandle?: string
        shortcutUsername?: string
      }
      const person = people.find((item) => item.id === personId)
      if (person) {
        person.name = body.name
        person.githubUsername = body.githubUsername
        person.slackUsername = body.slackUsername
        person.shortcutUserId = body.shortcutUserId
        person.shortcutHandle = body.shortcutHandle
        person.shortcutUsername = body.shortcutUsername
        person.updatedAt = now
      }
      return new Response(JSON.stringify({ ok: true, personId }), { status: 200 })
    }

    if (url.startsWith('/api/people/') && method === 'DELETE') {
      const [, , , id] = url.split('/')
      const personId = decodeURIComponent(id ?? '')
      const index = people.findIndex((item) => item.id === personId)
      if (index >= 0) {
        people.splice(index, 1)
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    if (url === '/api/projects' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        name: string
        shortcutSourceConfigId?: string
        githubRepos?: string[]
        slackChannelIds?: string[]
      }
      const id = crypto.randomUUID()
      projects.push({
        id,
        name: body.name,
        shortcutSourceConfigId: body.shortcutSourceConfigId,
        githubRepos: body.githubRepos ?? [],
        slackChannelIds: body.slackChannelIds ?? [],
        createdAt: now,
        updatedAt: now,
      })
      return new Response(JSON.stringify({ ok: true, projectId: id }), { status: 200 })
    }

    if (url.startsWith('/api/projects/') && method === 'PUT') {
      const [, , , id] = url.split('/')
      const projectId = decodeURIComponent(id ?? '')
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        name: string
        shortcutSourceConfigId?: string
        githubRepos?: string[]
        slackChannelIds?: string[]
      }
      const project = projects.find((item) => item.id === projectId)
      if (project) {
        project.name = body.name
        project.shortcutSourceConfigId = body.shortcutSourceConfigId
        project.githubRepos = body.githubRepos ?? []
        project.slackChannelIds = body.slackChannelIds ?? []
        project.updatedAt = now
      }
      return new Response(JSON.stringify({ ok: true, projectId }), { status: 200 })
    }

    if (url.startsWith('/api/projects/') && method === 'DELETE') {
      const [, , , id] = url.split('/')
      const projectId = decodeURIComponent(id ?? '')
      const index = projects.findIndex((item) => item.id === projectId)
      if (index >= 0) {
        projects.splice(index, 1)
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    if (url.startsWith('/api/sync/history') && method === 'GET') {
      return new Response(JSON.stringify({ history: syncHistory }), { status: 200 })
    }

    if (url.startsWith('/api/inbox/') && url.endsWith('/read') && method === 'PATCH') {
      const parts = url.split('/')
      const id = decodeURIComponent(parts[3] ?? '')
      const body = JSON.parse(String(init?.body ?? '{}')) as { isRead: boolean }
      const item = inboxItems.find((entry) => entry.id === id)
      if (item) {
        item.isRead = body.isRead
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    if (url === '/api/inbox/clear-all' && method === 'POST') {
      const clearedNotifications = inboxItems.length
      const clearedReadStates = inboxItems.length
      const clearedSyncHistory = syncHistory.length
      const resetWatermarks = 0
      inboxItems.splice(0, inboxItems.length)
      syncHistory.splice(0, syncHistory.length)
      return new Response(
        JSON.stringify({
          clearedNotifications,
          clearedReadStates,
          clearedSyncHistory,
          resetWatermarks,
        }),
        { status: 200 },
      )
    }

    if (url === '/api/sync/manual' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { source?: SourceKind; instanceKey?: string }
      if (body.source && body.instanceKey) {
        const key = `${body.source}:${body.instanceKey}`
        const sourceResponse = nextSourceManualSync.get(key)
        if (sourceResponse) {
          if (sourceResponse.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, sourceResponse.delayMs))
          }
          if (sourceResponse.ok) {
            return new Response(JSON.stringify(sourceResponse.payload), { status: 200 })
          }
          return new Response(JSON.stringify(sourceResponse.payload), { status: 500 })
        }
      }
      if (nextManualSync.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, nextManualSync.delayMs))
      }
      if (nextManualSync.ok) {
        return new Response(JSON.stringify(nextManualSync.payload), { status: 200 })
      }
      return new Response(JSON.stringify(nextManualSync.payload), { status: 500 })
    }

    return new Response(JSON.stringify({ error: `Unhandled ${method} ${url}` }), { status: 500 })
  })

  return {
    fetchMock,
    sourceConfigs,
    projects,
    people,
    inboxItems,
    syncHistory,
    setManualSyncResponse(payload: unknown) {
      nextManualSync = { ok: true, payload }
    },
    setManualSyncFailure(message: string) {
      nextManualSync = { ok: false, payload: { error: message } }
    },
    setSourceManualSyncResponse(
      source: SourceKind,
      instanceKey: string,
      payload: unknown,
      options?: { delayMs?: number },
    ) {
      nextSourceManualSync.set(`${source}:${instanceKey}`, {
        ok: true,
        payload,
        delayMs: options?.delayMs,
      })
    },
  }
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderApp(route = '/inbox') {
    render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>,
    )
  }

  it('renders inbox route by default', () => {
    const mockApi = createMockApi()
    vi.stubGlobal('fetch', mockApi.fetchMock)
    renderApp()

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('renders settings route and allows navigation back to inbox', async () => {
    const mockApi = createMockApi()
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Inbox' }))
    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument()
  })

  it('renders settings subpage routes and subnavigation', async () => {
    const mockApi = createMockApi()
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')

    expect(await screen.findByRole('heading', { name: 'Sources' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Projects' }))
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Sync History' }))
    expect(await screen.findByRole('heading', { name: 'Sync history' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'People' }))
    expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument()
  })

  it('creates a source config, syncs, and toggles read/unread', async () => {
    const mockApi = createMockApi()
    mockApi.inboxItems.push({
      id: 'gh-1',
      source: 'github',
      title: 'PR comment',
      occurredAt: '2026-01-14T11:00:00.000Z',
      isRead: false,
      body: 'Review requested',
    })
    mockApi.setManualSyncResponse({
      startedAt: '2026-01-15T12:00:00.000Z',
      finishedAt: '2026-01-15T12:00:02.000Z',
      totalSources: 1,
      succeededSources: 1,
      failedSources: 0,
      totalFetched: 1,
      totalUpserted: 1,
      totalArchived: 0,
      sources: [
        {
          source: 'github',
          instanceKey: 'main',
          displayName: 'GitHub Main',
          runId: 'run-1',
          status: 'success',
          fetchedCount: 1,
          upsertedCount: 1,
          archivedCount: 0,
        },
      ],
    })

    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')

    await user.selectOptions(screen.getByLabelText('Provider'), 'github')
    expect(screen.getByLabelText('Require involvement in addition to mentions')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Instance key'))
    await user.type(screen.getByLabelText('Instance key'), 'main')
    await user.type(screen.getByLabelText('Display name'), 'GitHub Main')
    await user.type(screen.getByLabelText('Token'), 'ghp_test')
    await user.click(screen.getByRole('button', { name: 'Save source' }))

    expect(await screen.findByText('Source saved.')).toBeInTheDocument()
    expect(await screen.findByText(/GitHub Main/)).toBeInTheDocument()
    expect(mockApi.sourceConfigs).toHaveLength(1)

    await user.click(screen.getByRole('link', { name: 'Inbox' }))
    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(
      await screen.findByText('Synced 1 source(s). Success: 1, Failed: 0, Upserted notifications: 1.'),
    ).toBeInTheDocument()
    expect(await screen.findByText(/PR comment/)).toBeInTheDocument()
    expect(await screen.findByText(/Unread/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark as read' }))
    expect(await screen.findByRole('button', { name: 'Mark as unread' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark as unread' }))
    expect(await screen.findByRole('button', { name: 'Mark as read' })).toBeInTheDocument()

    await waitFor(() => {
      expect(mockApi.fetchMock).toHaveBeenCalledWith('/api/sync/manual', { method: 'POST' })
    })
  })

  it('shows actionable validation and sync failure errors', async () => {
    const mockApi = createMockApi()
    mockApi.setManualSyncFailure('Slack token rejected')
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')

    await user.click(screen.getByRole('button', { name: 'Save source' }))
    expect(
      await screen.findByText(/Display name is required\. Access token is required\. Slack requires a user ID\./),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Inbox' }))
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(await screen.findByText('Slack token rejected')).toBeInTheDocument()
  })

  it('syncs a single source from Settings and shows row status', async () => {
    const now = '2026-01-15T12:00:00.000Z'
    const mockApi = createMockApi()
    mockApi.sourceConfigs.push({
      id: 'github-main',
      source: 'github',
      instanceKey: 'main',
      displayName: 'GitHub Main',
      enabled: true,
      credentials: {
        authMode: 'token',
        token: { value: 'ghp_test' },
        service: { github: {} },
      },
      createdAt: now,
      updatedAt: now,
    })
    mockApi.setSourceManualSyncResponse(
      'github',
      'main',
      {
        startedAt: '2026-01-15T12:00:00.000Z',
        finishedAt: '2026-01-15T12:00:02.000Z',
        totalSources: 1,
        succeededSources: 1,
        failedSources: 0,
        totalFetched: 2,
        totalUpserted: 2,
        totalArchived: 0,
        sources: [
          {
            source: 'github',
            instanceKey: 'main',
            displayName: 'GitHub Main',
            runId: 'run-row-1',
            status: 'success',
            fetchedCount: 2,
            upsertedCount: 2,
            archivedCount: 0,
          },
        ],
      },
      { delayMs: 20 },
    )
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')

    expect(await screen.findByText(/GitHub Main/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    expect(await screen.findByRole('button', { name: 'Syncing...' })).toBeInTheDocument()
    expect(await screen.findByText(/Synced 2 items/)).toBeInTheDocument()

    await waitFor(() => {
      expect(mockApi.fetchMock).toHaveBeenCalledWith('/api/sync/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'github', instanceKey: 'main' }),
      })
    })
  })

  it('renders Shortcut mentions without showing shortcutapp links', async () => {
    const mockApi = createMockApi()
    mockApi.inboxItems.push({
      id: 'shortcut-mention-1',
      source: 'shortcut',
      title: 'Shortcut comment mention',
      occurredAt: '2026-01-14T11:00:00.000Z',
      isRead: false,
      body: 'Ping [@anirvan](shortcutapp://members/123) on this thread.',
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)

    renderApp('/')

    const mention = await screen.findByText('@anirvan')
    expect(mention).toHaveClass('item-body-mention')
    expect(screen.getByText(/Ping/)).toBeInTheDocument()
    expect(screen.getByText(/on this thread\./)).toBeInTheDocument()
    expect(screen.queryByText(/shortcutapp:\/\/members\//)).not.toBeInTheDocument()
  })

  it('shows link icon only when notification URL exists', async () => {
    const mockApi = createMockApi()
    mockApi.inboxItems.push(
      {
        id: 'github-with-link',
        source: 'github',
        title: 'GitHub mention',
        occurredAt: '2026-01-14T11:00:00.000Z',
        isRead: false,
        url: 'https://github.com/acme/home/pull/42#discussion_r100',
      },
      {
        id: 'shortcut-no-link',
        source: 'shortcut',
        title: 'Shortcut mention',
        occurredAt: '2026-01-14T11:05:00.000Z',
        isRead: false,
      },
    )
    vi.stubGlobal('fetch', mockApi.fetchMock)
    renderApp('/inbox')

    expect(await screen.findByText('GitHub mention')).toBeInTheDocument()
    expect(screen.getByLabelText('Open github notification link')).toHaveAttribute(
      'href',
      'https://github.com/acme/home/pull/42#discussion_r100',
    )
    expect(screen.queryByLabelText('Open shortcut notification link')).not.toBeInTheDocument()
  })

  it('toggles between full and condensed notification views', async () => {
    const mockApi = createMockApi()
    mockApi.inboxItems.push({
      id: 'github-with-body',
      source: 'github',
      title: 'GitHub review requested',
      occurredAt: '2026-01-14T11:00:00.000Z',
      isRead: false,
      body: 'Please review the latest changes.',
      projectName: 'Core',
      fromPersonName: 'Alice',
      url: 'https://github.com/acme/home/pull/42#discussion_r100',
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/inbox')

    expect(await screen.findByText('GitHub review requested')).toBeInTheDocument()
    expect(screen.getByText('Please review the latest changes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
    expect(screen.getByText('From: Alice')).toBeInTheDocument()
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByLabelText('Open github notification link')).toHaveAttribute(
      'href',
      'https://github.com/acme/home/pull/42#discussion_r100',
    )

    const viewMode = screen.getByRole('group', { name: 'View mode' })
    await user.click(within(viewMode).getByRole('button', { name: 'Condensed' }))

    expect(screen.queryByText('Please review the latest changes.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument()
    expect(screen.getByText(/github -/i)).toBeInTheDocument()
    expect(screen.getByText('From: Alice')).toBeInTheDocument()
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByLabelText('Open github notification link')).toBeInTheDocument()

    await user.click(within(viewMode).getByRole('button', { name: 'Full' }))
    expect(await screen.findByText('Please review the latest changes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
  })

  it('keeps project/source/from filters working in condensed mode', async () => {
    const mockApi = createMockApi()
    const alphaProjectId = 'project-alpha'
    const betaProjectId = 'project-beta'
    mockApi.projects.push(
      {
        id: alphaProjectId,
        name: 'Alpha',
        githubRepos: [],
        slackChannelIds: [],
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
      {
        id: betaProjectId,
        name: 'Beta',
        githubRepos: [],
        slackChannelIds: [],
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
    )
    mockApi.people.push(
      {
        id: 'person-a',
        name: 'Alice',
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
      {
        id: 'person-b',
        name: 'Bob',
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
    )
    mockApi.inboxItems.push(
      {
        id: 'alpha-github',
        source: 'github',
        title: 'Alpha GitHub item',
        occurredAt: '2026-01-14T11:10:00.000Z',
        isRead: false,
        projectId: alphaProjectId,
        projectName: 'Alpha',
        fromPersonId: 'person-a',
        fromPersonName: 'Alice',
        body: 'Alpha details',
      },
      {
        id: 'beta-slack',
        source: 'slack',
        title: 'Beta Slack item',
        occurredAt: '2026-01-14T11:20:00.000Z',
        isRead: false,
        projectId: betaProjectId,
        projectName: 'Beta',
        fromPersonId: 'person-b',
        fromPersonName: 'Bob',
        body: 'Beta details',
      },
    )
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/inbox')

    expect(await screen.findByText('Alpha GitHub item')).toBeInTheDocument()
    expect(await screen.findByText('Beta Slack item')).toBeInTheDocument()

    await user.click(within(screen.getByRole('group', { name: 'View mode' })).getByRole('button', { name: 'Condensed' }))
    await user.click(within(screen.getByRole('group', { name: 'Source filters' })).getByRole('button', { name: 'Slack' }))
    await user.click(within(screen.getByRole('group', { name: 'Project filters' })).getByRole('button', { name: 'Beta' }))
    await user.click(within(screen.getByRole('group', { name: 'From filters' })).getByRole('button', { name: 'Bob' }))

    expect(await screen.findByText('Beta Slack item')).toBeInTheDocument()
    expect(screen.queryByText('Alpha GitHub item')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta details')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument()

    await user.click(within(screen.getByRole('group', { name: 'View mode' })).getByRole('button', { name: 'Full' }))
    expect(await screen.findByText('Beta details')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
    expect(screen.queryByText('Alpha GitHub item')).not.toBeInTheDocument()
  })

  it('supports editing, enable-disable, and deleting sources', async () => {
    const now = '2026-01-15T12:00:00.000Z'
    const mockApi = createMockApi()
    mockApi.sourceConfigs.push({
      id: 'shortcut-1',
      source: 'shortcut',
      instanceKey: 'workspace-a',
      displayName: 'Shortcut A',
      enabled: true,
      credentials: {
        authMode: 'token',
        token: { value: 'short-secret' },
        service: { shortcut: {} },
      },
      createdAt: now,
      updatedAt: now,
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')

    expect(await screen.findByText(/Shortcut A/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Shortcut Workspace A')
    await user.click(screen.getByRole('button', { name: 'Save source' }))
    expect(await screen.findByText(/Shortcut Workspace A/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Disable' }))
    expect(await screen.findByText(/disabled\./i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Deleted Shortcut Workspace A.')).toBeInTheDocument()
    expect(screen.getByText('No sources configured yet.')).toBeInTheDocument()
  })

  it('supports project CRUD from Settings', async () => {
    const now = '2026-01-15T12:00:00.000Z'
    const mockApi = createMockApi()
    mockApi.projects.push({
      id: 'project-1',
      name: 'Core',
      githubRepos: ['acme/api'],
      slackChannelIds: ['C123'],
      createdAt: now,
      updatedAt: now,
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')
    await user.click(await screen.findByRole('link', { name: 'Projects' }))

    expect(await screen.findByText('Core')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Project name'), 'Platform')
    await user.type(screen.getByLabelText('Project GitHub repositories'), 'acme/platform')
    await user.type(screen.getByLabelText('Project Slack channels'), 'C789')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Project created.')).toBeInTheDocument()
    expect(await screen.findByText('Platform')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.clear(screen.getByLabelText('Project name'))
    await user.type(screen.getByLabelText('Project name'), 'Platform Team')
    await user.click(screen.getByRole('button', { name: 'Update project' }))
    expect(await screen.findByText('Project updated.')).toBeInTheDocument()
    expect(await screen.findByText('Platform Team')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(await screen.findByText('Deleted project Platform Team.')).toBeInTheDocument()
  })

  it('supports people CRUD from Settings', async () => {
    const now = '2026-01-15T12:00:00.000Z'
    const mockApi = createMockApi()
    mockApi.people.push({
      id: 'person-1',
      name: 'Alice',
      githubUsername: 'octocat',
      createdAt: now,
      updatedAt: now,
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')
    await user.click(await screen.findByRole('link', { name: 'People' }))

    expect(await screen.findByText('Alice')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Person name'), 'Bob')
    await user.type(screen.getByLabelText('Person Slack username'), 'U123')
    await user.type(screen.getByLabelText('Person Shortcut user ID'), 'member-42')
    await user.type(screen.getByLabelText('Person Shortcut handle'), 'bob-handle')
    await user.click(screen.getByRole('button', { name: 'Create person' }))
    expect(await screen.findByText('Person created.')).toBeInTheDocument()
    expect(await screen.findByText('Bob')).toBeInTheDocument()
    expect(await screen.findByText('Shortcut user ID: member-42')).toBeInTheDocument()
    expect(await screen.findByText('Shortcut handle: bob-handle')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.clear(screen.getByLabelText('Person name'))
    await user.type(screen.getByLabelText('Person name'), 'Bob Updated')
    await user.click(screen.getByRole('button', { name: 'Update person' }))
    expect(await screen.findByText('Person updated.')).toBeInTheDocument()
    expect(await screen.findByText('Bob Updated')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(await screen.findByText('Deleted person Bob Updated.')).toBeInTheDocument()
  })

  it('renders project badge and filters inbox by project', async () => {
    const mockApi = createMockApi()
    const projectAId = 'project-a'
    const projectBId = 'project-b'
    mockApi.projects.push(
      {
        id: projectAId,
        name: 'Alpha',
        githubRepos: [],
        slackChannelIds: [],
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
      {
        id: projectBId,
        name: 'Beta',
        githubRepos: [],
        slackChannelIds: [],
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
    )
    mockApi.inboxItems.push(
      {
        id: 'n-1',
        source: 'github',
        title: 'Alpha notification',
        occurredAt: '2026-01-14T11:00:00.000Z',
        isRead: false,
        projectId: projectAId,
        projectName: 'Alpha',
      },
      {
        id: 'n-2',
        source: 'slack',
        title: 'Beta notification',
        occurredAt: '2026-01-14T11:00:00.000Z',
        isRead: false,
        projectId: projectBId,
        projectName: 'Beta',
      },
    )
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/inbox')

    expect(await screen.findByText('Alpha notification')).toBeInTheDocument()
    expect(await screen.findByText('Beta notification')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Alpha' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Beta' })).toBeInTheDocument()
    expect(document.querySelectorAll('.item-project-badge')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(await screen.findByText('Alpha notification')).toBeInTheDocument()
    expect(screen.queryByText('Beta notification')).not.toBeInTheDocument()

    await user.click(within(screen.getByRole('group', { name: 'Project filters' })).getByRole('button', { name: 'All' }))
    expect(await screen.findByText('Beta notification')).toBeInTheDocument()
  })

  it('renders source filter options and groups Shortcut items', async () => {
    const mockApi = createMockApi()
    mockApi.inboxItems.push(
      {
        id: 'shortcut-item-a',
        source: 'shortcut',
        title: 'Shortcut workspace A item',
        occurredAt: '2026-01-14T11:00:00.000Z',
        isRead: false,
      },
      {
        id: 'shortcut-item-b',
        source: 'shortcut',
        title: 'Shortcut workspace B item',
        occurredAt: '2026-01-14T11:05:00.000Z',
        isRead: false,
      },
      {
        id: 'slack-item-a',
        source: 'slack',
        title: 'Slack item',
        occurredAt: '2026-01-14T11:10:00.000Z',
        isRead: false,
      },
    )
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/inbox')

    const sourceFilters = await screen.findByRole('group', { name: 'Source filters' })
    expect(within(sourceFilters).getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(within(sourceFilters).getByRole('button', { name: 'Slack' })).toBeInTheDocument()
    expect(within(sourceFilters).queryByRole('button', { name: 'GitHub' })).not.toBeInTheDocument()
    expect(within(sourceFilters).getByRole('button', { name: 'Shortcut' })).toBeInTheDocument()

    await user.click(within(sourceFilters).getByRole('button', { name: 'Shortcut' }))
    expect(await screen.findByText('Shortcut workspace A item')).toBeInTheDocument()
    expect(await screen.findByText('Shortcut workspace B item')).toBeInTheDocument()
    expect(screen.queryByText('Slack item')).not.toBeInTheDocument()
  })

  it('composes source, project, and from filters in Inbox', async () => {
    const mockApi = createMockApi()
    const alphaProjectId = 'project-alpha'
    const betaProjectId = 'project-beta'
    mockApi.projects.push(
      {
        id: alphaProjectId,
        name: 'Alpha',
        githubRepos: [],
        slackChannelIds: [],
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
      {
        id: betaProjectId,
        name: 'Beta',
        githubRepos: [],
        slackChannelIds: [],
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
    )
    mockApi.inboxItems.push(
      {
        id: 'alpha-shortcut',
        source: 'shortcut',
        title: 'Alpha Shortcut item',
        occurredAt: '2026-01-14T11:00:00.000Z',
        isRead: false,
        projectId: alphaProjectId,
        projectName: 'Alpha',
        fromPersonId: 'person-a',
        fromPersonName: 'Alice',
      },
      {
        id: 'alpha-github',
        source: 'github',
        title: 'Alpha GitHub item',
        occurredAt: '2026-01-14T11:10:00.000Z',
        isRead: false,
        projectId: alphaProjectId,
        projectName: 'Alpha',
        fromPersonId: 'person-b',
        fromPersonName: 'Bob',
      },
      {
        id: 'beta-shortcut',
        source: 'shortcut',
        title: 'Beta Shortcut item',
        occurredAt: '2026-01-14T11:20:00.000Z',
        isRead: false,
        projectId: betaProjectId,
        projectName: 'Beta',
        fromPersonId: 'person-a',
        fromPersonName: 'Alice',
      },
    )
    mockApi.people.push(
      {
        id: 'person-a',
        name: 'Alice',
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
      {
        id: 'person-b',
        name: 'Bob',
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
      {
        id: 'person-c',
        name: 'Carol',
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
    )
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/inbox')

    expect(await screen.findByText('Alpha Shortcut item')).toBeInTheDocument()
    expect(await screen.findByText('Alpha GitHub item')).toBeInTheDocument()
    expect(await screen.findByText('Beta Shortcut item')).toBeInTheDocument()

    const sourceFilters = screen.getByRole('group', { name: 'Source filters' })
    const projectFilters = screen.getByRole('group', { name: 'Project filters' })
    const fromFilters = screen.getByRole('group', { name: 'From filters' })

    expect(within(fromFilters).getByRole('button', { name: 'Alice' })).toBeInTheDocument()
    expect(within(fromFilters).getByRole('button', { name: 'Bob' })).toBeInTheDocument()
    expect(within(fromFilters).queryByRole('button', { name: 'Carol' })).not.toBeInTheDocument()

    await user.click(within(sourceFilters).getByRole('button', { name: 'Shortcut' }))
    await user.click(within(projectFilters).getByRole('button', { name: 'Alpha' }))
    await user.click(within(fromFilters).getByRole('button', { name: 'Alice' }))

    expect(await screen.findByText('Alpha Shortcut item')).toBeInTheDocument()
    expect(screen.queryByText('Alpha GitHub item')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta Shortcut item')).not.toBeInTheDocument()
    expect(screen.getByText('From: Alice')).toBeInTheDocument()
    expect(within(fromFilters).queryByRole('button', { name: 'Bob' })).not.toBeInTheDocument()
  })

  it('keeps selected source filter visible when other filters remove matches', async () => {
    const mockApi = createMockApi()
    mockApi.inboxItems.push({
      id: 'shortcut-1',
      source: 'shortcut',
      title: 'Shortcut item',
      occurredAt: '2026-01-14T11:20:00.000Z',
      isRead: false,
    })
    mockApi.setManualSyncResponse({
      startedAt: '2026-01-15T12:00:00.000Z',
      finishedAt: '2026-01-15T12:00:02.000Z',
      totalSources: 1,
      succeededSources: 1,
      failedSources: 0,
      totalFetched: 1,
      totalUpserted: 1,
      totalArchived: 0,
      sources: [
        {
          source: 'github',
          instanceKey: 'main',
          displayName: 'GitHub Main',
          runId: 'run-1',
          status: 'success',
          fetchedCount: 1,
          upsertedCount: 1,
          archivedCount: 0,
        },
      ],
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/inbox')

    const sourceFilters = await screen.findByRole('group', { name: 'Source filters' })
    await user.click(within(sourceFilters).getByRole('button', { name: 'Shortcut' }))
    expect(await screen.findByText('Shortcut item')).toBeInTheDocument()

    mockApi.inboxItems.splice(0, mockApi.inboxItems.length)
    mockApi.inboxItems.push({
      id: 'github-1',
      source: 'github',
      title: 'GitHub item',
      occurredAt: '2026-01-14T11:20:00.000Z',
      isRead: false,
    })
    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(await screen.findByText('No inbox items yet.')).toBeInTheDocument()
    expect(within(sourceFilters).getByRole('button', { name: 'Shortcut' })).toBeInTheDocument()
    expect(within(sourceFilters).getByRole('button', { name: 'GitHub' })).toBeInTheDocument()
  })

  it('renders sync history on Settings', async () => {
    const mockApi = createMockApi()
    mockApi.syncHistory.push({
      runId: 'run-2',
      source: 'shortcut',
      instanceKey: 'workspace-a',
      status: 'failed',
      startedAt: '2026-01-15T12:05:00.000Z',
      finishedAt: '2026-01-15T12:05:03.000Z',
      fetchedCount: 0,
      upsertedCount: 0,
      archivedCount: 0,
      errorMessage: 'Shortcut timeout',
      sinceUsed: '2026-01-15T11:00:00.000Z',
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)
    renderApp('/settings/sync-history')

    expect(await screen.findByRole('heading', { name: 'Sync history' })).toBeInTheDocument()
    expect(await screen.findByText('shortcut/workspace-a')).toBeInTheDocument()
    expect(await screen.findByText(/fetched 0, upserted 0, archived 0/)).toBeInTheDocument()
    expect(await screen.findByText('Shortcut timeout')).toBeInTheDocument()
    expect(await screen.findByText('2026-01-15T11:00:00.000Z')).toBeInTheDocument()
  })

  it('clears notifications from Settings with confirmation modal', async () => {
    const mockApi = createMockApi()
    mockApi.inboxItems.push({
      id: 'clear-1',
      source: 'github',
      title: 'Needs clearing',
      occurredAt: '2026-01-14T11:00:00.000Z',
      isRead: true,
      body: 'Read item',
    })
    vi.stubGlobal('fetch', mockApi.fetchMock)
    const user = userEvent.setup()
    renderApp('/settings')

    await user.click(screen.getByRole('button', { name: 'Clear all notifications' }))
    expect(await screen.findByRole('heading', { name: 'Are you sure?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes, clear notifications' }))
    expect(
      await screen.findByText(
        'Cleared 1 notifications, 1 read-state records, 0 sync history rows, and reset 0 source watermark(s).',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Inbox' }))
    expect(await screen.findByText('No inbox items yet.')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockApi.fetchMock).toHaveBeenCalledWith('/api/inbox/clear-all', { method: 'POST' })
    })
  })
})
