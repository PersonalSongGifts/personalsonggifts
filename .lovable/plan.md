# Preventing recurring database saturation and slow /song loads

## Confirmed current state (read-only evidence)

Database (inspected live, nothing changed):
- Postgres 17.6, `max_connections = 60`, PgBouncer pool clients 1/200, current sessions 32 (1 active).
- Memory 61% used, data disk 15%, database size 774 MB, WAL 272 MB, 0 restarts since boot.
- `statement_timeout = 120000` (2 minutes) at the database level — one slow query can hold a connection for two full minutes.
- `shared_buffers = 256 MB`, `effective_cache_size = 768 MB` — still a small instance profile, so the tier bump raised headroom but not the connection limit (still 60).
- Row counts: `orders` 3,629, `leads` 28,752.

The load source is confirmed, and it is not the song page. Ranked by total database time, the top four statements are all the admin dashboard list, each with exactly 12,950 calls:

| Statement | Calls | Mean | Total DB time |
|---|---|---|---|
| leads page, ~50 wide columns, ORDER BY captured_at DESC | 12,950 | 291 ms | 62.8 min |
| orders page, ~90 columns, ORDER BY created_at DESC | 12,950 | 57 ms | 12.2 min |
| leads exact count | 12,950 | 33 ms | 7.2 min |
| orders exact count | 12,950 | 6 ms | 1.4 min |

Together roughly 84 minutes of database time, versus a few seconds total for every automation and delivery query combined. Every other statement in the top 15 is under 2.2 seconds cumulative.

Why: `src/pages/Admin.tsx` polls `admin-orders` every 30 seconds unconditionally (plus on every window focus), and each poll runs four queries in `supabase/functions/admin-orders/index.ts` — a 100-row leads page selecting ~50 mostly free-text columns, a 100-row orders page selecting ~90 columns, and two `count: exact` scans over the full tables. The count scans read every row of `leads` (28,752) on every poll. Polling continues while the tab is hidden, and each extra open admin tab multiplies it.

Song page, confirmed:
- `find_orders_by_short_id` is indexed (`idx_orders_id_text_pattern`); hot automation lookups are indexed on both tables. There is no cheap missing-index win left.
- `src/pages/SongPlayer.tsx` retries up to 3 times with a 20 s abort each plus backoff, so worst-case customer wait is about 62 seconds per mount, and React remounts can start overlapping fetches.
- `SongPlayer.tsx` appends `&t=${Date.now()}` and sends `cache: "no-store"`, so no CDN or browser layer can absorb a burst; `get-song-page` also sets `Cache-Control: no-store`.
- `get-song-page` caching is in-memory per edge instance: 30 s success cache and a 10-minute stale cache, keyed on order id only.
- `SongPlayer.tsx` line 846 uses `preload="auto"` for the main song audio; the bonus track already uses `preload="none"`.

## Unverified assumptions (stated, not acted on)

- That admin polling alone caused the earlier multi-minute outages. The evidence proves it dominates database time now, but `pg_stat_statements` was reset by the restarts, so these numbers describe the current window, not the outage windows.
- Which exact tier Ryan moved to. The settings above indicate a small profile, but the tier name is not visible from SQL; it must be read from Cloud → Advanced settings.
- Whether Suno callbacks contributed. Their queries are indexed and cheap in this window (hundreds of milliseconds cumulative), so this is a hypothesis only.
- Whether concurrent admin tabs were open during the outages. Plausible from the call counts, unproven.
- Whether TOAST/heap reads or the sort account for the 291 ms leads query. Needs `EXPLAIN (ANALYZE, BUFFERS)` before assuming.

## Recommended Phase 1 (smallest safe change, no schema, no customer-facing behavior)

Cut admin polling cost by roughly 90% without changing what the dashboard shows.

Files: `src/pages/Admin.tsx`, `supabase/functions/admin-orders/index.ts`.

1. Pause polling when the tab is hidden (`document.visibilityState`), refetch once on becoming visible, and drop the interval from 30 s to 60 s. Keep an explicit Refresh button so nothing feels stale.
2. Guard against overlap: an in-flight ref so a poll cannot start while one is running, and an `AbortController` so a superseded poll is cancelled.
3. In `admin-orders` `action=list`, replace the two `count: exact` scans with `count: "planned"`, or return counts only when `page === 0`. Exact totals over 28,752 rows on every poll are the least useful, most expensive part of the payload.
4. Trim the leads list select to the columns the list rows and search filter actually render; leave the long free-text fields to the existing detail fetch.

Rollback: each item is an independent revert of a small diff; nothing is persisted and no migration is involved.
Preview vs production: identical behavior in both; preview hits the same backend, so verify during low traffic.

## Later phases (each needs Ryan's explicit approval)

