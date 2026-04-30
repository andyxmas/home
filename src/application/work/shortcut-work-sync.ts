import { DEFAULT_SHORTCUT_ALLOWED_WORKFLOW_STATES, type SourceConfig } from '../../domain/notification'
import type { WorkColumn } from '../../domain/work'
import { requestJson } from '../../adapters/provider/http'

type FetchLike = typeof fetch

type ShortcutMemberResponse = {
  id?: string
  mention_name?: string
}

type ShortcutWorkflowState = {
  name?: string
}

type ShortcutStoryTask = {
  complete?: boolean
  description?: string
  member_mention_ids?: string[]
  mention_ids?: string[]
}

type ShortcutStory = {
  id?: number
  name?: string
  app_url?: string
  owner_ids?: string[]
  workflow_state?: ShortcutWorkflowState
  workflow_state_id?: number
  tasks?: ShortcutStoryTask[]
}

type ShortcutSearchStoriesResponse = {
  data?: ShortcutStory[]
  next?: string
}

type ShortcutWorkflow = {
  states?: Array<{ id?: number; name?: string }>
}

export type ShortcutWorkSyncDependencies = {
  fetchImpl?: FetchLike
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
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

export type ShortcutWorkSyncReport = {
  source: 'shortcut'
  instanceKey: string
  selectedHandle: string | null
  memberId: string
  allowedStateCount: number
  assignedCandidates: number
  taskCandidates: number
  strictAssignedMatched: number
  strictReviewMatched: number
  fallbackIngested: number
  upserted: number
  dropped: {
    assigned: {
      missingStoryId: number
      stateFiltered: number
      ownerMismatch: number
    }
    review: {
      missingStoryId: number
      stateFiltered: number
      ownedByMe: number
      missingMention: number
    }
  }
}

const DEFAULT_SHORTCUT_API_BASE_URL = 'https://api.app.shortcut.com'
const DEV_FALLBACK_STORY_LIMIT = 8

function isInvalidShortcutNextTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('http 422') &&
    message.includes('/api/v3/search/stories') &&
    message.includes('next page token is not valid')
  )
}

function normalizeStateName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

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
  const values = configured && configured.length > 0 ? configured : DEFAULT_SHORTCUT_ALLOWED_WORKFLOW_STATES
  return values.map(normalizeStateName).filter(Boolean)
}

function resolveStoryStateName(story: ShortcutStory, statesById: Map<number, string>): string | undefined {
  const direct = story.workflow_state?.name?.trim()
  if (direct) {
    return direct
  }
  const stateId = story.workflow_state_id
  if (typeof stateId !== 'number') {
    return undefined
  }
  return statesById.get(stateId)
}

function isStoryInAllowedStates(story: ShortcutStory, allowedLower: string[], statesById: Map<number, string>): boolean {
  const name = resolveStoryStateName(story, statesById)?.trim()
  if (!name) {
    return false
  }
  const normalized = normalizeStateName(name)
  return allowedLower.some((allowedName) => allowedName === normalized)
}

