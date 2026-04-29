import { createProjectEndpoint } from './project-endpoint'
import type { Project, ProjectMetadata } from '../domain/project'

describe('project endpoint', () => {
  const metadata: ProjectMetadata = {
    shortcutSources: [{ id: 'shortcut-1', instanceKey: 'workspace-a', displayName: 'Shortcut A' }],
    knownGithubRepos: ['acme/api'],
    knownSlackChannels: ['C123'],
  }

  function createService() {
    const projects: Project[] = []
    return {
      projects,
      service: {
        async listProjects() {
          return projects
        },
        async listProjectMetadata() {
          return metadata
        },
        async upsertProject(input: {
          id?: string
          name: string
          shortcutSourceConfigId?: string
          githubRepos: string[]
          slackChannelIds: string[]
        }) {
          const id = input.id ?? `project-${projects.length + 1}`
          const now = '2026-01-15T12:00:00.000Z'
          const existing = projects.find((project) => project.id === id)
          if (existing) {
            existing.name = input.name
            existing.shortcutSourceConfigId = input.shortcutSourceConfigId
            existing.githubRepos = input.githubRepos
            existing.slackChannelIds = input.slackChannelIds
            existing.updatedAt = now
            return id
          }
          projects.push({
            id,
            name: input.name,
            shortcutSourceConfigId: input.shortcutSourceConfigId,
            githubRepos: input.githubRepos,
            slackChannelIds: input.slackChannelIds,
            createdAt: now,
            updatedAt: now,
          })
          return id
        },
        async deleteProject(projectId: string) {
          const index = projects.findIndex((project) => project.id === projectId)
          if (index >= 0) {
            projects.splice(index, 1)
          }
        },
      },
    }
  }

  it('supports project CRUD routes', async () => {
    const { projects, service } = createService()
    const endpoint = createProjectEndpoint(service)

    const createResponse = await endpoint(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Core',
          shortcutSourceConfigId: 'shortcut-1',
          githubRepos: ['acme/api'],
          slackChannelIds: ['C123'],
        }),
      }),
    )
    expect(createResponse.status).toBe(200)
    const createPayload = (await createResponse.json()) as { projectId: string }
    expect(createPayload.projectId).toBe('project-1')
    expect(projects).toHaveLength(1)

    const listResponse = await endpoint(new Request('http://localhost/api/projects', { method: 'GET' }))
    expect(listResponse.status).toBe(200)
    const listPayload = (await listResponse.json()) as { projects: Project[]; metadata: ProjectMetadata }
    expect(listPayload.projects).toHaveLength(1)
    expect(listPayload.metadata.shortcutSources).toHaveLength(1)

    const updateResponse = await endpoint(
      new Request('http://localhost/api/projects/project-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Core Updated',
          githubRepos: ['acme/api', 'acme/web'],
          slackChannelIds: ['C123', 'C456'],
        }),
      }),
    )
    expect(updateResponse.status).toBe(200)
    expect(projects[0].name).toBe('Core Updated')

    const deleteResponse = await endpoint(
      new Request('http://localhost/api/projects/project-1', {
        method: 'DELETE',
      }),
    )
    expect(deleteResponse.status).toBe(200)
    expect(projects).toHaveLength(0)
  })

  it('returns 400 for invalid project payload', async () => {
    const { service } = createService()
    const endpoint = createProjectEndpoint(service)
    const response = await endpoint(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          githubRepos: 'acme/api',
        }),
      }),
    )
    expect(response.status).toBe(400)
  })
})
