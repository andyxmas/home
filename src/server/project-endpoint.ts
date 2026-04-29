import type { Project, ProjectMetadata } from '../domain/project'

export type ProjectService = {
  listProjects(): Promise<Project[]>
  listProjectMetadata(): Promise<ProjectMetadata>
  upsertProject(input: {
    id?: string
    name: string
    shortcutSourceConfigId?: string
    githubRepos: string[]
    slackChannelIds: string[]
  }): Promise<string>
  deleteProject(projectId: string): Promise<void>
}

type ProjectPayload = {
  id?: string
  name?: string
  shortcutSourceConfigId?: string
  githubRepos?: string[]
  slackChannelIds?: string[]
}

function normalizeValues(values: string[] | undefined): string[] {
  const deduped = new Set<string>()
  for (const value of values ?? []) {
    const normalized = value.trim()
    if (normalized) {
      deduped.add(normalized)
    }
  }
  return [...deduped]
}

function validatePayload(payload: ProjectPayload): string[] {
  const errors: string[] = []
  if (!payload.name?.trim()) {
    errors.push('Project name is required.')
  }
  if (payload.githubRepos && !Array.isArray(payload.githubRepos)) {
    errors.push('GitHub repositories must be an array of repository names.')
  }
  if (payload.slackChannelIds && !Array.isArray(payload.slackChannelIds)) {
    errors.push('Slack channels must be an array of channel IDs.')
  }
  return errors
}

async function readPayload<T>(request: Pick<Request, 'text'>): Promise<T> {
  const text = await request.text()
  if (!text.trim()) {
    return {} as T
  }
  return JSON.parse(text) as T
}

export function createProjectEndpoint(service: ProjectService) {
  return async function handleProjectEndpoint(request: Pick<Request, 'method' | 'url' | 'text'>) {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === '/api/projects' && request.method === 'GET') {
      const [projects, metadata] = await Promise.all([service.listProjects(), service.listProjectMetadata()])
      return Response.json({ projects, metadata }, { status: 200 })
    }

    if (pathname === '/api/projects' && request.method === 'POST') {
      const payload = await readPayload<ProjectPayload>(request)
      const errors = validatePayload(payload)
      if (errors.length > 0) {
        return Response.json({ error: errors.join(' ') }, { status: 400 })
      }

      const projectId = await service.upsertProject({
        name: payload.name!.trim(),
        shortcutSourceConfigId: payload.shortcutSourceConfigId?.trim() || undefined,
        githubRepos: normalizeValues(payload.githubRepos),
        slackChannelIds: normalizeValues(payload.slackChannelIds),
      })
      return Response.json({ ok: true, projectId }, { status: 200 })
    }

    if (pathname.startsWith('/api/projects/') && request.method === 'PUT') {
      const projectId = decodeURIComponent(pathname.replace('/api/projects/', '').trim())
      if (!projectId) {
        return Response.json({ error: 'Missing project ID in URL.' }, { status: 400 })
      }
      const payload = await readPayload<ProjectPayload>(request)
      const errors = validatePayload(payload)
      if (errors.length > 0) {
        return Response.json({ error: errors.join(' ') }, { status: 400 })
      }

      await service.upsertProject({
        id: projectId,
        name: payload.name!.trim(),
        shortcutSourceConfigId: payload.shortcutSourceConfigId?.trim() || undefined,
        githubRepos: normalizeValues(payload.githubRepos),
        slackChannelIds: normalizeValues(payload.slackChannelIds),
      })
      return Response.json({ ok: true, projectId }, { status: 200 })
    }

    if (pathname.startsWith('/api/projects/') && request.method === 'DELETE') {
      const projectId = decodeURIComponent(pathname.replace('/api/projects/', '').trim())
      if (!projectId) {
        return Response.json({ error: 'Missing project ID in URL.' }, { status: 400 })
      }
      await service.deleteProject(projectId)
      return Response.json({ ok: true }, { status: 200 })
    }

    return Response.json({ error: 'Project endpoint route not found.' }, { status: 404 })
  }
}
