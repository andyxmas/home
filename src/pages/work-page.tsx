import { useMemo } from 'react'
import type { WorkColumn, WorkItem } from '../domain/work'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatTimestamp } from '../features/home/use-home-state'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type WorkPageProps = {
  workItems: WorkItem[]
  workError: string | null
  onMoveWorkItem: (input: { id: string; column: WorkColumn; position: number }) => Promise<void>
  onReorderWorkColumn: (input: { column: WorkColumn; orderedIds: string[] }) => Promise<void>
}

type ColumnModel = {
  id: WorkColumn
  title: string
}

const columns: ColumnModel[] = [
  { id: 'unassigned', title: 'Unassigned' },
  { id: 'today', title: 'Today' },
  { id: 'soon', title: 'Soon' },
  { id: 'later', title: 'Later' },
]

function groupByColumn(items: WorkItem[]): Record<WorkColumn, WorkItem[]> {
  const grouped: Record<WorkColumn, WorkItem[]> = { unassigned: [], today: [], soon: [], later: [] }
  for (const item of items) {
    grouped[item.column].push(item)
  }
  for (const column of Object.keys(grouped) as WorkColumn[]) {
    grouped[column].sort((a, b) => a.position - b.position)
  }
  return grouped
}

function parseContainerId(containerId: string): WorkColumn | null {
  if (containerId === 'unassigned' || containerId === 'today' || containerId === 'soon' || containerId === 'later') {
    return containerId
  }
  return null
}

function formatKind(kind: WorkItem['kind']): string {
  if (kind === 'notification_todo') return 'Todo'
  if (kind === 'shortcut_code_review') return 'Code review'
  if (kind === 'shortcut_story_assigned') return 'Assigned'
  return kind
}

export function WorkPage({ workItems, workError, onMoveWorkItem, onReorderWorkColumn }: WorkPageProps) {
  const grouped = useMemo(() => groupByColumn(workItems), [workItems])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    if (!event.over) return
    const overId = String(event.over.id)
    if (!overId) return

    const sourceColumn = parseContainerId(String(event.active.data.current?.sortable?.containerId ?? ''))
    const destContainerId =
      String(event.over.data.current?.sortable?.containerId ?? '') ||
      (overId.includes(':') ? overId.split(':')[0] : overId)
    const destColumn = parseContainerId(destContainerId)
    if (!sourceColumn || !destColumn) return

    const sourceItems = grouped[sourceColumn].map((item) => item.id)
    const destItems = grouped[destColumn].map((item) => item.id)

    const activeIndex = sourceItems.indexOf(activeId)
    if (activeIndex === -1) return

    if (sourceColumn === destColumn) {
      const overIndex = overId.includes(':') ? Number(overId.split(':')[1]) : destItems.indexOf(overId)
      if (overIndex === -1) return
      const next = arrayMove(destItems, activeIndex, overIndex)
      await onReorderWorkColumn({ column: destColumn, orderedIds: next })
      return
    }

    // Cross-column: remove from source, insert into dest at over index (or append).
    const nextSource = sourceItems.filter((id) => id !== activeId)
    const overIndex = overId.includes(':') ? Number(overId.split(':')[1]) : destItems.indexOf(overId)
    const insertAt = Number.isFinite(overIndex) && overIndex >= 0 ? overIndex : destItems.length
    const nextDest = [...destItems.slice(0, insertAt), activeId, ...destItems.slice(insertAt)]

    // Ensure DB column matches before reordering validations.
    await onMoveWorkItem({ id: activeId, column: destColumn, position: insertAt })
    await onReorderWorkColumn({ column: sourceColumn, orderedIds: nextSource })
    await onReorderWorkColumn({ column: destColumn, orderedIds: nextDest })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work</CardTitle>
      </CardHeader>
      <CardContent className="panel-stack">
        {workError ? (
          <Alert variant="destructive">
            <AlertTitle>Work error</AlertTitle>
            <AlertDescription>{workError}</AlertDescription>
          </Alert>
        ) : null}
        {workItems.length === 0 ? <p>No work items yet.</p> : null}
        <p>Shortcut sync initially lands items in Unassigned. Drag them into Today, Soon, or Later.</p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => {
            void onDragEnd(event)
          }}
        >
          <div className="work-board" role="region" aria-label="Work board">
            <div className="work-columns">
              {columns.map((column) => {
                const items = grouped[column.id]
                return (
                  <section key={column.id} className="work-column" aria-label={column.title}>
                    <header className="work-column-title">
                      <strong>{column.title}</strong>
                      <Badge variant="secondary">{items.length}</Badge>
                    </header>
                    <SortableContext
                      id={column.id}
                      items={items.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ol className="work-card-list" aria-label={`${column.title} items`}>
                        {items.map((item) => (
                          <WorkCard key={item.id} item={item} />
                        ))}
                      </ol>
                    </SortableContext>
                  </section>
                )
              })}
            </div>
          </div>
        </DndContext>
      </CardContent>
    </Card>
  )
}

function WorkCard({ item }: { item: WorkItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className="work-card">
      <div className="work-card-main">
        <div className="work-card-title-row">
          <strong className="work-card-title">{item.title}</strong>
          <Badge variant="secondary">{formatKind(item.kind)}</Badge>
        </div>
        <div className="item-meta-row">
          <span className="item-meta">{item.source}</span>
          <span className="item-meta">{formatTimestamp(item.updatedAt)}</span>
          {item.url ? (
            <a
              className="item-link-icon"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open work item link"
              title="Open link"
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
        {item.body ? <p className="work-card-body">{item.body}</p> : null}
      </div>
      <div className="item-actions">
        <Button type="button" size="sm" variant="outline" {...attributes} {...listeners} aria-label="Drag">
          Drag
        </Button>
      </div>
    </li>
  )
}

