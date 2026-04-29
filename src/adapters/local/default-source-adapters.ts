import type { SourceAdapter } from '../../domain/source-adapter'
import { createGitHubAdapter } from '../provider/github-adapter'
import { createShortcutAdapter } from '../provider/shortcut-adapter'
import { createSlackAdapter } from '../provider/slack-adapter'

export function createDefaultSourceAdapters(): SourceAdapter[] {
  return [createSlackAdapter(), createGitHubAdapter(), createShortcutAdapter()]
}
