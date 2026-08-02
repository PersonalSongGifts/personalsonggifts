# Stopping the admin refresh storm and the multi-minute /song loads

## What is confirmed in the code and the database

`fetchOrders()` in `src/pages/Admin.tsx` (and the identical block inside `handleLogin`) fetches page 0, computes
`maxPages = max(ceil(totalOrders/100), ceil(totalLeads/100))`, builds `Array.from({length: maxPages - 1}, ...)` of `listOrders` calls, and fires all of them at once via `Promise.allSettled`. With 28,752 leads that is about 288 concurrent Edge Function invocations per refresh, and because each `action=list` request runs four database statements (orders page, leads page, orders exact count, leads exact count), roughly 1,152 statements per refresh. Both a 30-second `setInterval` and a `window` focus listener call `fetchOrders()`, with no in-flight guard and no abort, so overlapping refreshes multiply the burst.

The four statements at the top of `pg_stat_statements` by total time are exactly those four, 12,950 calls each, about 84 minutes of database time combined — roughly 45 full refreshes. Everything else in the top 15 is under 2.2 s cumulative, so automation, delivery and Suno callback queries are not the load.

To be precise about causality: these cumulative counters strongly implicate the refresh storm, but they do not by themselves prove what happened during the outage windows — the counters were reset by the restarts. Outage-window causality still needs timestamped Edge Function logs and connection/CPU charts for those windows (Phase 3A).

Other confirmed facts:
- Role timeouts from `pg_roles.rolconfig`: `anon = statement_timeout 3s`, `authenticated = 8s`, `authenticator = statement_timeout 8s, lock_timeout 8s`, `service_role` has **no** rolconfig; database-global `statement_timeout = 120000`.
- Instance: Postgres 17.6, `max_connections = 60`, `shared_buffers = 256 MB`, `effective_cache_size = 768 MB`. Snapshot: memory 61%, disk 15%, 32 sessions (1 active), pool clients 1/200, database 774 MB, WAL 272 MB, 0 restarts since boot. Rows: `orders` 3,629, `leads` 28,752.
- `@supabase/supabase-js` 2.93.1 is installed and `FunctionInvokeOptions` includes `signal?: AbortSignal`, so `functions.invoke(..., { signal })` cancellation is available (verified in `node_modules/@supabase/functions-js`).
- Song page: `find_orders_by_short_id` uses `idx_orders_id_text_pattern`; automation task-id lookups indexed on both tables. No cheap missing-index win remains.
- `src/pages/SongPlayer.tsx`: up to 3 attempts at 20 s each plus backoff (~62 s worst case per mount), `&t=${Date.now()}` plus `cache: "no-store"`, and `preload="auto"` on the main audio (line 846) while the bonus audio uses `preload="none"`.
- `supabase/functions/get-song-page/index.ts`: per-instance in-memory caches only (30 s success, 10 min stale); Supabase calls pass no `abortSignal`, so a client abort leaves server work running; `fresh=1` bypasses `successCache` only, so on a database failure the stale path can still serve up to 10-minute-old unlock/package/revision state — including right after a purchase.

## Unresolved, to be measured rather than assumed

- Effective statement timeout for PostgREST service-role requests. `service_role` has no `rolconfig` and `authenticator` has 8 s; whether a list statement is capped at 8 s or at the 120 s database default is not decidable from `rolconfig`. Read `current_setting('statement_timeout')` from inside a service-role request before relying on either.
- Outage-window causality (needs Phase 3A evidence).
- What makes the 291 ms leads page slow — sort, wide-column heap/TOAST reads, or contention. Needs `EXPLAIN (ANALYZE, BUFFERS)`.
- Whether multiple admin tabs or repeated focus events multiplied the storm during the outages.
- Which compute tier Ryan moved to (not visible from SQL; read Cloud → Advanced settings).
- Whether a 250-row background page is safe for response size and Edge/PostgREST limits. Unverified, so Phase 0 keeps 100.

---

# The Lovable/Supabase boundary that shapes these phases

