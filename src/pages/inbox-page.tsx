import type { InboxItem } from '../api/inbox'
import { ExternalLink } from 'lucide-react'
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
  inboxNotice: string | null
  isMarkingAllRead: boolean
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
  onMarkAllRead: () => Promise<void>
  onMarkTodo: (item: InboxItem) => Promise<void>
}

export function InboxPage({
  inboxItems,
  inboxError,
  inboxNotice,
  isMarkingAllRead,
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
  onMarkAllRead,
  onMarkTodo,
}: InboxPageProps) {
  const isCondensed = selectedViewMode === 'condensed'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbox</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Project filters">
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
        <div className="flex flex-wrap gap-2" role="group" aria-label="Source filters">
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
        <div className="flex flex-wrap gap-2" role="group" aria-label="From filters">
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
        <div className="flex flex-wrap gap-2" role="group" aria-label="View mode">
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
        <div className="flex flex-wrap gap-2" role="group" aria-label="Inbox actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onMarkAllRead()}
            disabled={isMarkingAllRead || inboxItems.length === 0}
          >
            {isMarkingAllRead ? 'Marking...' : 'Mark all as read'}
          </Button>
        </div>
        {inboxNotice ? (
          <Alert>
            <AlertTitle>Inbox updated</AlertTitle>
            <AlertDescription>{inboxNotice}</AlertDescription>
          </Alert>
        ) : null}
        {inboxError ? (
          <Alert variant="destructive">
            <AlertTitle>Inbox error</AlertTitle>
            <AlertDescription>{inboxError}</AlertDescription>
          </Alert>
        ) : null}
        {inboxItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">You're all caught up. No unread inbox items.</p>
        ) : (
          <ul className="space-y-3">
            {inboxItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="grid gap-2">
                  <strong className="text-sm font-semibold">{item.title}</strong>
                  <Badge variant={item.isRead ? 'secondary' : 'default'}>
                    {item.isRead ? 'Read' : 'Unread'}
                  </Badge>
                  {item.projectName ? (
                    <Badge variant="secondary">
                      <span className="item-project-badge">{item.projectName}</span>
                    </Badge>
                  ) : null}
                  {item.fromPersonName ? <Badge variant="secondary">From: {item.fromPersonName}</Badge> : null}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {item.source} - {formatTimestamp(item.occurredAt)}
                    </span>
                    {item.url ? (
                      <a
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${item.source} notification link`}
                        title="Open original notification"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                  {!isCondensed && item.body ? (
                    <InboxBodyMarkdown source={item.source} body={item.body} />
                  ) : null}
                </div>
                {!isCondensed ? (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => onToggleRead(item)}>
                      Mark as {item.isRead ? 'unread' : 'read'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void onMarkTodo(item)}>
                      Todo
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
