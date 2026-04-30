export type WorkKind = 'shortcut_story_assigned' | 'shortcut_code_review' | 'notification_todo'

export type WorkColumn = 'today' | 'soon' | 'later'

export type WorkSource = 'shortcut' | 'notification'

export type WorkItem = {
  id: string
  kind: WorkKind
  source: WorkSource
  /**
   * Stable key used to make creation idempotent. Should not change even if the
   * display fields change over time.
   */
  dedupeKey: string
  externalId?: string
  title: string
  body?: string
  url?: string
  projectId?: string
  column: WorkColumn
  position: number
  createdAt: string
  updatedAt: string
}

