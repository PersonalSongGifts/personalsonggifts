# Admin > Leads: 20-minute "Loading leads..." — diagnosis and fix plan

## What is actually happening

The Leads tab does not search the database. It downloads **every lead**, then filters in the browser. There are now **29,139 leads** (3,721 orders), fetched **100 at a time = 292 requests** per load.

Two verified defects combine to produce exactly the screenshot you sent (search text `renedarwent`, "0 leads", "Loading leads..."):

1. **The spinner covers the whole 292-request download.** `setLoading(true)` is set before page 0 and only cleared in `finally`, which runs after all 292 pages resolve. So the table shows "Loading leads..." for the entire load.
2. **Results are committed only once, at the very end.** Pages accumulate into a local array and there is a single `setLeads([...accLeads])` after the last page. Rene's lead is row **371** (page 4 of 292) and is fetched in the first few seconds — but it stays invisible until page 292 lands. Meanwhile the visible list contains only the 100 newest leads, so searching `renedarwent` correctly matches nothing → "0 leads".

And the load never settles:

3. A **30-second interval** plus a **window-focus listener** both call `fetchOrders()`. Each call resets `loading` to true and resets the list to page 0 again. If a full load takes longer than the gap between triggers (switching tabs/windows fires focus), the admin is pushed back to "Loading leads..." repeatedly — this is the "falls back to the loading screen" behaviour.

Measured, read-only, against production:

| Measurement | Result |
| --- | --- |
| Leads / orders | 29,139 / 3,721 |
| Pages per full load | 292 (pageSize 100, concurrency 5) |
| One page round-trip | 0.45 s – 1.6 s (measured pages 0, 150, 291) |
| Best-case full load from a datacenter | ~1.5–2.5 min |
| Rene's position | row 371 → page 4, arrives in wave 1 but is not displayed until the end |
| Full lead payload | ~22 MB of text across the 292 responses |

20 minutes is this same fan-out over a real browser connection (292 requests, 22 MB, plus restarts from the 30 s timer and focus refetches).

**Indexes are not the problem.** A single server-side search for `renedarwent` across email/customer name/recipient name runs in **127 ms** (sequential scan, 1 row) and the paginated list query runs in **50 ms** using the existing `idx_leads_captured_at_desc`. No new index is demonstrated as necessary. The cost is entirely the 292-request client-side fan-out.

Also confirmed: opening a lead does **not** change filters, tab, route, or remount the table. It sets local dialog state and fetches that one lead's full record. One related inefficiency: the auto-open effect depends on the whole `leads` array, so it refires that detail fetch on every 30 s refresh while a lead id is pending.

## The fix

Make search a database query, show results as they arrive, and never spin forever.

1. **Server-side lead search.** Add a `search` parameter to the `list` action in the leads function (the CS lookup action in the same file already does exactly this with `ilike`, so the pattern exists). Return the first 100 matches ordered newest-first. Typing in the Leads search box then hits the database (~130 ms) instead of waiting for 29,139 rows.
2. **Progressive display.** Commit each page into state as it arrives instead of one batch at the end, so the list fills in from the first second.
3. **Honest loading state.** "Loading leads..." shows only while the first page is in flight. After that the table is usable and a small "1,200 of 29,139 loaded" indicator covers the background fill (the Orders tab already does this).
4. **Fail visibly with Retry.** Add a request timeout (abort after ~20 s per page) and an error state with a **Retry** button and the reason. Never an indefinite spinner.
5. **Stop the restart churn.** Skip the 30 s refresh and the focus refetch while a full load is still running or while a search is active, and drop the pending-lead effect's dependency on the whole array.
6. **Cap the fan-out.** Background pages become opt-in ("Load all leads" / needed for CSV export and analytics) rather than automatic on every login, refresh, focus and 30 s tick.

## Files to change

- `src/pages/Admin.tsx` — `listOrders` (add `search`, timeout/abort), `handleLogin` and `fetchOrders` (progressive commits, first-page-only loading, error + retry state, guard the 30 s interval and focus listener).
- `src/components/admin/LeadsTable.tsx` — debounced search that calls the server, loading/error/retry rendering, count/"loaded" indicator, fix the auto-open effect dependency.
- `supabase/functions/admin-orders/index.ts` — `list` action accepts `search` and applies it to the leads query (and optionally orders), keeping the existing lean column list.

No database migration. No schema or data change.

## Tests

- Unit: the search predicate builder (term normalisation, the `/preview/<token>` URL form, empty term, special characters escaped for `ilike`).
- Unit: the page-accumulation reducer (out-of-order pages, duplicate pages, a failed page).
- Integration (Playwright against the running app, admin session): search exact email → 1 result under 2 s; forced failure → Retry button appears and recovers on click.

## Rollout and rollback

Backend first (the added parameter is optional, so the current frontend keeps working unchanged), then frontend. Rollback is reverting the two frontend files; the backend change is additive and safe to leave in place.

## What could break

- **CSV export and anything counting leads** currently assume every lead is in memory. Export must either use the loaded set explicitly or fetch on demand — otherwise an export silently covers only what is loaded.
- **Stats and analytics cards** are fed from the same arrays; if background loading becomes opt-in, their totals must come from server counts rather than array length, or numbers will read low.
- **Search behaviour changes subtly.** Client-side search currently also matches free-text story fields. The server version must cover the same fields, or an admin who searched by a phrase from a memory will stop finding it.
- **Debounce timing** that is too aggressive makes search feel laggy; too loose and rapid typing fires many queries. ~300 ms with in-flight cancellation.
- **Case and accent handling** must match today's lowercase substring behaviour (`ilike` covers case; accents are matched literally either way).

## Verification matrix (after the fix)

| Case | Expected |
| --- | --- |
| Exact email `renedarwent@gmail.com` | 1 result in under 2 s |
| Partial `renedarwent` / `Rene` / `Darwent` | Same lead found, no full download |
| Preview link pasted (`/preview/L3pZGpC2JdJyTGAe`) | Matches by token |
| Zero results (`zzzznotreal`) | "No leads found" — never a spinner |
| Rapid typing, then clearing | One query settles; no stale results; no stuck state |
| Changing status / quality / dismissed filters mid-search | Filters apply to results; no reset to loading |
| Open a lead, close, back | Search text, filters and page position preserved; no refetch storm |
| Slow network (throttled) | List appears progressively; loading text only for the first page |
| Failed / aborted request | Visible error with reason and a working **Retry**; no infinite spinner |
| 30 s auto-refresh during a search | Does not clear results or reflash loading |
| Desktop and mobile widths | Search, results, retry all usable |
| PII | Search terms never logged with customer data; response columns unchanged from today; no full-song URL exposure change |