The preview frontend and the published production site share **one** backend. Frontend edits stay in preview until Ryan clicks Publish, but an edit to `supabase/functions/admin-orders/index.ts` is deployed to the **live** backend immediately, even if the website is never published — so it would affect the production admin dashboard and anything else calling that function. That asymmetry is why the emergency patch is split: the frontend-only fix can be tested in preview with zero production deployment, while any Edge Function change is a separate, explicitly approved production change.

A second consequence: preview testing still runs real queries against the production database, so preview verification must happen at low traffic.

# Phase 0A — frontend-only emergency guard (no Edge Function edit, no deployment)

Goal: remove the automatic saturation triggers and bound concurrency, while keeping today's `allOrders` / `leads` full-dataset behavior exactly as the panels expect. No architecture rewrite of a 3,000-line admin page during an outage response.

File: `src/pages/Admin.tsx` **only**. No Edge Function edit, no deployment, no migration, no schema change.

1. **Delete the automatic reloads.** Remove the 30-second `setInterval` and the `window` focus listener that call `fetchOrders()`. The only refresh paths left are login and the explicit Refresh button.
2. **Keep the full background loader, but never automatic.** It runs after a successful login or an explicit manual Refresh, and at no other time.
3. **Replace `Promise.allSettled` over all pages with a worker queue capped at 2 concurrent page requests.** Two workers pull page numbers from a shared cursor until pages are exhausted, so at most 2 `admin-orders` requests are ever in flight.
4. **Single in-flight guard.** One ref guards login and refresh together so they cannot overlap or be re-entered; the Refresh button is disabled while a load runs.
5. **Abort and fail-soft.** An `AbortController` tied to the load is aborted on unmount and when a new load supersedes it, with its signal passed to every `functions.invoke` call via `{ signal }` (confirmed supported in the installed supabase-js 2.93.1). After the first page error the queue stops scheduling new pages, already-loaded rows are kept, and a clear partial-load warning appears ("Loaded 1,200 of 28,752 records — some older records are missing. Refresh to retry.").
6. **Progress and freshness UI.** A progress line ("Loading older records… 14 of 288 pages") plus "last updated HH:MM PST", so the admin always knows whether older records are still loading or missing.
7. **Page size stays 100.** Consider 250 only after measuring real payload size against Edge Function response limits and PostgREST behavior. No unverified size change here.

**Honest limitation:** Phase 0A **still runs the two exact-count scans on every page**, because the live `admin-orders` contract is unchanged and this phase deploys nothing to the backend. A full load remains about 288 requests and ~1,152 statements in total. The safety gain is entirely from (a) eliminating every automatic trigger, so nothing runs unless a human asks, and (b) bounding concurrency from ~288 simultaneous function calls to 2 — turning an instantaneous burst into a slow, serialized trickle the instance can absorb. Reducing total statement count is Phase 0B's job.

**Rollout gate (all must pass in Lovable preview at low traffic, since preview uses the production database):**
- Network panel shows at most 2 concurrent `admin-orders` requests at any instant.
- Zero `admin-orders` requests from timers or window focus — leave the tab idle and backgrounded for several minutes and confirm no traffic.
- Every existing admin panel and action still works: orders/leads tables and detail modals, upload song, deliver/resend, regenerate, dismiss, revisions (approve / edit & approve / auto-approve), unlock bonus, promos, tips, reactions, email panels, remarketing panels, analytics/charts, CS assistant.
- A known months-old customer is findable once the bounded load completes.
- Navigating away mid-load fires no further requests.
- `pg_stat_statements` shows no growth on the four admin statements while the admin tab sits idle.

**Rollback:** revert one file (`src/pages/Admin.tsx`). Because nothing was deployed to the backend, the production site is unaffected either way until Ryan publishes.
**Publish gate:** only after the preview gate passes should Ryan approve publishing the frontend, which is what actually stops the storm for the live dashboard.

# Phase 0B — backward-compatible `admin-orders` counts optimization (separate approval, production backend change)

File: `supabase/functions/admin-orders/index.ts` only.

