

## Fix CS Lookup and Order Refresh Failures

### Problem

Two related issues reported by CS team:

1. **CS Lookup not finding emails** -- Searching by email returns no results for emails that should exist in leads/orders
2. **Order/Lead refresh failing** -- Fetch errors when refreshing the admin dashboard

### Root Cause

The edge function is likely timing out due to:

1. **CS Lookup uses `select("*")`** -- Fetches ALL columns including heavy blobs (`automation_raw_callback` which stores full Suno callback JSON, `automation_lyrics`, `lyrics_raw_attempt_1/2`, etc.). As the database grows (1200+ leads, 754+ orders), this becomes too slow.

2. **List action runs 4 sequential database queries** -- orders, leads, order count, lead count -- all in a single edge function invocation. With 500-row pages, this can exceed the edge function timeout.

### Solution

#### 1. Optimize CS Lookup query (`supabase/functions/admin-orders/index.ts`)

Replace `select("*")` in all cs_lookup queries with a lean column set (same columns used by the list action). This dramatically reduces response size and query time.

For orders in cs_lookup (~lines 201-206, 210-216, 220-225, 244-251):
- Replace `.select("*")` with `.select(orderColumns)` using the same lean column string already defined in the list action

For leads in cs_lookup (~lines 192-198, 234-241, 253-260):
- Replace `.select("*")` with `.select(leadColumns)` using the same lean column string already defined in the list action

#### 2. Reduce initial page size to 250 (`src/pages/Admin.tsx`)

Drop from 500 to 250 for the initial fetch to stay well within timeout limits. The background loading will fetch remaining pages.

Update in three places:
- `listOrders` default parameter (~line 332): `pageSize = 250`
- `handleLogin` call (~line 374): `listOrders("all", 0, 250)`
- `fetchOrders` call (~line 470): `listOrders("all", 0, 250)`
- Both `bgPageSize` values (~lines 402, 482): change from 500 to 250

### Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/admin-orders/index.ts` | Replace `select("*")` with lean column selection in cs_lookup action |
| `src/pages/Admin.tsx` | Reduce page sizes from 500 to 250 to prevent timeouts |

### Expected Impact

- CS lookup will return results quickly by not fetching heavy blob columns
- Dashboard refresh will succeed by staying within edge function timeout limits
- Background loading handles the full dataset in smaller, reliable chunks
