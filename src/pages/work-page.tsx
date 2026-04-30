import { useMemo } from 'react'
import type { WorkColumn, WorkItem } from '../domain/work'
import { formatTimestamp } from '../features/home/use-home-state'
import { ExternalLink, GripVertical } from 'lucide-react'
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
  { id: 'today', title: 'Today' },
  { id: 'soon', title: 'Soon' },
  { id: 'later', title: 'Later' },
  { id: 'unassigned', title: 'Unassigned' },
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
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="space-y-1 border-b p-6">
        <h2 className="text-2xl font-semibold leading-none tracking-tight">Work</h2>
      </header>
      <div className="space-y-5 p-6">
        {workError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive"
          >
            <p className="font-semibold">Work error</p>
            <p className="mt-1 text-sm">{workError}</p>
          </div>
        ) : null}
        {workItems.length === 0 ? <p className="text-sm text-muted-foreground">No work items yet.</p> : null}
        <p className="text-sm text-muted-foreground">
          Shortcut sync initially lands items in Unassigned. Drag them into Today, Soon, or Later.
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => {
            void onDragEnd(event)
          }}
        >
          <div role="region" aria-label="Work board">
            <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
              {columns.map((column) => {
                const items = grouped[column.id]
                return (
                  <section
                    key={column.id}
                    className="flex min-h-72 flex-col gap-4 rounded-xl border bg-muted/30 p-4"
                    aria-label={column.title}
                  >
                    <header className="flex items-center justify-between gap-3">
                      <strong className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        {column.title}
                      </strong>
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                        {items.length}
                      </span>
                    </header>
                    <SortableContext
                      id={column.id}
                      items={items.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ol className="space-y-3" aria-label={`${column.title} items`}>
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
      </div>
    </section>
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
    <li ref={setNodeRef} style={style} className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <strong className="text-sm font-semibold leading-5">{item.title}</strong>
          <span className="inline-flex shrink-0 items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
            {formatKind(item.kind)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{item.source}</span>
          <span>•</span>
          <span>{formatTimestamp(item.updatedAt)}</span>
          {item.url ? (
            <a
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open work item link"
              title="Open link"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        {item.body ? <p className="text-sm leading-6 text-muted-foreground">{item.body}</p> : null}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          {...attributes}
          {...listeners}
          aria-label="Drag work item"
          title="Drag work item"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

