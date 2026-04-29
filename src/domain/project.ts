export type Project = {
  id: string
  name: string
  shortcutSourceConfigId?: string
  githubRepos: string[]
  slackChannelIds: string[]
  createdAt: string
  updatedAt: string
}

export type ProjectMetadata = {
  shortcutSources: Array<{
    id: string
    instanceKey: string
    displayName: string
  }>
  knownGithubRepos: string[]
  knownSlackChannels: string[]
}
