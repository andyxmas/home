import type { SourceConfig, SourceKind } from '../domain/notification'

type SourceConfigResponse = {
  sources?: SourceConfig[]
  error?: string
}

type SourceConfigInput = {
  source: SourceKind
  instanceKey: string
  displayName: string
  enabled: boolean
  token: string
  slackUserId?: string
  slackWorkspaceUrl?: string
  shortcutAllowedWorkflowStates?: string[]
  githubApiBaseUrl?: string
  githubParticipating?: boolean
}

export async function listSourceConfigs(): Promise<SourceConfig[]> {
  const response = await fetch('/api/sources')
  const payload = (await response.json().catch(() => ({}))) as SourceConfigResponse
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load source configs')
  }
  return payload.sources ?? []
}

export async function saveSourceConfig(input: SourceConfigInput): Promise<void> {
  const response = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as SourceConfigResponse
    throw new Error(payload.error ?? 'Failed to save source config')
  }
}

export async function deleteSourceConfig(source: SourceKind, instanceKey: string): Promise<void> {
  const response = await fetch(
    `/api/sources/${encodeURIComponent(source)}/${encodeURIComponent(instanceKey)}`,
    { method: 'DELETE' },
  )

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as SourceConfigResponse
    throw new Error(payload.error ?? 'Failed to delete source config')
  }
}
