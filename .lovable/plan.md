# Stopping the admin refresh storm and the multi-minute /song loads

## Correction to the previous version of this plan

Your correction is confirmed in the code. `fetchOrders()` in `src/pages/Admin.tsx` (and the identical block inside `handleLogin`) fetches page 0, computes
`maxPages = max(ceil(totalOrders/100), ceil(totalLeads/100))`, builds `Array.from({length: maxPages - 1}, ...)` of `listOrders` calls, and fires all of them at once through `Promise.allSettled`. With 28,752 leads that is about 288 concurrent Edge Function invocations per refresh, and since each `action=list` request runs four database statements (orders page, leads page, orders exact count, leads exact count), roughly 1,152 database statements per refresh. Both the 30-second interval and the window-focus handler call `fetchOrders()` with no in-flight guard, so a focus event during a refresh doubles the storm. 12,950 calls on each top statement is therefore about 45 full refreshes, not 12,950 polls.

I also overclaimed previously: the cumulative `pg_stat_statements` totals do not by themselves prove what happened during the outages. They strongly implicate this refresh storm as the mechanism, but the counters were reset by the restarts, so outage-window causality still needs timestamped Edge Function logs and connection/CPU charts covering those windows.

## Confirmed by read-only inspection

- `src/pages/Admin.tsx`: unbounded parallel full-dataset reload as described above, in both `handleLogin` and `fetchOrders`; 30 s `setInterval` plus a `focus` listener, no in-flight guard, no `AbortController`, no visibility check.
- `supabase/functions/admin-orders/index.ts` `action=list`: four statements per request, including two `count: "exact"` scans repeated on every page of the fan-out.
- Top four statements by total database time are exactly those four, 12,950 calls each, ~84 minutes of database time combined. Everything else in the top 15 is under 2.2 s cumulative — automation, delivery, and callback queries are not the load.
- Role timeouts (`pg_roles.rolconfig`), not a global assumption: `anon = statement_timeout 3s`; `authenticated = 8s`; `authenticator = statement_timeout 8s, lock_timeout 8s`; `service_role` has **no** `rolconfig`; database-global `statement_timeout = 120000`.
- Instance: Postgres 17.6, `max_connections = 60`, `shared_buffers = 256 MB`, `effective_cache_size = 768 MB`. Live snapshot: memory 61%, disk 15%, 32 sessions (1 active), pool clients 1/200, database 774 MB, WAL 272 MB, 0 restarts since boot. Rows: `orders` 3,629, `leads` 28,752.
- Song page: `find_orders_by_short_id` uses `idx_orders_id_text_pattern`; automation task-id lookups indexed on both tables. No cheap missing-index win remains.
- `src/pages/SongPlayer.tsx`: up to 3 attempts at 20 s each plus backoff (~62 s worst case per mount), `&t=${Date.now()}` plus `cache: "no-store"` so nothing can be absorbed upstream, and `preload="auto"` on the main audio (line 846) while the bonus audio already uses `preload="none"`.
- `supabase/functions/get-song-page/index.ts`: per-instance in-memory caches only (30 s success, 10 min stale). Its Supabase calls use no `abortSignal`, so a client abort does not stop server-side work. `fresh=1` bypasses `successCache` only — on a database failure the stale path can still serve up to 10-minute-old unlock/package/revision state, including after a purchase.

## Unresolved / must be measured, not assumed

