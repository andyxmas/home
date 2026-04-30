import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  triggerManualSync,
  triggerReplaySync,
  triggerSourceManualSync,
  triggerSourceReplaySync,
} from '../../api/manual-sync'
import {
  clearAllInboxItems,
  listInboxItems,
  markAllInboxItemsRead,
  setInboxReadState,
  type InboxItem,
} from '../../api/inbox'
import { createWorkFromNotification, listWorkItems, moveWorkItem, reorderWorkColumn } from '../../api/work'
import { deletePerson, listPeople, savePerson } from '../../api/people'
import { listSyncHistory, type SyncHistoryEntry } from '../../api/sync-history'
import { deleteSourceConfig, listSourceConfigs, saveSourceConfig } from '../../api/sources'
import { deleteProject, listProjects, saveProject } from '../../api/projects'
import type { SyncAllSourcesResult } from '../../application/sync/sync-orchestrator'
import type { SourceConfig, SourceKind } from '../../domain/notification'
import type { Person } from '../../domain/person'
import type { Project, ProjectMetadata } from '../../domain/project'
import type { WorkColumn, WorkItem } from '../../domain/work'

export type SourceFormState = {
  source: SourceKind
  instanceKey: string
  displayName: string
  enabled: boolean
  token: string
  slackUserId: string
  slackWorkspaceUrl: string
  githubApiBaseUrl: string
  githubParticipating: boolean
  shortcutAllowedWorkflowStatesText: string
}

export const defaultFormState: SourceFormState = {
  source: 'slack',
  instanceKey: 'default',
  displayName: '',
  enabled: true,
  token: '',
  slackUserId: '',
  slackWorkspaceUrl: '',
  githubApiBaseUrl: '',
  githubParticipating: false,
  shortcutAllowedWorkflowStatesText: '',
}

export type ProjectFormState = {
  id?: string
  name: string
  shortcutSourceConfigId: string
  githubReposText: string
  slackChannelIdsText: string
}

const defaultProjectFormState: ProjectFormState = {
  id: undefined,
  name: '',
  shortcutSourceConfigId: '',
  githubReposText: '',
  slackChannelIdsText: '',
}

export type InboxSourceFilter = 'all' | SourceKind
export type InboxFromFilter = 'all' | string
export type InboxViewMode = 'full' | 'condensed'
const sourceFilterKinds: SourceKind[] = ['slack', 'github', 'shortcut']

export type PersonFormState = {
  id?: string
  name: string
  githubUsername: string
  slackUsername: string
  shortcutUserId: string
  shortcutHandle: string
  isMe: boolean
}

const defaultPersonFormState: PersonFormState = {
  id: undefined,
  name: '',
  githubUsername: '',
  slackUsername: '',
  shortcutUserId: '',
  shortcutHandle: '',
  isMe: false,
}

export function formatTimestamp(isoDate: string | undefined): string {
  if (!isoDate) {
    return 'unknown time'
  }
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.valueOf())) {
    return isoDate
  }
  return parsed.toLocaleString()
}

function validateSourceForm(form: SourceFormState): string[] {
  const errors: string[] = []
  if (!form.instanceKey.trim()) {
    errors.push('Instance key is required.')
  }
  if (!form.displayName.trim()) {
    errors.push('Display name is required.')
  }
  if (!form.token.trim()) {
    errors.push('Access token is required.')
  }
  if (form.source === 'slack' && !form.slackUserId.trim()) {
    errors.push('Slack requires a user ID.')
  }
  return errors
}

function mapConfigToForm(config: SourceConfig): SourceFormState {
  return {
    source: config.source,
    instanceKey: config.instanceKey,
    displayName: config.displayName,
    enabled: config.enabled,
    token: config.credentials.token?.value ?? '',
    slackUserId: config.credentials.service?.slack?.userId ?? '',
    slackWorkspaceUrl: config.credentials.service?.slack?.workspaceUrl ?? '',
    githubApiBaseUrl: config.credentials.service?.github?.apiBaseUrl ?? '',
    githubParticipating: config.credentials.service?.github?.participating ?? false,
    shortcutAllowedWorkflowStatesText: (config.credentials.service?.shortcut?.allowedWorkflowStates ?? []).join(', '),
  }
}