- `action=list` accepts an optional `withCounts` boolean. When it is `true` (or `page === 0`), the two `count: "exact"` scans run; otherwise both are skipped and the response omits the totals.
- **Default must preserve today's behavior**, because deploying this function immediately affects the live backend while an unpublished or older production frontend is still calling it. An old client that sends no `withCounts` must keep receiving exact counts exactly as it does now — the flag is opt-out only for the new client.
- The Phase 0A client then sends `withCounts: true` for page 0 and omits it for pages 1..N, keeping the page-0 totals for progress display.
- Effect once both are live: statements per full load drop from ~1,152 to ~578, with the two count scans running once per load instead of 288 times.

**This is a production deployment even before the website is published.** Treat it as a live backend change: deploy it during low traffic, watch `admin-orders` logs for errors immediately after, and confirm the production admin dashboard still shows correct totals with the *current* (pre-publish) frontend before the new frontend goes out.

**Rollout gate:** old-client compatibility verified (a request with no `withCounts` returns counts); new-client behavior verified (page 1+ requests return no counts and produce no count statements in `pg_stat_statements`); admin totals correct in the UI.
**Rollback:** revert and redeploy the function; the contract change is additive, so reverting cannot break either client generation.

---

# Phase 1 — permanent efficiency fix: server-side pagination, filtering and search (needs its own approval)

Do not bundle this into Phase 0A/0B. Partial-data bugs in analytics, alerts, remarketing, or support workflows are the main regression risk, so this phase starts with an inventory, not with code.

**Step 1 — inventory (read-only, no edits).** Enumerate every consumer of `orders`, `allOrders`, and `leads` in `src/pages/Admin.tsx` and in `src/components/admin/*` (known so far: `UnplayedResendPanel`, `ReactionEmailPanel`, plus the analytics/chart and remarketing components), and for each one record: does it need all rows, an aggregate, or just the visible page? Nothing changes until every consumer has an answer.

**Step 2 — move aggregates server-side.** Panels that only need totals, rates, or grouped counts get a dedicated `admin-orders` action returning the aggregate, so they stop depending on a full client-side array.

**Step 3 — server-side paging, filtering, search.** Independent paging for orders and leads (they are 3,629 vs 28,752 rows and should not share a cursor); `status`, date and source filters applied in SQL; a `search` parameter matching email, customer name, recipient name and short id across the whole table with a ~400 ms debounce and a "searching all records" hint. Search must never be silently limited to loaded rows.

**Step 4 — retire the background loader** once no consumer needs the full array. Until then it stays as the Phase 0A bounded, manual loader.

**Trim payloads** in the same phase: the leads list select drops the long free-text columns the list rows never render (detail modals already re-fetch full rows via `get_lead_detail` / `get_order_detail`).

**Gate:** the inventory is complete and reviewed; every migrated panel is compared against Phase 0A numbers for identical output; a seeded months-old record is found by server-side search. Each backend step here is also a live-backend deployment and must stay backward compatible with the currently published frontend.
**Rollback:** per-step reverts; the Phase 0A behavior remains the fallback until the loader is retired, and retiring it is the last step, not the first.

---

# Phase 2 — one bounded customer wait with real cancellation (needs approval)

Files: `supabase/functions/get-song-page/index.ts`, `src/pages/SongPlayer.tsx`.

- Server: one total request deadline (about 6 s) enforced by an `AbortController` whose signal is passed to **every** Supabase call with `.abortSignal(signal)` — the short-id RPC, the full-uuid select, and the `admin_settings` lookup — plus a short in-SQL statement timeout once the measurement above tells us the effective value. A client-side abort alone does not stop the function, which is how one slow page becomes connection pressure.
- Server: wire `req.signal` into the same controller so a real client disconnect cancels the database work.
- Client: one attempt with an 8 s abort, one automatic retry, then a clear "this is taking longer than usual — Try again" state. Worst case ~18 s instead of ~62 s. Abort in-flight fetches on unmount. A timeout or abort must never render "Song Not Found".

**Gate:** verified only against local mocks/interception (see testing). **Rollback:** revert both files.

