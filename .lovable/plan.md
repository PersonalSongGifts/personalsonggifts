
## Fix: Admin Login Failing Due to Memory Limit

### Root Cause

The `admin-orders` edge function is crashing with **"Memory limit exceeded"** every time you log in. The login flow calls `action: "list"` which fetches **all 1,010 orders + 3,928 leads** in a single response. This ~5,000 record payload exceeds the edge function's memory cap, causing the function to return a non-2xx error.

### Solution: Add Pagination to the Admin List Endpoint

Instead of returning everything at once, implement server-side pagination with a reasonable page size (e.g., 200 records per page). The frontend will fetch pages as needed.

### Changes

**1. Edge Function: `supabase/functions/admin-orders/index.ts`**

- Add `page` and `pageSize` parameters to the `action: "list"` handler
- Default to page 0, pageSize 200
- Return `totalOrders` and `totalLeads` counts alongside the paginated data so the frontend knows how many pages exist
- Remove the manual pagination loop that concatenates all pages into memory (the current approach defeats the purpose of pagination by loading everything anyway)
- For the initial login call, only fetch the first page of data

**2. Frontend: `src/pages/Admin.tsx`**

- Update `listOrders` to accept page/pageSize parameters
- On login, fetch only page 0 (first 200 orders + first 200 leads) to verify credentials and load the initial view
- Add a "Load More" or auto-pagination mechanism to fetch additional pages as the user scrolls or switches tabs
- Store total counts to show accurate stats without loading all records

### Why This Fixes the Login

The login currently triggers a full data load. By fetching only 200 orders + 200 leads initially (instead of 5,000 total records), memory usage drops by ~95%, well within the edge function limit.

### Technical Details

```text
Current flow:
  Login -> Fetch ALL 1,010 orders + 3,928 leads -> Memory exceeded -> Crash

Fixed flow:
  Login -> Fetch 200 orders + 200 leads (page 0) -> Success (~400 records)
  User scrolls -> Fetch page 1, page 2... -> Incremental loading
```

Edge function changes:
- Accept `page` (default 0) and `pageSize` (default 200) in the list action body
- Use `.range(page * pageSize, (page + 1) * pageSize - 1)` for both orders and leads
- Add separate count queries using `.select('id', { count: 'exact', head: true })` to return totals without loading data
- Return `{ orders, leads, totalOrders, totalLeads, page, pageSize }`

Frontend changes:
- `listOrders` sends `page` and `pageSize` in the request body
- Initial login fetches page 0 only
- Admin dashboard stores `allOrders` and `allLeads` arrays, appending pages as loaded
- Add a useEffect or button to load remaining pages after login succeeds
- Stats cards use the `totalOrders`/`totalLeads` counts from the API response
