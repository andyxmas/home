# Parallel Subagent Briefs

Each subagent owns one branch and one milestone.

## A - Data Layer

- Create Drizzle schema/migrations for:
  - `source_config`
  - `notification`
  - `notification_state`
  - `sync_run`
  - `archive_notification`
- Implement repository layer with idempotent upsert + archive older than 90 days.
- Add integration tests against local SQLite test DB.

## B - Adapter SDK

- Define `SourceAdapter` interface and adapter registry.
- Implement `syncAllSources` with per-source isolation.
- Persist sync run metrics and errors.
- Add contract tests for adapters.

## C - UI Shell

- Build `Inbox` and `Settings` pages with simple layout.
- Add source configuration forms for Slack/GitHub/Shortcut.
- Add list rendering for canonical notifications + read toggle.
- Add unit tests for key UI flows.

## D - Slack Adapter

- Token-based fetch for mentions in channels + DMs.
- Map provider payloads into canonical notification shape.
- Handle pagination and dedupe fields.
- Add unit + contract tests with fixtures.

## E - GitHub Adapter

- Single-account PAT support.
- Use Notifications API only.
- Normalize and map to canonical model.
- Add tests for pagination and mapping edge cases.

## F - Shortcut Adapter

- Support multiple configured Shortcut instances.
- Fetch comment mentions and normalize results.
- Add tests for multi-instance fan-out and merge behavior.

## G - Integration and E2E

- Wire `Sync now` from UI to orchestrator.
- Ensure local read state persistence.
- Show per-source errors inline in inbox.
- Add end-to-end smoke tests for setup -> sync -> read toggle.
