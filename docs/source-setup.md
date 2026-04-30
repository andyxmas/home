# Source Setup Guide

Use this guide to add Slack, GitHub, and Shortcut sources from the app `Settings` panel.

## Before you start

- Open the app and go to `Settings`.
- For every source, fill these base fields:
  - `Provider`: `Slack`, `GitHub`, or `Shortcut`
  - `Instance key`: stable ID for this connection (for example `default`, `work`, `team-a`)
  - `Display name`: human-friendly label shown in Settings
  - `Enabled`: keep checked unless you want to save but not sync yet
  - `Token`: provider access token

## 1) Slack source

### Generate credentials

1. In Slack, create or open an app at [api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions**, add bot token scopes:
   - `channels:history` (read public channel messages)
   - `groups:history` (read private channel messages)
   - `im:history` (read direct messages)
   - `users:read` (recommended for user lookup consistency)
3. Install (or reinstall) the app to the workspace.
4. Copy the bot token (`xoxb-...`).
5. Get your Slack user ID (`U...`) from your profile or Slack user info tools.

### Minimum permissions/scopes

- Slack bot token with: `channels:history`, `groups:history`, `im:history`
- `users:read` is recommended and typically harmless to include

### What to enter in Settings

- `Provider`: `Slack`
- `Instance key`: for example `default`
- `Display name`: for example `Slack - Acme`
- `Token`: your `xoxb-...` token
- `Slack user ID`: your user ID (`U...`) - required
- `Slack workspace URL`: optional but recommended, for example `https://acme.slack.com`
  - This enables deep links back to Slack messages.

### Quick validation after **Sync now**

1. Click **Save source**.
2. Click **Sync now**.
3. Confirm in `Settings` list that this source shows `Synced N items` (or at least no source-level error).
4. Confirm new Slack entries appear in `Inbox`.

### Common errors and fixes

- `Settings error: ... Slack requires a user ID.`
  - Add `Slack user ID` and save again.
- `Missing required token value.`
  - Token is empty/whitespace; re-paste full `xoxb-...` token.
- `Slack API error: invalid_auth` or similar
  - Token is wrong, revoked, or app not installed in that workspace.
- `Slack history API error ... not_in_channel`
  - Invite the app/bot to channels you expect to sync.

## 2) GitHub source (fine-grained PAT, current v1 flow)

Current implementation resolves your login via `GET /user`, then fetches mentions via `GET /search/issues` using:

- `mentions:<your-login>`
- optional `involves:<your-login>` when **Require involvement in addition to mentions** is enabled
- optional `updated:>=<since>` watermark filter

### Generate credentials

1. Go to GitHub **Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens**.
2. Create a new fine-grained token.
3. Set token owner and expiration per your policy.
4. In **Repository access**, select:
   - `Only select repositories` (recommended) and choose repos you want synced, or
   - `All repositories` if your org policy allows it.
5. In **Repository permissions**, grant:
   - `Issues: Read-only`
   - `Pull requests: Read-only`
6. Generate and copy the token.

### Minimum permissions/scopes

- Fine-grained PAT with repository permissions:
  - `Issues` -> `Read-only`
  - `Pull requests` -> `Read-only`
- No classic PAT scopes are required for this v1 path.

### What to enter in Settings

- `Provider`: `GitHub`
- `Instance key`: for example `default`
- `Display name`: for example `GitHub - Work`
- `Token`: your fine-grained PAT
- `GitHub API base URL (optional)`:
  - Leave empty for `https://api.github.com`
  - Set for GitHub Enterprise Server (for example `https://github.mycompany.com/api/v3`)
- `Require involvement in addition to mentions`:
  - Off (default): use `mentions:<your-login>`.
  - On: require both `mentions:<your-login>` and `involves:<your-login>` to reduce broader mention-only matches.

### Repo selection caveat (important)

Fine-grained tokens can only see selected repositories. Mentions in repos not included in the token are invisible to `/search/issues` and will never sync. If expected items are missing, first verify repo selection on the token.

### Quick validation after **Sync now**

1. Save the source and click **Sync now**.
2. Confirm source status shows success in `Settings`.
3. Verify `Inbox` contains issues/PR mentions from one repository included in your PAT.
4. If empty, mention your user in a test issue comment in a selected repo, then sync again.

### Common errors and fixes

- `Unable to determine authenticated GitHub user login.`
  - Token cannot access `/user`; regenerate PAT and verify it is active.
- HTTP 401/403 from GitHub API
  - Token expired/revoked, wrong base URL, or org policy blocks access.
- Sync succeeds but expected mentions are missing
  - Repo not selected in fine-grained PAT, or mention is outside token visibility.
- No results with **Require involvement in addition to mentions** enabled
  - Disable it to fall back to mention-only matching.

## 3) Shortcut source

### Generate credentials

1. In Shortcut, open **Settings -> API Tokens**.
2. Create a new token (or copy an existing personal token).
3. Copy the token value.

### Minimum permissions/scopes

- Token that can access:
  - `GET /api/v3/member` (identify current member)
  - `GET /api/v3/search/stories` (read stories/comments used for mention detection)

### What to enter in Settings

- `Provider`: `Shortcut`
- `Instance key`: for example `default` or `team-a`
- `Display name`: for example `Shortcut - Product`
- `Token`: your Shortcut API token
- Extra fields:
  - No Shortcut-specific fields are currently exposed in UI.
  - API base URL defaults to `https://api.app.shortcut.com` in current implementation.

### Quick validation after **Sync now**

1. Save the source and click **Sync now**.
2. Confirm source status in `Settings` shows success.
3. Verify `Inbox` includes comment mentions from Shortcut stories where you were mentioned.

### Common errors and fixes

- `Unable to determine current member from Shortcut API.`
  - Token is invalid or lacks member access; regenerate token.
- HTTP 401/403 from Shortcut endpoints
  - Token revoked, wrong workspace/account context, or permission issue.
- `next page token is not valid ...`
  - The app auto-retries paging once from page 1; if it still fails, run sync again.
- Sync succeeds but no items
  - Ensure you are explicitly @mentioned in story comments (not just watching/following).

## Operational tips

- Use different `Instance key` values to separate personal/work accounts for the same provider.
- Keep source `Display name` specific so sync history is easy to read.
- After rotating a token, edit the same source entry and update only `Token`.
- First successful sync per source starts with a default 7-day lookback; later syncs use the source watermark for incremental fetches.
- Dev/offline replay uses local snapshots from `.home/snapshots/` and keeps only the latest snapshot per source + instance key.
- If replay fails due to missing/invalid snapshot schema, run a normal live sync once to regenerate snapshots.
