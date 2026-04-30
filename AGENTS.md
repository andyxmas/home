# AGENTS.md

## Cursor Cloud specific instructions

### Overview

"Home" is a local-first personal command center that aggregates mentions from Slack, GitHub, and Shortcut into a unified inbox. It is a single-process Vite + React + TypeScript application with an embedded SQLite backend (via `better-sqlite3` + Drizzle ORM). There is no separate backend server or Docker dependency.

### Running the application

- `npm run dev` — starts the Vite dev server on `http://localhost:5173/`. This serves both the React frontend and the backend API (embedded as a Vite dev-server middleware plugin in `src/server/dev-manual-sync-api-plugin.ts`).
- The SQLite database file is auto-created at `.home/home.sqlite` on first launch.

### Standard commands

See `README.md` and `package.json` scripts for the full list. Key commands:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Tests (once) | `npm run test` |
| Tests (watch) | `npm run test:watch` |
| Coverage | `npm run test:coverage` |
| Build (typecheck + prod) | `npm run build` |

### Non-obvious caveats

- **No external services required**: The app runs entirely locally. Slack/GitHub/Shortcut API tokens are optional and configured at runtime via the Settings UI. Tests use in-memory SQLite and mock HTTP calls.
- **`better-sqlite3` is a native addon**: It compiles during `npm install`. If you see build errors, ensure build tools (python3, make, gcc) are available. The VM image typically has these pre-installed.
- **Node.js version**: Requires Node.js 22+ (uses ES modules, TypeScript 6, Vite 8). Node.js 22 is baked into the cloud agent base image via `.cursor/Dockerfile`.
- **Dev snapshot replay**: The app can replay cached API snapshots from `.home/snapshots/` without hitting external APIs — useful for offline development. Toggle via the top bar ("Dev replay snapshots") or per source in Settings.