- **Effective statement timeout for PostgREST service-role requests.** `service_role` has no `rolconfig`, `authenticator` has 8 s. Whether an `action=list` statement is capped at 8 s (inherited from the login role's session setting) or at the 120 s database default (if the role switch clears it) is not decidable from `rolconfig` alone. Resolve it by reading `current_setting('statement_timeout')` from inside a service-role request before relying on either number.
- Outage-window causality (needs timestamped logs and connection charts, see monitoring section).
- What actually made the 291 ms leads page slow — sort, wide-column heap/TOAST reads, or contention. Needs `EXPLAIN (ANALYZE, BUFFERS)`.
- Whether multiple admin tabs or repeated focus events multiplied the storm during the outages.
- Which compute tier Ryan moved to (not visible from SQL; read it in Cloud → Advanced settings).

## Phase 1 — remove the storm, keep the dashboard fully usable

Files: `src/pages/Admin.tsx`, `supabase/functions/admin-orders/index.ts`.

**1a. Delete the fan-out.** Remove the `Array.from({length: maxPages - 1})` + `Promise.allSettled` block from both `handleLogin` and `fetchOrders`. The dashboard loads page 0 only.

**1b. Make the server the source of truth for paging, filtering, and search**, so nothing is silently limited to loaded rows:
- `action=list` accepts independent paging for the two datasets (`ordersPage`, `leadsPage`, and separate page sizes) because 3,629 orders and 28,752 leads should not share a cursor.
- Add a `search` parameter handled in SQL against email, customer name, recipient name, and short id, with `status`/date filters also applied server-side. Search runs over the whole table, never over the loaded slice.
- Return exact counts only when a page-0 or explicit-count request asks for them; subsequent page requests skip the two count scans entirely.
- The admin search box calls the server with a debounce (about 400 ms) and shows "searching all records", so locating an old customer from months ago works by search rather than by loading everything.

**1c. Tame the refresh loop.**
- One in-flight guard (ref) so a refresh can never overlap another; a superseded refresh is aborted with an `AbortController`.
- Interval only while the tab is visible, at 60 s, and it refreshes the current page/filter — not the whole dataset.
- Focus/visibility refetch is throttled (no refetch if one ran in the last 15 s).
- An explicit Refresh button with a visible "last updated" timestamp, so slower automatic refresh never feels stale.

**1d. Trim the leads list payload** to the columns the list rows and badges actually render; long free-text fields stay in the existing detail fetch (`get_lead_detail` / `get_order_detail` already re-fetch full rows).

**Temporary compatibility batch loader (only if some panel genuinely still needs the full set):** keep a manual "Load all records" button that runs pages sequentially with a concurrency cap of 2, requests counts once, stops on the first error, and is never triggered by an interval, a focus event, or login. It is safe because it is user-initiated, bounded to at most two concurrent statements pairs, cannot repeat, and cannot be re-entered while running. Preferred outcome: identify which panels read `allOrders`/`leads` wholesale (analytics cards, remarketing panels) and move their aggregates server-side in Phase 1b or a follow-up, then delete the loader.

**Rollout gate:** verify in preview with the real backend during a low-traffic window, with one tab, watching `calls` deltas on the four statements before and after. Ship only if search finds a known months-old customer, paging works on both tabs, and every existing admin action still succeeds.
**Rollback:** revert `Admin.tsx` and `admin-orders/index.ts`; no migration, no persisted state. The old client keeps working against the new function because new parameters are optional and defaulted.
**Preview vs production:** identical behavior; both hit the same backend, so preview testing itself adds (small, bounded) production database load — do it deliberately at low traffic.

## Phase 2 — one bounded customer wait with real cancellation (needs approval)

Files: `supabase/functions/get-song-page/index.ts`, `src/pages/SongPlayer.tsx`.

- Server: one total request deadline (about 6 s) enforced with an `AbortController` whose signal is passed to **every** Supabase call via `.abortSignal(signal)` — the short-id RPC, the full-uuid select, and the `admin_settings` lookup — plus a matching in-SQL cap by setting a short `statement_timeout` for those statements once 1's measurement tells us what the effective value is. A frontend abort alone leaves the function running and holding a connection, which is what turns one slow page into connection pressure.
- Server: propagate the incoming `req.signal` into the same controller so a client disconnect actually cancels the database work.
- Client: one attempt with an 8 s abort, one automatic retry, then a clear "this is taking longer than usual — Try again" state. Worst case about 18 s rather than 62 s. Abort in-flight fetches on unmount so remounts cannot orphan requests. A timeout or abort never renders "Song Not Found".

**Gate:** verified against mocked slow/failing responses (see testing) before any production deploy.
**Rollback:** revert both files; nothing persisted.

## Phase 3 — coalescing and a privacy-safe fallback (needs approval)

Treat this data as sensitive. `get-song-page` returns song URLs, `revision_token`, unlock/package/bonus state, recipient name, and occasion. None of it may enter a shared or CDN cache, and `Cache-Control: no-store` stays.

- In-instance request coalescing: concurrent identical lookups share one database round trip. This is a per-process promise map, not a cache, so it cannot serve one customer another customer's data — key strictly on the normalized order id.
- Split the fallback: only always-public presentation fields (song title, cover URL, occasion, recipient first name) may be served stale. `revision_token`, `lyrics_unlocked`, `download_unlocked`, `package_unlocked`, `bonus_*`, and signed/song URLs are fetched live or omitted with a "refresh to see your unlocks" state.
- Fix the `fresh=1` gap: `fresh=1` must bypass both `successCache` and `staleCache`, and the stale path must never answer a request made right after a purchase-verification redirect. Cap stale age for anything unlock-related to zero.

**Gate:** review the exact response shape field-by-field against a "public vs entitlement" list before deploy.
**Rollback:** revert; in-memory structures disappear on the next deploy.

## Phase 4 — monitoring, native first (needs approval only if it goes past step A)

**A. Native, no code, no cost, do this before any future restart:** Supabase/Cloud Reports (CPU, memory, connection count, disk IO) for the outage timestamps; Logs Explorer for `edge_logs` and `postgres_logs` filtered to `admin-orders` and `get-song-page` around those windows; `pg_stat_statements` snapshots taken *before* any restart, since a restart wipes them; the connections chart to see whether 60 was approached. This alone should confirm or refute the storm as the outage cause with timestamped evidence.

**B. Only if native retention proves too short** to cover a future event: a custom snapshot table plus a key-protected read-only endpoint. Risks to design for, not gloss over: the table needs RLS with no `anon`/`authenticated` access at all (service-role writes only); `pg_stat_activity.query` text must be redacted before storage because it can contain customer emails and names; a fixed retention window (for example 7 days) with pruning, or it becomes another disk and vacuum problem; and it is least likely to work exactly when it is most needed, because during saturation the endpoint's own connection may be refused — so it must use a short timeout, avoid retries, and degrade to a partial snapshot rather than hanging. A Log Drain is a paid add-on; do not enable one before showing Ryan the current per-GB and monthly cost from the Cloud billing page.

**Rollback:** step A leaves no trace; step B is dropping a table and a function.

## Phase 5 — `preload="auto"` → `preload="metadata"` (separate, low risk, needs approval)

One attribute in `src/pages/SongPlayer.tsx` line 846. No database involvement.
- Benefit: the browser fetches only container headers and duration instead of eagerly downloading the whole MP3 on page load — several MB of storage bandwidth saved per view and a faster first render, most noticeable on mobile.
- Tradeoff: duration and the seek bar still appear immediately, but the first tap on Play buffers briefly (usually well under a second on broadband, one to two seconds on weak mobile) instead of starting instantly. Mitigations: keep the existing buffering indicator, and optionally call `load()` on the first user interaction with the page so the delay happens before the tap.
- Rollback: one-word revert.

## Testing without production load, real orders, or Kie/Suno credits

Do **not** hammer production with `fresh=1`. Instead:
- Playwright against the local dev server with `page.route` interception on the `get-song-page` URL to synthesize: 503, 500, malformed body, a 30 s hang, an aborted connection, and a genuine 404. Assert bounded wait, retry state, correct not-found card, and that no timeout renders "Song Not Found".
- Mount/unmount the song route repeatedly under interception and assert no orphaned in-flight requests.
- Admin: intercept `admin-orders` with fixtures for 28,752 leads to prove the fan-out is gone (count outgoing requests per refresh: must be 1), that hidden tabs issue none, that focus throttling holds, and that search returns a seeded old record that is not in page 0.
- Server-side deadline: exercise `get-song-page` locally against a stub that delays, confirming the 6 s budget returns rather than hanging.
- No test needs a checkout, a Suno generation, or a Kie call.

## Success metrics

- Requests per admin refresh: from ~288 to 1 (measured in the network panel).
- Database statements per refresh: from ~1,152 to 2 (page queries; counts only when requested).
- The two exact-count statements leave the top five of `pg_stat_statements` and grow only on explicit count requests.
- Admin login and page load under ~3 s; search across all 28,752 leads under ~1 s.
- `/song/<id>` p95 under 2 s in normal conditions; worst-case customer wait bounded at ~18 s with a retry affordance, never an infinite spinner and never a false "not found".
- Connections stay well clear of 60 during an admin session; memory does not climb with admin usage.

## What could break, and the prevention

- Panels that read the full `allOrders`/`leads` arrays (analytics, remarketing, funnel, heatmap) would show partial data → inventory every consumer of those arrays first; either move its aggregate server-side or keep it behind the manual bounded loader until moved. This is the main correctness risk in Phase 1 and gates the release.
- Search feels weaker → search moves server-side across all rows, which is strictly better than today's search-over-loaded-rows; keep the same input and add a "searching all records" hint.
- Approximate counts confuse admin → return exact counts on the page-0/count request and label anything approximate.
- Losing sight of recent activity with 60 s refresh → visible last-updated time, Refresh button, and throttled focus refresh.
- Shorter client timeout abandoning a recoverable load → one automatic retry plus explicit Try again; copy never implies the song is missing.
- Stale or shared cache leaking entitlements → entitlement fields never cached, `no-store` retained, `fresh=1` bypasses both caches, coalescing keyed strictly per order id.
- Business flows regressing → no phase touches Stripe, PayPal, webhooks, tips, unlock verification (lyrics/download/package/bonus), revisions, cover art, delivery scheduling, or pixels/tracking. Phase 1 changes admin read paths and adds optional parameters; Phases 2–3 change one read function and one page; Phase 4A is read-only observation; Phase 5 is one attribute. Every existing admin action (`update`, `deliver`, resend, regenerate, dismiss, revision approve/edit, unlock bonus, promos, tips) keeps its current request shape and is re-tested before release.

## Revised Phase 1 in plain English

Right now, every time the admin dashboard refreshes — every 30 seconds, and again whenever you click back into the window — it tries to download every order and every lead at once, firing roughly 288 simultaneous requests that turn into over a thousand database queries. Two overlapping refreshes double that. That is almost certainly what has been flattening the database and making customer song pages take minutes.

Phase 1 stops that. The dashboard will load one page of records at a time and ask the server for whatever page, filter, or search you need, so searching for a customer from months ago still works — the search runs across all 28,752 leads on the server, not just what happens to be on screen. Refresh becomes one request instead of 288, it pauses while the tab is in the background, it can't overlap itself, and there's a Refresh button plus a "last updated" time so you always know how current the view is. Nothing about orders, payments, deliveries, unlocks, or revisions changes.

## Requires Ryan's approval before anything happens

- Any code edit, deploy, or migration — nothing in this plan has been applied.
- Phase 1 (the admin refresh rewrite) as a whole, and the decision on whether to keep the temporary bounded "Load all records" button.
- Phases 2, 3, 4B, and 5 individually.
- Enabling a Log Drain, after seeing its cost.
- Creating the diagnostics table/endpoint (Phase 4B needs a migration).
- Any further compute or disk resize. Current evidence does not support one: memory 61%, disk 15%, pool clients 1/200. Remove the storm, then re-measure.
- Any backend restart. Restarts erase `pg_stat_statements`, the main evidence trail — snapshot first.