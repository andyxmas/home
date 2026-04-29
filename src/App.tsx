import './App.css'
import { NavLink, Route, Routes } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert'
import { Button } from './components/ui/button'
import { useHomeState } from './features/home/use-home-state'
import { InboxPage } from './pages/inbox-page'
import { SettingsPage } from './pages/settings-page'

function App() {
  const state = useHomeState()

  return (
    <main className="app">
      <header className="topbar">
        <div className="title-row">
          <h1>Home</h1>
          <nav className="route-nav" aria-label="Primary">
            <NavLink
              to="/inbox"
              className={({ isActive }) => (isActive ? 'route-link route-link-active' : 'route-link')}
            >
              Inbox
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) => (isActive ? 'route-link route-link-active' : 'route-link')}
            >
              Settings
            </NavLink>
          </nav>
        </div>
        <Button type="button" onClick={state.onSyncNow} disabled={state.isSyncing}>
          {state.isSyncing ? 'Syncing...' : 'Sync now'}
        </Button>
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
            {state.result.failedSources}, Upserted notifications: {state.result.totalUpserted}.
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
            />
          }
        />
        <Route
          path="/inbox"
          element={
            <InboxPage
              inboxItems={state.inboxItems}
              inboxError={state.inboxError}
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
              onEditSource={state.onEditSource}
              onSyncSource={state.onSyncSource}
              onToggleEnabled={state.onToggleEnabled}
              onDeleteSource={state.onDeleteSource}
              onEditProject={state.onEditProject}
              onDeleteProject={state.onDeleteProject}
              onEditPerson={state.onEditPerson}
              onDeletePerson={state.onDeletePerson}
              onClearNotifications={state.onClearNotifications}
              isClearingNotifications={state.isClearingNotifications}
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