# Phase 3 — caching and privacy hardening (needs approval)

`get-song-page` returns song URLs, `revision_token`, unlock/package/bonus state, recipient name and occasion. None of it may enter a shared or CDN cache; `Cache-Control: no-store` stays.

- In-instance request coalescing (a per-process promise map keyed strictly on the normalized order id, not a cache) so a burst on one link becomes one database query.
- Split the fallback: only always-public presentation fields (song title, cover URL, occasion, recipient first name) may be served stale. `revision_token`, `lyrics_unlocked`, `download_unlocked`, `package_unlocked`, `bonus_*` and song URLs are live or omitted with a "refresh to see your unlocks" state.
- Fix the `fresh=1` gap: it must bypass **both** `successCache` and `staleCache`, and entitlement fields get a zero stale age so a page loaded right after a purchase can never show pre-purchase unlock state.

**Gate:** field-by-field review of the response against a public-vs-entitlement list. **Rollback:** revert; in-memory structures vanish on deploy.

# Phase 4 — monitoring, native first (3A needs no approval beyond reading; 4B does)

**A. Native, no code, no cost — and do this before any future restart.** Cloud Reports (CPU, memory, connections, disk IO) for the outage timestamps; Logs Explorer over `edge_logs` and `postgres_logs` filtered to `admin-orders` and `get-song-page` in those windows; `pg_stat_statements` snapshots captured *before* any restart, since a restart wipes them; the connections chart to see whether 60 was approached. This is what turns "strongly implicated" into proven causality.

**B. Only if native retention is too short to cover a future event:** a snapshot table plus a key-protected read-only endpoint. Risks to design for explicitly: RLS with no `anon`/`authenticated` access at all (service-role writes only); redaction of `pg_stat_activity.query` text, which can contain customer emails and names; a fixed retention window (e.g. 7 days) with pruning so it does not become another disk/vacuum problem; and the fact that it is least likely to work exactly when most needed — during saturation its own connection may be refused, so short timeout, no retries, degrade to a partial snapshot rather than hang. A Log Drain is a paid add-on: show Ryan the current per-GB and monthly cost from the Cloud billing page before recommending it.

**Rollback:** A leaves no trace; B is dropping a table and a function.

# Phase 5 — `preload="auto"` → `preload="metadata"` (separate, low risk, needs approval)

One attribute in `src/pages/SongPlayer.tsx` line 846. No database involvement.
- Benefit: the browser fetches only headers and duration instead of eagerly downloading the whole MP3 on load — several MB saved per view and a faster first render, most noticeable on mobile.
- Tradeoff: duration and the seek bar still appear immediately, but the first tap on Play buffers briefly (usually well under a second on broadband, one to two seconds on weak mobile) instead of starting instantly. Mitigations: keep the buffering indicator, optionally call `load()` on first page interaction so the delay lands before the tap.
- Rollback: one-word revert.

---

## Testing without production load, real orders, or Kie/Suno credits

Do **not** use repeated production `fresh=1` calls as failure injection.
- Playwright against the local dev server with `page.route` interception on `get-song-page`, synthesizing 503, 500, malformed body, a 30 s hang, an aborted connection, and a genuine 404. Assert bounded wait, retry state, correct not-found card, and that no timeout renders "Song Not Found".
- Admin: intercept `admin-orders` with a fixture reporting 28,752 leads and 3,629 orders; assert at most 2 concurrent requests, no timer/focus requests, abort on unmount, and a correct partial-load warning when a page fixture returns 500. Interception also covers the Phase 0B contract (a request without `withCounts` still returns totals) without deploying anything.
- Mount/unmount the song route repeatedly under interception; assert no orphaned in-flight requests.
- Server deadline exercised locally against a delaying stub.
- No test requires a checkout, a Suno generation, or a Kie call.

## Success metrics

