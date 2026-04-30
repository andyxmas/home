import type { SourceConfig } from '../../domain/notification'
import type { WorkColumn } from '../../domain/work'
import { requestJson } from '../../adapters/provider/http'

type FetchLike = typeof fetch

type ShortcutMemberResponse = {
  id?: string
}

type ShortcutWorkflowState = {
  name?: string
}

type ShortcutStoryTask = {
  complete?: boolean
  description?: string
}

type ShortcutStory = {
  id?: number
  name?: string
  app_url?: string
  owner_ids?: string[]
  workflow_state?: ShortcutWorkflowState
  tasks?: ShortcutStoryTask[]
}

type ShortcutSearchStoriesResponse = {
  data?: ShortcutStory[]
  next?: string
}

export type ShortcutWorkSyncDependencies = {
  fetchImpl?: FetchLike
  getMeShortcutHandle(): Promise<string | null>
  upsertWorkItem(input: {
    kind: 'shortcut_story_assigned' | 'shortcut_code_review'
    dedupeKey: string
    externalId: string
    title: string
    body?: string
    url?: string
    projectId?: string
    column: WorkColumn
  }): Promise<void>
  resolveProjectIdForShortcutInstance(instanceKey: string): Promise<string | null>
}

const DEFAULT_SHORTCUT_API_BASE_URL = 'https://api.app.shortcut.com'
const DEFAULT_ALLOWED_WORKFLOW_STATES = ['Ready for Work', 'In Progress', 'Rejected Review']

function requireShortcutToken(config: SourceConfig): string {
  const token = config.credentials.token?.value?.trim()
  if (!token) {
    throw new Error('Shortcut token missing.')
  }
  return token
}

function resolveShortcutBaseUrl(config: SourceConfig): string {
  const configuredBaseUrl = config.credentials.service?.shortcut?.apiBaseUrl?.trim()
  return configuredBaseUrl || DEFAULT_SHORTCUT_API_BASE_URL
}

function buildAllowedStates(config: SourceConfig): string[] {
  const configured = config.credentials.service?.shortcut?.allowedWorkflowStates
    ?.map((state) => state.trim())
    .filter(Boolean)
  return configured && configured.length > 0 ? configured : DEFAULT_ALLOWED_WORKFLOW_STATES
}

function isStoryInAllowedStates(story: ShortcutStory, allowed: string[]): boolean {
  const name = story.workflow_state?.name?.trim()
  if (!name) {
    return false
  }
  return allowed.some((allowedName) => allowedName === name)
}

function storyHasHandleTaskMention(story: ShortcutStory, handle: string): boolean {
  const normalized = handle.trim().replace(/^@/, '')
  if (!normalized) return false
  const needle = `@${normalized}`.toLowerCase()
  for (const task of story.tasks ?? []) {
    const description = task.description ?? ''
    if (description.toLowerCase().includes(needle)) {
      return true
    }
  }
  return false
}

async function fetchMemberId(config: SourceConfig, fetchImpl: FetchLike): Promise<string> {
  const token = requireShortcutToken(config)
  const baseUrl = resolveShortcutBaseUrl(config)
  const memberUrl = new URL('/api/v3/member', baseUrl)
  const { data: member } = await requestJson<ShortcutMemberResponse>({
    source: 'shortcut',
    fetchImpl,
    url: memberUrl,
    headers: {
      'Shortcut-Token': token,
    },
  })
  const memberId = member.id?.trim()
  if (!memberId) {
    throw new Error('Unable to determine Shortcut member id.')
  }
  return memberId
}

async function searchStories(config: SourceConfig, fetchImpl: FetchLike, query: string): Promise<ShortcutStory[]> {
  const token = requireShortcutToken(config)
  const baseUrl = resolveShortcutBaseUrl(config)
  const url = new URL('/api/v3/search/stories', baseUrl)
  url.searchParams.set('detail', 'full')
  url.searchParams.set('query', query)

  const stories: ShortcutStory[] = []
  let next: string | undefined
  while (true) {
    if (next) {
      url.searchParams.set('next', next)
    } else {
      url.searchParams.delete('next')
    }
    const { data } = await requestJson<ShortcutSearchStoriesResponse>({
      source: 'shortcut',
      fetchImpl,
      url,
      headers: {
        'Shortcut-Token': token,
      },
    })
    stories.push(...(data.data ?? []))
    const nextToken = data.next?.trim()
    if (!nextToken) break
    next = nextToken
  }
  return stories
}

export async function syncShortcutWork(config: SourceConfig, deps: ShortcutWorkSyncDependencies): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const memberId = await fetchMemberId(config, fetchImpl)
  const allowedStates = buildAllowedStates(config)
  const meHandle = await deps.getMeShortcutHandle()
  const projectId = await deps.resolveProjectIdForShortcutInstance(config.instanceKey)

  // Assigned to me, active states.
  const assignedCandidates = await searchStories(config, fetchImpl, 'owner:me')
  for (const story of assignedCandidates) {
    const storyId = story.id
    if (!storyId) continue
    if (!isStoryInAllowedStates(story, allowedStates)) continue
    const ownerIds = story.owner_ids ?? []
    if (!ownerIds.includes(memberId)) continue

    await deps.upsertWorkItem({
      kind: 'shortcut_story_assigned',
      dedupeKey: `work:shortcut_story_assigned:${config.instanceKey}:${storyId}`,
      externalId: String(storyId),
      title: story.name?.trim() || `Shortcut story ${storyId}`,
      body: story.workflow_state?.name ? `State: ${story.workflow_state.name}` : undefined,
      url: story.app_url,
      projectId: projectId ?? undefined,
      column: 'soon',
    })
  }

  // Code review: stories not assigned to me but with checklist tasks tagging me.
  if (meHandle) {
    const taskCandidates = await searchStories(config, fetchImpl, 'has:task')
    for (const story of taskCandidates) {
      const storyId = story.id
      if (!storyId) continue
      if (!isStoryInAllowedStates(story, allowedStates)) continue
      const ownerIds = story.owner_ids ?? []
      if (ownerIds.includes(memberId)) continue
      if (!storyHasHandleTaskMention(story, meHandle)) continue

      await deps.upsertWorkItem({
        kind: 'shortcut_code_review',
        dedupeKey: `work:shortcut_code_review:${config.instanceKey}:${storyId}`,
        externalId: String(storyId),
        title: story.name?.trim() || `Shortcut story ${storyId}`,
        body: 'Checklist mentions you for review.',
        url: story.app_url,
        projectId: projectId ?? undefined,
        column: 'soon',
      })
    }
  }
}

