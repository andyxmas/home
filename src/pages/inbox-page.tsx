import type { InboxItem } from '../api/inbox'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatTimestamp } from '../features/home/use-home-state'
import type { InboxFromFilter, InboxSourceFilter, InboxViewMode } from '../features/home/use-home-state'
import { InboxBodyMarkdown } from '../features/inbox/inbox-body-markdown'

type InboxPageProps = {
  inboxItems: InboxItem[]
  inboxError: string | null
  projectFilters: Array<{ id: string; name: string }>
  selectedProjectFilter: string
  onSelectProjectFilter: (value: string) => void
  sourceFilters: Array<{ id: Exclude<InboxSourceFilter, 'all'>; name: string }>
  selectedSourceFilter: InboxSourceFilter
  onSelectSourceFilter: (value: InboxSourceFilter) => void
  fromFilters: Array<{ id: string; name: string }>
  selectedFromFilter: InboxFromFilter
  onSelectFromFilter: (value: InboxFromFilter) => void
  selectedViewMode: InboxViewMode
  onSelectViewMode: (value: InboxViewMode) => void
  onToggleRead: (item: InboxItem) => Promise<void>
}

export function InboxPage({
  inboxItems,
  inboxError,
  projectFilters,
  selectedProjectFilter,
  onSelectProjectFilter,
  sourceFilters,
  selectedSourceFilter,
  onSelectSourceFilter,
  fromFilters,
  selectedFromFilter,
  onSelectFromFilter,
  selectedViewMode,
  onSelectViewMode,
  onToggleRead,
}: InboxPageProps) {
  const isCondensed = selectedViewMode === 'condensed'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbox</CardTitle>
      </CardHeader>
      <CardContent className="panel-stack">
        <div className="row-actions" role="group" aria-label="Project filters">
          <Button
            type="button"
            size="sm"
            variant={selectedProjectFilter === 'all' ? 'default' : 'outline'}
            onClick={() => onSelectProjectFilter('all')}
          >
            All
          </Button>
          {projectFilters.map((project) => (
            <Button
              key={project.id}
              type="button"
              size="sm"
              variant={selectedProjectFilter === project.id ? 'default' : 'outline'}
              onClick={() => onSelectProjectFilter(project.id)}
            >
              {project.name}
            </Button>
          ))}
        </div>
        <div className="row-actions" role="group" aria-label="Source filters">
          <Button
            type="button"
            size="sm"
            variant={selectedSourceFilter === 'all' ? 'default' : 'outline'}
            onClick={() => onSelectSourceFilter('all')}
          >
            All
          </Button>
          {sourceFilters.map((source) => (
            <Button
              key={source.id}
              type="button"
              size="sm"
              variant={selectedSourceFilter === source.id ? 'default' : 'outline'}
              onClick={() => onSelectSourceFilter(source.id)}
            >
              {source.name}
            </Button>
          ))}
        </div>
        <div className="row-actions" role="group" aria-label="From filters">
          <Button
            type="button"
            size="sm"
            variant={selectedFromFilter === 'all' ? 'default' : 'outline'}
            onClick={() => onSelectFromFilter('all')}
          >
            All
          </Button>
          {fromFilters.map((person) => (
            <Button
              key={person.id}
              type="button"
              size="sm"
              variant={selectedFromFilter === person.id ? 'default' : 'outline'}
              onClick={() => onSelectFromFilter(person.id)}
            >
              {person.name}
            </Button>
          ))}
        </div>
        <div className="row-actions" role="group" aria-label="View mode">
          <Button
            type="button"
            size="sm"
            variant={selectedViewMode === 'full' ? 'default' : 'outline'}
            onClick={() => onSelectViewMode('full')}
          >
            Full
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selectedViewMode === 'condensed' ? 'default' : 'outline'}
            onClick={() => onSelectViewMode('condensed')}
          >
            Condensed
          </Button>
        </div>
        {inboxError ? (
          <Alert variant="destructive">
            <AlertTitle>Inbox error</AlertTitle>
            <AlertDescription>{inboxError}</AlertDescription>
          </Alert>
        ) : null}
        {inboxItems.length === 0 ? (
          <p>No inbox items yet.</p>
        ) : (
          <ul className="item-list">
            {inboxItems.map((item) => (
              <li key={item.id} className="item-row">
                <div className="item-main">
                  <strong>{item.title}</strong>
                  <Badge variant={item.isRead ? 'secondary' : 'default'}>
                    {item.isRead ? 'Read' : 'Unread'}
                  </Badge>
                  {item.projectName ? (
                    <Badge variant="secondary">
                      <span className="item-project-badge">{item.projectName}</span>
                    </Badge>
                  ) : null}
                  {item.fromPersonName ? <Badge variant="secondary">From: {item.fromPersonName}</Badge> : null}
                  <div className="item-meta-row">
                    <span className="item-meta">
                      {item.source} - {formatTimestamp(item.occurredAt)}
                    </span>
                    {item.url ? (
                      <a
                        className="item-link-icon"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${item.source} notification link`}
                        title="Open original notification"
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M11.5 3a.75.75 0 0 1 0-1.5h5A.75.75 0 0 1 17.25 2v5a.75.75 0 0 1-1.5 0V3.81l-6.22 6.22a.75.75 0 0 1-1.06-1.06l6.22-6.22H11.5Z"
                          />
                          <path
                            fill="currentColor"
                            d="M5.25 4.5A2.75 2.75 0 0 0 2.5 7.25v7.5a2.75 2.75 0 0 0 2.75 2.75h7.5a2.75 2.75 0 0 0 2.75-2.75V10.5a.75.75 0 0 0-1.5 0v4.25c0 .69-.56 1.25-1.25 1.25h-7.5C4.56 16 4 15.44 4 14.75v-7.5C4 6.56 4.56 6 5.25 6H9.5a.75.75 0 0 0 0-1.5H5.25Z"
                          />
                        </svg>
                      </a>
                    ) : null}
                  </div>
                  {!isCondensed && item.body ? (
                    <InboxBodyMarkdown source={item.source} body={item.body} />
                  ) : null}
                </div>
                {!isCondensed ? (
                  <div className="item-actions">
                    <Button type="button" variant="outline" onClick={() => onToggleRead(item)}>
                      Mark as {item.isRead ? 'unread' : 'read'}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