- Phase 0A (frontend only): peak concurrent `admin-orders` requests 288 → 2; automatic timer/focus requests per hour → 0; requests only after login or a human pressing Refresh; count statements unchanged at 288 pairs per full load (stated honestly — 0B's job); no admin panel or action regressions.
- Phase 0B (backend): count statements per full load 288 pairs → 1 pair; total statements per full load ~1,152 → ~578; old-client requests still receive exact counts.
- Phase 1: statements per admin interaction → 1–2; full-dataset loads eliminated; search across all 28,752 leads under ~1 s.
- Phases 2–3: `/song/<id>` p95 under 2 s; worst-case customer wait bounded ~18 s with a retry affordance; no infinite spinner, no false "not found", no entitlement served from stale cache.
- Database: connections stay well clear of 60 during admin sessions; memory does not climb with admin usage.

## What could break, and the prevention

- **Phase 0A:** losing automatic refresh means an admin could act on stale data → explicit Refresh button, visible last-updated timestamp, and progress state. Partial loads could hide records → explicit warning naming loaded vs total counts, never a silent truncation.
- **Phase 0B:** a deployed function change hitting the still-published old frontend → the `withCounts` default reproduces current behavior exactly, so old clients are unaffected; deploy at low traffic and watch function logs.
- **Phase 1:** panels reading the full arrays showing partial data → the inventory step gates the whole phase; each panel migrates to a server-side aggregate and is diffed against Phase 0 output before the loader is retired.
- Search feeling weaker → server-side search covers all rows, which is strictly better than today's search over loaded rows.
- Shorter client timeout abandoning a recoverable load → one automatic retry plus explicit Try again; copy never implies the song is missing.
- Stale/shared cache leaking entitlements → entitlement fields never cached, `no-store` retained, `fresh=1` bypasses both caches, coalescing keyed per order id.
- **Business flows:** no phase touches Stripe, PayPal, webhooks, tips, unlock verification (lyrics/download/package/bonus), revisions, cover art, delivery scheduling, or pixels/tracking. Phase 0A changes admin refresh mechanics in one frontend file; Phase 0B adds one optional backend parameter; Phase 1 is admin read paths; Phases 2–3 are one read function and one page; Phase 4A is observation only; Phase 5 is one attribute. Every existing admin action keeps its current request shape and is re-tested before each release.

## Next steps in plain English

Right now, every 30 seconds — and again whenever you click back into the admin window — the dashboard tries to download every order and every lead at once, firing roughly 288 simultaneous requests that become over a thousand database queries. Two of those overlapping is a very plausible reason the database has been flattening and customer song pages have taken minutes.

**Phase 0** is the emergency patch and deliberately small: the automatic 30-second and click-back reloads are removed, the dashboard still loads everything you're used to seeing, but only when you log in or press Refresh, and it fetches at most two pages at a time instead of 288 at once. The record-count queries run once per load instead of once per page. You get a progress line and a "last updated" time, and if something fails mid-load you keep what loaded and see a clear warning instead of a silently short list. Two files change; one revert undoes it.

**Phase 1** comes after, once we've listed every panel that currently relies on having all records in the browser. That's the permanent fix — the server does the paging, filtering and searching, so nothing needs to load 28,752 leads into your browser at all. It's kept separate on purpose: rushing it risks analytics, remarketing, and support panels quietly showing partial numbers.

Then the song-page timeout and caching fixes, the monitoring work (native Supabase reports and logs first, before any future restart erases the evidence), and finally the small audio-preload change.

## Requires Ryan's approval

- Any code edit, deploy, or migration — nothing in this plan has been applied.
- **Phase 0** (emergency admin refresh guard) — recommended first and on its own.
- **Phase 1** (server-side pagination/filter/search redesign) — separately, and only after the consumer inventory is reviewed.
- Phases 2, 3, 4B, and 5 individually.
- Any change to the background page size (100 → 250), which requires the payload/limit measurement first.
- Enabling a Log Drain, after seeing its cost.
- Creating the diagnostics table/endpoint (Phase 4B needs a migration).
- Any further compute or disk resize. Current evidence does not support one: memory 61%, disk 15%, pool clients 1/200. Remove the storm, then re-measure.
- Any backend restart — restarts erase `pg_stat_statements`, the main evidence trail; snapshot first.