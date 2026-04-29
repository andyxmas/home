# Notification Data Contract (Phase 0 Freeze)

This document freezes the canonical notification contract used by all source adapters.

## Canonical model

Canonical entities live in `src/domain/notification.ts`.

- `SourceConfig` stores per-source configuration and credentials.
- `CanonicalNotification` is the normalized record from any upstream source.
- `NotificationState` stores local read state (local-first for v1).
- `AdapterSyncResult` captures normalized sync outcome metrics.

### Required notification identity

Every incoming event must map to:

- `source`: one of `slack`, `github`, `shortcut`
- `externalId`: upstream identifier from that source

From these two values we derive:

- `dedupeKey = "${source}:${externalId}"`

This key is persisted and uniquely indexed, making upserts idempotent.

## Adapter interface

The adapter contract lives in `src/domain/source-adapter.ts`:

- `SourceAdapter` is the canonical interface all providers implement.
- `fetchNotifications(config, input)` returns normalized notifications and an optional cursor.
- Cursors are opaque provider-specific values (`AdapterSyncCursor`) so each adapter can paginate independently.
- `input.since` carries the per-source successful sync watermark to let adapters narrow fetch windows.

## Sync watermark behavior

- `source_config.last_successful_sync_at` stores a successful sync watermark per `(source, instance_key)`.
- On first sync (no successful watermark yet), the orchestrator uses a default lookback window of 7 days and passes `input.since = now - 7d`.
- The orchestrator passes the stored watermark as `input.since` on subsequent runs.
- The watermark advances only after a source sync finishes successfully (fetch + upsert + run completion path).
- Failed source runs keep their previous watermark so retries do not skip data.

## Shortcut narrowing and caveats

- Shortcut sync now searches stories with `has:comment` and, when a watermark exists, `updated:YYYY-MM-DD..*`.
- Because Shortcut's `updated:` operator is date-based (not datetime precision), we additionally filter mentions by comment `updated_at/created_at >= since` in adapter code.
- This avoids missing same-day updates after the watermark while tolerating extra same-day data (which is deduped by upsert).
- Caveat: Shortcut Search Stories filters at story level. We assume story `updated` changes when comments change; if Shortcut ever diverges from that behavior, comment-only changes could require a different endpoint strategy.

## Dedupe strategy

The dedupe key is canonical and frozen for v1:

1. Build key from `source + ":" + externalId`.
2. Upsert notifications by unique `dedupe_key`.
3. Update mutable fields (title/body/url/payload/timestamps) on conflict.
4. Preserve local state in `notification_state` so read status survives repeated syncs.

This guarantees manual sync can be run many times without duplicate rows.

## Credential shape: token now, OAuth-ready

`SourceCredentialShape` intentionally supports both models:

- v1 (current): `authMode = "token"` and `token.value`
- future OAuth: `authMode = "oauth2"` and `oauth2.{accessToken, refreshToken, expiresAt, tokenType, scopes}`

Even while v1 remains token-based, the schema is already compatible with OAuth migration without redesigning storage.

### Provider defaults

- Shortcut uses a built-in default API base URL: `https://api.app.shortcut.com`.
- This can still be overridden in credentials for future flexibility, but it is not required in settings.
- GitHub mention ingestion uses `/user` to resolve the authenticated login and `/search/issues` with
  `mentions:<login>`, optional `involves:<login>` guard, and `updated:>=<since>` when a watermark exists
  to stay compatible with fine-grained PATs.

### GitHub fine-grained PAT permissions (v1)

- Select the repositories that should be synced when creating the token.
- Grant repository permissions:
  - Issues: `Read-only`
  - Pull requests: `Read-only`
- Mentions in unselected repositories are not visible to the token and will not sync.

## Archival policy

- Active notifications stay in `notification`.
- Notifications older than 90 days are moved to `archive_notification`.
- Local read state in `notification_state` is deleted with archived rows (foreign key cascade).
