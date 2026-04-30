import type { Connect, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createManualSyncEndpoint } from './manual-sync-endpoint'
import { createReplaySyncEndpoint } from './replay-sync-endpoint'
import { createClearNotificationsEndpoint } from './clear-notifications-endpoint'
import { createMarkAllReadEndpoint } from './mark-all-read-endpoint'
import { createPeopleEndpoint } from './people-endpoint'
import { createProjectEndpoint } from './project-endpoint'
import { createSyncHistoryEndpoint } from './sync-history-endpoint'
import { createWorkEndpoint } from './work-endpoint'
import { createLocalManualSyncService } from './local-manual-sync-service'
import type { SourceKind } from '../domain/notification'

type SourceConfigPayload = {
  source?: SourceKind
  instanceKey?: string
  displayName?: string
  enabled?: boolean
  token?: string
  slackUserId?: string
  slackWorkspaceUrl?: string
  shortcutAllowedWorkflowStates?: string[]
  githubApiBaseUrl?: string
  githubParticipating?: boolean
}

type ManualSyncPayload = {
  source?: SourceKind
  instanceKey?: string
}

function getPathname(url: string): string {
  const [path] = url.split('?')
  return path ?? url
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return {} as T
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

function writeJsonResponse(
  res: ServerResponse<IncomingMessage>,
  payload: unknown,
  statusCode = 200,
): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function validateSourcePayload(payload: SourceConfigPayload): string[] {
  const errors: string[] = []
  const source = payload.source
  if (!source || !['slack', 'github', 'shortcut'].includes(source)) {
    errors.push('Select a valid provider: slack, github, or shortcut.')
  }

  if (!payload.instanceKey?.trim()) {
    errors.push('Set an instance key (example: default).')
  }
  if (!payload.displayName?.trim()) {
    errors.push('Set a display name to identify this source.')
  }
  if (!payload.token?.trim()) {
    errors.push('Add an access token for this source.')
  }

  if (source === 'slack' && !payload.slackUserId?.trim()) {
    errors.push('Slack requires a user ID (service.slack.userId).')
  }
  return errors
}

function createMiddleware(): Connect.NextHandleFunction {
  let handleManualSync: ReturnType<typeof createManualSyncEndpoint> | undefined
  let handleReplaySync: ReturnType<typeof createReplaySyncEndpoint> | undefined
  let handleClearNotifications: ReturnType<typeof createClearNotificationsEndpoint> | undefined
  let handleMarkAllRead: ReturnType<typeof createMarkAllReadEndpoint> | undefined
  let handleProjects: ReturnType<typeof createProjectEndpoint> | undefined
  let handlePeople: ReturnType<typeof createPeopleEndpoint> | undefined
  let handleSyncHistory: ReturnType<typeof createSyncHistoryEndpoint> | undefined
  let handleWork: ReturnType<typeof createWorkEndpoint> | undefined
  let localService: ReturnType<typeof createLocalManualSyncService> | undefined

  return async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/')) {
      next()
      return
    }

    if (!localService) {
      localService = createLocalManualSyncService()
    }

    const method = req.method ?? 'GET'
    const pathname = getPathname(req.url)

    if (pathname === '/api/sources' && method === 'GET') {
      const sources = await localService.listSourceConfigs()
      writeJsonResponse(res, { sources })
      return
    }

    if (pathname === '/api/sources' && method === 'POST') {
      const payload = await readJsonBody<SourceConfigPayload>(req)
      const errors = validateSourcePayload(payload)
      if (errors.length > 0) {
        writeJsonResponse(res, { error: errors.join(' ') }, 400)
        return
      }

      await localService.upsertSourceConfig({
        source: payload.source as SourceKind,
        instanceKey: payload.instanceKey!.trim(),
        displayName: payload.displayName!.trim(),
        enabled: payload.enabled ?? true,
        token: payload.token!.trim(),
        slackUserId: payload.slackUserId?.trim(),
        slackWorkspaceUrl: payload.slackWorkspaceUrl?.trim() || undefined,
        githubApiBaseUrl: payload.githubApiBaseUrl?.trim() || undefined,
        githubParticipating: payload.githubParticipating ?? false,
      })

      writeJsonResponse(res, { ok: true }, 200)
      return
    }

    if (pathname.startsWith('/api/sources/') && method === 'DELETE') {
      const [, , , source, ...instanceParts] = pathname.split('/')
      const instanceKey = decodeURIComponent(instanceParts.join('/'))
      if (!source || !instanceKey) {
        writeJsonResponse(res, { error: 'Missing source or instance key in URL.' }, 400)
        return
      }

      await localService.deleteSourceConfig(source as SourceKind, instanceKey)
      writeJsonResponse(res, { ok: true }, 200)
      return
    }

    if (pathname === '/api/projects' || pathname.startsWith('/api/projects/')) {
      if (!handleProjects) {
        handleProjects = createProjectEndpoint(localService)
      }
      const body =
        method === 'POST' || method === 'PUT'
          ? await readJsonBody<Record<string, unknown>>(req)
          : undefined
      const response = await handleProjects({
        method,
        url: `http://localhost${req.url}`,
        async text() {
          return body ? JSON.stringify(body) : ''
        },
      })
      writeJsonResponse(res, await response.json(), response.status)
      return
    }

    if (pathname === '/api/people' || pathname.startsWith('/api/people/')) {
      if (!handlePeople) {
        handlePeople = createPeopleEndpoint(localService)
      }
      const body =
        method === 'POST' || method === 'PUT'
          ? await readJsonBody<Record<string, unknown>>(req)
          : undefined
      const response = await handlePeople({
        method,
        url: `http://localhost${req.url}`,
        async text() {
          return body ? JSON.stringify(body) : ''
        },
      })
      writeJsonResponse(res, await response.json(), response.status)
      return
    }

    if (
      pathname === '/api/work' ||
      pathname === '/api/work/from-notification' ||
      pathname === '/api/work/reorder' ||
      pathname.startsWith('/api/work/')
    ) {
      if (!handleWork) {
        handleWork = createWorkEndpoint(localService)
      }
      const body =
        method === 'POST' || method === 'PUT' || method === 'PATCH'
          ? await readJsonBody<Record<string, unknown>>(req)
          : undefined
      const response = await handleWork({
        method,
        url: `http://localhost${req.url}`,
        async text() {
          return body ? JSON.stringify(body) : ''
        },
      })
      writeJsonResponse(res, await response.json(), response.status)
      return
    }

    if (pathname === '/api/inbox' && method === 'GET') {
      const items = await localService.listInboxItems()
      writeJsonResponse(res, { items })
      return
    }

    if (pathname.startsWith('/api/inbox/') && pathname.endsWith('/read') && method === 'PATCH') {
      const parts = pathname.split('/')
      const notificationId = decodeURIComponent(parts[3] ?? '')
      if (!notificationId) {
        writeJsonResponse(res, { error: 'Missing notification ID in URL.' }, 400)
        return
      }

      const payload = await readJsonBody<{ isRead?: boolean }>(req)
      if (typeof payload.isRead !== 'boolean') {
        writeJsonResponse(res, { error: 'Provide `isRead` as true or false.' }, 400)
        return
      }

      await localService.setInboxReadState(notificationId, payload.isRead)
      writeJsonResponse(res, { ok: true }, 200)
      return
    }

    if (pathname === '/api/inbox/mark-all-read') {
      if (!handleMarkAllRead) {
        handleMarkAllRead = createMarkAllReadEndpoint(localService)
      }
      const response = await handleMarkAllRead({ method })
      writeJsonResponse(res, await response.json(), response.status)
      return
    }

    if (pathname === '/api/inbox/clear-all') {
      if (!handleClearNotifications) {
        handleClearNotifications = createClearNotificationsEndpoint(localService)
      }
      const response = await handleClearNotifications({ method })
      writeJsonResponse(res, await response.json(), response.status)
      return
    }

    if (pathname === '/api/sync/history') {
      if (!handleSyncHistory) {
        handleSyncHistory = createSyncHistoryEndpoint(localService)
      }
      const response = await handleSyncHistory({ method, url: `http://localhost${req.url}` })
      writeJsonResponse(res, await response.json(), response.status)
      return
    }

    if (pathname.startsWith('/api/sync/replay')) {
      if (!handleReplaySync) {
        handleReplaySync = createReplaySyncEndpoint(localService)
      }

      const payload =
        method === 'POST' ? await readJsonBody<ManualSyncPayload>(req) : ({} as ManualSyncPayload)
      const response = await handleReplaySync({ method }, payload)
      writeJsonResponse(res, await response.json(), response.status)
      return
    }

    if (!pathname.startsWith('/api/sync/manual')) {
      writeJsonResponse(res, { error: `Unknown API route: ${pathname}` }, 404)
      return
    }

    if (!handleManualSync) {
      handleManualSync = createManualSyncEndpoint(localService)
    }

    const payload =
      method === 'POST' ? await readJsonBody<ManualSyncPayload>(req) : ({} as ManualSyncPayload)
    const response = await handleManualSync({ method }, payload)
    writeJsonResponse(res, await response.json(), response.status)
  }
}

export function manualSyncApiPlugin(): Plugin {
  return {
    name: 'manual-sync-api',
    configureServer(server) {
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMiddleware())
    },
  }
}
