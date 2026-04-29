export type Person = {
  id: string
  name: string
  githubUsername?: string
  slackUsername?: string
  shortcutUserId?: string
  shortcutHandle?: string
  // Legacy field kept for backward compatibility with older payloads.
  shortcutUsername?: string
  createdAt: string
  updatedAt: string
}