Phase 2 — server-side deadlines and one bounded customer wait.
- Files: `supabase/functions/get-song-page/index.ts`, `src/pages/SongPlayer.tsx`.
- Give the edge function a hard per-request budget (about 6 s across its retries) so it never occupies a database connection for the 120 s the server-level `statement_timeout` allows.
- Collapse the client to one bounded wait: single attempt with an 8 s abort, one automatic retry, then a clear "taking longer than usual — Try again" state. Worst case about 18 s instead of 62 s. Cancel in-flight fetches on unmount so remounts cannot orphan requests.
- Rollback: revert both files; no state to undo.

Phase 3 — request coalescing and a privacy-safe stale fallback.
- Same two files. Coalesce concurrent identical lookups inside an edge instance so a burst on one link becomes one database query. Keep the stale fallback but split the response so cached bytes contain only always-public presentation fields.
- Rollback: revert; the in-memory caches vanish on the next deploy anyway.

Phase 4 — pre-restart forensics, so the next event is diagnosed rather than cleared.
- Add an admin-only, key-protected read-only diagnostics endpoint that snapshots `pg_stat_activity` (query, state, `wait_event`, age), `pg_locks` blocking pairs, connection counts by application name, and the top `pg_stat_statements` rows, writing the snapshot to a table so it survives a restart. Today every restart wipes `pg_stat_statements`, which is why the outage windows cannot be reconstructed.
- Also capture `cron.job` contents — the `cron` schema is not readable with current privileges, so scheduled-job frequency is a blind spot — and whether multiple admin sessions are connected.
- Rollback: drop the endpoint; the snapshot table is inert.

Phase 5 — audio `preload="auto"` → `"metadata"` in `src/pages/SongPlayer.tsx`.
- Effect: the browser fetches only headers and duration instead of eagerly pulling the whole MP3 on page load. It does not touch the database, but removes several megabytes of storage bandwidth per view and speeds up first render, especially on mobile.
- UX tradeoff: duration and the seek bar still appear immediately, but the first tap on Play buffers briefly (usually well under a second on broadband, one to two seconds on weak mobile) instead of starting instantly. Mitigation: keep the existing buffering indicator, and optionally warm the audio on first page interaction so the delay lands before the tap.
- Rollback: one-word revert.

## What could break, and how each risk is prevented

- Admin data feels stale after slower polling → keep focus/visibility refetch plus a manual Refresh button, and show a last-updated time.
- Planned counts show approximate totals → label them approximate, or return exact counts only on page 0.
- Trimming leads columns breaks admin search or a badge → diff the trimmed list against every field the list rows and filters read before shipping; the detail modal already re-fetches full rows.
- A shorter client timeout gives up on a slow but recoverable load → one automatic retry plus an explicit Try again keeps recovery in the customer's hands, and the copy never claims the song is missing.
- Caching leaks private data → cache only presentation fields; never cache `revision_token`, unlock timestamps, or signed URLs in the shared/stale layer. Unlock state and revisions stay uncached and always live.
- Payment or fulfillment regressions → no phase touches Stripe, PayPal, webhooks, order creation, unlock verification, revisions, cover art, tips, upsells, or tracking. Phases 1–3 change read paths and polling only; Phase 4 adds a read-only endpoint; Phase 5 is one HTML attribute.

## Verification steps and success metrics (no real orders, no Kie/Suno credits)

Before Phase 1, record the baseline: `total_exec_time` and `calls` for the four admin statements, plus `db_health` memory and connection numbers.

After Phase 1:
- The four admin statements grow at roughly a tenth of the previous rate over the same wall-clock window with one admin tab open; the two count statements drop out of the top five.
- No new statement enters the top five.
- Admin login and list load stay under about 3 seconds and show correct totals.

Failure-injection tests that cost nothing:
- Load a valid `/song/<SHORTID>` with the network throttled to slow 3G; confirm the bounded wait and retry state, and that a timeout never shows "Song Not Found".
- Load a made-up short id; confirm a genuine not-found card, not a retry loop.
- Mount and unmount the song page repeatedly; confirm no overlapping in-flight requests in the network panel.
- Open two admin tabs, hide one, and confirm the hidden tab issues no requests.
- Hit `get-song-page` repeatedly with and without `?fresh=1` and watch `X-Cache: HIT/STALE/MISS` behave as expected.

## Actions requiring Ryan's approval

- Any code edit, deploy, or migration (nothing here has been applied).
- Phases 2 through 5 individually.
- The diagnostics endpoint and its snapshot table (Phase 4 needs a migration).
- Any further compute or disk resize. Current evidence does not justify one: memory 61%, disk 15%, pool clients 1 of 200. Fix the polling load first, then re-measure.
- Any restart. Restarts destroy the only evidence available; capture a snapshot first.