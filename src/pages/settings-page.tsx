import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { SourceConfig, SourceKind } from '../domain/notification'
import type { Person } from '../domain/person'
import type { Project, ProjectMetadata } from '../domain/project'
import type { PersonFormState, ProjectFormState, SourceFormState } from '../features/home/use-home-state'
import { formatTimestamp } from '../features/home/use-home-state'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import type { SyncHistoryEntry } from '../api/sync-history'

type SettingsPageProps = {
  sourceForm: SourceFormState
  setSourceForm: Dispatch<SetStateAction<SourceFormState>>
  onSaveSource: (event: FormEvent<HTMLFormElement>) => Promise<void>
  projectForm: ProjectFormState
  setProjectForm: Dispatch<SetStateAction<ProjectFormState>>
  onSaveProject: (event: FormEvent<HTMLFormElement>) => Promise<void>
  personForm: PersonFormState
  setPersonForm: Dispatch<SetStateAction<PersonFormState>>
  onSavePerson: (event: FormEvent<HTMLFormElement>) => Promise<void>
  settingsError: string | null
  settingsNotice: string | null
  sourceConfigs: SourceConfig[]
  projects: Project[]
  people: Person[]
  projectMetadata: ProjectMetadata
  perSourceSyncStatus: Map<string, { label: string; error?: string }>
  isSyncing: boolean
  syncingSourceKeys: Record<string, boolean>
  replayingSourceKeys: Record<string, boolean>
  onEditSource: (config: SourceConfig) => void
  onSyncSource: (config: SourceConfig) => Promise<void>
  onReplaySource: (config: SourceConfig) => Promise<void>
  onToggleEnabled: (config: SourceConfig) => Promise<void>
  onDeleteSource: (config: SourceConfig) => Promise<void>
  onEditProject: (project: Project) => void
  onDeleteProject: (project: Project) => Promise<void>
  onEditPerson: (person: Person) => void
  onDeletePerson: (person: Person) => Promise<void>
  onClearNotifications: () => Promise<void>
  isClearingNotifications: boolean
  onClearWorkItems: () => Promise<void>
  isClearingWorkItems: boolean
  onSyncShortcutWorkSource: (config: SourceConfig) => Promise<void>
  syncingWorkSourceKeys: Record<string, boolean>
  syncHistoryError: string | null
  syncHistory: SyncHistoryEntry[]
}

function SettingsSubnav() {
  const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    [
      'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
      isActive ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent hover:text-accent-foreground',
    ].join(' ')

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Settings sections">
      <NavLink to="/settings/sources" className={navLinkClassName}>
        Sources
      </NavLink>
      <NavLink to="/settings/projects" className={navLinkClassName}>
        Projects
      </NavLink>
      <NavLink to="/settings/sync-history" className={navLinkClassName}>
        Sync History
      </NavLink>
      <NavLink to="/settings/people" className={navLinkClassName}>
        People
      </NavLink>
    </nav>
  )
}

