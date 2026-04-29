# GitHub Comment Text Feasibility

## 1) Objective and current context (current GitHub ingestion approach)

Objective: improve GitHub mention ingestion so inbox items can include the specific comment text that mentioned the user, not only issue/PR title + body snippet.

Current repo behavior (`src/adapters/provider/github-adapter.ts`):

- Resolves authenticated login once via `GET /user`.
- Uses `GET /search/issues` with `mentions:<login>`.
- Adds `involves:<login>` when `participating` is enabled.
- Adds `updated:>=<since>` when a sync watermark exists.
- Executes two searches per page (`is:issue` and `is:pull-request`), then maps each hit into one canonical notification.
- Stores a generic body snippet from the issue/PR body, not the matching mention comment.

This means we are finding the right issue/PR resources, but not reliably preserving the exact mention text that triggered the hit.

## 2) Feasibility verdict

Feasible with REST-only incremental work.

- **Option A (lightweight):** keep `/search/issues` as the primary detector and enrich results with available match metadata and safer fallback snippets.
- **Option B (higher fidelity):** keep `/search/issues` for discovery, then hydrate each hit with comment-level calls to retrieve exact mention text and stable comment links.

Both options fit the existing adapter + sync orchestrator architecture. Option B increases API call volume and complexity but yields better UX and debugging fidelity.

## 3) Candidate API endpoints

Primary discovery (already used):

- `GET /user`
- `GET /search/issues`

Candidate enrichment endpoints (REST):

- `GET /repos/{owner}/{repo}/issues/comments/{comment_id}` (direct comment lookup when ID is known)
- `GET /repos/{owner}/{repo}/issues/{issue_number}/comments` (issue timeline comments)
- `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` (PR review comments)
- `GET /repos/{owner}/{repo}/issues/{issue_number}` (resource-level fallback metadata)
- `GET /repos/{owner}/{repo}/pulls/{pull_number}` (resource-level fallback metadata)

Search response enrichment headers to evaluate:

- `Accept: application/vnd.github.text-match+json`
  - Can provide `text_matches` fragments from the matched field and may reduce follow-up calls in some cases.

## 4) How to link search hits to comment resources

Recommended linking flow:

1. Treat `/search/issues` hits as resource-level candidates.
2. Parse repository + number from the hit (`repository_url`, `number`, `pull_request` presence).
3. Build deterministic resource keys:
   - issue comment stream: `/repos/{owner}/{repo}/issues/{number}/comments`
   - PR review comment stream: `/repos/{owner}/{repo}/pulls/{number}/comments`
4. Match comments containing `@<login>` (or equivalent mention token) and pick the most relevant recent mention >= `since`.
5. Persist comment identity in payload (for example: `commentId`, `commentUrl`, `commentUpdatedAt`, `commentAuthor`).
6. Set `url` to comment permalink when available; otherwise keep issue/PR URL.

Implementation note for this repo: keep canonical `externalId` stable per mention record. If we move from resource-level IDs to comment-level IDs, migrate carefully to avoid duplicate notifications for existing rows.

## 5) Fine-grained PAT permissions required

For current flow and both options:

- Repository permissions:
  - `Issues: Read-only`
  - `Pull requests: Read-only`

Operational requirement:

- Token must include every repository we expect to ingest; unselected repos are invisible.

No additional permissions are required for the issue/PR comment endpoints above beyond read access to issues/PRs in selected repositories.

## 6) Call volume/performance model

Let:

- `P` = pages pulled from `/search/issues` per sync cycle.
- `H` = number of hits kept after date filtering.
- `C_i` = average issue-comment pages read per hydrated hit.
- `C_pr` = average PR-review-comment pages read per hydrated PR hit.

Current baseline calls:

- `1` call for `/user` (cached per adapter instance/token/base URL).
- `2 * P` calls for `/search/issues` (`is:issue` + `is:pull-request`).

So baseline is approximately:

- `Calls_baseline = 1 + 2P`

Option A expected:

- Roughly baseline call volume (`1 + 2P`), plus negligible payload overhead.

