# Home

Local-first personal command center for aggregated mentions and work signals.

## Current bootstrap status

- Vite + React + TypeScript scaffolded
- Git repository initialized locally
- Vitest + Testing Library configured
- Minimal app shell in place (`Inbox`, `Settings`, `Sync now`)

## Local commands

- `npm run dev` - run app
- `npm run test` - run unit tests once
- `npm run test:watch` - run tests in watch mode
- `npm run test:coverage` - coverage report
- `npm run build` - typecheck + production build

## Cloud + multitask prerequisites

To run work in cloud and split across multiple agents reliably:

1. Create a remote repository (GitHub/GitLab).
2. Add remote and push this project.
3. Run parallel agents on independent branches/worktrees for each milestone.
4. Merge via small PRs.

Suggested branch split:

- `feat/data-layer`
- `feat/adapter-sdk`
- `feat/ui-shell`
- `feat/slack-adapter`
- `feat/github-adapter`
- `feat/shortcut-adapter`
- `feat/integration`

## Next implementation milestones

1. Data schema + repositories (SQLite + Drizzle)
2. Adapter contract + orchestrator
3. Settings and inbox UI
4. Service adapters (Slack/GitHub/Shortcut)
5. End-to-end sync flow + smoke tests
