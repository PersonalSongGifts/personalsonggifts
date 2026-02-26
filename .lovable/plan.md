

# Minimum Changes to Speed Up Admin Loading

Three safe, non-breaking changes that will cut load time significantly without adding new features or changing any UI.

---

## What's Slow Today

- **31+ round trips**: 200 rows per page across ~6,200 orders means ~31 sequential requests
- **3+ seconds of artificial delay**: 100ms `setTimeout` between each page request
- **No database indexes**: every search and sort does a full table scan

---

## The 3 Changes

### 1. Database Indexes (migration)

Add 6 indexes so the database stops doing full table scans:

- `orders(customer_email)` -- speeds up email lookups
- `orders(automation_status)` -- speeds up status filtering
- `orders(created_at DESC)` -- speeds up the default sort order
- `leads(email)` -- same for leads
- `leads(automation_status)` -- same
- `leads(captured_at DESC)` -- same

These are `CREATE INDEX IF NOT EXISTS` -- completely safe, no table locks on small tables, no data changes.

### 2. Increase Page Size: 200 to 1000 (Admin.tsx)

The backend already supports any `pageSize` value. Changing the frontend from 200 to 1000 cuts the number of requests from ~31 to ~7. The backend already paginates with `.range()` so this just changes the chunk size.

### 3. Remove Artificial Delays (Admin.tsx)

Two `setTimeout` calls add dead time between page fetches:
- 100ms delay between each page (adds ~3s total)
- 500ms delay on retry (keeping this one -- it's only for error recovery)

Removing the 100ms inter-page delay lets requests fire back-to-back.

---

## What This Does NOT Change

- No new backend actions (no `search`, no `get_stats`)
- No new UI components or buttons
- No new database columns
- No changes to edge functions
- No architectural refactoring
- Search still works the same way (client-side filtering)

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Requests to load all data | ~31 | ~7 |
| Artificial delay | ~3s | 0s |
| Query speed (sorted/filtered) | Full scan | Indexed |
| Total perceived load time | ~15-20s | ~5-8s |

---

## Files Changed

| File | Change |
|------|--------|
| New DB migration | 6 indexes (orders + leads) |
| `src/pages/Admin.tsx` | `pageSize` 200 -> 1000, remove 100ms `setTimeout` delays |