Option B expected:

- `Calls_option_b ~= 1 + 2P + sum(comment hydration calls across H hits)`
- In practice this trends toward:
  - `1 + 2P + (H_issue * C_i) + (H_pr * C_pr)`

Performance guardrails for Option B:

- Cap hydration to first `N` newest hits per sync page.
- Stop scanning comments once a qualifying mention >= `since` is found.
- Cache per-resource hydration during the same run.
- Fall back to resource-level snippet when hydration budget is exhausted.

## 7) Option A (lightweight) details

Goal: improve mention text quality with minimal risk and no meaningful call amplification.

Implementation shape:

- Keep existing search-first flow.
- Request text-match media type and capture any returned `text_matches` fragments.
- Prefer match fragment as `body` when available; otherwise keep current body truncation.
- Extend payload with match metadata (for example `matchSource`, `matchFragment`, `matchedField`).
- Keep resource URL as-is (issue/PR URL).

Pros:

- Lowest engineering cost.
- No major performance change.
- Safe to ship quickly behind a feature flag.

Cons:

- Still not guaranteed to produce exact comment text.
- Can miss context when the match is in long discussions.

## 8) Option B (higher fidelity) details

Goal: attach actual mention-comment text and direct comment permalink whenever possible.

Implementation shape:

- Keep `/search/issues` for discovery and pagination.
- For each selected hit, run targeted hydration:
  - Issue hits: check issue comments endpoint.
  - PR hits: check both issue comments and PR review comments when needed.
- Identify candidate mention comment, then map notification body/url from that comment.
- Store comment metadata in payload and consider comment-level `externalId` strategy for future dedupe precision.
- Add explicit fallbacks:
  - If no comment match found quickly, use current resource-level mapping.
  - If endpoint rate/latency budget exceeded, skip hydration for remaining hits.

Pros:

- Best user-visible quality (exact text + direct jump links).
- Better auditability when users question "why this notification appeared."

Cons:

- Higher call volume and latency.
- More edge-case handling (pagination, edited/deleted comments, differing PR comment types).

## 9) Risks/caveats

- Search index lag can delay mention discovery relative to real-time events.
- Comment hydration can increase sync duration and rate-limit pressure on large repos.
- Same resource may contain multiple mentions; we need deterministic "which comment wins" rules.
- If external ID shape changes (resource-level -> comment-level), migration strategy is required to avoid duplicate rows.
- GitHub response shapes can vary across enterprise instances and API versions; feature-gate and log parse failures.
- **Discussion comments limitation:** current approach is issue/PR-centric. GitHub Discussions comment ingestion is not covered by the current `/search/issues` + issue/PR comment endpoint strategy and should be treated as a separate later track.

## 10) Recommended phased rollout + acceptance criteria

Phase 0 - observability prep:

- Add structured debug logs for match source (`resource`, `text_match`, `hydrated_comment`), hydration attempts, and fallback reasons.
- Acceptance: logs clearly explain body/url provenance per notification.

Phase 1 - Option A rollout (default):

- Implement text-match-aware snippet selection in GitHub adapter.
- Keep call profile near baseline.
- Acceptance:
  - No regression in sync success rate.
  - No significant p95 sync duration increase.
  - At least 70% of sampled mention notifications show a more specific snippet than title/body fallback.

Phase 2 - Option B pilot (flagged):

- Add targeted comment hydration for a bounded number of newest hits.
- Keep hard budget caps and graceful fallback.
- Acceptance:
  - For pilot repos, at least 85% of sampled mention notifications link to exact comment permalink.
  - Sync duration increase remains within agreed budget (for example <= 30% p95 in pilot).
  - No increase in duplicate notification creation.

Phase 3 - generalize + discussion track discovery:

- Expand hydration coverage and tune budgets using telemetry.
- In parallel, run a dedicated design spike for GitHub Discussions comments (separate endpoint and data model considerations).
- Acceptance:
  - Stable production metrics for 2+ weeks.
  - Clear go/no-go decision document for Discussions ingestion as a separate workstream.