function SettingsFeedback(props: { settingsError: string | null; settingsNotice: string | null }) {
  return (
    <>
      {props.settingsError ? (
        <Alert variant="destructive">
          <AlertTitle>Settings error</AlertTitle>
          <AlertDescription>{props.settingsError}</AlertDescription>
        </Alert>
      ) : null}
      {props.settingsNotice ? (
        <Alert>
          <AlertDescription>{props.settingsNotice}</AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}

export function SettingsPage({
  sourceForm,
  setSourceForm,
  onSaveSource,
  projectForm,
  setProjectForm,
  onSaveProject,
  personForm,
  setPersonForm,
  onSavePerson,
  settingsError,
  settingsNotice,
  sourceConfigs,
  projects,
  people,
  projectMetadata,
  perSourceSyncStatus,
  isSyncing,
  syncingSourceKeys,
  replayingSourceKeys,
  onEditSource,
  onSyncSource,
  onReplaySource,
  onToggleEnabled,
  onDeleteSource,
  onEditProject,
  onDeleteProject,
  onEditPerson,
  onDeletePerson,
  onClearNotifications,
  isClearingNotifications,
  onClearWorkItems,
  isClearingWorkItems,
  onSyncShortcutWorkSource,
  syncingWorkSourceKeys,
  syncHistoryError,
  syncHistory,
}: SettingsPageProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingsSubnav />
        </CardContent>
      </Card>
      <Routes>
        <Route index element={<Navigate to="sources" replace />} />
        <Route
          path="sources"
          element={
            <SettingsSourcesPage
              sourceForm={sourceForm}
              setSourceForm={setSourceForm}
              onSaveSource={onSaveSource}
              sourceConfigs={sourceConfigs}
              perSourceSyncStatus={perSourceSyncStatus}
              isSyncing={isSyncing}
              syncingSourceKeys={syncingSourceKeys}
              replayingSourceKeys={replayingSourceKeys}
              onEditSource={onEditSource}
              onSyncSource={onSyncSource}
              onReplaySource={onReplaySource}
              onToggleEnabled={onToggleEnabled}
              onDeleteSource={onDeleteSource}
              onClearNotifications={onClearNotifications}
              isClearingNotifications={isClearingNotifications}
              onClearWorkItems={onClearWorkItems}
              isClearingWorkItems={isClearingWorkItems}
              onSyncShortcutWorkSource={onSyncShortcutWorkSource}
              syncingWorkSourceKeys={syncingWorkSourceKeys}
              settingsError={settingsError}
              settingsNotice={settingsNotice}
            />
          }
        />
        <Route
          path="projects"
          element={
            <SettingsProjectsPage
              projectForm={projectForm}
              setProjectForm={setProjectForm}
              onSaveProject={onSaveProject}
              projects={projects}
              projectMetadata={projectMetadata}
              onEditProject={onEditProject}
              onDeleteProject={onDeleteProject}
              settingsError={settingsError}
              settingsNotice={settingsNotice}
            />
          }
        />
        <Route
          path="sync-history"
          element={
            <SettingsSyncHistoryPage
              syncHistory={syncHistory}
              syncHistoryError={syncHistoryError}
              settingsError={settingsError}
              settingsNotice={settingsNotice}
            />
          }
        />
        <Route
          path="people"
          element={
            <SettingsPeoplePage
              personForm={personForm}
              setPersonForm={setPersonForm}
              onSavePerson={onSavePerson}
              people={people}
              onEditPerson={onEditPerson}
              onDeletePerson={onDeletePerson}
              settingsError={settingsError}
              settingsNotice={settingsNotice}
            />
          }
        />
      </Routes>
    </div>
  )
}

function SettingsSourcesPage(props: {
  sourceForm: SourceFormState
  setSourceForm: Dispatch<SetStateAction<SourceFormState>>
  onSaveSource: (event: FormEvent<HTMLFormElement>) => Promise<void>
  sourceConfigs: SourceConfig[]
  perSourceSyncStatus: Map<string, { label: string; error?: string }>
  isSyncing: boolean
  syncingSourceKeys: Record<string, boolean>
  replayingSourceKeys: Record<string, boolean>
  onEditSource: (config: SourceConfig) => void
  onSyncSource: (config: SourceConfig) => Promise<void>
  onReplaySource: (config: SourceConfig) => Promise<void>
  onToggleEnabled: (config: SourceConfig) => Promise<void>
  onDeleteSource: (config: SourceConfig) => Promise<void>
  onClearNotifications: () => Promise<void>
  isClearingNotifications: boolean
  onClearWorkItems: () => Promise<void>
  isClearingWorkItems: boolean
  onSyncShortcutWorkSource: (config: SourceConfig) => Promise<void>
  syncingWorkSourceKeys: Record<string, boolean>
  settingsError: string | null
  settingsNotice: string | null
}) {
  const [isClearModalOpen, setIsClearModalOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3" onSubmit={props.onSaveSource}>
          <Label>
            Provider
            <Select
              aria-label="Provider"
              value={props.sourceForm.source}
              onChange={(event) =>
                props.setSourceForm((current) => ({
                  ...current,
                  source: event.target.value as SourceKind,
                }))
              }
            >
              <option value="slack">Slack</option>
              <option value="github">GitHub</option>
              <option value="shortcut">Shortcut</option>
            </Select>
          </Label>
          <Label>
            Instance key
            <Input
              aria-label="Instance key"
              value={props.sourceForm.instanceKey}
              onChange={(event) =>
                props.setSourceForm((current) => ({ ...current, instanceKey: event.target.value }))
              }
            />
          </Label>
          <Label>
            Display name
            <Input
              aria-label="Display name"
              value={props.sourceForm.displayName}
              onChange={(event) =>
                props.setSourceForm((current) => ({ ...current, displayName: event.target.value }))
              }
            />
          </Label>
          <Label className="flex items-center gap-2">
            <Checkbox
              aria-label="Enabled"
              checked={props.sourceForm.enabled}
              onChange={(event) =>
                props.setSourceForm((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            Enabled
          </Label>
          <Label>
            Token
            <Input
              aria-label="Token"
              value={props.sourceForm.token}
              onChange={(event) => props.setSourceForm((current) => ({ ...current, token: event.target.value }))}
            />
          </Label>
          {props.sourceForm.source === 'slack' ? (
            <>
              <Label>
                Slack user ID
                <Input
                  aria-label="Slack user ID"
                  value={props.sourceForm.slackUserId}
                  onChange={(event) =>
                    props.setSourceForm((current) => ({ ...current, slackUserId: event.target.value }))
                  }
                />
              </Label>
              <Label>
                Slack workspace URL
                <Input
                  aria-label="Slack workspace URL"
                  value={props.sourceForm.slackWorkspaceUrl}
                  onChange={(event) =>
                    props.setSourceForm((current) => ({ ...current, slackWorkspaceUrl: event.target.value }))
                  }
                />
              </Label>
            </>
          ) : null}
          {props.sourceForm.source === 'shortcut' ? (
            <Label>
              Shortcut workflow states to include (comma-separated)
              <Input
                aria-label="Shortcut workflow state allowlist"
                placeholder="💻 Ready for Work, ⚒ In Progress, ❌ Rejected Review"
                value={props.sourceForm.shortcutAllowedWorkflowStatesText}
                onChange={(event) =>
                  props.setSourceForm((current) => ({
                    ...current,
                    shortcutAllowedWorkflowStatesText: event.target.value,
                  }))
                }
              />
            </Label>
          ) : null}
          {props.sourceForm.source === 'github' ? (
            <>
              <p className="text-sm text-muted-foreground">
                Fine-grained PAT requirements: select each repository you want synced and grant repository permissions for
                Issues (Read-only) and Pull requests (Read-only). Mentions are discovered through GitHub issue search.
              </p>
              <Label>
                GitHub API base URL (optional)
                <Input
                  aria-label="GitHub API base URL (optional)"
                  value={props.sourceForm.githubApiBaseUrl}
                  onChange={(event) =>
                    props.setSourceForm((current) => ({ ...current, githubApiBaseUrl: event.target.value }))
                  }
                />
              </Label>
              <Label className="flex items-center gap-2">
                <Checkbox
                  aria-label="Require involvement in addition to mentions"
                  checked={props.sourceForm.githubParticipating}
                  onChange={(event) =>
                    props.setSourceForm((current) => ({ ...current, githubParticipating: event.target.checked }))
                  }
                />
                Require involvement in addition to mentions
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, GitHub search requires both <code>mentions:&lt;your-login&gt;</code> and{' '}
                <code>involves:&lt;your-login&gt;</code>.
              </p>
            </>
          ) : null}
          <Button type="submit">Save source</Button>
        </form>
        <SettingsFeedback settingsError={props.settingsError} settingsNotice={props.settingsNotice} />
        <p className="text-sm text-muted-foreground">
          Work sync is separate from notification cleanup. You can sync Work any time without deleting notifications.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" onClick={() => setIsClearModalOpen(true)}>
            Clear all notifications
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              void props.onClearWorkItems()
            }}
            disabled={props.isClearingWorkItems}
          >
            {props.isClearingWorkItems ? 'Clearing Work...' : 'Clear all Work items'}
          </Button>
        </div>
        {isClearModalOpen ? (
          <div
            className="rounded-xl border bg-card p-4 shadow-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-all-heading"
          >
            <Card>
              <CardHeader>
                <CardTitle id="clear-all-heading">Are you sure?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This will permanently remove all inbox notifications and read state, clear sync history, and reset
                  per-source sync watermarks. Source settings stay intact.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsClearModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={props.isClearingNotifications}
                    onClick={async () => {
                      await props.onClearNotifications()
                      setIsClearModalOpen(false)
                    }}
                  >
                    {props.isClearingNotifications ? 'Clearing...' : 'Yes, clear notifications'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
        {props.sourceConfigs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources configured yet.</p>
        ) : (
          <ul className="space-y-3">
            {props.sourceConfigs.map((config) => {
              const status = props.perSourceSyncStatus.get(`${config.source}:${config.instanceKey}`)
              const sourceKey = `${config.source}:${config.instanceKey}`
              return (
                <li key={sourceKey} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
                  <div className="grid gap-2">
                    <strong className="text-sm font-semibold">{config.displayName}</strong>
                    <Badge variant={config.enabled ? 'default' : 'secondary'}>
                      {config.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {config.source}/{config.instanceKey}
                    </span>
                    {status ? <span className="text-sm text-muted-foreground">{status.label}</span> : null}
                    {status?.error ? <span className="text-sm text-destructive">{status.error}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => props.onEditSource(config)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => props.onSyncSource(config)}
                      disabled={
                        props.isSyncing ||
                        props.syncingSourceKeys[sourceKey] ||
                        props.replayingSourceKeys[sourceKey]
                      }
                    >
                      {props.syncingSourceKeys[sourceKey] ? 'Syncing...' : 'Sync'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => props.onReplaySource(config)}
                      disabled={
                        props.isSyncing ||
                        props.syncingSourceKeys[sourceKey] ||
                        props.replayingSourceKeys[sourceKey]
                      }
                    >
                      {props.replayingSourceKeys[sourceKey] ? 'Replaying...' : 'Dev replay'}
                    </Button>
                    {config.source === 'shortcut' ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => props.onSyncShortcutWorkSource(config)}
                        disabled={
                          props.isSyncing ||
                          props.syncingSourceKeys[sourceKey] ||
                          props.replayingSourceKeys[sourceKey] ||
                          props.syncingWorkSourceKeys[sourceKey]
                        }
                      >
                        {props.syncingWorkSourceKeys[sourceKey] ? 'Syncing Work...' : 'Sync Work (dev)'}
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={() => props.onToggleEnabled(config)}>
                      {config.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => props.onDeleteSource(config)}>
                      Delete
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SettingsProjectsPage(props: {
  projectForm: ProjectFormState
  setProjectForm: Dispatch<SetStateAction<ProjectFormState>>
  onSaveProject: (event: FormEvent<HTMLFormElement>) => Promise<void>
  projects: Project[]
  projectMetadata: ProjectMetadata
  onEditProject: (project: Project) => void
  onDeleteProject: (project: Project) => Promise<void>
  settingsError: string | null
  settingsNotice: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3" onSubmit={props.onSaveProject}>
          <Label>
            Project name
            <Input
              aria-label="Project name"
              value={props.projectForm.name}
              onChange={(event) =>
                props.setProjectForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </Label>
          <Label>
            Linked Shortcut source
            <Select
              aria-label="Linked Shortcut source"
              value={props.projectForm.shortcutSourceConfigId}
              onChange={(event) =>
                props.setProjectForm((current) => ({
                  ...current,
                  shortcutSourceConfigId: event.target.value,
                }))
              }
            >
              <option value="">None</option>
              {props.projectMetadata.shortcutSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.displayName} ({source.instanceKey})
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            GitHub repositories (comma-separated)
            <Input
              aria-label="Project GitHub repositories"
              placeholder={props.projectMetadata.knownGithubRepos.join(', ')}
              value={props.projectForm.githubReposText}
              onChange={(event) =>
                props.setProjectForm((current) => ({
                  ...current,
                  githubReposText: event.target.value,
                }))
              }
            />
          </Label>
          <Label>
            Slack channel IDs (comma-separated)
            <Input
              aria-label="Project Slack channels"
              placeholder={props.projectMetadata.knownSlackChannels.join(', ')}
              value={props.projectForm.slackChannelIdsText}
              onChange={(event) =>
                props.setProjectForm((current) => ({
                  ...current,
                  slackChannelIdsText: event.target.value,
                }))
              }
            />
          </Label>
          <Button type="submit">{props.projectForm.id ? 'Update project' : 'Create project'}</Button>
        </form>
        <SettingsFeedback settingsError={props.settingsError} settingsNotice={props.settingsNotice} />
        {props.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects configured yet.</p>
        ) : (
          <ul className="space-y-3">
            {props.projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="grid gap-2">
                  <strong className="text-sm font-semibold">{project.name}</strong>
                  <span className="text-sm text-muted-foreground">
                    Shortcut source: {project.shortcutSourceConfigId ?? 'none'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    GitHub: {project.githubRepos.length > 0 ? project.githubRepos.join(', ') : 'none'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Slack: {project.slackChannelIds.length > 0 ? project.slackChannelIds.join(', ') : 'none'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => props.onEditProject(project)}>
                    Edit
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => props.onDeleteProject(project)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SettingsPeoplePage(props: {
  personForm: PersonFormState
  setPersonForm: Dispatch<SetStateAction<PersonFormState>>
  onSavePerson: (event: FormEvent<HTMLFormElement>) => Promise<void>
  people: Person[]
  onEditPerson: (person: Person) => void
  onDeletePerson: (person: Person) => Promise<void>
  settingsError: string | null
  settingsNotice: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3" onSubmit={props.onSavePerson}>
          <Label className="flex items-center gap-2">
            <Checkbox
              aria-label="Is me"
              checked={props.personForm.isMe}
              onChange={(event) =>
                props.setPersonForm((current) => ({
                  ...current,
                  isMe: event.target.checked,
                }))
              }
            />
            Me (used for Shortcut assignment / code review matching)
          </Label>
          <Label>
            Name
            <Input
              aria-label="Person name"
              value={props.personForm.name}
              onChange={(event) =>
                props.setPersonForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </Label>
          <Label>
            GitHub username
            <Input
              aria-label="Person GitHub username"
              value={props.personForm.githubUsername}
              onChange={(event) =>
                props.setPersonForm((current) => ({
                  ...current,
                  githubUsername: event.target.value,
                }))
              }
            />
          </Label>
          <Label>
            Slack username
            <Input
              aria-label="Person Slack username"
              value={props.personForm.slackUsername}
              onChange={(event) =>
                props.setPersonForm((current) => ({
                  ...current,
                  slackUsername: event.target.value,
                }))
              }
            />
          </Label>
          <Label>
            Shortcut user ID
            <Input
              aria-label="Person Shortcut user ID"
              value={props.personForm.shortcutUserId}
              onChange={(event) =>
                props.setPersonForm((current) => ({
                  ...current,
                  shortcutUserId: event.target.value,
                }))
              }
            />
          </Label>
          <Label>
            Shortcut handle
            <Input
              aria-label="Person Shortcut handle"
              value={props.personForm.shortcutHandle}
              onChange={(event) =>
                props.setPersonForm((current) => ({
                  ...current,
                  shortcutHandle: event.target.value,
                }))
              }
            />
          </Label>
          <Button type="submit">{props.personForm.id ? 'Update person' : 'Create person'}</Button>
        </form>
        <SettingsFeedback settingsError={props.settingsError} settingsNotice={props.settingsNotice} />
        {props.people.length === 0 ? (
          <p className="text-sm text-muted-foreground">No people configured yet.</p>
        ) : (
          <ul className="space-y-3">
            {props.people.map((person) => (
              <li key={person.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="grid gap-2">
                  <strong className="text-sm font-semibold">{person.name}</strong>
                  {person.isMe ? <Badge>Me</Badge> : null}
                  <span className="text-sm text-muted-foreground">GitHub: {person.githubUsername ?? 'none'}</span>
                  <span className="text-sm text-muted-foreground">Slack: {person.slackUsername ?? 'none'}</span>
                  <span className="text-sm text-muted-foreground">Shortcut user ID: {person.shortcutUserId ?? 'none'}</span>
                  <span className="text-sm text-muted-foreground">Shortcut handle: {person.shortcutHandle ?? 'none'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => props.onEditPerson(person)}>
                    Edit
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => props.onDeletePerson(person)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SettingsSyncHistoryPage(props: {
  syncHistoryError: string | null
  syncHistory: SyncHistoryEntry[]
  settingsError: string | null
  settingsNotice: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsFeedback settingsError={props.settingsError} settingsNotice={props.settingsNotice} />
        {props.syncHistoryError ? (
          <Alert variant="destructive">
            <AlertTitle>Sync history error</AlertTitle>
            <AlertDescription>{props.syncHistoryError}</AlertDescription>
          </Alert>
        ) : null}
        {props.syncHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync history yet.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader scope="col">Source</TableHeader>
                <TableHeader scope="col">Status</TableHeader>
                <TableHeader scope="col">Started</TableHeader>
                <TableHeader scope="col">Finished</TableHeader>
                <TableHeader scope="col">Counts</TableHeader>
                <TableHeader scope="col">Since used</TableHeader>
                <TableHeader scope="col">Error</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {props.syncHistory.map((entry) => (
                <TableRow key={entry.runId}>
                  <TableCell>
                    {entry.source}/{entry.instanceKey}
                  </TableCell>
                  <TableCell>{entry.status}</TableCell>
                  <TableCell>{formatTimestamp(entry.startedAt)}</TableCell>
                  <TableCell>{formatTimestamp(entry.finishedAt)}</TableCell>
                  <TableCell>
                    fetched {entry.fetchedCount}, upserted {entry.upsertedCount}, archived {entry.archivedCount}
                  </TableCell>
                  <TableCell>{entry.sinceUsed ?? 'none'}</TableCell>
                  <TableCell>{entry.errorMessage ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