export function storyHasHandleTaskMention(story: ShortcutStory, handle: string): boolean {
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

function storyHasMemberMention(story: ShortcutStory, memberId: string): boolean {
  for (const task of story.tasks ?? []) {
    const mentionIds = task.member_mention_ids ?? task.mention_ids ?? []
    if (mentionIds.includes(memberId)) {
      return true
    }
  }
  return false
}

async function fetchMember(config: SourceConfig, fetchImpl: FetchLike): Promise<{ id: string; mentionName?: string }> {
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
  return {
    id: memberId,
    mentionName: member.mention_name?.trim() || undefined,
  }
}

async function fetchWorkflowStateMap(config: SourceConfig, fetchImpl: FetchLike): Promise<Map<number, string>> {
  const token = requireShortcutToken(config)
  const baseUrl = resolveShortcutBaseUrl(config)
  const workflowsUrl = new URL('/api/v3/workflows', baseUrl)
  const { data } = await requestJson<ShortcutWorkflow[]>({
    source: 'shortcut',
    fetchImpl,
    url: workflowsUrl,
    headers: {
      'Shortcut-Token': token,
    },
  })
  const map = new Map<number, string>()
  for (const workflow of data ?? []) {
    for (const state of workflow.states ?? []) {
      if (typeof state.id === 'number' && typeof state.name === 'string' && state.name.trim()) {
        map.set(state.id, state.name.trim())
      }
    }
  }
  return map
}

async function searchStories(
  config: SourceConfig,
  fetchImpl: FetchLike,
  query: string,
  logger: Pick<Console, 'warn'>,
): Promise<ShortcutStory[]> {
  const token = requireShortcutToken(config)
  const baseUrl = resolveShortcutBaseUrl(config)
  const url = new URL('/api/v3/search/stories', baseUrl)
  url.searchParams.set('detail', 'full')
  url.searchParams.set('query', query)

  const stories: ShortcutStory[] = []
  const seenNextTokens = new Set<string>()
  let next: string | undefined
  let didRestartAfterInvalidNext = false
  let fetchedPages = 0
  while (true) {
    const requestedNextToken = next
    if (next) {
      url.searchParams.set('next', next)
    } else {
      url.searchParams.delete('next')
    }

    let data: ShortcutSearchStoriesResponse
    try {
      const response = await requestJson<ShortcutSearchStoriesResponse>({
        source: 'shortcut',
        fetchImpl,
        url,
        headers: {
          'Shortcut-Token': token,
        },
      })
      data = response.data
    } catch (error) {
      if (isInvalidShortcutNextTokenError(error)) {
        if (requestedNextToken && !didRestartAfterInvalidNext) {
          didRestartAfterInvalidNext = true
          stories.length = 0
          seenNextTokens.clear()
          next = undefined
          logger.warn('[work-sync] Shortcut search pagination token rejected; restarting query', {
            instanceKey: config.instanceKey,
            query,
            rejectedToken: requestedNextToken,
          })
          continue
        }

        logger.warn('[work-sync] Shortcut search pagination token rejected; using partial page set', {
          instanceKey: config.instanceKey,
          query,
          rejectedToken: requestedNextToken ?? null,
          fetchedPages,
          fetchedStories: stories.length,
        })
        break
      }
      throw error
    }

    fetchedPages += 1
    stories.push(...(data.data ?? []))
    const nextToken = data.next?.trim()
    if (!nextToken) break
    if (seenNextTokens.has(nextToken)) {
      logger.warn('[work-sync] Shortcut search cursor loop detected; using partial page set', {
        instanceKey: config.instanceKey,
        query,
        repeatedToken: nextToken,
        fetchedPages,
        fetchedStories: stories.length,
      })
      break
    }
    seenNextTokens.add(nextToken)
    next = nextToken
  }
  return stories
}

export async function syncShortcutWork(
  config: SourceConfig,
  deps: ShortcutWorkSyncDependencies,
): Promise<ShortcutWorkSyncReport> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const logger = deps.logger ?? console
  const member = await fetchMember(config, fetchImpl)
  const memberId = member.id
  const meHandle = (await deps.getMeShortcutHandle()) ?? member.mentionName ?? null
  const allowedStates = buildAllowedStates(config)
  const workflowStateMap = await fetchWorkflowStateMap(config, fetchImpl)
  const projectId = await deps.resolveProjectIdForShortcutInstance(config.instanceKey)
  const report: ShortcutWorkSyncReport = {
    source: 'shortcut',
    instanceKey: config.instanceKey,
    selectedHandle: meHandle,
    memberId,
    allowedStateCount: allowedStates.length,
    assignedCandidates: 0,
    taskCandidates: 0,
    strictAssignedMatched: 0,
    strictReviewMatched: 0,
    fallbackIngested: 0,
    upserted: 0,
    dropped: {
      assigned: {
        missingStoryId: 0,
        stateFiltered: 0,
        ownerMismatch: 0,
      },
      review: {
        missingStoryId: 0,
        stateFiltered: 0,
        ownedByMe: 0,
        missingMention: 0,
      },
    },
  }
  logger.info('[work-sync] Shortcut source selected', {
    source: report.source,
    instanceKey: report.instanceKey,
    selectedHandle: report.selectedHandle,
    memberId: report.memberId,
    allowedStates,
  })

  // Assigned to me, active states.
  const assignedCandidates = await searchStories(config, fetchImpl, `owner:${meHandle ?? 'me'}`, logger)
  report.assignedCandidates = assignedCandidates.length
  logger.info('[work-sync] Assigned candidates fetched', {
    instanceKey: config.instanceKey,
    candidates: report.assignedCandidates,
  })

  const strictStoryIds = new Set<number>()
  for (const story of assignedCandidates) {
    const storyId = story.id
    if (!storyId) {
      report.dropped.assigned.missingStoryId += 1
      continue
    }
    if (!isStoryInAllowedStates(story, allowedStates, workflowStateMap)) {
      report.dropped.assigned.stateFiltered += 1
      continue
    }
    const ownerIds = story.owner_ids ?? []
    if (!ownerIds.includes(memberId)) {
      report.dropped.assigned.ownerMismatch += 1
      continue
    }

    const stateName = resolveStoryStateName(story, workflowStateMap)
    await deps.upsertWorkItem({
      kind: 'shortcut_story_assigned',
      dedupeKey: `work:shortcut_story_assigned:${config.instanceKey}:${storyId}`,
      externalId: String(storyId),
      title: story.name?.trim() || `Shortcut story ${storyId}`,
      body: stateName ? `State: ${stateName}` : undefined,
      url: story.app_url,
      projectId: projectId ?? undefined,
      column: 'unassigned',
    })
    strictStoryIds.add(storyId)
    report.strictAssignedMatched += 1
    report.upserted += 1
  }
  logger.info('[work-sync] Assigned filtering summary', {
    instanceKey: config.instanceKey,
    matched: report.strictAssignedMatched,
    dropped: report.dropped.assigned,
  })

  // Code review: stories not assigned to me but with checklist tasks tagging me.
  const taskCandidates = await searchStories(config, fetchImpl, 'has:task', logger)
  report.taskCandidates = taskCandidates.length
  logger.info('[work-sync] Task candidates fetched', {
    instanceKey: config.instanceKey,
    candidates: report.taskCandidates,
  })

  if (meHandle) {
    for (const story of taskCandidates) {
      const storyId = story.id
      if (!storyId) {
        report.dropped.review.missingStoryId += 1
        continue
      }
      if (!isStoryInAllowedStates(story, allowedStates, workflowStateMap)) {
        report.dropped.review.stateFiltered += 1
        continue
      }
      const ownerIds = story.owner_ids ?? []
      if (ownerIds.includes(memberId)) {
        report.dropped.review.ownedByMe += 1
        continue
      }
      if (!storyHasHandleTaskMention(story, meHandle) && !storyHasMemberMention(story, memberId)) {
        report.dropped.review.missingMention += 1
        continue
      }

      await deps.upsertWorkItem({
        kind: 'shortcut_code_review',
        dedupeKey: `work:shortcut_code_review:${config.instanceKey}:${storyId}`,
        externalId: String(storyId),
        title: story.name?.trim() || `Shortcut story ${storyId}`,
        body: 'Checklist mentions you for review.',
        url: story.app_url,
        projectId: projectId ?? undefined,
        column: 'unassigned',
      })
      strictStoryIds.add(storyId)
      report.strictReviewMatched += 1
      report.upserted += 1
    }
  }

  logger.info('[work-sync] Review filtering summary', {
    instanceKey: config.instanceKey,
    matched: report.strictReviewMatched,
    dropped: report.dropped.review,
  })

  if (report.strictAssignedMatched + report.strictReviewMatched === 0) {
    const fallbackPool = [...assignedCandidates, ...taskCandidates]
    const fallbackSeen = new Set<number>()
    for (const story of fallbackPool) {
      const storyId = story.id
      if (
        typeof storyId !== 'number' ||
        fallbackSeen.has(storyId) ||
        strictStoryIds.has(storyId) ||
        report.fallbackIngested >= DEV_FALLBACK_STORY_LIMIT
      ) {
        continue
      }
      fallbackSeen.add(storyId)
      const stateName = resolveStoryStateName(story, workflowStateMap)
      await deps.upsertWorkItem({
        kind: 'shortcut_story_assigned',
        dedupeKey: `work:shortcut_story_assigned:${config.instanceKey}:${storyId}`,
        externalId: String(storyId),
        title: story.name?.trim() || `Shortcut story ${storyId}`,
        body: `DEV fallback sync (bypassed strict filters)${stateName ? ` · State: ${stateName}` : ''}`,
        url: story.app_url,
        projectId: projectId ?? undefined,
        column: 'unassigned',
      })
      report.fallbackIngested += 1
      report.upserted += 1
    }
    logger.warn('[work-sync] Applied fallback ingestion path', {
      instanceKey: config.instanceKey,
      fallbackIngested: report.fallbackIngested,
      fallbackLimit: DEV_FALLBACK_STORY_LIMIT,
    })
  }

  logger.info('[work-sync] Shortcut sync completed', report)
  return report
}

export const __testing = {
  buildAllowedStates,
  normalizeStateName,
  resolveStoryStateName,
  storyHasHandleTaskMention,
  storyHasMemberMention,
}