function parseShortcutAllowedWorkflowStates(value: string): string[] | undefined {
  const normalized = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}

function parseDelimitedValues(value: string): string[] {
  const deduped = new Set<string>()
  for (const entry of value.split(',')) {
    const normalized = entry.trim()
    if (normalized) {
      deduped.add(normalized)
    }
  }
  return [...deduped]
}

function mapProjectToForm(project: Project): ProjectFormState {
  return {
    id: project.id,
    name: project.name,
    shortcutSourceConfigId: project.shortcutSourceConfigId ?? '',
    githubReposText: project.githubRepos.join(', '),
    slackChannelIdsText: project.slackChannelIds.join(', '),
  }
}

function mapPersonToForm(person: Person): PersonFormState {
  return {
    id: person.id,
    name: person.name,
    githubUsername: person.githubUsername ?? '',
    slackUsername: person.slackUsername ?? '',
    shortcutUserId: person.shortcutUserId ?? '',
    shortcutHandle: person.shortcutHandle ?? person.shortcutUsername ?? '',
    isMe: person.isMe ?? false,
  }
}

export function useHomeState() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isReplaying, setIsReplaying] = useState(false)
  const [result, setResult] = useState<SyncAllSourcesResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncingSourceKeys, setSyncingSourceKeys] = useState<Record<string, boolean>>({})
  const [replayingSourceKeys, setReplayingSourceKeys] = useState<Record<string, boolean>>({})
  const [sourceSyncStatus, setSourceSyncStatus] = useState<Record<string, { label: string; error?: string }>>(
    {},
  )
  const [sourceConfigs, setSourceConfigs] = useState<SourceConfig[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata>({
    shortcutSources: [],
    knownGithubRepos: [],
    knownSlackChannels: [],
  })
  const [sourceForm, setSourceForm] = useState<SourceFormState>(defaultFormState)
  const [projectForm, setProjectForm] = useState<ProjectFormState>(defaultProjectFormState)
  const [personForm, setPersonForm] = useState<PersonFormState>(defaultPersonFormState)
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all')
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<InboxSourceFilter>('all')
  const [selectedFromFilter, setSelectedFromFilter] = useState<InboxFromFilter>('all')
  const [selectedViewMode, setSelectedViewMode] = useState<InboxViewMode>('full')
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null)
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [inboxNotice, setInboxNotice] = useState<string | null>(null)
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [workError, setWorkError] = useState<string | null>(null)
  const [isMarkingTodo, setIsMarkingTodo] = useState<Record<string, boolean>>({})
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [isClearingNotifications, setIsClearingNotifications] = useState(false)
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([])
  const [syncHistoryError, setSyncHistoryError] = useState<string | null>(null)

  const perSourceSyncStatus = useMemo(
    () => new Map(Object.entries(sourceSyncStatus)),
    [sourceSyncStatus],
  )

  const applySourceStatuses = (syncResult: SyncAllSourcesResult, verb: 'Synced' | 'Replayed') => {
    setSourceSyncStatus((current) => {
      const next = { ...current }
      for (const sourceResult of syncResult.sources) {
        const key = `${sourceResult.source}:${sourceResult.instanceKey}`
        next[key] = {
          label: sourceResult.status === 'success' ? `${verb} ${sourceResult.upsertedCount} items` : `${verb} failed`,
          error: sourceResult.error,
        }
      }
      return next
    })
  }

  const refreshSettings = async () => {
    const configs = await listSourceConfigs()
    setSourceConfigs(configs)
  }

  const refreshProjects = async () => {
    const { projects, metadata } = await listProjects()
    setProjects(projects)
    setProjectMetadata(metadata)
  }

  const refreshPeople = async () => {
    const people = await listPeople()
    setPeople(people)
  }

  const refreshInbox = async () => {
    const items = await listInboxItems()
    setInboxItems(items)
  }

  const refreshWork = async () => {
    try {
      const items = await listWorkItems()
      setWorkItems(items)
      setWorkError(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to load work items.'
      setWorkError(message)
    }
  }

  const refreshSyncHistory = async () => {
    try {
      const history = await listSyncHistory({ limit: 50 })
      setSyncHistory(history)
      setSyncHistoryError(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setSyncHistoryError(message)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([refreshSettings(), refreshProjects(), refreshInbox(), refreshWork(), refreshSyncHistory()])
        await refreshPeople()
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setSettingsError(message)
      }
    })()
  }, [])

  const onSyncNow = async () => {
    setIsSyncing(true)
    setSyncError(null)

    try {
      const syncResult = await triggerManualSync()
      setResult(syncResult)
      applySourceStatuses(syncResult, 'Synced')
      setInboxError(null)
      setSyncHistoryError(null)
      await Promise.all([refreshInbox(), refreshWork(), refreshSyncHistory()])
    } catch (cause) {
      setResult(null)
      setSyncError(cause instanceof Error ? cause.message : 'Manual sync failed')
    } finally {
      setIsSyncing(false)
    }
  }

  const onSyncSource = async (config: SourceConfig) => {
    const sourceKey = `${config.source}:${config.instanceKey}`
    setSyncingSourceKeys((current) => ({ ...current, [sourceKey]: true }))
    setSyncError(null)

    try {
      const syncResult = await triggerSourceManualSync(config.source, config.instanceKey)
      setResult(syncResult)
      applySourceStatuses(syncResult, 'Synced')
      setInboxError(null)
      setSyncHistoryError(null)
      await Promise.all([refreshInbox(), refreshWork(), refreshSyncHistory()])
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Source sync failed'
      setSourceSyncStatus((current) => ({
        ...current,
        [sourceKey]: { label: 'Sync failed', error: message },
      }))
    } finally {
      setSyncingSourceKeys((current) => ({ ...current, [sourceKey]: false }))
    }
  }

  const onReplayNow = async () => {
    setIsReplaying(true)
    setSyncError(null)

    try {
      const syncResult = await triggerReplaySync()
      setResult(syncResult)
      applySourceStatuses(syncResult, 'Replayed')
      setInboxError(null)
      setSyncHistoryError(null)
      await Promise.all([refreshInbox(), refreshWork(), refreshSyncHistory()])
    } catch (cause) {
      setResult(null)
      setSyncError(cause instanceof Error ? cause.message : 'Replay sync failed')
    } finally {
      setIsReplaying(false)
    }
  }

  const onReplaySource = async (config: SourceConfig) => {
    const sourceKey = `${config.source}:${config.instanceKey}`
    setReplayingSourceKeys((current) => ({ ...current, [sourceKey]: true }))
    setSyncError(null)

    try {
      const syncResult = await triggerSourceReplaySync(config.source, config.instanceKey)
      setResult(syncResult)
      applySourceStatuses(syncResult, 'Replayed')
      setInboxError(null)
      setSyncHistoryError(null)
      await Promise.all([refreshInbox(), refreshWork(), refreshSyncHistory()])
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Source replay failed'
      setSourceSyncStatus((current) => ({
        ...current,
        [sourceKey]: { label: 'Replay failed', error: message },
      }))
    } finally {
      setReplayingSourceKeys((current) => ({ ...current, [sourceKey]: false }))
    }
  }

  const onSaveSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSettingsError(null)
    setSettingsNotice(null)
    const validationErrors = validateSourceForm(sourceForm)
    if (validationErrors.length > 0) {
      setSettingsError(validationErrors.join(' '))
      return
    }

    try {
      await saveSourceConfig({
        source: sourceForm.source,
        instanceKey: sourceForm.instanceKey.trim(),
        displayName: sourceForm.displayName.trim(),
        enabled: sourceForm.enabled,
        token: sourceForm.token.trim(),
        slackUserId: sourceForm.source === 'slack' ? sourceForm.slackUserId.trim() : undefined,
        slackWorkspaceUrl: sourceForm.source === 'slack' ? sourceForm.slackWorkspaceUrl.trim() : undefined,
        shortcutAllowedWorkflowStates:
          sourceForm.source === 'shortcut'
            ? parseShortcutAllowedWorkflowStates(sourceForm.shortcutAllowedWorkflowStatesText)
            : undefined,
        githubApiBaseUrl: sourceForm.source === 'github' ? sourceForm.githubApiBaseUrl.trim() : undefined,
        githubParticipating: sourceForm.source === 'github' ? sourceForm.githubParticipating : undefined,
      })
      await Promise.all([refreshSettings(), refreshProjects()])
      setSettingsNotice('Source saved.')
      setSourceForm((current) => ({
        ...defaultFormState,
        source: current.source,
        instanceKey: current.instanceKey,
      }))
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to save source config.')
    }
  }

  const onDeleteSource = async (config: SourceConfig) => {
    setSettingsError(null)
    setSettingsNotice(null)
    try {
      await deleteSourceConfig(config.source, config.instanceKey)
      await Promise.all([refreshSettings(), refreshProjects()])
      setSettingsNotice(`Deleted ${config.displayName}.`)
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to delete source.')
    }
  }

  const onEditSource = (config: SourceConfig) => {
    setSourceForm(mapConfigToForm(config))
    setSettingsNotice(`Editing ${config.displayName}. Save to update.`)
    setSettingsError(null)
  }

  const onToggleEnabled = async (config: SourceConfig) => {
    setSettingsError(null)
    setSettingsNotice(null)
    try {
      const form = mapConfigToForm(config)
      await saveSourceConfig({
        source: form.source,
        instanceKey: form.instanceKey,
        displayName: form.displayName,
        enabled: !form.enabled,
        token: form.token,
        slackUserId: form.source === 'slack' ? form.slackUserId : undefined,
        slackWorkspaceUrl: form.source === 'slack' ? form.slackWorkspaceUrl : undefined,
        shortcutAllowedWorkflowStates:
          form.source === 'shortcut' ? parseShortcutAllowedWorkflowStates(form.shortcutAllowedWorkflowStatesText) : undefined,
        githubApiBaseUrl: form.source === 'github' ? form.githubApiBaseUrl : undefined,
        githubParticipating: form.source === 'github' ? form.githubParticipating : undefined,
      })
      await Promise.all([refreshSettings(), refreshProjects()])
      setSettingsNotice(`${config.displayName} ${config.enabled ? 'disabled' : 'enabled'}.`)
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to update source status.')
    }
  }

  const onToggleRead = async (item: InboxItem) => {
    setInboxError(null)
    setInboxNotice(null)
    try {
      await setInboxReadState(item.id, !item.isRead)
      await refreshInbox()
    } catch (cause) {
      setInboxError(cause instanceof Error ? cause.message : 'Failed to update read state.')
    }
  }

  const onMoveWorkItem = async (input: { id: string; column: WorkColumn; position: number }) => {
    setWorkError(null)
    try {
      await moveWorkItem(input)
      await refreshWork()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to move work item.'
      setWorkError(message)
    }
  }

  const onReorderWorkColumn = async (input: { column: WorkColumn; orderedIds: string[] }) => {
    setWorkError(null)
    try {
      await reorderWorkColumn(input)
      await refreshWork()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to reorder work items.'
      setWorkError(message)
    }
  }

  const onMarkInboxItemTodo = async (item: InboxItem) => {
    setInboxError(null)
    setInboxNotice(null)
    setWorkError(null)
    setIsMarkingTodo((current) => ({ ...current, [item.id]: true }))
    try {
      await createWorkFromNotification(item.id)
      await refreshWork()
      setInboxNotice('Added to Work.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to add to Work.'
      setInboxError(message)
    } finally {
      setIsMarkingTodo((current) => ({ ...current, [item.id]: false }))
    }
  }

  const onMarkAllRead = async () => {
    setInboxError(null)
    setInboxNotice(null)
    setIsMarkingAllRead(true)
    try {
      const result = await markAllInboxItemsRead()
      await refreshInbox()
      setInboxNotice(`Marked ${result.changedCount} notification(s) as read.`)
    } catch (cause) {
      setInboxError(cause instanceof Error ? cause.message : 'Failed to mark all as read.')
    } finally {
      setIsMarkingAllRead(false)
    }
  }

  const onSaveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSettingsError(null)
    setSettingsNotice(null)
    if (!projectForm.name.trim()) {
      setSettingsError('Project name is required.')
      return
    }

    try {
      await saveProject({
        id: projectForm.id,
        name: projectForm.name.trim(),
        shortcutSourceConfigId: projectForm.shortcutSourceConfigId.trim() || undefined,
        githubRepos: parseDelimitedValues(projectForm.githubReposText),
        slackChannelIds: parseDelimitedValues(projectForm.slackChannelIdsText),
      })
      await refreshProjects()
      setProjectForm(defaultProjectFormState)
      setSettingsNotice(projectForm.id ? 'Project updated.' : 'Project created.')
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to save project.')
    }
  }

  const onEditProject = (project: Project) => {
    setProjectForm(mapProjectToForm(project))
    setSettingsNotice(`Editing ${project.name}. Save to update.`)
    setSettingsError(null)
  }

  const onDeleteProject = async (project: Project) => {
    setSettingsError(null)
    setSettingsNotice(null)
    try {
      await deleteProject(project.id)
      await refreshProjects()
      setSettingsNotice(`Deleted project ${project.name}.`)
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to delete project.')
    }
  }

  const onSavePerson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSettingsError(null)
    setSettingsNotice(null)
    if (!personForm.name.trim()) {
      setSettingsError('Person name is required.')
      return
    }

    try {
      await savePerson({
        id: personForm.id,
        name: personForm.name.trim(),
        githubUsername: personForm.githubUsername.trim() || undefined,
        slackUsername: personForm.slackUsername.trim() || undefined,
        shortcutUserId: personForm.shortcutUserId.trim() || undefined,
        shortcutHandle: personForm.shortcutHandle.trim() || undefined,
        isMe: personForm.isMe,
      })
      await refreshPeople()
      setPersonForm(defaultPersonFormState)
      setSettingsNotice(personForm.id ? 'Person updated.' : 'Person created.')
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to save person.')
    }
  }

  const onEditPerson = (person: Person) => {
    setPersonForm(mapPersonToForm(person))
    setSettingsNotice(`Editing ${person.name}. Save to update.`)
    setSettingsError(null)
  }

  const onDeletePerson = async (person: Person) => {
    setSettingsError(null)
    setSettingsNotice(null)
    try {
      await deletePerson(person.id)
      await refreshPeople()
      setSettingsNotice(`Deleted person ${person.name}.`)
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to delete person.')
    }
  }

  const onClearNotifications = async () => {
    setIsClearingNotifications(true)
    setSettingsError(null)
    setSettingsNotice(null)
    setInboxError(null)
    setSyncHistoryError(null)
    try {
      const result = await clearAllInboxItems()
      await Promise.all([refreshInbox(), refreshSyncHistory()])
      setSettingsNotice(
        `Cleared ${result.clearedNotifications} notifications, ${result.clearedReadStates} read-state records, ${result.clearedSyncHistory} sync history rows, and reset ${result.resetWatermarks} source watermark(s).`,
      )
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to clear notifications.')
    } finally {
      setIsClearingNotifications(false)
    }
  }

  const activeProjectFilter = useMemo(
    () =>
      selectedProjectFilter === 'all' || projects.some((project) => project.id === selectedProjectFilter)
        ? selectedProjectFilter
        : 'all',
    [projects, selectedProjectFilter],
  )

  const activeFromFilter = useMemo(
    () =>
      selectedFromFilter === 'all' || people.some((person) => person.id === selectedFromFilter)
        ? selectedFromFilter
        : 'all',
    [people, selectedFromFilter],
  )

  const sourceFilterOptions = useMemo(() => {
    const options = sourceFilterKinds.filter((source) =>
      inboxItems.some((item) => {
        const projectMatches = activeProjectFilter === 'all' || item.projectId === activeProjectFilter
        const fromMatches = activeFromFilter === 'all' || item.fromPersonId === activeFromFilter
        return item.source === source && projectMatches && fromMatches
      }),
    )
    if (selectedSourceFilter !== 'all' && !options.includes(selectedSourceFilter)) {
      options.push(selectedSourceFilter)
    }
    return options
  }, [activeFromFilter, activeProjectFilter, inboxItems, selectedSourceFilter])

  const projectFilterOptions = useMemo(() => {
    const options = projects
      .filter((project) =>
        inboxItems.some((item) => {
          const sourceMatches = selectedSourceFilter === 'all' || item.source === selectedSourceFilter
          const fromMatches = activeFromFilter === 'all' || item.fromPersonId === activeFromFilter
          return item.projectId === project.id && sourceMatches && fromMatches
        }),
      )
      .map((project) => ({ id: project.id, name: project.name }))
    if (activeProjectFilter !== 'all' && !options.some((project) => project.id === activeProjectFilter)) {
      const selectedProject = projects.find((project) => project.id === activeProjectFilter)
      if (selectedProject) {
        options.push({ id: selectedProject.id, name: selectedProject.name })
      }
    }
    return options
  }, [activeFromFilter, activeProjectFilter, inboxItems, projects, selectedSourceFilter])

  const fromFilterOptions = useMemo(() => {
    const options = people
      .filter((person) =>
        inboxItems.some((item) => {
          const sourceMatches = selectedSourceFilter === 'all' || item.source === selectedSourceFilter
          const projectMatches = activeProjectFilter === 'all' || item.projectId === activeProjectFilter
          return item.fromPersonId === person.id && sourceMatches && projectMatches
        }),
      )
      .map((person) => ({ id: person.id, name: person.name }))
    if (activeFromFilter !== 'all' && !options.some((person) => person.id === activeFromFilter)) {
      const selectedPerson = people.find((person) => person.id === activeFromFilter)
      if (selectedPerson) {
        options.push({ id: selectedPerson.id, name: selectedPerson.name })
      }
    }
    return options
  }, [activeFromFilter, activeProjectFilter, inboxItems, people, selectedSourceFilter])

  const filteredInboxItems = useMemo(
    () =>
      inboxItems.filter((item) => {
        const sourceMatches = selectedSourceFilter === 'all' || item.source === selectedSourceFilter
        const projectMatches = activeProjectFilter === 'all' || item.projectId === activeProjectFilter
        const fromMatches = activeFromFilter === 'all' || item.fromPersonId === activeFromFilter
        return sourceMatches && projectMatches && fromMatches
      }),
    [activeFromFilter, activeProjectFilter, inboxItems, selectedSourceFilter],
  )

  return {
    result,
    syncError,
    isSyncing,
    isReplaying,
    sourceConfigs,
    people,
    sourceForm,
    personForm,
    syncingSourceKeys,
    replayingSourceKeys,
    settingsError,
    settingsNotice,
    inboxItems: filteredInboxItems,
    inboxError,
    inboxNotice,
    isMarkingTodo,
    workItems,
    workError,
    isMarkingAllRead,
    isClearingNotifications,
    syncHistory,
    syncHistoryError,
    perSourceSyncStatus,
    projects,
    projectMetadata,
    projectForm,
    selectedProjectFilter: activeProjectFilter,
    selectedSourceFilter,
    selectedFromFilter: activeFromFilter,
    selectedViewMode,
    sourceFilterOptions,
    projectFilterOptions,
    fromFilterOptions,
    setSourceForm,
    setProjectForm,
    setPersonForm,
    setSelectedProjectFilter,
    setSelectedSourceFilter,
    setSelectedFromFilter,
    setSelectedViewMode,
    onSyncNow,
    onReplayNow,
    onSyncSource,
    onReplaySource,
    onSaveSource,
    onDeleteSource,
    onEditSource,
    onToggleEnabled,
    onToggleRead,
    onMarkAllRead,
    onMarkInboxItemTodo,
    onMoveWorkItem,
    onReorderWorkColumn,
    onSaveProject,
    onEditProject,
    onDeleteProject,
    onSavePerson,
    onEditPerson,
    onDeletePerson,
    onClearNotifications,
  }
}
