import type { Project, ProjectMetadata } from '../domain/project'

type ProjectsResponse = {
  projects?: Project[]
  metadata?: ProjectMetadata
  projectId?: string
  error?: string
}

export type SaveProjectInput = {
  id?: string
  name: string
  shortcutSourceConfigId?: string
  githubRepos: string[]
  slackChannelIds: string[]
}

export async function listProjects(): Promise<{ projects: Project[]; metadata: ProjectMetadata }> {
  const response = await fetch('/api/projects')
  const payload = (await response.json().catch(() => ({}))) as ProjectsResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load projects')
  }
  return {
    projects: payload.projects ?? [],
    metadata: payload.metadata ?? { shortcutSources: [], knownGithubRepos: [], knownSlackChannels: [] },
  }
}

export async function saveProject(input: SaveProjectInput): Promise<string> {
  const method = input.id ? 'PUT' : 'POST'
  const response = await fetch(input.id ? `/api/projects/${encodeURIComponent(input.id)}` : '/api/projects', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as ProjectsResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to save project')
  }
  return payload.projectId ?? input.id ?? ''
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ProjectsResponse
    throw new Error(payload.error ?? 'Failed to delete project')
  }
}
