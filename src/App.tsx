import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import './App.css'
import { NavLink, Route, Routes } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert'
import { Button } from './components/ui/button'
import { useHomeState } from './features/home/use-home-state'
import { InboxPage } from './pages/inbox-page'
import { SettingsPage } from './pages/settings-page'
import { WorkPage } from './pages/work-page'

type ThemeMode = 'light' | 'dark'
const THEME_STORAGE_KEY = 'home-theme-mode'

function getInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function App() {
  const state = useHomeState()
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode())

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', themeMode === 'dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-4 py-5 md:px-6">
      <header className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">Home</h1>
            <nav className="flex flex-wrap gap-2" aria-label="Primary">
              {[
                { to: '/inbox', label: 'Inbox' },
                { to: '/work', label: 'Work' },
                { to: '/settings', label: 'Settings' },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent hover:text-accent-foreground',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))
              }}
              aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {themeMode === 'dark' ? (
                <>
                  <Sun aria-hidden="true" className="h-4 w-4" />
                  Light
                </>
              ) : (
                <>
                  <Moon aria-hidden="true" className="h-4 w-4" />
                  Dark
                </>
              )}
            </Button>
            <Button type="button" onClick={state.onSyncNow} disabled={state.isSyncing || state.isReplaying}>
              {state.isSyncing ? 'Syncing...' : 'Sync now'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={state.onReplayNow}
              disabled={state.isSyncing || state.isReplaying}
            >
              {state.isReplaying ? 'Replaying...' : 'Dev replay snapshots'}
            </Button>
          </div>
        </div>
      </header>
      {state.syncError ? (
        <Alert variant="destructive">
          <AlertTitle>Sync failed</AlertTitle>
          <AlertDescription>{state.syncError}</AlertDescription>
        </Alert>
      ) : state.result ? (
        <Alert>
          <AlertDescription>
            Synced {state.result.totalSources} source(s). Success: {state.result.succeededSources}, Failed:{' '}
            {state.result.failedSources}, Upserted notifications: {state.result.totalUpserted}
            {state.result.workSync ? `, Upserted work: ${state.result.workSync.totalUpserted}` : ''}.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertDescription>No notifications synced yet.</AlertDescription>
        </Alert>
      )}
      <Routes>
        <Route
          path="/"
          element={
            <InboxPage
              inboxItems={state.inboxItems}
              inboxError={state.inboxError}
              inboxNotice={state.inboxNotice}
              isMarkingAllRead={state.isMarkingAllRead}
              projectFilters={state.projectFilterOptions}
              selectedProjectFilter={state.selectedProjectFilter}
              onSelectProjectFilter={state.setSelectedProjectFilter}
              sourceFilters={state.sourceFilterOptions.map((source) => ({
                id: source,
                name: source === 'github' ? 'GitHub' : source === 'slack' ? 'Slack' : 'Shortcut',
              }))}
              selectedSourceFilter={state.selectedSourceFilter}
              onSelectSourceFilter={state.setSelectedSourceFilter}
              fromFilters={state.fromFilterOptions}
              selectedFromFilter={state.selectedFromFilter}
              onSelectFromFilter={state.setSelectedFromFilter}
              selectedViewMode={state.selectedViewMode}
              onSelectViewMode={state.setSelectedViewMode}
              onToggleRead={state.onToggleRead}
              onMarkAllRead={state.onMarkAllRead}
              onMarkTodo={state.onMarkInboxItemTodo}
            />
          }
        />
        <Route
          path="/inbox"
          element={
            <InboxPage
              inboxItems={state.inboxItems}
              inboxError={state.inboxError}
              inboxNotice={state.inboxNotice}
              isMarkingAllRead={state.isMarkingAllRead}
              projectFilters={state.projectFilterOptions}
              selectedProjectFilter={state.selectedProjectFilter}
              onSelectProjectFilter={state.setSelectedProjectFilter}
              sourceFilters={state.sourceFilterOptions.map((source) => ({
                id: source,
                name: source === 'github' ? 'GitHub' : source === 'slack' ? 'Slack' : 'Shortcut',
              }))}
              selectedSourceFilter={state.selectedSourceFilter}
              onSelectSourceFilter={state.setSelectedSourceFilter}
              fromFilters={state.fromFilterOptions}
              selectedFromFilter={state.selectedFromFilter}
              onSelectFromFilter={state.setSelectedFromFilter}
              selectedViewMode={state.selectedViewMode}
              onSelectViewMode={state.setSelectedViewMode}
              onToggleRead={state.onToggleRead}
              onMarkAllRead={state.onMarkAllRead}
              onMarkTodo={state.onMarkInboxItemTodo}
            />
          }
        />
        <Route
          path="/work"
          element={
            <WorkPage
              workItems={state.workItems}
              workError={state.workError}
              onMoveWorkItem={state.onMoveWorkItem}
              onReorderWorkColumn={state.onReorderWorkColumn}
            />
          }
        />
        <Route
          path="/settings/*"
          element={
            <SettingsPage
              sourceForm={state.sourceForm}
              setSourceForm={state.setSourceForm}
              onSaveSource={state.onSaveSource}
              projectForm={state.projectForm}
              setProjectForm={state.setProjectForm}
              onSaveProject={state.onSaveProject}
              personForm={state.personForm}
              setPersonForm={state.setPersonForm}
              onSavePerson={state.onSavePerson}
              settingsError={state.settingsError}
              settingsNotice={state.settingsNotice}
              sourceConfigs={state.sourceConfigs}
              projects={state.projects}
              people={state.people}
              projectMetadata={state.projectMetadata}
              perSourceSyncStatus={state.perSourceSyncStatus}
              isSyncing={state.isSyncing}
              syncingSourceKeys={state.syncingSourceKeys}
              replayingSourceKeys={state.replayingSourceKeys}
              onEditSource={state.onEditSource}
              onSyncSource={state.onSyncSource}
              onReplaySource={state.onReplaySource}
              onToggleEnabled={state.onToggleEnabled}
              onDeleteSource={state.onDeleteSource}
              onEditProject={state.onEditProject}
              onDeleteProject={state.onDeleteProject}
              onEditPerson={state.onEditPerson}
              onDeletePerson={state.onDeletePerson}
              onClearNotifications={state.onClearNotifications}
              isClearingNotifications={state.isClearingNotifications}
              onClearWorkItems={state.onClearWorkItems}
              isClearingWorkItems={state.isClearingWorkItems}
              onSyncShortcutWorkSource={state.onSyncShortcutWorkSource}
              syncingWorkSourceKeys={state.syncingWorkSourceKeys}
              syncHistoryError={state.syncHistoryError}
              syncHistory={state.syncHistory}
            />
          }
        />
      </Routes>
    </main>
  )
}

export default App
